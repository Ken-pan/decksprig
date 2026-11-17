import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {nativeSpringEasing} from '../src/core/figma-spring';
import {createPageTransition,transitionFrames,TRANSITION_EASINGS} from '../src/core/transitions';
import {importSlideTransition,nativeSlideTransition,exportSlideTransition} from '../src/core/figma-transitions';

test('native spring playback retains measured rebound and portable curves are self-contained',()=>{
 const portable=runInNewContext(`(${nativeSpringEasing.toString()})`,{__name:(fn:Function)=>fn}) as typeof nativeSpringEasing;
 for(const [curve,minPeak,maxPeak]of [['GENTLE',1.025,1.032],['QUICK',1.10,1.12],['BOUNCY',1.35,1.38],['SLOW',1,1]]as const){
  const easing=portable(curve);assert.equal(easing,nativeSpringEasing(curve));assert.match(easing!,/^linear\(/);
  const values=easing!.slice(7,-1).split(',').map(Number);assert.equal(values[0],0);assert.equal(values.at(-1),1);assert(values.every(Number.isFinite));assert(Math.max(...values)>=minPeak&&Math.max(...values)<=maxPeak);
  if(curve==='SLOW')assert(values.every((v,i)=>!i||v>=values[i-1]));
 }
 assert.equal(portable('EASE_OUT'),undefined);assert.equal(portable('__proto__'),undefined);
});

test('native spring applies to both page surfaces, keeps source timing and remains pausable',()=>{
 const calls:KeyframeAnimationOptions[]=[],controls:{playState:string;pause:()=>void;play:()=>void}[]=[];
 const node=()=>({style:{zIndex:''},animate:(_frames:Keyframe[],options:KeyframeAnimationOptions)=>{calls.push(options);const animation={finished:new Promise(()=>{}),playState:'running',cancel(){this.playState='idle';},pause(){this.playState='paused';},play(){this.playState='running';}};controls.push(animation);return animation;}}as unknown as HTMLElement);
 const native={style:'PUSH_FROM_RIGHT',duration:8,curve:'BOUNCY',timing:{type:'AFTER_DELAY' as const,delay:2.25}},transition=importSlideTransition(native),run=createPageTransition(transitionFrames,TRANSITION_EASINGS,undefined,nativeSlideTransition,nativeSpringEasing)(node(),node(),transition,1,{paused:true});
 assert.equal(calls.length,2);assert(calls.every(c=>c.easing===nativeSpringEasing('BOUNCY')&&c.duration===8000));assert(controls.every(a=>a.playState==='paused'));assert.deepEqual(exportSlideTransition(transition),native);run.setPaused(false);assert(controls.every(a=>a.playState==='running'));run.cancel();assert(controls.every(a=>a.playState==='idle'));
 calls.length=0;createPageTransition(transitionFrames,TRANSITION_EASINGS,undefined,nativeSlideTransition,nativeSpringEasing)(node(),node(),transition,1,{reduced:true});assert.equal(calls.length,0);
});

test('a browser without CSS linear easing retains working ordinary easing playback',()=>{
 const factory=runInNewContext(`(${createPageTransition.toString()})`,{CSS:{supports:()=>false},__name:(fn:Function)=>fn}) as typeof createPageTransition;
 const recorded:KeyframeAnimationOptions[]=[],target={style:{zIndex:''},animate:(_frames:Keyframe[],options:KeyframeAnimationOptions)=>{recorded.push(options);return {finished:Promise.resolve(),playState:'running',cancel(){},pause(){},play(){}};}}as unknown as HTMLElement;
 const transition=importSlideTransition({style:'PUSH_FROM_RIGHT',duration:.9582165479660034,curve:'BOUNCY',timing:{type:'ON_CLICK'}}),run=factory(transitionFrames,TRANSITION_EASINGS,undefined,nativeSlideTransition,nativeSpringEasing)(target,target,transition,1);
 assert.equal(recorded.length,2);assert(recorded.every(v=>v.easing===TRANSITION_EASINGS.smooth&&v.duration===958.2165479660034));run.cancel();
});
