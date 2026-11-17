import {reconcileTableText} from './table-rich-text';
import type {SlideElement} from './model';
import type {CellRange} from './table-grid';
import {cellBounds} from './table-grid';
import {tableColumns} from './table-structure';
import {validateTableStyle} from './table-schema';

export type TableAxis='row'|'column';
/** Merged cells move as one block, including merges connected on this axis. */
export function tableAxisBlock(e:SlideElement,axis:TableAxis,start:number,end=start){
  const length=axis==='row'?(e.cells?.length??0):tableColumns(e.cells??[]),span=axis==='row'?'rowSpan':'columnSpan';
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>=length)throw Error('Choose existing rows or columns.');
  let changed=true;
  while(changed){changed=false;for(const m of e.tableStyle?.merges??[]){const a=m[axis],b=a+m[span]-1;if(a>end||b<start)continue;if(a<start||b>end){start=Math.min(start,a);end=Math.max(end,b);changed=true;}}}
  return {start,end,count:end-start+1};
}
export function tableAxisDropAllowed(e:SlideElement,axis:TableAxis,boundary:number){
  const span=axis==='row'?'rowSpan':'columnSpan';
  return !(e.tableStyle?.merges??[]).some(m=>m[axis]<boundary&&m[axis]+m[span]>boundary);
}
/** Destination is an insertion boundary in the original table, never an overwrite. */
export function reorderTableAxis(e:SlideElement,axis:TableAxis,start:number,end:number,boundary:number){
  const block=tableAxisBlock(e,axis,start,end),cells=e.cells??[],columns=tableColumns(cells),length=axis==='row'?cells.length:columns;
  if(!Number.isInteger(boundary)||boundary<0||boundary>length)throw Error('Choose an insertion point inside the table.');
  if(!tableAxisDropAllowed(e,axis,boundary))throw Error('Move past the merged cells.');
  const order=Array.from({length},(_,i)=>i);
  if(boundary<block.start||boundary>block.end+1){const moved=order.splice(block.start,block.count);order.splice(boundary>block.end?boundary-block.count:boundary,0,...moved);}
  const next=cells.map(row=>Array.from({length:columns},(_,i)=>row[i]??'')),s=e.tableStyle;
  const remap=(index:number)=>order.indexOf(index);
  const tableStyle=s?{...s,
    rowHeights:axis==='row'&&s.rowHeights?order.map(i=>s.rowHeights![i]??1):s.rowHeights,
    columnWidths:axis==='column'&&s.columnWidths?order.map(i=>s.columnWidths![i]??1):s.columnWidths,
    columnAlign:axis==='column'&&s.columnAlign?order.map(i=>s.columnAlign![i]??'auto'):s.columnAlign,
    merges:s.merges?.map(m=>({...m,[axis]:remap(m[axis])})),
    cellStyles:s.cellStyles?.map(cell=>({...cell,[axis]:remap(cell[axis])}))}:undefined;
  const result={cells:axis==='row'?order.map(i=>next[i]):next.map(row=>order.map(i=>row[i])),tableStyle};
  if(tableStyle)validateTableStyle(result.cells,tableStyle);
  return {...result,start:remap(block.start),count:block.count};
}

function pattern(values:string[],repeat:boolean):(index:number)=>string{
  const cycle=(index:number)=>values[(index%values.length+values.length)%values.length];
  if(repeat||values.length<2)return cycle;
  const dates=values.map(v=>{const n=/^\d{4}-\d{2}-\d{2}$/.test(v)?Date.parse(v+'T00:00:00Z'):NaN;return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===v?n:NaN;});
  const regular=(numbers:number[])=>numbers.every(Number.isFinite)&&numbers.slice(2).every((n,i)=>Math.abs((n-numbers[i+1])-(numbers[1]-numbers[0]))<1e-8);
  if(values.every(v=>/^\d{4}-\d{2}-\d{2}$/.test(v))&&!dates.every(Number.isFinite))return cycle;
  if(regular(dates))return i=>{const n=dates[0]+i*(dates[1]-dates[0]);return Number.isFinite(n)&&Math.abs(n)<=8.64e15?new Date(n).toISOString().slice(0,10):cycle(i);};
  const matches=values.map(v=>/^(.*?)([+-]?\d+(?:\.\d+)?)([^\d]*)$/.exec(v));
  if(matches.some(m=>!m)||!matches.every(m=>m![1]===matches[0]![1]&&m![3]===matches[0]![3]))return cycle;
  const numbers=matches.map(m=>Number(m![2]));if(!regular(numbers))return cycle;
  const decimals=Math.max(...matches.map(m=>(m![2].split('.')[1]??'').length)),padding=matches.every(m=>/^0\d+$/.test(m![2]))?matches[0]![2].length:0;
  return i=>{const n=numbers[0]+i*(numbers[1]-numbers[0]);if(!Number.isFinite(n)||Math.abs(n)>1e12)return cycle(i);const raw=n.toFixed(Math.min(12,decimals)),formatted=padding&&n>=0?raw.padStart(padding,'0'):raw;return matches[0]![1]+formatted+matches[0]![3];};
}
/** Extend along one axis; unrecognized patterns repeat and source cells stay intact. */
export function autofillTableRange(e:SlideElement,source:CellRange,target:CellRange,repeat=false){
  const b=cellBounds(source),t=cellBounds(target),rows=e.cells??[],columns=tableColumns(rows);
  if(t.top<0||t.left<0||t.bottom>=rows.length||t.right>=columns||t.top>b.top||t.left>b.left||t.bottom<b.bottom||t.right<b.right)throw Error('Extend the selection within the table.');
  const vertical=t.left===b.left&&t.right===b.right,horizontal=t.top===b.top&&t.bottom===b.bottom;
  if(!vertical&&!horizontal)throw Error('Fill in one direction at a time.');
  if((e.tableStyle?.merges??[]).some(m=>m.row<=t.bottom&&m.row+m.rowSpan-1>=t.top&&m.column<=t.right&&m.column+m.columnSpan-1>=t.left))throw Error('Split merged cells before filling this range.');
  const cells=rows.map(row=>Array.from({length:columns},(_,i)=>row[i]??'')),height=b.bottom-b.top+1,width=b.right-b.left+1;
  const generators=vertical?Array.from({length:width},(_,i)=>pattern(cells.slice(b.top,b.bottom+1).map(row=>row[b.left+i]),repeat)):Array.from({length:height},(_,i)=>pattern(cells[b.top+i].slice(b.left,b.right+1),repeat));
  const styles=new Map((e.tableStyle?.cellStyles??[]).map(s=>[`${s.row}:${s.column}`,s]));
  for(let row=t.top;row<=t.bottom;row++)for(let column=t.left;column<=t.right;column++){
    if(row>=b.top&&row<=b.bottom&&column>=b.left&&column<=b.right)continue;
    cells[row][column]=vertical?generators[column-b.left](row-b.top):generators[row-b.top](column-b.left);
    const fromRow=b.top+((row-b.top)%height+height)%height,fromColumn=b.left+((column-b.left)%width+width)%width,format=styles.get(`${fromRow}:${fromColumn}`),key=`${row}:${column}`;
    if(format)styles.set(key,{...format,row,column});else styles.delete(key);
  }
  const tableStyle=e.tableStyle?{...e.tableStyle,cellStyles:styles.size?[...styles.values()]:undefined}:undefined;
  return {cells,tableStyle:reconcileTableText(e,cells,tableStyle)};
}
