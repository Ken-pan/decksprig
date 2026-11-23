import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import {runInNewContext} from 'node:vm';
import type {ViewportOptions} from '../src/canvas-viewport-controller';

const code=buildSync({entryPoints:['src/canvas-viewport-controller.ts'],bundle:true,format:'cjs',platform:'node',external:['svelte'],write:false}).outputFiles[0].text;
function harness(){
  class ElementNode{
    listeners=new Map<string,Set<(event:any)=>void>>();attributes=new Set<string>();style={setProperty(){},removeProperty(){}};kind='canvas';isConnected=true;clientWidth=900;clientHeight=600;clientLeft=0;clientTop=0;scrollLeft=0;scrollTop=0;offsetLeft=0;offsetTop=0;offsetWidth=900;offsetHeight=540;
    closest(selector:string):any{if(selector==='.editor-app')return scope;if(this.kind==='canvas'||this.kind==='object')return null;return selector.includes(this.kind==='editable'?'[contenteditable="true"]':this.kind==='popover'?'[popover]':this.kind==='prototype'?'.prototype-shell':this.kind)?this:null;}
    querySelector(selector:string):any{return selector==='.stage-canvas'?art:null;}
    querySelectorAll(){return selected;}
    addEventListener(type:string,listener:(event:any)=>void){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type)!.add(listener);}
    removeEventListener(type:string,listener:(event:any)=>void){this.listeners.get(type)?.delete(listener);}
    getClientRects(){return [{}];}contains(target:unknown){return target===this;}hasAttribute(name:string){return this.attributes.has(name);}scrollTo(left:number,top:number){this.scrollLeft=left;this.scrollTop=top;}scrollBy(){}focus(){document.activeElement=this;}
    getBoundingClientRect(){return{left:0,top:0,width:900,height:600};}
    dispatch(type:string,event:any){for(const listener of this.listeners.get(type)??[])listener(event);}
  }
  const node=new ElementNode(),scope=new ElementNode(),art=new ElementNode(),selected:{getBoundingClientRect:()=>unknown}[]=[];let surface='';const pages:number[]=[],zooms:any[]=[];let cancels=0;
  const document={body:new ElementNode(),activeElement:node,hasFocus:()=>true,querySelector(selector:string){return surface==='dialog'||surface==='popover'?{}:null;}};
  const window={addEventListener(){},removeEventListener(){}};const frames=new Map<number,()=>void>();let serial=0;
  const context={module:{exports:{}},require(name:string){if(name==='svelte')return{tick:()=>Promise.resolve()};throw Error('Unexpected dependency '+name);},document,window,Element:ElementNode,HTMLElement:ElementNode,ResizeObserver:class{observe(){}disconnect(){}},getComputedStyle:()=>({visibility:'visible'}),innerWidth:1280,innerHeight:900,requestAnimationFrame(fn:()=>void){frames.set(++serial,fn);return serial;},cancelAnimationFrame(id:number){frames.delete(id);}};
  runInNewContext(code,context);const api=context.module.exports as {canvasViewport:(node:unknown,options:ViewportOptions)=>{update:(next:ViewportOptions)=>void;destroy:()=>void}};
  let options:ViewportOptions={scale:1,fit:true,key:'document',slideKey:'one',pageBlocked:false,page:direction=>pages.push(direction),zoom:value=>zooms.push(value),cancel:()=>cancels++};
  const action=api.canvasViewport(node,options);
  function target(kind:string){const e=new ElementNode();e.kind=kind;return e;}
  function key(key:string,patch:Record<string,unknown>={}){const event:any={key,target:node,defaultPrevented:false,isComposing:false,keyCode:0,altKey:false,ctrlKey:false,metaKey:false,shiftKey:false,repeat:false,prevented:0,stopped:0,preventDefault(){this.defaultPrevented=true;this.prevented++;},stopPropagation(){this.stopped++;},...patch};node.dispatch('keydown',event);return event;}
  return{node,document,action,pages,zooms,target,key,select:(boxes:{left:number;top:number;width:number;height:number}[])=>{selected.splice(0,selected.length,...boxes.map(b=>({getBoundingClientRect:()=>({...b,right:b.left+b.width,bottom:b.top+b.height})})));},frames:()=>{for(const [id,fn]of frames){frames.delete(id);fn();}},get cancels(){return cancels;},surface:(next:string)=>surface=next,update(patch:Partial<ViewportOptions>){options={...options,...patch};action.update(options);},pointer(type:string){node.dispatch(type,{button:0,isPrimary:true,pointerId:1,target:node});}};
}

test('PageDown and PageUp repeatedly navigate a focused canvas or selected object at any zoom without zooming or nudging',()=>{
  const h=harness();try{
    const first=h.key('PageDown'),second=h.key('PageUp',{target:h.target('object')}),repeat=h.key('PageDown',{repeat:true});
    h.update({fit:false,scale:2});const manual=h.key('PageUp');
    assert.deepEqual(h.pages,[1,-1,1,-1]);assert.deepEqual(h.zooms,[]);assert.equal(h.cancels,5); // the zoom change cancels its old viewport gesture once
    for(const event of[first,second,repeat,manual]){assert.equal(event.prevented,1);assert.equal(event.stopped,1);}
  }finally{h.action.destroy();}
});

test('editing, insertion/proposal blockers, focused controls, popup scopes, composition and modifiers retain their own keys',()=>{
  const h=harness();try{
    h.update({pageBlocked:true});assert.equal(h.key('PageDown').prevented,0);h.update({pageBlocked:false});
    for(const kind of ['button','a','input','textarea','select','editable','popover','prototype'])assert.equal(h.key('PageDown',{target:h.target(kind)}).prevented,0);
    for(const kind of ['input','textarea','editable']){h.document.activeElement=h.target(kind);assert.equal(h.key('PageDown').prevented,0);}h.document.activeElement=h.node;
    for(const value of ['dialog','popover']){h.surface(value);assert.equal(h.key('PageUp').prevented,0);}h.surface('');
    for(const patch of [{defaultPrevented:true},{isComposing:true},{keyCode:229},{altKey:true},{ctrlKey:true},{metaKey:true},{shiftKey:true}])assert.equal(h.key('PageDown',patch).prevented,0);
    assert.deepEqual(h.pages,[]);assert.deepEqual(h.zooms,[]);assert.equal(h.cancels,0);
    h.surface('tooltip');assert.equal(h.key('PageDown').prevented,1);assert.deepEqual(h.pages,[1]);
  }finally{h.action.destroy();}
});

test('active object pointers and touch navigation block page keys until their real end or cancel',()=>{
  const h=harness();try{
    h.pointer('pointerdown');assert.equal(h.key('PageDown').prevented,0);h.pointer('pointerup');h.key('PageDown');
    h.pointer('pointerdown');assert.equal(h.key('PageUp').prevented,0);h.pointer('pointercancel');h.key('PageUp');
    h.node.attributes.add('data-touch-navigating');assert.equal(h.key('PageDown').prevented,0);h.node.attributes.delete('data-touch-navigating');h.key('PageDown');
    assert.deepEqual(h.pages,[1,-1,1]);assert.equal(h.cancels,3);
  }finally{h.action.destroy();}
});

test('existing modified zoom shortcuts remain intact and disposal removes page handling',()=>{
  const h=harness();h.key('+',{ctrlKey:true});h.key('0',{metaKey:true});h.key('+');h.key('PageUp',{ctrlKey:true});assert.deepEqual(h.zooms,[1.1,'fit']);assert.deepEqual(h.pages,[]);
  h.action.destroy();assert.equal(h.key('PageDown').prevented,0);assert.deepEqual(h.pages,[]);
});


test('desktop selection zoom centers rendered bounds and keeps locked or rotated inspection outside document transactions',()=>{
  const h=harness();try{
    h.select([{left:100,top:200,width:50,height:100},{left:250,top:200,width:50,height:100}]);
    const event=h.key('@',{shiftKey:true,code:'Digit2'});
    assert.equal(event.prevented,1);assert.equal(h.zooms[0],3.7);assert.equal(h.document.activeElement,h.node);
    h.update({fit:false,scale:3.7});h.frames();assert.equal(h.node.scrollLeft,290);assert.equal(h.node.scrollTop,625);
    h.key('!',{shiftKey:true,code:'Digit1'});assert.equal(h.zooms.at(-1),'fit');assert.deepEqual(h.pages,[]);
  }finally{h.action.destroy();}
});

test('selection view shortcuts leave no selection, drafts, pointers, controls and composition alone',()=>{
  const h=harness();try{
    const key=(patch:Record<string,unknown>={})=>h.key('@',{shiftKey:true,code:'Digit2',...patch});
    assert.equal(key().prevented,0);h.select([{left:40,top:40,width:20,height:20}]);
    for(const kind of ['button','input','textarea','editable','popover','prototype'])assert.equal(key({target:h.target(kind)}).prevented,0);
    for(const patch of [{isComposing:true},{keyCode:229},{altKey:true},{ctrlKey:true},{metaKey:true}])assert.equal(key(patch).prevented,0);
    h.update({pageBlocked:true});assert.equal(key().prevented,0);assert.equal(h.key('!',{shiftKey:true,code:'Digit1'}).prevented,0);h.update({pageBlocked:false});
    h.pointer('pointerdown');assert.equal(key().prevented,0);h.pointer('pointercancel');h.surface('dialog');assert.equal(key().prevented,0);h.surface('popover');assert.equal(key().prevented,0);
    assert.deepEqual(h.zooms,[]);
  }finally{h.action.destroy();}
});
