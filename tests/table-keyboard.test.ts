import {test} from 'node:test';
import assert from 'node:assert/strict';
import {element,validateDeck,newDeck,blankSlide} from '../src/core/model';
import {applyOperations} from '../src/core/operations';
import {deleteTableSelection,tableTabNavigation} from '../src/core/table-keyboard';
import {changeTableAxis} from '../src/core/table-structure';
import {tablePresentation} from '../src/core/table-appearance';

const range=(top:number,left:number,bottom=top,right=left)=>({anchor:{row:top,column:left},head:{row:bottom,column:right}});
const table=()=>element('table',{cells:[['Name','Value','Region'],['First','1','West'],['Second','2','East']]});

test('Tab crosses rows and appends only after the last visible cell',()=>{
  const e=table(),before=JSON.stringify(e);
  assert.deepEqual(tableTabNavigation(e,{row:0,column:2}),{kind:'move',cell:{row:1,column:0}});
  const last=tableTabNavigation(e,{row:2,column:2});
  assert.equal(last.kind,'append');assert.deepEqual(last.cell,{row:3,column:0});
  assert.deepEqual(last.patch?.cells,[...e.cells!,['','','']]);assert.equal(JSON.stringify(e),before);
});

test('Shift+Tab never appends or prepends a row',()=>{
  const e=table();
  assert.deepEqual(tableTabNavigation(e,{row:0,column:0},true),{kind:'edge',cell:{row:0,column:0}});
  assert.deepEqual(tableTabNavigation(e,{row:2,column:2},true),{kind:'move',cell:{row:2,column:1}});
});

test('Tab skips merged covered cells and recognizes a merged last visible owner',()=>{
  const e={...table(),tableStyle:{merges:[{row:1,column:0,rowSpan:2,columnSpan:3}]}};
  assert.deepEqual(tableTabNavigation(e,{row:0,column:2}),{kind:'move',cell:{row:1,column:0}});
  assert.equal(tableTabNavigation(e,{row:1,column:0}).kind,'append');
  assert.equal(tableTabNavigation(e,{row:2,column:2}).kind,'append');
  assert.deepEqual(tableTabNavigation(e,{row:2,column:2},true),{kind:'move',cell:{row:0,column:2}});
});

test('an inline draft and appended row preserve hidden values, sizes, merges and formatting in one patch',()=>{
  const e=element('table',{cells:[['A','B','C'],['one','two','retained']],tableStyle:{rowHeights:[1,2],columnWidths:[2,3,4],columnAlign:['left','center','right'],merges:[{row:1,column:1,rowSpan:1,columnSpan:2}],cellStyles:[{row:1,column:2,italic:true,fill:'#123456'}]}}),before=structuredClone(e);
  const next=tableTabNavigation(e,{row:1,column:1},false,'Updated');assert.equal(next.kind,'append');if(next.kind!=='append')return;
  assert.deepEqual(next.patch.cells,[['A','B','C'],['one','Updated','retained'],['','','']]);
  assert.deepEqual(next.patch.tableStyle,{...e.tableStyle,rowHeights:[1,2,2]});assert.deepEqual(e,before);
  const slide={...blankSlide(),elements:[e]},base=newDeck('Table keyboard',[slide]);
  const after=applyOperations(base,[{op:'update_element',slideId:slide.id,elementId:e.id,patch:next.patch}]);
  validateDeck(after);assert.equal(after.revision,base.revision+1);assert.equal(after.slides[0].elements[0].cells?.[1][1],'Updated');assert.equal(after.slides[0].elements[0].cells?.length,3);
});

test('Tab at the 100-row cap has no patch and keeps focus on the visible owner',()=>{
  const e=element('table',{cells:Array.from({length:100},(_,row)=>[String(row),'last']),tableStyle:{merges:[{row:99,column:0,rowSpan:1,columnSpan:2}]}}),before=JSON.stringify(e);
  assert.deepEqual(tableTabNavigation(e,{row:99,column:1},false,'Unsaved draft'),{kind:'limit',cell:{row:99,column:0}});
  assert.deepEqual(tableTabNavigation(e,{row:99,column:0},true),{kind:'move',cell:{row:98,column:1}});assert.equal(JSON.stringify(e),before);
});

test('native-reference trailing append preserves existing absolute row heights in the shared draft and grid patch',()=>{
 const e=element('table',{h:300,cells:[['First','Value'],['Last','Value']],tableStyle:{rowHeights:[1,2]},nativeTableLayout:{fingerprint:'reference',src:'data:image/png;base64,AQ=='}}),next=tableTabNavigation(e,{row:1,column:1},false,'Draft 中文🙂');assert.equal(next.kind,'append');if(next.kind!=='append')return;
 const direct=changeTableAxis(e,'row',2,1,true);assert.equal(next.patch.h,500);assert.equal(direct.h,next.patch.h);const changed={...e,...next.patch},p=tablePresentation(changed);assert.deepEqual(p.heights?.map(h=>h*changed.h),[100,200,200]);assert.equal(changed.cells![1][1],'Draft 中文🙂');assert.equal(e.h,300);
 const slide={...blankSlide(),elements:[e]},before=newDeck('Native append',[slide]),after=applyOperations(before,[{op:'update_element',slideId:slide.id,elementId:e.id,patch:next.patch}]);assert.equal(after.revision,before.revision+1);assert.equal(after.slides[0].elements[0].h,500);
 const restored=applyOperations(after,[{op:'update_element',slideId:slide.id,elementId:e.id,patch:{cells:e.cells,tableStyle:e.tableStyle,h:e.h}}]);assert.deepEqual(restored.slides[0].elements[0],e);
 assert.equal(changeTableAxis({...e,nativeTableLayout:undefined},'row',2,1,true).h,undefined);assert.equal(changeTableAxis(e,'row',1,1,true).h,undefined);assert.equal(changeTableAxis(e,'column',2,1,true).h,undefined);
});

test('ordinary full-row and full-column rectangles clear content without deleting structure',()=>{
  const e=table(),row=deleteTableSelection(e,range(1,0,1,2)),column=deleteTableSelection(e,range(0,1,2,1));
  assert.deepEqual(row.cells,[e.cells![0],['','',''],e.cells![2]]);assert.equal(row.cells.length,3);assert(!('tableStyle' in row));
  assert.deepEqual(column.cells,[['Name','','Region'],['First','','West'],['Second','','East']]);assert.equal(column.cells[0].length,3);
});

test('explicit row selection deletes structure and remaps addresses and row weights',()=>{
  const e={...table(),tableStyle:{rowHeights:[1,2,3],columnWidths:[2,3,4],cellStyles:[{row:2,column:1,italic:true}]}},before=JSON.stringify(e);
  const result=deleteTableSelection(e,range(1,0,1,2),'row');
  assert.deepEqual(result.cells,[e.cells![0],e.cells![2]]);assert.deepEqual(result.tableStyle?.rowHeights,[1,3]);assert.deepEqual(result.tableStyle?.columnWidths,[2,3,4]);assert.equal(result.tableStyle?.cellStyles?.[0].row,1);assert.equal(JSON.stringify(e),before);
});

test('explicit column selection deletes structure, remaps formatting and keeps one column',()=>{
  const e={...table(),tableStyle:{columnWidths:[2,3,4],columnAlign:['left','center','right'] as ('left'|'center'|'right')[],cellStyles:[{row:1,column:2,italic:true}]}};
  const result=deleteTableSelection(e,range(0,1,2,1),'column');
  assert.deepEqual(result.cells,[['Name','Region'],['First','West'],['Second','East']]);assert.deepEqual(result.tableStyle?.columnWidths,[2,4]);assert.deepEqual(result.tableStyle?.columnAlign,['left','right']);assert.equal(result.tableStyle?.cellStyles?.[0].column,1);
  assert.throws(()=>deleteTableSelection(e,range(0,0,2,2),'column'),/Keep at least one column/);
  assert.throws(()=>deleteTableSelection(e,range(0,0,2,2),'row'),/Keep at least one row/);
});

test('structural selection includes whole merged blocks while ordinary clearing retains hidden values elsewhere',()=>{
  const e={...table(),tableStyle:{merges:[{row:1,column:0,rowSpan:2,columnSpan:1}]}};
  assert.deepEqual(deleteTableSelection(e,range(2,0,2,2),'row').cells,[e.cells![0]]);
  const cleared=deleteTableSelection(e,range(1,0));assert.deepEqual(cleared.cells,[e.cells![0],['','1','West'],['','2','East']]);assert.deepEqual(e.cells?.[2],['Second','2','East']);
});
