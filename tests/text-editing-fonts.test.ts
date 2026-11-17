import test from 'node:test';
import assert from 'node:assert/strict';
import {element,newDeck,blankSlide} from '../src/core/model';
import {textLayoutFingerprint} from '../src/core/native-text-render';
import {prepareTextEditingFonts} from '../src/core/text-editing-fonts';

test('native source text requires a real font rather than a successful fallback check',async t=>{
  const previousDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),previousFace=Object.getOwnPropertyDescriptor(globalThis,'FontFace');
  t.after(()=>{for(const [name,descriptor] of [['document',previousDocument],['FontFace',previousFace]] as const){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}});
  const faces:any[]=Object.assign([],{load:async()=>[]});let available=false,probes=0;
  Object.defineProperty(globalThis,'document',{configurable:true,value:{fonts:faces}});
  Object.defineProperty(globalThis,'FontFace',{configurable:true,value:class {constructor(_family:string,source:string){assert.equal(source,'local("Original special face")');probes++;}async load(){if(!available)throw Error('Missing local face');return this;}}});
  const e=element('text',{fontFamily:'Original special face',text:'Keep the source glyphs'});
  e.nativeTextLayout={fingerprint:textLayoutFingerprint(e),runs:[{text:e.text}]};
  const deck=newDeck('Font fidelity',[blankSlide()]);
  await assert.rejects(prepareTextEditingFonts(e,deck),/Original font unavailable/);
  available=true;await prepareTextEditingFonts(e,deck);assert.equal(probes,2);
  available=false;faces.push({family:'"ORIGINAL SPECIAL FACE"',status:'loaded'});
  await prepareTextEditingFonts(e,deck);assert.equal(probes,2,'loaded imported faces do not need a system-font probe');
});
