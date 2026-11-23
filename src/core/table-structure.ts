import {reconcileTableText} from './table-rich-text';
import type {SlideElement} from './model';
import type {TableMerge,TableCellStyle,TableStyle,TableEdge} from './table-schema';
import {validateTableStyle} from './table-schema';
import {tableColumnStyle} from './table-columns';
import {tablePresentation,tableCellBox} from './table-rendering';
import {cellBounds,pasteCellRange,type Cell,type CellRange} from './table-grid';
import type {DesignSystem} from './design-system-schema';
export const tableColumns=(cells:string[][])=>Math.max(1,...cells.map(row=>row.length));
export function cellMerge(style:TableStyle|undefined,row:number,column:number){return style?.merges?.find(m=>row>=m.row&&row<m.row+m.rowSpan&&column>=m.column&&column<m.column+m.columnSpan);}
export function cellOwner(style:TableStyle|undefined,cell:Cell):Cell{const m=cellMerge(style,cell.row,cell.column);return m?{row:m.row,column:m.column}:cell;}
/** Selecting any part of a merged cell selects its complete rectangle. */
export function expandMergedRange(style:TableStyle|undefined,range:CellRange):CellRange{
  const b=cellBounds(range);let changed=true;
  while(changed){changed=false;for(const m of style?.merges??[]){if(m.row>b.bottom||m.row+m.rowSpan-1<b.top||m.column>b.right||m.column+m.columnSpan-1<b.left)continue;const next={top:Math.min(b.top,m.row),bottom:Math.max(b.bottom,m.row+m.rowSpan-1),left:Math.min(b.left,m.column),right:Math.max(b.right,m.column+m.columnSpan-1)};if(JSON.stringify(next)!==JSON.stringify(b)){Object.assign(b,next);changed=true;}}}
  return {anchor:{row:range.anchor.row<=range.head.row?b.top:b.bottom,column:range.anchor.column<=range.head.column?b.left:b.right},head:{row:range.anchor.row<=range.head.row?b.bottom:b.top,column:range.anchor.column<=range.head.column?b.right:b.left}};
}
function localStyle(e:SlideElement,system?:DesignSystem){return e.tableStyle?{...e.tableStyle}:tableColumnStyle(e,tablePresentation(e,system).widths,system);}
export function mergeTableRange(e:SlideElement,range:CellRange,split=false,system?:DesignSystem){
  const b=cellBounds(expandMergedRange(e.tableStyle,range)),tableStyle=localStyle(e,system);
  const merges=(tableStyle.merges??[]).filter(m=>m.row>b.bottom||m.row+m.rowSpan-1<b.top||m.column>b.right||m.column+m.columnSpan-1<b.left);
  if(!split){if(b.top===b.bottom&&b.left===b.right)throw new Error('Select at least two cells to merge.');merges.push({row:b.top,column:b.left,rowSpan:b.bottom-b.top+1,columnSpan:b.right-b.left+1});}
  const next={...tableStyle,merges:merges.length?merges:undefined};validateTableStyle(e.cells??[],next);return {tableStyle:next};
}
export function styleTableRange(e:SlideElement,range:CellRange,patch:Omit<Partial<TableCellStyle>,'row'|'column'>|null,system?:DesignSystem){
  const tableStyle=localStyle(e,system),b=cellBounds(expandMergedRange(e.tableStyle,range));
  const entries=new Map((tableStyle.cellStyles??[]).map(s=>[`${s.row}:${s.column}`,s]));
  if(!patch){
    const clear=(row:number,column:number,side:'top'|'right'|'bottom'|'left')=>{if(row<0||column<0||row>=(e.cells?.length??0)||column>=tableColumns(e.cells??[]))return;const owner=cellOwner(tableStyle,{row,column}),key=`${owner.row}:${owner.column}`,old=entries.get(key);if(!old?.edges?.[side])return;const edges={...old.edges};delete edges[side];entries.set(key,{...old,edges:Object.keys(edges).length?edges:undefined});};
    for(let row=b.top;row<=b.bottom;row++)for(let column=b.left;column<=b.right;column++){const owner=cellOwner(tableStyle,{row,column});if(owner.row!==row||owner.column!==column)continue;const merge=cellMerge(tableStyle,row,column),bottom=row+(merge?.rowSpan??1)-1,right=column+(merge?.columnSpan??1)-1;for(let c=column;c<=right;c++){clear(row-1,c,'bottom');clear(bottom+1,c,'top');}for(let r=row;r<=bottom;r++){clear(r,column-1,'right');clear(r,right+1,'left');}}
  }
  for(let row=b.top;row<=b.bottom;row++)for(let column=b.left;column<=b.right;column++){
    const key=`${row}:${column}`;
    if(!patch){entries.delete(key);continue;}
    const next={...entries.get(key),row,column,...patch};
    for(const field of ['insets','edges'] as const)if(patch[field])next[field]=Object.fromEntries(Object.entries({...entries.get(key)?.[field],...patch[field]}).filter(([,value])=>value!==undefined));
    if(next.runs&&patch.runs===undefined)next.runs=next.runs.map(run=>{const local={...run};for(const property of ['fontFamily','fontSize','fontWeight','italic','underline','strikethrough','color'] as const)if(patch[property]!==undefined)delete local[property];return local;});
    for(const key of Object.keys(next) as (keyof TableCellStyle)[])if(next[key]===undefined)delete next[key];
    if(Object.keys(next).length>2)entries.set(key,next);else entries.delete(key);
  }
  const cellStyles=[...entries.values()].sort((a,b)=>a.row-b.row||a.column-b.column);return {tableStyle:{...tableStyle,cellStyles:cellStyles.length?cellStyles:undefined}};
}
/** One patch remaps every address and size; deletion removes only the requested data. */
export function changeTableAxis(e:SlideElement,axis:'row'|'column',index:number,count:number,insert:boolean){
  const rows=e.cells??[['']],columns=tableColumns(rows),length=axis==='row'?rows.length:columns,limit=axis==='row'?100:20;
  if(!Number.isInteger(index)||!Number.isInteger(count)||count<1||index<0||index>(insert?length:length-count))throw new Error('Choose an existing row or column.');
  if(insert&&length+count>limit)throw new Error(`Use up to ${limit} ${axis}s.`);
  if(!insert&&length-count<1)throw new Error(`Keep at least one ${axis}.`);
  const geometry:Partial<Pick<SlideElement,'w'|'h'>>={};
  if(e.nativeTableLayout&&(insert?index===length:index+count===length)){
    const p=tablePresentation(e);
    if(axis==='row'&&insert)geometry.h=e.h+e.h*(p.heights?.at(-1)??1/rows.length)*count;
    if(axis==='column'){
      const delta=e.w*(insert?p.widths.at(-1)!*count:p.widths.slice(index).reduce((sum,width)=>sum+width,0));
      geometry.w=e.w+(insert?delta:-delta);
      if(geometry.w<1||geometry.w>20000)throw new Error('Keep the table width between 1 and 20,000 px.');
    }
  }
  const cells=rows.map(row=>Array.from({length:columns},(_,c)=>row[c]??''));
  if(axis==='row')cells.splice(index,insert?0:count,...(insert?Array.from({length:count},()=>Array(columns).fill('')):[]));
  else cells.forEach(row=>row.splice(index,insert?0:count,...(insert?Array(count).fill(''):[])));
  if(!e.tableStyle)return {cells,tableStyle:undefined,...geometry};
  const s=e.tableStyle,coordinate=axis==='row'?'row':'column',span=axis==='row'?'rowSpan':'columnSpan';
  const remap=(n:number)=>insert?n+(n>=index?count:0):n<index?n:n>=index+count?n-count:undefined;
  const merges:TableMerge[]=[];
  for(const m of s.merges??[]){
    const start=m[coordinate],end=start+m[span],copy={...m};
    if(insert){copy[coordinate]=start>=index?start+count:start;copy[span]=m[span]+(start<index&&index<end?count:0);}
    else{const kept=Array.from({length:m[span]},(_,j)=>remap(start+j)).filter((n):n is number=>n!==undefined);if(!kept.length)continue;copy[coordinate]=kept[0];copy[span]=kept.length;}
    if(copy.rowSpan*copy.columnSpan>1)merges.push(copy);
  }
  const cellStyles=(s.cellStyles??[]).flatMap(cell=>{const n=remap(cell[coordinate]);return n===undefined?[]:[{...cell,[coordinate]:n}];});
  function weights(values:number[]|undefined){if(!values)return undefined;const fallback=values.reduce((a,b)=>a+b,0)/values.length,next=Array.from({length},(_,i)=>values[i]??fallback);next.splice(index,insert?0:count,...(insert?Array(count).fill(next[Math.min(index,length-1)]??fallback):[]));return next;}
  const columnAlign=axis==='column'&&s.columnAlign?Array.from({length:columns},(_,i)=>s.columnAlign![i]??'auto'):s.columnAlign;
  if(axis==='column'&&columnAlign)columnAlign.splice(index,insert?0:count,...(insert?Array(count).fill('auto'):[]));
  const tableStyle={...s,merges:merges.length?merges:undefined,cellStyles:cellStyles.length?cellStyles:undefined,rowHeights:axis==='row'?weights(s.rowHeights):s.rowHeights,columnWidths:axis==='column'?weights(s.columnWidths):s.columnWidths,columnAlign};
  validateTableStyle(cells,tableStyle);return {cells,tableStyle,...geometry};
}
export function pastedTableStyle(e:SlideElement,range:CellRange){return mergeTableRange(e,range,true).tableStyle;}

/** All table editors paste data and split intersecting merges in one transaction. */
export function pasteTableRange(e:SlideElement,text:string,range:CellRange){
  const result=pasteCellRange(e.cells??[],text,range),b=cellBounds(range);
  const destination={anchor:{row:b.top,column:b.left},head:{row:b.top+result.rows-1,column:b.left+result.columns-1}};
  return {...result,tableStyle:reconcileTableText(e,result.cells,e.tableStyle?.merges?.length?pastedTableStyle(e,destination):e.tableStyle)};
}

/** A shared edge has two cell owners. Update both so a stronger old CSS border cannot win. */
export function borderTableRange(e:SlideElement,range:CellRange,side:'all'|'top'|'right'|'bottom'|'left',edge:Partial<TableEdge>,system?:DesignSystem){
  const tableStyle=localStyle(e,system),b=cellBounds(expandMergedRange(e.tableStyle,range)),entries=new Map((tableStyle.cellStyles??[]).map(s=>[`${s.row}:${s.column}`,s])),rows=e.cells?.length??0,columns=tableColumns(e.cells??[]),visited=new Set<string>(),p=tablePresentation(e,system);
  const set=(row:number,column:number,side:'top'|'right'|'bottom'|'left',patch:Partial<TableEdge>)=>{if(row<0||row>=rows||column<0||column>=columns)return;const owner=cellOwner(tableStyle,{row,column}),key=`${owner.row}:${owner.column}`,old=entries.get(key),next={...(old?.edges?.[side]??tableCellBox(p,owner.row,owner.column).edges[side]),...patch};entries.set(key,{...old,...owner,edges:{...old?.edges,[side]:next}});return next;};
  for(let r=b.top;r<=b.bottom;r++)for(let c=b.left;c<=b.right;c++){
    const owner=cellOwner(tableStyle,{row:r,column:c}),key=`${owner.row}:${owner.column}`;if(visited.has(key))continue;visited.add(key);
    const merge=cellMerge(tableStyle,owner.row,owner.column),bottom=owner.row+(merge?.rowSpan??1)-1,right=owner.column+(merge?.columnSpan??1)-1;
    for(const which of side==='all'?['top','right','bottom','left'] as const:[side]){const next=set(owner.row,owner.column,which,edge)!;
      if(which==='top'||which==='bottom')for(let col=owner.column;col<=right;col++)set(which==='top'?owner.row-1:bottom+1,col,which==='top'?'bottom':'top',next);
      else for(let row=owner.row;row<=bottom;row++)set(row,which==='left'?owner.column-1:right+1,which==='left'?'right':'left',next);
    }
  }
  return {tableStyle:{...tableStyle,cellStyles:[...entries.values()].sort((a,b)=>a.row-b.row||a.column-b.column)}};
}
