import test from 'node:test';
import assert from 'node:assert/strict';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import {XMLParser} from 'fast-xml-parser';
import {importPptx} from '../src/importers/pptx';
import {buildPptx} from '../src/core/pptx-export';
import {ChartSchema,validateChart} from '../src/core/chart-schema';
import {sampleChart} from '../src/core/charts';
import {element,blankSlide,newDeck} from '../src/core/model';
import {chartOption,renderChartSvg} from '../src/core/chart-render';
import {chartLabelLayout} from '../src/core/chart-layout';
import {continueChart} from '../src/core/chart-continuation';
import {applyImmutableOperations} from '../src/core/operations';
const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'',removeNSPrefix:true});
async function fixture(type:'bar'|'column'|'line',bound:{min?:number;max?:number}){
 const p=new PptxGenJS();p.layout='LAYOUT_WIDE';const s=p.addSlide();s.addChart(type==='line'?p.ChartType.line:p.ChartType.bar,[{name:'Score',labels:['First','Second','Third'],values:[92,95,98]}],{x:1,y:1,w:10,h:5,barDir:type==='bar'?'bar':'col',valAxisMinVal:bound.min,valAxisMaxVal:bound.max,showTitle:true,title:'Authored range'});s.addNotes('Keep authored notes');return p.write({outputType:'uint8array'}) as Promise<Uint8Array>;
}
const get=(d:Awaited<ReturnType<typeof importPptx>>)=>d.slides[0].elements.find(e=>e.type==='chart')!;
test('one-sided native value-axis bounds survive import, rendering and native export without inventing the other bound',async()=>{
 for(const type of ['bar','column','line'] as const)for(const range of [{min:90},{max:100}]){
  const bytes=await fixture(type,range),d=await importPptx(bytes,'one-bound.pptx'),e=get(d);assert.deepEqual(e.chart!.axisRange,range);assert.equal(e.chart!.axisStyle?.fontSize,18,'Source 12pt labels must not expose binary conversion noise');
  const option=chartOption(e) as any,axis=type==='bar'?option.xAxis:option.yAxis;assert.equal(axis.min,range.min);assert.equal(axis.max,range.max);assert(Number.isFinite(chartLabelLayout(e,e.chart!).leftLabelWidth));assert(!renderChartSvg(e,true).includes('NaN'));
  const zip=await JSZip.loadAsync(await buildPptx(d)),name=Object.keys(zip.files).find(p=>/^ppt\/charts\/chart\d+\.xml$/.test(p))!,native=parser.parse(await zip.file(name)!.async('string')).chartSpace.chart.plotArea.valAx.scaling;
  assert.equal(native.min===undefined?undefined:Number(native.min.val),range.min);assert.equal(native.max===undefined?undefined:Number(native.max.val),range.max);const back=await importPptx(await buildPptx(d),'export.pptx');assert.deepEqual(get(back).chart!.axisRange,range);assert.equal(back.slides[0].notes,d.slides[0].notes);
 }
});
test('axis range validates each authored bound, rejects empty/inverted ranges and keeps AI updates atomic',()=>{
 const c=sampleChart();for(const axisRange of [{min:0},{max:0},{min:-5,max:5}])assert.deepEqual(validateChart({...c,axisRange}).axisRange,axisRange);
 for(const axisRange of [{},{min:1,max:1},{min:2,max:1},{min:NaN},{max:Infinity}])assert.equal(ChartSchema.safeParse({...c,axisRange}).success,false);
 const slide=blankSlide(),e=element('chart',{chart:c});slide.elements=[e];const deck=newDeck('Atomic range',[slide]);const next=applyImmutableOperations(deck,[{op:'update_element',slideId:slide.id,elementId:e.id,patch:{chart:{...c,axisRange:{min:10}}}}],deck.revision,'ai');assert.deepEqual(next.slides[0].elements[0].chart!.axisRange,{min:10});assert.equal(deck.slides[0].elements[0].chart!.axisRange,undefined);
 assert.throws(()=>applyImmutableOperations(deck,[{op:'rename_deck',title:'Should roll back'},{op:'update_element',slideId:slide.id,elementId:e.id,patch:{chart:{...c,axisRange:{min:10,max:5}}}}],deck.revision,'ai'));assert.equal(deck.title,'Atomic range');
});
test('chart continuation retains authored bounds and a consistent automatic opposite bound',()=>{
 for(const range of [{min:90},{max:100},{min:90,max:100}]){const slide=blankSlide(),c={...sampleChart(),type:'bar' as const,adaptive:true,labels:Array.from({length:20},(_,i)=>'Category '+i),series:[{name:'Score',values:Array.from({length:20},(_,i)=>91+i)}],axisRange:range},e=element('chart',{chart:c,w:700,h:420});slide.elements=[e];const parts=continueChart(slide,e.id);assert(parts.length>1);const scales=parts.map(s=>s.elements.find(e=>e.type==='chart')!.chart!.axisRange!);assert(scales.every(r=>r.min===scales[0].min&&r.max===scales[0].max));if(range.min!==undefined)assert.equal(scales[0].min,range.min);if(range.max!==undefined)assert.equal(scales[0].max,range.max);assert(scales[0].max!>scales[0].min!);}
});
test('invalid native bounds stay an explicit source reference instead of silently becoming an automatic scale',async()=>{
 const original=await fixture('line',{min:90});for(const replacement of ['<c:min val="not-a-number"/>','<c:min val="110"/><c:max val="100"/>']){const zip=await JSZip.loadAsync(original),path=Object.keys(zip.files).find(p=>/^ppt\/charts\/chart\d+\.xml$/.test(p))!;zip.file(path,(await zip.file(path)!.async('string')).replace(/<c:min val="90"\s*\/>/,replacement));const d=await importPptx(await zip.generateAsync({type:'uint8array'}),'invalid axis.pptx');assert.equal(get(d),undefined);assert(d.slides[0].elements.some(e=>e.sourceRegion));assert(d.slides[0].source!.warnings.some(w=>/bound|Max must exceed min/.test(w)));}
});
