import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BackgroundDocumentSaver } from '../src/core/background-document-save';
import { jsonRequest } from '../src/core/json-request';

class FakeWorker {
  onmessage: Worker['onmessage'] = null;
  onerror: Worker['onerror'] = null;
  onmessageerror: Worker['onmessageerror'] = null;
  messages: {id:number;url:string;body:unknown}[]=[];
  terminated=false;
  asWorker() { return this as unknown as Worker; }
  postMessage(value: unknown) { this.messages.push(structuredClone(value) as typeof this.messages[number]); }
  terminate() { this.terminated=true; }
  reply(data:unknown) { this.onmessage?.call(this.asWorker(),{data} as MessageEvent); }
  fail() { this.onerror?.call(this.asWorker(),{preventDefault(){}} as ErrorEvent); }
}
async function turn() { await Promise.resolve(); await Promise.resolve(); }

test('save waits for startup and preserves revision payloads and concurrent response identities', async()=>{
  const worker=new FakeWorker(),saver=new BackgroundDocumentSaver(()=>worker.asWorker());
  const first=saver.save('/api/decks/a',{deck:{id:'a',revision:1},expectedRevision:0});
  const second=saver.save('/api/decks/b',{deck:{id:'b',revision:2},expectedRevision:1});
  assert.equal(worker.messages.length,0);worker.reply({type:'ready'});await turn();
  assert.equal(worker.messages.length,2);assert.deepEqual(worker.messages[0].body,{deck:{id:'a',revision:1},expectedRevision:0});
  worker.reply({type:'result',id:worker.messages[1].id,value:{ok:'b'}});worker.reply({type:'result',id:worker.messages[0].id,value:{ok:'a'}});
  assert.deepEqual(await first,{ok:'a'});assert.deepEqual(await second,{ok:'b'});
});

test('a startup failure falls back before dispatching any write', async()=>{
  const worker=new FakeWorker(),saver=new BackgroundDocumentSaver(()=>worker.asWorker());let fallback=0;
  const result=saver.save('/api/decks/a',{},async()=>{fallback++;return {ok:true};});worker.fail();
  assert.deepEqual(await result,{ok:true});assert.equal(fallback,1);assert.equal(worker.messages.length,0);assert.equal(worker.terminated,true);
  const unavailable=new BackgroundDocumentSaver(()=>{throw Error('Worker unavailable');});
  assert.equal(await unavailable.save('/api/decks/a',{},async()=>true),true);
});

test('failure after dispatch rejects the save and never replays an uncertain write', async()=>{
  const worker=new FakeWorker(),saver=new BackgroundDocumentSaver(()=>worker.asWorker());let fallback=0;
  const pending=saver.save('/api/decks/a',{},async()=>{fallback++;return {};});
  worker.reply({type:'ready'});await turn();assert.equal(worker.messages.length,1);
  const rejected=assert.rejects(pending,/Keep this tab open/);worker.fail();await rejected;
  assert.equal(fallback,0);assert.equal(worker.terminated,true);
});

test('a recovery worker reports its own failure without claiming that a backup was retained',async()=>{
  const worker=new FakeWorker(),saver=new BackgroundDocumentSaver(()=>worker.asWorker(),15,'Recovery write failed');let fallback=0;
  const pending=saver.save('drafts',{record:{id:'branch'}},async()=>{fallback++;});
  worker.reply({type:'ready'});await turn();
  const rejected=assert.rejects(pending,/^Error: Recovery write failed$/);worker.fail();await rejected;
  assert.equal(fallback,0);assert.equal(worker.terminated,true);
});

test('revision conflicts remain visible and do not poison later explicit save attempts', async()=>{
  const worker=new FakeWorker(),saver=new BackgroundDocumentSaver(()=>worker.asWorker());
  const first=saver.save('/api/decks/a',{});worker.reply({type:'ready'});await turn();
  const rejected=assert.rejects(first,error=>(error as {status:number}).status===409);
  worker.reply({type:'result',id:worker.messages[0].id,error:'Updated in another window',status:409});await rejected;
  const retry=saver.save('/api/decks/a',{});await turn();worker.reply({type:'result',id:worker.messages[1].id,value:{ok:true}});
  assert.deepEqual(await retry,{ok:true});
});

test('foreground and background JSON transport use the same body and error contract', async()=>{
  let payload:unknown;
  const transport:typeof fetch=async(_url,options)=>{payload=JSON.parse(options!.body as string);return new Response(JSON.stringify({error:'Revision conflict'}),{status:409});};
  await assert.rejects(jsonRequest('/api/decks/a','PUT',{deck:{revision:5},expectedRevision:4},transport),error=>(error as {status:number}).status===409&&error instanceof Error&&error.message==='Revision conflict');
  assert.deepEqual(payload,{deck:{revision:5},expectedRevision:4});
});

test('document creation uses POST and never replays an uncertain duplicate',async()=>{
 const worker=new FakeWorker(),saver=new BackgroundDocumentSaver(()=>worker.asWorker());let fallback=0;
 const pending=saver.save('/api/decks',{id:'independent-copy'},async()=>{fallback++;return {};},'POST');worker.reply({type:'ready'});await turn();
 assert.equal((worker.messages[0] as unknown as {method:string}).method,'POST');
 const rejected=assert.rejects(pending,/Keep this tab open/);worker.fail();await rejected;assert.equal(fallback,0);
});

test('idle save workers release memory, restart cleanly, and never terminate an active request',async()=>{
 const workers:FakeWorker[]=[];const saver=new BackgroundDocumentSaver(()=>{const w=new FakeWorker();workers.push(w);return w.asWorker();},15);
 const first=saver.save('/api/decks/a',{});workers[0].reply({type:'ready'});await turn();await new Promise(ok=>setTimeout(ok,30));assert.equal(workers[0].terminated,false);
 workers[0].reply({type:'result',id:workers[0].messages[0].id,value:{ok:true}});await first;await new Promise(ok=>setTimeout(ok,30));assert.equal(workers[0].terminated,true);assert.equal(workers[0].onmessage,null);
 const second=saver.save('/api/decks/a',{});assert.equal(workers.length,2);workers[1].reply({type:'ready'});await turn();workers[1].reply({type:'result',id:workers[1].messages[0].id,value:{ok:true}});await second;
});

test('minimal editor writes skip successful document echo bodies but preserve errors and default responses',async()=>{
 let headers:any,reads=0;const response=new Response('unused document bytes');response.json=async()=>{reads++;throw Error('Must not parse the echo');};
 const transport:typeof fetch=async(_url,options)=>{headers=options!.headers;return response;};
 assert.equal(await jsonRequest('/api/decks/a','PUT',{revision:1},transport,{minimal:true}),undefined);assert.equal(headers.Prefer,'return=minimal');assert.equal(reads,0);
 await assert.rejects(jsonRequest('/api/decks/a','PUT',{},async()=>Response.json({error:'Stale revision'},{status:409}),{minimal:true}),error=>(error as {status:number}).status===409&&error instanceof Error&&error.message==='Stale revision');
 assert.deepEqual(await jsonRequest('/api/decks/a','POST',{},async()=>Response.json({schema:'deck-studio/1',revision:1})),{schema:'deck-studio/1',revision:1});
});

test('a silent worker timeout releases every pending save without replay and permits a fresh explicit request',async context=>{
  context.mock.timers.enable({apis:['setTimeout']});
  const workers:FakeWorker[]=[];let fallback=0;
  const saver=new BackgroundDocumentSaver(()=>{const w=new FakeWorker();workers.push(w);return w.asWorker();},15,'Save did not complete',25);
  const first=saver.save('/api/decks/a',{},async()=>{fallback++;});
  const second=saver.save('/api/decks/b',{},async()=>{fallback++;});
  const rejected=Promise.all([assert.rejects(first,/Save did not complete/),assert.rejects(second,/Save did not complete/)]);
  workers[0].reply({type:'ready'});await turn();context.mock.timers.tick(25);await rejected;
  assert.equal(workers[0].messages.length,2);assert.equal(workers[0].terminated,true);assert.equal(fallback,0);
  const retry=saver.save('/api/decks/a',{});workers[1].reply({type:'ready'});await turn();
  workers[1].reply({type:'result',id:workers[1].messages[0].id,value:{ok:true}});assert.deepEqual(await retry,{ok:true});
  context.mock.timers.tick(35);assert.equal(workers[1].terminated,true);
});

test('successful replies clear the request watchdog without interrupting later saves',async context=>{
  context.mock.timers.enable({apis:['setTimeout']});
  const worker=new FakeWorker(),saver=new BackgroundDocumentSaver(()=>worker.asWorker(),100,'Timed out',40);
  const first=saver.save('/api/decks/a',{});worker.reply({type:'ready'});await turn();
  worker.reply({type:'result',id:worker.messages[0].id});await first;
  context.mock.timers.tick(30);
  const second=saver.save('/api/decks/a',{});await turn();context.mock.timers.tick(20);
  assert.equal(worker.terminated,false);worker.reply({type:'result',id:worker.messages[1].id,value:true});assert.equal(await second,true);
});

