import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {sendDocumentJson} from '../server/document-json-response';
import {blankSlide,element,newDeck} from '../src/core/model';
import {readDocumentFile} from '../src/core/document-file';
import {readDocumentFrameBody} from '../src/core/document-frame-reader';
import {DOCUMENT_FRAME_ACCEPT,DOCUMENT_FRAME_TYPE} from '../src/core/document-frame-format.mjs';
import {isStoredDocument,prepareStoredDocument} from '../src/core/document-storage';
import {encodeDocumentAsset,prepareStoredDocumentFrames} from '../server/document-frame-response';

const encode=(bytes:Uint8Array)=>Buffer.from(bytes).toString('base64');
const decode=(bytes:Uint8Array)=>readDocumentFrameBody(new Response(bytes as Uint8Array<ArrayBuffer>).body!,encode);

test('opt-in large document frames preserve exact binary and unusual source strings',async()=>{
  const slide=blankSlide();
  const png='data:image/png;base64,'+Buffer.alloc(900_002,26).toString('base64');
  const unusual='data:image/png;base64,'+'A'.repeat(70_000)+' \n'+String.fromCharCode(0xd800);
  const parameter='data:image/svg+xml;charset=utf-8;base64,'+'ABCD'.repeat(17000);
  slide.source={provider:'PDF',render:png,warnings:[],fidelity:'source-render'};
  slide.elements=[element('image',{src:png}),element('image',{src:unusual}),element('image',{src:parameter})];
  const deck=newDeck('Wire frames',[slide]);
  const small=newDeck('Blank',[blankSlide()]);
  const server=createServer((req,res)=>void sendDocumentJson(res,req.url==='/small'?small:deck));
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  try{
    const address=server.address() as {port:number}, url=`http://127.0.0.1:${address.port}`;
    const framed=await fetch(url,{headers:{Accept:DOCUMENT_FRAME_ACCEPT}});
    assert.equal(framed.headers.get('Content-Type'),DOCUMENT_FRAME_TYPE);
    assert.equal(framed.headers.get('Vary'),'Accept');
    const bytes=Buffer.from(await framed.arrayBuffer());
    assert.deepEqual(readDocumentFile(await decode(bytes)),deck);
    const chunks=[bytes.subarray(0,2),bytes.subarray(2,13),bytes.subarray(13)];
    const fragmented=new ReadableStream<Uint8Array>({start(controller){
      for(const chunk of chunks)controller.enqueue(chunk);
      controller.close();
    }});
    assert.deepEqual(readDocumentFile(await readDocumentFrameBody(fragmented,encode)),deck);
    await assert.rejects(decode(bytes.subarray(0,-1)),/incomplete or invalid/);
    await assert.rejects(decode(Buffer.concat([bytes,Buffer.from([0])])),/incomplete or invalid/);
    const unknown=Buffer.from(bytes);
    unknown[4+unknown.readUInt32BE()]=255;
    await assert.rejects(decode(unknown),/incomplete or invalid/);
    await assert.rejects(decode(Buffer.from([255,255,255,255])),/incomplete or invalid/);
    const text=await fetch(url,{headers:{Accept:DOCUMENT_FRAME_TYPE+';q=0, application/vnd.deck-studio+json'}});
    const old=await text.text();
    assert.match(text.headers.get('Content-Type')!,/application\/vnd\.deck-studio\+json/);
    assert.deepEqual(readDocumentFile(JSON.parse(old)),deck);
    assert(bytes.length<Buffer.byteLength(old)*.85);
    assert.deepEqual(await (await fetch(url)).json(),deck);
    const smallReply=await fetch(url+'/small',{headers:{Accept:DOCUMENT_FRAME_ACCEPT}});
    assert.notEqual(smallReply.headers.get('Content-Type'),DOCUMENT_FRAME_TYPE);
    assert.deepEqual(await smallReply.json(),small);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});

test('compact frame iteration emits the manifest before reading images and stops on close',async()=>{
  const slide=blankSlide();
  slide.elements=['AAAA','BBBB','CCCC'].map(value=>element('image',{src:'data:image/png;base64,'+value.repeat(400)}));
  const deck=newDeck('Stored stream',[slide]),{record,media}=await prepareStoredDocument(deck);
  assert(isStoredDocument(record));
  const requested:string[]=[];
  const frames=prepareStoredDocumentFrames(record,async id=>{
    requested.push(id);
    return encodeDocumentAsset(media.get(id)!);
  });
  assert(frames);
  const length = (await frames.next()).value as Buffer;
  const manifest = (await frames.next()).value as Buffer;
  assert.equal(length.readUInt32BE(),manifest.length);
  assert.equal(JSON.parse(manifest.toString()).count,3);
  assert.deepEqual(requested,[]);
  await frames.next();
  await frames.return(undefined);
  assert.deepEqual(requested,record.assets.slice(0,2));
  assert((await frames.next()).done);
});
