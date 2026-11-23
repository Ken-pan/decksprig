import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';
import {AnimationSchema,blankSlide,element,newDeck,validateDeck,type ElementAnimation} from '../src/core/model';
import {applyOperations} from '../src/core/operations';
import {createElementPlayback,EASINGS,entranceFrames,defaultAnimation} from '../src/core/motion';
import {motionPropertyState} from '../src/core/motion-properties';
import {moveObjectMotionGroup} from '../src/core/motion-authoring';
import {projectFigmaChanges} from '../src/core/figma-sync';
import {recoverFigmaDeck} from '../src/core/figma-sync-recovery';
import {encodeDeckObjectMotion,decodeDeckObjectMotion} from '../src/core/figma-object-motion';

const curve:[number,number,number,number]=[.17,0,.2,1];
const custom=(patch:Partial<ElementAnimation>={}):ElementAnimation=>({...defaultAnimation,phase:'out',effect:'slide',duration:600,trigger:'click',easingBezier:[...curve],...patch});
function target(){
 const calls:{frames:Keyframe[];options:KeyframeAnimationOptions;playState:string;onfinish?:()=>void}[]=[];
 const node={style:{visibility:''},inert:false,animate(frames:Keyframe[],options:KeyframeAnimationOptions){
  const run={frames,options,playState:'running',onfinish:undefined as (()=>void)|undefined,pause(){this.playState='paused';},play(){this.playState='running';},cancel(){this.playState='idle';}};
  calls.push(run);return run;
 }} as unknown as HTMLElement;
 return {node,calls};
}

test('custom object easing is exact, optional and rejects invalid CSS control points atomically',()=>{
 const a=custom(),s=blankSlide();s.elements=[element('rect',{animation:a})];const deck=newDeck('Exact cubic',[s]),before=JSON.stringify(deck);
 assert.deepEqual(validateDeck(JSON.parse(before)).slides[0].elements[0].animation,a);
 assert.deepEqual(AnimationSchema.parse(custom({easingBezier:[0,-.5,1,1.75]})).easingBezier,[0,-.5,1,1.75]);
 assert(!Object.hasOwn(AnimationSchema.parse(defaultAnimation),'easingBezier'));
 for(const value of [[.17,0,.2],[.17,0,.2,1,0],[-.01,0,.2,1],[.17,0,1.01,1],[NaN,0,.2,1],[.17,Infinity,.2,1],[.17,0,.2,-Infinity],['.17',0,.2,1]]){
  assert.equal(AnimationSchema.safeParse({...a,easingBezier:value}).success,false);
  assert.throws(()=>applyOperations(deck,[{op:'update_element',slideId:s.id,elementId:s.elements[0].id,patch:{animation:{...a,easingBezier:value as any}}}]));
  assert.equal(JSON.stringify(deck),before);
 }
});

test('legacy, In and Out playback use the exact cubic instead of the fallback preset',()=>{
 for(const phase of [undefined,'in','out'] as const){
  const a=custom({phase}),{node,calls}=target(),p={animation:a,orders:[0],step:0,enabled:true,reduced:false,replay:0,offset:0};
  const control=createElementPlayback(EASINGS,entranceFrames)(node,p);control.update({...p,step:1,paused:true});
  assert.equal(calls.length,1);assert.equal(calls[0].options.easing,'cubic-bezier(0.17,0,0.2,1)');assert.notEqual(calls[0].options.easing,EASINGS.smooth);
  assert.equal(calls[0].options.duration,600);assert.equal(calls[0].playState,'paused');control.update({...p,step:1});assert.equal(calls[0].playState,'running');
  if(phase==='out'){assert.equal(calls[0].frames[0].opacity,1);assert.equal(calls[0].frames[1].opacity,0);calls[0].onfinish?.();assert.equal(node.style.visibility,'hidden');}
  control.destroy();
 }
 const {node,calls}=target();createElementPlayback(EASINGS,entranceFrames)(node,{animation:custom(),orders:[0],step:1,enabled:true,reduced:true,replay:0,offset:0});assert.equal(calls.length,0);assert.equal(node.style.visibility,'hidden');
});

test('production-compiled portable HTML serializes a self-contained exact cubic playback factory',()=>{
 const result=buildSync({entryPoints:[fileURLToPath(new URL('../src/core/html-player.ts',import.meta.url))],bundle:true,write:false,format:'iife',globalName:'PortableHtml',platform:'browser',target:'es2022',minify:true,keepNames:false}),context:any={};
 runInNewContext(result.outputFiles[0].text,context);const script=context.PortableHtml.htmlPlayerScript();
 const marker=')(deck,original,wrap,slide,node,',start=script.lastIndexOf(marker);assert(start>=0);
 const runtime=runInNewContext(`(${script.slice(start+marker.length,-2)})`),{node,calls}=target();
 runtime.player(runtime.easings,runtime.entrance)(node,{animation:custom({easingBezier:[.15,-.25,.8,1.3]}),orders:[0],step:1,enabled:true,reduced:false,replay:0,offset:0});
 assert.equal(calls.length,1);assert.equal(calls[0].options.easing,'cubic-bezier(0.15,-0.25,0.8,1.3)');
});

test('mixed curve selection compares control-point values, and an explicit preset change releases the curve',()=>{
 const first=element('rect',{animation:custom()}),second=element('rect',{animation:custom()}),different=element('rect',{animation:custom({easingBezier:[.17,0,.21,1]})}),preset=element('rect',{animation:{...defaultAnimation}});
 assert.equal(motionPropertyState([first,second],'easingBezier').mixed,false);
 assert.equal(motionPropertyState([first,different],'easingBezier').mixed,true);
 assert.equal(motionPropertyState([first,preset],'easingBezier').mixed,true);
 const s=blankSlide();s.elements=[first];const deck=newDeck('Preset replaces custom',[s]),changed=applyOperations(deck,[{op:'update_element',slideId:s.id,elementId:first.id,patch:{animation:{...first.animation!,easing:'linear',easingBezier:undefined}}}]);
 const {node,calls}=target();createElementPlayback(EASINGS,entranceFrames)(node,{animation:changed.slides[0].elements[0].animation,orders:[0],step:1,enabled:true,reduced:false,replay:0,offset:0});assert.equal(calls[0].options.easing,'linear');assert.deepEqual(first.animation!.easingBezier,curve);
});

test('timing edits, cue reordering, metadata and recovery preserve custom control points without approximation',()=>{
 const s=blankSlide();s.id='linked-slide';s.source={provider:'Figma',nodeId:'2:1',fidelity:'converted',warnings:[]};
 s.elements=[element('rect',{id:'first',sourceId:'2:2',animation:custom()}),element('rect',{id:'second',sourceId:'2:3',animation:custom({order:1})})];
 const deck=newDeck('Curve recovery',[s]);deck.provenance={provider:'Figma',url:'https://www.figma.com/slides/cubic-file',importedAt:'2026-10-25T00:00:00.000Z'};
 const reordered=applyOperations(deck,moveObjectMotionGroup(s,1,1)),a=reordered.slides[0].elements[0].animation!;assert.deepEqual(a.easingBezier,curve);
 const local=applyOperations(reordered,[{op:'update_element',slideId:s.id,elementId:'first',patch:{animation:{...a,duration:725,delay:20}}}]);
 const checkpoint={deck:structuredClone(deck),native:structuredClone(deck)},remote=structuredClone(deck);remote.slides[0].elements[0].x+=32;
 const projected=projectFigmaChanges(local,checkpoint.native,remote),recovered=recoverFigmaDeck(checkpoint,local,remote,['2:1']);
 assert.deepEqual(projected.slides[0].elements[0].animation!.easingBezier,curve);assert.deepEqual(recovered.conflicts,[]);assert.deepEqual(recovered.deck!.slides[0].elements[0].animation,local.slides[0].elements[0].animation);
 const payload={animation:local.slides[0].elements[0].animation},raw=encodeDeckObjectMotion(payload);assert.deepEqual(decodeDeckObjectMotion(raw).data,payload);
 assert.equal(decodeDeckObjectMotion(JSON.stringify({version:1,source:'deck-studio',animation:{...custom(),easingBezier:[2,0,.2,1]}})).data,undefined);
});
