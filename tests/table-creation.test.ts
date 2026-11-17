import test from 'node:test';
import assert from 'node:assert/strict';
import {element} from '../src/core/model';
import {blankTableWithStyle} from '../src/core/table-creation';
import {nativeTableImage,tableLayoutFingerprint} from '../src/core/native-table-layout';

test('blank style creation keeps native table geometry and formatting while clearing every cell without touching the source',()=>{
 const source=element('table',{id:'original',sourceId:'210:21',x:100,y:200,w:384,h:128,cells:[['A1','B1'],['A2','B2']],fontFamily:'Inter',fontSize:18,fontWeight:500,tableStyle:{headerRow:false,columnWidths:[144,240],rowHeights:[64,64],cellStyles:[{row:1,column:1,underline:true}]}});
 source.nativeTableLayout={fingerprint:tableLayoutFingerprint(source),src:'data:image/png;base64,AQ=='};
 const before=structuredClone(source),copy=blankTableWithStyle(source,{width:1920,height:1080});
 assert.deepEqual(source,before);assert.notEqual(copy.id,source.id);assert.equal(copy.sourceId,'210:21');
 assert.deepEqual(copy.cells,[['',''],['','']]);assert.deepEqual(copy.tableStyle,source.tableStyle);
 assert.deepEqual([copy.x,copy.y,copy.w,copy.h],[124,224,384,128]);assert.equal(copy.fontFamily,'Inter');assert.equal(copy.fontSize,18);assert.equal(copy.fontWeight,500);
 assert.deepEqual(copy.nativeTableLayout,source.nativeTableLayout);assert.equal(nativeTableImage(copy),undefined,'a source image containing old text must not paint the blank table');
 copy.cells![0][0]='New';copy.tableStyle!.cellStyles![0].underline=false;
 assert.deepEqual(source,before,'the two editable cell/style containers are independent');
});

test('local blank tables keep merges and their covered cells blank without receiving native provenance or source interaction identity',()=>{
 const source=element('table',{cells:[['Title','Covered'],['Body','Value']],tableStyle:{merges:[{row:0,column:0,rowSpan:1,columnSpan:2}]},group:'source-group',layoutItem:{widthMode:'fill',heightMode:'fixed'},blockItem:0,link:'https://example.com',motionKey:'shared',motionMatch:'auto',animation:{effect:'fade',duration:500,delay:0,order:0,trigger:'click',easing:'smooth'}});
 const copy=blankTableWithStyle(source,{width:1920,height:1080});
 assert.deepEqual(copy.cells,[['',''],['','']]);assert.deepEqual(copy.tableStyle?.merges,source.tableStyle?.merges);
 for(const key of ['sourceId','nativeTableLayout','group','layoutItem','blockItem','link','animation','motionKey','motionMatch'] as const)assert.equal(copy[key],undefined,key);
 assert.equal(source.cells?.[0][1],'Covered');assert.equal(source.group,'source-group');
});

test('style-based creation uses the existing paste placement bounds on small pages and near edges',()=>{
 const source=element('table',{x:1600,y:980,w:300,h:100,cells:[['Value']]});
 const copy=blankTableWithStyle(source,{width:1920,height:1080});assert.equal(copy.x,1620);assert.equal(copy.y,980);
 const oversized=blankTableWithStyle(source,{width:200,height:80});assert.equal(oversized.x,0);assert.equal(oversized.y,0);assert.equal(oversized.w,300);assert.equal(oversized.h,100);
 assert.throws(()=>blankTableWithStyle(element('rect'),{width:1920,height:1080}),/Select a table/);
});
