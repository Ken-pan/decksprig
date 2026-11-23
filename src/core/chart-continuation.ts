import {uid,type Slide,type SlideElement} from './model';
import {readableChartRange} from './chart-range';
import {inlineTextWidth} from './inline-text-width';
/** Long labels get enough rows of space; no category or value is elided. */
export function continueChart(slide:Slide,id:string):Slide[]{
  const e=slide.elements.find(v=>v.id===id);if(!e?.chart?.adaptive)return [slide];
  const c={...e.chart};const columnWidth=(e.w-140)/c.labels.length;if(c.type==='column'&&c.labels.some(label=>[...label].length*Math.min(28,e.fontSize)*.55>columnWidth*3))c.type='bar';if(c.type!=='bar')return [slide];
  const font=Math.min(28,e.fontSize),labelW=Math.min(e.w*.46,Math.max(200,Math.max(...c.labels.map(l=>inlineTextWidth(l,font,e.fontFamily)))+16));
  const lines=Math.max(...c.labels.map(l=>Math.ceil(inlineTextWidth(l,font,e.fontFamily)/labelW)));
  if(lines<=1&&c.labels.length<=8)return [slide];
  const overhead=24+(c.title?font*1.8:0)+(c.subtitle?font*1.6:0)+font+24+(c.source?font*1.8:0)+(c.legend?font*2:0)+font*1.4+(c.valueTitle?font*2.5:0);
  const cap=Math.max(1,Math.min(8,Math.floor((e.h-overhead)/(lines*font*1.25+6))));
  if(c.labels.length<=cap)return [slide];
  const authored=e.chart.axisRange,range=readableChartRange([...e.chart.series.flatMap(s=>s.values),...[authored?.min,authored?.max].filter((v):v is number=>v!==undefined)]);
  const min=authored?.min??Math.min(range.min,(authored?.max??range.max)-range.step),max=authored?.max??Math.max(range.max,min+range.step),axisRange={min,max};
  return Array.from({length:Math.ceil(c.labels.length/cap)},(_,i)=>{
    const begin=i*cap,chart={...e.chart!,axisRange,labels:e.chart!.labels.slice(begin,begin+cap),series:e.chart!.series.map(s=>({...s,values:s.values.slice(begin,begin+cap)}))};
    if(!i)return {...slide,elements:slide.elements.map(v=>v.id===id?{...v,chart}:v)};
    const ids=new Map([...slide.elements.map(v=>v.id),...(slide.groups??[]).map(g=>g.id)].map(id=>[id,uid('continued')]));
    return {...slide,id:uid('slide'),transition:{effect:'fade',duration:300,easing:'linear'},notes:slide.notes+' Chart continuation; all categories retained.',elements:slide.elements.map(v=>({...v,id:ids.get(v.id)!,group:v.group?ids.get(v.group):undefined,...(v.id===id?{chart}:{}),...(v.type==='text'&&v.y>=736?{text:'Continued'}:{})})),groups:slide.groups?.map(g=>({...g,id:ids.get(g.id)!,parent:g.parent?ids.get(g.parent):undefined})),autoLayouts:slide.autoLayouts?.map(l=>({...l,id:ids.get(l.id)!,order:l.order.map(id=>ids.get(id)!)}))};
  });
}
