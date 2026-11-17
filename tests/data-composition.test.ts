import {test} from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {element,blankSlide,newDeck,validateDeck} from '../src/core/model';
import {applyOperations} from '../src/core/operations';
import {mergeTableRange,styleTableRange,changeTableAxis,expandMergedRange,cellOwner,pasteTableRange} from '../src/core/table-structure';
import {tablePresentation,tableCellStyle,tableCellSpan,tablePresetStyle,tablePresetForElement} from '../src/core/table-appearance';
import {tableRowHeights,continueTable} from '../src/core/table-fit';
import {sampleChart} from '../src/core/charts';
import {chartWithText} from '../src/core/chart-text';
import {renderChartSvg} from '../src/core/chart-render';
import {buildPptx} from '../src/core/pptx-export';
import {buildHtml} from '../src/core/export';
const range={anchor:{row:1,column:0},head:{row:2,column:1}};
const table=()=>element('table',{w:720,h:360,fontSize:20,fontFamily:'Arial',cells:[['Item','Value','Status'],['A','10','Ready'],['B','20','Draft']],tableStyle:{...tablePresetStyle('banded'),columnWidths:[2,1,1],columnAlign:['left','right','center'],rowHeights:[1,2,3]}});
test('merge/split retains every source value and rejects overlapping or out-of-bounds patches atomically',()=>{
  const e=table(),merged={...e,...mergeTableRange(e,range)},p=tablePresentation(merged);
  assert.deepEqual(merged.cells,e.cells);assert.deepEqual(tableCellSpan(p,1,0),{covered:false,rowSpan:2,columnSpan:2});assert.ok(tableCellSpan(p,2,1).covered);
  assert.deepEqual(cellOwner(merged.tableStyle,{row:2,column:1}),{row:1,column:0});
  assert.deepEqual({...merged,...mergeTableRange(merged,range,true)}.cells,e.cells);
  const slide=blankSlide();slide.elements=[e];const deck=newDeck('Merges',[slide]),before=JSON.stringify(deck);
  for(const merges of [[{row:2,column:0,rowSpan:2,columnSpan:1}],[{row:0,column:0,rowSpan:2,columnSpan:1},{row:1,column:0,rowSpan:2,columnSpan:1}]])assert.throws(()=>applyOperations(deck,[{op:'update_element',slideId:slide.id,elementId:e.id,patch:{tableStyle:{merges}}}]));
  assert.throws(()=>applyOperations(deck,[{op:'update_element',slideId:slide.id,elementId:e.id,patch:{tableStyle:{cellStyles:[{row:9,column:0,fill:'#123456'}]}}}]));assert.equal(JSON.stringify(deck),before);
  const next=applyOperations(deck,[{op:'update_element',slideId:slide.id,elementId:e.id,patch:mergeTableRange(e,range)}],0,'manual');assert.equal(next.revision,1);assert.deepEqual(validateDeck(JSON.parse(JSON.stringify(next))).slides[0].elements[0].tableStyle?.merges,merged.tableStyle?.merges);
});
test('row/column edits remap addresses, spans, alignment and size weights without mutating source arrays',()=>{
  const e={...table(),...mergeTableRange(table(),range)};Object.assign(e,styleTableRange(e,range,{fill:'#123456',fontWeight:600}));const before=JSON.stringify(e);
  const inserted={...e,...changeTableAxis(e,'row',2,1,true)};assert.equal(inserted.tableStyle!.merges![0].rowSpan,3);assert.deepEqual(inserted.tableStyle!.rowHeights,[1,2,3,3]);assert.equal(inserted.tableStyle!.cellStyles!.at(-1)!.row,3);
  const removed={...inserted,...changeTableAxis(inserted,'row',2,1,false)};assert.deepEqual(removed,e);
  const cols={...e,...changeTableAxis(e,'column',1,1,true)};assert.equal(cols.tableStyle!.merges![0].columnSpan,3);assert.deepEqual(cols.tableStyle!.columnAlign,['left','auto','right','center']);assert.deepEqual(cols.tableStyle!.columnWidths,[2,1,1,1]);assert.deepEqual({...cols,...changeTableAxis(cols,'column',1,1,false)},e);
  const deletingOrigin={...e,...changeTableAxis(e,'row',1,1,false)};assert.deepEqual(deletingOrigin.tableStyle!.merges,[{row:1,column:0,rowSpan:1,columnSpan:2}]);assert.equal(deletingOrigin.cells![1][0],'B');assert.equal(JSON.stringify(e),before);
  assert.throws(()=>changeTableAxis(e,'row',0,3,false),/one row/);assert.throws(()=>changeTableAxis(e,'column',0,20,true),/20 columns/);
});
test('merged range closure includes complete cells and batch styling remains local and resettable',()=>{
  const e=table(),merged={...e,...mergeTableRange(e,range)},expanded=expandMergedRange(merged.tableStyle,{anchor:{row:2,column:1},head:{row:2,column:2}});
  assert.deepEqual(expanded,{anchor:{row:1,column:0},head:{row:2,column:2}});
  const styled={...merged,...styleTableRange(merged,range,{fill:'#123456',color:'#ffffff',align:'center',italic:true,fontWeight:600})},p=tablePresentation(styled);
  assert.equal(styled.tableStyle!.cellStyles!.length,4);assert.equal(tableCellStyle(p,1,0).background,'#123456');assert.equal(tableCellStyle(p,1,0).fontStyle,'italic');assert.equal(tableCellStyle(p,0,0).background,tableCellStyle(tablePresentation(e),0,0).background);
  assert.equal(styleTableRange(styled,range,null).tableStyle.cellStyles,undefined);assert.deepEqual(styled.cells,e.cells);
});
test('switching a table preset keeps merges, row heights, column widths and selected-cell overrides',()=>{
  const e={...table(),...mergeTableRange(table(),range)};Object.assign(e,styleTableRange(e,range,{fill:'#123456',align:'center'}));
  const before=JSON.stringify(e),s=tablePresetForElement(e,'contrast');assert.equal(s.preset,'contrast');
  for(const key of ['merges','cellStyles','rowHeights','columnWidths','columnAlign'] as const)assert.deepEqual(s[key],e.tableStyle![key]);
  assert.equal(tableCellStyle(tablePresentation({...e,tableStyle:s}),1,0).background,'#123456');assert.equal(JSON.stringify(e),before);
});
test('merged measurement uses combined column width and distributes spanning height; continuations retain local styles',()=>{
  const e=table(),merged={...e,...mergeTableRange(e,range)},widths:number[]=[];tableRowHeights(merged,20,(v)=>{widths.push(v.w);return {w:v.w,h:20};});
  // Row-only rules have no left/right stroke consuming the content width.
  assert.ok(widths.includes(720*.75-28));assert.equal(widths.length,6);
  const slide=blankSlide();slide.elements=[{...merged,h:100,tableFit:{minimumFontSize:20,padding:14}}];assert.throws(()=>continueTable(slide,merged.id,()=>({w:1,h:80})),/Split merged rows/);
});
test('HTML and native PowerPoint retain merged dimensions and selected-cell styles',async()=>{
  const e={...table(),...mergeTableRange(table(),range)};Object.assign(e,styleTableRange(e,range,{fill:'#123456',color:'#ffffff',align:'center',italic:true,fontWeight:600}));const slide=blankSlide();slide.elements=[e];const deck=newDeck('Table output',[slide]);
  const html=await(await buildHtml(deck)).text();assert.ok(html.includes('td.rowSpan=span.rowSpan'));assert.ok(html.includes('"rowSpan":2'));assert.ok(html.includes('"fill":"#123456"'));
  const zip=await JSZip.loadAsync(await buildPptx(deck)),xml=await zip.file('ppt/slides/slide1.xml')!.async('string');assert.match(xml,/rowSpan="2"/);assert.match(xml,/gridSpan="2"/);assert.match(xml,/123456/);assert.match(xml,/b="1"/);assert.match(xml,/i="1"/);assert.match(xml,/algn="ctr"/);
});
test('chart text edits target original indices and preserve every numeric/style field with atomic validation',()=>{
  const c={...sampleChart(),title:'Original',labels:['Repeated','Repeated','Long label','Last'],series:[{name:'One',values:[1,2,3,4]},{name:'Two',values:[5,6,7,8]}]},before=JSON.stringify(c);
  const next=chartWithText(c,{kind:'category',index:1},'Updated');assert.deepEqual(next.labels,['Repeated','Updated','Long label','Last']);assert.deepEqual(next.series,c.series);
  assert.equal(chartWithText(c,{kind:'series',index:1},'Actuals').series[1].name,'Actuals');assert.throws(()=>chartWithText(c,{kind:'series',index:1},'One'),/unique|different/i);assert.throws(()=>chartWithText(c,{kind:'category',index:0},''));assert.throws(()=>chartWithText(c,{kind:'category',index:9},'Unknown'));
  assert.equal(chartWithText(c,{kind:'title'},'').title,'');assert.equal(JSON.stringify(c),before);
});
test('interactive SVG text identities survive repeated/truncated categories, legends, reversed axes and pie side legends',()=>{
  for(const type of ['column','bar','line','area','pie','donut'] as const)for(const w of [360,800]){
    const c={...sampleChart(),type,legend:true,title:'Repeated',subtitle:'Repeated',categoryTitle:'Period',valueTitle:'Count',pieSeries:1,labels:['Repeated','Repeated','Long label $& <>&"','Last'],series:[{name:'One',values:[1,2,3,4]},{name:'Two',values:[5,6,7,8]}]},e=element('chart',{chart:c,w,h:480}),svg=renderChartSvg(e,true);
    assert.match(svg,/data-chart-text="title"/);assert.match(svg,/data-chart-text="subtitle"/);assert.match(svg,/data-chart-text="category" data-chart-text-index="0"/);assert.match(svg,/data-chart-point="true"/);if(!['pie','donut'].includes(type))assert.match(svg,/data-chart-text="series" data-chart-text-index="1"/);
    assert.ok(!renderChartSvg(e).includes('data-chart-text'));assert.ok(!renderChartSvg(e).includes('data-chart-drag'));assert.deepEqual(e.chart,c);
    assert.ok(!/<path[^>]*ecmeta_ssr_type="legend"[^>]*data-chart-point/.test(svg));
  }
  const c={...sampleChart(),type:'pie' as const,legend:false,showValues:true},svg=renderChartSvg(element('chart',{chart:c,w:800,h:480}),true);for(let index=0;index<c.labels.length;index++)assert.ok(svg.includes(`data-chart-text="category" data-chart-text-index="${index}"`));
});

test('range paste splits intersecting merges, preserves outside merges and commits data atomically',()=>{
  const original={...table(),...mergeTableRange(table(),range)},before=JSON.stringify(original);
  const result=pasteTableRange(original,'New\t10\nOther\t20',{anchor:{row:1,column:0},head:{row:1,column:0}});
  assert.equal(result.tableStyle?.merges,undefined);
  assert.deepEqual(result.cells.slice(1).map(row=>row.slice(0,2)),[['New','10'],['Other','20']]);
  assert.deepEqual(result.tableStyle?.columnWidths,original.tableStyle?.columnWidths);
  const outside=pasteTableRange(original,'Header',{anchor:{row:0,column:0},head:{row:0,column:0}});
  assert.deepEqual(outside.tableStyle?.merges,original.tableStyle?.merges);
  const slide={...blankSlide(),elements:[original]},deck=newDeck('Paste',[slide]);
  const after=applyOperations(deck,[{op:'update_element',slideId:slide.id,elementId:original.id,patch:{cells:result.cells,tableStyle:result.tableStyle}}]);
  assert.equal(after.revision,deck.revision+1);validateDeck(after);
  assert.throws(()=>pasteTableRange(original,'a\tb\nc',{anchor:{row:1,column:0},head:{row:1,column:0}}),/rectangular/);
  assert.equal(JSON.stringify(original),before);
});
test('range paste extends dimensions and repeats into a selected rectangle without losing local styling',()=>{
  const original=table();const result=pasteTableRange(original,'x',{anchor:{row:1,column:0},head:{row:2,column:1}});
  assert.deepEqual(result.cells.slice(1).map(row=>row.slice(0,2)),[['x','x'],['x','x']]);
  const extended=pasteTableRange(original,'a\tb\nc\td',{anchor:{row:2,column:2},head:{row:2,column:2}});
  assert.equal(extended.cells.length,4);assert.equal(extended.cells[0].length,4);assert.equal(extended.cells[3][3],'d');
  assert.deepEqual(extended.tableStyle,original.tableStyle);
});
