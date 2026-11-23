<script lang="ts">
  import { editor } from '../core/editor.svelte';
  import { notificationUI } from '../notification-ui.svelte';
  import { loadFeature } from '../features';
  import { restoreFocus } from '../ui-focus';
  let {kind, owner}: {kind: 'feedback' | 'toast'; owner?: HTMLDialogElement} = $props();
  // Retain background feedback geometry while the dialog owns its accessible copy.
  const active = $derived(owner ? notificationUI.dialog === owner : kind === 'feedback' || !notificationUI.dialog);
  const needed = $derived(kind === 'feedback' ? Boolean(editor.recovery || editor.error || notificationUI.error || editor.saveFailed && editor.dirty) : Boolean(notificationUI.busy || editor.notice));
  const request = $derived(active && needed ? loadFeature('notifications') : undefined);
</script>
{#if active && needed}
  {#await request}<span class="sr-only" role="status">Opening notification…</span>
  {:then View}{#if View}<View {kind} {owner}/>{/if}
  {:catch}
    <div class="notification-fallback"><p role={editor.error || notificationUI.error ? 'alert' : 'status'}>{editor.error || notificationUI.error || notificationUI.busy || editor.notice || 'A recovery draft is available.'}</p>
      {#if editor.recovery}<button class="text-btn" disabled={notificationUI.recoveryBusy} onclick={notificationUI.recover}>Recover as copy</button><button class="text-btn" onclick={notificationUI.exportRecovery}>Export draft</button>{/if}
      {#if editor.saveFailed && editor.dirty}<button class="text-btn" disabled={editor.saving} onclick={async()=>{await editor.flush();if(document.activeElement===document.body)restoreFocus();}}>Retry save</button>{/if}
      {#if editor.saveFailed && editor.deck}<button class="text-btn" onclick={notificationUI.exportCopy}>Export a copy</button>{/if}
      {#if kind === 'toast' && !notificationUI.busy}<button class="text-btn" onclick={()=>{editor.notice='';queueMicrotask(()=>restoreFocus());}}>Dismiss notification</button>{/if}
      <button class="text-btn" onclick={()=>window.location.reload()}>Refresh app</button>
    </div>
  {/await}
{/if}
<style>
  .notification-fallback { position:relative;z-index:90;flex:none;max-height:35%;overflow:auto;padding:12px 16px;background:var(--surface-overlay);border:1px solid var(--border-default);font-size:var(--ui-text); ;scrollbar-gutter:stable;}
  .notification-fallback p { margin:0 0 8px;overflow-wrap:anywhere; }
</style>
