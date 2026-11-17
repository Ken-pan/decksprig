import {test} from 'node:test';import assert from 'node:assert/strict';
import {blankSlide,newDeck,element,validateDeck} from '../src/core/model';
import {documentFile,readDocumentFile,DOCUMENT_FILE_SCHEMA} from '../src/core/document-file';
import {adoptDeckRevision,adoptDocumentFileRevision} from '../src/core/document-revision';
import {importJson} from '../src/importers/structured';
import {jsonDataBlob} from '../src/core/document-json';
const src='data:image/png;base64,'+'AQID'.repeat(20000);
function fixture(){const slide=blankSlide('Legacy title');slide.notes='Notes 中文 🐈';slide.source={provider:'PDF',render:src,fidelity:'source-render',warnings:['Source warning']};slide.elements=[element('image',{src,crop:{left:.1,top:.05,right:0,bottom:0}}),element('prototype',{prototype:{url:'https://example.com',poster:src,scaling:'contain',responsive:true,chrome:true,deviceFrame:false}})];const deck=newDeck('Original',[slide]);deck.fonts=[{family:'Original',name:'owned.woff2',data:'data:font/woff2;base64,AQID',weight:'400',style:'normal'}];deck.provenance={provider:'PPTX',filename:'original.pptx'};return deck;}

test('versioned Deck files store shared source/images/posters once and preserve canonical values',async()=>{
 const deck=fixture(),before=JSON.stringify(deck),file=documentFile(deck);assert.equal(file.schema,DOCUMENT_FILE_SCHEMA);
 const bytes=await(await jsonDataBlob(file,{space:2})).text();assert.equal(bytes.split(src).length-1,1);assert(bytes.length<before.length*.65);
 const raw=JSON.parse(bytes),rawBefore=JSON.stringify(raw);assert.deepEqual(readDocumentFile(raw),deck);assert.deepEqual(importJson(raw),deck);assert.equal(JSON.stringify(raw),rawBefore);assert.equal(JSON.stringify(deck),before);
 const revision=await adoptDocumentFileRevision(raw);
 assert.deepEqual(revision,deck);assert.equal(adoptDeckRevision(revision),revision);
 assert(Object.isFrozen(revision.slides[0].elements[0].crop));assert(!Object.isFrozen(raw.deck.slides[0].elements[0].crop));
 assert.deepEqual(importJson(JSON.parse(before)),deck);assert.deepEqual(readDocumentFile(JSON.parse(before)),deck);
});

test('small or unique files retain legacy shape; oversized sharing falls back to legacy encoding',()=>{
 const deck=newDeck('Unique',[blankSlide()]);deck.slides[0].elements=[element('image',{src})];assert.equal(documentFile(deck),deck);
 const huge='data:image/png;base64,'+'A'.repeat(1_000_000);deck.slides[0].elements=Array.from({length:260},()=>element('image',{src:huge}));assert.equal(documentFile(deck),deck);
});

test('corrupt media references cannot overwrite authored values or partially mutate input',()=>{
 const base=JSON.parse(JSON.stringify(documentFile(fixture())));
 const corruptions=[
 (f:any)=>{f.id='wrong';},(f:any)=>{f.references[0].asset=99;},(f:any)=>{f.references.push({...f.references[0]});},
 (f:any)=>{f.references[0].slide=499;},(f:any)=>{f.references[0].element=0;},(f:any)=>{f.deck.slides[0].source.render='data:image/png;base64,AA==';},
 (f:any)=>{f.assets.push(src);},(f:any)=>{f.assets[0]='https://example.com/image.png';},(f:any)=>{f.references[0].extra=true;},
 (f:any)=>{f.deck.slides[0].elements[0].id=f.deck.slides[0].elements[1].id;},(f:any)=>{f.references[1].field='__proto__';},
 ];
 for(const corrupt of corruptions){const f=structuredClone(base);corrupt(f);const before=JSON.stringify(f);assert.throws(()=>readDocumentFile(f));assert.equal(JSON.stringify(f),before);}
 const large=structuredClone(base);large.assets[0]='data:image/png;base64,'+'A'.repeat(30_000_000);const s=large.deck.slides[0];s.elements=Array.from({length:9},(_,i)=>({...s.elements[0],id:'image-'+i}));large.references=s.elements.map((_:unknown,i:number)=>({slide:0,element:i,field:'src',asset:0}));assert.throws(()=>readDocumentFile(large),/image references/);
 assert.throws(()=>importJson({schema:'deck-studio/file-2'}),/newer format/);
});

test('restored media and defaults match full canonical validation across all image fields',()=>{
 // Independent oracle: restore into plain JSON, then validate the complete deck.
 // Exercise missing defaults and reference order without sharing the reader path.
 const types=['png','jpeg','webp','gif','svg+xml'];
 for(const type of types){
  const file:any=structuredClone(documentFile(fixture()));file.assets[0]=`data:image/${type};base64,AQID`;
  delete file.deck.slides[0].elements[0].fit;delete file.deck.slides[0].elements[0].opacity;delete file.deck.slides[0].notes;
  file.references.reverse();const full=structuredClone(file.deck);
  for(const r of file.references){const slide=full.slides[r.slide],value=file.assets[r.asset];if(r.field==='render')slide.source.render=value;else if(r.field==='src')slide.elements[r.element].src=value;else slide.elements[r.element].prototype.poster=value;}
  const before=JSON.stringify(file);assert.deepEqual(readDocumentFile(file),validateDeck(full));assert.equal(JSON.stringify(file),before);
 }
});

test('metadata parsing and restored media still enforce complete document invariants',()=>{
 const base:any=structuredClone(documentFile(fixture()));
 const corruptions=[
  (f:any)=>{f.deck.slides.push({...structuredClone(f.deck.slides[0]),elements:[]});},
  (f:any)=>{f.deck.slides[0].elements[0].pageElement={kind:'number'};},
  (f:any)=>{f.deck.slides[0].elements[0].layoutItem={widthMode:'fill',heightMode:'fixed'};f.deck.slides[0].elements[0].rotation=20;},
  (f:any)=>{f.deck.slides[0].groups=[{id:f.deck.slides[0].elements[0].id,name:'Collision'}];},
  (f:any)=>{f.deck.slides[0].elements[0].group='cycle';f.deck.slides[0].groups=[{id:'cycle',name:'Cycle',parent:'cycle'}];},
  (f:any)=>{f.deck.slides[0].elements[0].prototype={url:'javascript:alert(1)'};},
  (f:any)=>{delete f.deck.slides[0].elements[1].prototype;},
  (f:any)=>{f.assets[0]='data:text/html;base64,AQID';},
 ];
 for(const change of corruptions){const file=structuredClone(base);change(file);const before=JSON.stringify(file);assert.throws(()=>readDocumentFile(file));assert.equal(JSON.stringify(file),before);}
});
