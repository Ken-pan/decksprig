import {test} from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {element,blankSlide,newDeck,validateDeck} from '../src/core/model';
import {insertedElement} from '../src/core/insertion';
import {tableAppearance,tablePresentation,tableCellStyle,tablePresetStyle} from '../src/core/table-appearance';
import {sampleChart,chartFromElement,validateChart} from '../src/core/charts';
import {chartPresetPatch,formatChartValue} from '../src/core/chart-style';
import {chartOption,renderChartSvg} from '../src/core/chart-render';
import {applyOperations} from '../src/core/operations';
import {buildHtml} from '../src/core/export';
import {buildPptx} from '../src/core/pptx-export';
import {tableRowHeights,continueTable} from '../src/core/table-fit';
import {nativePptxUnits} from '../src/core/pptx-units';

test('new data objects use deliberate presets while legacy tables/charts preserve authored appearance',()=>{
  const deck=newDeck('Styles',[blankSlide()]);
  assert.equal(insertedElement('table',deck,{x:0,y:0,w:720,h:240}).tableStyle?.preset,'editorial');
  const old=element('table',{cells:[['Header'],['Value']],fill:'#123456',stroke:'transparent'});
  assert.deepEqual(tableAppearance(old),{text:'#123456',line:'#c6cdc3',background:'#f8f8f4',header:'#e1e7da'});
  assert.equal(old.tableStyle,undefined);
  assert.equal(chartFromElement(element('chart',{values:[{label:'A',value:12}]})).visual,undefined);
  assert.equal(sampleChart().visual?.preset,'clean');
});
test('table presentation handles numeric alignment, header contrast, bands, borders and weighted columns consistently',()=>{
  const e=element('table',{fill:'#172b26',cells:[['Region','Revenue','Note'],['North','$1,250.50','42 days'],['South','$960.00','Summary']],tableStyle:{...tablePresetStyle('contrast'),banded:true,columnWidths:[2,1,3]}});
  const p=tablePresentation(e);
  assert.deepEqual(p.alignments,['left','right','left']);
  assert.deepEqual(p.widths,[2/6,1/6,3/6]);
  assert.equal(p.headerText,'#ffffff');
  assert.equal(tableCellStyle(p,0,1).textAlign,'right');
  assert.equal(tableCellStyle(p,2,0).background,p.stripe);
  assert.equal(tableCellStyle(p,1,0).borderRight,'0');
  const custom=tablePresentation({...e,tableStyle:{...e.tableStyle,headerRow:false,columnAlign:['center','left','auto'],borders:'none'}});
  assert.equal(tableCellStyle(custom,0,0).fontWeight,e.fontWeight);assert.equal(tableCellStyle(custom,0,0).borderBottom,'0');assert.deepEqual(custom.alignments,['center','left','left']);
  const extended=tablePresentation({...e,cells:e.cells!.map(row=>[...row,'New'])});assert.ok(extended.widths[3]>.15);
  const before=JSON.stringify(e);tableRowHeights(e,24,()=>null);assert.equal(JSON.stringify(e),before);
});
test('styles are atomic and invalid chart/table customization rejects the complete transaction',()=>{
  const slide=blankSlide(),table=element('table',{cells:[['A','Value'],['B','42']]}),chart=element('chart',{chart:sampleChart()});slide.elements=[table,chart];const deck=newDeck('Atomic styles',[slide]),before=JSON.stringify(deck);
  assert.throws(()=>applyOperations(deck,[{op:'update_element',slideId:slide.id,elementId:table.id,patch:{tableStyle:{padding:-1}}}]),/padding|greater/);
  assert.throws(()=>applyOperations(deck,[{op:'update_element',slideId:slide.id,elementId:chart.id,patch:{chart:{...sampleChart(),visual:{donutHole:91}}}}]),/donutHole|90/);
  assert.equal(JSON.stringify(deck),before);
  const next=applyOperations(deck,[{op:'update_element',slideId:slide.id,elementId:table.id,patch:{tableStyle:tablePresetStyle('banded')}}],0,'ai');assert.equal(next.revision,1);assert.deepEqual(next.slides[0].elements[0].cells,table.cells);assert.equal(next.slides[0].elements[0].fontFamily,table.fontFamily);
});
test('chart mark and number controls affect rendering while presets preserve actual data and axis settings',()=>{
  const c=validateChart({...sampleChart(),type:'line',prefix:'$',suffix:'',numberFormat:{grouping:true,decimals:2},visual:{...chartPresetPatch('bold').visual,smooth:true}}),e=element('chart',{chart:c,w:800,h:480,fill:c.colors[0],fontSize:24});
  assert.equal(formatChartValue(c,1234.5),'$1,234.50');
  const option=chartOption(e) as any;assert.equal(option.series[0].smooth,true);assert.equal(option.series[0].lineStyle.width,4);assert.equal(option.series[0].symbolSize,7);
  const donut={...e,chart:{...c,type:'donut' as const,visual:{donutHole:70},title:'Quarterly revenue'}};const round=chartOption(donut) as any;assert.equal(round.series[0].radius[0]/round.series[0].radius[1],.7);assert.ok(round.series[0].center[1]>60);assert.ok(renderChartSvg(donut).includes('Quarterly revenue'));
  const before=JSON.stringify(c);validateChart({...c,...chartPresetPatch('minimal')});assert.equal(JSON.stringify(c),before);
});
test('headerless table continuation retains every row exactly once and physical export scales custom spacing',()=>{
  const table=element('table',{w:300,h:130,fontSize:20,lineHeight:1.2,cells:Array.from({length:8},(_,i)=>['Row '+i]),tableFit:{minimumFontSize:20,padding:8},tableStyle:{...tablePresetStyle('editorial'),headerRow:false,padding:8}}),slide=blankSlide();slide.elements=[table];
  const continued=continueTable(slide,table.id,()=>null);assert.deepEqual(continued.flatMap(s=>s.elements.find(e=>e.type==='table')!.cells!.flat()),table.cells!.flat());
  const deck={...newDeck('Physical',[slide]),width:1440,height:810,provenance:{provider:'fixture',pageSize:{width:720,height:405,canvasWidth:1440,canvasHeight:810}}};const native=nativePptxUnits(deck);assert.equal(native.slides[0].elements[0].tableStyle!.padding,8*2/3);assert.equal(deck.slides[0].elements[0].tableStyle!.padding,8);
});
test('custom table and chart styles survive standalone HTML and native editable PowerPoint export',async()=>{
  const slide=blankSlide(),table=element('table',{name:'Styled table',fontFamily:'Arial',x:20,y:30,w:800,h:240,fontSize:24,cells:[['Region','Revenue'],['North','1,250'],['South','960']],fill:'#172b26',tableStyle:{...tablePresetStyle('contrast'),headerFill:'#183E53',headerText:'#ffffff',banded:true,stripeFill:'#e8f0f6',columnWidths:[2,1]}}),chart=element('chart',{name:'Styled donut',fontFamily:'Arial',x:20,y:330,w:800,h:400,chart:{...sampleChart(),type:'donut',visual:{donutHole:72}},fill:sampleChart().colors[0]});slide.elements=[table,chart];const deck=validateDeck(newDeck('Export styles',[slide]));
  const html=await(await buildHtml(deck)).text();assert.ok(html.includes('tablePresentation'));assert.ok(html.includes('183E53'));assert.ok(html.includes('columnWidths'));
  const bytes=await buildPptx(deck,false,async()=>({w:1,h:1})),zip=await JSZip.loadAsync(bytes),xml=await zip.file('ppt/slides/slide1.xml')!.async('string');assert.ok(xml.includes('183E53'));assert.ok(xml.includes('e8f0f6')||xml.includes('E8F0F6'));assert.match(xml,/<a:pPr[^>]*algn="r"/);assert.match(xml,/<a:gridCol w="5080000"\/>/);
  const files=Object.keys(zip.files).filter(p=>/^ppt\/charts\/chart\d+\.xml$/.test(p));const chartXml=await zip.file(files[0])!.async('string');assert.match(chartXml,/<c:holeSize val="72"\/>/);assert.ok(zip.file('ppt/embeddings/Microsoft_Excel_Worksheet1.xlsx')||Object.keys(zip.files).some(p=>p.endsWith('.xlsx')));
});
