import type {TableMerge} from './table-schema';

export type NativeCellGeometry={width:number;height:number;rowIndex?:number;columnIndex?:number};
export type NativeTableGeometry={columnWidths:number[];rowHeights:number[];merges:TableMerge[]};
const near=(a:number,b:number)=>Math.abs(a-b)<=.1;

/** A complete unit-width row and unit-height column independently witness the
 * base grid. Merged owners enlarge only their own rectangle; covered native
 * placeholders retain their base dimensions. Never infer topology from text. */
export function inferNativeTableGeometry(cells:readonly(readonly NativeCellGeometry[])[],width:number,height:number):NativeTableGeometry|undefined{
 const rows=cells.length,columns=cells[0]?.length??0;
 if(!rows||rows>100||!columns||columns>20||![width,height].every(v=>Number.isFinite(v)&&v>0)||cells.some(row=>row.length!==columns))return;
 for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){const cell=cells[r][c];if(!cell||![cell.width,cell.height].every(v=>Number.isFinite(v)&&v>0)||cell.rowIndex!==undefined&&cell.rowIndex!==r||cell.columnIndex!==undefined&&cell.columnIndex!==c)return;}
 const widthWitnesses=cells.filter(row=>near(row.reduce((sum,cell)=>sum+cell.width,0),width)).map(row=>row.map(cell=>cell.width));
 const heightWitnesses=Array.from({length:columns},(_,c)=>cells.map(row=>row[c].height)).filter(column=>near(column.reduce((sum,v)=>sum+v,0),height));
 if(!widthWitnesses.length||!heightWitnesses.length)return;
 const columnWidths=widthWitnesses[0],rowHeights=heightWitnesses[0];
 if(widthWitnesses.some(row=>row.some((v,c)=>!near(v,columnWidths[c])))||heightWitnesses.some(column=>column.some((v,r)=>!near(v,rowHeights[r]))))return;
 const span=(sizes:number[],start:number,value:number)=>{let sum=0;const matches:number[]=[];for(let end=start;end<sizes.length;end++){sum+=sizes[end];if(near(sum,value))matches.push(end-start+1);if(sum>value+.1)break;}return matches.length===1?matches[0]:undefined;};
 const spans=cells.map((row,r)=>row.map((cell,c)=>({rowSpan:span(rowHeights,r,cell.height),columnSpan:span(columnWidths,c,cell.width)})));
 if(spans.some(row=>row.some(s=>!s.rowSpan||!s.columnSpan)))return;
 const merges:TableMerge[]=[],occupied=new Set<string>();
 for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){
  const {rowSpan,columnSpan}=spans[r][c];if(rowSpan===1&&columnSpan===1)continue;
  for(let y=r;y<r+rowSpan!;y++)for(let x=c;x<c+columnSpan!;x++){const key=`${y}:${x}`;if(occupied.has(key)||((y!==r||x!==c)&&(spans[y][x].rowSpan!==1||spans[y][x].columnSpan!==1)))return;occupied.add(key);}
  merges.push({row:r,column:c,rowSpan:rowSpan!,columnSpan:columnSpan!});
 }
 return{columnWidths,rowHeights,merges};
}
