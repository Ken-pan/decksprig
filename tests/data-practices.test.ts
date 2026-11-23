import {test} from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {element,blankSlide,newDeck} from '../src/core/model';
import {sampleChart} from '../src/core/charts';
import {chartLabelLayout} from '../src/core/chart-layout';
import {chartOption,renderChartSvg} from '../src/core/chart-render';
import {contentTableColumns} from '../src/core/table-columns';
import {tablePresetStyle} from '../src/core/table-appearance';
import {applyOperations} from '../src/core/operations';
import {buildPptx} from '../src/core/pptx-export';

test('dense professional charts space readable labels without removing data or legacy labels',()=>{
  const chart={...sampleChart(),prefix:'$',labels:Array.from({length:24},(_,i)=>'Customer segment '+(i+1)),series:[{name:'Revenue',values:Array.from({length:24},(_,i)=>1000000+i*350000)}],source:'',showValues:true};
  const e=element('chart',{chart,w:760,h:440,fontSize:22,fill:chart.colors[0]}),before=JSON.stringify(e);
  const layout=chartLabelLayout(e,chart),option=chartOption(e) as any;
  assert.ok(layout.step>1);assert.ok(layout.leftLabelWidth>80);
  assert.equal(option.series[0].data.length,24);assert.equal(option.series[0].labelLayout.hideOverlap,true);
  assert.equal(option.xAxis.axisLabel.interval(0),true);assert.equal(option.xAxis.axisLabel.interval(23),true);
  const svg=renderChartSvg(e);assert.ok(svg.includes('Customer segment 1'));assert.ok(svg.includes('Customer segment 24'));
  const title=svg.match(/<title>([\s\S]*?)<\/title>/)![1];assert.ok(title.includes('$1,000,000'));assert.equal((svg.match(/<svg\b/g)??[]).length,1);
  assert.equal(JSON.stringify(e),before);
  const legacy={...e,chart:{...chart,visual:undefined}};assert.equal(chartLabelLayout(legacy,legacy.chart).step,1);assert.equal((chartOption(legacy) as any).xAxis.axisLabel.interval,0);
});
test('negative unstacked bars and columns place value labels at the outer end',()=>{
  const chart={...sampleChart(),labels:['Loss','Gain'],series:[{name:'Change',values:[-125,80]}],showValues:true};
  for(const type of ['bar','column'] as const){const option=chartOption(element('chart',{chart:{...chart,type},w:720,h:420,fill:chart.colors[0]})) as any;assert.equal(option.series[0].data[0].value,-125);assert.equal(option.series[0].data[0].label.position,type==='bar'?'left':'bottom');if(type==='bar')assert.ok(option.yAxis.axisLabel.margin>20);}
});
test('content-sized columns preserve total width, minimum space, data and undoable transactions',()=>{
  const e=element('table',{w:720,h:240,fontSize:22,cells:[['Description','Amount','Code'],['Customer research and synthesis','$1,250','A']],tableStyle:tablePresetStyle('editorial')});
  const before=JSON.stringify(e),widths=contentTableColumns(e);assert.ok(widths[0]>widths[1]);assert.ok(widths[1]>widths[2]);assert.ok(widths.every(w=>w>=72));assert.ok(Math.abs(widths.reduce((a,b)=>a+b,0)-720)<1e-8);assert.equal(JSON.stringify(e),before);
  const slide=blankSlide();slide.elements=[e];const deck=newDeck('Columns',[slide]),next=applyOperations(deck,[{op:'update_element',slideId:slide.id,elementId:e.id,patch:{tableStyle:{...e.tableStyle,columnWidths:widths}}}],deck.revision,'manual');assert.deepEqual(next.slides[0].elements[0].cells,e.cells);assert.equal(next.slides[0].elements[0].w,e.w);assert.equal(deck.revision,0);
  const narrow=contentTableColumns({...e,w:96});assert.ok(narrow.every(w=>w>=32));assert.deepEqual(contentTableColumns({...e,cells:[['Only']]}),[720]);
  const multiline=contentTableColumns({...e,cells:Array.from({length:100},()=>['\n'.repeat(4999),'42',''])});assert.ok(multiline.every(Number.isFinite));
});
test('native editable charts retain every workbook row with readable category tick spacing',async()=>{
  const chart={...sampleChart(),labels:Array.from({length:20},(_,i)=>'Segment '+(i+1)),series:[{name:'Value',values:Array.from({length:20},(_,i)=>i+1)}],source:''};
  const e=element('chart',{chart,w:600,h:360,fontSize:22,fill:chart.colors[0]}),slide=blankSlide();slide.elements=[e];
  const zip=await JSZip.loadAsync(await buildPptx(newDeck('Dense',[slide]),false,async()=>({w:1,h:1}))),name=Object.keys(zip.files).find(f=>/^ppt\/charts\/chart\d+\.xml$/.test(f))!,xml=await zip.file(name)!.async('string');
  assert.ok(xml.includes('Segment 20'));assert.match(xml,/<c:tickLblSkip val="[2-9]\d*"\/>/);assert.ok(Object.keys(zip.files).some(f=>f.endsWith('.xlsx')));
});
