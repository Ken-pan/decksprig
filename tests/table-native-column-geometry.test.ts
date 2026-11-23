import {test} from 'node:test';
import assert from 'node:assert/strict';
import {element,blankSlide,newDeck,validateDeck,type SlideElement} from '../src/core/model';
import {applyOperations} from '../src/core/operations';
import {changeTableAxis} from '../src/core/table-structure';
import {deleteTableSelection} from '../src/core/table-keyboard';
import {tablePresentation} from '../src/core/table-appearance';
import {nativeTableImage,tableLayoutFingerprint} from '../src/core/native-table-layout';

function table(){
  const e=element('table',{x:40,y:50,w:384,h:128,cells:[['A1','B1'],['A2','B2']],tableStyle:{headerRow:false,columnWidths:[144,240],rowHeights:[64,64],columnAlign:['left','right'],cellStyles:[{row:1,column:1,strikethrough:true}]}});
  e.nativeTableLayout={fingerprint:tableLayoutFingerprint(e),src:'data:image/png;base64,AQ=='};return e;
}
function absoluteWidths(e:SlideElement){return tablePresentation(e).widths.map(width=>width*e.w);}
function close(actual:number[],expected:number[]){assert.equal(actual.length,expected.length);actual.forEach((value,i)=>assert(Math.abs(value-expected[i])<1e-8,`${value} != ${expected[i]}`));}

test('native-reference Add column retains unequal existing widths and appends one last-column width',()=>{
  const e=table(),before=structuredClone(e),patch=changeTableAxis(e,'column',2,1,true),draft={...e,...patch};
  assert.equal(patch.w,624);assert.equal(patch.h,undefined);assert.deepEqual(patch.cells,[['A1','B1',''],['A2','B2','']]);
  close(absoluteWidths(draft),[144,240,240]);assert.deepEqual(patch.tableStyle?.columnWidths,[144,240,240]);assert.deepEqual(patch.tableStyle?.columnAlign,['left','right','auto']);
  assert.deepEqual(patch.tableStyle?.rowHeights,[64,64]);assert.deepEqual(patch.tableStyle?.cellStyles,e.tableStyle?.cellStyles);assert.equal(draft.x,e.x);assert.equal(draft.y,e.y);assert.equal(draft.h,e.h);
  assert(nativeTableImage(e));assert.equal(nativeTableImage(draft),undefined);assert.deepEqual(e,before);
});

test('native-reference last-column deletion shrinks width and removes only trailing addresses',()=>{
  const e=table(),added={...e,...changeTableAxis(e,'column',2,1,true)},patch=deleteTableSelection(added,{anchor:{row:0,column:2},head:{row:1,column:2}},'column');
  assert.equal(patch.w,384);const draft={...added,...patch};close(absoluteWidths(draft),[144,240]);assert.deepEqual(draft.cells,e.cells);assert.deepEqual(draft.tableStyle?.cellStyles,e.tableStyle?.cellStyles);
  const removed=changeTableAxis(e,'column',1,1,false);assert.equal(removed.w,144);close(absoluteWidths({...e,...removed}),[144]);assert.deepEqual(removed.cells,[['A1'],['A2']]);assert.equal(removed.tableStyle?.cellStyles,undefined);assert.deepEqual(removed.tableStyle?.rowHeights,[64,64]);
});

test('native trailing width uses effective missing and partial column weights',()=>{
  const e=table(),unweighted={...e,tableStyle:{headerRow:false}},equal=changeTableAxis(unweighted,'column',2,1,true);assert.equal(equal.w,576);close(absoluteWidths({...unweighted,...equal}),[192,192,192]);
  const partial={...e,w:600,cells:[['A','B','C'],['D','E','F']],tableStyle:{columnWidths:[1,3]}},patch=changeTableAxis(partial,'column',3,1,true);assert.equal(patch.w,800);close(absoluteWidths({...partial,...patch}),[100,300,200,200]);
});

test('ordinary tables and nontrailing column edits keep their existing fixed table width',()=>{
  const e=table(),plain={...e,nativeTableLayout:undefined};
  assert.equal(changeTableAxis(plain,'column',2,1,true).w,undefined);assert.equal(changeTableAxis(plain,'column',1,1,false).w,undefined);
  assert.equal(changeTableAxis(e,'column',1,1,true).w,undefined);assert.equal(changeTableAxis(e,'column',0,1,false).w,undefined);
  assert.equal(changeTableAxis(e,'row',1,1,false).w,undefined);assert.equal(changeTableAxis(e,'row',2,1,true).h,192);
});

test('native trailing column limits reject without changing the source',()=>{
  const e=table(),before=JSON.stringify(e);assert.throws(()=>changeTableAxis(e,'column',0,2,false),/Keep at least one column/);
  assert.throws(()=>changeTableAxis({...e,cells:[Array(20).fill('')],tableStyle:undefined},'column',20,1,true),/20 columns/);
  assert.throws(()=>changeTableAxis({...e,w:20000},'column',2,1,true),/width between 1 and 20,000/);assert.equal(JSON.stringify(e),before);
});

test('draft column data, formatting and geometry apply in one atomic document revision',()=>{
  const e=table(),slide={...blankSlide(),elements:[e]},base=newDeck('Native column draft',[slide]);
  const draft=changeTableAxis(e,'column',2,1,true);draft.cells[1][2]='New 中文🙂';draft.tableStyle!.cellStyles=[...draft.tableStyle!.cellStyles!,{row:1,column:2,italic:true}];
  assert.equal(base.slides[0].elements[0].w,384);assert.equal(base.revision,0);assert.deepEqual(base.slides[0].elements[0].cells,e.cells);
  const applied=applyOperations(base,[{op:'update_element',slideId:slide.id,elementId:e.id,patch:draft}],base.revision);validateDeck(applied);
  assert.equal(applied.revision,1);assert.equal(applied.slides[0].elements[0].w,624);assert.equal(applied.slides[0].elements[0].cells?.[1][2],'New 中文🙂');close(absoluteWidths(applied.slides[0].elements[0]),[144,240,240]);
});
