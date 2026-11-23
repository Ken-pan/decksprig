import type {ElementAnimation} from './model';
import type {ObjectMotionEntry} from './motion-sequence';

export type MotionPlayback={animation?:ElementAnimation;entry?:ObjectMotionEntry;step:number;orders:number[];enabled:boolean;reduced:boolean;paused?:boolean;entering?:boolean;restored?:boolean;shared?:boolean;replay:number;offset:number};

/** No module state: this exact factory is embedded in standalone exports. */
export function createElementPlayback(easings:Record<string,string>,frames:(effect:ElementAnimation['effect'])=>Keyframe[]){
 const easing=(a:ElementAnimation)=>a.easingBezier?`cubic-bezier(${a.easingBezier.join(',')})`:easings[a.easing];
 return function(node:HTMLElement,initial:MotionPlayback){
  let animation:Animation|undefined,last='',previousStep=initial.step,previousReplay=initial.replay,epoch=0,settled=false;
  function update(p:MotionPlayback){
    const a=p.animation,legacy=!a||a.phase===undefined&&(a.trigger==='auto'||a.trigger==='click');
    if(legacy){
      const visible=p.reduced||!p.enabled||!a||a.effect==='none'||a.trigger==='auto'||p.orders.indexOf(a.order)<p.step;
      const key=`${p.enabled}:${p.replay}:${visible}:${p.offset}:${JSON.stringify(a)}`,changed=key!==last;last=key;previousStep=p.step;previousReplay=p.replay;
      node.style.visibility=visible?'':'hidden';
      node.inert=!visible||Boolean(p.entering&&p.enabled&&!p.reduced&&!p.restored&&!p.shared&&a&&a.effect!=='none');
      if(changed||p.reduced||p.restored||p.shared){epoch++;animation?.cancel();animation=undefined;}
      if(changed&&visible&&p.enabled&&!p.reduced&&!p.restored&&!p.shared&&a&&a.effect!=='none')animation=node.animate(frames(a.effect),{duration:a.duration,delay:a.delay+(a.trigger==='auto'?p.offset:0),easing:easing(a),fill:'backwards'});
      if(animation&&animation.playState!=='finished'){if(p.paused||p.entering&&!a?.withTransition)animation.pause();else if(animation.playState==='paused')animation.play();}
      return;
    }
    const entry=p.entry??{phase:a.phase??'in',cue:a.trigger==='click'?p.orders.indexOf(a.order)+1:0,start:a.delay,withTransition:Boolean(a.withTransition)};
    const active=p.step>=entry.cue,backwards=p.replay===previousReplay&&p.step<previousStep;previousStep=p.step;previousReplay=p.replay;
    const sharedEntrance=Boolean(p.shared&&entry.phase==='in'&&entry.cue===0);
    const key=`${p.enabled}:${p.replay}:${p.step}:${JSON.stringify(a)}:${entry.cue}:${entry.start}`,changed=key!==last;last=key;
    if(changed){epoch++;animation?.cancel();animation=undefined;settled=false;}
    const finalVisible=entry.phase==='out'?!active:active;
    const restore=Boolean(p.restored||sharedEntrance||backwards||p.step>entry.cue||p.reduced||!p.enabled||a.effect==='none');
    if(restore){epoch++;animation?.cancel();animation=undefined;settled=true;node.style.visibility=!p.enabled||a.effect==='none'||finalVisible?'':'hidden';node.inert=p.enabled&&a.effect!=='none'&&!finalVisible;return;}
    if(!active){node.style.visibility=entry.phase==='out'?'':'hidden';node.inert=entry.phase==='in'||Boolean(p.entering);return;}
    if(changed&&!settled){
      const id=++epoch,sequence=frames(a.effect);if(entry.phase==='out')sequence.reverse();
      node.style.visibility='';node.inert=entry.phase==='in'||Boolean(p.entering);
      try{
        animation=node.animate(sequence,{duration:a.duration,delay:entry.start,easing:easing(a),fill:entry.phase==='out'?'both':'backwards'});
        animation.onfinish=()=>{if(id!==epoch)return;settled=true;node.style.visibility=finalVisible?'':'hidden';node.inert=!finalVisible;};
      }catch{settled=true;node.style.visibility=finalVisible?'':'hidden';node.inert=!finalVisible;}
    }
    if(settled){node.style.visibility=finalVisible?'':'hidden';node.inert=!finalVisible;}
    if(animation&&animation.playState!=='finished'){if(p.paused||p.entering&&!entry.withTransition)animation.pause();else if(animation.playState==='paused')animation.play();}
  }
  update(initial);
  return {update,destroy:()=>{epoch++;animation?.cancel();}};
 };
}
