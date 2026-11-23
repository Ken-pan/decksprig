import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import JSZip from 'jszip';
import {element,blankSlide,newDeck,validateDeck} from '../src/core/model';
import {applyOperations} from '../src/core/operations';
import {styleTableRange,mergeTableRange} from '../src/core/table-structure';
import {tableRendering,tablePresentation,tableCellStyle} from '../src/core/table-appearance';
import {nativeTableImage,tableLayoutFingerprint} from '../src/core/native-table-layout';
import {scaleTableStyle} from '../src/core/table-schema';
import {buildPptx} from '../src/core/pptx-export';
import {importPptx} from '../src/importers/pptx';
import {importGoogle} from '../src/importers/google';

const range=(r:number,c:number,r2=r,c2=c)=>({anchor:{row:r,column:c},head:{row:r2,column:c2}});
const decoration=(e:ReturnType<typeof element>,r:number,c:number)=>tableCellStyle(tablePresentation(e),r,c).textDecoration;

test('a mixed rectangular cell selection changes only its decoration and remains one reversible document transaction',()=>{
 const e=element('table',{cells:[['A','B','C'],['中文🙂','E','F']],tableStyle:{cellStyles:[{row:0,column:0,underline:true,color:'#ff0000'},{row:1,column:0,strikethrough:true,italic:true},{row:1,column:2,underline:true}]}}),s=blankSlide();s.elements=[e];const before=newDeck('Cells',[s]);
 const patch=styleTableRange(e,range(0,0,1,1),{strikethrough:true,underline:false}),after=applyOperations(before,[{op:'update_element',slideId:s.id,elementId:e.id,patch}],before.revision),saved=validateDeck(JSON.parse(JSON.stringify(after))),changed=saved.slides[0].elements[0];
 assert.equal(after.revision,before.revision+1);assert.deepEqual(changed.cells,e.cells);assert.equal(tableCellStyle(tablePresentation(changed),0,0).color,'#ff0000');assert.equal(tableCellStyle(tablePresentation(changed),1,0).fontStyle,'italic');
 for(const [r,c]of [[0,0],[0,1],[1,0],[1,1]])assert.equal(decoration(changed,r,c),'line-through');assert.equal(decoration(changed,1,2),'underline');assert.equal(decoration(e,0,0),'underline');
 const restored=applyOperations(after,[{op:'update_element',slideId:s.id,elementId:e.id,patch:{tableStyle:e.tableStyle}}],after.revision);assert.deepEqual(restored.slides[0].elements[0],e);
});

test('cell overrides can clear whole-table decorations and portable rendering preserves both supported CSS decorations',()=>{
 const e=element('table',{cells:[['Inherited','Clear','Both']],strikethrough:true,tableStyle:{cellStyles:[{row:0,column:1,strikethrough:false},{row:0,column:2,underline:true}]}}),p=tablePresentation(e),portable=runInNewContext(`(${tableRendering.toString()})`,{__name:(f:Function)=>f})();
 assert.deepEqual([0,1,2].map(c=>tableCellStyle(p,0,c).textDecoration),['line-through','none','underline line-through']);
 for(let c=0;c<3;c++)assert.equal(portable.tableCellStyle(portable.tablePresentation(e),0,c).textDecoration,tableCellStyle(p,0,c).textDecoration);
 const plain=element('table',{cells:[['Cached']]});plain.nativeTableLayout={fingerprint:tableLayoutFingerprint(plain),src:'data:image/png;base64,AQ=='};assert(nativeTableImage({...plain,strikethrough:false}));assert.equal(nativeTableImage({...plain,strikethrough:true}),undefined);
});

test('merging and splitting retains covered-cell strike overrides and scaling does not change their meaning',()=>{
 const e=element('table',{cells:[['Anchor','Covered']],tableStyle:{cellStyles:[{row:0,column:1,strikethrough:true,fontSize:32}]}}),merged={...e,...mergeTableRange(e,range(0,0,0,1))},split={...merged,...mergeTableRange(merged,range(0,0),true)};
 assert.equal(decoration(split,0,1),'line-through');assert.deepEqual(split.cells,e.cells);assert.deepEqual(scaleTableStyle(split.tableStyle,.5)?.cellStyles,[{row:0,column:1,strikethrough:true,fontSize:16}]);
});

test('PPTX table decoration roundtrip keeps strike, underline and explicit undecorated cells independently',async()=>{
 const s=blankSlide();s.elements=[element('table',{fontSize:20,w:900,h:200,cells:[['Strike 中文🙂','Plain'],['Underline','Both']],strikethrough:true,tableStyle:{headerRow:false,cellStyles:[{row:0,column:1,strikethrough:false},{row:1,column:0,strikethrough:false,underline:true},{row:1,column:1,underline:true}]}})];
 const bytes=await buildPptx(newDeck('Decorations',[s])),zip=await JSZip.loadAsync(bytes),xml=await zip.file('ppt/slides/slide1.xml')!.async('string');assert.match(xml,/strike="sngStrike"/);assert.match(xml,/u="sng"/);
 const imported=(await importPptx(bytes,'decorations.pptx')).slides[0].elements.find(e=>e.type==='table')!;assert.deepEqual(imported.cells,s.elements[0].cells);assert.deepEqual([[0,0],[0,1],[1,0],[1,1]].map(([r,c])=>decoration(imported,r,c)),['line-through','none','underline','underline line-through']);
});

test('Google table import retains explicit strike clearing after the first cell sets the default',()=>{
 const cell=(content:string,style:object)=>({text:{textElements:[{textRun:{content,style}}]}}),deck=importGoogle({presentation:{pageSize:{width:{magnitude:720,unit:'PT'},height:{magnitude:405,unit:'PT'}},slides:[{objectId:'s',pageElements:[{objectId:'t',size:{width:{magnitude:400,unit:'PT'},height:{magnitude:100,unit:'PT'}},table:{tableRows:[{tableCells:[cell('Strike',{strikethrough:true}),cell('Plain',{}),cell('Underline',{underline:true})]}]}}]}]}}),e=deck.slides[0].elements[0];
 assert.deepEqual([0,1,2].map(c=>decoration(e,0,c)),['line-through','none','underline']);validateDeck(deck);
});
