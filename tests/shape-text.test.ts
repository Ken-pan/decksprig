import {automaticShapeTextColor} from '../src/core/shape-label-color';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {runInNewContext} from 'node:vm';
import {element, blankSlide, newDeck, validateDeck} from '../src/core/model';
import {isTextShape, canEditText, shapeTextElement, shapeTextPatch, createShapeTextRendering} from '../src/core/shape-text';
import {textRangeStylePatch} from '../src/core/text-range-format';
import {applyOperations} from '../src/core/operations';
import {buildPptx} from '../src/core/pptx-export';

test('shape labels default to centered fixed text with contrast and preserve the shape',()=>{
  for (const type of ['rect','ellipse','diamond'] as const) {
    const shape=element(type,{x:40,y:50,w:300,h:160,fill:'#17352a',text:'中心文字'}),before=JSON.stringify(shape);
    assert(canEditText(shape));
    const text=shapeTextElement(shape);
    assert.equal(text.type,'text');assert.equal(text.align,'center');assert.equal(text.verticalAlign,'middle');
    assert.equal(text.fill,'#ffffff');assert.equal(text.textSizing,'fixed');assert.equal(JSON.stringify(shape),before);
    assert.equal(shapeTextElement({...shape,fill:'#f0f0f0'}).fill,'#171c19');
  }
  assert(!isTextShape(element('image')));assert(!isTextShape(element('rect',{designPattern:true})));
  assert(!canEditText(element('image')));
});

test('editing and formatting a shape label persists atomically without altering shape fill or geometry',()=>{
  const shape=element('rect',{shape:'hexagon',fill:'#234567',x:42,y:64,w:300,h:150}),slide=blankSlide();slide.elements=[shape];
  const deck=newDeck('Shape labels',[slide]);const text={...shapeTextElement(shape),text:'Design\nBuild',fontSize:28};
  const patch=shapeTextPatch(shape,text);
  const edited=applyOperations(deck,[{op:'update_element',slideId:slide.id,elementId:shape.id,patch}],deck.revision);
  const saved=validateDeck(JSON.parse(JSON.stringify(edited))).slides[0].elements[0];
  assert.equal(saved.text,text.text);assert.equal(saved.type,'rect');assert.equal(saved.shape,'hexagon');assert.equal(saved.fill,shape.fill);
  for(const key of ['x','y','w','h'] as const)assert.equal(saved[key],shape[key]);
  const rendered=shapeTextElement(saved),formatted={...rendered,...textRangeStylePatch(rendered,{fill:'#ff0000',fontWeight:700},{start:0,end:6})};
  const result=applyOperations(edited,[{op:'update_element',slideId:slide.id,elementId:shape.id,patch:shapeTextPatch(saved,formatted)}],edited.revision).slides[0].elements[0];
  assert.equal(result.fill,shape.fill);assert.equal(result.runs?.[0].color,'#ff0000');assert.equal(result.runs?.[0].fontWeight,700);
  const whole=shapeTextPatch(saved,{...rendered,fill:'#eeeeee',align:'right',verticalAlign:'bottom',lineHeight:1.6,letterSpacing:2});
  assert.equal(whole.lineHeight,1.6);assert.equal(whole.letterSpacing,2);
  assert.deepEqual(whole.shapeText,{color:'#eeeeee',align:'right',verticalAlign:'bottom'});
  assert.throws(()=>applyOperations(edited,[{op:'update_element',slideId:slide.id,elementId:shape.id,patch:{shapeText:{color:'invalid'}}}],edited.revision));
});

test('standalone HTML label rendering factory matches the editor without application imports',()=>{
  const factory=runInNewContext(`(${createShapeTextRendering.toString()})`,{__name:(fn:Function)=>fn})(undefined,automaticShapeTextColor);
  const shape=element('ellipse',{text:'Hello',shapeText:{color:'#123456',align:'left'}});
  assert.equal(JSON.stringify(factory.shapeTextElement(shape)),JSON.stringify(shapeTextElement(shape)));
});

test('PowerPoint retains the label as centered native text inside the original shape',async()=>{
  const shape=element('rect',{shape:'hexagon',fill:'#234567',text:'中心文字',shapeText:{color:'#ff6600'},w:300,h:160}),slide=blankSlide();slide.elements=[shape];
  const zip=await JSZip.loadAsync(await buildPptx(newDeck('Shape labels',[slide])));
  const xml=await zip.file('ppt/slides/slide1.xml')!.async('string');
  assert.match(xml,/中心文字/);assert.match(xml,/anchor="ctr"/);assert.match(xml,/algn="ctr"/);assert.match(xml,/srgbClr val="ff6600"/i);
  assert.match(xml,/srgbClr val="234567"/i);assert.match(xml,/<a:custGeom>/);
  assert.equal((xml.match(/<p:sp>/g)??[]).length,1);
});
