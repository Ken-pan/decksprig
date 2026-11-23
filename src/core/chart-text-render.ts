import type {EChartsType} from 'echarts/core';
import {getECData} from 'echarts/lib/util/innerStore.js';
import {vNodeToString,type SVGVNode} from 'zrender/lib/svg/core.js';
import type SVGPainter from 'zrender/lib/svg/Painter.js';
import type {Chart} from './chart-schema';
import {chartTextLabel,chartTextValue,type ChartTextTarget} from './chart-text';
function svgString(v:SVGVNode):string{
  const attribute=(value:string)=>value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  // zrender serializes attribute values verbatim. CSS font stacks and chart
  // accessibility labels can contain quotes/ampersands, which must remain XML.
  const encode=(node:SVGVNode):SVGVNode=>({...node,attrs:Object.fromEntries(Object.entries(node.attrs??{}).filter(([,value])=>value!==undefined&&value!==null&&value!==false).map(([key,value])=>[key,value===true?'true':typeof value==='string'?attribute(value):value])),children:node.children?.map(encode)});
  return vNodeToString(encode(v),{newline:true});
}
export function renderStaticChartSvg(chart:EChartsType):string{
  return svgString((chart.getZr().painter as SVGPainter).renderToVNode({animation:false,willUpdate:false,compress:true,useViewBox:true}));
}
/** Pinned renderer identities resolve labels even when strings repeat or truncate. */
export function renderEditableChartText(chart:EChartsType,c:Chart):string{
  const formats=new Map<string,'axis'|'labels'>();
  const zr=chart.getZr(),painter=zr.painter as SVGPainter,targets=new Map<string,{target:ChartTextTarget;rect:{x:number;y:number;width:number;height:number};transform?:string}>();
  for(const el of zr.storage.getDisplayList(true)){
    if(el.type!=='tspan')continue;
    let target:ChartTextTarget|undefined,format:'axis'|'labels'|undefined;
    let node=el as typeof el&{__hostTarget?:typeof el;__legendDataIndex?:number;name?:string;style:{text?:string;fontWeight?:number|string}};
    for(let depth=0;node&&depth<12;depth++){
      const metadata=getECData(node),event=metadata.eventData as {componentType?:string;targetType?:string;dataIndex?:number;value?:string}|undefined;
      if((c.type==='pie'||c.type==='donut')&&!c.legend&&c.showValues&&metadata.ssrType==='chart'&&metadata.dataIndex!==undefined)target={kind:'category',index:metadata.dataIndex};
      if(node.__legendDataIndex!==undefined)target={kind:c.type==='pie'||c.type==='donut'?'category':'series',index:node.__legendDataIndex};
      if(event?.componentType==='title')target={kind:Number(node.style.fontWeight)===600?'title':'subtitle'};
      if(event?.componentType==='legend'){
        const round=c.type==='pie'||c.type==='donut',index=round?c.labels.indexOf(event.value??''):c.series.findIndex(s=>s.name===event.value);
        if(index>=0)target={kind:round?'category':'series',index};
      }
      if(event?.targetType==='axisLabel'){if((event.componentType==='xAxis')===(c.type!=='bar')&&event.dataIndex!==undefined)target={kind:'category',index:event.dataIndex};else format='axis';}
      if(metadata.ssrType==='chart'&&metadata.dataIndex!==undefined&&!target)format='labels';
      if(event?.targetType==='axisName')target={kind:(event.componentType==='xAxis')===(c.type!=='bar')?'categoryTitle':'valueTitle'};
      if(node.name==='deck-chart-source')target={kind:'source'};
      const side=/^deck-chart-category-(\d+)$/.exec(node.name??'');if(side)target={kind:'category',index:Number(side[1])};
      if(target||format)break;
      node=(node.__hostTarget??node.parent) as typeof node;
    }
    if(format)formats.set(String(el.id),format);
    if(target&&chartTextValue(c,target)!==undefined){const rect=el.getBoundingRect().clone(),matrix=el.getComputedTransform();targets.set(String(el.id),{target,rect,transform:matrix?`matrix(${matrix.join(' ')})`:undefined});}
  }
  const svg=painter.renderToVNode({animation:false,willUpdate:false,compress:true,useViewBox:true}),claimed=new Set<string>();
  function mark(v:SVGVNode):SVGVNode{
    if(v.children)v.children=v.children.map(mark);
    const found=targets.get(v.key),format=formats.get(v.key);if(v.tag!=='text')return v;
    if(format&&!found){const first=!claimed.has(format);claimed.add(format);return {tag:'g',key:`format-${v.key}`,attrs:{'data-chart-format':format,'data-focus-key':`chart:format:${format}`,role:'button',tabindex:first?0:-1,'aria-label':format==='axis'?'Format value axis':'Format data labels'},children:[v]};}
    if(!found)return v;
    const {target:t,rect:r}=found,key=`${t.kind}:${t.index??''}`,first=!claimed.has(key);claimed.add(key);
    return {tag:'g',key:`edit-${v.key}`,attrs:{'data-chart-text':t.kind,'data-chart-text-index':t.index??'','data-focus-key':`chart:${key}`,role:'button',tabindex:first?0:-1,'aria-label':`${chartTextLabel(t)}: ${chartTextValue(c,t)} · Click to edit`},children:[{tag:'rect',key:`hit-${v.key}`,attrs:{x:r.x-4,y:r.y-4,width:Math.max(8,r.width)+8,height:Math.max(16,r.height)+8,transform:found.transform,fill:'transparent','data-chart-text-hit':true}},v]};
  }
  return svgString(mark(svg));
}
