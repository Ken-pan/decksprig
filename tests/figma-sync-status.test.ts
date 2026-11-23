import test from 'node:test';
import assert from 'node:assert/strict';
import type {IncomingMessage} from 'node:http';
import {figmaPairedStatus} from '../src/core/figma-sync-status';
import {figmaSyncRoute} from '../server/figma-sync';
import {createSyncMedia} from '../src/core/figma-sync-media';
import {newDeck,blankSlide} from '../src/core/model';

test('first capture, pending command, native ACK and empty polls preserve the paired status',async()=>{
 const editor=createSyncMedia(),plugin=createSyncMedia(),deck=newDeck('Paired status sequence',[blankSlide()]);
 async function call(role:'editor'|'plugin',path:string,method='GET',data?:unknown,token?:string){
  const codec=role==='editor'?editor:plugin,packet=data===undefined?undefined:codec.encode(data).packet;
  const result=await figmaSyncRoute({method,url:path,headers:{authorization:token?`Bearer ${token}`:undefined}} as IncomingMessage,path.split('?')[0],async()=>packet);
  if(packet)codec.accept(packet);return codec.decode(result);
 }
 const session=await call('editor','/api/figma-sync/start','POST',{direction:'figma',deck});
 try{
  const paired=await call('plugin','/api/figma-sync/pair','POST',{code:session.code,fileKey:'status-fixture'}),editorPath=`/api/figma-sync/${session.id}/editor`,pluginPath=`/api/figma-sync/${session.id}/plugin`;
  let nativeSeq=0,ack=0,commandSeq=0;
  const first=await call('editor',editorPath+'?after=0','GET',undefined,session.token);assert.equal(first.paired,true);assert.equal(first.native,undefined);assert.equal(figmaPairedStatus(first.native,nativeSeq,ack,commandSeq),'Reading native slides in Figma');
  const bundle={kind:'figma-rest',slides:[{id:'native-slide',type:'SLIDE',absoluteBoundingBox:{x:0,y:0,width:1920,height:1080},children:[]}]};
  await call('plugin',pluginPath,'POST',{seq:1,ack:0,bundle},paired.token);
  const baseline=await call('editor',editorPath+'?after=0','GET',undefined,session.token);nativeSeq=baseline.native.seq;ack=baseline.native.ack;
  assert.equal(figmaPairedStatus(baseline.native,nativeSeq,ack,commandSeq),'Connected · Changes sync automatically');
  assert.equal(figmaPairedStatus(undefined,nativeSeq,ack,commandSeq),'Connected · Changes sync automatically','an empty packet cannot forget an accepted baseline');
  await call('editor',editorPath,'POST',{seq:1,seen:nativeSeq,deck},session.token);commandSeq=1;
  const waiting=await call('editor',editorPath+'?after=1','GET',undefined,session.token);assert.equal(waiting.native.ack,0);
  assert.equal(figmaPairedStatus(waiting.native,nativeSeq,ack,commandSeq),'Waiting for Figma to apply changes');
  assert.equal(figmaPairedStatus(undefined,nativeSeq,ack,commandSeq),'Waiting for Figma to apply changes','an empty packet cannot acknowledge an outstanding command');
  await call('plugin',pluginPath,'POST',{seq:2,ack:1,bundle,applied:true},paired.token);
  const applied=await call('editor',editorPath+'?after=1','GET',undefined,session.token);nativeSeq=applied.native.seq;ack=applied.native.ack;
  assert.equal(figmaPairedStatus(applied.native,nativeSeq,ack,commandSeq),'Connected · Changes sync automatically');
  const idle=await call('editor',editorPath+`?after=${nativeSeq}`,'GET',undefined,session.token);assert.equal(idle.native.bundle,undefined);
  assert.equal(figmaPairedStatus(idle.native,nativeSeq,ack,commandSeq),'Connected · Changes sync automatically');
  for(let i=0;i<3;i++)assert.equal(figmaPairedStatus(undefined,nativeSeq,ack,commandSeq),'Connected · Changes sync automatically');
  await call('editor',editorPath,'POST',{seq:2,seen:nativeSeq,deck},session.token);commandSeq=2;
  assert.equal(figmaPairedStatus(undefined,nativeSeq,ack,commandSeq),'Waiting for Figma to apply changes');
 }finally{await call('editor',`/api/figma-sync/${session.id}/editor`,'DELETE',undefined,session.token);}
});

test('a present native receipt determines pending status; no first capture still means Reading',()=>{
 assert.equal(figmaPairedStatus({ack:1},2,2,2),'Waiting for Figma to apply changes');
 assert.equal(figmaPairedStatus({ack:2},2,1,2),'Connected · Changes sync automatically');
 assert.equal(figmaPairedStatus(undefined,0,0,1),'Reading native slides in Figma');
});
