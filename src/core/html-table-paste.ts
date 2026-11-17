import type {SlideElement} from './model';
import type {DesignSystem} from './design-system-schema';
import {TableStyleSchema,validateTableStyle,type TableStyle,type TableEdge} from './table-schema';
import {tableCells} from './object-data';
import {cellsTsv,cellBounds,type CellRange} from './table-grid';
import {pasteTableRange,styleTableRange,cellOwner} from './table-structure';
import type {HtmlClipboard,HtmlClipboardTable} from './html-clipboard';
export function htmlTableSource(source:HtmlClipboard):HtmlClipboardTable{
  if(source.kind==='table')return source;
  if(source.text.length>5000)throw Error('Keep each cell under 5,000 characters.');
  return {kind:'table',cells:[[source.text]],tableStyle:{headerRow:false,padding:0,borders:'none',cellStyles:[{row:0,column:0,runs:source.runs}]}};
}
/** The same pure, bounded patch serves canvas, cell drafts, manual and AI operations. */
export function pasteHtmlTable(e:SlideElement,source:HtmlClipboardTable,range:CellRange,system?:DesignSystem){
  const cells=tableCells(source.cells),style=TableStyleSchema.parse(source.tableStyle),columns=cells[0]?.length??0;
  if(!cells.length||!columns||cells.some(r=>r.length!==columns))throw Error('Copy a rectangular range with the same number of columns in each row.');
  validateTableStyle(cells,style);
  const result=pasteTableRange(e,cellsTsv(cells),range),b=cellBounds(range),destination={anchor:{row:b.top,column:b.left},head:{row:b.top+result.rows-1,column:b.left+result.columns-1}},tableStyle=styleTableRange({...e,cells:result.cells,tableStyle:result.tableStyle},destination,{},system).tableStyle;
  const entries=new Map((tableStyle.cellStyles??[]).map(s=>[`${s.row}:${s.column}`,s])),original=new Map((style.cellStyles??[]).map(s=>[`${s.row}:${s.column}`,s]));
  for(let y=0;y<result.rows;y++)for(let x=0;x<result.columns;x++){
    const row=b.top+y,column=b.left+x,key=`${row}:${column}`,copied=original.get(`${y%cells.length}:${x%columns}`),prior=entries.get(key);
    const {row:_r,column:_c,...format}=copied??{row:0,column:0};
    entries.set(key,{...prior,row,column,runs:undefined,...structuredClone(format)});
  }
  const merges=[...tableStyle.merges??[]];
  for(let y=0;y<result.rows;y+=cells.length)for(let x=0;x<result.columns;x+=columns)for(const m of style.merges??[])merges.push({...m,row:b.top+y+m.row,column:b.left+x+m.column});
  const next:TableStyle={...tableStyle,cellStyles:[...entries.values()],merges:merges.length?merges:undefined};
  // Outside cells share the pasted rectangle's boundary. Update that one edge
  // only when the source supplied it, so a stronger old edge cannot mask it.
  const outside=(row:number,column:number,side:'top'|'right'|'bottom'|'left',edge:TableEdge)=>{
    if(row<0||column<0||row>=result.cells.length||column>=result.cells[row].length)return;
    const owner=cellOwner(next,{row,column}),key=`${owner.row}:${owner.column}`,prior=entries.get(key);entries.set(key,{...prior,...owner,edges:{...prior?.edges,[side]:{...edge}}});
  };
  const supplied=(row:number,column:number,side:'top'|'right'|'bottom'|'left')=>{const owner=cellOwner(style,{row:row%cells.length,column:column%columns});return original.get(`${owner.row}:${owner.column}`)?.edges?.[side];};
  for(let x=0;x<result.columns;x++){const top=supplied(0,x,'top'),bottom=supplied(result.rows-1,x,'bottom');if(top)outside(b.top-1,b.left+x,'bottom',top);if(bottom)outside(b.top+result.rows,b.left+x,'top',bottom);}
  for(let y=0;y<result.rows;y++){const left=supplied(y,0,'left'),right=supplied(y,result.columns-1,'right');if(left)outside(b.top+y,b.left-1,'right',left);if(right)outside(b.top+y,b.left+result.columns,'left',right);}
  next.cellStyles=[...entries.values()].sort((a,b)=>a.row-b.row||a.column-b.column);
  validateTableStyle(result.cells,next);return {...result,tableStyle:next};
}
/** Preserve a styled single-cell source as an inline selection paste. */
export function htmlCellText(source:HtmlClipboardTable){
  if(source.cells.length!==1||source.cells[0].length!==1)return;
  const text=source.cells[0][0],style=source.tableStyle.cellStyles?.find(s=>s.row===0&&s.column===0);
  return {kind:'deck-studio/cell-text/1' as const,text,runs:style?.runs??[{text}]};
}
