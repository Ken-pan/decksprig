import type {SlideElement} from './model';
import {cellBounds,clearCellRange,type Cell,type CellRange} from './table-grid';
import {cellOwner,changeTableAxis,expandMergedRange,tableColumns} from './table-structure';

type TablePatch={cells:string[][];tableStyle?:SlideElement['tableStyle'];h?:number;w?:number};
export type TableTabResult={kind:'move';cell:Cell;patch?:undefined}|{kind:'edge';cell:Cell;patch?:undefined}|{kind:'limit';cell:Cell;patch?:undefined}|{kind:'append';cell:Cell;patch:TablePatch};

/** Tab follows rendered cell owners. An optional inline draft joins the append patch. */
export function tableTabNavigation(element:SlideElement,current:Cell,backwards=false,value?:string):TableTabResult{
  const cells=element.cells??[['']],columns=tableColumns(cells),owner=cellOwner(element.tableStyle,{row:Math.max(0,Math.min(cells.length-1,current.row)),column:Math.max(0,Math.min(columns-1,current.column))}),visible:Cell[]=[];
  for(let row=0;row<cells.length;row++)for(let column=0;column<columns;column++){
    const at=cellOwner(element.tableStyle,{row,column});
    if(at.row===row&&at.column===column)visible.push(at);
  }
  const index=visible.findIndex(cell=>cell.row===owner.row&&cell.column===owner.column),next=visible[index+(backwards?-1:1)];
  if(next)return {kind:'move',cell:next};
  if(backwards)return {kind:'edge',cell:owner};
  if(cells.length>=100)return {kind:'limit',cell:owner};
  if(value!==undefined&&value.length>5000)throw new Error('Keep each cell under 5,000 characters.');
  const draft=value===undefined?element:{...element,cells:cells.map((row,r)=>Array.from({length:columns},(_,c)=>r===owner.row&&c===owner.column?value:row[c]??''))};
  return {kind:'append',cell:{row:cells.length,column:0},patch:changeTableAxis(draft,'row',cells.length,1,true)};
}

/** Only explicit axis selection deletes structure; a rectangular selection clears data. */
export function deleteTableSelection(element:SlideElement,range:CellRange,axis?:'row'|'column'):TablePatch{
  const selected=expandMergedRange(element.tableStyle,range),bounds=cellBounds(selected);
  if(!axis)return {cells:clearCellRange(element.cells??[],selected)};
  return changeTableAxis(element,axis,axis==='row'?bounds.top:bounds.left,axis==='row'?bounds.bottom-bounds.top+1:bounds.right-bounds.left+1,false);
}
