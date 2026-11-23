import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {deflateRawSync,zstdCompressSync} from 'node:zlib';
import type {IncomingMessage} from 'node:http';
import {nativeDeckMotionCanvasRoute} from '../server/native-deck-motion-route';
import {NATIVE_DECK_LIMITS,readNativeDeckCanvas} from '../src/core/native-deck-motion';
import {nativeDeckCodecs} from '../server/native-deck-motion';
import {memorySource,nativeArchive} from './helpers/native-deck-motion';

function request(body:Uint8Array,headers:Record<string,string>={},method='POST'){const req=Readable.from([Buffer.from(body)]) as IncomingMessage;req.method=method;req.headers={'content-type':'application/octet-stream','x-native-deck-archive-bytes':'503344584',origin:'http://127.0.0.1:4310',...headers};return req;}
const status=(code:number)=>(e:unknown)=>!!e&&typeof e==='object'&&'status'in e&&e.status===code;

test('same-origin canvas-only endpoint decodes the actual extracted member without receiving native archive assets',async()=>{
 const archive=await nativeArchive({assetBytes:512*1024}),canvas=await readNativeDeckCanvas(memorySource(archive.archive),nativeDeckCodecs.deflateRaw);
 const capture=await nativeDeckMotionCanvasRoute(request(canvas,{'x-native-deck-archive-bytes':String(archive.archive.length)}),4310);
 assert.equal(capture.kind,'figma-native-deck-motion');assert.equal(capture.archiveBytes,archive.archive.length);assert.equal(capture.archiveIdentityVerified,false);assert(capture.decodedNodeCount>0);assert.equal(capture.slides[0].cues[0].actions[0].nativeType,'SLIDE_FROM_LEFT');assert(canvas.length<archive.archive.length/10);
});
test('a valid deflated canvas member may exceed its compressed archive size while each independent limit remains enforced',async()=>{
 const seed=await nativeArchive(),word=(n:number)=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;},chunks=[deflateRawSync(seed.schema,{level:0}),zstdCompressSync(seed.body)],canvas=Buffer.concat([Buffer.from('fig-deck'),word(106),...chunks.flatMap(c=>[word(c.length),c])]),packed=await nativeArchive({canvas,zipCompression:'DEFLATE'}),member=await readNativeDeckCanvas(memorySource(packed.archive),nativeDeckCodecs.deflateRaw);
 assert(member.length>packed.archive.length);const capture=await nativeDeckMotionCanvasRoute(request(member,{'x-native-deck-archive-bytes':String(packed.archive.length)}),4310);assert.equal(capture.decodedNodeCount,2);assert.equal(capture.archiveIdentityVerified,false);
});
test('native canvas route rejects foreign/plugin origins, other methods and JSON/archive body formats before decoding',async()=>{
 const canvas=new Uint8Array([1,2,3]);
 for(const origin of ['null','https://www.figma.com','https://evil.example','http://127.0.0.1:4314'])await assert.rejects(()=>nativeDeckMotionCanvasRoute(request(canvas,{origin}),4310),status(403));
 await assert.rejects(()=>nativeDeckMotionCanvasRoute(request(canvas,{},'GET'),4310),status(405));
 for(const type of ['application/json','multipart/form-data','application/zip'])await assert.rejects(()=>nativeDeckMotionCanvasRoute(request(canvas,{'content-type':type}),4310),status(415));
 const archive=await nativeArchive();await assert.rejects(()=>nativeDeckMotionCanvasRoute(request(archive.archive),4310),status(400));
});
test('canvas and archive limits reject oversized declared/chunked payloads and malformed size claims',async()=>{
 const body=new Uint8Array([1]);
 for(const size of ['','0','1','-1','1.2','503344584 extra'])await assert.rejects(()=>nativeDeckMotionCanvasRoute(request(body,{'x-native-deck-archive-bytes':size}),4310),status(400));
 await assert.rejects(()=>nativeDeckMotionCanvasRoute(request(body,{'x-native-deck-archive-bytes':String(NATIVE_DECK_LIMITS.archive+1)}),4310),status(413));
 await assert.rejects(()=>nativeDeckMotionCanvasRoute(request(body,{'content-length':String(NATIVE_DECK_LIMITS.canvas+1)}),4310),e=>status(413)(e)&&/2 MB/.test((e as Error).message));
 await assert.rejects(()=>nativeDeckMotionCanvasRoute(request(new Uint8Array(NATIVE_DECK_LIMITS.canvas+1)),4310),status(413));
 await assert.rejects(()=>nativeDeckMotionCanvasRoute(request(new Uint8Array(0)),4310),status(400));
});
