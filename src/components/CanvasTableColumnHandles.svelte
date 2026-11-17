<script lang="ts">
  import {onMount,onDestroy} from 'svelte';
  import type {SlideElement} from '../core/model';
  import type {DesignSystem} from '../core/design-system-schema';
  import {tablePresentation} from '../core/table-rendering';
  import {resizeTableColumns,resizeColumnWidths,tableColumnStyle} from '../core/table-columns';
  import type {TableStyle} from '../core/table-schema';
  import {editor} from '../core/editor.svelte';
  import {holdPointerCursor} from '../pointer-cursor';
  import {resizeCursor,passedDragThreshold} from '../core/interactions';
  import RowHandles from './CanvasTableRowHandles.svelte';
  import {floatingTableHandle} from '../table-touch-handle';
  import {tableGestureLifecycle} from '../table-gesture-lifecycle';
  import {cellBounds,type CellRange} from '../core/table-grid';
  let {element,scale,system,onpreview,range}:{element:SlideElement;scale:number;system?:DesignSystem;onpreview:(style:TableStyle|null)=>void;range?:CellRange}=$props();
  type Drag={pointerId:number;pointerType:string;active:boolean;blocked:boolean;viewportWidth:number;viewportHeight:number;x:number;y:number;boundary:number;base:SlideElement;style:TableStyle;widths:number[];minimum:number;revision:number;deckId:string;slideId:string;node:HTMLElement;scale:number};
  let root=$state<HTMLDivElement>();
  let drag=$state<Drag|null>(null),widths=$state<number[]|null>(null),releaseCursor:(()=>void)|undefined;
  const p=$derived(tablePresentation(element,system));
  const cursor=$derived(Math.abs(element.rotation%180)<.01?'col-resize':resizeCursor(element,'e'));
  const shown=$derived(widths??p.widths.map(w=>w*element.w));
  const compact=$derived(shown.some(size=>size*scale<28));
  const selectedBoundary=$derived(Math.max(0,Math.min(shown.length-2,range?cellBounds(range).right:0)));
  const boundaries=$derived(shown.slice(0,-1).map((_,i)=>shown.slice(0,i+1).reduce((a,b)=>a+b,0)/element.w*100));
  function minimum(i:number){return Math.min((shown[i]+shown[i+1])/2,Math.max(24,p.padding*2+Math.min(32,element.fontSize*1.2)));}
  function valid(g:Drag){return editor.deck?.id===g.deckId&&editor.slide?.id===g.slideId&&editor.deck?.revision===g.revision&&!element.locked&&scale===g.scale&&innerWidth===g.viewportWidth&&innerHeight===g.viewportHeight;}
  function clear(){const g=drag;drag=null;widths=null;onpreview(null);releaseCursor?.();releaseCursor=undefined;if(g?.node.hasPointerCapture(g.pointerId))g.node.releasePointerCapture(g.pointerId);}
  function start(event:PointerEvent,boundary:number){
    if(!event.isPrimary||event.button!==0||element.locked||drag)return;event.preventDefault();event.stopPropagation();
    let node=event.currentTarget as HTMLElement;
    if(event.pointerType==='touch'&&!node.classList.contains('floating-table-handle')){
      let nearest=Infinity;
      for(const candidate of node.parentElement?.querySelectorAll<HTMLElement>('[data-column-boundary]')??[]){const r=candidate.getBoundingClientRect(),distance=Math.hypot(event.clientX-r.x-r.width/2,event.clientY-r.y-r.height/2);if(distance<nearest){nearest=distance;node=candidate;boundary=Number(candidate.dataset.columnBoundary);}}
    }
    node.focus({preventScroll:true});
    const initial=p.widths.map(w=>w*element.w);
    drag={pointerId:event.pointerId,pointerType:event.pointerType,active:false,blocked:false,viewportWidth:innerWidth,viewportHeight:innerHeight,x:event.clientX,y:event.clientY,boundary,base:element,style:tableColumnStyle(element,initial,system),widths:initial,minimum:minimum(boundary),revision:editor.deck!.revision,deckId:editor.deck!.id,slideId:editor.slide!.id,node,scale};
    widths=p.widths.map(w=>w*element.w);node.setPointerCapture(event.pointerId);releaseCursor=holdPointerCursor(cursor);
  }
  function move(event:PointerEvent){
    const g=drag;if(!g||g.pointerId!==event.pointerId)return;event.preventDefault();event.stopPropagation();if(!valid(g)){clear();return;}if(!g.active&&!passedDragThreshold(event.clientX-g.x,event.clientY-g.y,g.pointerType))return;g.active=true;
    const angle=g.base.rotation*Math.PI/180,delta=((event.clientX-g.x)*Math.cos(angle)+(event.clientY-g.y)*Math.sin(angle))/g.scale*(g.base.flipX?-1:1);
    widths=resizeColumnWidths(g.widths,g.boundary,delta,g.minimum);g.blocked=Math.abs(delta)>1&&widths.every((w,i)=>Math.abs(w-g.widths[i])<.01);onpreview({...g.style,columnWidths:widths});
  }
  function finish(event:PointerEvent){
    const g=drag;if(!g||g.pointerId!==event.pointerId)return;event.preventDefault();event.stopPropagation();
    const next=widths,allowed=valid(g)&&g.active,before=tablePresentation(g.base,system).widths.map(w=>w*g.base.w);clear();
    if(!allowed)return;
    if(next&&next.some((w,i)=>Math.abs(w-before[i])>.01))editor.commit([{op:'update_element',slideId:g.slideId,elementId:g.base.id,patch:{tableStyle:tableColumnStyle(g.base,next,system)}}],'','manual',g.revision);else if(g.blocked)editor.notify('These columns reached their minimum width. Increase the table width or reduce cell padding.','warning');
  }
  function key(event:KeyboardEvent,boundary:number){
    if(event.key==='Escape'&&drag){event.preventDefault();event.stopPropagation();clear();return;}
    if(drag||event.isComposing||event.metaKey||event.ctrlKey||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();const revision=editor.deck!.revision;
    const delta=event.key==='Home'?-element.w:event.key==='End'?element.w:(event.key==='ArrowRight'?1:-1)*(event.shiftKey?40:4)*(element.flipX?-1:1);
    const next=resizeTableColumns(element,boundary,delta);
    if(next.some((w,i)=>Math.abs(w-shown[i])>.01))editor.commit([{op:'update_element',slideId:editor.slide!.id,elementId:element.id,patch:{tableStyle:tableColumnStyle(element,next,system)}}],'','manual',revision);
  }
  onMount(()=>tableGestureLifecycle(()=>drag?.pointerId,clear));
  $effect(()=>{if(drag&&!valid(drag))clear();});
  onDestroy(clear);
</script>
<div bind:this={root} class="column-handles" class:compact style:--handle-unit={`${1/scale}px`} style:--column-cursor={cursor}>
  {#each boundaries as left,i}
    <!-- Focusable ARIA separators expose column resizing as a keyboard adjustable value. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div tabindex="0" role="separator" use:floatingTableHandle={{root,element,scale,axis:'column',boundary:shown.slice(0,i+1).reduce((a,b)=>a+b,0),floating:compact||matchMedia('(pointer:coarse)').matches,active:i===selectedBoundary}} aria-orientation="vertical" aria-valuemin={Math.min(shown[i],minimum(i))} aria-valuemax={shown[i]+shown[i+1]-Math.min(shown[i+1],minimum(i))} aria-valuenow={shown[i]} class="column-boundary" class:touch-current={i===selectedBoundary} class:external={p.merges.some(m=>m.column<=i&&m.column+m.columnSpan-1>i)} class:dragging={drag?.boundary===i} style:left={`${left}%`} aria-label={`Resize columns ${String.fromCharCode(65+i)} and ${String.fromCharCode(66+i)}`} title="Drag to resize columns · Arrow keys adjust · Esc cancels" data-column-boundary={i} onpointerdown={event=>start(event,i)} onpointermove={move} onpointerup={finish} onpointercancel={clear} onlostpointercapture={()=>{if(drag)clear();}} onkeydown={event=>key(event,i)} ondblclick={event=>{event.preventDefault();event.stopPropagation();}}><span class="boundary-label">{#if drag?.boundary===i}{drag.blocked?'Limit':`${Math.round(shown[i])} px`}{:else}{String.fromCharCode(65+i)} / {String.fromCharCode(66+i)}{/if}</span></div>
  {/each}
  {#if drag}<span class="column-size" style:left={`${boundaries[drag.boundary]}%`} style:transform={`translateX(-50%) scale(${element.flipX?-1:1},${element.flipY?-1:1}) rotate(${-element.rotation}deg)`}>{Math.round(shown[drag.boundary])} / {Math.round(shown[drag.boundary+1])} px</span>{/if}
</div>
<RowHandles {element} {scale} {system} {onpreview} {range}/>
<style>
  .column-handles{position:absolute;inset:0;pointer-events:none}.column-boundary{position:absolute;top:0;bottom:0;width:calc(14 * var(--handle-unit));transform:translateX(-50%);padding:0;border:0;border-radius:0;background:transparent;pointer-events:auto;touch-action:none;cursor:var(--column-cursor,col-resize)}.column-boundary::after{content:'';position:absolute;top:0;bottom:0;left:50%;width:calc(1 * var(--handle-unit));background:var(--canvas-selection);opacity:.35;pointer-events:none}.column-boundary.dragging::after,.column-boundary:focus-visible::after{opacity:1;width:calc(2 * var(--handle-unit))}.column-boundary:focus-visible{outline:calc(2 * var(--handle-unit)) solid var(--canvas-selection);outline-offset:calc(-2 * var(--handle-unit))}.column-size{position:absolute;top:calc(-32 * var(--handle-unit));padding:calc(4 * var(--handle-unit)) calc(8 * var(--handle-unit));border-radius:calc(4 * var(--handle-unit));background:var(--surface-overlay);color:var(--text-primary);font:calc(var(--ui-meta) / var(--canvas-scale,1))/1.4 var(--font-ui);white-space:nowrap;pointer-events:none}
  @media(hover:hover) and (pointer:fine){.column-boundary:hover::after{opacity:1;width:calc(2 * var(--handle-unit))}}
  @media(pointer:coarse){.column-boundary{top:calc(100% + 4 * var(--handle-unit));bottom:auto;width:calc(44 * var(--handle-unit));height:calc(44 * var(--handle-unit));border-radius:calc(8 * var(--handle-unit));background:transparent;border:0}.column-boundary::before{content:'';position:absolute;inset:calc(10 * var(--handle-unit));border-radius:calc(6 * var(--handle-unit));background:var(--surface-overlay);border:var(--handle-unit) solid var(--canvas-selection);pointer-events:none}.column-boundary::after{top:35%;bottom:35%;width:calc(2 * var(--handle-unit));opacity:1}}
  @media(pointer:fine){.column-boundary.external{top:calc(100% + 4 * var(--handle-unit));bottom:auto;width:calc(24 * var(--handle-unit));height:calc(24 * var(--handle-unit));border:var(--handle-unit) solid var(--canvas-selection);border-radius:calc(6 * var(--handle-unit));background:var(--surface-overlay)}.column-boundary.external::after{top:30%;bottom:30%;width:calc(2 * var(--handle-unit));opacity:1}}
.boundary-label{display:none}@media(pointer:coarse){.column-boundary:not(.touch-current){display:none}.column-boundary::before,.column-boundary::after{display:none}.column-boundary .boundary-label{display:flex;position:absolute;inset:0;align-items:center;justify-content:center;border:var(--handle-unit) solid var(--canvas-selection);border-radius:calc(8 * var(--handle-unit));background:var(--surface-overlay);color:var(--text-primary);font:calc(11 * var(--handle-unit))/1.4 var(--font-ui);white-space:nowrap;pointer-events:none}}
.column-handles.compact .column-boundary:not(.touch-current){display:none}
.column-handles.compact .column-boundary{top:calc(100% + 4 * var(--handle-unit));bottom:auto;width:calc(44 * var(--handle-unit));height:calc(44 * var(--handle-unit));border:0;background:transparent}.column-handles.compact .column-boundary::before,.column-handles.compact .column-boundary::after{display:none}.column-handles.compact .boundary-label{display:flex;position:absolute;inset:0;align-items:center;justify-content:center;border:var(--handle-unit) solid var(--canvas-selection);border-radius:calc(8 * var(--handle-unit));background:var(--surface-overlay);color:var(--text-primary);font:calc(11 * var(--handle-unit))/1.4 var(--font-ui);white-space:nowrap;pointer-events:none}
</style>
