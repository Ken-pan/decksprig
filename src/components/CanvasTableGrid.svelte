<script lang="ts">
  import {onMount,tick,untrack} from 'svelte';
  import TableVisual from './TableVisual.svelte';
  import {tablePresentation,tableCellStyle} from '../core/table-rendering';
  import {Button} from './ui';
  import CanvasTableManipulation from './CanvasTableManipulation.svelte';
  import CanvasTableContextMenu from './CanvasTableContextMenu.svelte';
  import CanvasTableMergeReview from './CanvasTableMergeReview.svelte';
  import {autofillTableRange,reorderTableAxis,tableAxisBlock} from '../core/table-manipulation';
  import {styleTableRange} from '../core/table-structure';
  import {deleteTableSelection,tableTabNavigation} from '../core/table-keyboard';
  import {createBlankTableWithStyle} from '../core/table-creation';
  import {prepareMergedTableCopy,type TableMergeCopyReview} from '../core/table-merge-copy';
  import {objectAction} from '../editor-focus';
  import {loadFeature} from '../features';
  import CanvasTableStyleEditor from './CanvasTableStyleEditor.svelte';
  import {Expand,Move,Check,Eraser,Ellipsis,Paintbrush,Copy,ClipboardPaste,TextCursorInput,ArrowDownToLine,ArrowRightToLine,TableRowsSplit,TableColumnsSplit,TableCellsMerge,TableCellsSplit,Trash2} from '@lucide/svelte';
  import {editor} from '../core/editor.svelte';
  import {cellBounds,cellInRange,selectedCells,cellsTsv,clearCellRange,type Cell,type CellRange} from '../core/table-grid';
  import {changeTableAxis,mergeTableRange,expandMergedRange,cellOwner,cellMerge,pasteTableRange} from '../core/table-structure';
  import type {SlideElement} from '../core/model';
  import type {DesignSystem} from '../core/design-system-schema';
  import {floatingPlacement,visualBounds} from '../ui-viewport';
  import {holdPointerCursor} from '../pointer-cursor';
  let {element,system,style='',scale=1,activeCell,oncell,onmove,onselection,onrange}:{element:SlideElement;system?:DesignSystem;style?:string;scale?:number;activeCell?:Cell;oncell:(row:number,column:number,initialValue?:string)=>void;onmove:(event:PointerEvent)=>void;onselection?:(active:boolean)=>void;onrange?:(range:CellRange|undefined,moving:boolean,resizing:boolean)=>void}=$props();
  let movingTable=$state(false),resizingTable=$state(false),axisSelection=$state<'row'|'column'>();
  let mergeReview=$state.raw<TableMergeCopyReview>();
  let draft=$state<SlideElement|null>(null),menuAnchor=$state<HTMLElement>(),menuAxis=$state<'row'|'column'>();
  let root=$state<HTMLDivElement>(),tools=$state<HTMLDivElement>(),range=$state<CellRange>(),extend=$state(false),status=$state(''),busy=$state(false),tabTarget=$state<Cell>({row:0,column:0}),styleOpen=$state(false),styleTrigger=$state<HTMLButtonElement>();
  type Drag={id:number;before:CellRange|undefined;beforeAxis:'row'|'column'|undefined;anchor:Cell;node:HTMLElement;revision:number;deckId:string;slideId:string;touch:boolean;x:number;y:number;moved:boolean};
  let drag=$state<Drag|null>(null),release:(()=>void)|undefined,frame=0,clipboardSequence=0;
  let pointerCell:Cell|undefined,previousPointerCell:Cell|undefined,pointerType='',lastTap:{cell:Cell;time:number}|undefined,touchEdit:Cell|undefined,editTimer=0;
  let menuTimer=0,releaseMenu:(()=>void)|undefined;
  function openMenu(axis:'row'|'column'|undefined,anchor:HTMLElement,event?:MouseEvent){lastTap=undefined;touchEdit=undefined;clearTimeout(editTimer);releaseMenu?.();menuAxis=axis;const show=()=>{releaseMenu?.();menuAnchor=anchor;};if(event?.buttons){releaseMenu=()=>{clearTimeout(menuTimer);document.removeEventListener('pointerup',show,true);releaseMenu=undefined;};document.addEventListener('pointerup',show,{capture:true,once:true});menuTimer=window.setTimeout(show,350);}else show();}
  function cancelClipboard(){clipboardSequence++;busy=false;}
  const columns=$derived(Math.max(1,...(element.cells??[]).map(r=>r.length))),rows=$derived(element.cells?.length??0),bounds=$derived(range?cellBounds(range):undefined);
  const label=$derived(bounds?`${String.fromCharCode(65+bounds.left)}${bounds.top+1}${bounds.top===bounds.bottom&&bounds.left===bounds.right?'':`:${String.fromCharCode(65+bounds.right)}${bounds.bottom+1}`}`:'');
  function cell(node:EventTarget|null):Cell|undefined{if(!(node instanceof Element))return;const n=node.closest<HTMLElement>('[data-table-row]');return n&&root?.contains(n)?{row:Number(n.dataset.tableRow),column:Number(n.dataset.tableColumn)}:undefined;}
  function node(c:Cell){c=cellOwner(element.tableStyle,c);return root?.querySelector<HTMLElement>(`[data-table-row="${c.row}"][data-table-column="${c.column}"]`)??undefined;}
  function clamp(c:Cell):Cell{return {row:Math.max(0,Math.min(rows-1,c.row)),column:Math.max(0,Math.min(columns-1,c.column))};}
  async function select(c:Cell,expand=false,focus=true){cancelClipboard();axisSelection=undefined;const head=clamp(c);range=expandMergedRange(element.tableStyle,{anchor:expand&&range?range.anchor:head,head});tabTarget=cellOwner(element.tableStyle,head);styleOpen=false;status='';await tick();if(focus)node(head)?.focus({preventScroll:true});schedule();}
  function finishCells(){movingTable=false;resizingTable=false;cancelClipboard();clear(true);range=undefined;axisSelection=undefined;extend=false;styleOpen=false;menuAnchor=undefined;status='';root?.closest<HTMLElement>('[data-element-id]')?.focus({preventScroll:true});}
  function editCell(c=tabTarget,initialValue?:string){lastTap=undefined;touchEdit=undefined;extend=false;oncell(c.row,c.column,initialValue);}
  function selectAxis(axis:'row'|'column'){cancelClipboard();axisSelection=axis;const c=tabTarget;range=expandMergedRange(element.tableStyle,{anchor:{row:axis==='row'?c.row:0,column:axis==='column'?c.column:0},head:{row:axis==='row'?c.row:rows-1,column:axis==='column'?c.column:columns-1}});styleOpen=false;status='';void tick().then(()=>node(c)?.focus({preventScroll:true}));schedule();}
  function clearCells(){if(!range)return;cancelClipboard();if(applyPatch(deleteTableSelection(live(),range)))status='Cleared cells · Undo available';}
  function newBlankTable(){cancelClipboard();void objectAction(()=>{const id=createBlankTableWithStyle(editor,element.id);if(id)range=undefined;else status=editor.error;});}
  function reviewMergedCopy(){if(!range||!editor.deck||!editor.slide)return;cancelClipboard();try{mergeReview=prepareMergedTableCopy(editor.deck,editor.slide.id,element.id,range);}catch(e){status=e instanceof Error?e.message:'Select the cells to merge again.';}}
  function valid(g:Drag){return editor.deck?.id===g.deckId&&editor.slide?.id===g.slideId&&editor.deck?.revision===g.revision&&!element.locked;}
  function clear(cancel=false){const g=drag;if(cancel){lastTap=undefined;touchEdit=undefined;clearTimeout(editTimer);}drag=null;release?.();release=undefined;if(cancel&&g){range=g.before;axisSelection=g.beforeAxis;tabTarget=g.before?.head??g.anchor;}if(g?.node.hasPointerCapture(g.id))g.node.releasePointerCapture(g.id);}
  function down(e:PointerEvent){if(!e.isPrimary)return;if(resizingTable){e.preventDefault();e.stopPropagation();return;}if(movingTable&&e.button===0){e.preventDefault();e.stopPropagation();onmove(e);return;}const c=cell(e.target);if(!c||e.button!==0||element.locked)return;e.preventDefault();e.stopPropagation();if(drag){clear(true);return;}touchEdit=undefined;clearTimeout(editTimer);previousPointerCell=pointerCell;pointerCell=c;pointerType=e.pointerType;if(pointerType!=='touch')lastTap=undefined;const before=range,beforeAxis=axisSelection;void select(c,e.shiftKey||extend);drag={id:e.pointerId,before,beforeAxis,anchor:range&&(e.shiftKey||extend)?range.anchor:c,node:root!,revision:editor.deck!.revision,deckId:editor.deck!.id,slideId:editor.slide!.id,touch:e.pointerType==='touch'&&!e.shiftKey&&!extend,x:e.clientX,y:e.clientY,moved:false};root!.setPointerCapture(e.pointerId);release=holdPointerCursor('cell');}
  function move(e:PointerEvent){const g=drag;if(!g||g.id!==e.pointerId)return;e.preventDefault();e.stopPropagation();if(!valid(g)){lastTap=undefined;clear();return;}if(Math.hypot(e.clientX-g.x,e.clientY-g.y)>=8)g.moved=true;const c=cell(document.elementFromPoint(e.clientX,e.clientY));if(c){range=expandMergedRange(element.tableStyle,{anchor:g.anchor,head:c});tabTarget=c;schedule();}}
  function up(e:PointerEvent){const g=drag;if(!g||g.id!==e.pointerId)return;e.preventDefault();e.stopPropagation();const tap=g.touch&&!g.moved,edit=tap&&lastTap&&e.timeStamp-lastTap.time<450&&lastTap.cell.row===g.anchor.row&&lastTap.cell.column===g.anchor.column;lastTap=tap&&!edit?{cell:g.anchor,time:e.timeStamp}:undefined;touchEdit=edit?g.anchor:undefined;clear();void tick().then(()=>node(tabTarget)?.focus({preventScroll:true}));}
  function click(e:MouseEvent){const c=touchEdit;if(!c)return;touchEdit=undefined;e.preventDefault();e.stopPropagation();clearTimeout(editTimer);editTimer=window.setTimeout(()=>editCell(c),0);}
  function live(){return editor.slide?.elements.find(e=>e.id===element.id)??element;}
  function applyPatch(patch:Partial<SlideElement>,revision=editor.deck!.revision,merge=''){
    const current=live();if(current.locked)return false;if(Object.entries(patch).every(([key,value])=>JSON.stringify(value)===JSON.stringify(current[key as keyof SlideElement])))return true;
    const before=editor.deck!.revision;editor.commit([{op:'update_element',slideId:editor.slide!.id,elementId:element.id,patch}],merge,'manual',revision);if(editor.deck!.revision===before){status=editor.error;return false;}return true;
  }
  function apply(cells:string[][],revision=editor.deck!.revision){return applyPatch({cells},revision);}
  function structure(axis:'row'|'column',insert:boolean,after=false){if(!range)return;try{cancelClipboard();const b=cellBounds(range),index=axis==='row'?(after?b.bottom+1:b.top):(after?b.right+1:b.left),count=insert?1:axis==='row'?b.bottom-b.top+1:b.right-b.left+1;if(applyPatch(insert?changeTableAxis(live(),axis,index,count,true):deleteTableSelection(live(),range,axis))){const c={row:axis==='row'?Math.min(index,rows+(insert?1:-count)-1):b.top,column:axis==='column'?Math.min(index,columns+(insert?1:-count)-1):b.left};void tick().then(async()=>{await select(c);status=`${insert?'Added':'Deleted'} ${count===1?axis:axis+'s'} · Undo available`;});}}catch(error){status=(error as Error).message;}}
  function mergeCells(split=false){if(!range)return;try{cancelClipboard();if(applyPatch(mergeTableRange(live(),range,split,system))){tabTarget={row:bounds!.top,column:bounds!.left};status=split?'Split cells · Original values restored':'Merged cells · Other values return when split';void tick().then(()=>node(tabTarget)?.focus());}}catch(error){status=(error as Error).message;}}
  function fillSelection(axis:'row'|'column'){if(!range||!bounds)return;const b=bounds,source={anchor:{row:b.top,column:b.left},head:{row:axis==='row'?b.top:b.bottom,column:axis==='column'?b.left:b.right}};try{if(applyPatch(autofillTableRange(live(),source,range,true)))status='Filled cells · Undo available';}catch(e){status=(e as Error).message;}}
  function moveAxis(axis:'row'|'column',forward:boolean){
    if(!range)return;cancelClipboard();
    try{const e=live(),b=cellBounds(range),block=tableAxisBlock(e,axis,axis==='row'?b.top:b.left,axis==='row'?b.bottom:b.right),length=axis==='row'?rows:columns,neighbor=forward?block.end+1:block.start-1,header=axis==='row'&&tablePresentation(e,system).headerRow;
      if(neighbor<0||neighbor>=length||header&&(block.start===0||neighbor===0))return;
      const adjacent=tableAxisBlock(e,axis,neighbor),result=reorderTableAxis(e,axis,block.start,block.end,forward?adjacent.end+1:adjacent.start);
      if(applyPatch({cells:result.cells,tableStyle:result.tableStyle})){axisSelection=axis;range={anchor:{row:axis==='row'?result.start:0,column:axis==='column'?result.start:0},head:{row:axis==='row'?result.start+result.count-1:rows-1,column:axis==='column'?result.start+result.count-1:columns-1}};tabTarget=cellOwner(result.tableStyle,range.anchor);status=`Moved ${axis==='row'?'rows':'columns'} · Undo available`;void tick().then(()=>node(tabTarget)?.focus({preventScroll:true}));}
    }catch(error){status=(error as Error).message;}
  }
  const actions=$derived([
    {label:'Move table',icon:Move,onselect:()=>{movingTable=true;styleOpen=false;status='';}},
    {label:'Resize table',icon:Expand,onselect:()=>{resizingTable=true;styleOpen=false;status='';}},
    {label:'New blank table with this style',icon:Copy,onselect:newBlankTable},
    ...(element.nativeTableLayout?[{label:'Review merged editable copy',icon:TableCellsMerge,disabled:!bounds||bounds.left===bounds.right&&bounds.top===bounds.bottom,onselect:reviewMergedCopy}]:[]),
    {label:'Copy',icon:Copy,shortcut:'⌘/Ctrl+C',onselect:()=>copy()},
    {label:'Paste',icon:ClipboardPaste,shortcut:'⌘/Ctrl+V',disabled:busy,onselect:()=>void clipboard()},
    {label:'Edit cell',icon:TextCursorInput,shortcut:'Enter',onselect:()=>editCell()},
    {label:'Select row',icon:TableRowsSplit,onselect:()=>selectAxis('row')},
    {label:'Select column',icon:TableColumnsSplit,onselect:()=>selectAxis('column')},
    ...(bounds&&bounds.left===0&&bounds.right===columns-1?[{label:'Move rows up',icon:TableRowsSplit,disabled:bounds.top<=(tablePresentation(live(),system).headerRow?1:0),onselect:()=>moveAxis('row',false)},{label:'Move rows down',icon:TableRowsSplit,disabled:bounds.bottom>=rows-1||bounds.top===0&&tablePresentation(live(),system).headerRow,onselect:()=>moveAxis('row',true)}]:[]),
    ...(bounds&&bounds.top===0&&bounds.bottom===rows-1?[{label:'Move columns left',icon:TableColumnsSplit,disabled:bounds.left<=0,onselect:()=>moveAxis('column',false)},{label:'Move columns right',icon:TableColumnsSplit,disabled:bounds.right>=columns-1,onselect:()=>moveAxis('column',true)}]:[]),
    {label:'Clear cells',icon:Eraser,onselect:clearCells},
    {label:'Fill down',icon:ArrowDownToLine,shortcut:'⌘/Ctrl+D',disabled:!bounds||bounds.top===bounds.bottom,onselect:()=>fillSelection('row')},
    {label:'Fill right',icon:ArrowRightToLine,shortcut:'⌘/Ctrl+R',disabled:!bounds||bounds.left===bounds.right,onselect:()=>fillSelection('column')},
    {label:'Insert row above',icon:TableRowsSplit,disabled:rows>=100,onselect:()=>structure('row',true)},
    {label:'Insert row below',icon:TableRowsSplit,disabled:rows>=100,onselect:()=>structure('row',true,true)},
    {label:'Insert column left',icon:TableColumnsSplit,disabled:columns>=20,onselect:()=>structure('column',true)},
    {label:'Insert column right',icon:TableColumnsSplit,disabled:columns>=20,onselect:()=>structure('column',true,true)},
    {label:'Merge cells',icon:TableCellsMerge,divider:true,disabled:!bounds||bounds.top===bounds.bottom&&bounds.left===bounds.right,onselect:()=>mergeCells()},
    {label:'Split cells',icon:TableCellsSplit,disabled:!range||!live().tableStyle?.merges?.some(m=>{const b=cellBounds(range!);return m.row<=b.bottom&&m.row+m.rowSpan-1>=b.top&&m.column<=b.right&&m.column+m.columnSpan-1>=b.left;}),onselect:()=>mergeCells(true)},
    {label:'Delete selected rows',icon:Trash2,divider:true,tone:'danger' as const,disabled:!bounds||bounds.bottom-bounds.top+1>=rows,onselect:()=>structure('row',false)},
    {label:'Delete selected columns',icon:Trash2,tone:'danger' as const,disabled:!bounds||bounds.right-bounds.left+1>=columns,onselect:()=>structure('column',false)}
  ]);
  function pasteText(text:string,revision=editor.deck!.revision){if(!range)return;try{const b=cellBounds(range),result=pasteTableRange(live(),text,range);if(applyPatch({cells:result.cells,tableStyle:result.tableStyle},revision)){axisSelection=undefined;range={anchor:{row:b.top,column:b.left},head:{row:b.top+result.rows-1,column:b.left+result.columns-1}};tabTarget=range.head;status=`Pasted ${result.rows} × ${result.columns} · Undo available`;void tick().then(()=>node(tabTarget)?.focus({preventScroll:true}));}}catch(error){status=(error as Error).message;}}
  async function pasteData(text:string,html:string,captured:{revision:number;id:string;slide:string;element:string;range:CellRange},token:number){
    try{
      const parser=html?await import('../core/html-clipboard-reader'):undefined;
      const rich=await parser?.prepareHtmlClipboard(html),helpers=rich?await import('../core/html-table-paste'):undefined;
      if(token!==clipboardSequence)return;
      if(activeCell||element.locked||editor.deck?.id!==captured.id||editor.slide?.id!==captured.slide||editor.deck?.revision!==captured.revision||element.id!==captured.element||JSON.stringify(range)!==JSON.stringify(captured.range))throw Error('The selection changed. Paste the cells again.');
      if(!rich||!helpers){pasteText(text,captured.revision);return;}
      const b=cellBounds(captured.range),result=helpers.pasteHtmlTable(live(),helpers.htmlTableSource(rich),captured.range,system);
      if(applyPatch({cells:result.cells,tableStyle:result.tableStyle},captured.revision)){axisSelection=undefined;range={anchor:{row:b.top,column:b.left},head:{row:b.top+result.rows-1,column:b.left+result.columns-1}};tabTarget=cellOwner(result.tableStyle,range.head);status=`Pasted ${result.rows} × ${result.columns} · Undo available`;void tick().then(()=>node(tabTarget)?.focus({preventScroll:true}));}
    }catch(error){if(token===clipboardSequence)status=(error as Error).message;}finally{if(token===clipboardSequence)busy=false;}
  }
  function pasteTarget(){return {revision:editor.deck!.revision,id:editor.deck!.id,slide:editor.slide!.id,element:element.id,range:structuredClone($state.snapshot(range!))};}
  function copy(e?:ClipboardEvent,cut=false){if(!range)return;const values=selectedCells(element.cells??[],range),text=cellsTsv(values);if(e?.clipboardData){e.preventDefault();e.stopPropagation();e.clipboardData.setData('text/plain',text);if(cut)apply(clearCellRange(element.cells??[],range));status=cut?'Cells cut · Undo available':'Cells copied';return;}void clipboard(cut,text);}
  async function clipboard(cut=false,text?:string){if(!range||busy)return;const token=++clipboardSequence,captured=pasteTarget();busy=true;node(tabTarget)?.focus({preventScroll:true});try{if(text!==undefined){await navigator.clipboard.writeText(text);if(token!==clipboardSequence)return;if(cut){if(editor.deck?.id!==captured.id||editor.slide?.id!==captured.slide||editor.deck?.revision!==captured.revision)throw Error('The table changed. Copy the cells again.');apply(clearCellRange(element.cells??[],captured.range),captured.revision);}status=cut?'Cells cut · Undo available':'Cells copied';}else{let value='',html='';if(navigator.clipboard.read){const items=await navigator.clipboard.read();for(const item of items){if(item.types.includes('text/html'))html=await (await item.getType('text/html')).text();if(item.types.includes('text/plain'))value=await (await item.getType('text/plain')).text();if(html||value)break;}}else value=await navigator.clipboard.readText();await pasteData(value,html,captured,token);}}catch(error){status=(error as Error).name==='NotAllowedError'?'Clipboard access is unavailable. Use ⌘/Ctrl+C or V.':(error as Error).message;}finally{if(token===clipboardSequence)busy=false;}}
  function paste(e:ClipboardEvent){if(!range||e.target instanceof Element&&e.target.closest('input,textarea,select'))return;e.preventDefault();e.stopPropagation();const text=e.clipboardData?.getData('text/plain')??'',html=e.clipboardData?.getData('text/html')??'';if(!html){cancelClipboard();pasteText(text);return;}const captured=pasteTarget(),token=++clipboardSequence;busy=true;void pasteData(text,html,captured,token);}
  function key(e:KeyboardEvent){if(movingTable||resizingTable){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();movingTable=false;resizingTable=false;}return;}const target=e.target instanceof Element?e.target:undefined,c=cell(e.target)??(target?.closest('[data-axis],.fill-handle')&&range?cellOwner(element.tableStyle,range.anchor):undefined);if(!c||e.defaultPrevented||e.isComposing||e.keyCode===229)return;const cmd=e.metaKey||e.ctrlKey;
    if(e.key==='Escape'){cancelClipboard();e.preventDefault();e.stopPropagation();if(drag)clear(true);else finishCells();return;}
    if(cmd&&['c','x','v'].includes(e.key.toLowerCase()))return;
    if(cmd&&(e.key.toLowerCase()==='z'||e.key.toLowerCase()==='y')){cancelClipboard();e.preventDefault();e.stopPropagation();e.shiftKey||e.key.toLowerCase()==='y'?editor.redo():editor.undo();return;}
    if(cmd&&['d','r'].includes(e.key.toLowerCase())){e.preventDefault();e.stopPropagation();fillSelection(e.key.toLowerCase()==='d'?'row':'column');return;}
    if(cmd&&e.key.toLowerCase()==='b'&&range){e.preventDefault();e.stopPropagation();const p=tablePresentation(live(),system),b=cellBounds(range);let bold=true;for(let r=b.top;r<=b.bottom;r++)for(let c=b.left;c<=b.right;c++)bold&&=Number(tableCellStyle(p,r,c).fontWeight)>=600;applyPatch(styleTableRange(live(),range,{fontWeight:bold?400:600},system));return;}
    if(cmd&&e.key.toLowerCase()==='a'){e.preventDefault();e.stopPropagation();axisSelection=undefined;range={anchor:{row:0,column:0},head:{row:rows-1,column:columns-1}};schedule();return;}
    if(e.key===' '&&(e.shiftKey||cmd)){e.preventDefault();e.stopPropagation();axisSelection=cmd&&e.shiftKey?undefined:cmd?'column':'row';range=expandMergedRange(element.tableStyle,{anchor:{row:cmd?0:c.row,column:e.shiftKey?0:c.column},head:{row:cmd?rows-1:c.row,column:e.shiftKey?columns-1:c.column}});schedule();return;}
    if(cmd&&['Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();void select({row:e.key==='Home'?0:rows-1,column:e.key==='Home'?0:columns-1},e.shiftKey);return;}
    if(!cmd&&!e.altKey&&(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10')){e.preventDefault();e.stopPropagation();openMenu(undefined,node(c)??root!);return;}
    if(cmd||e.altKey)return;
    if(['Enter','F2'].includes(e.key)){e.preventDefault();e.stopPropagation();editCell(c);return;}
    if(e.key.length===1&&!cmd&&!e.altKey){e.preventDefault();e.stopPropagation();editCell(c,e.key);return;}
    if(['Delete','Backspace'].includes(e.key)&&range){e.preventDefault();e.stopPropagation();if(axisSelection)structure(axisSelection,false);else clearCells();return;}
    if(e.key==='Tab'){const next=tableTabNavigation(live(),c,e.shiftKey);if(next.kind==='edge')return;e.preventDefault();e.stopPropagation();if(next.kind==='limit'){status='Use up to 100 rows.';node(next.cell)?.focus({preventScroll:true});}else if(next.kind==='move')void select(next.cell);else if(applyPatch(next.patch))void tick().then(()=>select(next.cell)).then(()=>status='Added row · Undo available');return;}
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();const m=cellMerge(element.tableStyle,c.row,c.column);void select({row:c.row+(e.key==='ArrowDown'?(m?.rowSpan??1):e.key==='ArrowUp'?-1:0),column:e.key==='Home'?0:e.key==='End'?columns-1:c.column+(e.key==='ArrowRight'?(m?.columnSpan??1):e.key==='ArrowLeft'?-1:0)},e.shiftKey);}
  }
  function position(){
    if(!root||!tools)return;
    const slot=range&&matchMedia('(max-width:760px)').matches?root.closest('.stage-column')?.querySelector<HTMLElement>('.canvas-dock-slot'):undefined,parent=slot??document.body;
    if(tools.parentElement!==parent){const focused=tools.contains(document.activeElement)?document.activeElement as HTMLElement:undefined;parent.append(tools);focused?.focus({preventScroll:true});}
    if(slot){tools.dataset.uiPlacement='dock';tools.style.removeProperty('left');tools.style.removeProperty('top');tools.style.maxWidth='100%';tools.style.maxHeight='none';return;}
    if(!range){delete tools.dataset.uiPlacement;return;}
    const r=root.getBoundingClientRect(),coarse=matchMedia('(pointer:coarse)').matches,stage=root.closest('.canvas-stage')?.getBoundingClientRect(),dock=document.querySelector('.canvas-insert-dock')?.getBoundingClientRect(),v=visualBounds();
    const left=Math.max(v.left,stage?.left??v.left),top=Math.max(v.top,stage?.top??v.top),right=Math.min(v.left+v.width,stage?.right??v.left+v.width),bottom=Math.min(v.top+v.height,stage?.bottom??v.top+v.height,dock&&dock.width>0&&dock.height>0?dock.top-8:Infinity);
    const viewport={left,top,width:Math.max(1,right-left),height:Math.max(1,bottom-top)},offset=coarse?52:element.tableStyle?.merges?.some(m=>m.columnSpan>1)?28:0,anchor={left:r.left,right:r.right,top:r.top,bottom:r.bottom+offset};
    tools.style.maxWidth=`${Math.max(1,viewport.width-24)}px`;
    const place=()=>floatingPlacement(anchor,{width:tools!.offsetWidth,height:tools!.offsetHeight},viewport,{preferredHeight:tools!.scrollHeight,minHeight:44});
    tools.style.maxHeight=`${place().maxHeight}px`;const result=place();tools.style.left=`${result.left}px`;tools.style.top=`${result.top}px`;tools.dataset.uiPlacement=result.placement;
  }
  function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(position);}
  function portal(n:HTMLElement){document.body.append(n);return {destroy(){n.remove();}};}
  $effect(()=>{scale;element;range;activeCell;onselection?.(Boolean(range||activeCell));void tick().then(schedule);if(drag&&!valid(drag))clear();if(range&&(range.head.row>=rows||range.head.column>=columns||range.anchor.row>=rows||range.anchor.column>=columns)){range={anchor:clamp(range.anchor),head:clamp(range.head)};tabTarget=range.head;}if(range){const expanded=expandMergedRange(element.tableStyle,range);if(JSON.stringify(expanded)!==JSON.stringify(range))range=expanded;const owner=cellOwner(element.tableStyle,clamp(tabTarget));if(owner.row!==tabTarget.row||owner.column!==tabTarget.column)tabTarget=owner;}});
  $effect(()=>{const selection=range,moving=movingTable,resizing=resizingTable;untrack(()=>onrange?.(selection,moving,resizing));});
  onMount(()=>{const unrelatedPointer=(event:PointerEvent)=>{if(event.isPrimary&&event.target instanceof Element&&root?.contains(event.target)&&!event.target.closest('.table-manipulation'))return;lastTap=undefined;touchEdit=undefined;clearTimeout(editTimer);};document.addEventListener('pointerdown',unrelatedPointer,true);void loadFeature('table-cell').catch(()=>{});const observe=new ResizeObserver(schedule);if(root)observe.observe(root);if(tools)observe.observe(tools);window.addEventListener('resize',schedule);document.addEventListener('scroll',schedule,true);const cancel=()=>clear(true);window.addEventListener('blur',cancel);return()=>{document.removeEventListener('pointerdown',unrelatedPointer,true);onselection?.(false);onrange?.(undefined,false,false);releaseMenu?.();cancelClipboard();clear();observe.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);document.removeEventListener('scroll',schedule,true);window.removeEventListener('blur',cancel);};});
</script>
<!-- The managed table grid owns cell pointer and clipboard operations. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={root} class="canvas-cell-grid" class:table-moving={movingTable} onpointerdown={down} onpointermove={move} onpointerup={up} onclick={click} onpointercancel={()=>clear(true)} onlostpointercapture={()=>{if(drag)clear(true);}} onkeydown={key} oncopy={e=>copy(e)} oncut={e=>copy(e,true)} onpaste={paste} ondblclick={e=>{e.preventDefault();e.stopPropagation();if(movingTable||resizingTable)return;if(pointerType==="touch"&&previousPointerCell)return;const c=cell(e.target)??pointerCell;if(c&&pointerCell&&c.row===pointerCell.row&&c.column===pointerCell.column&&(!previousPointerCell||previousPointerCell.row===c.row&&previousPointerCell.column===c.column)){lastTap=undefined;editCell(c);}}} oncontextmenu={e=>{const c=cell(e.target);if(c){e.preventDefault();e.stopPropagation();if(!cellInRange(range,c.row,c.column))void select(c);openMenu(undefined,node(c)??root!,e);}}} onfocusin={e=>{const c=cell(e.target);if(c){tabTarget=c;if(!cellInRange(range,c.row,c.column))void select(c,false,false);}}}>
  <TableVisual onlineFonts={editor.deck?.onlineFonts} element={draft??element} {system} {style} editable managed {activeCell} {tabTarget} selection={bounds} oncell={(row,column)=>editCell({row,column})}/>
{#if root&&!activeCell&&!movingTable&&!resizingTable}<CanvasTableManipulation {element} {root} {range} onrange={(next,axis)=>{cancelClipboard();axisSelection=axis;range=next;tabTarget=cellOwner(element.tableStyle,next.anchor);styleOpen=false;schedule();}} onapply={applyPatch} onstatus={value=>status=value} onpreview={value=>draft=value} onmenu={openMenu} {scale}/>{/if}
</div>
<div bind:this={tools} use:portal class="cell-tools ui-floating-toolbar" class:formatting={styleOpen} inert={styleOpen} role="toolbar" tabindex="-1" aria-label="Selected cells" style:display={range&&!activeCell?'flex':'none'} onkeydown={e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z')cancelClipboard();if(e.key==='Escape'){cancelClipboard();e.preventDefault();movingTable=false;resizingTable=false;extend=false;node(tabTarget)?.focus();}}} oncopy={e=>copy(e)} oncut={e=>copy(e,true)} onpaste={paste}>
  {#if movingTable||resizingTable}<span class="move-instruction">{resizingTable?'Drag a corner to resize':'Drag the table to move'}</span><Button variant="quiet" aria-label={resizingTable?'Cancel resizing table':'Cancel moving table'} onclick={()=>{movingTable=false;resizingTable=false;}}>Cancel</Button>{:else}
  <span class="range-label" title="Drag to select · Shift extends · Esc returns to the object">{label}</span>
  <Button class="range-toggle" variant="quiet" aria-label="Range selection" aria-pressed={extend} title="Tap another cell to extend the range" onclick={()=>extend=!extend}><Expand size={16}/><span class="range-mode">Range</span></Button>
  <Button variant="quiet" aria-label="Edit cell" class="cell-edit-action" onclick={()=>editCell()}><TextCursorInput size={16}/><span>Edit</span></Button>
  <Button variant="quiet" class="cell-format-action" aria-label="Format selected cells" aria-expanded={styleOpen} onclick={event=>{styleTrigger=event.currentTarget;styleOpen=!styleOpen;}}><Paintbrush size={16}/><span>Format</span></Button>
  <Button variant="quiet" aria-label="More table actions" aria-haspopup="menu" onclick={event=>{openMenu(undefined,event.currentTarget);}}><Ellipsis size={16}/><span class="cell-secondary-label">More</span></Button>
  <Button variant="quiet" class="cell-move-action" aria-label="Move table" title="Drag to move the table · Enter returns to object controls" onpointerdown={e=>{e.preventDefault();e.stopPropagation();onmove(e);}} onkeydown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();range=undefined;axisSelection=undefined;root?.closest<HTMLElement>('[data-element-id]')?.focus();}}}><Move size={16}/></Button>
  <Button variant="quiet" aria-label="Done selecting cells" onclick={finishCells}><Check size={16}/><span>Done</span></Button>
  {/if}
  {#if status}<span class="cell-status" role="status">{status}</span>{/if}
</div>
{#if menuAnchor&&range}<CanvasTableContextMenu anchor={menuAnchor} items={actions.filter(item=>!menuAxis||!item.label.includes(menuAxis==='row'?'column':'row'))} onclose={()=>menuAnchor=undefined}/>{/if}
{#if styleOpen&&range&&!activeCell}<CanvasTableStyleEditor element={live()} {system} {range} anchor={()=>styleTrigger} onapply={patch=>applyPatch(patch,editor.deck!.revision,`cell-style:${element.id}:${label}`)} onclose={()=>{styleOpen=false;void tick().then(()=>styleTrigger?.focus());}}/>{/if}
{#if mergeReview}<CanvasTableMergeReview review={mergeReview} {system} onclose={()=>mergeReview=undefined}/>{/if}
<style>
  .canvas-cell-grid.table-moving{cursor:grab}.move-instruction{font-size:var(--ui-label);padding-inline:4px}.canvas-cell-grid{position:relative;width:100%;height:100%;touch-action:none;user-select:none}.cell-tools{position:fixed;z-index:160;align-items:center;gap:4px;flex-wrap:wrap;max-width:calc(100vw - 24px);box-sizing:border-box}.cell-tools :global(button[aria-label="Move table"]){order:0}.cell-tools.formatting{visibility:hidden}.cell-status{order:2;overflow-wrap:anywhere}.range-mode{display:none}.cell-tools :global(.range-toggle){display:none}.range-label{font:var(--ui-meta)/1.4 var(--font-ui);font-variant-numeric:tabular-nums;min-width:42px}.cell-status{flex-basis:100%;font:var(--ui-meta)/1.5 var(--font-ui);max-width:310px;padding:4px}.cell-tools :global(button[aria-pressed=true]){background:var(--state-selected);color:var(--text-link)}@media(pointer:coarse),(max-width:760px){.cell-tools :global(.range-toggle){display:inline-flex}.cell-tools :global(button){min-width:44px;min-height:44px}.range-label{min-width:36px}.range-mode{display:inline}.cell-tools :global(.range-toggle svg),.cell-tools :global(.cell-secondary-label){display:none}.cell-tools{gap:0;padding-inline:6px}.cell-status{flex:1;flex-basis:auto;min-width:120px;max-width:none;padding-inline:8px}}

@media(pointer:coarse),(max-width:760px){.cell-tools :global(button){padding-inline:6px}.cell-tools :global(.cell-move-action){display:none}.cell-tools :global(.cell-edit-action svg),.cell-tools :global(button[aria-label="Done selecting cells"] svg){display:none}}
.cell-tools{width:max-content}.cell-tools:global([data-ui-placement='dock']){position:relative;inset:auto;width:100%;max-width:100%;max-height:none;flex:none}.cell-tools:global([data-ui-placement='dock']) :global(button[aria-label='Done selecting cells']){margin-left:auto}
.cell-tools:global([data-ui-placement='dock']) .range-label{min-width:0;flex:none}
</style>
