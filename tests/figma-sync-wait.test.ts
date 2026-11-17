import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import type {IncomingMessage} from 'node:http';
import {figmaSyncRoute} from '../server/figma-sync';
import {createSyncMedia} from '../src/core/figma-sync-media';
import {blankSlide,newDeck} from '../src/core/model';

test('sync waits wake for both directions, retain unread payloads, and release cancelled or disconnected readers',async()=>{
  const codecs={editor:createSyncMedia(),plugin:createSyncMedia()},deck=newDeck('Wait fixture',[blankSlide()]);
  function call(role:'editor'|'plugin',path:string,method='GET',data?:unknown,token?:string){
    const req=Object.assign(new EventEmitter(),{method,url:path,headers:{authorization:token?`Bearer ${token}`:undefined},socket:new EventEmitter()}) as IncomingMessage;
    const codec=codecs[role],packet=data===undefined?undefined:codec.encode(data).packet;
    const result=figmaSyncRoute(req,path.split('?')[0],async()=>packet).then(raw=>codec.decode(raw));
    return {req,result};
  }
  const c=await call('editor','/api/figma-sync/start','POST',{direction:'figma',deck}).result;
  const p=await call('plugin','/api/figma-sync/pair','POST',{code:c.code,fileKey:'wait-fixture'}).result;
  const ep=`/api/figma-sync/${c.id}/editor`,pp=`/api/figma-sync/${c.id}/plugin`;
  let settled=false;
  const initial=call('editor',ep+`?after=0&since=${p.revision}&wait=20000`,'GET',undefined,c.token);initial.result.then(()=>settled=true);
  await new Promise(r=>setImmediate(r));assert.equal(settled,false);assert.equal(initial.req.socket.listenerCount('close'),1);
  await call('plugin',pp,'POST',{seq:1,ack:0,bundle:{kind:'figma-rest',slides:[{id:'s',absoluteBoundingBox:{x:0,y:0,width:1920,height:1080},children:[]}] }},p.token).result;
  const native=await initial.result;assert.equal(native.native.seq,1);assert.equal(initial.req.socket.listenerCount('close'),0);
  const unread=await call('editor',ep+`?after=0&since=${native.revision}&wait=20000`,'GET',undefined,c.token).result;assert(unread.native.bundle);
  const command=call('plugin',pp+`?after=0&since=${native.revision}&wait=20000`,'GET',undefined,p.token);
  await call('editor',ep,'POST',{seq:1,seen:1,deck},c.token).result;
  const sent=await command.result;assert.equal(sent.command.seq,1);
  const cancelled=call('plugin',pp+`?after=1&since=${sent.revision}&wait=20000`,'GET',undefined,p.token);assert.equal(cancelled.req.socket.listenerCount('close'),1);cancelled.req.socket.emit('close');await cancelled.result;assert.equal(cancelled.req.socket.listenerCount('close'),0);assert.equal(cancelled.req.listenerCount('aborted'),0);
  const waiting=call('editor',ep+`?after=1&since=${sent.revision}&wait=20000`,'GET',undefined,c.token);
  const rejected=assert.rejects(waiting.result,/expired/);await call('plugin',pp,'DELETE',undefined,p.token).result;await rejected;
});
