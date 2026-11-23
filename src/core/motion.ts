import type { Slide, SlideTransition, ElementAnimation } from './model';
import type { Operation } from './operations';
import type { Deck } from './model';
import {resolveObjectMotion} from './motion-sequence';
import {createElementPlayback} from './motion-playback';
export {resolveObjectMotion,objectMotionVisible,objectCueDuration} from './motion-sequence';
export {createElementPlayback} from './motion-playback';
export type {MotionPlayback} from './motion-playback';

export const ANIMATIONS = [['none', 'None'], ['fade', 'Fade in'], ['rise', 'Rise'], ['slide', 'Slide in'], ['zoom', 'Zoom'], ['reveal', 'Reveal']] as const;
export const EASINGS = {smooth:'cubic-bezier(.22,1,.36,1)',snappy:'cubic-bezier(.2,.8,.2,1)',linear:'linear',cinematic:'cubic-bezier(.65,0,.35,1)'};
export const defaultTransition: SlideTransition = {effect: 'fade', duration: 480, easing: 'smooth'};
export const defaultAnimation: ElementAnimation = {effect: 'none', duration: 500, delay: 0, trigger: 'auto', order: 0, easing: 'smooth'};
export const MOTION_RECIPES = [['quiet','Calm narrative'],['story','Step by step'],['focus','Showcase']] as const;
export type MotionRecipe = typeof MOTION_RECIPES[number][0];
export function clickOrders(slide: Slide) {
  return resolveObjectMotion(slide).orders;
}
/** One offset per authored cue keeps a mount, illustration and copy in sync. */
export function autoEntranceOrders(slide:Slide) {
  return [...new Set(slide.elements.filter(e=>!e.hidden&&e.animation?.trigger==='auto'&&e.animation.effect!=='none').map(e=>e.animation!.order))].sort((a,b)=>a-b);
}
export function entranceFrames(effect: ElementAnimation['effect']): Keyframe[] {
  const start: Keyframe = effect === 'rise' ? {opacity: 0, transform: 'translateY(32px)'} : effect === 'slide' ? {opacity: 0, transform: 'translateX(48px)'} : effect === 'zoom' ? {opacity: 0, transform: 'scale(.94)'} : effect === 'reveal' ? {opacity: 0, clipPath: 'inset(0 100% 0 0)'} : {opacity: 0};
  return [start, {opacity: 1, transform: 'none', clipPath: 'inset(0 0 0 0)'}];
}
export function navigateCue(index: number, step: number, direction: number, counts: number[]) {
  if (direction > 0) return step < counts[index] ? {index, step: step + 1} : index < counts.length - 1 ? {index: index + 1, step: 0} : {index, step};
  return step > 0 ? {index, step: step - 1} : index > 0 ? {index: index - 1, step: counts[index - 1]} : {index, step};
}
export function suggestEntrances(deck: Pick<Deck, 'width' | 'height'>, slide: Slide, recipe: MotionRecipe = 'quiet', sharedIds: string[] = []): Operation[] {
  const start = Math.min(3000, Math.max(-1, ...slide.elements.map(e => e.animation?.order ?? -1)) + 1);
  const rank=(e:Slide['elements'][number])=>e.type==='text'?e.fontSize>=deck.height*.065?0:1:['image','table','chart'].includes(e.type)?2:3;
  return slide.elements.filter(e => !e.hidden && !e.locked && !e.animation && !sharedIds.includes(e.id) && !['line','prototype'].includes(e.type) && !(e.type === 'rect' && e.w * e.h >= deck.width * deck.height * .7) && !(e.type === 'text' && e.fontSize <= 22 * Math.min(deck.width / 1440, deck.height / 810) && (e.y + e.h <= deck.height * .12 || e.y >= deck.height * .82))).sort((a,b)=>rank(a)-rank(b)||a.y-b.y||a.x-b.x).slice(0,8).map((e,i)=>({op:'update_element',slideId:slide.id,elementId:e.id,patch:{animation:{...defaultAnimation,effect:e.type==='text'||recipe==='quiet'?'fade':recipe==='focus'?'zoom':'rise',duration:e.type==='text'?recipe==='focus'?300:360:recipe==='quiet'?420:480,order:Math.min(3000,start+i)}}}));
}
export const playElement = /* @__PURE__ */ createElementPlayback(EASINGS, entranceFrames);
