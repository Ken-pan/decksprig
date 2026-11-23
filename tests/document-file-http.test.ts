import {test} from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {once} from 'node:events';
import {sendDocumentJson} from '../server/document-json-response';import {jsonRequest} from '../src/core/json-request';import {blankSlide,newDeck,element} from '../src/core/model';import {DOCUMENT_FILE_SCHEMA,readDocumentFile} from '../src/core/document-file';

test('HTTP media transport is opt-in, accepts old responses and restores compact saves without changing revisions',async()=>{
 const slide=blankSlide();slide.elements=Array.from({length:6},()=>element('image',{src:'data:image/png;base64,'+'A'.repeat(100000)}));const deck=newDeck('Shared',[slide]);
 const server=createServer((req,res)=>void sendDocumentJson(res,deck));server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`,legacy=await fetch(url),legacyText=await legacy.text();assert.deepEqual(JSON.parse(legacyText),deck);assert.match(legacy.headers.get('content-type')!,/^application\/json/);assert.equal(legacy.headers.get('vary'),'Accept');
  const declined=await fetch(url,{headers:{Accept:'application/vnd.deck-studio+json;q=0, application/json'}});assert.deepEqual(await declined.json(),deck);
  let bytes=0;const received=await jsonRequest(url,'GET',undefined,async(...args)=>{const r=await fetch(...args);bytes=Number((await r.clone().text()).length);return r;});assert.deepEqual(received,deck);assert(bytes<legacyText.length/3);
  let body:any;await jsonRequest('/api/decks/'+deck.id,'PUT',{deck,expectedRevision:0},async(_url,options)=>{body=JSON.parse(String(options?.body));return new Response(JSON.stringify(deck));},{compact:true});assert.equal(body.deck.schema,DOCUMENT_FILE_SCHEMA);assert.equal(body.deck.id,deck.id);assert.equal(body.expectedRevision,0);assert.deepEqual(readDocumentFile(body.deck),deck);
  const oldServer=await jsonRequest('/old','GET',undefined,async()=>new Response(JSON.stringify(deck)));assert.deepEqual(oldServer,deck);
  await assert.rejects(jsonRequest('/bad','GET',undefined,async()=>new Response(JSON.stringify({schema:DOCUMENT_FILE_SCHEMA,id:deck.id,assets:[],references:[],deck}))),/./);
 }finally{server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));}
});
