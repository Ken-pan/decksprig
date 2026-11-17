import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import type {IncomingMessage} from 'node:http';
import {figmaSyncRoute} from '../server/figma-sync';
import {createSyncMedia} from '../src/core/figma-sync-media';
import {retryFigmaWrite} from '../src/core/figma-sync-recovery';
import {blankSlide,element,newDeck} from '../src/core/model';

const uiSource=await readFile('plugins/figma-export/ui.js','utf8');
test('the actual plugin UI confirms a lost snapshot and apply receipt without re-pairing or repeating native apply',async()=>{
 const editor=createSyncMedia(),deck=newDeck('Receipt fixture',[blankSlide()]);
 async function call(path:string,method='GET',data?:unknown,token?:string){
  const packet=data===undefined?undefined:editor.encode(data).packet;
  const raw=await figmaSyncRoute({method,url:path,headers:{authorization:token?`Bearer ${token}`:undefined}} as IncomingMessage,path.split('?')[0],async()=>packet);
  if(packet)editor.accept(packet);return editor.decode(raw);
 }
 const connection=await call('/api/figma-sync/start','POST',{deck,direction:'figma'}),ep=`/api/figma-sync/${connection.id}/editor`;
 const fields=new Map<string,any>(),messages:any[]=[],publications:number[]=[],lost=new Set([1,2]);let timer=0;
 const field=(id:string)=>{if(!fields.has(id))fields.set(id,{value:id==='code'?connection.code:'',style:{},contains(node:unknown){return node===this;},attributes:new Map<string,string>(),setAttribute(name:string,value:string){this.attributes.set(name,value);},disabled:false,textContent:'',listeners:new Map<string,(event:any)=>void>(),focus(){document.activeElement=this;},addEventListener(type:string,listener:(event:any)=>void){this.listeners.set(type,listener);},click(){return this.onclick?.();}});return fields.get(id);};
 const body={dataset:{} as Record<string,string>},document:{body:object;activeElement:unknown;getElementById:typeof field}={body,activeElement:body,getElementById:field};
 const context=vm.createContext({document,requestAnimationFrame:(callback:()=>void)=>{queueMicrotask(callback);return 1;},parent:{postMessage:(m:any)=>messages.push(m.pluginMessage)},DeckStudioPptx:{createSyncMedia},AbortController,AbortSignal,TypeError,Error,Blob,URL,Uint8Array,atob,setTimeout:()=>++timer,clearTimeout(){},setInterval:()=>++timer,clearInterval(){},fetch:async(url:string,options:any)=>{
  const path=new URL(url).pathname,body=options.body===undefined?undefined:JSON.parse(options.body);
  const raw=await figmaSyncRoute({method:options.method,url:new URL(url).pathname+new URL(url).search,headers:{authorization:options.headers.Authorization}} as IncomingMessage,path,async()=>body);
  const seq=body?.data?.bundle?body.data.seq:undefined;
  if(seq!==undefined){publications.push(seq);if(lost.delete(seq))throw new TypeError('Accepted response lost');}
  return Response.json(raw);
 }});
 const evaluate=(code:string)=>vm.runInContext(code,context),message=(m:any)=>context.onmessage({data:{pluginMessage:m}});
 vm.runInContext(uiSource,context);
 try{
  await evaluate('connect.onclick()');const requestId=messages.at(-1).requestId;
  await message({type:'connect-ready',fileKey:'receipt-fixture',requestId});
  const native={kind:'figma-rest',title:'Native edit',slides:[{id:'2:1',absoluteBoundingBox:{x:0,y:0,width:1920,height:1080},children:[]}],renders:{'2:1':'data:image/png;base64,'+'A'.repeat(200)}};
  await message({type:'snapshot',bundle:native,signature:'native-before',requestId});
  assert.equal(evaluate('paused'),false,'an accepted but lost response should confirm the same publication');
  assert.equal(evaluate('needsReconnect'),false);assert.equal(evaluate('seq'),1);
  const first=await call(ep+'?after=0','GET',undefined,connection.token);
  assert.equal(first.native.bundle.title,'Native edit');
  assert.equal(first.native.bundle.renders['2:1'],native.renders['2:1']);
  await call(ep,'POST',{seq:1,seen:1,deck},connection.token);
  evaluate('busy=false;serverRevision=undefined');await evaluate('poll()');
  await message({type:'unchanged',requestId});
  assert.equal(messages.filter(m=>m.type==='apply').length,1);
  await message({type:'applied',ack:1,bundle:{...native,title:'Local edit accepted'},signature:'native-after',requestId});
  assert.equal(evaluate('seq'),2);assert.equal(evaluate('ack'),1);assert.equal(evaluate('paused'),false);
  assert.equal(evaluate('session.id'),connection.id);assert.equal(messages.filter(m=>m.type==='apply').length,1);
  assert.deepEqual(publications,[1,1,2,2]);
  const accepted=await call(ep+'?after=1','GET',undefined,connection.token);
  assert.equal(accepted.native.ack,1);assert.equal(accepted.native.bundle.title,'Local edit accepted');
  assert.equal(accepted.revision,first.revision+2,'repeated receipts do not create another state change');
 }finally{evaluate('disconnect()');await call(ep,'DELETE',undefined,connection.token);}
});

test('editor retries confirm exactly the accepted command, preserve newer native edits and reject changed or superseded replays',async()=>{
 const codecs={editor:createSyncMedia(),plugin:createSyncMedia()},deck=newDeck('Editor receipt',[{...blankSlide(),elements:[element('image',{src:'data:image/png;base64,'+'B'.repeat(200)})]}]);
 async function call(role:'editor'|'plugin',path:string,method='GET',data?:unknown,token?:string){
  const codec=codecs[role],packet=data===undefined?undefined:codec.encode(data).packet;
  const raw=await figmaSyncRoute({method,url:path,headers:{authorization:token?`Bearer ${token}`:undefined}} as IncomingMessage,path.split('?')[0],async()=>packet);
  if(packet)codec.accept(packet);return codec.decode(raw);
 }
 const c=await call('editor','/api/figma-sync/start','POST',{deck,direction:'figma'}),ep=`/api/figma-sync/${c.id}/editor`,pp=`/api/figma-sync/${c.id}/plugin`;
 try{
  const p=await call('plugin','/api/figma-sync/pair','POST',{code:c.code,fileKey:'editor-receipt'});
  const native={kind:'figma-rest',slides:[{id:'2:1',absoluteBoundingBox:{x:0,y:0,width:1920,height:1080},children:[]}],renders:{'2:1':'data:image/png;base64,'+'A'.repeat(200)}};
  await call('plugin',pp,'POST',{seq:1,ack:0,bundle:native},p.token);
  const payload={seq:1,seen:1,deck};let attempts=0,acceptedRevision=0;
  await retryFigmaWrite(async()=>{
   const received=await call('editor',ep,'POST',payload,c.token);attempts++;
   if(attempts===1){acceptedRevision=received.revision;await call('plugin',pp,'POST',{seq:2,ack:0,bundle:{...native,title:'New native edit'}},p.token);throw new TypeError('Accepted response lost');}
   return received;
  },()=>true);
  assert.equal(attempts,2);
  const state=await call('editor',ep+'?after=0','GET',undefined,c.token);
  assert.equal(state.commandSeq,1);assert.equal(state.native.seq,2);assert.equal(state.native.bundle.title,'New native edit');
  assert.equal(state.revision,acceptedRevision+1,'the retry neither adds a revision nor erases the intervening native edit');
  const pending=await call('plugin',pp+'?after=0','GET',undefined,p.token);
  assert.equal(pending.command.seq,1);assert.equal(pending.command.seen,1);
  assert.equal(pending.command.deck.slides[0].elements[0].src,deck.slides[0].elements[0].src);
  await assert.rejects(()=>call('editor',ep,'POST',{...payload,deck:{...deck,title:'Different command'}},c.token),{status:409});
  await assert.rejects(()=>call('plugin',pp,'POST',{seq:2,ack:1,bundle:native},p.token),{status:409});
  await call('editor',ep,'POST',{seq:2,seen:2,deck},c.token);
  await assert.rejects(()=>call('editor',ep,'POST',payload,c.token),{status:409});
  await call('plugin',pp,'POST',{seq:3,ack:2,bundle:native,applied:true},p.token);
  const acknowledged=await call('editor',ep+'?after=2','GET',undefined,c.token);
  assert.equal(acknowledged.native.ack,2);assert.equal(acknowledged.native.bundle.renders['2:1'],native.renders['2:1']);
 }finally{await call('editor',ep,'DELETE',undefined,c.token);}
});

test('write recovery remains bounded and never retries conflicts, semantic failures or a replaced connection',async()=>{
 for(const error of [Object.assign(new Error('New native version'),{status:409}),Object.assign(new Error('Unsupported property'),{status:400})]){
  let attempts=0;await assert.rejects(()=>retryFigmaWrite(async()=>{attempts++;throw error;},()=>true));assert.equal(attempts,1);
 }
 let attempts=0;await assert.rejects(()=>retryFigmaWrite(async()=>{attempts++;throw new TypeError('Offline');},()=>true));assert.equal(attempts,2);
 attempts=0;await assert.rejects(()=>retryFigmaWrite(async()=>{attempts++;throw new TypeError('Old connection ended');},()=>false));assert.equal(attempts,1);
});
