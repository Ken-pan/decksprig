import {test} from 'node:test';import assert from 'node:assert/strict';
import {prepareFile} from '../plugins/figma-export/pptx';import {blankSlide,newDeck,element} from '../src/core/model';import {documentFile} from '../src/core/document-file';

test('offline Figma file intake restores compact Deck media and preserves existing handoff files',async()=>{
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="red"/>'+ ' '.repeat(60000)+'</svg>',src='data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64'),slide=blankSlide();slide.elements=[element('image',{src}),element('image',{src})];const deck=newDeck('Native handoff',[slide]),file=documentFile(deck),before=JSON.stringify(file),result=await prepareFile(file);
 assert.deepEqual(result.deck,deck);assert.equal(result.assets[slide.elements[0].id].svg,svg);assert.equal(result.assets[slide.elements[1].id].svg,svg);assert.equal(JSON.stringify(file),before);
 const handoff={kind:'deck-studio-figma/1',deck,assets:{[slide.elements[0].id]:{svg:'Original native asset'}}};const legacy=await prepareFile(handoff);assert.equal(legacy.deck,deck);assert.equal(legacy.assets,handoff.assets);
 const plain=await prepareFile(deck);assert.deepEqual(plain.deck,deck);assert.equal(plain.assets[slide.elements[0].id].svg,svg);
});

test('the plugin can reopen its own native Figma Deck export as editable content',async()=>{
 const bundle={kind:'figma-rest',title:'Native handoff',slides:[{id:'native-slide',type:'SLIDE',name:'QA',width:1920,height:1080,fills:[],children:[{id:'native-shape',type:'RECTANGLE',name:'Editable shape',absoluteBoundingBox:{x:120,y:300,width:640,height:360},fills:[{type:'SOLID',color:{r:.05,g:.4,b:.28}}]}]}]};
 const before=JSON.stringify(bundle),result=await prepareFile(bundle),shape=result.deck.slides[0].elements[0];
 assert.equal(shape.type,'rect');assert.equal(shape.name,'Editable shape');assert.equal(shape.fill,'#0d6647');assert.equal(shape.x,120);assert.equal(JSON.stringify(bundle),before);
});

test('invalid Deck files return a short recovery message without schema internals',async()=>{
 await assert.rejects(()=>prepareFile({slides:[{}]}),error=>error instanceof Error&&error.message==='This file could not be opened. Choose a Deck file exported by Decksprig.');
});
