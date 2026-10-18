import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankSlide,element,newDeck} from '../src/core/model';
import {findFont} from '../src/core/fonts';
import {fontSelectionOperations,documentFontSelectionOperations} from '../src/core/font-selection';
import {applyOperations} from '../src/core/operations';

test('library font selection loads shape and connector labels and preserves locked/source objects',async()=>{
  const slide=blankSlide(),labels=(['rect','ellipse','diamond','line'] as const).map(type=>element(type,{text:'Shape label',fontFamily:'Manrope',fontSize:32,runs:[{text:'Shape label',italic:true,color:'#123456'}]}));
  const locked=element('ellipse',{text:'Locked',locked:true}),source=element('rect',{text:'Source',sourceRegion:{left:0,top:0,right:.5,bottom:.5}});
  slide.elements=[...labels,locked,source];const deck=newDeck('Font selection',[slide]),before=structuredClone(deck),loads:string[]=[];
  const original=globalThis.document;globalThis.document={fonts:{load:async(_:string,text:string)=>{loads.push(text);return [];}}} as unknown as Document;
  try{
    const ops=await fontSelectionOperations(deck,slide.id,slide.elements.map(e=>e.id),findFont('Bodoni Moda')!);
    assert.deepEqual(ops.filter(o=>o.op==='update_element').map(o=>o.elementId),labels.map(e=>e.id));
    assert.ok(loads.includes('Shape label'));const result=applyOperations(deck,ops);
    for(const e of result.slides[0].elements.slice(0,4)){assert.equal(e.fontFamily,'Bodoni Moda');assert.equal(e.fontSize,32);assert.equal(e.runs![0].italic,true);assert.equal(e.runs![0].color,'#123456');}
    assert.deepEqual(result.slides[0].elements.slice(4),[locked,source]);assert.deepEqual(deck,before);
  }finally{globalThis.document=original;}
});

test('document font selection applies a linked family to a shape without replacing its content or geometry',async()=>{
  const slide=blankSlide(),label=element('ellipse',{text:'Chinese 标签',x:120,y:160,w:300,h:100,fontFamily:'Manrope',fontSize:43});slide.elements=[label];
  const deck=newDeck('Document font',[slide]),original=globalThis.document;globalThis.document={fonts:{load:async()=>[]}} as unknown as Document;
  try{
    const ops=await documentFontSelectionOperations(deck,slide.id,[label.id],findFont('Bodoni Moda')!);
    const after=applyOperations(deck,ops).slides[0].elements[0];
    assert.equal(after.fontFamily,'Bodoni Moda');assert.equal(after.design?.font,'heading');
    assert.deepEqual([after.text,after.x,after.y,after.w,after.h,after.fontSize],[label.text,label.x,label.y,label.w,label.h,label.fontSize]);
  }finally{globalThis.document=original;}
});
