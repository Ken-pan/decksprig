import type {SlideElement} from './model';
import type {DesignSystem} from './design-system-schema';
import type {TableStyle,TableTextRun,TableEdge} from './table-schema';
export function tableRendering(){
  const mix=(a:string,b:string,t:number)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('')+(a.length===9?a.slice(7):'');

function tablePresetStyle(id:NonNullable<TableStyle['preset']>):TableStyle {
  return {preset:id,headerRow:true,banded:id==='banded',borders:id==='grid'?'grid':'rows',padding:14,borderWidth:id==='grid'?.75:.6,numericAlign:true,verticalAlign:'middle'};
}
/** Old tables keep their existing appearance until a style is explicitly chosen. */
function tableAppearance(e:SlideElement,system?:DesignSystem){
  if(!e.tableStyle)return {text:e.fill,line:e.stroke==='transparent'?'#c6cdc3':e.stroke,background:e.design&&system?system.colors.background:'#f8f8f4',header:e.design&&system?system.colors.surface:'#e1e7da'};
  const luminance=(value:string)=>/^#[\da-f]{6}$/i.test(value)?[1,3,5].reduce((sum,i,j)=>sum+parseInt(value.slice(i,i+2),16)/255*[.2126,.7152,.0722][j],0):0;
  const style=e.tableStyle,dark=luminance(e.fill)>.65;
  const background=style.bodyFill??(dark?(system?.colors.dark??'#182521'):(system?.colors.background??'#ffffff'));
  const ink=dark?'#ffffff':'#172b26',base=background==='transparent'?(system?.colors.background??'#ffffff'):background;
  return {text:e.fill,line:style.lineColor??(e.stroke!=='transparent'?e.stroke:mix(base,ink,.16)),background,
    header:style.headerFill??(style.preset==='contrast'?(system?.colors.accent??'#294c46'):mix(base,ink,.055))};
}
/** Shared canvas/HTML/PPTX presentation; standalone exports embed these pure functions. */
function tablePresentation(e:SlideElement,system?:DesignSystem){
  const colors=tableAppearance(e,system),s=e.tableStyle?{...tablePresetStyle(e.tableStyle.preset??'grid'),...e.tableStyle}:undefined,columns=Math.max(1,...(e.cells??[]).map(r=>r.length));
  const ink=/^#[\da-f]{6}$/i.test(e.fill)?e.fill:'#172b26',background=colors.background==='transparent'?(system?.colors.background??'#ffffff'):colors.background;
  const luminance=(hex:string)=>[1,3,5].reduce((sum,i,j)=>{const n=parseInt(hex.slice(i,i+2),16)/255;return sum+(n<=.04045?n/12.92:((n+.055)/1.055)**2.4)*[.2126,.7152,.0722][j];},0);
  const contrast=(a:string,b:string)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  const headerPaint=colors.header.length===9?mix(system?.colors.background??'#ffffff',colors.header,parseInt(colors.header.slice(7),16)/255):colors.header;
  const header=s?.headerText??(e.tableStyle&&colors.header!=='transparent'&&/^#[\da-f]{6}$/i.test(e.fill)&&contrast(e.fill,headerPaint)<4.5?(contrast('#ffffff',headerPaint)>contrast('#111111',headerPaint)?'#ffffff':'#111111'):e.fill);
  const stored=s?.columnWidths?.slice(0,columns)??[],fallback=stored.length?stored.reduce((a,b)=>a+b,0)/stored.length:1;
  const weights=Array.from({length:columns},(_,j)=>stored[j]??fallback),total=weights.reduce((a,b)=>a+b,0);
  const rowCount=e.cells?.length??0,storedRows=s?.rowHeights?.slice(0,rowCount),rowFallback=storedRows?.length?storedRows.reduce((a,b)=>a+b,0)/storedRows.length:1;
  const rowWeights=storedRows?Array.from({length:rowCount},(_,i)=>storedRows[i]??rowFallback):undefined,rowTotal=rowWeights?.reduce((a,b)=>a+b,0)??1;
  const alignments=Array.from({length:columns},(_,j)=>{
    const explicit=s?.columnAlign?.[j];if(explicit&&explicit!=='auto')return explicit;
    const values=(e.cells??[]).slice(s?.headerRow===false?0:1).map(r=>(r[j]??'').trim()).filter(Boolean);
    const numeric=s?.numericAlign&&values.length&&values.every(v=>/^[+-]?(?:\d+(?:,\d{3})*)(?:\.\d+)?%?$/.test(v.replace(/^[\$€£¥]/,'').replace('−','-')));
    return numeric?'right':e.align;
  });
  return {...colors,headerText:header,headerRow:s?.headerRow??true,banded:s?.banded??false,stripe:s?.stripeFill??mix(background,ink,.035),
    borders:s?.borders??'grid',borderWidth:s?.borderWidth??1,padding:s?.padding??e.tableFit?.padding??12,verticalAlign:s?.verticalAlign??'top',
    widths:weights.map(w=>w/total),heights:rowWeights?.map(h=>h/rowTotal),alignments,fontFamily:e.fontFamily,fontSize:e.fontSize,underline:e.underline,strikethrough:e.strikethrough,bodyWeight:e.fontWeight,italic:e.italic,merges:s?.merges??[],cellStyles:s?.cellStyles??[],cellStyleIndex:new Map((s?.cellStyles??[]).map(cell=>[`${cell.row}:${cell.column}`,cell]))};
}
function tableCellSpan(p:ReturnType<typeof tablePresentation>,row:number,column:number){
  const m=p.merges.find(m=>row>=m.row&&row<m.row+m.rowSpan&&column>=m.column&&column<m.column+m.columnSpan);
  return {covered:Boolean(m&&(m.row!==row||m.column!==column)),rowSpan:m?.rowSpan??1,columnSpan:m?.columnSpan??1};
}
function tableCellBox(p:ReturnType<typeof tablePresentation>,row:number,column:number){
  const local=p.cellStyleIndex.get(`${row}:${column}`),grid=p.borders==='grid';
  const edge=(side:'top'|'right'|'bottom'|'left'):TableEdge=>{const value=local?.edges?.[side]??{width:grid||side==='bottom'&&p.borders==='rows'?p.borderWidth:0,color:p.line,style:'solid' as const};return value.color==='transparent'?{...value,width:0}:value;};
  return {insets:{top:local?.insets?.top??p.padding,right:local?.insets?.right??p.padding,bottom:local?.insets?.bottom??p.padding,left:local?.insets?.left??p.padding},edges:{top:edge('top'),right:edge('right'),bottom:edge('bottom'),left:edge('left')}};
}
function tableCellStyle(p:ReturnType<typeof tablePresentation>,row:number,column:number){
  const header=p.headerRow&&row===0,box=tableCellBox(p,row,column),border=(edge:TableEdge)=>edge.width>0&&edge.color!=='transparent'?`${edge.width}px ${edge.style} ${edge.color}`:'0';
  const local=p.cellStyleIndex.get(`${row}:${column}`);
  return {color:local?.color??(header?p.headerText:p.text),background:local?.fill??(header?p.header:p.banded&&(row-(p.headerRow?1:0))%2===1?p.stripe:p.background),
    fontFamily:local?.fontFamily??p.fontFamily,fontSize:`${local?.fontSize??p.fontSize}px`,textDecoration:[(local?.underline??p.underline)&&'underline',(local?.strikethrough??p.strikethrough)&&'line-through'].filter(Boolean).join(' ')||'none',fontWeight:local?.fontWeight??(header?600:p.bodyWeight),fontStyle:(local?.italic??p.italic)?'italic':'normal',textAlign:local?.align??p.alignments[column]??'left',verticalAlign:local?.verticalAlign??p.verticalAlign,padding:[box.insets.top,box.insets.right,box.insets.bottom,box.insets.left].map(value=>value+'px').join(' '),
    borderTop:border(box.edges.top),borderRight:border(box.edges.right),borderBottom:border(box.edges.bottom),borderLeft:border(box.edges.left)};
}

function tableCellRuns(p:ReturnType<typeof tablePresentation>,row:number,column:number,text:string):TableTextRun[]{
  const runs=p.cellStyleIndex.get(`${row}:${column}`)?.runs;return runs&&runs.map(run=>run.text).join('')===text?runs:[{text}];
}
function tableRunStyle(run:{fontFamily?:string;fontSize?:number;fontWeight?:number;italic?:boolean;underline?:boolean;strikethrough?:boolean;color?:string;letterSpacing?:number;baseline?:string},base?:{textDecoration:string},makeFontStack:(family:string)=>string=JSON.stringify){
  const style:Record<string,string|number>={};
  if(run.fontFamily!==undefined)style.fontFamily=makeFontStack(run.fontFamily);
  if(run.fontSize!==undefined)style.fontSize=run.fontSize+'px';
  if(run.fontWeight!==undefined)style.fontWeight=run.fontWeight;
  if(run.italic!==undefined)style.fontStyle=run.italic?'italic':'normal';
  if(base||run.underline!==undefined||run.strikethrough!==undefined)style.textDecoration=[(run.underline??base?.textDecoration.includes('underline'))&&'underline',(run.strikethrough??base?.textDecoration.includes('line-through'))&&'line-through'].filter(Boolean).join(' ')||'none';
  if(run.color!==undefined)style.color=run.color;
  if(run.letterSpacing!==undefined)style.letterSpacing=run.letterSpacing+'px';
  if(run.baseline!==undefined)style.verticalAlign=run.baseline==='super'?'super':run.baseline==='sub'?'sub':'baseline';
  return style;
}
return {tablePresetStyle,tableAppearance,tablePresentation,tableCellBox,tableCellStyle,tableCellSpan,tableCellRuns,tableRunStyle};
}
export const {tablePresetStyle,tableAppearance,tablePresentation,tableCellBox,tableCellStyle,tableCellSpan,tableCellRuns,tableRunStyle}=tableRendering();
export type TablePresentation=ReturnType<typeof tablePresentation>;
