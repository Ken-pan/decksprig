import test from 'node:test';import assert from 'node:assert/strict';import JSZip from 'jszip';import{XMLValidator,XMLParser}from'fast-xml-parser';
import{nativeChartPaintSource}from'./helpers/pptx-chart-paint';import{importPptx}from'../src/importers/pptx';import{buildPptx}from'../src/core/pptx-export';import{validateDeck,newDeck,blankSlide,element}from'../src/core/model';import{applyImmutableOperations}from'../src/core/operations';import{sampleChart}from'../src/core/charts';import{chartOption,renderChartSvg}from'../src/core/chart-render';import{pageBackground}from'../src/core/page-background';
const chart=(deck:Awaited<ReturnType<typeof importPptx>>)=>deck.slides[0].elements.find(e=>e.type==='chart')!;

test('native paints retain ordered series, point, text, value-label and page alpha through all six chart types',async()=>{
 for(const type of ['column','bar','line','area','pie','donut'] as const){
  const source=await nativeChartPaintSource(type),frozen=Buffer.from(source),deck=await importPptx(source,'Native paint.pptx');validateDeck(deck);const e=chart(deck),c=e.chart!;
  assert.equal(c.type,type);assert.deepEqual(c.colors,['#4F63E740','#BF358480',...['pie','donut'].includes(type)?['#17816100']:[]]);assert.equal(c.textColor,'#26362Cbf');assert.equal(c.dataLabels?.color,'#BF358480');assert.equal(deck.slides[1].background,'#4F63E780');assert(!deck.slides.some(s=>s.source?.warnings.some(w=>w.includes('transparent chart'))));
  const before=JSON.stringify(deck),bytes=await buildPptx(deck),zip=await JSZip.loadAsync(bytes);for(const f of Object.values(zip.files).filter(f=>/^ppt\/(charts|slides)\/.*\.xml$/.test(f.name))){const xml=await f.async('string');assert.equal(XMLValidator.validate(xml),true,f.name);for(const match of xml.matchAll(/<a:srgbClr\b[^>]*val="([^"]+)"/g))assert.match(match[1],/^[\da-f]{6}$/i);}
  const back=await importPptx(bytes,'Roundtrip.pptx');assert.deepEqual(chart(back).chart?.colors,c.colors);assert.equal(chart(back).chart?.textColor,c.textColor);assert.equal(chart(back).chart?.dataLabels?.color,c.dataLabels.color);assert.equal(back.slides[1].background,deck.slides[1].background);assert.equal(JSON.stringify(deck),before);assert.deepEqual(Buffer.from(source),frozen);
 }
});

test('area fill opacity composes with its pigment alpha and survives an editable native round trip',async()=>{
 const c={...sampleChart(),type:'area' as const,colors:['#4f63e780'],visual:{...sampleChart().visual,areaOpacity:.2},source:'',adaptive:false},e=element('chart',{chart:c,fill:c.colors[0]}),s={...blankSlide(),elements:[e]},d=newDeck('Area paint',[s]);const bytes=await buildPptx(d),back=await importPptx(bytes,'Area.pptx'),paint=chart(back).chart!;
 assert.equal(paint.colors[0].toLowerCase(),'#4f63e780');assert(Math.abs(paint.visual!.areaOpacity!-.2)<1/128);assert.equal(paint.series[0].values.length,c.labels.length);
});

test('manual and AI chart color operations share validation and detach caller paints',async()=>{
 const d=await importPptx(await nativeChartPaintSource(),'Editable.pptx'),e=chart(d),before=JSON.stringify(d),c={...e.chart!,colors:['#4f63e740','#bf358400'],textColor:'#26362cbf',dataLabels:{...e.chart!.dataLabels,color:'transparent'}};
 for(const actor of ['manual','ai']as const){const next=applyImmutableOperations(d,[{op:'update_element',slideId:d.slides[0].id,elementId:e.id,patch:{fill:c.colors[0],chart:c}}],d.revision,actor);validateDeck(next);assert.equal(chart(next).fill,c.colors[0]);assert.equal(chart(next).chart?.dataLabels?.color,'transparent');assert.equal(next.revision,d.revision+1);assert.throws(()=>applyImmutableOperations(d,[{op:'update_element',slideId:d.slides[0].id,elementId:e.id,patch:{chart:{...c,colors:['#12345']}}}],d.revision,actor));}
 assert.equal(JSON.stringify(d),before);
});

test('transparent chart labels use the actual page backdrop and invalidate cached SVG when it changes',()=>{
 const c={...sampleChart(),colors:['#00000000'],showValues:true,legend:false,grid:false,dataLabels:{position:'inside' as const},source:'',adaptive:false},e=element('chart',{chart:c,fill:c.colors[0]});const light=chartOption(e,undefined,'#ffffff')as any,dark=chartOption(e,undefined,'#111111')as any;
 assert.equal(light.series[0].label.color,'#000000');assert.equal(dark.series[0].label.color,'#FFFFFF');assert.notEqual(renderChartSvg(e,false,undefined,'#ffffff'),renderChartSvg(e,false,undefined,'#111111'));assert.equal(pageBackground('#4f63e780'),'linear-gradient(#4f63e780,#4f63e780),#fff');assert.equal(pageBackground('#fff'),'#fff');assert.equal(pageBackground('transparent'),'linear-gradient(transparent,transparent),#fff');
});

test('chart paints retain ordered theme alpha and explicit noFill without inventing an opaque series',async()=>{
 const source=await nativeChartPaintSource(),zip=await JSZip.loadAsync(source),path=Object.keys(zip.files).find(p=>/^ppt\/charts\/chart\d+\.xml$/.test(p))!,raw=await zip.file(path)!.async('string'),pattern=/<a:solidFill><a:srgbClr val="4F63E7">[\s\S]*?<\/a:srgbClr><\/a:solidFill>/;
 assert(pattern.test(raw));zip.file(path,raw.replace(pattern,'<a:solidFill><a:schemeClr val="accent1"><a:alphaOff val="-50000"/><a:alphaMod val="200000"/></a:schemeClr></a:solidFill>'));
 for(const file of Object.values(zip.files).filter(f=>/^ppt\/theme\/theme\d+\.xml$/.test(f.name)))zip.file(file.name,(await file.async('string')).replace(/<a:accent1>[\s\S]*?<\/a:accent1>/,'<a:accent1><a:srgbClr val="4F63E7"><a:alpha val="80000"/></a:srgbClr></a:accent1>'));
 const themed=await importPptx(await zip.generateAsync({type:'uint8array'}),'Theme.pptx');assert.equal(chart(themed).chart?.colors[0],'#4F63E799');
 zip.file(path,raw.replace(pattern,'<a:noFill/>'));const clear=await importPptx(await zip.generateAsync({type:'uint8array'}),'Clear.pptx'),e=chart(clear);assert.equal(e.chart?.colors[0],'transparent');e.chart={...e.chart!,textColor:'transparent',dataLabels:{...e.chart!.dataLabels,color:'transparent'}};
 const back=await importPptx(await buildPptx(clear),'Clear roundtrip.pptx');assert.equal(chart(back).chart?.colors[0],'transparent');assert.equal(chart(back).chart?.textColor,'transparent');assert.equal(chart(back).chart?.dataLabels?.color,'transparent');
});

test('native chart source notes keep their text pigment alpha outside the chart part',async()=>{
 const c={...sampleChart(),source:'Cited source',sourceDisplay:'chart' as const,textColor:'#26362c80'},e=element('chart',{chart:c,w:1000,h:500,fontSize:24}),deck=newDeck('Source paint',[{...blankSlide(),elements:[e]}]),zip=await JSZip.loadAsync(await buildPptx(deck));const root=new XMLParser({ignoreAttributes:false,removeNSPrefix:true}).parse(await zip.file('ppt/slides/slide1.xml')!.async('string')),shapes=root.sld.cSld.spTree.sp,source=(Array.isArray(shapes)?shapes:[shapes]).find(s=>s.nvSpPr.cNvPr['@_name']===e.id+':source');assert(source);assert.equal(String(source.txBody.p.r.rPr.solidFill.srgbClr.alpha['@_val']),'50196');
});
