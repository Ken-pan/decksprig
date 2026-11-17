import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {deflateRawSync} from 'node:zlib';
import ts from 'typescript';
import {compileModule} from 'svelte/compiler';
import {blankSlide,element,newDeck,validateDeck} from '../src/core/model';
import type {Editor as EditorType} from '../src/core/editor.svelte';
import {extractNativeDeckMotion} from '../src/core/native-deck-motion';
import {nativeDeckCodecs} from '../server/native-deck-motion';
import {nativeMotionLinkedSource,reviewNativeMotionImport,applyNativeMotionReview,inflateNativeMotionCanvas} from '../src/core/native-deck-motion-import';
import {memorySource,nativeArchive,nativeFixture} from './helpers/native-deck-motion';

// Compile the actual rune editor so import/Undo exercises the product history.
const directory=await mkdtemp(join(tmpdir(),'deck-native-motion-import-'));
const source=await readFile('src/core/editor.svelte.ts','utf8');
const javascript=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const compiled=compileModule(javascript,{generate:'client',filename:'editor.svelte.js'}).js.code
 .replace(/(from\s+|import\s*\()(['"])(\.\/[^'"]+)\2/g,(_all,prefix,quote,path)=>`${prefix}${quote}${pathToFileURL(resolve('src/core',path+'.ts')).href}${quote}`)
 .replace(/(['"])svelte\/internal\/client\1/g,()=>JSON.stringify(import.meta.resolve('svelte/internal/client')));
await writeFile(join(directory,'editor.mjs'),compiled);
const {Editor}=await import(pathToFileURL(join(directory,'editor.mjs')).href) as {Editor:new()=>EditorType};
after(()=>rm(directory,{recursive:true,force:true}));
const choice={linkedFileKey:'native-file',archiveSourceConfirmed:true};
function linked(){const s=blankSlide();s.source={provider:'Figma',nodeId:'221:12',fidelity:'converted',warnings:[]};s.elements=[element('rect',{sourceId:'237:28'})];const deck=newDeck('Native supplement',[s]);deck.provenance={provider:'Figma',url:'https://www.figma.com/slides/native-file',importedAt:'2026-10-25T00:00:00Z'};return deck;}
async function captured(){const fixture=nativeFixture();fixture.nodes[0].objectAnimations[0].actions[0].animationType='FADE';return extractNativeDeckMotion(memorySource((await nativeArchive({fixture})).archive),nativeDeckCodecs);}
function editor(){const e=new Editor();e.deck=linked();e.activeId=e.deck.slides[0].id;e.savedRevision=e.deck.revision;return e;}

test('native backup review requires explicit source choice and never claims verified archive identity',async()=>{
 const deck=linked(),capture=await captured(),before=JSON.stringify(deck);
 assert.equal(nativeMotionLinkedSource(deck)?.fileKey,'native-file');
 for(const config of [{...choice,archiveSourceConfirmed:false},{...choice,linkedFileKey:''},{...choice,linkedFileKey:'another-file'}]){const review=reviewNativeMotionImport(deck,capture,config);assert.equal(review.operations.length,0);assert(review.issues.some(i=>/Confirm/.test(i.message)));assert.equal(review.identityVerified,false);}
 const review=reviewNativeMotionImport(deck,capture,choice);assert.equal(review.operations.length,1);assert.equal(review.slides[0].matchingObjects,1);assert.equal(review.slides[0].changes,1);assert.equal(review.identityVerified,false);assert.equal(review.liveSync,false);assert.equal(JSON.stringify(deck),before);
 assert.throws(()=>reviewNativeMotionImport(deck,{...capture,archiveIdentityVerified:true} as unknown as typeof capture,choice),/invalid/);
 for(const url of ['https://figma.com.evil.test/slides/native-file','http://www.figma.com/slides/native-file','https://evil.test/slides/native-file']){deck.provenance!.url=url;assert.equal(nativeMotionLinkedSource(deck),undefined);}
});
test('preview does not count missing or ambiguous native targets as matched objects',async()=>{
 const capture=await captured(),deck=linked();deck.slides[0].elements.push(element('rect',{sourceId:'237:28'}));const ambiguous=reviewNativeMotionImport(deck,capture,choice);assert.equal(ambiguous.slides[0].matchingObjects,0);assert.equal(ambiguous.operations.length,0);
 delete capture.slides[0].cues[0].actions[0].targetId;delete deck.slides[0].elements[0].sourceId;const missing=reviewNativeMotionImport(deck,capture,choice);assert.equal(missing.slides[0].matchingObjects,0);assert.equal(missing.operations.length,0);
});
test('applying native backup uses one real editor transaction; JSON keeps cubic cues and one Undo restores source geometry and motion',async()=>{
 const e=editor(),before=structuredClone(e.deck!),review=reviewNativeMotionImport(e.deck!,await captured(),choice),originalFetch=globalThis.fetch;let saved:unknown;
 globalThis.fetch=async(_url,options)=>{saved=JSON.parse(String(options?.body));return Response.json({ok:true,revision:e.deck!.revision});};
 try{
  const result=applyNativeMotionReview(e,review,choice);assert.equal(result.revision,before.revision+1);assert.equal(e.past.length,1);assert.equal(e.deck!.slides[0].elements[0].animation?.phase,'out');
  const json=JSON.parse(JSON.stringify(e.deck)),parsed=validateDeck(json);assert.deepEqual(parsed.slides[0].elements[0].animation?.easingBezier,[0.17000000178813934,0,0.20000000298023224,1]);
  await e.flush();assert(saved);assert.equal(e.savedRevision,e.deck!.revision);const durable=validateDeck((saved as {deck:unknown}).deck);assert.deepEqual(durable.slides[0].elements[0].animation,parsed.slides[0].elements[0].animation);assert.equal((saved as {expectedRevision:number}).expectedRevision,before.revision);
  e.undo();assert.deepEqual(e.deck!.slides,before.slides);assert.deepEqual(e.deck!.provenance,before.provenance);assert.equal(e.past.length,0);assert.equal(e.future.length,1);
  e.redo();assert.equal(e.past.length,1);assert.deepEqual(e.deck!.slides,parsed.slides);
 }finally{globalThis.fetch=originalFetch;clearTimeout(e.timer);}
});
test('stale or different documents, unconfirmed source and unfinished edits cannot apply a previously reviewed native backup',async()=>{
 const capture=await captured();
 for(const condition of ['revision','document','source','confirmation','proposal','inline','crop']){
  const e=editor(),review=reviewNativeMotionImport(e.deck!,capture,choice);let config=choice;
  try{
   if(condition==='revision')e.commit([{op:'rename_deck',title:'A newer edit'}]);
   if(condition==='document')e.deck={...e.deck!,id:'another-document'};
   if(condition==='source')e.deck!.provenance!.url='https://www.figma.com/slides/another-file';
   if(condition==='confirmation')config={...choice,archiveSourceConfirmed:false};
   if(condition==='proposal')e.pending={summary:'Review first',baseRevision:0,operations:[]};
   if(condition==='inline')e.editingId=e.deck!.slides[0].elements[0].id;
   if(condition==='crop')e.croppingId=e.deck!.slides[0].elements[0].id;
   const before=JSON.stringify(e.deck),past=e.past.length;assert.throws(()=>applyNativeMotionReview(e,review,config),/changed|Confirm|Finish/);assert.equal(JSON.stringify(e.deck),before);assert.equal(e.past.length,past);
  }finally{clearTimeout(e.timer);}
 }
});
test('one unsupported native cue preserves the entire slide and the UI cannot apply an empty review',async()=>{
 const e=editor(),capture=await captured(),unknown=structuredClone(capture.slides[0].cues[0]);unknown.id='unknown-cue';unknown.index=1;unknown.clickOrder=2;unknown.actions[0].targetId='237:29';unknown.actions[0].nativeType='SLIDE_FROM_LEFT';capture.slides[0].cues.push(unknown);e.deck!.slides[0].elements.push(element('rect',{sourceId:'237:29'}));
 try{const before=JSON.stringify(e.deck),review=reviewNativeMotionImport(e.deck!,capture,choice);assert.equal(review.operations.length,0);assert.equal(review.slides[0].blocked,true);assert(review.issues.some(i=>/trajectory/.test(i.message)));assert.throws(()=>applyNativeMotionReview(e,review,choice),/No supported/);assert.equal(JSON.stringify(e.deck),before);assert.equal(e.past.length,0);}finally{clearTimeout(e.timer);}
});
test('browser decompression rejects unsupported environments explicitly and bounds output while streaming',async()=>{
 const original=globalThis.DecompressionStream;
 try{
  Object.defineProperty(globalThis,'DecompressionStream',{configurable:true,writable:true,value:undefined});await assert.rejects(()=>inflateNativeMotionCanvas(new Uint8Array([1]),10),/browser cannot read compressed/);
  // A real byte stream exceeds the caller limit; it must not be assembled unbounded.
  Object.defineProperty(globalThis,'DecompressionStream',{configurable:true,writable:true,value:class{readable:ReadableStream<Uint8Array>;writable:WritableStream<Uint8Array>;constructor(){const stream=new TransformStream<Uint8Array,Uint8Array>();this.readable=stream.readable;this.writable=stream.writable;}}});
  await assert.rejects(()=>inflateNativeMotionCanvas(new Uint8Array(128),64),/exceeds its safe size/);
 }finally{Object.defineProperty(globalThis,'DecompressionStream',{configurable:true,writable:true,value:original});}
 const data=Buffer.from('bounded native motion canvas');try{new DecompressionStream('deflate-raw');}catch{return;}
 assert.deepEqual(Buffer.from(await inflateNativeMotionCanvas(deflateRawSync(data),data.length)),data);
});
