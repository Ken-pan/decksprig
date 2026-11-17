import {playElement} from './motion';
import {resolveObjectMotion,type ObjectMotionEntry} from './motion-sequence';
import type {MotionPlayback} from './motion-playback';
import type {Slide} from './model';

export type CanvasMotionPlayback=Omit<MotionPlayback,'orders'|'offset'|'entry'>&{slide:Slide;elementId:string};
const plans=new WeakMap<Slide,{orders:number[];entries:Map<string,ObjectMotionEntry>}>();
export function playCanvasElement(node:HTMLElement,initial:CanvasMotionPlayback){
 const parameters=(p:CanvasMotionPlayback):MotionPlayback=>{
  let plan=plans.get(p.slide);if(!plan){const value=resolveObjectMotion(p.slide);plan={orders:value.orders,entries:new Map(value.entries.map(e=>[e.id,e]))};plans.set(p.slide,plan);}
  const entry=plan.entries.get(p.elementId);
  return {...p,entry,orders:plan.orders,offset:entry?.legacy&&entry.trigger==='auto'?entry.start-(p.animation?.delay??0):0};
 };
 const control=playElement(node,parameters(initial));
 return {update:(p:CanvasMotionPlayback)=>control.update(parameters(p)),destroy:control.destroy};
}
