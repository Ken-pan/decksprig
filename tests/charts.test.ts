import {test} from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {blankSlide, element, newDeck, validateDeck} from '../src/core/model';
import {applyOperations} from '../src/core/operations';
import {parseChartData, pasteChartCells, chartCsv, sampleChart, chartFromElement, validateChart, CHART_TYPES} from '../src/core/charts';
import {chartOption, renderChartSvg} from '../src/core/chart-render';
import {buildPptx} from '../src/core/pptx-export';
import {layoutObjectRole} from '../src/core/layout-content';
import {buildHtml} from '../src/core/export';

test('percentage donut legends avoid duplicate shares while monetary values retain their share',()=>{
  const e={...element('chart'),w:1000,h:500,fontSize:24,chart:{...sampleChart(),type:'donut' as const,labels:['Research','Delivery'],series:[{name:'Budget',values:[20,80]}],legend:true,prefix:'',suffix:'%'}};
  const labels=(value:typeof e)=>(chartOption(value).graphic as {style?:{text?:string}}[]).flatMap(item=>item.style?.text?[item.style.text]:[]);
  assert.ok(labels(e).includes('20%'));assert.ok(!labels(e).some(text=>text.includes('20% ·')));
  assert.ok(labels({...e,chart:{...e.chart,prefix:'$',suffix:''}}).some(text=>text.includes('$20 · 20.0%')));
  assert.ok(labels({...e,chart:{...e.chart,series:[{name:'Budget',values:[20,60]}]}}).some(text=>text.includes('20% · 25.0%')));
});

test('spreadsheet import roundtrips quoted CSV, BOM, TSV, decimals and negative numbers without changing values', () => {
  const data = parseChartData('\uFEFFCategory,Revenue,Cost\r\n"North, America",12.5,-3\r\n"A ""quoted"" label",0,1e2');
  assert.deepEqual(data.labels, ['North, America', 'A "quoted" label']);
  assert.deepEqual(data.series[1].values, [-3, 100]);
  const chart = {...sampleChart(), ...data};
  assert.deepEqual(parseChartData(chartCsv(chart)), data);
  assert.deepEqual(parseChartData('Category\tSeries\nFirst\t-4.5').series[0].values, [-4.5]);
  for (const bad of ['Category,A\nX,', 'Category,A\nX,NaN', 'Category,A\nX,Infinity', 'Category,A\nX,0x10', 'Category,A\nX,1e13', 'Category,A,B\nX,1', 'Category,A,A\nX,1,2', 'Category,A\n"X,1']) assert.throws(() => parseChartData(bad));
});
test('spreadsheet ranges update only their target cells and preserve the original dataset', () => {
  const chart = {...sampleChart(), series: [{name:'Revenue', values:[1,2,3,4]}, {name:'Cost',values:[5,6,7,8]}]}, before = JSON.stringify(chart);
  const pasted = pasteChartCells(chart, '"华北, 南"\t-12.5\r\n华东\t8.25\r\n', 1, 0);
  assert.deepEqual(pasted.labels, ['Q1','华北, 南','华东','Q4']);
  assert.deepEqual(pasted.series[0].values, [1,-12.5,8.25,4]);
  assert.deepEqual(pasted.series[1], chart.series[1]);
  assert.equal(pasted.rows, 2); assert.equal(pasted.columns, 2);
  const numbers = pasteChartCells(chart,'9\t10\n11\t12',2,1);
  assert.deepEqual(numbers.labels, chart.labels);
  assert.deepEqual(numbers.series.map(s=>s.values),[[1,2,9,11],[5,6,10,12]]);
  assert.equal(JSON.stringify(chart),before);
});
test('invalid, blank, ragged and oversized pasted ranges are rejected without partial edits', () => {
  const chart = sampleChart(), before = JSON.stringify(chart);
  for(const text of ['1\nno number', '1\n\n2', '\n1', '1\n1e13']) assert.throws(()=>pasteChartCells(chart,text,0,1));
  assert.throws(()=>pasteChartCells(chart,'A\t1\nB',0,0),/rectangular/);
  assert.throws(()=>pasteChartCells(chart,'1\t2',0,1),/fit this range/);
  assert.throws(()=>pasteChartCells(chart,'1\n2',3,1),/fit this range/);
  assert.throws(()=>pasteChartCells(chart,'X'.repeat(250001),0,0),/250 KB/);
  assert.equal(JSON.stringify(chart),before);
});
test('chart transactions validate atomically, reject stale proposals and preserve legacy charts', () => {
  const slide = blankSlide(), old = element('chart', {values: [{label: 'Before', value: 4}], fill: '#35665D'}); slide.elements.push(old);
  const deck = newDeck('Chart fixture', [slide]), before = JSON.stringify(deck);
  assert.deepEqual(chartFromElement(old).series[0].values, [4]);
  const chart = sampleChart();
  const next = applyOperations(deck, [{op: 'update_element', slideId: slide.id, elementId: old.id, patch: {chart}}], 0, 'ai');
  assert.equal(next.revision, 1); assert.deepEqual(next.slides[0].elements[0].chart, chart);
  assert.equal(JSON.stringify(deck), before);
  assert.equal(layoutObjectRole(next.slides[0].elements[0], next), 'content');
  assert.throws(() => applyOperations(next, [{op: 'update_element', slideId: slide.id, elementId: old.id, patch: {chart}}], 0), /changed/);
  assert.throws(() => applyOperations(deck, [{op: 'update_slide', slideId: slide.id, patch: {notes: 'Must roll back'}}, {op: 'update_element', slideId: slide.id, elementId: old.id, patch: {chart: {...chart, series: [{name: 'A', values: [1]}]}}}]), /one number/);
  assert.equal(JSON.stringify(deck), before);
  assert.throws(() => validateChart({...chart, type: 'pie', series: [{name: 'A', values: [-1, 2, 3, 4]}]}), /nonnegative/);
  assert.throws(() => validateChart({...chart, type: 'donut', series: [{name: 'A', values: [0, 0, 0, 0]}]}), /greater than zero/);
  assert.throws(() => validateChart({...chart, type: 'pie', series: [...chart.series, {name: 'Other', values: [1, 2, 3, 4]}]}), /one series/);
  assert.throws(() => validateDeck({...deck, slides: [{...slide, elements: [element('rect', {chart})]}]}), /Only chart/);
});
test('all chart types produce bounded standalone SVG, accessible data descriptions and safe text', () => {
  for (const type of CHART_TYPES) {
    const chart = {...sampleChart(), type, title: '<script>alert(1)</script>', source: 'Source & context', showValues: true};
    const e = element('chart', {w: 800, h: 460, fontSize: 24, fill: '#35665D', chart});
    const svg = renderChartSvg(e);
    assert.match(svg, /<svg role="img"/); assert.match(svg, /<title>/); assert.match(svg, /Source &amp; context/);
    assert(!svg.includes('<script>')); assert(!svg.includes('NaN')); assert(!svg.includes('Infinity')); assert.match(svg, /<path/);
  }
  const e = element('chart', {chart: {...sampleChart(), series: [{name: 'Signed', values: [-10, 0, 20, 30]}]}});
  const option = chartOption(e); assert.equal((option.yAxis as {scale: boolean}).scale, false);
});
test('PowerPoint exports editable native chart types, multiple series, negative data and source captions', async () => {
  const slides = CHART_TYPES.map(type => {const slide = blankSlide(type); slide.elements.push(element('chart', {fontFamily: 'Arial', w: 800, h: 460, fill: '#35665D', chart: {...sampleChart(), type, source: 'Fixture source'}})); return slide;});
  slides[0].elements[0].chart = {...sampleChart(), stacked: true, series: [{name: 'First', values: [-5, 10, 20, 30]}, {name: 'Second', values: [1, 2, 3, 4]}]};
  const zip = await JSZip.loadAsync(await buildPptx(newDeck('Native charts', slides)));
  const tags = ['barChart', 'barChart', 'lineChart', 'areaChart', 'pieChart', 'doughnutChart'];
  for (let i = 0; i < tags.length; i++) {
    const xml = await zip.file(`ppt/charts/chart${i + 1}.xml`)!.async('string');
    assert(xml.includes(`<c:${tags[i]}>`), tags[i]);
    assert.match(xml, /<c:numCache>/);
  }
  const column = await zip.file('ppt/charts/chart1.xml')!.async('string'); assert.match(column, /<c:grouping val="stacked"/); assert.match(column, /<c:v>-5<\/c:v>/); assert.equal((column.match(/<c:ser>/g) ?? []).length, 2);
  assert.match(await zip.file('ppt/slides/slide2.xml')!.async('string'), /Fixture source/);
});
test('portable HTML embeds vector charts without a runtime dependency or document mutation', async () => {
  const slide = blankSlide(); slide.elements.push(element('chart', {fontFamily: 'Arial', fill: '#35665D', chart: {...sampleChart(), type: 'line', title: '</script> chart'}}));
  const deck = newDeck('Portable chart', [slide]), before = JSON.stringify(deck);
  const html = await (await buildHtml(deck)).text();
  assert.match(html, /role=\\"img\\"/); assert(!html.includes('src="https://')); assert(!html.includes('</script> chart'));
  assert.equal(JSON.stringify(deck), before);
});

test('CSV import detects separators outside quoted fields and reads Excel Unicode TSV', async () => {
  const {decodeChartFile} = await import('../src/core/charts');
  const csv = '\nsep=;\r\nCategory;"Revenue, net";Cost\r\n"North; America";12,5;3\r\nEurope;20;4\r\n';
  const parsed = parseChartData(csv);
  assert.deepEqual(parsed.labels, ['North; America', 'Europe']);
  assert.equal(parsed.series[0].name, 'Revenue, net'); assert.deepEqual(parsed.series[0].values, [12.5, 20]);
  const text = 'Category\t收入\t成本\n华北\t42\t18\n华南\t53\t21';
  const unicode = Buffer.concat([Buffer.from([255,254]), Buffer.from(text, 'utf16le')]);
  assert.deepEqual(parseChartData(decodeChartFile(unicode)).series[0].values, [42,53]);
  assert.throws(() => decodeChartFile(Uint8Array.from([255,255,255])), /UTF-8/);
  assert.throws(() => decodeChartFile(new Uint8Array(250_001)), /250 KB/);
  assert.deepEqual(parseChartData('"Category with\ttab",Sales\n"Label, comma",12').labels, ['Label, comma']);
});

test('switching pie series retains the complete dataset and adjusts selection after removal', async () => {
  const {changeChartType, displayedChartSeries, removeChartSeries, chartNumber} = await import('../src/core/charts');
  const original = {...sampleChart(), labels: ['North','South'], series: [{name:'Signed',values:[-8,20]},{name:'Positive',values:[42,53]}], colors:['#35665D']};
  const pie = validateChart(changeChartType(original,'pie'));
  assert.equal(pie.pieSeries,1);assert.deepEqual(pie.series,original.series);assert.equal(displayedChartSeries(pie)[0].name,'Positive');
  const bar = validateChart(changeChartType(pie,'bar'));assert.deepEqual(bar.series,original.series);
  const removed = validateChart(removeChartSeries(pie,0));assert.equal(removed.pieSeries,0);assert.equal(removed.series[0].name,'Positive');assert.equal(removed.colors.length,1);
  assert.throws(() => validateChart({...pie,pieSeries:0}),/nonnegative/);
  assert.throws(() => validateChart({...pie,pieSeries:7}),/existing series/);
  assert.deepEqual(parseChartData(chartCsv(pie)).series,original.series);
  assert.throws(() => chartNumber(''),/Blank cells/);assert.throws(() => chartNumber('Infinity'));assert.equal(chartNumber('-.5'),-.5);
});

test('pie exports display the chosen series while deck JSON and data CSV retain all data', async () => {
  const chart = {...sampleChart(),type:'pie' as const,pieSeries:1,labels:['North','South'],title:'Revenue overview',subtitle:'2026 fixture',series:[{name:'Cost',values:[-8,12]},{name:'Revenue',values:[42,53]}]};
  const e=element('chart',{chart,fill:'#35665D',fontFamily:'Arial',w:800,h:460});
  const option=chartOption(e);assert.deepEqual((option.series as any[])[0].data.map((v: {value:number})=>v.value),[42,53]);
  const slide=blankSlide();slide.elements.push(e);const deck=newDeck('Selected pie',[slide]);
  const zip=await JSZip.loadAsync(await buildPptx(deck));const path=Object.keys(zip.files).find(path=>/^ppt\/charts\/chart\d+\.xml$/.test(path))!;const xml=await zip.file(path)!.async('string');
  assert.equal((xml.match(/<c:ser>/g)??[]).length,1);assert.match(xml,/<c:v>42<\/c:v>/);assert(!xml.includes('<c:v>-8</c:v>'));
  assert(!xml.includes('Revenue overview\\n2026 fixture'));
  const html=await(await buildHtml(deck)).text();const json=JSON.parse(html.match(/id="deck">([\s\S]*?)<\/script>/)![1]);
  assert.deepEqual(json.slides[0].elements[0].chart.series,chart.series);assert.equal(json.slides[0].elements[0].chart.pieSeries,1);
});

test('standalone SVG carries the document font without changing the stored chart', async () => {
  const {buildChartSvg}=await import('../src/core/chart-export');
  const slide=blankSlide(),e=element('chart',{chart:sampleChart(),fontFamily:'Imported & Font',fill:'#35665D'});slide.elements.push(e);
  const deck=newDeck('Font export',[slide]);deck.fonts=[{family:'Imported & Font',name:'Imported fixture',data:'data:font/woff2;base64,AQIDBA==',weight:'100 900',style:'normal'}];
  const before=JSON.stringify(deck),svg=await buildChartSvg(e,deck);
  assert.match(svg,/@font-face/);assert.match(svg,/data:font\/woff2;base64,AQIDBA==/);assert.match(svg,/Imported &amp; Font/);assert.equal(JSON.stringify(deck),before);
});

test('SVG background is an export choice and CSV retains Unicode with an Excel-readable BOM', async () => {
  const {buildChartSvg}=await import('../src/core/chart-export');
  const slide=blankSlide();slide.background='#182B28';const e=element('chart',{chart:{...sampleChart(),labels:['华北'],series:[{name:'收入',values:[42]}]},fontFamily:'Arial',fill:'#35665D'});slide.elements.push(e);const deck=newDeck('Background',[slide]);
  const realFetch=globalThis.fetch;globalThis.fetch=async input=>String(input).startsWith('/')?new Response(await (await import('node:fs/promises')).readFile('public'+String(input))):realFetch(input);let transparent:string,opaque:string;try{transparent=await buildChartSvg(e,deck);opaque=await buildChartSvg(e,deck,slide.background);}finally{globalThis.fetch=realFetch;}
  assert(!transparent.includes('fill="#182B28"'));assert(opaque.includes('fill="#182B28"'));
  const csv=chartCsv(e.chart!);assert.equal(csv.charCodeAt(0),0xFEFF);assert.deepEqual(parseChartData(csv).series,e.chart!.series);
});

test('canvas chart formatting keeps optional defaults and reaches rendering and native export',async()=>{
 const chart=validateChart({...sampleChart(),legendPosition:'right',showValues:true,series:[{name:'First',values:[1,2,3,4]},{name:'Second',values:[2,3,4,5]}],axisRange:{min:-10,max:100},axisStyle:{fontSize:20,rotation:45},dataLabels:{position:'inside',fontSize:26,color:'#C02030',bold:true}});
 const e=element('chart',{w:900,h:520,fontFamily:'Arial',chart}),option=chartOption(e) as any;
 assert.equal(option.legend.right,24);assert.equal(option.legend.orient,'vertical');assert.equal(option.yAxis.min,-10);assert.equal(option.xAxis.axisLabel.rotate,45);assert.equal(option.series[0].label.color,'#C02030');assert.equal(option.series[0].label.fontWeight,700);
 const svg=renderChartSvg(e,true);assert.match(svg,/data-chart-format="axis"/);assert.match(svg,/data-chart-format="labels"/);assert.doesNotMatch(renderChartSvg(e),/data-chart-format/);
 const slide=blankSlide();slide.elements=[e];const zip=await JSZip.loadAsync(await buildPptx(newDeck('Formatted chart',[slide]))),xml=await zip.file(Object.keys(zip.files).find(p=>/^ppt\/charts\/chart\d+\.xml$/.test(p))!)!.async('string');
 assert.match(xml,/<c:legendPos val="r"/);assert.match(xml,/<c:min val="-10"/);assert.match(xml,/C02030/);assert.match(xml,/<c:dLblPos val="ctr"/);
 assert.throws(()=>validateChart({...chart,axisStyle:{fontSize:0}}));assert.throws(()=>validateChart({...chart,dataLabels:{color:'#fff'}}));
});

test('line endpoint value labels align into the plot without changing chart data or axes',()=>{const c=validateChart({...sampleChart(),type:'area',labels:['Q1','Q2','Q3'],series:[{name:'Registered',values:[18,27,42]}],showValues:true,dataLabels:{position:'outside',fontSize:22}}),e=element('chart',{w:1100,h:420,fontSize:24,chart:c}),o=chartOption(e),data=(o.series as any[])[0].data;assert.deepEqual(data,[{value:18,label:{align:'left'}},27,{value:42,label:{align:'right'}}]);assert.deepEqual(e.chart,c);assert.equal((o.series as any[])[0].label.position,'top');assert.equal((o.series as any[])[0].labelLayout({dataIndex:0}).dx,20);});

test('single-series benchmark bars keep their category paints in SVG and native PowerPoint',async()=>{
  const {createLayout}=await import('../src/core/templates');
  const {importPptxChart}=await import('../src/importers/pptx-chart');
  for(const collection of ['review','proposal','report']){
    const page=createLayout('metrics',1,collection),chart=page.elements.find(element=>element.chart)!;
    const model=chart.chart!;
    assert.equal(model.series.length,1);
    assert.deepEqual(model.colorCategories,model.labels);
    assert.equal(new Set(model.colors).size,3);
    const svg=renderChartSvg(chart).toLowerCase();
    for(const color of model.colors.slice(0,2))assert.ok(svg.includes(color.toLowerCase()),collection+' '+color);
    assert.ok(svg.includes('stroke="'+model.textColor.toLowerCase()+'"'));

    const pptx=await JSZip.loadAsync(await buildPptx(newDeck('Benchmarks',[page])));
    const path=Object.keys(pptx.files).find(name=>/^ppt\/charts\/chart\d+\.xml$/.test(name))!;
    const xml=await pptx.file(path)!.async('string');
    const marks=[...xml.matchAll(/<c:dPt>(.*?)<\/c:dPt>/g)].map(match=>match[1]);
    assert.equal(marks.length,3);
    assert.match(marks[2],/<a:noFill\/>.*<a:ln/);
    const restored=importPptxChart(xml,{},{
      points:value=>value*4/3,font:value=>value||'Inter',
      color:(node,fallback)=>node?.noFill!==undefined?'transparent':node?.solidFill?.srgbClr?.val?'#'+node.solidFill.srgbClr.val:fallback||'#111111',
      warn:()=>{},
    })?.chart;
    assert.deepEqual(restored?.series,model.series);
    assert.deepEqual(restored?.labels,model.labels);
    assert.deepEqual(restored?.colorCategories,model.labels);
    assert.deepEqual(restored?.colors.map(color=>color.toLowerCase()),[...model.colors.slice(0,2).map(color=>color.toLowerCase()),'transparent']);
  }
});

test('Signal’s first data label leaves space after the nearby axis label',async()=>{
 const {templateDeck}=await import('../src/core/templates');
 const chart=templateDeck('pitch').slides[14].elements.find(element=>element.chart)!;
 const labels=[...renderChartSvg(chart).matchAll(/<text[^>]*translate\(([\d.]+) [\d.]+\)[^>]*>(16%|20%)<\/text>/g)];
 const x=(label:string)=>Number(labels.find(match=>match[2]===label)?.[1]);
 assert.ok(x('16%')-x('20%')>=26,'The first value label sits clear of the value-axis tick');
});
