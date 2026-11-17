<script lang="ts" generics="T extends Feature">
  import { onDestroy, untrack, setContext } from 'svelte';
  import { loadFeature, type Feature, type FeatureProps } from '../features';
  import Dialog from './LazyDialog.svelte';
  import Button from './ui/Button.svelte';
  import EmptyState from './ui/EmptyState.svelte';
  import { CircleAlert } from '@lucide/svelte';
  import InsertToolsFrame from './InsertToolsFrame.svelte';
  let { feature, props = {} as FeatureProps[T], onclose, modalTitle, focusOrigin:providedFocusOrigin }: {feature: T; props?: FeatureProps[T]; onclose?: () => void; modalTitle?: string;focusOrigin?:HTMLElement|null} = $props();
  // Retain the real invoker across the loading dialog and the loaded feature.
  const focusOrigin = untrack(() => providedFocusOrigin ?? (modalTitle && typeof document !== 'undefined' ? document.activeElement as HTMLElement | null : null));
  setContext('deck-studio-feature-focus',()=>modalTitle&&feature!=='presentation'?focusOrigin:null);
  onDestroy(() => {
    if (!modalTitle) return;
    queueMicrotask(() => {
      if (document.querySelector('dialog:modal')) return;
      const current = document.activeElement;
      // Keep deliberate focus handed off by the completed action or child dialog.
      if (current instanceof HTMLElement && current !== document.body && current.isConnected && !current.closest('dialog,[inert],[hidden]') && current.getClientRects().length > 0) return;
      const available = focusOrigin?.isConnected && !focusOrigin.closest('[inert],[hidden]') && !focusOrigin.matches(':disabled') && focusOrigin.getClientRects().length > 0 && getComputedStyle(focusOrigin).visibility !== 'hidden';
      (available ? focusOrigin : document.querySelector<HTMLElement>('.canvas-stage'))?.focus({preventScroll: true});
    });
  });
  const featureName = $derived(modalTitle || (feature === 'welcome' ? 'workspace' : feature.replaceAll('-', ' ')));
  const toolbarFeature = $derived(['text-formatting', 'element-formatting', 'selection-actions'].includes(feature));
  const toolbarName = $derived(feature === 'text-formatting' ? 'Text controls' : feature === 'element-formatting' ? 'Object controls' : 'Object actions');
  const request = $derived(loadFeature(feature));
</script>

{#snippet status(state:'loading'|'error')}
  {#if feature==='canvas-zoom'}
    <Button variant="quiet" disabled={state==='loading'} aria-label={state==='loading'?'Loading zoom controls':'Refresh app to reload zoom controls'} onclick={()=>window.location.reload()}><span class="zoom-value">{state==='loading'?`${Math.round((props as FeatureProps['canvas-zoom']).scale*100)}%`:'Refresh app'}</span></Button>
  {:else if feature==='insert-tools'}
    <InsertToolsFrame failed={state==='error'} compact={Boolean((props as FeatureProps['insert-tools']).compact)}/>
  {:else if toolbarFeature}
    <div class="feature-status feature-compact">
      <span role={state==='error'?'alert':'status'}>{#if state==='loading'}<span class="spinner" aria-hidden="true"></span>Loading controls…{:else}{toolbarName} could not load{/if}</span>
      {#if state==='error'}<Button variant="secondary" size="sm" onclick={() => window.location.reload()}>Refresh app</Button>{/if}
    </div>
  {:else}
    <EmptyState density={feature==='notifications'?'inline':'compact'} busy={state==='loading'} icon={state==='error'?CircleAlert:undefined} tone={state==='error'?'error':'neutral'} role={state==='error'?'alert':'status'} title={state==='loading'?`Opening ${featureName}…`:'This view could not load'} description={state==='error'?'Refresh the app to reload this view.':''}>
      {#if state==='error'}<Button variant="secondary" onclick={()=>window.location.reload()}>Refresh app</Button>{#if onclose}<Button onclick={onclose}>Back to editor</Button>{/if}{/if}
    </EmptyState>
  {/if}
{/snippet}

{#await request}
  {#if modalTitle && onclose}<Dialog title={modalTitle} wide workspace={feature === 'layout' || feature === 'deck-styles'} {onclose}>{@render status('loading')}</Dialog>
  {:else if !feature.startsWith('figma-sync')||(props as FeatureProps['figma-sync']).open}{@render status('loading')}{/if}
{:then View}
  <View {...props} />
{:catch}
  {#if modalTitle && onclose}<Dialog title={modalTitle} wide workspace={feature === 'layout' || feature === 'deck-styles'} {onclose}>{@render status('error')}</Dialog>
  {:else}{@render status('error')}{/if}
{/await}

<style>
  .feature-status{padding:24px;color:var(--text-secondary);font-size:var(--ui-label);line-height:var(--ui-line-reading)}
  .feature-status>span{display:inline-flex;align-items:center;gap:8px}.feature-status>:global(button){margin:8px 8px 0 0}
  .feature-compact>:global(button){margin:0}.feature-compact{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:4px;max-width:100%;line-height:var(--ui-line-body)}

</style>
