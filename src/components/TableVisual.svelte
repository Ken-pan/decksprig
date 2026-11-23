<script lang="ts">
  import {tablePresentation,tableCellStyle,tableCellSpan,tableCellRuns,tableRunStyle} from '../core/table-rendering';
  import {fontStack} from '../core/font-stack';
  import type {Deck,SlideElement} from '../core/model';
  import type {DesignSystem} from '../core/design-system-schema';
  import {nativeTableImage} from '../core/native-table-layout';
  let {element,system,onlineFonts,style='',editable=false,managed=false,activeCell,selection,tabTarget,oncell}:{element:SlideElement;system?:DesignSystem;onlineFonts?:Deck['onlineFonts'];style?:string;editable?:boolean;managed?:boolean;activeCell?:{row:number;column:number};selection?:{top:number;bottom:number;left:number;right:number};tabTarget?:{row:number;column:number};oncell?:(row:number,column:number,node:HTMLElement)=>void}=$props();
  const p=$derived(tablePresentation(element,system)),rows=$derived(element.cells??[]);
  const nativeImage=$derived(nativeTableImage(element));
  let focusedCell=$state({row:0,column:0});
  const tabCell=$derived({row:Math.min(rows.length-1,tabTarget?.row??activeCell?.row??focusedCell.row),column:Math.min(p.widths.length-1,tabTarget?.column??activeCell?.column??focusedCell.column)});
  function selected(row:number,column:number){return Boolean(editable&&selection&&row>=selection.top&&row<=selection.bottom&&column>=selection.left&&column<=selection.right);}
  const categories=$derived(new Map(onlineFonts?.map(font=>[font.family,font.category])));
  const stack=(family:string)=>fontStack(family,categories.get(family));
  function css(row:number,column:number){const cell=tableCellStyle(p,row,column);cell.fontFamily=stack(cell.fontFamily);if(p.cellStyleIndex.get(`${row}:${column}`)?.runs)cell.textDecoration='none';return Object.entries(cell).map(([key,value])=>key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+':'+value).join(';')+`;--table-cell-ink:${cell.color};--table-cell-fill:${cell.background}`;}
  function key(event:KeyboardEvent,row:number,column:number){
    if(!editable||managed||event.isComposing||event.altKey)return;
    if(event.key==='Home'||event.key==='End'){
      event.preventDefault();event.stopPropagation();
      const r=event.metaKey||event.ctrlKey?(event.key==='Home'?0:rows.length-1):row,c=event.key==='Home'?0:p.widths.length-1;
      (event.currentTarget as HTMLElement).closest('table')?.querySelector<HTMLElement>(`[data-table-row="${r}"][data-table-column="${c}"]`)?.focus();return;
    }
    if(event.metaKey||event.ctrlKey)return;
    if(event.key==='Enter'||event.key==='F2'){event.preventDefault();event.stopPropagation();oncell?.(row,column,event.currentTarget as HTMLElement);return;}
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    const r=Math.max(0,Math.min(rows.length-1,row+(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0))),c=Math.max(0,Math.min(p.widths.length-1,column+(event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0)));
    (event.currentTarget as HTMLElement).closest('table')?.querySelector<HTMLElement>(`[data-table-row="${r}"][data-table-column="${c}"]`)?.focus();
  }
</script>
{#if nativeImage}<img class="native-table" src={nativeImage} alt="" draggable="false"/>{/if}
<table class="slide-table" class:native-cells={Boolean(nativeImage)} class:cell-editable={editable} style={style} role={editable?'grid':undefined} aria-multiselectable={managed?true:undefined} aria-label={editable?`${element.name||'Table'} · Editable cells`:undefined}>
  <colgroup>{#each p.widths as width}<col style:width={`${width*100}%`}/>{/each}</colgroup>
  <tbody>{#each rows as row,i}<tr style:height={p.heights?`${p.heights[i]*100}%`:undefined}>{#each Array.from({length:p.widths.length},(_,j)=>j) as j}{@const span=tableCellSpan(p,i,j)}{#if !span.covered}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions a11y_no_static_element_interactions -->
    <svelte:element this={p.headerRow&&i===0?'th':'td'} role={p.headerRow&&i===0?'columnheader':editable?'gridcell':'cell'} scope={p.headerRow&&i===0?'col':undefined} rowspan={span.rowSpan} colspan={span.columnSpan} aria-rowindex={editable?i+1:undefined} aria-colindex={editable?j+1:undefined} style={css(i,j)} data-table-row={i} data-table-column={j} aria-selected={managed?selected(i,j):undefined} class:selected-cell={selected(i,j)} class:current-cell={managed&&selected(i,j)&&i===tabCell.row&&j===tabCell.column} class:active-cell={editable&&activeCell?.row===i&&activeCell?.column===j} tabindex={editable?(i===tabCell.row&&j===tabCell.column?0:-1):undefined} onfocus={()=>{if(editable)focusedCell={row:i,column:j};}} onkeydown={event=>key(event,i,j)} ondblclick={event=>{if(editable&&!managed){event.stopPropagation();oncell?.(i,j,event.currentTarget as HTMLElement);}}}>{#if p.cellStyleIndex.get(`${i}:${j}`)?.runs}{#each tableCellRuns(p,i,j,row[j]??'') as run}<span style={Object.entries(tableRunStyle(run,tableCellStyle(p,i,j),stack)).map(([key,value])=>key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+':'+value).join(';')}>{run.text}</span>{/each}{:else}{row[j]??''}{/if}</svelte:element>
  {/if}{/each}</tr>{/each}</tbody>
</table>
<style>
  .native-table{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.native-cells{position:relative}.native-cells th,.native-cells td{color:transparent!important;background-color:transparent!important;border-color:transparent!important}
  .slide-table{width:100%;height:100%;border-collapse:collapse;table-layout:fixed;white-space:pre-wrap;font-variant-numeric:tabular-nums}.slide-table th,.slide-table td{overflow-wrap:anywhere}
  .cell-editable .active-cell,.cell-editable :focus-visible{outline:calc(2px / var(--canvas-scale,1)) solid var(--canvas-selection);outline-offset:calc(-2px / var(--canvas-scale,1))}
  .cell-editable .selected-cell{background-image:linear-gradient(color-mix(in srgb,var(--canvas-selection) 14%,transparent),color-mix(in srgb,var(--canvas-selection) 14%,transparent))!important;outline:calc(1px / var(--canvas-scale,1)) solid color-mix(in srgb,var(--canvas-selection) 45%,transparent);outline-offset:calc(-1px / var(--canvas-scale,1))}
  .cell-editable .current-cell{outline:calc(2px / var(--canvas-scale,1)) solid var(--canvas-selection);outline-offset:calc(-2px / var(--canvas-scale,1))}
  @media(hover:hover) and (pointer:fine){.cell-editable th:hover,.cell-editable td:hover{outline:calc(1px / var(--canvas-scale,1)) solid color-mix(in srgb,var(--canvas-selection) 55%,transparent);outline-offset:calc(-1px / var(--canvas-scale,1))}}
</style>
