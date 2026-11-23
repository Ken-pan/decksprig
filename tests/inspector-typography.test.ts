import test from 'node:test';
import assert from 'node:assert/strict';
import {element} from '../src/core/model';
import {inspectorTypographyDisclosure,type TypographyDisclosure} from '../src/core/inspector-typography';

const initial:TypographyDisclosure={scope:'',editingId:'',open:true};
test('selection defaults collapse blank shapes and expand actual text or existing shape copy',()=>{
 for(const type of ['rect','ellipse','diamond','line'] as const){
  const empty=element(type,{text:' \n ',shapeText:{color:'#ffffff'}}),before=JSON.stringify(empty);
  assert.equal(inspectorTypographyDisclosure(initial,'empty',[empty]).open,false);
  assert.equal(inspectorTypographyDisclosure(initial,'copy',[{...empty,text:'中文 label'}]).open,true);
  assert.equal(JSON.stringify(empty),before);
 }
 assert.equal(inspectorTypographyDisclosure(initial,'empty-text',[element('text',{text:''})]).open,true);
 assert.equal(inspectorTypographyDisclosure(initial,'mixed',[element('rect'),element('rect',{text:'Existing copy'})]).open,true);
 assert.equal(inspectorTypographyDisclosure(initial,'source-image',[element('image',{text:'Uneditable reference'})]).open,false);
});

test('opening typography survives typing, clearing and remote content changes within the same selection',()=>{
 const empty=element('rect',{id:'shape',text:''}),closed=inspectorTypographyDisclosure(initial,'shape',[empty]);assert.equal(closed.open,false);
 let state={...closed,open:true};
 for(const text of ['N','New label','','Restored copy','']){state=inspectorTypographyDisclosure(state,'shape',[{...empty,text}]);assert.equal(state.open,true);}
 state=inspectorTypographyDisclosure({...state,open:false},'shape',[{...empty,text:'Changed remotely'}]);assert.equal(state.open,false,'content changes do not override an explicit disclosure choice');
});

test('a different document, slide or selected object starts from its own content rather than the previous disclosure',()=>{
 const shape=element('rect',{id:'shape',text:''}),withCopy={...shape,text:'Label'};
 let state=inspectorTypographyDisclosure(initial,'document1:slide1:shape',[shape]);state={...state,open:true};
 state=inspectorTypographyDisclosure(state,'document1:slide1:other-shape',[shape]);assert.equal(state.open,false);
 state=inspectorTypographyDisclosure(state,'document1:slide2:shape',[withCopy]);assert.equal(state.open,true);
 state=inspectorTypographyDisclosure({...state,open:false},'document2:slide2:shape',[element('text',{id:'shape',text:''})]);assert.equal(state.open,true);
});

test('starting inline editing exposes typography once without reinitializing it on draft updates or edit exit',()=>{
 const shape=element('rect',{id:'shape',text:''});let state=inspectorTypographyDisclosure(initial,'shape',[shape]);
 state=inspectorTypographyDisclosure(state,'shape',[shape],'shape');assert.equal(state.open,true);
 state=inspectorTypographyDisclosure(state,'shape',[{...shape,text:'Draft'}],'shape');assert.equal(state.open,true);
 state=inspectorTypographyDisclosure(state,'shape',[shape],'shape');assert.equal(state.open,true);
 state=inspectorTypographyDisclosure(state,'shape',[shape]);assert.equal(state.open,true);
 assert.equal(inspectorTypographyDisclosure({...state,open:false},'shape',[shape],'unselected-object').open,false);
 state=inspectorTypographyDisclosure({...state,open:false},'shape',[shape],'shape');assert.equal(state.open,true);
 assert.equal(inspectorTypographyDisclosure({...state,open:false},'shape',[shape],'shape').open,false,'a user can still close the section during the same edit');
});
