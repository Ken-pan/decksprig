<script lang="ts">
  import {onMount,onDestroy,tick} from 'svelte';
  import type {SlideElement} from '../core/model';
  import type {DesignSystem} from '../core/design-system-schema';
  import type {TableStyle} from '../core/table-schema';
  import {tablePresentation} from '../core/table-rendering';
  import {tableRowHeights} from '../core/table-fit';
  import {tableColumnStyle} from '../core/table-columns';
  import {resizeRowPair} from '../core/table-grid';
  import {editor} from '../core/editor.svelte';
  import {holdPointerCursor} from '../pointer-cursor';
  import {resizeCursor,passedDragThreshold} from '../core/interactions';
  import {floatingTableHandle} from '../table-touch-handle';
  import {tableGestureLifecycle} from '../table-gesture-lifecycle';
  import {cellBounds,type CellRange} from '../core/table-grid';
  let {element,scale,system,onpreview,range}:{element:SlideElement;scale:number;system?:DesignSystem;onpreview:(style:TableStyle|null)=>void;range?:CellRange}=$props();
  let root=$state<HTMLDivElement>(),measured=$state<number[]>([]),preview=$state<number[]|null>(null);
  type Drag={pointerId:number;pointerType:string;active:boolean;blocked:boolean;viewportWidth:number;viewportHeight:number;x:number;y:number;boundary:number;base:SlideElement;heights:number[];minimums:number[];style:TableStyle;revision:number;deckId:string;slideId:string;scale:number;node:HTMLElement};
  let drag=$state<Drag|null>(null),release:(()=>void)|undefined;
  const signature=$derived(JSON.stringify([element.cells,element.tableStyle,element.w,element.h,element.fontSize,element.fontFamily,element.lineHeight]));
  $effect(()=>{signature;void tick().then(()=>{if(drag)return;const rows=root?.parentElement?.querySelectorAll<HTMLTableRowElement>('.slide-table tr');if(rows)measured=Array.from(rows,r=>r.getBoundingClientRect().width?parseFloat(getComputedStyle(r).height):0);});});
  const p=$derived(tablePresentation(element,system)),shown=$derived(preview??(measured.length===element.cells?.length?measured:(p.heights??(element.cells??[]).map(()=>1/(element.cells?.length||1))).map(h=>h*element.h)));
  const minimums=$derived(tableRowHeights({...element,tableStyle:element.tableStyle?{...element.tableStyle,rowHeights:undefined}:undefined}));
  const compact=$derived(shown.some(size=>size*scale<28));
  const selectedBoundary=$derived(Math.max(0,Math.min(shown.length-2,range?cellBounds(range).bottom:0)));
  const boundaries=$derived(shown.slice(0,-1).map((_,i)=>shown.slice(0,i+1).reduce((a,b)=>a+b,0)/element.h*100));
  const cursor=$derived(Math.abs(element.rotation%180)<.01?'row-resize':resizeCursor(element,'s'));
  function style(heights:number[]){return {...tableColumnStyle(element,p.widths.map(w=>w*element.w),system),rowHeights:heights};}
  function valid(g:Drag){return editor.deck?.id===g.deckId&&editor.slide?.id===g.slideId&&editor.deck?.revision===g.revision&&!element.locked&&scale===g.scale&&innerWidth===g.viewportWidth&&innerHeight===g.viewportHeight;}
  function clear(){const g=drag;drag=null;preview=null;onpreview(null);release?.();release=undefined;if(g?.node.hasPointerCapture(g.pointerId))g.node.releasePointerCapture(g.pointerId);}
  function start(event:PointerEvent,boundary:number){
    if(!event.isPrimary||event.button!==0||drag||element.locked)return;event.preventDefault();event.stopPropagation();let node=event.currentTarget as HTMLElement;
    if(event.pointerType==='touch'&&!node.classList.contains('floating-table-handle')){let distance=Infinity;for(const n of root?.querySelectorAll<HTMLElement>('[data-row-boundary]')??[]){const r=n.getBoundingClientRect(),d=Math.hypot(event.clientX-r.x-r.width/2,event.clientY-r.y-r.height/2);if(d<distance){distance=d;node=n;boundary=Number(n.dataset.rowBoundary);}}}
    node.focus({preventScroll:true});drag={pointerId:event.pointerId,pointerType:event.pointerType,active:false,blocked:false,viewportWidth:innerWidth,viewportHeight:innerHeight,x:event.clientX,y:event.clientY,boundary,base:element,heights:[...shown],minimums:[...minimums],style:style(shown),revision:editor.deck!.revision,deckId:editor.deck!.id,slideId:editor.slide!.id,scale,node};preview=[...shown];node.setPointerCapture(event.pointerId);release=holdPointerCursor(cursor);
  }
  function move(event:PointerEvent){const g=drag;if(!g||g.pointerId!==event.pointerId)return;event.preventDefault();event.stopPropagation();if(!valid(g)){clear();return;}if(!g.active&&!passedDragThreshold(event.clientX-g.x,event.clientY-g.y,g.pointerType))return;g.active=true;const a=g.base.rotation*Math.PI/180,delta=(-(event.clientX-g.x)*Math.sin(a)+(event.clientY-g.y)*Math.cos(a))/g.scale*(g.base.flipY?-1:1);preview=resizeRowPair(g.heights,g.boundary,delta,g.minimums);g.blocked=Math.abs(delta)>1&&preview.every((h,i)=>Math.abs(h-g.heights[i])<.01);onpreview({...g.style,rowHeights:preview});}
  function finish(event:PointerEvent){const g=drag;if(!g||g.pointerId!==event.pointerId)return;event.preventDefault();event.stopPropagation();const next=preview,allowed=valid(g)&&g.active;clear();if(allowed&&next?.some((h,i)=>Math.abs(h-g.heights[i])>.01))editor.commit([{op:'update_element',slideId:g.slideId,elementId:g.base.id,patch:{tableStyle:{...g.style,rowHeights:next}}}],'','manual',g.revision);else if(allowed&&g.blocked)editor.notify('These rows are at their content limit. Increase the table height or reduce cell padding.','warning');}
  function key(event:KeyboardEvent,boundary:number){if(event.key==='Escape'&&drag){event.preventDefault();event.stopPropagation();clear();return;}if(drag||event.metaKey||event.ctrlKey||event.isComposing||!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();const delta=event.key==='Home'?-element.h:event.key==='End'?element.h:(event.key==='ArrowDown'?1:-1)*(event.shiftKey?40:4)*(element.flipY?-1:1),next=resizeRowPair(shown,boundary,delta,minimums);if(next.some((h,i)=>Math.abs(h-shown[i])>.01))editor.commit([{op:'update_element',slideId:editor.slide!.id,elementId:element.id,patch:{tableStyle:style(next)}}]);}
  onMount(()=>tableGestureLifecycle(()=>drag?.pointerId,clear));
  $effect(()=>{if(drag&&!valid(drag))clear();});onDestroy(clear);
</script>
<div bind:this={root} class="row-handles" class:compact style:--handle-unit={`${1/scale}px`} style:--row-cursor={cursor}>
  {#each boundaries as top,i}
    <!-- Keyboard adjustable ARIA separator. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div use:floatingTableHandle={{root,element,scale,axis:'row',boundary:shown.slice(0,i+1).reduce((a,b)=>a+b,0),floating:compact||matchMedia('(pointer:coarse)').matches,active:i===selectedBoundary}} role="separator" tabindex="0" aria-orientation="horizontal" aria-label={`Resize rows ${i+1} and ${i+2}`} aria-valuenow={shown[i]} aria-valuemin={Math.min(shown[i],minimums[i])} aria-valuemax={shown[i]+shown[i+1]-Math.min(shown[i+1],minimums[i+1])} class="row-boundary" class:touch-current={i===selectedBoundary} class:external={p.merges.some(m=>m.row<=i&&m.row+m.rowSpan-1>i)} class:dragging={drag?.boundary===i} style:top={`${top}%`} data-row-boundary={i} title="Drag to resize rows · Arrow keys adjust · Esc cancels" onpointerdown={e=>start(e,i)} onpointermove={move} onpointerup={finish} onpointercancel={clear} onlostpointercapture={()=>{if(drag)clear();}} onkeydown={e=>key(e,i)} ondblclick={e=>{e.preventDefault();e.stopPropagation();}}><span class="boundary-label">{#if drag?.boundary===i}{drag.blocked?'Limit':`${Math.round(shown[i])} px`}{:else}{i+1} / {i+2}{/if}</span></div>
  {/each}
  {#if drag}<span class="row-size" style:transform={`scale(${element.flipX?-1:1},${element.flipY?-1:1}) rotate(${-element.rotation}deg)`} style:top={`${boundaries[drag.boundary]}%`}>{Math.round(shown[drag.boundary])} / {Math.round(shown[drag.boundary+1])} px</span>{/if}
</div>
<style>
  .row-handles{position:absolute;inset:0;pointer-events:none}.row-boundary{position:absolute;left:0;right:0;height:calc(14 * var(--handle-unit));transform:translateY(-50%);pointer-events:auto;touch-action:none;cursor:var(--row-cursor)}.row-boundary::after{content:'';position:absolute;left:0;right:0;top:50%;height:var(--handle-unit);background:var(--canvas-selection);opacity:.35;pointer-events:none}.row-boundary.dragging::after,.row-boundary:focus-visible::after{opacity:1;height:calc(2 * var(--handle-unit))}.row-boundary:focus-visible{outline:calc(2 * var(--handle-unit)) solid var(--canvas-selection);outline-offset:calc(-2 * var(--handle-unit))}.row-size{position:absolute;left:calc(100% + 12 * var(--handle-unit));font:calc(var(--ui-meta) / var(--canvas-scale,1))/1.4 var(--font-ui);white-space:nowrap;color:var(--text-primary);background:var(--surface-overlay);padding:calc(4 * var(--handle-unit));pointer-events:none}
  @media(hover:hover) and (pointer:fine){.row-boundary:hover::after{opacity:1;height:calc(2 * var(--handle-unit))}}
  @media(pointer:coarse){.row-boundary{left:calc(100% + 4 * var(--handle-unit));right:auto;width:calc(44 * var(--handle-unit));height:calc(44 * var(--handle-unit));border-radius:calc(8 * var(--handle-unit));background:transparent;border:0}.row-boundary::before{content:'';position:absolute;inset:calc(10 * var(--handle-unit));border-radius:calc(6 * var(--handle-unit));background:var(--surface-overlay);border:var(--handle-unit) solid var(--canvas-selection);pointer-events:none}.row-boundary::after{left:35%;right:35%;height:calc(2 * var(--handle-unit));opacity:1}.row-size{left:calc(100% - 120 * var(--handle-unit))}}
  @media(pointer:fine){.row-boundary.external{left:calc(100% + 4 * var(--handle-unit));right:auto;width:calc(24 * var(--handle-unit));height:calc(24 * var(--handle-unit));border:var(--handle-unit) solid var(--canvas-selection);border-radius:calc(6 * var(--handle-unit));background:var(--surface-overlay)}.row-boundary.external::after{left:30%;right:30%;height:calc(2 * var(--handle-unit));opacity:1}}
.boundary-label{display:none}@media(pointer:coarse){.row-boundary:not(.touch-current){display:none}.row-boundary::before,.row-boundary::after{display:none}.row-boundary .boundary-label{display:flex;position:absolute;inset:0;align-items:center;justify-content:center;border:var(--handle-unit) solid var(--canvas-selection);border-radius:calc(8 * var(--handle-unit));background:var(--surface-overlay);color:var(--text-primary);font:calc(11 * var(--handle-unit))/1.4 var(--font-ui);white-space:nowrap;pointer-events:none}}
.row-handles.compact .row-boundary:not(.touch-current){display:none}
.row-handles.compact .row-boundary{left:calc(100% + 4 * var(--handle-unit));right:auto;width:calc(44 * var(--handle-unit));height:calc(44 * var(--handle-unit));border:0;background:transparent}.row-handles.compact .row-boundary::before,.row-handles.compact .row-boundary::after{display:none}.row-handles.compact .boundary-label{display:flex;position:absolute;inset:0;align-items:center;justify-content:center;border:var(--handle-unit) solid var(--canvas-selection);border-radius:calc(8 * var(--handle-unit));background:var(--surface-overlay);color:var(--text-primary);font:calc(11 * var(--handle-unit))/1.4 var(--font-ui);white-space:nowrap;pointer-events:none}
</style>
