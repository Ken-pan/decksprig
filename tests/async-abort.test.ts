import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SharedRequest,abortable} from '../src/core/async-abort';
import {embeddedLibraryFonts} from '../src/core/fonts';
import {blankSlide,element,newDeck} from '../src/core/model';
const deferred=<T>()=>{let resolve!:(v:T)=>void,reject!:(e:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('resource failure is retryable while a successful index is shared and reused',async()=>{
 let attempts=0;const load=new SharedRequest(async()=>{if(++attempts===1)throw new Error('503');return 7;});
 await assert.rejects(load.get(),/503/);assert.deepEqual(await Promise.all([load.get(),load.get()]),[7,7]);assert.equal(await load.get(),7);assert.equal(attempts,2);
});
test('one canceled subscriber cannot cancel another subscriber of the same index',async()=>{
 const reply=deferred<number>();let calls=0,network!:AbortSignal;
 const load=new SharedRequest(signal=>{calls++;network=signal;return reply.promise;});
 const controller=new AbortController(),a=load.get(controller.signal),b=load.get();await Promise.resolve();
 controller.abort();await assert.rejects(a,{name:'AbortError'});assert.equal(network.aborted,false);reply.resolve(3);assert.equal(await b,3);assert.equal(calls,1);
});
test('all subscribers leaving aborts the old request; its late failure cannot clear a new retry',async()=>{
 const replies=[deferred<number>(),deferred<number>()],signals:AbortSignal[]=[];let calls=0;
 const load=new SharedRequest(signal=>{signals.push(signal);return replies[calls++].promise;});
 const controller=new AbortController(),old=load.get(controller.signal);await Promise.resolve();controller.abort();await assert.rejects(old,{name:'AbortError'});assert.equal(signals[0].aborted,true);
 const retry=load.get();await Promise.resolve();replies[0].reject(new Error('late old failure'));await Promise.resolve();await Promise.resolve();const also=load.get();replies[1].resolve(9);
 assert.deepEqual(await Promise.all([retry,also]),[9,9]);assert.equal(calls,2);
});
test('pre-canceled subscribers never start loading and binary results can be released after sharing',async()=>{
 let calls=0;const load=new SharedRequest(async()=>++calls,false);assert.throws(()=>load.get(AbortSignal.abort()),{name:'AbortError'});assert.equal(calls,0);
 assert.deepEqual(await Promise.all([load.get(),load.get()]),[1,1]);assert.equal(await load.get(),2);
});
test('cancellation observes a late rejection without delivering its result',async()=>{
 const job=deferred<number>(),controller=new AbortController();const result=abortable(job.promise,controller.signal);controller.abort();await assert.rejects(result,{name:'AbortError'});job.reject(new Error('late'));await Promise.resolve();
});
test('canceling font embedding aborts its owned font request and permits a later export',async()=>{
 const deck=newDeck('Font cancel',[{...blankSlide(),elements:[element('text',{text:'Backup intact',fontFamily:'Inter'})]}]);
 const originalFetch=globalThis.fetch;const controller=new AbortController();let active!:AbortSignal;const started=deferred<void>();
 globalThis.fetch=async(_input,init)=>{active=init!.signal!;started.resolve();return new Promise((_yes,no)=>active.addEventListener('abort',()=>no(active.reason),{once:true}));};
 try{const pending=embeddedLibraryFonts(deck,controller.signal);await started.promise;controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(active.aborted,true);}finally{globalThis.fetch=originalFetch;}
});
