import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';

// Exercise the existing action/focus lifecycle with a repeated element ID in
// a static thumbnail and the live canvas. Browser/AX acceptance is separate.
const code=(await build({entryPoints:['src/editor-focus.ts'],bundle:true,platform:'node',format:'iife',globalName:'FocusContract',write:false,plugins:[{name:'focus-fixture-state',setup(builder){
 builder.onResolve({filter:/^svelte$/},()=>({path:'svelte',namespace:'focus-fixture'}));
 builder.onLoad({filter:/.*/,namespace:'focus-fixture'},()=>({contents:'export const tick=()=>globalThis.flushFixture();',loader:'js'}));
 builder.onLoad({filter:/core\/editor\.svelte\.ts$/},()=>({contents:'export const editor=globalThis.fixtureEditor;',loader:'js'}));
}}],logLevel:'silent'})).outputFiles[0].text;

test('the create action focuses the committed live table after menu teardown, never its same-ID thumbnail',async()=>{
 let focused:any,flushes=0,live:any;
 class Node{
  isConnected=true;dataset:Record<string,string>;tabIndex:number;
  constructor(id:string,tabIndex=-1){this.dataset={elementId:id};this.tabIndex=tabIndex;}
  getClientRects(){return this.isConnected?[{}]:[];}
  matches(){return false;}
  closest(){return null;}
  focus(){if(this.isConnected&&this.tabIndex>=0)focused=this;}
  querySelectorAll(){return live?[live]:[];}
 }
 const stage=new Node('canvas',0),thumbnail=new Node('created-table'),invoker=new Node('old-menu-anchor',0),body=new Node('body');
 const editor={selected:['source-table']};focused=invoker;
 const document={body,activeElement:invoker,querySelector:(selector:string)=>selector==='.canvas-stage'?stage:selector.includes('data-element-id')?thumbnail:null};
 const context=vm.createContext({fixtureEditor:editor,document,HTMLElement:Node,SVGElement:class{},getComputedStyle:()=>({visibility:'visible'}),flushFixture:async()=>{
  flushes++;await Promise.resolve();
  if(flushes===1){invoker.isConnected=false;document.activeElement=body;focused=body;live=new Node('created-table',0);}
 }});
 vm.runInContext(code,context);
 await vm.runInContext('FocusContract.objectAction(()=>fixtureEditor.selected=["created-table"])',context);
 assert(flushes>=2,'selection rendering and focus resolution both settle through the existing lifecycle');
 assert.equal(focused,live);assert.notEqual(focused,thumbnail);assert.equal(focused.dataset.elementId,'created-table');
});
