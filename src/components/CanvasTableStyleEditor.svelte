<script lang="ts">
  import {portalToBody} from '../ui-portal';
  import {onMount,tick} from 'svelte';
  import {X,Bold,Italic,Underline,Strikethrough,AlignLeft,AlignCenter,AlignRight} from '@lucide/svelte';
  import {Button} from './ui';
  import NumberField from './ui/NumberField.svelte';
  import ColorField from './ui/ColorField.svelte';
  import PropertyChoice from './ui/PropertyChoice.svelte';
  import PropertyRow from './ui/PropertyRow.svelte';
  import {textAlignmentIcons} from './icons/text-icons';
  import {tablePresentation,tableCellStyle,tableCellBox} from '../core/table-rendering';
  import {styleTableRange,borderTableRange,cellOwner} from '../core/table-structure';
  import {cellBounds,type CellRange} from '../core/table-grid';
  import type {TableCellStyle,TableEdge} from '../core/table-schema';
  import type {SlideElement} from '../core/model';
  import type {DesignSystem} from '../core/design-system-schema';
  import {floatingPlacement,visualBounds} from '../ui-viewport';
  import {popoverFocus} from '../ui-focus';
  import {editor} from '../core/editor.svelte';
  import {uiDisclosure} from '../ui-motion';
  let {element,system,range,anchor,onapply,onclose}:{element:SlideElement;system?:DesignSystem;range:CellRange;anchor:()=>HTMLElement|undefined;onapply:(patch:Partial<SlideElement>)=>boolean;onclose:()=>void}=$props();
  let popup=$state<HTMLDivElement>(),frame=0,closing=false;
  const bounds=$derived(cellBounds(range)),p=$derived(tablePresentation(element,system));
  const styles=$derived.by(()=>{const result:ReturnType<typeof tableCellStyle>[]=[];for(let r=bounds.top;r<=bounds.bottom;r++)for(let c=bounds.left;c<=bounds.right;c++){const owner=cellOwner(element.tableStyle,{row:r,column:c});result.push(tableCellStyle(p,owner.row,owner.column));}return result;});
  let borderSide=$state<'all'|'top'|'right'|'bottom'|'left'>('all');
  const boxes=$derived.by(()=>{const result:ReturnType<typeof tableCellBox>[]=[];for(let r=bounds.top;r<=bounds.bottom;r++)for(let c=bounds.left;c<=bounds.right;c++){const owner=cellOwner(element.tableStyle,{row:r,column:c});result.push(tableCellBox(p,owner.row,owner.column));}return result;});
  const sides=['top','right','bottom','left'] as const;
  const edges=$derived(boxes.flatMap(box=>borderSide==='all'?sides.map(side=>box.edges[side]):[box.edges[borderSide]]));
  function insetMixed(side:typeof sides[number]){return boxes.some(box=>box.insets[side]!==boxes[0]?.insets[side]);}
  function edgeMixed(key:keyof TableEdge){return edges.some(edge=>edge[key]!==edges[0]?.[key]);}
  function border(patch:Partial<TableEdge>){const live=editor.slide?.elements.find(e=>e.id===element.id);if(!live||live.locked)return;onapply(borderTableRange(live,range,borderSide,patch,system));}
  function lineStyle(value:string){border(value==='none'?{width:0}:{style:value as TableEdge['style'],...(!edges[0]?.width?{width:p.borderWidth||1}:{}),...(edges[0]?.color==='transparent'?{color:p.line==='transparent'?'#172b26':p.line}:{})});}
  function mixed(key:keyof ReturnType<typeof tableCellStyle>){return styles.some(s=>s[key]!==styles[0]?.[key]);}
  function decoration(value:string){const active=styles[0]?.textDecoration.includes(value)??false;return styles.some(s=>s.textDecoration.includes(value)!==active)?'mixed':active;}
  function apply(patch:Omit<Partial<TableCellStyle>,'row'|'column'>|null){const live=editor.slide?.elements.find(e=>e.id===element.id);if(!live||live.locked)return false;return onapply(styleTableRange(live,range,patch,system));}
  function position(){
    if(!popup?.matches(':popover-open')||!anchor())return;
    const root=document.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(element.id)}"] .canvas-cell-grid`),stage=root?.closest('.canvas-stage')?.getBoundingClientRect(),dock=document.querySelector('.canvas-insert-dock')?.getBoundingClientRect(),v=visualBounds();
    const left=Math.max(v.left,stage?.left??v.left),top=Math.max(v.top,stage?.top??v.top),right=Math.min(v.left+v.width,stage?.right??v.left+v.width),bottom=Math.min(v.top+v.height,stage?.bottom??v.top+v.height,dock&&dock.width>0&&dock.height>0?dock.top-8:Infinity),workspace={left,top,width:Math.max(1,right-left),height:Math.max(1,bottom-top)},viewport=workspace.height<240?v:workspace;
    const cells=Array.from(root?.querySelectorAll<HTMLElement>('.selected-cell')??[],node=>node.getBoundingClientRect()),avoid=cells.length?{left:Math.min(...cells.map(r=>r.left)),right:Math.max(...cells.map(r=>r.right)),top:Math.min(...cells.map(r=>r.top)),bottom:Math.max(...cells.map(r=>r.bottom))}:undefined;
    popup.style.maxWidth=`${Math.max(1,viewport.width-24)}px`;
    const place=()=>floatingPlacement(anchor()!.getBoundingClientRect(),{width:popup!.offsetWidth,height:popup!.offsetHeight},viewport,{preferredHeight:popup!.scrollHeight,minHeight:240,avoid});
    popup.style.maxHeight=`${place().maxHeight}px`;const result=place();popup.style.left=`${result.left}px`;popup.style.top=`${result.top}px`;
  }
  function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(position);}
  function close(){if(closing)return;closing=true;popup?.hidePopover();onclose();}
  onMount(()=>{popup!.showPopover();void tick().then(()=>{position();popup?.querySelector<HTMLButtonElement>('[aria-label="Bold cells"]')?.focus();});const observer=new ResizeObserver(schedule);observer.observe(popup!);window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true);window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);return()=>{closing=true;popup?.hidePopover();observer.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);};});
</script>
<div bind:this={popup} use:portalToBody popover="auto" class="cell-style-editor ui-property-surface" role="dialog" aria-label="Style selected cells" tabindex="-1" use:popoverFocus={{close,origin:anchor}} onbeforetoggle={e=>{if(e.newState==='closed'&&!closing)close();}} onkeydown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){if(e.target instanceof HTMLInputElement&&e.target.value!==e.target.dataset.documentValue)return;e.preventDefault();e.stopPropagation();close();e.shiftKey?editor.redo():editor.undo();}}}>
  <header><strong>Cells {String.fromCharCode(65+bounds.left)}{bounds.top+1}{bounds.top===bounds.bottom&&bounds.left===bounds.right?'':`:${String.fromCharCode(65+bounds.right)}${bounds.bottom+1}`}</strong><Button variant="quiet" kind="icon" aria-label="Close cell styles" onclick={close}><X size={16}/></Button></header>
  <div class="cell-style-body">
  <div class="cell-style-row" role="group" aria-label="Cell text style">
    <Button variant="quiet" aria-label="Bold cells" aria-pressed={mixed('fontWeight')?'mixed':(styles[0]?.fontWeight??400)>=600} onclick={()=>apply({fontWeight:!mixed('fontWeight')&&(styles[0]?.fontWeight??400)>=600?400:600})}><Bold size={16}/></Button>
    <Button variant="quiet" aria-label="Italic cells" aria-pressed={mixed('fontStyle')?'mixed':styles[0]?.fontStyle==='italic'} onclick={()=>apply({italic:mixed('fontStyle')||styles[0]?.fontStyle!=='italic'})}><Italic size={16}/></Button>
    <Button variant="quiet" aria-label="Underline cells" aria-pressed={decoration('underline')} onclick={()=>apply(decoration('underline')===true?{underline:false}:{underline:true,strikethrough:false})}><Underline size={16}/></Button>
    <Button variant="quiet" aria-label="Strikethrough cells" aria-pressed={decoration('line-through')} onclick={()=>apply(decoration('line-through')===true?{strikethrough:false}:{strikethrough:true,underline:false})}><Strikethrough size={16}/></Button>
    <span class="separator"></span>
    <PropertyChoice label="Cell text alignment" icons value={mixed('textAlign')?'':styles[0]?.textAlign} options={[{value:'left',label:'Left',icon:AlignLeft},{value:'center',label:'Center',icon:AlignCenter},{value:'right',label:'Right',icon:AlignRight}]} onchange={value=>{apply({align:value as TableCellStyle['align']});}}/>
  </div>
  <PropertyRow label="Size"><NumberField label="Cell font size" prefix="" value={parseFloat(styles[0]?.fontSize??'32')} mixed={mixed('fontSize')} min={4} max={500} step="any" preset="font" unit="px" onchange={value=>apply({fontSize:value})}/></PropertyRow>
  <PropertyRow label="Vertical"><PropertyChoice label="Cell vertical alignment" icons value={mixed('verticalAlign')?'':styles[0]?.verticalAlign??'top'} options={[{value:'top',label:'Top',icon:textAlignmentIcons.top},{value:'middle',label:'Middle',icon:textAlignmentIcons.middle},{value:'bottom',label:'Bottom',icon:textAlignmentIcons.bottom}]} onchange={value=>{apply({verticalAlign:value as TableCellStyle['verticalAlign']});}}/></PropertyRow>
  <PropertyRow label="Fill"><ColorField label="Cell fill" value={styles[0]?.background??'#ffffff'} mixed={mixed('background')} onchange={value=>apply({fill:value})}/></PropertyRow>
  <PropertyRow label="Text"><ColorField label="Cell text" value={styles[0]?.color??'#172b26'} mixed={mixed('color')} allowClear={false} onchange={value=>apply({color:value})}/></PropertyRow>
  <details class="cell-layout" use:uiDisclosure><summary>Cell layout</summary><div>
    <div class="inset-fields" role="group" aria-label="Cell padding">
      {#each sides as side}<NumberField label={`Cell ${side} padding`} prefix={side[0].toUpperCase()+side.slice(1)} preset="spacing" unit="px" value={boxes[0]?.insets[side]??p.padding} mixed={insetMixed(side)} min={0} max={1000} step="any" onchange={value=>apply({insets:{[side]:value}})}/>{/each}
    </div>
    <PropertyRow label="Borders"><select aria-label="Cell border side" bind:value={borderSide}><option value="all">All sides</option><option value="top">Top</option><option value="right">Right</option><option value="bottom">Bottom</option><option value="left">Left</option></select></PropertyRow>
    <PropertyRow label="Line"><select aria-label="Cell border style" value={edgeMixed('style')||edges.some(edge=>Boolean(edge.width)!==Boolean(edges[0]?.width))?'mixed':!edges[0]?.width?'none':edges[0]?.style??'solid'} onchange={event=>lineStyle(event.currentTarget.value)}><option value="mixed" disabled>Mixed</option><option value="none">None</option><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option><option value="double">Double</option></select></PropertyRow>
    <PropertyRow label="Width"><NumberField label="Cell border width" prefix="" preset="stroke" unit="px" value={edges[0]?.width??p.borderWidth} mixed={edgeMixed('width')} min={0} max={100} step="any" onchange={width=>border({width})}/></PropertyRow>
    <PropertyRow label="Color"><ColorField label="Cell border color" value={edges[0]?.color??p.line} mixed={edgeMixed('color')} onchange={color=>border({color})}/></PropertyRow>
    <Button variant="quiet" onclick={()=>apply({insets:undefined})}>Reset padding</Button>
  </div></details>
  </div>
  <footer><Button variant="quiet" onclick={()=>apply(null)}>Reset cells</Button><Button variant="secondary" onclick={close}>Done</Button></footer>
</div>
<style>
  .cell-style-editor{position:fixed;inset:auto;margin:0;width:min(288px,calc(100vw - 24px));box-sizing:border-box;padding:12px;border:1px solid var(--component-border);border-radius:var(--r-popover);background:var(--dialog-surface);color:var(--text-primary);box-shadow:var(--shadow-popover);display:flex;flex-direction:column;gap:12px;overflow:hidden;}.cell-style-body{display:flex;flex-direction:column;gap:12px;overflow:auto;min-height:0;scrollbar-gutter:stable}.cell-style-editor header,.cell-style-editor footer{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-shrink:0}.cell-style-editor strong{font-size:var(--ui-label)}.cell-style-row{display:flex;gap:4px;align-items:center;flex-wrap:wrap}.cell-style-row :global(.property-choice){flex:1;min-width:0}.cell-style-row :global(.ui-button),header :global(button){min-width:36px;min-height:36px;padding:8px}.cell-style-row :global([aria-pressed=true]){background:var(--state-selected);color:var(--text-link)}.separator{width:1px;background:var(--component-border);margin:6px 4px}.cell-layout summary{cursor:pointer;font-size:var(--ui-label);min-height:36px;box-sizing:border-box;padding-block:8px}.cell-layout>div{display:flex;flex-direction:column;gap:12px;padding-top:8px}.inset-fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}.cell-layout select{max-width:100%;min-width:0}footer{padding-top:4px}@media(pointer:coarse),(max-width:760px){.cell-style-row :global(.ui-button),header :global(button),footer :global(button),.cell-style-row{gap:0}.cell-style-row :global(.ui-button),header :global(button),footer :global(button),.cell-layout summary,.cell-layout select,.cell-layout :global(button){min-width:44px;min-height:44px}.cell-style-row :global(.property-choice){flex-basis:132px}.inset-fields{grid-template-columns:minmax(0,1fr)}.cell-style-editor :global(.number-field input[type='number']){min-height:44px}.separator{margin-inline:3px}}
</style>
