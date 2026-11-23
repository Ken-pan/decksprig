import { test } from 'node:test';
import assert from 'node:assert/strict';
import { element, blankSlide, newDeck } from '../src/core/model';
import { textProperties, textPropertyState, textToggleState, textSelectionState } from '../src/core/text-properties';
import { textStylePatch } from '../src/core/fonts';
import { applyOperations } from '../src/core/operations';

test('inspector reads rendered paragraph overrides rather than unused object or run styles', () => {
  const e = element('text', {text:'Imported', italic:false, fontSize:32, runs:[{text:'Unused',italic:false}], paragraphs:[{align:'right',spaceBefore:0,spaceAfter:0,indent:0,firstLineIndent:0,runs:[{text:'Imported',italic:true,fontFamily:'Bodoni Moda',fontSize:42,fontWeight:800,color:'#aabbcc'}]}]});
  assert.equal(textToggleState([e],'italic'),true);
  assert.equal(textToggleState([e],'bold'),true);
  for (const [key,value] of [['fontSize',42],['fontFamily','Bodoni Moda'],['fontWeight',800],['fill','#aabbcc'],['align','right']] as const) assert.deepEqual(textPropertyState([e],key),{value,mixed:false});
});
test('mixed toggles describe all visible runs and ignore empty or locked runs', () => {
  const e=element('text',{runs:[{text:'Strong',bold:true,italic:true,underline:true},{text:'Plain',bold:false,italic:false,underline:false},{text:'',fontSize:90}]}),locked=element('text',{locked:true,italic:true});
  for (const key of ['bold','italic','underline'] as const) assert.equal(textToggleState([e,locked],key),'mixed');
  assert.equal(textPropertyState([e],'fontSize').mixed,false);
  assert.equal(textToggleState([element('text',{italic:false}),locked],'italic'),false);
});
test('different bold weights share an enabled toggle but retain mixed numeric weights', () => {
  const es=[element('text',{fontWeight:600}),element('text',{fontWeight:900})];
  assert.equal(textToggleState(es,'bold'),true);
  assert.equal(textPropertyState(es,'fontWeight').mixed,true);
});
test('fixed paragraph leading is reflected as a ratio of its rendered largest text size', () => {
  const e=element('text',{fontSize:20,paragraphs:[{align:'left',spaceBefore:0,spaceAfter:0,indent:0,firstLineIndent:0,lineSpacing:60,runs:[{text:'Lead',fontSize:40},{text:' body',fontSize:20}]}]});
  assert.deepEqual(textPropertyState([e],'lineHeight'),{value:1.5,mixed:false});
});
test('applying a mixed toggle unifies only that style while preserving distinct content and other formatting', () => {
  const s=blankSlide();s.elements=[element('text',{id:'one',text:'One',runs:[{text:'One',italic:true,color:'#aa2233'}]}),element('text',{id:'two',text:'Two',runs:[{text:'Two',italic:false,bold:true}]})];
  const deck=newDeck('Mixed',[s]);assert.equal(textToggleState(s.elements,'italic'),'mixed');
  const next=applyOperations(deck,s.elements.map(e=>({op:'update_element',slideId:s.id,elementId:e.id,patch:textStylePatch(e,{italic:true})})));
  assert.equal(textToggleState(next.slides[0].elements,'italic'),true);
  assert.deepEqual(next.slides[0].elements.map(e=>e.text),['One','Two']);
  assert.equal(next.slides[0].elements[0].runs![0].color,'#aa2233');assert.equal(next.slides[0].elements[1].runs![0].bold,true);
  assert.equal(next.revision,deck.revision+1);assert.equal(textToggleState(s.elements,'italic'),'mixed');
});

 test('locked-only inspection reads original styles while mixed editable selections ignore locked differences', () => {
  const locked=element('text',{locked:true,runs:[{text:'Read only',italic:true,fontFamily:'Bodoni Moda'}]}),editable=element('text',{italic:false,fontFamily:'Manrope'});
  assert.equal(textToggleState([locked],'italic'),true);assert.deepEqual(textPropertyState([locked],'fontFamily'),{value:'Bodoni Moda',mixed:false});
  assert.equal(textToggleState([editable,locked],'italic'),false);assert.deepEqual(textPropertyState([editable,locked],'fontFamily'),{value:'Manrope',mixed:false});
});

test('one-pass inspection matches the existing property and toggle contracts across inherited, empty and locked text',()=>{
  const paragraph=(runs:any[],extra={})=>({align:'right' as const,spaceBefore:0,spaceAfter:0,indent:0,firstLineIndent:0,runs,...extra});
  const cases=[[],[element('rect')],[element('text',{text:''})],[element('text',{fontFamily:'Inter',fontSize:40,paragraphs:[paragraph([{text:'A',fontFamily:'inter',fontWeight:600,fontSize:20},{text:'B',fontFamily:' INTER ',fontWeight:900,fontSize:30}],{lineSpacing:60}),paragraph([{text:'',italic:true}],{lineHeight:1.4})]})],
    [element('text',{locked:true,italic:true}),element('text',{italic:false,runs:[{text:'A',color:'#4f63e780'},{text:'B',fontWeight:900,bold:false,underline:true,strikethrough:true}]})],
    [element('text',{locked:true,paragraphs:[paragraph([{text:'',fontSize:90}])]}),element('text',{locked:true,italic:true})]];
  for(const elements of cases){const result=textSelectionState(elements);for(const key of textProperties)assert.deepEqual(result.properties[key],textPropertyState(elements,key),key);for(const key of ['bold','italic','underline','strikethrough']as const)assert.equal(result[key],textToggleState(elements,key),key);}
});

test('batch inspector state follows mutable callers and does not alter their styles',()=>{
  const e=element('text',{text:'AB',paragraphs:[{align:'left',spaceBefore:0,spaceAfter:0,indent:0,firstLineIndent:0,lineSpacing:50,runs:[{text:'A',fontSize:20,fontWeight:600},{text:'B',fontSize:25,fontWeight:900}]}]}),before=JSON.stringify(e),first=textSelectionState([e]);
  assert.equal(first.bold,true);assert.equal(first.properties.fontWeight.mixed,true);assert.deepEqual(first.properties.lineHeight,{value:2,mixed:false});assert.equal(JSON.stringify(e),before);
  e.paragraphs![0].runs[1].fontSize=50;e.paragraphs![0].runs[1].fontWeight=400;
  const changed=textSelectionState([e]);assert.equal(changed.bold,'mixed');assert.equal(changed.properties.lineHeight.value,1);assert.equal(first.properties.lineHeight.value,2);
});
