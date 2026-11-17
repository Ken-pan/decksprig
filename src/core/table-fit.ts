import {tablePresentation,tableCellStyle,tableCellBox,tableCellSpan,tableCellRuns} from './table-rendering';
import {uid,type SlideElement,type Slide} from './model';
import {browserTextSize,type TextSizeMeasure} from './text-layout';

/** The same cell geometry is used by measurement, canvas, HTML and PowerPoint. */
export function tableRowHeights(e:SlideElement,size=e.fontSize,measure:TextSizeMeasure=browserTextSize):number[]{
  const rows=e.cells??[],p=tablePresentation(e);
  const heights=rows.map((_,i)=>Math.max((p.heights?.[i]??0)*e.h,1)),spans:{row:number;length:number;height:number}[]=[];
  rows.forEach((row,i)=>row.forEach((text,j)=>{
    const span=tableCellSpan(p,i,j);if(span.covered)return;
    const style=tableCellStyle(p,i,j),box=tableCellBox(p,i,j),horizontal=box.insets.left+box.insets.right+box.edges.left.width+box.edges.right.width,vertical=box.insets.top+box.insets.bottom+(box.edges.top.width+box.edges.bottom.width)/2,w=Math.max(1,e.w*p.widths.slice(j,j+span.columnSpan).reduce((a,b)=>a+b,0)-horizontal);
    const cellSize=parseFloat(style.fontSize)*size/e.fontSize;
    const height=Math.ceil((measure({...e,type:'text',text,w,fontFamily:style.fontFamily,fontSize:cellSize,fontWeight:style.fontWeight,italic:style.fontStyle==='italic',textSizing:'auto-height',runs:tableCellRuns(p,i,j,text).map(run=>({...run,...(run.fontSize!==undefined?{fontSize:run.fontSize*size/e.fontSize}:{})})),paragraphs:undefined,padding:undefined,wrap:true},{})?.h??text.split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil([...line].length*cellSize*.56/w)),0)*cellSize*e.lineHeight)+vertical);
    if(span.rowSpan===1)heights[i]=Math.max(heights[i],height);else spans.push({row:i,length:span.rowSpan,height});
  }));
  for(const span of spans){const total=heights.slice(span.row,span.row+span.length).reduce((a,b)=>a+b,0),extra=Math.max(0,span.height-total);for(let i=span.row;i<span.row+span.length;i++)heights[i]+=extra/span.length;}
  return heights;
}
export function fitTableElement(e:SlideElement,measure:TextSizeMeasure=browserTextSize):SlideElement{
  if(e.type!=='table'||!e.tableFit||e.locked)return e;
  let lo=Math.min(e.fontSize,e.tableFit.minimumFontSize),hi=e.layoutItem?.basisFontSize??e.fontSize;
  const height=(size:number)=>tableRowHeights(e,size,measure).reduce((a,b)=>a+b,0);
  const sized=(fontSize:number):SlideElement=>({...e,fontSize,tableStyle:e.tableStyle?{...e.tableStyle,cellStyles:e.tableStyle.cellStyles?.map(s=>({...s,fontSize:s.fontSize===undefined?undefined:s.fontSize*fontSize/e.fontSize,...(s.runs?{runs:s.runs.map(run=>({...run,...(run.fontSize!==undefined?{fontSize:run.fontSize*fontSize/e.fontSize}:{})}))}:{})}))}:undefined,layoutItem:{widthMode:'fixed',heightMode:'fixed',...e.layoutItem,basisFontSize:e.layoutItem?.basisFontSize??e.fontSize},design:e.design?{...e.design,textScale:(e.design.textScale??1)*fontSize/e.fontSize}:undefined});
  if(height(hi)<=e.h+.01)return sized(hi);
  for(let i=0;i<16;i++){const mid=(lo+hi)/2;if(height(mid)<=e.h+.01)lo=mid;else hi=mid;}
  return sized(Math.floor(lo*10)/10);
}
/** Continuations are separate native slides, preserving every cell and repeating the header. */
export function continueTable(slide:Slide,id:string,measure:TextSizeMeasure=browserTextSize):Slide[]{
  const table=slide.elements.find(e=>e.id===id);if(!table?.tableFit)return [slide];
  const fitted=fitTableElement(table,measure),rows=fitted.cells??[];
  const heights=tableRowHeights(fitted,fitted.fontSize,measure);
  if(heights.reduce((a,b)=>a+b,0)<=fitted.h+.01)return [{...slide,elements:slide.elements.map(e=>e.id===id?fitted:e)}];
  if(fitted.tableStyle?.merges?.some(m=>m.rowSpan>1))throw new Error('Split merged rows before continuing the table onto another slide.');
  const hasHeader=tablePresentation(fitted).headerRow,header=rows[0],headerH=hasHeader?heights[0]:0,chunks:string[][][]=[];let chunk=hasHeader?[header]:[],used=headerH;
  for(let i=hasHeader?1:0;i<rows.length;i++){
    if(heights[i]+headerH>fitted.h)throw new Error('A table row is too long. Shorten the cell text or use a larger reading layout.');
    if(used+heights[i]>fitted.h){chunks.push(chunk);chunk=hasHeader?[header]:[];used=headerH;}
    chunk.push(rows[i]);used+=heights[i];
  }
  chunks.push(chunk);
  return chunks.map((cells,i)=>{
    const indices=cells.map(row=>rows.indexOf(row)),tableStyle=fitted.tableStyle?{...fitted.tableStyle,rowHeights:fitted.tableStyle.rowHeights?indices.map(row=>heights[row]):undefined,merges:fitted.tableStyle.merges?.filter(m=>indices.includes(m.row)).map(m=>({...m,row:indices.indexOf(m.row)})),cellStyles:fitted.tableStyle.cellStyles?.filter(s=>indices.includes(s.row)).map(s=>({...s,row:indices.indexOf(s.row)}))}:undefined;
    if(!i)return {...slide,elements:slide.elements.map(e=>e.id===id?{...fitted,cells,tableStyle}:e)};
    const ids=new Map([...slide.elements.map(e=>e.id),...(slide.groups??[]).map(g=>g.id)].map(id=>[id,uid('continued')]));
    return {...slide,id:uid('slide'),transition:{effect:'fade',duration:300,easing:'linear'},notes:slide.notes+' Table continuation; header repeated.',
      elements:slide.elements.map(e=>({...e,id:ids.get(e.id)!,group:e.group?ids.get(e.group):undefined,...(e.id===id?{...fitted,id:ids.get(e.id)!,cells,tableStyle}:{}),...(e.type==='text'&&e.y>=736?{text:'Continued'}:{})})),
      groups:slide.groups?.map(g=>({...g,id:ids.get(g.id)!,parent:g.parent?ids.get(g.parent):undefined})),autoLayouts:slide.autoLayouts?.map(l=>({...l,id:ids.get(l.id)!,order:l.order.map(id=>ids.get(id)!)}))};
  });
}
