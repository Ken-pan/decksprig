import type {SlideTransition,Slide,Deck} from './model';
import {nativeSlideTransition,exportSlideTransition,importSlideTransition,type NativeSlideTransition} from './figma-transitions';
import {nativeSpringDuration} from './figma-motion-timing';

export const FIGMA_TRANSITION_FAMILIES=[['NONE','None'],['SMART_ANIMATE','Smart animate'],['DISSOLVE','Dissolve'],['PUSH_FROM','Push'],['SLIDE_FROM','Slide in'],['SLIDE_OUT_TO','Slide out'],['MOVE_FROM','Move in'],['MOVE_OUT_TO','Move out']] as const;
export type FigmaTransitionFamily=typeof FIGMA_TRANSITION_FAMILIES[number][0];
export const FIGMA_TRANSITION_DIRECTIONS=['LEFT','RIGHT','TOP','BOTTOM'] as const;
export type FigmaTransitionDirection=typeof FIGMA_TRANSITION_DIRECTIONS[number];
export const FIGMA_TRANSITION_CURVES=[['LINEAR','Linear'],['EASE_IN','Ease in'],['EASE_OUT','Ease out'],['EASE_IN_AND_OUT','Ease in and out'],['GENTLE','Gentle'],['QUICK','Quick'],['BOUNCY','Bouncy'],['SLOW','Slow']] as const;

export function figmaTransitionFamily(style:string):FigmaTransitionFamily{
 return FIGMA_TRANSITION_FAMILIES.find(([family])=>style===family||style.startsWith(family+'_'))?.[0]??'DISSOLVE';
}
export function figmaTransitionDirection(style:string):FigmaTransitionDirection{
 return FIGMA_TRANSITION_DIRECTIONS.find(direction=>style.endsWith('_'+direction))??'RIGHT';
}
export function editNativeTransition(value:SlideTransition,patch:Partial<NativeSlideTransition>):SlideTransition{
 const source=nativeSlideTransition(value)??exportSlideTransition(value),next={...source,...patch};
 if(patch.duration!==undefined&&!Number.isFinite(patch.duration))throw new Error('Choose a supported Figma slide transition.');
 const spring=nativeSpringDuration(next.curve),previousSpring=nativeSpringDuration(source.curve);
 if(spring!==undefined&&(patch.curve!==undefined||patch.duration!==undefined))next.duration=spring/1000;
 else if(patch.curve!==undefined&&previousSpring!==undefined&&patch.duration===undefined)next.duration=.3;
 if(patch.style!==undefined){if(patch.style==='NONE')next.duration=0;else if(next.duration===0)next.duration=(spring??300)/1000;}
 if(next.style==='NONE')next.duration=0;
 // Native Slides normalizes NONE to ON_CLICK, regardless of a supplied delay.
 next.timing=next.style==='NONE'||next.timing.type==='ON_CLICK'?{type:'ON_CLICK'}:{type:'AFTER_DELAY',delay:next.timing.delay??1};
 const result=importSlideTransition(next);if(!nativeSlideTransition(result))throw new Error('Choose a supported Figma slide transition.');return result;
}
/** Figma owns an outgoing edge; ordinary Deck transitions own an incoming edge. */
export function smartTransitionContext(deck:Deck,slide:Slide){
 const index=deck.slides.findIndex(s=>s.id===slide.id),outgoing=Boolean(slide.transition&&nativeSlideTransition(slide.transition));
 // Skipped pages do not become presentation destinations.
 const previous=deck.slides.slice(0,index).reverse().find(s=>!s.hidden),next=deck.slides.slice(index+1).find(s=>!s.hidden);
 return {outgoing,from:outgoing?slide:previous,to:outgoing?next:slide,previewFromId:outgoing?slide.id:previous?.id};
}
