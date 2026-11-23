import type {SlideTransition} from './model';
export type NativeSlideTransition={style:string;duration:number;curve:string;timing:{type:'ON_CLICK'|'AFTER_DELAY';delay?:number}};
/** Self-contained because the downloaded player serializes this validator. */
export function nativeSlideTransition(value:SlideTransition):NativeSlideTransition|undefined{
 try{const data=JSON.parse(value.native??''),p=data.projection,n=data.transition;
  if(data.provider!=='Figma'||p.effect!==value.effect||p.duration!==value.duration||p.easing!==value.easing||!n||typeof n.style!=='string'||!(/^(NONE|DISSOLVE|SMART_ANIMATE)$/.test(n.style)||/^(SLIDE_FROM|SLIDE_OUT_TO|PUSH_FROM|MOVE_FROM|MOVE_OUT_TO)_(LEFT|RIGHT|TOP|BOTTOM)$/.test(n.style))||!Number.isFinite(n.duration)||n.duration<0||n.duration>60||!['EASE_IN','EASE_OUT','EASE_IN_AND_OUT','LINEAR','GENTLE','QUICK','BOUNCY','SLOW'].includes(n.curve)||!['ON_CLICK','AFTER_DELAY'].includes(n.timing?.type)||n.timing.delay!==undefined&&(!Number.isFinite(n.timing.delay)||n.timing.delay<0||n.timing.delay>3600))return;
  return {style:n.style,duration:n.duration,curve:n.curve,timing:{type:n.timing.type,...(n.timing.delay!==undefined?{delay:n.timing.delay}:{})}};
 }catch{return;}
}
export function importSlideTransition(config:NativeSlideTransition):SlideTransition{
 const effect:SlideTransition['effect']=config.style==='NONE'?'none':config.style==='SMART_ANIMATE'?'smart':config.style.startsWith('PUSH_')?'push':config.style.startsWith('SLIDE_')?'slide':config.style.startsWith('MOVE_')?'cover':'fade';
 const projection={effect,duration:Math.max(100,Math.min(2000,Math.round(config.duration*1000))),easing:config.curve==='LINEAR'?'linear' as const:'smooth' as const};
 const result={...projection,native:JSON.stringify({provider:'Figma',transition:config,projection})};return nativeSlideTransition(result)?result:projection;
}
export function exportSlideTransition(value:SlideTransition):NativeSlideTransition{
 return nativeSlideTransition(value)??{style:value.effect==='none'?'NONE':value.effect==='push'?'PUSH_FROM_RIGHT':value.effect==='smart'?'SMART_ANIMATE':'DISSOLVE',duration:value.effect==='none'?0:value.duration/1000,curve:value.easing==='linear'?'LINEAR':'EASE_IN_AND_OUT',timing:{type:'ON_CLICK'}};
}

/** Timing edits keep the source direction and automatic-advance settings. */
export function editFigmaTransition(value:SlideTransition,patch:Partial<SlideTransition>):SlideTransition{
 const source=nativeSlideTransition(value);
 if(!source)return {...value,...patch};
 if(patch.effect!==undefined&&patch.effect!==value.effect)return {...value,...patch,native:undefined};
 return importSlideTransition({...source,...(patch.duration!==undefined?{duration:patch.duration/1000}:{}),...(patch.easing!==undefined?{curve:patch.easing==='linear'?'LINEAR':'EASE_IN_AND_OUT'}:{})});
}

/** A single pausable countdown shared by the editor and portable player. */
export function createNativeAdvance(now=()=>performance.now(),schedule=(fn:()=>void,ms:number)=>setTimeout(fn,ms),clear=(id:ReturnType<typeof setTimeout>)=>clearTimeout(id)){
 let key:string|undefined,remaining=0,started=0,fired=false,timer:ReturnType<typeof setTimeout>|undefined;
 const stop=()=>{if(timer!==undefined){clear(timer);remaining=Math.max(0,remaining-(now()-started));timer=undefined;}};
 return {update(next:string,delay:number|undefined,held:boolean,advance:()=>void){
   stop();if(delay===undefined){key=undefined;return;}
   if(key!==next){key=next;remaining=delay*1000;fired=false;}
   if(held||fired)return;
   started=now();timer=schedule(()=>{timer=undefined;fired=true;advance();},remaining);
 },destroy(){stop();key=undefined;}};
}
