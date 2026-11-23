<script lang="ts">
  import {fontFamilyKey,sameFontFamily} from '../core/font-stack';
  import { untrack,tick } from 'svelte';
  import {chartPointTarget} from '../ui-chart-hit';
  import {restoreFocus} from '../ui-focus';
  import type {ChartTextTarget} from '../core/chart-text';
  import {Button} from './ui';
  import type { SlideElement } from '../core/model';
  import {loadLibraryTypography} from '../core/font-loading';
  let {element,background='#ffffff',fonts,onlineFonts,editable=false,activePoint,onpoint,ontext}:{element:SlideElement;background?:string;fonts?:import('../core/model').Deck['fonts'];onlineFonts?:import('../core/model').Deck['onlineFonts'];editable?:boolean;activePoint?:{series:number;category:number};onpoint?:(series:number,category:number)=>void;ontext?:(target:ChartTextTarget)=>void}=$props();
  let root=$state<HTMLDivElement>(),focusedPoint=$state<{series:number;category:number}|null>(null),hoverPoint=$state<{series:number;category:number}|null>(null);
  let attempt = $state(0),lastChart=$state<{svg:string;description:string}>(),failed=$state(false);
  const signature = $derived(JSON.stringify([background,element.chart, element.values, element.w, element.h, element.fontSize, element.fontFamily, element.fill, element.stroke, element.name,editable,onlineFonts?.find(font=>sameFontFamily(font.family,element.fontFamily))?.category]));
  const request = $derived.by(() => {
    signature;
    attempt;
    const snapshot = untrack(() => element), imported = untrack(() => fonts),online=untrack(()=>onlineFonts);
    const interactive=untrack(()=>editable),backdrop=untrack(()=>background);
    return Promise.all([import('../core/chart-render'), loadLibraryTypography([{elements:[snapshot]}],imported,online).catch(()=>{})]).then(([render]) => ({svg: render.renderChartSvg(snapshot,interactive,online?.find(font=>font.family===snapshot.fontFamily)?.category,backdrop), description: render.chartAlt(snapshot)}));
  });
  $effect(()=>{let active=true;failed=false;void request.then(async result=>{
    if(!active)return;
    const focused=root?.contains(document.activeElement)?document.activeElement:null;
    const point=focused?.hasAttribute('data-chart-point')?indices(focused):null;
    const text=focused?.hasAttribute('data-chart-text')?{kind:focused.getAttribute('data-chart-text')!,index:focused.getAttribute('data-chart-text-index')}:null;
    lastChart=result;
    if(!point&&!text)return;
    await tick();
    if(!active||document.activeElement!==document.body&&document.activeElement!==focused)return;
    const target=point?root?.querySelector<HTMLElement>(`[data-chart-point][data-chart-series="${point.series}"][data-chart-category="${point.category}"]`):root?.querySelector<HTMLElement>(`[data-chart-text="${CSS.escape(text!.kind)}"]${text!.index===null?'':`[data-chart-text-index="${CSS.escape(text!.index!)}"]`}`);
    restoreFocus(target,root?.closest<HTMLElement>('[data-element-id]'));
  }).catch(()=>{if(active)failed=true;});return()=>active=false;});
  function indices(node:Element){return {series:Number(node.getAttribute('data-chart-series')),category:Number(node.getAttribute('data-chart-category'))};}
  function target(event:Event){return editable?chartPointTarget(root,event):null;}
  function textTarget(event:Event){
    if(!editable||!(event.target instanceof Element)||event.target.closest('button,[data-chart-point]'))return null;
    const direct=event.target.closest<HTMLElement>('[data-chart-text]');if(direct||!(event instanceof MouseEvent)||!matchMedia('(pointer:coarse)').matches)return direct;
    let closest:HTMLElement|null=null,distance=22;
    for(const n of root?.querySelectorAll<HTMLElement>('[data-chart-text]')??[]){const r=n.getBoundingClientRect(),d=Math.hypot(Math.max(r.left-event.clientX,0,event.clientX-r.right),Math.max(r.top-event.clientY,0,event.clientY-r.bottom));if(d<distance){closest=n;distance=d;}}
    return closest;
  }
  function textLocation(node:Element):ChartTextTarget{return {kind:node.getAttribute('data-chart-text') as ChartTextTarget['kind'],...(node.getAttribute('data-chart-text-index')?{index:Number(node.getAttribute('data-chart-text-index'))}:{})};}
  function targets(){return Array.from(root?.querySelectorAll<HTMLElement>('[data-chart-point]')??[]);}
  function same(a:{series:number;category:number}|null|undefined,b:{series:number;category:number}){return a?.series===b.series&&a.category===b.category;}
  function updateTargets(){
    const nodes=targets(),wanted=activePoint??focusedPoint,current=nodes.some(n=>same(wanted,indices(n)))?wanted:(nodes[0]?indices(nodes[0]):null);let claimed=false;
    for(const node of nodes){const selected=same(current,indices(node));node.setAttribute('tabindex',editable&&selected&&!claimed?'0':'-1');if(selected)claimed=true;}
    for(const node of root?.querySelectorAll('[data-chart-mark]')??[]){const p=indices(node);node.toggleAttribute('data-chart-active',editable&&same(activePoint,p));node.toggleAttribute('data-chart-hover',editable&&same(hoverPoint??focusedPoint,p));}
  }
  $effect(()=>{root;lastChart;editable;activePoint;focusedPoint;hoverPoint;void tick().then(updateTargets);});
  $effect(()=>{lastChart;if(editable)void tick().then(()=>window.dispatchEvent(new Event('deck-studio-chart-rendered')));});
  function down(event:PointerEvent){const node=target(event)??textTarget(event);if(node){event.preventDefault();event.stopPropagation();node.focus({preventScroll:true});}}
  function choose(event:MouseEvent){
    const text=textTarget(event);if(text){event.preventDefault();event.stopPropagation();ontext?.(textLocation(text));return;}
    let node=target(event);
    if(node){event.preventDefault();event.stopPropagation();const p=indices(node);onpoint?.(p.series,p.category);}
  }
  function key(event:KeyboardEvent){
    const text=textTarget(event);if(text&&!event.isComposing&&['Enter',' ','F2'].includes(event.key)){event.preventDefault();event.stopPropagation();ontext?.(textLocation(text));return;}
    const node=target(event);if(!node||event.isComposing||event.altKey||event.ctrlKey||event.metaKey)return;
    if(['Enter',' ','F2'].includes(event.key)){event.preventDefault();event.stopPropagation();const p=indices(node);onpoint?.(p.series,p.category);return;}
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();const p=indices(node),nodes=targets();
    const series=Math.max(0,p.series+(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0)),category=event.key==='Home'?0:event.key==='End'?Math.max(...nodes.filter(n=>indices(n).series===p.series).map(n=>indices(n).category)):Math.max(0,p.category+(event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0));
    nodes.find(n=>same({series,category},indices(n)))?.focus({preventScroll:true});
  }
</script>
{#snippet visual(chart:{svg:string;description:string})}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div bind:this={root} class="chart-visual" class:point-editable={editable} role={editable?'group':'img'} aria-label={editable?`${element.name||'Chart'} · Drag points or click text to edit`:chart.description} data-chart-rendered="true" data-focus-scope={editable?element.id:undefined} onpointerdown={down} onclick={choose} ondblclick={event=>{if(textTarget(event)||target(event))event.stopPropagation();}} onkeydown={key} onfocusin={event=>{const node=target(event);if(node)focusedPoint=indices(node);}} onpointerover={event=>{const node=target(event);hoverPoint=node?indices(node):null;}} onpointerleave={()=>hoverPoint=null}>
    {@html editable?chart.svg.replace('<svg role="img"','<svg role="group" aria-label="Data points"'):chart.svg.replace('<svg role="img"','<svg aria-hidden="true"')}
    {#if editable&&!element.chart?.title}<div class="add-chart-title" role="group" onpointerdown={e=>{e.preventDefault();e.stopPropagation();}}><Button variant="quiet" onclick={e=>{e.stopPropagation();ontext?.({kind:'title'});}}>Add title</Button></div>{/if}
  </div>
{/snippet}
{#if failed}
  <div class="chart-state" role="status">Chart unavailable<button onclick={() => attempt++}>Retry</button></div>
{:else if lastChart}
  {@render visual(lastChart)}
{:else}
  <div class="chart-state" role="status">Rendering chart…</div>
{/if}
<style>
  .chart-visual{width:100%;height:100%;pointer-events:none;position:relative}.chart-visual :global(svg){width:100%;height:100%;display:block}
  .add-chart-title{position:absolute;top:0;left:0;pointer-events:auto;transform:scale(calc(1 / var(--canvas-scale,1)));transform-origin:top left}.add-chart-title :global(button){background:var(--surface-overlay);color:var(--text-secondary);min-height:36px;padding:6px 10px;border:1px solid var(--component-border);border-radius:var(--r-control);font-size:var(--ui-label)}
  .point-editable{pointer-events:auto}.point-editable :global(svg){pointer-events:none}
  .point-editable :global([ecmeta_ssr_type="legend"]){pointer-events:none!important}
  .point-editable :global([data-chart-text]){pointer-events:all!important;cursor:text;outline:none}
  .point-editable :global([data-chart-text-hit]){stroke:transparent;stroke-width:0;pointer-events:all!important}
  .point-editable :global([data-chart-text]:hover [data-chart-text-hit]),.point-editable :global([data-chart-text]:focus-visible [data-chart-text-hit]){stroke:var(--canvas-selection);stroke-width:calc(1px / var(--canvas-scale,1));stroke-dasharray:4 3;rx:2}
  .point-editable :global([data-chart-format]){pointer-events:all!important;cursor:pointer;outline:none}.point-editable :global([data-chart-format]:hover),.point-editable :global([data-chart-format]:focus-visible){outline:calc(1px / var(--canvas-scale,1)) dashed var(--canvas-selection)}
  .point-editable :global([data-chart-point]){pointer-events:visiblePainted!important;cursor:pointer}
  .point-editable :global([data-chart-line-hit]){fill:transparent;stroke:transparent;stroke-width:calc(16px / var(--canvas-scale,1));pointer-events:all!important}
  .point-editable :global([data-chart-marker]){pointer-events:none!important}
  .point-editable :global([data-chart-mark][data-chart-active]),.point-editable :global([data-chart-mark][data-chart-hover]){stroke:var(--canvas-selection);stroke-width:calc(2px / var(--canvas-scale,1));stroke-opacity:1;opacity:1}
  .point-editable :global([data-chart-marker][data-chart-active]),.point-editable :global([data-chart-marker][data-chart-hover]){fill:var(--canvas-selection);fill-opacity:1}
  @media(pointer:coarse){.add-chart-title :global(button){min-height:44px}.point-editable :global([data-chart-text]:hover [data-chart-text-hit]){stroke:transparent}.point-editable :global([data-chart-text]:focus-visible [data-chart-text-hit]){stroke-width:calc(1px / var(--canvas-scale,1));stroke:var(--canvas-selection)}.point-editable :global([data-chart-line-hit]){stroke-width:calc(44px / var(--canvas-scale,1))}}
  .chart-state{width:100%;height:100%;display:grid;place-content:center;gap:8px;font-size:18px;text-align:center;color:inherit}
</style>
