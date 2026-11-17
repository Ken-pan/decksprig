import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createSyncMedia} from '../src/core/figma-sync-media';
import {BRAND_NAME} from '../src/brand-name.js';

const source=await readFile('plugins/figma-export/ui.js','utf8');
const html=await readFile('plugins/figma-export/ui.html','utf8');
const builder=await readFile('scripts/build-figma-plugin.mjs','utf8');
const runtimeSource=html.match(/<!-- deck-studio-ui:start --><script>([\s\S]*?)<\/script><!-- deck-studio-ui:end -->/)?.[1].replace(/<\\\/script/gi,'</script');
type Scope={fileKey:string;slideIds:string[]};

function harness({scope,pairError}:{scope?:Scope;pairError?:string}={}){
 const fields=new Map<string,any>(),messages:any[]=[],requests:any[]=[],timeouts=new Map<number,()=>unknown>();
 let clock=0,retry=0,pairs=0;
 const body={dataset:{} as Record<string,string>};
 const document:{body:object;activeElement:unknown;getElementById:(id:string)=>any}={body,activeElement:body,getElementById(id){
  if(!fields.has(id))fields.set(id,{value:id==='code'?'fixture-code':'',disabled:false,hidden:false,open:false,inert:false,style:{},textContent:'',attributes:new Map<string,string>(),listeners:new Map<string,(event:any)=>void>(),setAttribute(name:string,value:string){this.attributes.set(name,value);},addEventListener(type:string,listener:(event:any)=>void){this.listeners.set(type,listener);},contains(node:unknown){return node===this;},focus(){document.activeElement=this;},click(){if(!this.disabled)return this.onclick?.();}});
  return fields.get(id);
 }};
 const context=vm.createContext({document,parent:{postMessage:(message:any)=>messages.push(message.pluginMessage)},requestAnimationFrame(){return 1;},DeckStudioPptx:{createSyncMedia},AbortSignal,AbortController,Error,TypeError,URL,Blob,Uint8Array,atob,setTimeout:(callback:()=>unknown)=>{timeouts.set(++clock,callback);return clock;},clearTimeout:(id:number)=>timeouts.delete(id),setInterval:()=>++clock,clearInterval(){},fetch:async(url:string,options:any)=>{
  const data=options.body?JSON.parse(options.body).data:undefined;requests.push({url,method:options.method,data});
  if(url.endsWith('/pair'))return pairError?Response.json({error:pairError},{status:400}):Response.json({id:'session-'+(++pairs),token:'fixture-capability',revision:1,...(scope?{scope}:{} )});
  if(data?.retry===true)retry++;
  return Response.json({received:true,retry,revision:2});
 }});
 assert(runtimeSource,'the shipped plugin contains its generated UI script');vm.runInContext(runtimeSource,context);
 const field=(id:string)=>document.getElementById(id),evaluate=(value:string)=>vm.runInContext(value,context);
 const message=(value:any)=>context.onmessage({data:{pluginMessage:value}});
 async function connect(range='',count=99){field('range').value=range;await field('connect').click();const request=messages.filter(m=>m.type==='connect').at(-1);await message({type:'connect-ready',fileKey:'fixture-file',count,requestId:request.requestId});return request.requestId;}
 return{field,messages,requests,document,evaluate,message,connect,timeouts};
}

test('the real builder changes only the plugin heading and initial connection status within existing markup',()=>{
 const definition=builder.match(/export function brandPluginUI\([\s\S]*?\n\}/)?.[0];assert(definition);
 const brandPluginUI=vm.runInNewContext(`(${definition.replace('export ','')})`,{BRAND_NAME}) as (html:string,brandName?:string)=>string;
 const svg='<svg><path d="M1 1L5 5"/></svg>',pptx='<!-- deck-studio-pptx:start --><script>const label="Old name";</script><!-- deck-studio-pptx:end -->';
 const input=`<h2>Other heading</h2><!-- deck-studio-brand:start --><div>${svg}<h2 style="margin:0">Old name</h2></div><!-- deck-studio-brand:end --><p id="status" role="status">Get a code in Old name → Figma Slides.</p><p>Old name</p>${pptx}`;
 const expected=input.replace('>Old name</h2>','>Example name</h2>').replace('Get a code in Old name →','Get a code in Example name →');
 assert.equal(brandPluginUI(input,'Example name'),expected);assert.equal(brandPluginUI(expected,'Example name'),expected);
});

test('the generated plugin heading and initial status use the central display brand',()=>{
 const heading=html.match(/<!-- deck-studio-brand:start -->[\s\S]*?<h2\b[^>]*>([^<]*)<\/h2>/)?.[1];
 const status=html.match(/<p\b[^>]*\bid="status"[^>]*>([^<]*)<\/p>/)?.[1];
 assert.equal(typeof status,"string");if(heading!==undefined)assert.equal(heading,BRAND_NAME);assert(status===''||status===`Get a code in ${BRAND_NAME} → Figma Slides.`);
});

test('the shipped plugin UI script matches the authored source after identity normalization and formal generation',()=>{
 const generatedSource=source.replace(/^const BRAND_NAME = '[^']*';/m,()=>`const BRAND_NAME = ${JSON.stringify(BRAND_NAME)};`);
 assert.equal(runtimeSource,generatedSource);
});

test('the initial plugin explains the blank connection range beside Connect and preserves the blank native request',async()=>{
 const h=harness();
 assert.equal(h.field('range-label').textContent,'Slide range');
 assert.equal(h.field('connection-scope-hint').hidden,false);
 const section=html.match(/<section class="sync-section"[\s\S]*?<\/section>/)?.[0]??'';
 assert.match(section,/<button id="connect"[\s\S]*?<p id="connection-scope-hint"[^>]*>Blank range uses selected slides or all slides for new connections\. Set a range in More options\.<\/p>/);
 assert.match(html,/<input id="range"[^>]*aria-describedby="range-hint"/);
 await h.field('connect').click();
 assert.equal(h.messages.at(-1).type,'connect');
 assert.equal(h.messages.at(-1).range,'');
 assert.equal(h.field('range-label').textContent,'Slide range','reading the file has not established a paired session');
 assert.equal(h.field('connection-scope-hint').hidden,false);
});

test('an unpaired file or rejected code leaves the next-connection range available',async()=>{
 for(const mode of ['unsaved','rejected'] as const){
  const h=harness(mode==='rejected'?{pairError:'The connection code expired.'}:{});
  h.field('range').value='2–3';await h.field('connect').click();
  await h.message({type:'connect-ready',fileKey:mode==='unsaved'?undefined:'fixture-file',count:2,requestId:h.messages.at(-1).requestId});
  assert.equal(h.field('range-label').textContent,'Slide range');
  assert.equal(h.field('connection-scope-hint').hidden,false);
  assert.equal(h.field('range').disabled,false);
  assert.equal(h.field('connect').disabled,false);
  assert.equal(h.evaluate('session'),undefined);
  assert.match(h.field('status').textContent,mode==='unsaved'?/Save this Figma file/:/code expired/);
 }
});

test('a paired session makes the same editable range export-only for both file actions',async()=>{
 const h=harness(),requestId=await h.connect('2–3');
 assert.equal(h.messages.find(m=>m.type==='connect').range,'2–3');
 assert.equal(h.field('range-label').textContent,'Export slide range');
 assert.equal(h.field('connection-scope-hint').hidden,true);
 assert.match(h.field('range-hint').textContent,/For file exports only/);
 assert.equal(h.field('range-hint').textContent,`For file exports only. Start a new connection in ${BRAND_NAME} to sync a different range.`);
 assert.doesNotMatch(h.field('range-hint').textContent,/Deckleaf/);
 assert.equal(h.field('range').disabled,false);
 h.field('range').value='5';await h.field('export').click();
 h.field('range').value='';await h.field('pptx').click();
 const exports=h.messages.filter(m=>m.type==='export');
 assert.deepEqual(exports.map(m=>m.range),['5','']);
 assert(exports.every(m=>m.requestId===requestId));
 assert.equal(h.messages.filter(m=>m.type==='connect').length,1);
 assert.equal(h.evaluate('session.id'),'session-1');
});

test('saved reconnection uses the paired linked IDs instead of the current range or connect-ready count',async()=>{
 const scope={fileKey:'fixture-file',slideIds:['2:7','2:11']},h=harness({scope});
 const requestId=await h.connect('1',99),snapshot=h.messages.filter(m=>m.type==='snapshot').at(-1);
 assert.equal(h.messages.find(m=>m.type==='connect').range,'1','the existing initial native request remains unchanged');
 assert.deepEqual(JSON.parse(JSON.stringify(snapshot.scope)),scope);
 assert.equal(snapshot.range,undefined);
 assert.doesNotMatch(h.field('range-hint').textContent,/99|1 slide/);
 h.field('range').value='8–10';await h.field('export').click();
 assert.equal(h.messages.at(-1).range,'8–10');
 assert.deepEqual(JSON.parse(h.evaluate('JSON.stringify(session.scope)')),scope);
 await h.message({type:'unchanged',requestId});
 assert.equal(h.field('range-label').textContent,'Export slide range');
 assert.equal(h.evaluate('document.body.dataset.syncState'),'connected');
});

test('retry and required reconnect keep export scope separate until Disconnect restores a fresh connection',async()=>{
 const h=harness(),requestId=await h.connect('1–2');
 await h.message({type:'error',text:'Install the original font.',requestId});
 assert.equal(h.field('connect').textContent,'Retry sync');
 assert.equal(h.field('range-label').textContent,'Export slide range');
 h.field('range').value='4';await h.field('connect').click();
 assert.equal(h.evaluate('paused'),false);
 assert.equal(h.requests.filter(r=>r.data?.retry===true).length,1);
 assert.equal(h.messages.filter(m=>m.type==='connect').length,1,'Retry does not recapture a new range');
 await h.message({type:'error',text:'Reconcile both versions.',reconnect:true,requestId});
 assert.equal(h.field('connect').disabled,true);
 assert.equal(h.field('range-label').textContent,'Export slide range');
 assert.equal(h.field('range').disabled,false);
 await h.field('pptx').click();assert.equal(h.messages.at(-1).range,'4');
 h.field('stop').focus();await h.field('stop').click();
 assert.equal(h.evaluate('session'),undefined);
 assert.equal(h.field('range-label').textContent,'Slide range');
 assert.equal(h.field('connection-scope-hint').hidden,false);
 assert.equal(h.document.activeElement,h.field('code'));
 assert.equal(h.field('range').value,'4');
 assert(h.requests.some(r=>r.method==='DELETE'&&r.url.endsWith('/session-1/plugin')));
 h.field('code').value='next-code';await h.field('connect').click();
 assert.equal(h.messages.at(-1).type,'connect');
 assert.equal(h.messages.at(-1).range,'4');
 assert(h.messages.at(-1).requestId>requestId);
});

test('a stale connection reply after Disconnect cannot restore export-only range guidance',async()=>{
 const h=harness(),requestId=await h.connect('2');await h.field('stop').click();const requests=h.requests.length;
 await h.message({type:'connect-ready',fileKey:'fixture-file',count:2,requestId});
 assert.equal(h.requests.length,requests);
 assert.equal(h.field('range-label').textContent,'Slide range');
 assert.equal(h.field('connection-scope-hint').hidden,false);
 assert.equal(h.evaluate('session'),undefined);
});
