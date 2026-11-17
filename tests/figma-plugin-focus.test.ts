import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createSyncMedia} from '../src/core/figma-sync-media';

const source=await readFile('plugins/figma-export/ui.js','utf8');
function harness(){
 const fields=new Map<string,any>(),frames:(()=>void)[]=[],messages:any[]=[],body={dataset:{} as Record<string,string>};
 const document:{body:object;activeElement:unknown;getElementById:(id:string)=>any}={body,activeElement:body,getElementById(id){if(!fields.has(id))fields.set(id,{value:id==='code'?'example-code':id==='range'?'336':'',style:{},contains(node:unknown){return node===this;},attributes:new Map<string,string>(),setAttribute(name:string,value:string){this.attributes.set(name,value);},disabled:false,textContent:'',listeners:new Map<string,(event:any)=>void>(),focuses:[] as unknown[],clicks:0,focus(options:unknown){this.focuses.push(options);document.activeElement=this;},addEventListener(type:string,listener:(event:any)=>void){this.listeners.set(type,listener);},click(){this.clicks++;return this.onclick?.();}});return fields.get(id);}};
 const context=vm.createContext({document,requestAnimationFrame:(callback:()=>void)=>{frames.push(callback);return frames.length;},parent:{postMessage:(message:any)=>messages.push(message.pluginMessage)},DeckStudioPptx:{createSyncMedia},AbortSignal,AbortController,Error,TypeError,URL,Blob,Uint8Array,atob,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},fetch(){throw Error('No network expected for focus/Enter behavior');}});vm.runInContext(source,context);
 function key(key='Enter',isComposing=false){let prevented=0;document.getElementById('code').listeners.get('keydown')({key,isComposing,preventDefault(){prevented++;}});return prevented;}
 return{document,fields,messages,frames,key};
}
test('opening the real plugin UI focuses the connection field without scrolling',()=>{
 const h=harness(),code=h.fields.get('code');assert.equal(h.frames.length,1);assert.equal(code.focuses.length,0);h.frames[0]();assert.equal(h.document.activeElement,code);assert.equal(code.focuses.length,1);assert.equal(code.focuses[0].preventScroll,true);assert.deepEqual(h.messages,[]);
});
test('deferred focus respects a field the user already focused',()=>{
 const h=harness(),range=h.document.getElementById('range');h.document.activeElement=range;h.frames[0]();assert.equal(h.document.activeElement,range);assert.equal(h.fields.get('code').focuses.length,0);
});
test('Enter invokes the existing guarded Connect action once with the selected slide range',()=>{
 const h=harness();assert.equal(h.key(),1);assert.equal(h.fields.get('connect').clicks,1);assert.equal(h.fields.get('connect').disabled,true);assert.equal(h.messages.length,1);assert.equal(h.messages[0].type,'connect');assert.equal(h.messages[0].range,'336');assert.equal(typeof h.messages[0].requestId,'number');assert.equal(h.key(),0);assert.equal(h.messages.length,1);
});
test('disabled, composing and non-Enter key events cannot connect or consume text input',()=>{
 for(const mode of ['disabled','composing','other'] as const){const h=harness();if(mode==='disabled')h.fields.get('connect').disabled=true;assert.equal(h.key(mode==='other'?'a':'Enter',mode==='composing'),0);assert.equal(h.fields.get('connect').clicks,0);assert.deepEqual(h.messages,[]);}
 const blank=harness();blank.fields.get('code').value='  ';blank.key();assert.deepEqual(blank.messages,[]);assert.equal(blank.fields.get('connect').disabled,false);assert.match(blank.fields.get('status').textContent,/Paste a connection code/);assert.equal((blank.document.body as any).dataset.syncState,'attention');assert.equal(blank.document.activeElement,blank.fields.get('code'));
});
