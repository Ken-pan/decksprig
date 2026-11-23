import {element,type SlideElement} from '../core/model';
import type {TableCellStyle,TableMerge,TableStyle,TableTextRun,TableEdge} from '../core/table-schema';
import {pptxTextProperties} from './pptx-color';

const list=(value:any):any[]=>value===undefined?[]:Array.isArray(value)?value:[value];
const yes=(value:any)=>value===true||value==='1'||value==='true';
const text=(value:any):string=>typeof value==='string'||typeof value==='number'?String(value):'';

/** Ordered DrawingML paragraphs are attached by the PPTX XML reader. */
export function pptxBodyText(body:any):string {
  const paragraphs=body?.__contents;
  if(paragraphs)return paragraphs.map((runs:any[])=>runs.map(({kind,node})=>kind==='br'?'\n':text(node.t)).join('')).join('\n');
  return list(body?.p).map(p=>list(p.r).map(r=>text(r.t)).join('')).join('\n');
}

type Context={xScale:number;yScale:number;points:(value:number)=>number;font:(value:string)=>string;color:(value:any,fallback?:string)=>string;textColor?:(value:any,fallback?:string)=>string;warn:(message:string)=>void};
const review='Review theme table styles and paragraph formatting against the source reference.';

/** Never infer a merge from text/empty cells: require the complete native rectangle. */
function tableMerges(rows:any[][],columns:number):TableMerge[]|undefined {
  const occupied=new Set<string>(),merges:TableMerge[]=[];
  for(let row=0;row<rows.length;row++)for(let column=0;column<columns;column++){
    const cell=rows[row][column];if(!cell)return undefined;
    const key=`${row}:${column}`;if(occupied.has(key))continue;
    const rowSpan=Number(cell.rowSpan??1),columnSpan=Number(cell.gridSpan??1);
    if(yes(cell.hMerge)||yes(cell.vMerge)||!Number.isInteger(rowSpan)||!Number.isInteger(columnSpan)||rowSpan<1||columnSpan<1||row+rowSpan>rows.length||column+columnSpan>columns)return undefined;
    if(rowSpan===1&&columnSpan===1)continue;
    for(let r=row;r<row+rowSpan;r++)for(let c=column;c<column+columnSpan;c++){
      const member=rows[r][c],id=`${r}:${c}`;
      if(!member||occupied.has(id)||yes(member.hMerge)!==(c>column)||yes(member.vMerge)!==(r>row))return undefined;
      occupied.add(id);
    }
    merges.push({row,column,rowSpan,columnSpan});
  }
  return merges;
}

export function importPptxTable(table:any,frame:Partial<SlideElement>,context:Context):SlideElement|undefined {
  const {font,color,points,warn,xScale,yScale}=context,sourceRows=list(table.tr),rows=sourceRows.map(row=>list(row.tc));
  const ink=context.textColor??((style:any,fallback?:string)=>style?.noFill!==undefined?'transparent':color(style?.solidFill??style,fallback));
  const solid=(node:any,fallback='transparent')=>{const paint=ink(node,fallback);return /^#[\da-f]{6}00$/i.test(paint)?'transparent':paint;};
  const grid=list(table.tblGrid?.gridCol),columns=Math.max(grid.length,...rows.map(row=>row.length));
  if(!rows.length||!columns)throw new Error('This source table has no readable cells. Import a PDF copy or repair the table in PowerPoint.');
  if(rows.length>100||columns>20)throw new Error('Import tables with up to 100 rows and 20 columns. Split this table in PowerPoint or import a PDF copy.');
  const cells=rows.map(row=>Array.from({length:columns},(_,column)=>pptxBodyText(row[column]?.txBody)));
  if(rows.some(row=>row.length!==columns))warn('Some source table cells are missing. Review the editable grid.');
  const scaled=(values:any[],unit:number)=>{
    const result=values.map(value=>Number(value)*unit);
    return result.length&&result.every(value=>Number.isFinite(value)&&value>0&&value<=20000)?result:undefined;
  };
  const widths=grid.length===columns?scaled(grid.map(column=>column.w),xScale):undefined,heights=scaled(sourceRows.map(row=>row.h),yScale);
  if(!widths||!heights)warn('Some source table sizes could not be read. Review row and column sizes.');
  const merges=tableMerges(rows,columns);
  if(!merges)warn('Some source table merges are inconsistent. Cells stay separate so their values remain accessible.');
  const covered=(row:number,column:number)=>merges?.some(m=>(row!==m.row||column!==m.column)&&row>=m.row&&row<m.row+m.rowSpan&&column>=m.column&&column<m.column+m.columnSpan);
  const first=rows[0][0],firstParagraph=list(first?.txBody?.p)[0],firstRun=list(firstParagraph?.r)[0];
  const base=pptxTextProperties(firstParagraph?.pPr?.defRPr,firstRun?.rPr),baseSize=points(Number(base.sz??1800)/100);
  const size=(value:number)=>Number.isFinite(value)?Math.max(4,Math.min(500,Math.round(value*1e6)/1e6)):points(18);
  const fill=solid(first?.tcPr?.solidFill,'transparent'),paddingValues:number[]=[],borders:{width:number;color:string;visible:boolean}[]=[];
  const boxes=new Map<string,{insets:{top:number;right:number;bottom:number;left:number};edges:{top:TableEdge;right:TableEdge;bottom:TableEdge;left:TableEdge}}>();
  const cellStyles:TableCellStyle[]=rows.flatMap((row,r)=>row.map((cell,c)=>{
    const paragraph=list(cell.txBody?.p)[0],run=list(paragraph?.r)[0],style=pptxTextProperties(paragraph?.pPr?.defRPr,run?.rPr),properties=cell.tcPr??{};
    const inset=(side:string,fallback:number,horizontal=false)=>{const value=Number(properties[side]??fallback)*(horizontal?xScale:yScale);if(!Number.isFinite(value)||value<0||value>1000){warn('Some source cell margins exceed editable limits. Review cell spacing against the reference.');return Math.max(0,Math.min(1000,Number.isFinite(value)?value:0));}return Math.round(value*1e6)/1e6;};
    const edge=(side:string):TableEdge=>{const line=properties[side],ink=line?.noFill!==undefined?'transparent':solid(line?.solidFill,'transparent'),width=Number(line?.w??0)*xScale,dash=line?.prstDash?.val,compound=line?.cmpd;
      if(line?.custDash||line?.gradFill||line?.pattFill||compound&& !['sng','dbl'].includes(compound)||dash&&!['solid','dash','sysDash','lgDash','dot','sysDot'].includes(dash))warn('Review complex source cell border patterns against the reference.');
      if(!Number.isFinite(width)||width<0||width>100)warn('Some source cell borders exceed editable limits. Review line widths against the reference.');
      return {width:ink==='transparent'?0:Math.round(Math.max(0,Math.min(100,Number.isFinite(width)?width:0))*1e6)/1e6,color:ink,style:compound==='dbl'?'double':['dot','sysDot'].includes(dash)?'dotted':['dash','sysDash','lgDash'].includes(dash)?'dashed':'solid'};};
    const box={insets:{top:inset('marT',45720),right:inset('marR',91440,true),bottom:inset('marB',45720),left:inset('marL',91440,true)},edges:{top:edge('lnT'),right:edge('lnR'),bottom:edge('lnB'),left:edge('lnL')}};
    if(!covered(r,c)){boxes.set(`${r}:${c}`,box);paddingValues.push(box.insets.left,...[box.insets.right,box.insets.top,box.insets.bottom]);for(const line of Object.values(box.edges))borders.push({...line,visible:line.color!=='transparent'&&line.width>0});}
    const result:TableCellStyle={row:r,column:c,fontFamily:font(style.latin?.typeface),fontSize:size(points(Number(style.sz??base.sz??1800)/100)),fontWeight:yes(style.b)?700:400,italic:yes(style.i),underline:style.u!==undefined&&style.u!=='none',strikethrough:style.strike==='sngStrike'||style.strike==='dblStrike',color:ink(style,ink(base,'#26362c')),fill:properties.noFill!==undefined?'transparent':solid(properties.solidFill,fill),align:({ctr:'center',r:'right'} as const)[paragraph?.pPr?.algn as 'ctr'|'r']??'left',verticalAlign:({ctr:'middle',b:'bottom'} as const)[properties.anchor as 'ctr'|'b']??'top'};
    const paragraphs=list(cell.txBody?.p),ordered=cell.txBody?.__contents??paragraphs.map(p=>list(p.r).map(node=>({kind:'r',node}))),runs:TableTextRun[]=[];
    const add=(content:string,raw:any)=>{
      if(!content)return;
      const rich:TableTextRun={text:content},effective={fontFamily:font(raw.latin?.typeface??result.fontFamily),fontSize:size(points(Number(raw.sz??style.sz??base.sz??1800)/100)),fontWeight:yes(raw.b)?700:400,italic:yes(raw.i),underline:raw.u!==undefined&&raw.u!=='none',strikethrough:raw.strike==='sngStrike'||raw.strike==='dblStrike',color:ink(raw,result.color!)};
      for(const key of Object.keys(effective) as (keyof typeof effective)[])if(effective[key]!==result[key])Object.assign(rich,{[key]:effective[key]});
      if(raw.spc!==undefined){const spacing=points(Number(raw.spc)/100);if(Number.isFinite(spacing)&&spacing>=-50&&spacing<=100&&spacing!==0)rich.letterSpacing=Math.round(spacing*1e6)/1e6;else if(spacing!==0)warn('Review character spacing in the source table.');}
      const baseline=Number(raw.baseline??0);if(baseline)rich.baseline=baseline>0?'super':'sub';
      if(raw.cap&&raw.cap!=='none')warn('Review source table text case against the reference.');
      const previous=runs.at(-1),{text:_,...format}=rich;
      if(previous){const {text:__,...old}=previous;if(JSON.stringify(old)===JSON.stringify(format)){previous.text+=content;return;}}
      runs.push(rich);
    };
    ordered.forEach((parts:any[],index:number)=>{if(index)add('\n',paragraphs[index]?.pPr?.defRPr??{});for(const part of parts)add(part.kind==='br'?'\n':text(part.node.t),pptxTextProperties(paragraphs[index]?.pPr?.defRPr,part.node.rPr));});
    if(runs.some(run=>Object.keys(run).length>1))result.runs=runs;
    return result;
  }));
  // Body geometry is the common source geometry, rather than the first decorative heading.
  const lineCounts=new Map<string,number>(),paddingCounts=new Map<number,number>();let commonLine:typeof borders[number]|undefined,bestLine=0,padding=paddingValues[0]??0,bestPadding=0;
  for(const line of borders){const key=line.visible?`${line.width}:${line.color}`:'none',count=(lineCounts.get(key)??0)+1;lineCounts.set(key,count);if(count>bestLine){bestLine=count;commonLine=line;}}
  for(const value of paddingValues){const count=(paddingCounts.get(value)??0)+1;paddingCounts.set(value,count);if(count>bestPadding){bestPadding=count;padding=value;}}
  const border=commonLine?.visible?commonLine:undefined;
  // Keep only differences from inherited table geometry; ordinary uniform tables stay compact.
  for(const cell of cellStyles){const box=boxes.get(`${cell.row}:${cell.column}`);if(!box)continue;const insets=Object.fromEntries(Object.entries(box.insets).filter(([,value])=>Math.abs(value-padding)>.000001));if(Object.keys(insets).length)cell.insets=insets;
    const edges=Object.fromEntries(Object.entries(box.edges).filter(([,line])=>Math.abs(line.width-(border?.width??0))>.000001||line.color!==(border?.color??'transparent')||line.style!=='solid'));if(Object.keys(edges).length)cell.edges=edges;
  }
  // Body defaults should describe the table, rather than the first merged
  // heading. Only actual differences need local overrides; new rows and whole
  // table controls then keep the same inheritance as manually authored tables.
  const visible=cellStyles.filter(cell=>!covered(cell.row,cell.column));
  function common<K extends keyof TableCellStyle>(key:K,fallback:NonNullable<TableCellStyle[K]>):NonNullable<TableCellStyle[K]>{
    const counts=new Map<NonNullable<TableCellStyle[K]>,number>();let result=fallback,best=0;
    for(const cell of visible){const value=cell[key];if(value===undefined)continue;const count=(counts.get(value)??0)+1;counts.set(value,count);if(count>best){result=value;best=count;}}
    return result;
  }
  const defaults={fontFamily:common('fontFamily',font(base.latin?.typeface)),fontSize:common('fontSize',size(baseSize)),fontWeight:common('fontWeight',400),italic:common('italic',false),underline:common('underline',false),strikethrough:common('strikethrough',false),align:common('align','left'),verticalAlign:common('verticalAlign','top'),color:common('color',ink(base,'#26362c')),fill:common('fill',fill)};
  const overrides=cellStyles.flatMap(cell=>{
    if(covered(cell.row,cell.column)&&!rows[cell.row][cell.column].txBody)return [];
    const local={...cell};for(const key of Object.keys(defaults) as (keyof typeof defaults)[])if(local[key]===defaults[key])delete local[key];
    return Object.keys(local).length>2?[local]:[];
  });
  const style:TableStyle={headerRow:false,banded:false,numericAlign:false,borders:border?'grid':'none',borderWidth:Math.min(100,border?.width??0),lineColor:border?.color??'transparent',padding:Math.max(0,Math.min(1000,Number.isFinite(padding)?padding:0)),bodyFill:defaults.fill,verticalAlign:defaults.verticalAlign,...(widths?{columnWidths:widths}:{}),...(heights?{rowHeights:heights}:{}),...(merges?.length?{merges}:{}),...(overrides.length?{cellStyles:overrides}:{})};
  // Native table grids, unlike the enclosing graphic frame, carry the actual
  // row sizes (some producers leave the frame height at its default one inch).
  const {color:defaultInk,fill:background,...textDefaults}=defaults;
  const result=element('table',{...frame,...(widths?{w:widths.reduce((a,b)=>a+b,0)}:{}),...(heights?{h:heights.reduce((a,b)=>a+b,0)}:{}),cells,...textDefaults,fill:defaultInk,stroke:border?.color??'transparent',strokeWidth:border?.width??0,tableStyle:style});
  if(heights&&frame.h!==undefined&&Math.abs(result.h-frame.h)>1)warn('Table text may reflow between apps. Compare wrapping and row spacing with the source reference.');
  if(table.tblPr?.tableStyleId||rows.some(row=>row.some(cell=>list(cell.txBody?.p).some(p=>p.pPr?.lnSpc||p.pPr?.spcBef||p.pPr?.spcAft||p.pPr?.buChar||p.pPr?.buAutoNum))))warn(review);
  return result;
}
