<script lang="ts">
  import {rememberPanelScroll} from '../panel-scroll.svelte';
  import {slideLabel} from '../core/slide-label';
  import { editor } from '../core/editor.svelte';
  import type {TextRole} from '../core/design-system-schema';
  import type { SlideElement } from '../core/model';
  import AsyncFeature from './AsyncFeature.svelte';
  import LayerBrowser from './LayerBrowser.svelte';
  import SlideStyles from './SlideStyles.svelte';
  import PageLayoutControls from './PageLayoutControls.svelte';
  import { deckDesignSystem } from '../core/deck-design-system';
  import { Button } from './ui';
  import { BookOpen, PanelTop, LayoutTemplate, Palette, ChevronRight, ChevronDown, Layers } from '@lucide/svelte';
  let {active=true,view=$bindable<'properties'|'layers'>('properties'),onfonts,onresources,onprototype,ondraw,onreference,onlayout,ondeckstyles,onpageelements,onviewchange,layoutDisabled=false}: {active?:boolean;view?: 'properties'|'layers';onfonts:()=>void;ondraw?:()=>void;onresources?:(replaceId?:string)=>void;onprototype?:(element:SlideElement)=>void;onreference?:()=>void;onlayout?:()=>void;onpageelements?:()=>void;ondeckstyles?:(role?:TextRole)=>void;onviewchange?:(value:'properties'|'layers')=>void;layoutDisabled?:boolean}=$props();
  let properties=$state<HTMLDivElement>();
  rememberPanelScroll(()=>active,()=>`${editor.deck?.id}:${editor.activeId}:${editor.selected.join(',')}`,()=>[properties]);
  let e=$derived(editor.selection.find(e=>!e.locked)??editor.selection[0]);
  let currentStyle=$derived(editor.deck ? deckDesignSystem(editor.deck) : undefined);
  function changeView(value:string){view=value as typeof view;onviewchange?.(view);}
</script>
<div class="inspector-content">
  <div bind:this={properties} class="inspector-properties">
  {#if editor.sourceMode && editor.slide?.source?.render}
    <div class="panel-section reference-summary"><BookOpen size={20} /><h3>Source reference</h3><p class="hint">{editor.slide.source.provider} · {slideLabel(editor.deck?.slides.findIndex(s=>s.id===editor.slide?.id)??0)}</p><p class="hint">Switch to Editable version to make changes.</p><Button variant="secondary" onclick={onreference}>View import report</Button></div>
  {:else if e}
    {#if e.pageElement}<div class="page-element-entry"><Button variant="secondary" disabled={layoutDisabled} onclick={onpageelements}><PanelTop size={16} />Slide details</Button></div>{/if}
    <AsyncFeature feature="object-inspector" props={{active,onfonts,onresources,onprototype,ondraw,onstyles:ondeckstyles}} />
  {:else if editor.slide}
    <div class="panel-section slide-properties"><div class="section-label"><h3><PanelTop size={16} aria-hidden="true" />Slide</h3><span>{editor.deck?.width} × {editor.deck?.height}</span></div><SlideStyles/><Button variant="secondary" disabled={layoutDisabled} onclick={onpageelements}><PanelTop size={16} />Slide details</Button></div><div class="panel-section slide-layout-section"><h3><LayoutTemplate size={16} aria-hidden="true"/>Layout</h3><PageLayoutControls disabled={layoutDisabled} /><Button variant="secondary" disabled={layoutDisabled} onclick={onlayout}><LayoutTemplate size={16} />Layout suggestions</Button></div>
    {#if currentStyle}
      <div class="panel-section document-style-section">
        <div class="section-label"><h3><Palette size={16} aria-hidden="true" />Style</h3><span>All slides</span></div>
        <Button variant="secondary" class="current-style" aria-label={`Document styles · ${currentStyle.name}`} title="Change document styles" disabled={layoutDisabled} onclick={()=>ondeckstyles?.()}>
          <span class="current-style-name">{currentStyle.name}</span>
          <span class="current-style-colors" aria-hidden="true">{#each [currentStyle.colors.background,currentStyle.colors.ink,currentStyle.colors.accent] as color}<span style:background={color}></span>{/each}</span>
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
      </div>
    {/if}
  {/if}

  </div>
  {#if !editor.sourceMode}
    <section class="inspector-layers" class:expanded={view==='layers'} aria-label="Layers">
      <button class="layers-disclosure" aria-expanded={view==='layers'} aria-controls="inspector-slide-layers" onclick={()=>changeView(view==='layers'?'properties':'layers')}>
        <Layers size={16} aria-hidden="true" /><span>Layers</span><small>{editor.slide?.elements.filter(e=>!e.designPattern).length||0}</small><ChevronDown size={14} aria-hidden="true" />
      </button>
      <div id="inspector-slide-layers" class="inspector-layer-content" hidden={view!=='layers'} inert={view!=='layers'}>
        {#if view==='layers'}<LayerBrowser {active} disabled={layoutDisabled}/>{/if}
      </div>
    </section>
  {/if}
</div>
<style>
  .inspector-content{container-type:inline-size}.page-element-entry{padding:12px}.page-element-entry :global(button){width:100%;justify-content:flex-start}
  .inspector-properties{overscroll-behavior:contain;scroll-padding:12px}
  .inspector-properties:has(:global(.object-summary)){scroll-padding-top:calc(3rem + 24px)}
  .slide-properties,.reference-summary,.document-style-section{padding:12px;gap:8px}
  .slide-properties h3,.document-style-section h3{display:flex;align-items:center;gap:8px;font-size:var(--ui-label)}
  .slide-properties h3 :global(svg),.document-style-section h3 :global(svg){flex:none;color:var(--text-secondary)}
  .document-style-section :global(.current-style){width:100%;height:auto;min-height:44px;justify-content:flex-start;gap:8px;padding:8px 12px;white-space:normal;text-align:left}
  .current-style-name{flex:1;min-width:0;overflow-wrap:anywhere}
  .current-style-colors{display:flex;gap:4px;flex:none}
  .current-style-colors span{width:16px;height:16px;border:1px solid var(--border-default);border-radius:var(--radius-sm)}
  .document-style-section :global(.current-style > svg){flex:none;color:var(--text-secondary)}
  .slide-layout-section h3{display:flex;align-items:center;gap:8px;margin:0}.slide-layout-section h3 :global(svg){flex:none;color:var(--text-secondary)}
  .slide-layout-section > :global(button){width:100%;justify-content:flex-start}
  .slide-layout-section{padding:12px;gap:8px}
  .inspector-layers{display:flex;flex-direction:column;flex:none;min-height:0;border-top:1px solid var(--border-subtle)}
  .inspector-layers.expanded{height:45%;min-height:140px;max-height:60%}
  .layers-disclosure{display:flex;align-items:center;gap:8px;width:100%;min-height:44px;padding:12px;text-align:left;font-size:var(--ui-label);flex:none}
  .layers-disclosure>span{flex:1;font-weight:var(--ui-weight-medium)}
  .layers-disclosure>small{font-size:var(--ui-meta);font-variant-numeric:tabular-nums;color:var(--text-secondary)}
  .layers-disclosure :global(svg){flex:none;color:var(--text-secondary)}
  .expanded .layers-disclosure>:global(svg:last-child){rotate:180deg}
  .layers-disclosure:focus-visible{outline-offset:-2px}
  .inspector-layer-content{display:flex;flex:1;min-height:0;overflow:hidden;container:layer-area / size}
  .inspector-layer-content[hidden]{display:none}
  @media(max-height:520px){.inspector-properties:has(:global(.object-summary)){scroll-padding-top:12px}}
  @media(max-width:760px),(pointer:coarse){
    .inspector-layers.expanded{height:55%;min-height:0;max-height:65%}
    .inspector-properties :global(select),.inspector-properties :global(.font-trigger){min-height:var(--property-control-height)}
    .inspector-properties :global(.ui-button){min-height:44px}
  }
</style>
