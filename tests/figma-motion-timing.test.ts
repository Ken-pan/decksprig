import test from 'node:test';import assert from 'node:assert/strict';
import {nativeSpringDuration,nativeSpringDisplayDuration} from '../src/core/figma-motion-timing';
import {editNativeTransition} from '../src/core/figma-transition-authoring';
import {importSlideTransition,exportSlideTransition,nativeSlideTransition} from '../src/core/figma-transitions';
import {createPageTransition,transitionFrames,TRANSITION_EASINGS} from '../src/core/transitions';

test('native spring playback honors the full native duration instead of the inspector display value',()=>{
 const portable=Function('return ('+nativeSpringDuration.toString()+')')() as typeof nativeSpringDuration;
 for(const [curve,duration] of [['GENTLE',1022.0937728881836],['QUICK',744.255542755127],['BOUNCY',958.2165479660034],['SLOW',1250.1229047775269]] as const){
  const native={style:'PUSH_FROM_RIGHT',duration:duration/1000,curve,timing:{type:'ON_CLICK' as const}},value=importSlideTransition(native),recorded:KeyframeAnimationOptions[]=[];
  const target=()=>({style:{zIndex:''},animate:(_frames:Keyframe[],options:KeyframeAnimationOptions)=>{recorded.push(options);return {finished:Promise.resolve(),playState:'running',cancel(){},pause(){},play(){}};}} as unknown as HTMLElement);
  const player=createPageTransition(transitionFrames,TRANSITION_EASINGS,undefined,nativeSlideTransition),run=player(target(),target(),value,1);
  assert.equal(recorded.length,2);assert(recorded.every(options=>options.duration===duration));assert.deepEqual(exportSlideTransition(value),native);assert.equal(portable(curve),duration);assert.notEqual(duration,nativeSpringDisplayDuration(curve));run.cancel();
 }
 assert.equal(portable('__proto__'),undefined);assert.equal(portable('EASE_OUT'),undefined);
});
test('an explicitly imported duration is not silently replaced by a preset or inspector default',()=>{
 const transition=importSlideTransition({style:'PUSH_FROM_RIGHT',duration:8,curve:'GENTLE',timing:{type:'ON_CLICK'}}),durations:number[]=[];
 const node={style:{zIndex:''},animate:(_frames:Keyframe[],options:KeyframeAnimationOptions)=>{durations.push(Number(options.duration));return {finished:Promise.resolve(),playState:'running',cancel(){},pause(){},play(){}};}} as unknown as HTMLElement;
 const run=createPageTransition(transitionFrames,TRANSITION_EASINGS,undefined,nativeSlideTransition)(node,node,transition,1);assert.deepEqual(durations,[8000,8000]);run.cancel();
});
test('native curve selection uses its automatic duration and resets to 300ms when returning to easing',()=>{
 const source=importSlideTransition({style:'PUSH_FROM_LEFT',duration:8,curve:'LINEAR',timing:{type:'AFTER_DELAY',delay:2.25}});
 const spring=editNativeTransition(source,{curve:'QUICK'});assert.equal(exportSlideTransition(spring).duration,744.255542755127/1000);assert.deepEqual(exportSlideTransition(spring).timing,{type:'AFTER_DELAY',delay:2.25});
 assert.equal(exportSlideTransition(editNativeTransition(spring,{duration:5})).duration,744.255542755127/1000);
 assert.equal(exportSlideTransition(editNativeTransition(spring,{curve:'LINEAR'})).duration,.3);
 assert.equal(exportSlideTransition(editNativeTransition(source,{duration:5})).duration,5);
 assert.equal(exportSlideTransition(editNativeTransition(spring,{style:'NONE'})).duration,0);
});
