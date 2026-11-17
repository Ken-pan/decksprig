import {test} from 'node:test';import assert from 'node:assert/strict';
import {buildPptxInBackground} from '../src/core/background-pptx-export';import {newDeck,blankSlide,element} from '../src/core/model';
class WorkerFixture {onmessage:any;onerror:any;onmessageerror:any;messages:any[]=[];terminated=false;postMessage(value:any){this.messages.push(value);}terminate(){this.terminated=true;}reply(data:any){this.onmessage({data});}}
const request=()=>({deck:newDeck('Export',[blankSlide()]),original:false,dimensions:{}});
test('PPTX exports transfer a captured request once and terminate their engine after completion',async()=>{
 const worker=new WorkerFixture();let fallbacks=0;const pending=buildPptxInBackground(request(),async()=>{fallbacks++;return new Uint8Array();},()=>worker as unknown as Worker);
 assert.equal(worker.messages.length,0);worker.reply({type:'ready'});worker.reply({type:'ready'});assert.equal(worker.messages.length,1);worker.reply({type:'result',bytes:new Uint8Array([1,2,3])});assert.deepEqual(await pending,new Uint8Array([1,2,3]));assert(worker.terminated);assert.equal(fallbacks,0);
});
test('PPTX startup fallback and failed exports release the worker without downloading partial results',async()=>{
 const worker=new WorkerFixture();let fallbacks=0;const pending=buildPptxInBackground(request(),async()=>{fallbacks++;return new Uint8Array([9]);},()=>worker as unknown as Worker);worker.onerror({preventDefault(){}});assert.deepEqual(await pending,new Uint8Array([9]));assert(worker.terminated);assert.equal(fallbacks,1);
 const failed=new WorkerFixture();const rejected=buildPptxInBackground(request(),async()=>{fallbacks++;return new Uint8Array();},()=>failed as unknown as Worker);failed.reply({type:'ready'});failed.reply({type:'result',error:'Protected image could not load'});await assert.rejects(rejected,/Protected image/);assert(failed.terminated);assert.equal(fallbacks,1);
});


test('SVG backgrounds use the DOM export path without starting a worker',async()=>{
 for(const src of ['data:image/svg+xml;base64,PHN2Zy8+','/examples/grid.svg?version=2']){
  const job=request();job.deck.slides[0].elements.push(element('image',{src}));let workers=0,fallbacks=0;
  const before=JSON.stringify(job.deck);const result=await buildPptxInBackground(job,async()=>{fallbacks++;return new Uint8Array([8]);},()=>{workers++;return new WorkerFixture() as unknown as Worker;});
  assert.deepEqual(result,new Uint8Array([8]));assert.equal(workers,0);assert.equal(fallbacks,1);assert.equal(JSON.stringify(job.deck),before);
 }
});


test('canceling PPTX before or after dispatch terminates the worker without a fallback export',async()=>{
 for(const dispatched of [false,true]){
  const controller=new AbortController(),worker=new WorkerFixture();let fallbacks=0;
  const pending=buildPptxInBackground(request(),async()=>{fallbacks++;return new Uint8Array([9]);},()=>worker as unknown as Worker,controller.signal);
  if(dispatched)worker.reply({type:'ready'});controller.abort();await assert.rejects(pending,{name:'AbortError'});
  assert(worker.terminated);assert.equal(worker.onmessage,null);assert.equal(fallbacks,0);
 }
});
