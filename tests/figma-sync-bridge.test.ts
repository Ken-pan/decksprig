import test from 'node:test';
import assert from 'node:assert/strict';
import type {IncomingMessage} from 'node:http';
import {figmaSyncRoute} from '../server/figma-sync';
import {createSyncMedia} from '../src/core/figma-sync-media';
import {newDeck,blankSlide,element} from '../src/core/model';

test('paired bridge scopes access, rejects stale updates, and sends no media while idle',async()=>{
  const image='data:image/png;base64,'+'A'.repeat(20000),slide={...blankSlide(),elements:[element('image',{src:image})]},deck=newDeck('Bridge test',[slide]);
  const editor=createSyncMedia(),plugin=createSyncMedia();
  async function request(role:'editor'|'plugin',path:string,method='GET',body?:any,token?:string){const codec=role==='editor'?editor:plugin,packet=body===undefined?undefined:codec.encode(body).packet;const req={method,url:path,headers:{...(token?{authorization:`Bearer ${token}`}:{})}}as IncomingMessage;const raw=await figmaSyncRoute(req,path.split('?')[0],async()=>packet);if(packet)codec.accept(packet);return {raw,value:codec.decode(raw)};}
  const connection=(await request('editor','/api/figma-sync/start','POST',{direction:'deck',deck})).value;
  const paired=(await request('plugin','/api/figma-sync/pair','POST',{code:connection.code,fileKey:'fixture-file'})).value;
  assert.equal(paired.command.deck.slides[0].elements[0].src,image);
  await assert.rejects(()=>request('plugin','/api/figma-sync/pair','POST',{code:connection.code,fileKey:'fixture-file'}),/already used/);
  await assert.rejects(()=>request('editor',`/api/figma-sync/${connection.id}/editor`,'GET',undefined,paired.token),/expired/);
  const native={kind:'figma-rest',slides:[{id:'s',absoluteBoundingBox:{x:0,y:0,width:1920,height:1080},children:[]}],renders:{s:image}};
  await request('plugin',`/api/figma-sync/${paired.id}/plugin`,'POST',{seq:1,ack:1,bundle:native,applied:true},paired.token);
  const received=await request('editor',`/api/figma-sync/${connection.id}/editor?after=0`,'GET',undefined,connection.token);assert.equal(received.value.native.bundle.renders.s,image);
  const idle=await request('editor',`/api/figma-sync/${connection.id}/editor?after=1`,'GET',undefined,connection.token);assert.equal(idle.value.native.bundle,undefined);assert('media' in idle.raw);assert.equal(Object.keys(idle.raw.media).length,0);assert(JSON.stringify(idle.raw).length<500);
  await assert.rejects(()=>request('editor',`/api/figma-sync/${connection.id}/editor`,'POST',{seq:2,seen:0,deck},connection.token),/newer version/);
  await request('editor',`/api/figma-sync/${connection.id}/editor`,'DELETE',undefined,connection.token);
  await assert.rejects(()=>request('plugin',`/api/figma-sync/${paired.id}/plugin`,'GET',undefined,paired.token),/expired/);
});

test('plugin health comes from its own heartbeat, not editor polling; retry does not resend a command or revive old errors',async()=>{
 const originalNow=Date.now;let now=originalNow();Date.now=()=>now;const editor=createSyncMedia(),plugin=createSyncMedia();
 async function call(role:'editor'|'plugin',path:string,method='GET',data?:any,token?:string){const codec=role==='editor'?editor:plugin,packet=data===undefined?undefined:codec.encode(data).packet,result=await figmaSyncRoute({method,url:path,headers:{authorization:token?'Bearer '+token:undefined}} as IncomingMessage,path.split('?')[0],async()=>packet);return codec.decode(result);}
 let id='',token='';try{const c=await call('editor','/api/figma-sync/start','POST',{deck:newDeck('Health',[blankSlide()]),direction:'deck'});id=c.id;token=c.token;const p=await call('plugin','/api/figma-sync/pair','POST',{code:c.code,fileKey:'original'});const editorPath=`/api/figma-sync/${c.id}/editor`,pluginPath=`/api/figma-sync/${c.id}/plugin`;assert.equal((await call('editor',editorPath,'GET',undefined,c.token)).pluginOnline,true);
 now+=31_000;assert.equal((await call('editor',editorPath,'GET',undefined,c.token)).pluginOnline,false);await call('editor',editorPath,'GET',undefined,c.token);assert.equal((await call('editor',editorPath,'GET',undefined,c.token)).pluginOnline,false);
 await call('plugin',pluginPath+'?heartbeat=1','POST',{paused:false,retry:0},p.token);const live=await call('editor',editorPath,'GET',undefined,c.token);assert.equal(live.pluginOnline,true);assert.equal(live.commandSeq,1);assert.equal(live.native,undefined);
 await call('plugin',pluginPath,'POST',{error:'Install the missing font'},p.token);assert.match((await call('editor',editorPath,'GET',undefined,c.token)).error,/font/);await call('editor',editorPath,'POST',{retry:true},c.token);const beat=await call('plugin',pluginPath+'?heartbeat=1','POST',{paused:true,error:'Install the missing font',retry:0},p.token);assert.equal(beat.retry,1);const retrying=await call('editor',editorPath,'GET',undefined,c.token);assert.equal(retrying.error,undefined);assert.equal(retrying.commandSeq,1);assert.equal(retrying.native,undefined);
 await call('plugin',pluginPath,'POST',{error:'Late rejected command',retry:0},p.token);assert.equal((await call('editor',editorPath,'GET',undefined,c.token)).error,undefined);
 await call('plugin',pluginPath,'POST',{error:'Current rejected command',retry:1},p.token);assert.equal((await call('editor',editorPath,'GET',undefined,c.token)).error,'Current rejected command');const resumed=await call('plugin',pluginPath,'POST',{retry:true},p.token);assert.equal(resumed.retry,2);assert.equal((await call('editor',editorPath,'GET',undefined,c.token)).error,undefined);
 }finally{if(id)await call('editor',`/api/figma-sync/${id}/editor`,'DELETE',undefined,token);Date.now=originalNow;}
});

test('read-only reconnect pairs only with the original file and returns a scope without any outgoing command',async()=>{
 const codec=createSyncMedia(),deck=newDeck('Scoped',[blankSlide()]);async function call(path:string,method:string,body?:any,token?:string){const packet=body===undefined?undefined:codec.encode(body).packet;return codec.decode(await figmaSyncRoute({method,url:path,headers:{authorization:token?'Bearer '+token:undefined}} as IncomingMessage,path,async()=>packet));}
 const c=await call('/api/figma-sync/start','POST',{deck,direction:'figma',scope:{fileKey:'original',slideIds:['2:1','2:2']}});try{await assert.rejects(()=>call('/api/figma-sync/pair','POST',{code:c.code,fileKey:'other'}),/original Figma file/);const paired=await call('/api/figma-sync/pair','POST',{code:c.code,fileKey:'original'});assert.deepEqual(paired.scope,{fileKey:'original',slideIds:['2:1','2:2']});assert.equal(paired.command,undefined);}finally{await call(`/api/figma-sync/${c.id}/editor`,'DELETE',undefined,c.token);}
});
