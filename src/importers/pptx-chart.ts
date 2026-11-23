import {XMLParser} from 'fast-xml-parser';
import {orderedAlphaTransforms} from './pptx-color';
import {element,type SlideElement} from '../core/model';
import {validateChart,type Chart} from '../core/chart-schema';
const arr=(v:any):any[]=>v===undefined?[]:Array.isArray(v)?v:[v];
const tag=(s:string)=>s.replace(/^@_/,'').replace(/^.*:/,'');
const text=(v:any):string=>typeof v==='string'||typeof v==='number'?String(v):'';
const yes=(v:any,fallback=false)=>v===undefined?fallback:v===true||v==='1'||v==='true';
const parser=new XMLParser({ignoreAttributes:false,preserveOrder:true,trimValues:false,parseTagValue:false,parseAttributeValue:false});
function rich(parts:any[]):string {
  return parts.flatMap(p=>Object.entries(p).filter(([k])=>tag(k)==='p').map(([,children])=>(children as any[]).flatMap(c=>Object.entries(c).filter(([k])=>['r','br','fld'].includes(tag(k))).map(([k,v])=>tag(k)==='br'?'\n':text(tree(v as any[]).t))).join(''))).join('\n');
}
function tree(parts:any[]):any {
  if(parts.length&&parts.every(p=>'#text' in p))return parts.map(p=>p['#text']).join('');
  const result:any={};
  for(const part of parts)for(const [key,value] of Object.entries(part)){
    if(key===':@'||key==='#text'||key.startsWith('?'))continue;
    const name=tag(key),child=Array.isArray(value)?tree(value):{};
    const v=typeof child==='string'?child:{...Object.fromEntries(Object.entries(part[':@']??{}).map(([k,v])=>[tag(k),v])),...child};
    if(name==='rich'&&typeof v==='object')v.__text=rich(value as any[]);
    if(['srgbClr','schemeClr','sysClr'].includes(name)&&typeof v==='object'){const alpha=orderedAlphaTransforms(value as any[]);if(alpha.length)v.__alphaTransforms=alpha;}
    if(result[name]===undefined)result[name]=v;else result[name]=[...arr(result[name]),v];
  }
  return result;
}
class UnsupportedChart extends Error{}
const unsupported=(message:string):never=>{throw new UnsupportedChart(message);};
function cache(node:any):{values:string[];format?:string}|undefined {
  if(!node)return undefined;
  let data=node.strRef?.strCache??node.strLit??node.numRef?.numCache??node.numLit;
  if(node.multiLvlStrRef){const levels=arr(node.multiLvlStrRef.multiLvlStrCache?.lvl);if(levels.length!==1)unsupported('Multi-level category axes need a source reference.');data={...levels[0],ptCount:node.multiLvlStrRef.multiLvlStrCache?.ptCount};}
  if(!data)return undefined;
  const points=arr(data.pt);if(points.length>100)unsupported('Editable charts support 1–100 categories.');
  const count=Number(data.ptCount?.val??(points.length?Math.max(...points.map(p=>Number(p.idx)))+1:0));
  if(!Number.isInteger(count)||count<1||count>100)unsupported('Editable charts support 1–100 categories.');
  const values:(string|undefined)[]=Array(count);
  for(const point of points){const index=Number(point.idx);if(!Number.isInteger(index)||index<0||index>=count||values[index]!==undefined)unsupported('Chart data indices are inconsistent.');values[index]=text(point.v);}
  if(Array.from({length:count},(_,i)=>values[i]).some(v=>v===undefined))unsupported('This chart contains missing values. They are not replaced with zero.');
  return {values:values as string[],format:text(data.formatCode)||undefined};
}
function numeric(v:string):number {
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(v.trim())||!Number.isFinite(Number(v))||Math.abs(Number(v))>1e12)unsupported('Some chart values are blank, nonnumeric, or outside the editable range.');
  return Number(v);
}
function label(value:string,kind:string):string{if(!value.trim()||value.length>100)unsupported(`${kind} labels need 1–100 characters.`);return value;}
const rPr=(body:any)=>arr(body?.p)[0]?.pPr?.defRPr??arr(arr(body?.p)[0]?.r)[0]?.rPr??{};
function dataLabels(body:any,series:any[],count:number,round:boolean):any {
  const effective=series.flatMap(s=>{
    const common={...body.dLbls,...s.dLbls},overrides=new Map<number,any>();
    for(const point of [...arr(body.dLbls?.dLbl),...arr(s.dLbls?.dLbl)]){
      const index=Number(point.idx?.val);if(!Number.isInteger(index)||index<0||index>=count)unsupported('Chart label indices need review.');
      if(point.tx)unsupported('Custom chart label text needs a source reference.');
      overrides.set(index,{...overrides.get(index),...point});
    }
    return Array.from({length:count},(_,i)=>({...common,...overrides.get(i)}));
  });
  const semantics=(v:any)=>JSON.stringify([yes(v.showVal?.val),round&&yes(v.showPercent?.val),yes(v.delete?.val),v.numFmt?.formatCode??'']);
  if(effective.some(v=>semantics(v)!==semantics(effective[0])))unsupported('Different label values or formats within this chart need a source reference.');
  return effective[0]??{};
}
function title(node:any):string{const v=node?.tx?.rich?.__text??cache(node?.tx)?.values[0]??text(node?.tx?.v);return v;}
function format(code:string|undefined,warn:(s:string)=>void):Pick<Chart,'prefix'|'suffix'|'numberFormat'> {
  if(!code||code==='General')return {prefix:'',suffix:''};
  const first=code.split(';')[0],match=first.match(/^(.*?)([#0][#0,]*(?:\.[#0]+)?)(.*?)$/);
  if(!match||/[Ee][+-]0|[ymdhs]/i.test(first.replace(/"[^"]*"|\\./g,''))){warn('Review the source chart’s custom number format.');return {prefix:'',suffix:''};}
  const literal=(s:string)=>s.replace(/"([^"]*)"|\\(.)/g,(_,a,b)=>a??b).replace(/\[[^\]]*\]/g,'').replace(/[_*]./g,'');
  const percent=/(?<!\\)%(?=(?:[^"]*"[^"]*")*[^"]*$)/.test(first),prefix=literal(match[1]),suffix=literal(match[3].replace(percent?/%/:/$^/,'')),decimals=match[2].split('.')[1]?.length??0;
  if(prefix.length>12||suffix.length>12||decimals>4){warn('Review the source chart’s custom number format.');return {prefix:'',suffix:''};}
  if(code.includes(';')||match[2].includes('#')&&match[2].includes('.'))warn('Review optional decimals and negative-value formatting against the source.');
  return {prefix,suffix,numberFormat:{grouping:match[2].includes(','),decimals,...(percent?{percent:true}:{})}};
}
export type ChartImportContext={points:(v:number)=>number;font:(v:string)=>string;color:(node:any,fallback?:string)=>string;warn:(s:string)=>void};
/** Read the stored display cache. Never evaluate workbook formulas or fetch links. */
export function importPptxChart(raw:string,frame:Partial<SlideElement>,context:ChartImportContext):SlideElement|undefined {
  const {warn,points,font,color}=context;
  try{
    const space=tree(parser.parse(raw)).chartSpace,source=space?.chart,plot=source?.plotArea;
    const plots=Object.entries(plot??{}).filter(([key])=>key.endsWith('Chart'));
    if(plots.length!==1||Array.isArray(plots[0][1]))unsupported('Combination charts need a source reference.');
    const [kind,bodyValue]=plots[0],body=bodyValue as any;
    const types:Record<string,Chart['type']>={barChart:body.barDir?.val==='bar'?'bar':'column',lineChart:'line',areaChart:'area',pieChart:'pie',doughnutChart:'donut'};
    const type=types[kind];if(!type)unsupported('This chart type needs a source reference.');
    if(body.grouping?.val==='percentStacked')unsupported('Percentage-stacked charts need a source reference.');
    if(plot.dateAx||arr(plot.valAx).some(ax=>ax.scaling?.logBase))unsupported('Date and logarithmic axes need a source reference.');
    const round=type==='pie'||type==='donut',seriesNodes=arr(body.ser).sort((a,b)=>Number(a.order?.val??0)-Number(b.order?.val??0));
    if(!seriesNodes.length||seriesNodes.length>8||round&&seriesNodes.length!==1)unsupported('Editable charts support up to eight series and one series per pie or donut.');
    const categories=seriesNodes.map(s=>cache(s.cat)),valueCaches=seriesNodes.map(s=>cache(s.val));
    if(valueCaches.some(c=>!c))unsupported('The chart has no stored numeric cache.');
    let labels=categories.find(Boolean)?.values;
    if(!labels){labels=valueCaches[0]!.values.map((_,i)=>String(i+1));warn('Category labels were missing; editable categories are numbered.');}
    labels=labels.map(v=>label(v,'Category'));
    for(const c of categories)if(c&&(c.values.length!==labels.length||c.values.some((v,i)=>v!==labels[i])))unsupported('Series use different category axes.');
    const series=seriesNodes.map((s,i)=>{const name=label((cache(s.tx)?.values[0]??text(s.tx?.v))||`Series ${i+1}`,'Series'),values=valueCaches[i]!.values.map(numeric);if(values.length!==labels.length)unsupported('Chart series lengths do not match their categories.');return {name,values};});
    if(new Set(series.map(s=>s.name)).size!==series.length)unsupported('Duplicate series names need review before editable import.');
    const palette=['#4472C4','#ED7D31','#A5A5A5','#FFC000','#5B9BD5','#70AD47'];
    const fallback=(i:number)=>color({schemeClr:{val:`accent${i%6+1}`}},palette[i%6]);
    const fill=(props:any)=>props&&(props.solidFill!==undefined||props.noFill!==undefined)?props:undefined;
    const seriesColor=(s:any,i:number)=>color((type==='line'||type==='area')?fill(s.spPr?.ln)??fill(s.spPr):fill(s.spPr),fallback(i));
    const categoryPaint=seriesNodes.length===1&&(type==='bar'||type==='column')&&arr(seriesNodes[0].dPt).some(point=>fill(point.spPr));
    const colors=round||categoryPaint?labels.map((_,i)=>{
      const point=arr(seriesNodes[0].dPt).find(p=>Number(p.idx?.val)===i);
      return color(fill(point?.spPr),yes(body.varyColors?.val,round)?fallback(i):seriesColor(seriesNodes[0],0));
    }):seriesNodes.map(seriesColor);
    const alpha=(value:string)=>value==='transparent'?0:value.length===9?parseInt(value.slice(7),16)/255:1;
    let areaOpacity=1;
    if(type==='area'){
      const fills=seriesNodes.map((series,i)=>color(fill(series.spPr),colors[i]));
      const ratios=fills.map((value,i)=>alpha(colors[i])?alpha(value)/alpha(colors[i]):alpha(value)?Infinity:1);
      if(fills.some((value,i)=>value.toLowerCase().slice(0,7)!==colors[i].toLowerCase().slice(0,7)&&alpha(value)>0)||ratios.some(ratio=>ratio>1||!Number.isFinite(ratio))||ratios.some(ratio=>Math.abs(ratio-ratios[0])>1/255))warn('Review distinct area fill and line paints against the source reference.');
      areaOpacity=Math.max(0,Math.min(1,ratios[0]));
    }
    if(!round&&!categoryPaint&&seriesNodes.some((series,i)=>arr(series.dPt).some(point=>fill(point.spPr)&&color(fill(point.spPr),colors[i]).toLowerCase()!==colors[i].toLowerCase())))warn('Review custom point paints against the source reference.');
    const cat=arr(plot.catAx)[0],val=arr(plot.valAx)[0],labelsNode=dataLabels(body,seriesNodes,labels.length,round),globalStyle=rPr(space.txPr),axisStyle=rPr(cat?.txPr??val?.txPr),labelStyle=rPr(labelsNode?.txPr);
    const chartTitle=title(source.title),categoryTitle=title(cat?.title),valueTitle=title(val?.title);
    if(chartTitle.length>200||categoryTitle.length>80||valueTitle.length>80)unsupported('Chart titles exceed the editable text limits.');
    const clamped=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,Math.round(n*1e6)/1e6));
    const valueMode=round?(yes(labelsNode?.showVal?.val)?yes(labelsNode?.showPercent?.val)?'both':'value':'percent'):undefined;
    const formatCode=round&&valueMode==='percent'?valueCaches[0]?.format:val?.numFmt?.formatCode??labelsNode?.numFmt?.formatCode??valueCaches[0]?.format;
    const percentFormat=round&&valueMode!=='value'?format(labelsNode?.numFmt?.formatCode,warn).numberFormat:undefined;
    const c:Chart={type,labels,series,colors,textColor:color(globalStyle,'#26362c'),title:chartTitle,subtitle:'',source:'',legend:Boolean(source.legend)&&!yes(source.legend?.delete?.val),legendPosition:({t:'top',b:'bottom',l:'left',r:'right'} as const)[source.legend?.legendPos?.val as 't']??'auto',grid:!round&&arr(plot.valAx).some(a=>a.majorGridlines!==undefined),showValues:!yes(labelsNode?.delete?.val)&&(yes(labelsNode?.showVal?.val)||round&&yes(labelsNode?.showPercent?.val)),stacked:body.grouping?.val==='stacked',categoryTitle,valueTitle,...format(formatCode,warn),adaptive:false,...(categoryPaint?{colorCategories:labels}:{}),
      ...(!round?{categoryReverse:type==='bar'?cat?.scaling?.orientation?.val!=='maxMin':cat?.scaling?.orientation?.val==='maxMin',valueReverse:val?.scaling?.orientation?.val==='maxMin'}:{}),
      axisStyle:!round?{fontSize:clamped(points(Number(axisStyle.sz??globalStyle.sz??1200)/100),12,40),rotation:clamped(Number(cat?.txPr?.bodyPr?.rot??0)/60000,-90,90),showLabels:cat?.tickLblPos?.val!=='none'&&val?.tickLblPos?.val!=='none'}:undefined,
      visual:{cornerRadius:0,...(round?{donutHole:clamped(Number(body.holeSize?.val??60),10,90),pieRotation:Number(body.firstSliceAng?.val??0)}:{lineWidth:clamped(Number(seriesNodes[0].spPr?.ln?.w??25400)/12700*points(1),1,8),pointSize:seriesNodes[0].marker?.symbol?.val==='none'?0:clamped(points(Number(seriesNodes[0].marker?.size?.val??5)),0,16),smooth:yes(seriesNodes[0].smooth?.val??body.smooth?.val),areaOpacity})},
      dataLabels:{...(valueMode?{valueMode,...(percentFormat?.decimals!==undefined?{percentDecimals:percentFormat.decimals}:{})}:{}),position:['inEnd','ctr','inBase'].includes(labelsNode?.dLblPos?.val)?'inside':labelsNode?.dLblPos?.val==='outEnd'?'outside':'auto',...(labelStyle.sz?{fontSize:clamped(points(Number(labelStyle.sz)/100),10,48)}:{}),...((labelStyle.solidFill||labelStyle.noFill)?{color:color(labelStyle,'#26362c')}:{})},
    };
    const bound=(node:any)=>{if(node===undefined)return undefined;const value=text(node.val);if(!value.trim()||!Number.isFinite(Number(value)))unsupported('The value-axis bounds need review.');return Number(value);};
    const minimum=bound(val?.scaling?.min),maximum=bound(val?.scaling?.max);
    if(minimum!==undefined||maximum!==undefined)c.axisRange={...(minimum!==undefined?{min:minimum}:{}),...(maximum!==undefined?{max:maximum}:{})};
    if(space.externalData)warn('Chart values are an editable snapshot; workbook links are not refreshed.');
    warn('Chart data is editable. Compare fonts, axes, labels and effects with the source reference.');
    const validated=(()=>{try{return validateChart(c);}catch(error){return unsupported(`The source chart needs review: ${(error as Error).message}`);}})();
    return element('chart',{...frame,chart:validated,fill:colors[0],fontFamily:font(globalStyle.latin?.typeface??axisStyle.latin?.typeface),fontSize:clamped(points(Number(globalStyle.sz??1200)/100),18,28)});
  }catch(error){if(error instanceof UnsupportedChart){warn(error.message);return undefined;}throw error;}
}
