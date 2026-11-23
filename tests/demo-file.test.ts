import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadSampleFile} from '../src/core/demo-file';

test('the optional sample loads as a normal JSON File without changing a document',async()=>{
 const original=globalThis.fetch;const calls:string[]=[];const body='{"schema":"deck-studio/1","title":"Public sample fixture"}';
 globalThis.fetch=async input=>{calls.push(String(input));return new Response(body,{headers:{'Content-Type':'application/json'}});};
 try{const file=await loadSampleFile();assert.equal(file.name,'decksprig-demo.deck.json');assert.equal(file.type,'application/json');assert.equal(await file.text(),body);assert.deepEqual(calls,['/examples/decksprig-demo.deck.json']);}finally{globalThis.fetch=original;}
});
test('a pre-canceled sample does not fetch; canceling a pending read releases its request',async()=>{
 const original=globalThis.fetch;let calls=0,signal:AbortSignal|undefined,start!:()=>void;const started=new Promise<void>(resolve=>start=resolve);
 globalThis.fetch=async(_input,init)=>{calls++;signal=init!.signal!;start();return new Promise((_ok,no)=>signal!.addEventListener('abort',()=>no(signal!.reason),{once:true}));};
 try{await assert.rejects(loadSampleFile(AbortSignal.abort()),{name:'AbortError'});assert.equal(calls,0);const controller=new AbortController(),pending=loadSampleFile(controller.signal);await started;controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(signal!.aborted,true);}finally{globalThis.fetch=original;}
});
test('an unavailable sample reports an actionable failure and remains retryable',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>++calls===1?new Response('Unavailable',{status:503}):new Response('{}');
 try{await assert.rejects(loadSampleFile(),/Try the sample link again/);assert.equal((await loadSampleFile()).name,'decksprig-demo.deck.json');assert.equal(calls,2);}finally{globalThis.fetch=original;}
});
