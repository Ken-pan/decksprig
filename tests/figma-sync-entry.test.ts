import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../src/figma-sync-entry.ts',import.meta.url),'utf8');
const code=buildSync({stdin:{contents:source,resolveDir:new URL('../src',import.meta.url).pathname,loader:'ts'},bundle:true,format:'cjs',platform:'node',write:false}).outputFiles[0].text;

function harness(width=440,viewport=1440){
  type Listener=(event:{target:ElementNode})=>void;
  let body:ElementNode,active:ElementNode,tools:ElementNode|null=null;
  const focusListeners=new Set<Listener>(),resizeListeners=new Set<()=>void>(),frames=new Map<number,()=>void>();
  let serial=0,mutate:()=>void=()=>{};
  class ElementNode{
    children:ElementNode[]=[];parentElement:ElementNode|null=null;hidden=false;dataset:Record<string,string>={};disabled=false;focuses=0;scrollWidth=0;
    constructor(readonly name:string,public width=36,public autoSize=false){}
    get isConnected():boolean{return this===body||Boolean(this.parentElement?.isConnected);}
    get clientWidth():number{return this.autoSize?this.children.filter(child=>!child.hidden).reduce((sum,child)=>sum+child.getBoundingClientRect().width,0)+24+Math.max(0,this.children.filter(child=>!child.hidden).length-1)*8:this.width;}
    contains(other:unknown):boolean{return other===this||this.children.some(child=>child.contains(other));}
    prepend(child:ElementNode){child.remove();this.children.unshift(child);child.parentElement=this;}
    append(child:ElementNode){child.remove();this.children.push(child);child.parentElement=this;}
    remove(){if(!this.parentElement)return;if(this.contains(active))active=body;this.parentElement.children=this.parentElement.children.filter(child=>child!==this);this.parentElement=null;}
    getClientRects(){return this.isConnected&&!this.closest('[hidden]')?[this.getBoundingClientRect()]:[];}
    getBoundingClientRect():{left:number;top:number;right:number;bottom:number;width:number;height:number}{const width=this.name==='entry'?(this.dataset.compact==='true'?36:74):this.clientWidth;return {left:0,top:0,right:width,bottom:36,width,height:36};}
    closest(selector:string):ElementNode|null{
      for(let node:ElementNode|null=this;node;node=node.parentElement){if(selector.includes('[hidden]')&&node.hidden)return node;}
      return null;
    }
    matches(selector:string){return selector===':disabled'&&this.disabled;}
    querySelectorAll<T=ElementNode>(selector:string):T[]{return this.children.flatMap(child=>[...(selector==='button'&&child.name.endsWith('button')?[child as unknown as T]:[]),...child.querySelectorAll<T>(selector)]);}
    querySelector<T=ElementNode>(selector:string):T|null{return this.querySelectorAll<T>(selector)[0]??null;}
    focus(){active=this;this.focuses++;for(const listener of focusListeners)listener({target:this});}
  }
  body=new ElementNode('body');active=body;
  const stage=new ElementNode('stage'),entry=new ElementNode('entry'),button=new ElementNode('sync-button');body.append(stage);body.append(entry);entry.append(button);
  const document={body,get activeElement(){return active;},querySelector(selector:string){return selector==='.workspace-tools'?tools:selector==='.canvas-stage'?stage:null;},querySelectorAll(){return[];},addEventListener(type:string,fn:Listener){if(type==='focusin')focusListeners.add(fn);},removeEventListener(type:string,fn:Listener){if(type==='focusin')focusListeners.delete(fn);}};
  const window={addEventListener(type:string,fn:()=>void){if(type==='resize')resizeListeners.add(fn);},removeEventListener(type:string,fn:()=>void){if(type==='resize')resizeListeners.delete(fn);}};
  class ResizeObserver{observe(){}disconnect(){}}
  class MutationObserver{constructor(callback:()=>void){mutate=callback;}observe(){}disconnect(){mutate=()=>{};}}
  const context={module:{exports:{}},document,window,HTMLElement:ElementNode,SVGElement:class{},ResizeObserver,MutationObserver,innerWidth:viewport,getComputedStyle(){return {paddingLeft:'12',paddingRight:'12',marginLeft:'0',marginRight:'0',columnGap:'8',visibility:'visible'};},requestAnimationFrame(fn:()=>void){frames.set(++serial,fn);return serial;},cancelAnimationFrame(id:number){frames.delete(id);}};
  runInNewContext(code,context);const api=context.module.exports as {placeFigmaSyncStatus:(node:unknown)=>{destroy:()=>void}};
  function target(nextWidth=width,autoSize=false){const next=new ElementNode('tools',nextWidth,autoSize);for(const [name,w] of [['search-button',36],['settings-button',36],['present-button',92]] as const)next.append(new ElementNode(name,w));body.append(next);tools=next;return next;}
  function flush(){const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());}
  function resize(nextWidth:number,nextViewport=viewport){if(tools)tools.width=nextWidth;context.innerWidth=nextViewport;for(const listener of resizeListeners)listener();flush();}
  return {body,entry,button,stage,document,target,flush,resize,mutate:()=>{mutate();flush();},mount:()=>api.placeFigmaSyncStatus(entry),outsideControl(){const control=new ElementNode('dialog-button');body.append(control);return control;},removeTarget(){tools?.remove();tools=null;},get active(){return active;},get frames(){return frames.size;}};
}

test('an initially missing headerless host never leaves the connection entry in root flow, and a later host receives the same node',()=>{
  const h=harness(),action=h.mount();assert.equal(h.entry.hidden,true);assert.equal(h.entry.parentElement,null);
  const tools=h.target();h.mutate();assert.equal(h.entry.parentElement,tools);assert.equal(h.entry.hidden,false);assert.equal(h.entry.dataset.compact,'false');action.destroy();
});

test('the current host can be replaced without replacing the dialog origin button or losing its keyboard focus',()=>{
  const h=harness();h.target();const action=h.mount(),origin=h.button;origin.focus();h.removeTarget();const next=h.target();h.mutate();
  assert.equal(h.entry.parentElement,next);assert.equal(h.button,origin);assert.equal(h.active,origin);assert.equal(h.button.focuses,2);action.destroy();
});

test('a narrow workspace uses the compact entry and insufficient room hides it without covering neighboring controls',()=>{
  const h=harness(260),tools=h.target(),action=h.mount();assert.equal(h.entry.hidden,false);assert.equal(h.entry.dataset.compact,'true');
  h.button.focus();h.resize(220);assert.equal(h.entry.hidden,true);assert.equal(h.active,tools.children.find(child=>child!==h.entry));
  h.resize(440);assert.equal(h.entry.hidden,false);assert.equal(h.entry.dataset.compact,'false');action.destroy();
});

test('an auto-sized floating host includes the entry before measuring its available room',()=>{
  const h=harness(),tools=h.target(0,true),action=h.mount();assert.equal(h.entry.parentElement,tools);assert.equal(h.entry.hidden,false);assert.equal(h.entry.dataset.compact,'false');
  h.removeTarget();const replacement=h.target(0,true);h.mutate();assert.equal(h.entry.parentElement,replacement);assert.equal(h.entry.hidden,false);action.destroy();
});

test('mobile and hidden focus-view containers expose no status tab stop, then desktop can restore the entry',()=>{
  const h=harness(440,760),tools=h.target(),action=h.mount();assert.equal(h.entry.hidden,true);
  h.resize(440,1440);assert.equal(h.entry.hidden,false);h.button.focus();tools.hidden=true;h.mutate();assert.equal(h.entry.hidden,true);assert.equal(h.active,h.stage);
  tools.hidden=false;h.mutate();assert.equal(h.entry.hidden,false);action.destroy();
});

test('hiding a cramped entry does not take focus from a control outside it, including an open connection dialog',()=>{
  const h=harness(),tools=h.target(),action=h.mount();h.button.focus();const dialogControl=h.outsideControl();dialogControl.focus();h.resize(220);assert.equal(h.entry.hidden,true);assert.equal(h.active,dialogControl);
  tools.children.find(child=>child.name==='present-button')!.width=1000;h.resize(440);assert.equal(h.entry.hidden,true);assert.equal(h.active,dialogControl);action.destroy();
});

test('a missing host releases entry focus and disposal cancels pending recovery rather than resurrecting the portal',()=>{
  const h=harness();h.target();const action=h.mount();h.button.focus();h.removeTarget();h.mutate();assert.equal(h.entry.hidden,true);assert.equal(h.active,h.stage);
  h.target();h.mutate();assert.equal(h.entry.hidden,false);action.destroy();h.target();h.mutate();h.resize(440);assert.equal(h.entry.parentElement,null);assert.equal(h.frames,0);
});
