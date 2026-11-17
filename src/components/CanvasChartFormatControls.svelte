<script lang="ts">
  import {portalToBody} from '../ui-portal';
  import {numericFieldValidity} from './ui/numeric-validity.svelte';
  const numericFields=numericFieldValidity();
  import NumberField from './ui/NumberField.svelte';
  import {onMount,tick} from 'svelte';
  import {chartPointTarget} from '../ui-chart-hit';
  import {Button} from './ui';
  import {editor} from '../core/editor.svelte';
  import {chartFromElement,type Chart} from '../core/charts';
  import {validateChart} from '../core/chart-schema';
  import {readableChartRange} from '../core/chart-range';
  import type {SlideElement} from '../core/model';
  import {positionFloating} from '../ui-viewport';
  import {popoverFocus} from '../ui-focus';
  import {focusAfterChartRedraw} from '../ui-chart-focus';
  import ColorField from './ui/ColorField.svelte';
  import PropertyChoice from './ui/PropertyChoice.svelte';
  import PropertyRow from './ui/PropertyRow.svelte';
  import {Ellipsis} from '@lucide/svelte';
  let {element,disabled=false,onpreview,onselection}:{element:SlideElement;disabled?:boolean;onpreview:(chart:Chart|null)=>void;onselection?:(active:boolean)=>void}=$props();
  type Section='axis'|'labels'|'legend';
  const errorId=$props.id();
  let objectMode=$state(false);
  let marker=$state<HTMLDivElement>(),tools=$state<HTMLDivElement>(),popup=$state<HTMLDivElement>(),section=$state<Section|null>(null),draft=$state<Chart>(),error=$state(''),origin=$state<HTMLElement|SVGElement>(),revision=0,deckId='',slideId='',root:HTMLElement|undefined;
  const chart=$derived(chartFromElement(element)),round=$derived(['pie','donut'].includes(chart.type));
  const stale=$derived(section&&(editor.deck?.id!==deckId||editor.slide?.id!==slideId||editor.deck?.revision!==revision||element.locked));
  const defaults=$derived(readableChartRange((draft??chart).series.flatMap(s=>s.values)));
  function portal(node:HTMLElement){document.body.append(node);return {destroy(){node.remove();}};}
  function position(){if(!root)return;const r=root.getBoundingClientRect();if(tools&&!disabled)positionFloating(tools,r,{preferredHeight:tools.scrollHeight,minHeight:44});if(popup?.matches(':popover-open'))positionFloating(popup,origin?.isConnected?origin.getBoundingClientRect():r,{preferredHeight:popup.scrollHeight,minHeight:180,avoid:r});}
  async function open(next:Section,target:HTMLElement|SVGElement){objectMode=false;onselection?.(true);section=next;origin=target;draft=structuredClone(chartFromElement(editor.slide?.elements.find(e=>e.id===element.id)??element));revision=editor.deck!.revision;deckId=editor.deck!.id;slideId=editor.slide!.id;error='';await tick();popup?.showPopover();position();popup?.querySelector<HTMLElement>('input,select,button')?.focus({preventScroll:true});}
  function update(patch:Partial<Chart>){if(!draft||stale)return;draft={...draft,...patch};try{validateChart(draft);error='';onpreview(draft);}catch(e){error=validationMessage(e);onpreview(null);}void tick().then(position);}
  const invalidRange=$derived(Boolean(draft?.axisRange?.min!==undefined&&draft.axisRange.max!==undefined&&draft.axisRange.max<=draft.axisRange.min));
  function automaticBound(key:'min'|'max',automatic:boolean){if(!draft)return;const range={...draft.axisRange};if(automatic)delete range[key];else range[key]=key==='min'?Math.min(defaults.min,(range.max??Infinity)-defaults.step):Math.max(defaults.max,(range.min??-Infinity)+defaults.step);update({axisRange:range.min===undefined&&range.max===undefined?undefined:range});}
  function validationMessage(e:unknown){return invalidRange?'Maximum must be greater than minimum.':(e as Error).message;}
  function save(){if(!draft||stale||error||!numericFields.valid)return false;try{const chart=validateChart(draft);if(JSON.stringify(chart)!==JSON.stringify(chartFromElement(editor.slide?.elements.find(e=>e.id===element.id)??element))){const before=editor.deck!.revision;editor.commit([{op:'update_element',slideId,elementId:element.id,patch:{chart,values:undefined}}],'','manual',revision);if(editor.deck!.revision===before){error=editor.error;return false;}revision=editor.deck!.revision;}return true;}catch(e){error=validationMessage(e);return false;}}
  function close(cancel=false,focus=true){if(!cancel&&!save())return false;section=null;onpreview(null);popup?.hidePopover();if(focus)queueMicrotask(()=>focusAfterChartRedraw(origin));return true;}
  function formatTarget(event:Event){return !chartPointTarget(root,event)&&event.target instanceof Element?event.target.closest<SVGElement>('[data-chart-format]'):null;}
  function down(event:PointerEvent){const node=formatTarget(event);if(!node||disabled)return;event.preventDefault();event.stopPropagation();node.focus({preventScroll:true});}
  function click(event:MouseEvent){const node=formatTarget(event);if(!node||disabled)return;event.preventDefault();event.stopPropagation();void open(node.dataset.chartFormat as Section,node);}
  function showObjects(){objectMode=true;onselection?.(false);void tick().then(()=>{(document.querySelector<HTMLElement>('.selection-context button')??root)?.focus({preventScroll:true});});}
  function key(event:KeyboardEvent){if(event.key==='Escape'&&!section){event.preventDefault();event.stopPropagation();showObjects();return;}const node=formatTarget(event);if(node&&!disabled&&!event.isComposing&&['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();void open(node.dataset.chartFormat as Section,node);}}
  $effect(()=>{disabled;if(disabled&&section)close(true,false);});
  onMount(()=>{root=marker?.parentElement??undefined;onselection?.(true);root?.addEventListener('pointerdown',down,true);root?.addEventListener('click',click,true);root?.addEventListener('keydown',key,true);const observer=new ResizeObserver(position);if(root)observer.observe(root);if(tools)observer.observe(tools);window.addEventListener('resize',position);window.addEventListener('scroll',position,true);window.addEventListener('deck-studio-chart-rendered',position);window.visualViewport?.addEventListener('resize',position);void tick().then(position);return()=>{onselection?.(false);onpreview(null);root?.removeEventListener('pointerdown',down,true);root?.removeEventListener('click',click,true);root?.removeEventListener('keydown',key,true);observer.disconnect();window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);window.removeEventListener('deck-studio-chart-rendered',position);window.visualViewport?.removeEventListener('resize',position);popup?.hidePopover();};});
</script>
<div bind:this={marker} class="format-hook"></div>
<div bind:this={tools} use:portal class="chart-quick-tools ui-floating-toolbar" role="toolbar" tabindex="-1" aria-label="Chart appearance" style:display={disabled||objectMode?'none':'flex'} onkeydown={key}>
  {#if !round}<Button variant="quiet" aria-label="Format chart axes" onclick={e=>open('axis',e.currentTarget)}>Axes</Button>{/if}
  <Button variant="quiet" aria-label="Format data labels" onclick={e=>open('labels',e.currentTarget)}>Labels</Button>
  <Button variant="quiet" aria-label="Position chart legend" onclick={e=>open('legend',e.currentTarget)}>Legend</Button>
  <Button variant="quiet" aria-label="More object tools" onclick={showObjects}><Ellipsis size={16}/>More</Button>
</div>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div bind:this={popup} use:portalToBody popover="auto" role="dialog" aria-label="Chart appearance" tabindex="-1" class="chart-format-popup ui-property-surface" use:popoverFocus={{close:()=>close(false,false),origin:()=>origin,focus:focusAfterChartRedraw}} onbeforetoggle={e=>{if(e.newState==='closed'&&section){if(!save())queueMicrotask(()=>{popup?.showPopover();popup?.focus({preventScroll:true});});else close(true,false);}}} onkeydown={e=>{e.stopPropagation();if(e.defaultPrevented||e.isComposing||e.keyCode===229)return;if(e.key==='Escape'){e.preventDefault();close(true);}else if(e.key==='Enter'&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();close();}}}>
{#if draft&&section}
  <strong>{section==='axis'?'Axes':section==='labels'?'Data labels':'Legend'}</strong>
  <div class="format-body">
  {#if section==='axis'}
    <label class="ui-property-check"><input type="checkbox" checked={draft.axisRange?.min===undefined} onchange={e=>automaticBound('min',e.currentTarget.checked)}/>Automatic minimum</label>
    {#if draft.axisRange?.min!==undefined}<NumberField label="Axis minimum" prefix="Minimum" preset="data" step="any" value={draft.axisRange.min} invalid={invalidRange} descriptionId={invalidRange?errorId:undefined} onchange={value=>update({axisRange:{...draft!.axisRange,min:value}})}/>{/if}
    <label class="ui-property-check"><input type="checkbox" checked={draft.axisRange?.max===undefined} onchange={e=>automaticBound('max',e.currentTarget.checked)}/>Automatic maximum</label>
    {#if draft.axisRange?.max!==undefined}<NumberField label="Axis maximum" prefix="Maximum" preset="data" step="any" value={draft.axisRange.max} invalid={invalidRange} descriptionId={invalidRange?errorId:undefined} onchange={value=>update({axisRange:{...draft!.axisRange,max:value}})}/>{/if}
    <div class="pair"><NumberField label="Axis label size" prefix="Size" preset="font" unit="px" min={12} max={40} value={draft.axisStyle?.fontSize??Math.max(18,Math.min(28,element.fontSize))} onchange={value=>update({axisStyle:{...draft!.axisStyle,fontSize:value}})}/><label>Category angle<select class="ui-property-input" aria-label="Category label angle" value={draft.axisStyle?.rotation??0} onchange={e=>update({axisStyle:{...draft!.axisStyle,rotation:Number(e.currentTarget.value)}})}><option value={0}>Horizontal</option><option value={30}>30°</option><option value={45}>45°</option><option value={90}>Vertical</option></select></label></div>
    <label class="ui-property-check"><input type="checkbox" checked={draft.grid} onchange={e=>update({grid:e.currentTarget.checked})}/>Grid lines</label>
    <label class="ui-property-check"><input type="checkbox" checked={draft.axisStyle?.showLabels??true} onchange={e=>update({axisStyle:{...draft!.axisStyle,showLabels:e.currentTarget.checked}})}/>Axis labels</label>
  {:else if section==='labels'}
    <label class="ui-property-check"><input type="checkbox" checked={draft.showValues} onchange={e=>update({showValues:e.currentTarget.checked})}/>Show values</label>
    <label>Position<select class="ui-property-input" aria-label="Data label position" value={draft.dataLabels?.position??'auto'} onchange={e=>update({dataLabels:{...draft!.dataLabels,position:e.currentTarget.value as 'auto'|'inside'|'outside'}})}><option value="auto">Automatic</option><option value="inside">{['line','area'].includes(draft.type)?'Below point':'Inside'}</option><option value="outside">{['line','area'].includes(draft.type)?'Above point':'Outside'}</option></select></label>
    <div class="pair"><NumberField label="Data label size" prefix="Size" preset="font" unit="px" min={10} max={48} value={draft.dataLabels?.fontSize??Math.max(18,Math.min(28,element.fontSize))} onchange={value=>update({dataLabels:{...draft!.dataLabels,fontSize:value}})}/><label>Decimals<select class="ui-property-input" aria-label="Data label decimals" value={draft.numberFormat?.decimals??'auto'} onchange={e=>update({numberFormat:{...draft!.numberFormat,decimals:e.currentTarget.value==='auto'?undefined:Number(e.currentTarget.value)}})}><option value="auto">Auto</option>{#each [0,1,2,3,4] as n}<option value={n}>{n}</option>{/each}</select></label></div>
    <PropertyRow label="Color"><ColorField opaque allowClear={false} label="Label color" value={draft.dataLabels?.color??draft.textColor} onchange={color=>update({dataLabels:{...draft!.dataLabels,color}})}/></PropertyRow>
    <label class="ui-property-check"><input type="checkbox" checked={draft.dataLabels?.bold??false} onchange={e=>update({dataLabels:{...draft!.dataLabels,bold:e.currentTarget.checked}})}/>Bold labels</label>
  {:else}
    <label class="ui-property-check"><input type="checkbox" checked={draft.legend&&(round||draft.series.length>1||draft.legendPosition!==undefined)} onchange={e=>update({legend:e.currentTarget.checked,legendPosition:draft!.legendPosition??'auto'})}/>Show legend</label>
    <PropertyChoice label="Legend position" value={draft.legendPosition??'auto'} options={['auto','top','right','bottom','left'].map(position=>({value:position,label:position==='auto'?'Auto':position[0].toUpperCase()+position.slice(1)}))} onchange={position=>update({legendPosition:position as Chart['legendPosition'],legend:true})}/>
  {/if}
  </div>
  {#if stale||error}<p id={errorId} role="alert" class="error">{stale?'The document changed. Reopen these controls.':error}</p>{/if}
  <footer><Button variant="quiet" onclick={()=>close(true)}>Cancel</Button><Button variant="secondary" disabled={Boolean(stale||error)||!numericFields.valid} onclick={()=>close()}>Done</Button></footer>
{/if}
</div>
<style>
.format-hook{display:none}.chart-quick-tools{position:fixed;z-index:150;max-width:calc(100vw - 24px);flex-wrap:wrap}.chart-format-popup{position:fixed;inset:auto;margin:0;padding:12px;width:min(300px,calc(100vw - 24px));border:1px solid var(--component-border);border-radius:var(--r-popover);background:var(--dialog-surface);color:var(--text-primary);box-shadow:var(--shadow-popover);box-sizing:border-box;display:none;flex-direction:column;gap:12px;overflow:hidden}.chart-format-popup:popover-open{display:flex}.chart-format-popup strong{font-size:var(--ui-label)}.format-body{display:flex;flex-direction:column;gap:8px;overflow:auto;min-height:0;scrollbar-gutter:stable;}.chart-format-popup label:not(.ui-property-check){margin:0;font:var(--ui-label)/1.4 var(--font-ui);display:flex;flex-direction:column;gap:4px}.pair{display:flex;flex-direction:column;gap:8px}.pair label,.pair :global(.number-property){flex:1;min-width:0}.pair select{width:100%;box-sizing:border-box;min-height:var(--property-control-height)}footer{display:flex;justify-content:space-between;gap:8px}.error{color:var(--danger-text);font-size:var(--ui-meta);margin:0}@media(pointer:coarse),(max-width:760px){footer :global(button){min-height:44px}.pair select{min-height:var(--property-control-height);font-size:16px}}
</style>
