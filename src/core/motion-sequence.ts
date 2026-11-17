import type {ElementAnimation,Slide} from './model';

export interface ObjectMotionEntry {
  id:string;order:number;trigger:ElementAnimation['trigger'];phase:'in'|'out';legacy:boolean;
  /** Cue zero is the slide-entry track; numbered cues each require one click. */
  cue:number;start:number;end:number;withTransition:boolean;
}
export interface ObjectMotionPlan {entries:ObjectMotionEntry[];orders:number[]}

/** Pure, self-contained and serialized into the portable player. */
export function resolveObjectMotion(slide:Slide):ObjectMotionPlan {
  const active=slide.elements.map((element,index)=>({element,index})).filter(({element:e})=>!e.hidden&&e.animation&&e.animation.effect!=='none').sort((a,b)=>a.element.animation!.order-b.element.animation!.order||a.index-b.index);
  const entries:ObjectMotionEntry[]=[],orders:number[]=[],autoOrders=[...new Set(active.filter(({element:e})=>e.animation!.trigger==='auto').map(({element:e})=>e.animation!.order))];
  let previous:{cue:number;start:number;end:number;withTransition:boolean}|undefined;
  let cohort:{order:number;trigger:ElementAnimation['trigger'];cue:number;start:number;withTransition:boolean}|undefined;
  for(const {element:e} of active){
    const a=e.animation!,legacy=a.phase===undefined&&(a.trigger==='auto'||a.trigger==='click'),phase=a.phase??'in';
    if(a.trigger==='auto'){
      const start=a.delay+(legacy?Math.min(700,autoOrders.indexOf(a.order)*70):0);
      const end=start+a.duration,withTransition=Boolean(a.withTransition);
      entries.push({id:e.id,order:a.order,trigger:a.trigger,phase,legacy,cue:0,start,end,withTransition});
      previous={cue:0,start,end:previous?.cue===0&&previous.withTransition===withTransition?Math.max(previous.end,end):end,withTransition};
      cohort=undefined;
      continue;
    }
    let cue:number,start:number,withTransition=false;
    if(cohort?.order===a.order&&cohort.trigger===a.trigger){
      ({cue,start,withTransition}=cohort);
    }else if(a.trigger==='click'){
      let index=orders.indexOf(a.order);if(index<0){index=orders.length;orders.push(a.order);}
      cue=index+1;start=0;
      if(!previous||previous.cue!==cue)previous={cue,start,end:0,withTransition:false};
    }else{
      cue=previous?.cue??0;start=a.trigger==='after-previous'?previous?.end??0:previous?.start??0;
      withTransition=previous?.withTransition??Boolean(a.withTransition);
      if(!previous||a.trigger==='after-previous')previous={cue,start,end:start,withTransition};
    }
    cohort={order:a.order,trigger:a.trigger,cue,start,withTransition};
    const begin=start+a.delay,end=begin+a.duration;
    entries.push({id:e.id,order:a.order,trigger:a.trigger,phase,legacy,cue,start:begin,end,withTransition});
    previous!.start=begin;previous!.end=Math.max(previous!.end,end);
  }
  return {entries,orders};
}

/** Settled cue boundaries are used for backwards navigation and Smart Animate. */
export function objectMotionVisible(entry:ObjectMotionEntry|undefined,step:number){
  return !entry||(entry.phase==='out'?step<entry.cue:step>=entry.cue);
}

/** New authored chains must finish before an automatic slide timer can advance. */
export function objectCueDuration(slide:Slide,step:number,resolve:typeof resolveObjectMotion=resolveObjectMotion){
  return Math.max(0,...resolve(slide).entries.filter(e=>!e.legacy&&e.cue===step).map(e=>e.end));
}
