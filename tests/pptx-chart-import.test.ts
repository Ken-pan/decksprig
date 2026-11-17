import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import {XMLParser} from 'fast-xml-parser';
import {importPptx} from '../src/importers/pptx';
import {buildPptx} from '../src/core/pptx-export';
import {chartOption,renderChartSvg} from '../src/core/chart-render';
import {formatChartValue} from '../src/core/chart-format';
import {chartDescription} from '../src/core/charts';
import {chartValueStep,draggedChartValue,type ChartDragGeometry} from '../src/core/chart-drag';
import {applyImmutableOperations} from '../src/core/operations';
import type {Chart} from '../src/core/chart-schema';

async function fixture(type:Chart['type']='column',options:Record<string,unknown>={},series=[{name:'Revenue',labels:['A','B','C'],values:[12,24,18]}]){
 const p=new PptxGenJS();p.layout='LAYOUT_WIDE';const slide=p.addSlide();
 const native=type==='column'||type==='bar'?p.ChartType.bar:type==='donut'?p.ChartType.doughnut:type==='pie'?p.ChartType.pie:type==='area'?p.ChartType.area:p.ChartType.line;
 slide.addChart(native,series,{x:1,y:1,w:10,h:5,barDir:type==='bar'?'bar':'col',fontFace:'Arial',chartColors:['173D32','B34024','548DA6'],showLegend:true,showValue:true,showTitle:true,title:'Editable chart',titleFontFace:'Arial',catAxisTitle:'Category',showCatAxisTitle:true,valAxisTitle:'Value',showValAxisTitle:true,...options});
 slide.addNotes('Chart source notes · 中文');return p.write({outputType:'uint8array'}) as Promise<Uint8Array>;
}
const get=(d:Awaited<ReturnType<typeof importPptx>>)=>d.slides[0].elements.find(e=>e.type==='chart')!;
async function change(bytes:Uint8Array,edit:(xml:string)=>string){const zip=await JSZip.loadAsync(bytes),path=Object.keys(zip.files).find(p=>/^ppt\/charts\/chart\d+\.xml$/.test(p))!;zip.file(path,edit(await zip.file(path)!.async('string')));return zip.generateAsync({type:'uint8array'});}

test('all six supported native types retain actual datasets, geometry, titles, notes and series colors',async()=>{
 for(const type of ['column','bar','line','area','pie','donut'] as const){
  const bytes=await fixture(type),before=Buffer.from(bytes),d=await importPptx(bytes,'native chart.pptx'),e=get(d),c=e.chart!;
  assert(e,type);assert.equal(c.type,type);assert.deepEqual(c.labels,['A','B','C']);assert.deepEqual(c.series,[{name:'Revenue',values:[12,24,18]}]);
  assert.equal(c.title,'Editable chart');assert.equal(c.legend,true);assert.equal(c.showValues,true);assert.equal(c.colors[0],'#173D32');assert(Math.abs(e.x-108)<.01);assert(Math.abs(e.w-1080)<.01);assert.equal(d.slides[0].notes,'Chart source notes · 中文');assert.deepEqual(Buffer.from(bytes),before);
  if(!['pie','donut'].includes(type)){assert.equal(c.categoryTitle,'Category');assert.equal(c.valueTitle,'Value');}
 }
});

test('stacked native multi-series charts retain separate values, names and source order',async()=>{
 const data=[{name:'Actual',labels:['Q1','Q2','Q3'],values:[10,-2,30]},{name:'Previous',labels:['Q1','Q2','Q3'],values:[4,8,12]}];
 for(const type of ['column','bar','line','area'] as const){let bytes=await fixture(type,{barGrouping:'stacked',showTitle:false},data);if(type==='line')bytes=await change(bytes,xml=>xml.replace('<c:lineChart>','<c:lineChart><c:grouping val="stacked"/>'));const d=await importPptx(bytes,'stacked.pptx'),e=get(d);assert.equal(e.chart!.stacked,true);assert.deepEqual(e.chart!.series,data.map(({name,values})=>({name,values})));const back=get(await importPptx(await buildPptx(d),'stacked export.pptx'));assert.equal(back.chart!.stacked,true);assert.deepEqual(back.chart!.series,e.chart!.series);}
});

test('literal and reordered indexed caches preserve exact category/name whitespace and numeric values',async()=>{
 const bytes=await change(await fixture(),xml=>xml.replace(/<c:multiLvlStrRef>[\s\S]*?<\/c:multiLvlStrRef>/,'<c:strLit><c:ptCount val="3"/><c:pt idx="2"><c:v>C</c:v></c:pt><c:pt idx="0"><c:v> A </c:v></c:pt><c:pt idx="1"><c:v>B</c:v></c:pt></c:strLit>').replace(/<c:numRef>[\s\S]*?<c:numCache>([\s\S]*?)<\/c:numCache>\s*<\/c:numRef>/,'<c:numLit>$1</c:numLit>').replace('<c:v>Revenue</c:v>','<c:v> Revenue </c:v>'));
 const c=get(await importPptx(bytes,'literal.pptx')).chart!;assert.deepEqual(c.labels,[' A ','B','C']);assert.equal(c.series[0].name,' Revenue ');assert.deepEqual(c.series[0].values,[12,24,18]);
});

test('native percentage formatting scales presentation only and reversed axes keep signed dragging correct',async()=>{
 const bytes=await change(await fixture('bar',{valAxisLabelFormatCode:'0.0%',dataLabelFormatCode:'0.0%',valAxisMinVal:0,valAxisMaxVal:1},[{name:'Share',labels:['A','B','C'],values:[.1,.25,.5]}]),xml=>xml.replace(/(<c:valAx>[\s\S]*?<c:orientation val=")minMax/, '$1maxMin'));
 const e=get(await importPptx(bytes,'percent.pptx')),c=e.chart!,option=chartOption(e) as any;
 assert.equal(c.numberFormat?.percent,true);assert.equal(formatChartValue(c,.25),'25.0%');assert.deepEqual(c.series[0].values,[.1,.25,.5]);assert.equal(c.categoryReverse,true);assert.equal(c.valueReverse,true);assert.equal(option.yAxis.inverse,false);assert.equal(option.xAxis.inverse,true);assert.equal(chartValueStep(c),.001);
 assert(chartDescription(c).includes('B 25.0%'));assert(!chartDescription(c).includes('B 0.25'));
 const svg=renderChartSvg(e,true),root=new XMLParser({ignoreAttributes:false}).parse(svg).svg,g=JSON.parse(root['@_data-chart-drag']) as ChartDragGeometry;
 assert.equal(g.kind,'axis');if(g.kind==='axis'){assert(g.min<g.max);assert(g.pixelMin>g.pixelMax);assert(draggedChartValue(c,{series:0,category:1},g,{x:500,y:100},{x:450,y:100})>.25);}
});

test('pie point palettes beyond eight entries, native rotation, hole size and label semantics remain editable',async()=>{
 const colors=Array.from({length:10},(_,i)=>(0x173d32+i*0x10203).toString(16).padStart(6,'0'));
 const data=[{name:'Parts',labels:colors.map((_,i)=>`Part ${i+1}`),values:colors.map((_,i)=>i+1)}];
 const e=get(await importPptx(await fixture('donut',{chartColors:colors,holeSize:85,firstSliceAng:235,showValue:false,showPercent:true,dataLabelFormatCode:'0.0%'},data),'donut.pptx')),c=e.chart!,option=chartOption(e) as any;
 assert.deepEqual(c.colors.map(c=>c.toLowerCase()),colors.map(c=>'#'+c));assert.equal(c.visual?.donutHole,85);assert.equal(c.visual?.pieRotation,235);assert.equal(option.series[0].startAngle,-145);assert.equal(c.dataLabels?.valueMode,'percent');assert.equal(c.dataLabels?.percentDecimals,1);assert(!c.numberFormat?.percent);assert.equal(formatChartValue(c,2),'2');assert.equal(option.series[0].label.formatter({name:'Part 2',value:2,percent:3.6}),'3.6%');
 const svg=renderChartSvg(e);for(const color of colors)assert(svg.toLowerCase().includes('#'+color));
});

test('individual pie label overrides preserve monetary values instead of inheriting global percentages',async()=>{
 for(const mode of ['value','both'] as const){
  const bytes=await fixture('pie',{showValue:true,showPercent:mode==='both',dataLabelFormatCode:'$0'}),e=get(await importPptx(bytes,'value labels.pptx')),c=e.chart!,option=chartOption(e) as any;
  assert.equal(c.dataLabels?.valueMode,mode);assert.equal(c.prefix,'$');assert.equal(c.numberFormat?.percent,undefined);assert.equal(option.series[0].label.formatter({name:'A',value:12,percent:22.2}),mode==='value'?'$12':'$12 (22%)');
  const back=get(await importPptx(await buildPptx(await importPptx(bytes,'value labels.pptx')),'roundtrip.pptx')).chart!;assert.equal(back.dataLabels?.valueMode,mode);assert.equal(back.prefix,'$');
 }
 const mixed=await change(await fixture('pie',{showValue:true,showPercent:false}),xml=>xml.replace(/(<c:dLbl>[\s\S]*?<c:showVal val=")1/, '$10'));
 assert.equal(get(await importPptx(mixed,'mixed labels.pptx')),undefined);
});

test('missing/error caches, mismatched categories and unsupported grouping remain explicit references, never zeros or partial datasets',async()=>{
 for(const edit of [
  (xml:string)=>xml.replace(/(<c:numCache>[\s\S]*?)<c:pt idx="1">[\s\S]*?<\/c:pt>/,'$1'),
  (xml:string)=>xml.replace('<c:v>24</c:v>','<c:v>#N/A</c:v>'),
  (xml:string)=>xml.replace('<c:grouping val="clustered"/>','<c:grouping val="percentStacked"/>'),
 ]){const d=await importPptx(await change(await fixture(),edit),'unsupported.pptx');assert.equal(get(d),undefined);assert(d.slides[0].elements.some(e=>e.type==='image'&&e.sourceRegion));assert(d.slides[0].source!.warnings.length>0);await assert.rejects(buildPptx(d),/source PDF/);}
});

test('editable native exports update both chart caches and the embedded workbook without percent data conversion',async()=>{
 const source=await importPptx(await fixture('column',{valAxisLabelFormatCode:'0.0%',dataLabelFormatCode:'0.0%'},[{name:'Share',labels:['A','B','C'],values:[.1,.25,.5]}]),'editable.pptx'),e=get(source),chart={...e.chart!,series:[{...e.chart!.series[0],values:[.1,.375,.5]}]};
 const edited=applyImmutableOperations(source,[{op:'update_element',slideId:source.slides[0].id,elementId:e.id,patch:{chart}}],source.revision,'ai');assert.equal(get(source).chart!.series[0].values[1],.25);
 const bytes=await buildPptx(edited),zip=await JSZip.loadAsync(bytes),xml=await zip.file(Object.keys(zip.files).find(p=>/^ppt\/charts\/chart\d+\.xml$/.test(p))!)!.async('string');assert(xml.includes('<c:v>0.375</c:v>'));assert(xml.includes('0.0%'));assert(!xml.includes('<c:v>37.5</c:v>'));
 const bookPath=Object.keys(zip.files).find(p=>/^ppt\/embeddings\/.*\.xlsx$/.test(p))!,book=await JSZip.loadAsync(await zip.file(bookPath)!.async('uint8array')),sheet=await book.file('xl/worksheets/sheet1.xml')!.async('string');assert.match(sheet,/<c[^>]*r="B3"[^>]*>[\s\S]*?<v>0.375<\/v>/);
 const restoredDeck=await importPptx(bytes,'roundtrip.pptx'),restored=get(restoredDeck).chart!;assert.deepEqual(restored.series,chart.series);assert.deepEqual(restored.labels,chart.labels);assert.equal(restored.numberFormat?.percent,true);assert.equal(restoredDeck.slides[0].notes,source.slides[0].notes);
 const slideXml=await zip.file('ppt/slides/slide1.xml')!.async('string');assert.match(slideXml,/descr="[^"]*B 37.5%/);
});
