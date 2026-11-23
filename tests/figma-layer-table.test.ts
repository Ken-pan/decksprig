import test from 'node:test';import assert from 'node:assert/strict';
import {tableHost} from './helpers/figma-table-host';
import {captureFigma,serializeForDeck} from '../plugins/figma-export/capture';
import {applyDeckToFigma} from '../plugins/figma-export/native';
import {readLayerTable} from '../plugins/figma-export/layer-table';
import {element} from '../src/core/model';
import {tableCellStyle,tablePresentation} from '../src/core/table-appearance';
import {scaleTableStyle} from '../src/core/table-schema';
import {importFigma} from '../src/importers/figma';

async function setup(){const env=tableHost(),before=importFigma(await captureFigma(env.host,[env.slide])),after=structuredClone(before);after.slides[0].elements=[element('table',{id:'authored-table',name:'Merged pricing',x:200,y:160,w:900,h:360,fontFamily:'Inter',fontSize:24,fill:'#172b26',cells:[['Plans','Team','Scale'],['Seats','10','50'],['Price','$20','$80']],tableStyle:{preset:'contrast',headerRow:true,padding:16,borders:'grid',borderWidth:1,headerFill:'#123456',headerText:'#ffffff',bodyFill:'#ffffff',lineColor:'#445566',columnWidths:[2,1,1],rowHeights:[1,1,1],cellStyles:[{row:1,column:2,fill:'#fff4cc',color:'#994422',fontWeight:700,italic:true,align:'right'}]}})];return {...env,before,after};}
const cells=(n:any)=>n.children.filter((c:any)=>/^\d+:\d+$/.test(c.getPluginData('deck-studio-table-cell')));
const at=(n:any,address:string)=>cells(n).find((c:any)=>c.getPluginData('deck-studio-table-cell')===address);

test('new tables use native editable cell frames/text and preserve their table semantics on readback',async()=>{
 const {host,slide,before,after}=await setup();await applyDeckToFigma(host,after,before);const root=slide.children[0];assert.equal(root.type,'FRAME');assert.equal(cells(root).length,9);assert.equal(root.children.filter((c:any)=>c.type==='VECTOR').length,1);assert.equal(at(root,'1:2').children[0].fontName.style,'Bold Italic');
 const captured=await captureFigma(host,[slide]),round=importFigma(captured),table=round.slides[0].elements[0];assert.equal(table.type,'table');assert.equal(table.id,'authored-table');assert.deepEqual(table.cells,after.slides[0].elements[0].cells);assert(table.nativeTableLayout);assert.equal(table.tableStyle?.cellStyles?.find(c=>c.row===1&&c.column===2)?.fill,'#fff4cc');assert(captured.nodeRenders[root.id]);
});
test('merge, split and structural updates retain anchor IDs and covered content, preserving unrelated native additions',async()=>{
 const {host,slide,node,before,after}=await setup();await applyDeckToFigma(host,after,before);const root=slide.children[0],anchor=at(root,'0:0'),text=anchor.children[0],extra=node('RECTANGLE');extra.name='Native addition';root.appendChild(extra);
 const merged=structuredClone(after);merged.slides[0].elements[0].tableStyle!.merges=[{row:0,column:0,rowSpan:1,columnSpan:2}];await applyDeckToFigma(host,merged,after);assert.equal(cells(root).length,8);assert.equal(at(root,'0:0'),anchor);assert.equal(anchor.children[0],text);assert.equal(at(root,'0:1'),undefined);assert.equal(readLayerTable(root)?.cells?.[0][1],'Team');assert(root.children.includes(extra));
 await applyDeckToFigma(host,after,merged);assert.equal(cells(root).length,9);assert.equal(at(root,'0:0'),anchor);assert.equal(at(root,'0:1').children[0].characters,'Team');assert(root.children.includes(extra));
 const grown=structuredClone(after);grown.slides[0].elements[0].cells!.push(['New','1','2']);await applyDeckToFigma(host,grown,after);assert.equal(cells(root).length,12);assert.equal(at(root,'0:0'),anchor);
});
test('native text and supported style edits are read back, while invalid metadata cannot impersonate an editable table',async()=>{
 const {host,slide,before,after}=await setup();await applyDeckToFigma(host,after,before);const root=slide.children[0],text=at(root,'1:1').children[0];text.characters='From Figma 中文';text.fontName={family:'Inter',style:'Bold'};text.fills=[{type:'SOLID',color:{r:1,g:0,b:0}}];const data=readLayerTable(root)!;assert.equal(data.cells?.[1][1],'From Figma 中文');assert.equal(data.tableStyle?.cellStyles?.find(c=>c.row===1&&c.column===1)?.fontWeight,700);assert.equal(data.tableStyle?.cellStyles?.find(c=>c.row===1&&c.column===1)?.color,'#ff0000');assert(serializeForDeck(root).children.length>0);
 root.setPluginData('deck-studio-table-v1','{"cells":[["data"]],"unexpected":"not trusted"}');assert.equal(readLayerTable(root),undefined);root.setPluginData('deck-studio-table-v1',JSON.stringify({...data,tableStyle:{merges:[{row:0,column:0,rowSpan:99,columnSpan:2}]}}));assert.equal(readLayerTable(root),undefined);
});
test('missing formatting fonts reject the entire new table before changing the native slide',async()=>{
 const {host,slide,before,after}=await setup();host.listAvailableFontsAsync=async()=>[{fontName:{family:'Inter',style:'Regular'}}];await assert.rejects(()=>applyDeckToFigma(host,after,before),/Install Inter/);assert.equal(slide.children.length,0);
});

test('a native renderer failure enters the single native Undo rollback even before a new group returns',async()=>{
 const {host,before,after}=await setup();let undo=0;host.triggerUndo=()=>undo++;host.createVector=()=>{throw new Error('Injected native path failure');};await assert.rejects(()=>applyDeckToFigma(host,after,before),/Injected native path failure/);assert.equal(undo,1);
});

test('cell typography survives both directions, merge/split and scaled exports',async()=>{
 const {host,slide,before,after}=await setup();const table=after.slides[0].elements[0];const catalog=await host.listAvailableFontsAsync();host.listAvailableFontsAsync=async()=>[...catalog,{fontName:{family:'Other face',style:'Regular'}}];table.tableStyle!.cellStyles!.push({row:2,column:1,fontFamily:'Other face',fontSize:38,underline:true});
 await applyDeckToFigma(host,after,before);const root=slide.children[0],text=at(root,'2:1').children[0];assert.equal(text.fontSize,38);assert.equal(text.textDecoration,'UNDERLINE');
 text.fontName={family:'Native face',style:'Regular'};text.fontSize=42;text.textDecoration='NONE';at(root,'2:1').primaryAxisAlignItems='MAX';let data=readLayerTable(root)!;const style=data.tableStyle!.cellStyles!.find(s=>s.row===2&&s.column===1)!;assert.equal(style.fontFamily,'Native face');assert.equal(style.fontSize,42);assert.equal(style.underline,false);assert.equal(style.verticalAlign,'bottom');
 const p=tableCellStyle(tablePresentation(table),2,1);assert.equal(p.fontSize,'38px');assert.equal(p.textDecoration,'underline');assert.equal(scaleTableStyle(table.tableStyle,.5)?.cellStyles?.find(s=>s.row===2&&s.column===1)?.fontSize,19);
 const merged=structuredClone(after);merged.slides[0].elements[0].tableStyle!.merges=[{row:2,column:0,rowSpan:1,columnSpan:2}];await applyDeckToFigma(host,merged,after);const covered=readLayerTable(root)!.tableStyle!.cellStyles!.find(s=>s.row===2&&s.column===1)!;assert.equal(covered.fontSize,38);assert.equal(covered.fontFamily,'Other face');assert.equal(covered.underline,true);await applyDeckToFigma(host,after,merged);assert.equal(at(root,'2:1').children[0].fontSize,38);assert.equal(at(root,'2:1').children[0].textDecoration,'UNDERLINE');
});

test('large Unicode table metadata rejects before native writes, including UTF-8 rather than character count',async()=>{
 const {host,slide,before,after}=await setup();const e=after.slides[0].elements[0];e.cells=Array.from({length:20},()=>Array.from({length:20},()=> '中文🙂'.repeat(50)));e.tableStyle={preset:'grid'};await assert.rejects(()=>applyDeckToFigma(host,after,before),/too large/);assert.equal(slide.children.length,0);
});

test('editable table layers retain cell strike, native changes and explicit clearing across merge/split',async()=>{
 const {host,slide,before,after}=await setup(),e=after.slides[0].elements[0];e.strikethrough=true;e.tableStyle!.cellStyles!.push({row:2,column:1,strikethrough:false,underline:true});await applyDeckToFigma(host,after,before);const root=slide.children[0],anchor=at(root,'2:0'),text=at(root,'2:1').children[0];assert.equal(anchor.children[0].textDecoration,'STRIKETHROUGH');assert.equal(text.textDecoration,'UNDERLINE');
 text.textDecoration='STRIKETHROUGH';let data=readLayerTable(root)!;assert.equal(data.strikethrough,true);assert.equal(data.tableStyle!.cellStyles!.find(s=>s.row===2&&s.column===1)?.strikethrough,true);assert.equal(data.tableStyle!.cellStyles!.find(s=>s.row===2&&s.column===1)?.underline,false);
 const changed=structuredClone(after);changed.slides[0].elements[0].tableStyle!.cellStyles!.find(s=>s.row===2&&s.column===1)!.underline=false;await applyDeckToFigma(host,changed,after);assert.equal(text.textDecoration,'NONE');
 const merged=structuredClone(changed);merged.slides[0].elements[0].tableStyle!.merges=[{row:2,column:0,rowSpan:1,columnSpan:2}];await applyDeckToFigma(host,merged,changed);data=readLayerTable(root)!;assert.equal(data.tableStyle!.cellStyles!.find(s=>s.row===2&&s.column===1)?.strikethrough,false);await applyDeckToFigma(host,changed,merged);assert.equal(at(root,'2:0'),anchor);assert.equal(at(root,'2:1').children[0].textDecoration,'NONE');
});
