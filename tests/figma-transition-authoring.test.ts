import test from 'node:test';
import assert from 'node:assert/strict';
import {blankSlide,newDeck,element} from '../src/core/model';
import {applyOperations} from '../src/core/operations';
import {importSlideTransition,exportSlideTransition} from '../src/core/figma-transitions';
import {FIGMA_TRANSITION_FAMILIES,FIGMA_TRANSITION_DIRECTIONS,FIGMA_TRANSITION_CURVES,editNativeTransition,figmaTransitionFamily,figmaTransitionDirection,smartTransitionContext} from '../src/core/figma-transition-authoring';
import {nativeSpringDuration} from '../src/core/figma-motion-timing';
import {resolvePageTransition,transitionFrames} from '../src/core/transitions';

test('all 23 native styles and eight curves remain lossless through actual document transactions',()=>{
 const styles=FIGMA_TRANSITION_FAMILIES.flatMap(([family])=>['NONE','SMART_ANIMATE','DISSOLVE'].includes(family)?[family]:FIGMA_TRANSITION_DIRECTIONS.map(direction=>family+'_'+direction));assert.equal(styles.length,23);
 for(const style of styles)for(const [curve] of FIGMA_TRANSITION_CURVES)for(const timing of [{type:'ON_CLICK' as const},{type:'AFTER_DELAY' as const,delay:2.25}]){
  const first=blankSlide(),last=blankSlide(),deck=newDeck('Native authoring',[first,last]);
  const transition=editNativeTransition({effect:'fade',duration:480,easing:'smooth'},{style,curve,duration:.375,timing});
  const changed=applyOperations(deck,[{op:'update_slide',slideId:first.id,patch:{transition}}]);
  const native=exportSlideTransition(changed.slides[0].transition!);assert.deepEqual(native,{style,curve,duration:style==='NONE'?0:(nativeSpringDuration(curve)??375)/1000,timing:style==='NONE'?{type:'ON_CLICK'}:timing});assert.equal(resolvePageTransition(changed.slides[0],changed.slides[1]),changed.slides[0].transition);
  const family=figmaTransitionFamily(style);if(!['NONE','SMART_ANIMATE','DISSOLVE'].includes(family)){assert.equal(family+'_'+figmaTransitionDirection(style),style);assert(transitionFrames(transition.effect,1,true,false,style).length>0);}
 }
});

test('changing native direction and family preserves curve, full duration and advance until explicitly changed',()=>{
 const initial=importSlideTransition({style:'PUSH_FROM_TOP',duration:8,curve:'BOUNCY',timing:{type:'AFTER_DELAY',delay:3.75}});
 const moved=editNativeTransition(initial,{style:'MOVE_OUT_TO_BOTTOM'});assert.deepEqual(exportSlideTransition(moved),{style:'MOVE_OUT_TO_BOTTOM',duration:8,curve:'BOUNCY',timing:{type:'AFTER_DELAY',delay:3.75}});
 const click=editNativeTransition(moved,{timing:{type:'ON_CLICK',delay:5}});assert.deepEqual(exportSlideTransition(click).timing,{type:'ON_CLICK'});
 const none=editNativeTransition(click,{style:'NONE'});assert.equal(exportSlideTransition(none).duration,0);assert.equal(exportSlideTransition(editNativeTransition(none,{style:'DISSOLVE'})).duration,nativeSpringDuration('BOUNCY')!/1000);
 assert.throws(()=>editNativeTransition(initial,{duration:NaN}),/supported/);assert.throws(()=>editNativeTransition(initial,{style:'UNKNOWN'}),/supported/);
});

test('native smart preview owns the current-to-next-visible edge; Deck preview preserves its incoming edge',()=>{
 let previous=blankSlide(),current=blankSlide(),hidden=blankSlide(),next=blankSlide();hidden.hidden=true;current.elements=[element('rect',{name:'Shared'})];next.elements=[element('rect',{name:'Shared',x:700})];
 current.transition=importSlideTransition({style:'SMART_ANIMATE',duration:1,curve:'LINEAR',timing:{type:'ON_CLICK'}});const deck=newDeck('Edges',[previous,current,hidden,next]);[previous,current,hidden,next]=deck.slides;
 assert.deepEqual(smartTransitionContext(deck,current),{outgoing:true,from:current,to:next,previewFromId:current.id});assert.equal(smartTransitionContext(deck,next).from,current);
 current.transition={effect:'smart',duration:500,easing:'smooth'};assert.deepEqual(smartTransitionContext(deck,current),{outgoing:false,from:previous,to:current,previewFromId:previous.id});
 next.transition=importSlideTransition({style:'SMART_ANIMATE',duration:1,curve:'LINEAR',timing:{type:'ON_CLICK'}});assert.equal(smartTransitionContext(deck,next).to,undefined);
});
