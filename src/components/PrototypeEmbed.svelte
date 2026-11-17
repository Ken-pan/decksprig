<script lang="ts">
  import '../prototype-embed.css';
  import { onMount, tick } from 'svelte';
  import { Play, RotateCcw, ExternalLink, Maximize2, X } from '@lucide/svelte';
  import type { Prototype } from '../core/model';
  import { prototypeEmbedUrl, isFigmaPrototype } from '../core/prototype';
  import { DialogHeader } from './ui';
  let {prototype, label = 'Interactive prototype', live = false, focusable = false, onfocus, clientId = '', onexit, oninteractionchange}: {prototype: Prototype; label?: string; live?: boolean; focusable?: boolean; onfocus?: () => void; clientId?: string; onexit?: () => void; oninteractionchange?: (active: boolean) => void} = $props();
  let active = $state(false), loading = $state(false), slow = $state(false), apiReady = $state(false), auth = $state(''), generation = $state(0), focused = $state(false);
  let iframe = $state<HTMLIFrameElement>();
  let focusDialog: HTMLDialogElement;
  let focusOrigin: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout>;
  let figma = $derived(isFigmaPrototype(prototype.url));
  let embedUrl = $derived(prototypeEmbedUrl(prototype, clientId));
  function start() { active = true; oninteractionchange?.(true); loading = true; slow = false; auth = ''; apiReady = false; clearTimeout(timer); timer = setTimeout(() => { slow = true; }, 12000); }
  function reload() { generation++; start(); }
  function loaded() { if (figma && clientId && !apiReady) return; loading = false; clearTimeout(timer); }
  function restore() {
    if (!focused || !focusDialog) return;
    focused = false;
    if (!focusDialog.open) focusDialog.show();
    void tick().then(() => { restoreFocus(focusOrigin,iframe); });
  }
  async function focusPrototype(origin?: HTMLElement) {
    if (focused) return;
    focusOrigin = origin ?? document.activeElement as HTMLElement | null;
    // Change the existing dialog's mode without moving or rebuilding its iframe.
    focusDialog.close(); focused = true; focusDialog.showModal();
    await tick(); focusDialog?.querySelector<HTMLButtonElement>('[aria-label="Close expanded prototype"]')?.focus();
  }
  function closeFocus() { focusDialog?.close(); restore(); }
  function activate() {
    if (onfocus && !live) { onfocus(); return; }
    start();
    if (focusable && matchMedia('(max-width:760px)').matches) void focusPrototype();
  }
  function endInteraction() {
    if (focused) closeFocus();
    if (onexit) { onexit(); return; }
    clearTimeout(timer); active = false; oninteractionchange?.(false); apiReady = false; loading = false; auth = ''; slow = false;
    void tick().then(() => focusDialog.querySelector<HTMLButtonElement>('.prototype-cover button')?.focus());
  }
  function message(event: MessageEvent) {
    if (!clientId || !figma || event.source !== iframe?.contentWindow || event.origin !== 'https://www.figma.com' || !event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'INITIAL_LOAD') { apiReady = true; loaded(); slow = false; }
    if (event.data.type === 'LOGIN_SCREEN_SHOWN' || event.data.type === 'PASSWORD_SCREEN_SHOWN') { apiReady = false; loading = false; clearTimeout(timer); auth = event.data.type === 'LOGIN_SCREEN_SHOWN' ? 'This prototype requires a Figma sign-in. Sign in using the original link.' : 'This prototype requires a password. Enter it in the prototype.'; }
    if (event.data.type === 'REQUEST_CLOSE') endInteraction();
  }
  function restart() { if (apiReady) iframe?.contentWindow?.postMessage({type: 'RESTART'}, 'https://www.figma.com'); else reload(); }
  onMount(() => { if (live && !focusable && !onfocus) start(); return () => { clearTimeout(timer); focused = false; if (focusDialog?.open) focusDialog.close(); queueMicrotask(() => oninteractionchange?.(false)); }; });
  import {restoreFocus} from '../ui-focus';
  import {modalFocus} from '../ui-modal-focus';
</script>
<svelte:window onmessage={message} />
<div class="prototype-host">
  <dialog use:modalFocus open bind:this={focusDialog} class="prototype-shell" class:active class:is-focused={focused} aria-label={label} role={focused ? 'dialog' : 'group'} aria-modal={focused ? 'true' : undefined} oncancel={e => { e.preventDefault(); closeFocus(); }} onclose={() => { if (focusDialog && !focusDialog.open) restore(); }} data-prototype-state={active ? apiReady ? 'ready' : loading ? 'loading' : 'document-loaded' : 'poster'}>
      <DialogHeader title={label} class="prototype-focus-header" hidden={!focused} closeLabel="Close expanded prototype" onclose={closeFocus} />
      <div class="prototype-body">
      {#if active}
        {#key generation}<iframe bind:this={iframe} src={embedUrl} title={label} loading="eager" referrerpolicy="strict-origin-when-cross-origin" allow="fullscreen" allowfullscreen sandbox={figma || new URL(prototype.url).origin !== window.location.origin ? 'allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock' : 'allow-scripts allow-forms allow-popups'} onload={loaded} onerror={() => { loading = false; slow = true; }}></iframe>{/key}
        <div class="prototype-controls"><span>{label}</span><div class="grow"></div>
          <button onclick={restart} title={apiReady ? 'Restart prototype' : 'Reload prototype'} aria-label={apiReady ? 'Restart prototype' : 'Reload prototype'}><RotateCcw size={16} /></button>
          {#if focusable}<button hidden={focused} onclick={e => focusPrototype(e.currentTarget)} title="Expand prototype · Keep current interaction" aria-label="Expand prototype"><Maximize2 size={16} /></button>{/if}
          <a href={prototype.url} target="_blank" rel="noopener noreferrer" title="Open original link" aria-label="Open original link"><ExternalLink size={16} /></a>
          {#if onexit || focusable}<button onclick={endInteraction} title="Stop prototype interaction" aria-label="Stop prototype interaction"><X size={16} /></button>{/if}
        </div>
        {#if loading && !slow}<div class="prototype-loading" role="status"><span class="spinner"></span>Loading prototype…</div>{/if}
        {#if slow || auth}<div class="prototype-message" role="status"><span>{auth || (figma && clientId ? 'Figma has not reported that the prototype is ready. Check viewing access and allowed embed domains, or open the original link.' : 'Still waiting for the prototype. If the preview is blank, the site may block embedding. Open the original link to continue.')}</span><button onclick={reload}>Retry</button><a href={prototype.url} target="_blank" rel="noopener noreferrer">Open original link</a></div>{/if}
      {:else}
        {#if prototype.poster}<img class="prototype-poster" src={prototype.poster} alt={label} draggable="false" />{/if}
        <div class="prototype-cover"><div class="prototype-symbol"><Play size={28} /></div><strong>{label}</strong><span>{figma ? 'Figma prototype' : new URL(prototype.url).hostname}</span>
          {#if live || onfocus}<button class="text-btn primary" onclick={(ev) => { ev.stopPropagation(); activate(); }} onpointerdown={(ev) => ev.stopPropagation()}><Play size={16} />{live ? 'Interact' : 'Interactive preview'}</button>{/if}
        </div>
      {/if}
    </div>
    <p class="hint prototype-dialog-hint" hidden={!focused}>Close this preview to return to the slide. The current interaction is preserved.</p>
  </dialog>
</div>
