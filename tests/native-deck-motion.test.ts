import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import JSZip from 'jszip';
import {extractNativeDeckMotion,nativeDeckBlobSource,readNativeDeckCanvas,NATIVE_DECK_LIMITS} from '../src/core/native-deck-motion';
import {nativeDeckCodecs,readNativeDeckMotionCanvas,readNativeDeckMotionFile} from '../server/native-deck-motion';
import {nativeArchive,nativeFixture,memorySource} from './helpers/native-deck-motion';

const capture=async(bytes:Uint8Array)=>extractNativeDeckMotion(memorySource(bytes),nativeDeckCodecs);
test('actual saved-native wire contract recovers object identity, phase, exact cubic and 600ms duration',async()=>{
 const {archive}=await nativeArchive(),result=await capture(archive),cue=result.slides[0].cues[0],a=cue.actions[0];
 assert.equal(result.kind,'figma-native-deck-motion');assert.equal(result.archiveIdentityVerified,false);assert.equal(result.decodedNodeCount,2);assert.equal(result.slides[0].id,'221:12');assert.equal(cue.id,'249:29');assert.equal(cue.trigger,'ON_CLICK');assert.equal(cue.clickOrder,1);assert.equal(cue.stateManagementVersion,1);
 assert.deepEqual(cue.eventFields,['interactionType']);assert.equal(a.targetId,'237:28');assert.equal(a.targetType,'TABLE');assert.equal(a.withinSlide,true);assert.equal(a.phase,'OUT');assert.equal(a.nativeType,'SLIDE_FROM_LEFT');assert.equal(a.durationSeconds,0.6000000238418579);assert.equal(a.durationMs,600);assert.deepEqual(a.easingCubic,[0.17000000178813934,0,0.20000000298023224,1]);assert.deepEqual(result.issues,[]);
});
test('random-access extraction never reads large image members and captures no node names',async()=>{
 const f=nativeFixture();f.nodes[1].name='PRIVATE SENTINEL';const {archive}=await nativeArchive({fixture:f,assetBytes:200000}),source=memorySource(archive),result=await extractNativeDeckMotion(source,nativeDeckCodecs);
 assert(!JSON.stringify(result).includes('PRIVATE SENTINEL'));assert(source.reads.reduce((n,r)=>n+r.length,0)<100000);assert(source.reads.every(r=>r.length<70000));
});
test('stored and compressed canvas members have identical verified capture',async()=>{
 const a=await nativeArchive(),b=await nativeArchive({zipCompression:'DEFLATE'}),one=await capture(a.archive),two=await capture(b.archive);assert.deepEqual(two.slides,one.slides);assert.equal(two.canvasCrc32,one.canvasCrc32);
});
test('deleted cues are skipped and unknown enums, out-of-slide targets remain explicit',async()=>{
 const f=nativeFixture();const old=structuredClone(f.nodes[0].objectAnimations[0]);old.isDeleted=true;f.nodes[0].objectAnimations.unshift(old);const active=f.nodes[0].objectAnimations[1];active.event.interactionType=999;delete f.nodes[1].parentIndex;const result=await capture((await nativeArchive({fixture:f})).archive),cue=result.slides[0].cues[0];
 assert.equal(cue.index,1);assert.equal(cue.trigger,'UNKNOWN_ENUM_999');assert.equal(cue.clickOrder,undefined);assert.equal(cue.actions[0].withinSlide,false);
});
test('missing actions are reported instead of inventing an empty or successful cue',async()=>{
 const f=nativeFixture();delete f.nodes[0].objectAnimations[0].actions;const result=await capture((await nativeArchive({fixture:f})).archive);assert.equal(result.slides[0].cues.length,0);assert.match(result.issues[0].message,/unreadable/);
});
test('unsupported native versions and changed schema contracts fail without guessing',async()=>{
 for(const version of [100,102,105,107])await assert.rejects(capture((await nativeArchive({version})).archive),/version106/);
 const f=nativeFixture();f.definitions.find(d=>d.name==='NodeChange')!.fields.find(f=>f.name==='objectAnimations')!.value=427;
 for(const version of [101,106])await assert.rejects(capture((await nativeArchive({fixture:f,version})).archive),/objectAnimations contract/);
});
test('actual native101 Fade snapshot retains source identity, exact cubic and click timing through the production transport',async()=>{
 const bytes=await readFile(new URL('./fixtures/native-deck-fade-101.canvas.bin',import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'5f11793f8ca2fc5dc7df20cbd2c5f085d7881eccf3bb0d9e93b3abe9c61f2afd');
 const result=await readNativeDeckMotionCanvas(bytes,34685),cue=result.slides[0].cues[0],a=cue.actions[0];
 assert.equal(result.formatVersion,101);assert.equal(result.schemaDefinitions,666);assert.equal(result.archiveIdentityVerified,false);assert.deepEqual(result.issues,[]);
 assert.equal(result.slides[0].id,'2:2');assert.equal(cue.id,'3:2');assert.equal(cue.trigger,'ON_CLICK');assert.equal(cue.clickOrder,1);
 assert.equal(a.targetId,'2:4');assert.equal(a.targetType,'ROUNDED_RECTANGLE');assert.equal(a.withinSlide,true);assert.equal(a.connectionType,'OBJECT_ANIMATION');assert.equal(a.phase,'IN');assert.equal(a.nativeType,'FADE');assert.equal(a.durationMs,600);assert.equal(a.durationSeconds,0.6000000238418579);assert.equal(a.easingType,'CUSTOM_CUBIC');assert.deepEqual(a.easingCubic,[0.17000000178813934,0,0.20000000298023224,1]);
 const malformed=bytes.slice(),bodyOffset=20+new DataView(bytes.buffer,bytes.byteOffset,bytes.length).getUint32(12,true);malformed[bodyOffset]=0;
 await assert.rejects(readNativeDeckMotionCanvas(malformed,34685),/body compression/);
 await assert.rejects(readNativeDeckMotionCanvas(Buffer.concat([bytes,Buffer.from([0])]),34686),/chunk layout/);
});
test('ZIP integrity, encryption and duplicate canvas identities are rejected',async()=>{
 const {archive}=await nativeArchive();const corrupt=archive.slice();corrupt[40]^=1;await assert.rejects(capture(corrupt),/integrity/);
 const encrypted=archive.slice();const view=new DataView(encrypted.buffer);view.setUint16(6,1,true);for(let p=0;p<encrypted.length-46;p++)if(view.getUint32(p,true)===0x02014b50){view.setUint16(p+8,1,true);break;}await assert.rejects(capture(encrypted),/encoding/);
 const truncated=archive.slice(0,-1);await assert.rejects(capture(truncated),/directory/);
 const zip=new JSZip(),{canvas}=await nativeArchive();zip.file('canvas.fig',canvas);zip.file('canvas.fog',canvas);const duplicate=await zip.generateAsync({type:'nodebuffer'});for(let p=0;p<duplicate.length-10;p++)if(duplicate.subarray(p,p+10).toString()==='canvas.fog')duplicate[p+8]='i'.charCodeAt(0);await assert.rejects(capture(duplicate),/duplicate canvas/);
});
test('decoder enforces source, decompression and recursive work bounds',async()=>{
 await assert.rejects(extractNativeDeckMotion({size:NATIVE_DECK_LIMITS.archive+1,read:async()=>new Uint8Array()},nativeDeckCodecs),/archive size/);
 const {archive}=await nativeArchive();await assert.rejects(extractNativeDeckMotion(memorySource(archive),{...nativeDeckCodecs,zstd:async()=>new Uint8Array(NATIVE_DECK_LIMITS.body+1)}),/body exceeds/);
 await assert.rejects(extractNativeDeckMotion({...memorySource(archive),read:async()=>new Uint8Array()},nativeDeckCodecs),/incomplete ZIP read/);
 const f=nativeFixture();f.definitions.push({name:'Deep',kind:'MESSAGE',fields:[{name:'next',type:'Deep',isArray:false,value:1}]});f.definitions.find(d=>d.name==='Message')!.fields.push({name:'deep',type:'Deep',isArray:false,value:999});
 const body=Uint8Array.from([0xe7,7,...new Array(140).fill(1),...new Array(141).fill(0)]);await assert.rejects(capture((await nativeArchive({fixture:f,body})).archive),/work limit/);
});
test('Blob and filesystem adapters run the same production parser without a new endpoint',async()=>{
 const {archive}=await nativeArchive(),blob=new Blob([archive as Uint8Array<ArrayBuffer>]),one=await extractNativeDeckMotion(nativeDeckBlobSource(blob),nativeDeckCodecs),dir=await mkdtemp(join(tmpdir(),'deck-motion-'));
 try{const path=join(dir,'own.deck');await writeFile(path,archive);assert.deepEqual(await readNativeDeckMotionFile(path),one);await assert.rejects(readNativeDeckMotionFile(dir),/regular/);}finally{await rm(dir,{recursive:true,force:true});}
});
test('repeated native targets share ancestry work and distinct deep chains have a global budget',async()=>{
 function chain(count:number,repeated:boolean){const f=nativeFixture(),action=f.nodes[0].objectAnimations[0].actions[0];f.nodes.splice(1);for(let i=1;i<=count;i++)f.nodes.push({guid:{sessionID:400,localID:i},parentIndex:{guid:i===1?{sessionID:221,localID:12}:{sessionID:400,localID:i-1},position:'a'},type:'GROUP'});f.nodes[0].objectAnimations[0].actions=Array.from({length:count},(_,i)=>({...action,transitionNodeID:{sessionID:400,localID:repeated?count:i+1}}));return f;}
 const repeated=await capture((await nativeArchive({fixture:chain(3000,true)})).archive);assert.equal(repeated.slides[0].cues[0].actions.length,3000);assert(repeated.slides[0].cues[0].actions.every(a=>a.withinSlide));
 await assert.rejects(capture((await nativeArchive({fixture:chain(1500,false)})).archive),/ancestry work limit/);
});
test('canvas-only transport revalidates the same native capture without reading or posting archive assets',async()=>{
 const {archive,canvas}=await nativeArchive({assetBytes:200000}),source=memorySource(archive);let deflateCalls=0;
 const member=await readNativeDeckCanvas(source,async(bytes,limit)=>{deflateCalls++;return nativeDeckCodecs.deflateRaw(bytes,limit);});assert.equal(deflateCalls,0);assert.deepEqual(Buffer.from(member),Buffer.from(canvas));assert(member.length<=NATIVE_DECK_LIMITS.canvas);assert(source.reads.reduce((n,r)=>n+r.length,0)<100000);
 const remote=await readNativeDeckMotionCanvas(member,archive.length);assert.deepEqual(remote,await capture(archive));assert.equal(remote.archiveIdentityVerified,false);
 await assert.rejects(readNativeDeckMotionCanvas(new Uint8Array(NATIVE_DECK_LIMITS.canvas+1),archive.length),/canvas.fig exceeds/);await assert.rejects(readNativeDeckMotionCanvas(member,NaN),/archive size/);await assert.rejects(readNativeDeckMotionCanvas(member,NATIVE_DECK_LIMITS.archive+1),/archive size/);
 const bad=member.slice();bad[8]=107;await assert.rejects(readNativeDeckMotionCanvas(bad,archive.length),/version106/);await assert.rejects(readNativeDeckCanvas(memorySource((await nativeArchive({version:107})).archive),nativeDeckCodecs.deflateRaw),/version106/);
});
