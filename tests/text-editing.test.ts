import test from 'node:test';
import assert from 'node:assert/strict';
import {element,newDeck,blankSlide} from '../src/core/model';
import {applyOperations} from '../src/core/operations';
import {editedTextStyle,mobileTextPresentation} from '../src/core/text-editing';
const styled=()=>element('text',{id:'text',text:'重点判断\n支持证据',paragraphs:[{runs:[{text:'重点判断',bold:true,color:'#b52c55',fontSize:64}],align:'left',spaceBefore:0,spaceAfter:0,indent:0,firstLineIndent:0},{runs:[{text:'支持证据',italic:true,color:'#235bbb',fontSize:36}],align:'left',spaceBefore:0,spaceAfter:0,indent:0,firstLineIndent:0,bullet:'•'}]});
test('manual and AI content edits preserve paragraph format, bullets and untouched runs',()=>{
  for(const actor of ['manual','ai'] as const){const slide=blankSlide();slide.elements=[styled()];const d=newDeck('test',[slide]);const after=applyOperations(d,[{op:'update_element',slideId:slide.id,elementId:'text',patch:{text:'重点判断修订\n支持证据'}}],d.revision,actor).slides[0].elements[0];assert.equal(after.paragraphs?.length,2);assert.equal(after.paragraphs?.[0].runs[0].color,'#b52c55');assert.equal(after.paragraphs?.[0].runs[0].fontSize,64);assert.equal(after.paragraphs?.[1].bullet,'•');assert.equal(after.paragraphs?.[1].runs[0].italic,true);assert.equal(after.paragraphs?.[1].runs[0].color,'#235bbb');assert.equal(after.paragraphs?.map(p=>p.runs.map(r=>r.text).join('')).join('\n'),after.text);}
});
test('several edits preserve distinct run styles and Unicode characters',()=>{const e=element('text',{text:'Alpha 😀 Beta',runs:[{text:'Alpha ',bold:true},{text:'😀 ',color:'#ff0000'},{text:'Beta',italic:true}]});const p=editedTextStyle(e,'ALpha 😀 Beta!');assert.equal(p.runs?.find(r=>r.text.includes('😀'))?.color,'#ff0000');assert.equal(p.runs?.at(-1)?.italic,true);assert.equal(p.runs?.map(r=>r.text).join(''),p.text);});
test('split, join and empty paragraphs keep valid content and neighboring paragraph metadata',()=>{const e=styled();for(const text of ['重点\n判断\n支持证据','重点判断支持证据','','\n支持证据','重点判断\n']){const patch=editedTextStyle(e,text);assert.equal(patch.paragraphs?.map(p=>p.runs.map(r=>r.text).join('')).join('\n'),text);}assert.equal(editedTextStyle(e,'重点判断\n支持证据\n后续证据').paragraphs?.at(-1)?.bullet,'•');});
test('ordinary edits remain bounded for long imported text',()=>{const text='证据'.repeat(15000),e=element('text',{text,runs:[{text,color:'#235bbb'}]});const result=editedTextStyle(e,text.slice(0,15000)+'修改'+text.slice(15000));assert.equal(result.runs?.map(r=>r.text).join(''),result.text);assert.ok(result.runs?.every(r=>r.color==='#235bbb'));});
test('mobile editing fits explicit rich font sizes without changing the authored typography',()=>{
  const e=element('text',{text:'Display body',fontFamily:'Gasoek One',fontSize:120,letterSpacing:-1.2,runs:[{text:'Display ',fontFamily:'Gasoek One',fontSize:120,fontWeight:400},{text:'body',fontFamily:'Gentium Plus',fontSize:60,italic:true}]});
  const before=structuredClone(e),view=mobileTextPresentation(e);
  assert.equal(view.fontFamily,'Gasoek One');assert.equal(view.fontSize,24);
  assert.equal(view.runs?.[0].fontSize,24);assert.equal(view.runs?.[1].fontSize,12);
  assert.equal(view.runs?.[1].fontFamily,'Gentium Plus');assert.equal(view.runs?.[1].italic,true);
  assert.deepEqual(e,before);
  const edited=editedTextStyle(e,'Display body!');
  assert.equal(edited.runs?.at(-1)?.fontSize,60);assert.equal(edited.runs?.at(-1)?.fontFamily,'Gentium Plus');
});
