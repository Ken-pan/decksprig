import {nativeSlideTransition} from './figma-transitions';
import {nativeSpringEasing} from './figma-spring';
import type { Slide, SlideTransition } from './model';
import { runSmartTransition } from './smart-motion';

export const TRANSITION_EASINGS = {smooth:'cubic-bezier(.25,.1,.25,1)',snappy:'cubic-bezier(.2,.7,.2,1)',linear:'linear',cinematic:'cubic-bezier(.32,0,.2,1)'};
import {TRANSITION_IDS,type TransitionEffect} from './transition-ids';
export {TRANSITION_IDS};
export type {TransitionEffect};
export type TransitionCategory = 'basic' | 'space' | 'cinema' | 'mask' | 'depth' | 'continuity';
export const TRANSITION_CATEGORIES = [['continuity','Continuity'],['basic','Classic'],['space','Spatial'],['cinema','Camera'],['mask','Mask'],['depth','3D']] as const;
type Preset = {id: TransitionEffect; label: string; category: TransitionCategory; description: string; duration: number; easing: 'smooth' | 'cinematic'; featured?: boolean};
const presets: Omit<Preset,'easing'>[] = [
  {id:'smart',label:'Smart animate',category:'continuity',description:'Animate matching objects across adjacent slides, including position, size, and color.',duration:650,featured:true},
  {id:'none',label:'None',category:'basic',description:'Switch instantly for direct comparisons.',duration:480},
  {id:'fade',label:'Dissolve',category:'basic',description:'Blend slides for a smooth narrative.',duration:320,featured:true},
  {id:'slide',label:'Slide in',category:'basic',description:'Bring in the next slide with a short, brisk movement.',duration:400},
  {id:'push',label:'Push',category:'basic',description:'Move both slides together to guide the reading direction.',duration:500},
  {id:'zoom',label:'Zoom',category:'basic',description:'Use a subtle zoom to focus on the next slide.',duration:450},
  {id:'wipe',label:'Wipe',category:'basic',description:'Reveal the next slide horizontally for before-and-after comparisons.',duration:550},
  {id:'lift',label:'Rise',category:'space',description:'Raise the next slide as the previous slide recedes.',duration:600},
  {id:'cover',label:'Cover',category:'space',description:'Place the next slide over the previous one like a new sheet.',duration:600},
  {id:'parallax',label:'Parallax',category:'space',description:'Move slides at different speeds to create depth.',duration:650,featured:true},
  {id:'diagonal-slide',label:'Diagonal drift',category:'space',description:'Shift diagonally to mark a change of section.',duration:600},
  {id:'zoom-through',label:'Camera push',category:'cinema',description:'Move into the content, then settle on the next slide.',duration:650,featured:true},
  {id:'pullback',label:'Pull back',category:'cinema',description:'Pull away before bringing the next slide into focus.',duration:650},
  {id:'soft-focus',label:'Soft focus',category:'cinema',description:'Blur briefly, then refocus on the next slide.',duration:550},
  {id:'orbit',label:'Orbit',category:'cinema',description:'Combine a small rotation and zoom for a camera-like movement.',duration:650},
  {id:'iris',label:'Circle reveal',category:'mask',description:'Expand a circular window from the center.',duration:650,featured:true},
  {id:'diamond',label:'Diamond reveal',category:'mask',description:'Expand a diamond toward all four corners.',duration:650},
  {id:'diagonal',label:'Diagonal wipe',category:'mask',description:'Sweep a slanted mask across the slide.',duration:600},
  {id:'split',label:'Curtain',category:'mask',description:'Reveal the slide outward from the center.',duration:600},
  {id:'blinds',label:'Blinds',category:'mask',description:'Open horizontal strips in sequence.',duration:700,featured:true},
  {id:'mosaic',label:'Grid reveal',category:'mask',description:'Reveal a grid of tiles from the center outward.',duration:750},
  {id:'pixels',label:'Pixel sweep',category:'mask',description:'Reveal tiles along the reading direction.',duration:750},
  {id:'ribbon',label:'Ribbon reveal',category:'mask',description:'Expand a narrow diagonal band to fill the slide.',duration:650},
  {id:'flip',label:'Page flip',category:'depth',description:'Rotate slides around a shared vertical axis.',duration:700},
  {id:'cube',label:'Cube',category:'depth',description:'Rotate between slides like adjacent faces of a cube.',duration:750,featured:true},
  {id:'stack',label:'Card stack',category:'depth',description:'Recede the previous slide and bring a new card forward.',duration:650},
  {id:'hinge',label:'Fold down',category:'depth',description:'Unfold the next slide from its top edge.',duration:700},
];
export const TRANSITION_PRESETS: Preset[] = presets.map(p=>({...p,easing:['cinema','mask','depth','continuity'].includes(p.category)?'cinematic':'smooth'}));
export const TRANSITIONS = TRANSITION_PRESETS.map(p => [p.id, p.label] as const);
export function transitionPreset(effect: TransitionEffect) { return TRANSITION_PRESETS.find(p => p.id === effect)!; }

// Self-contained: serialized verbatim into downloaded HTML. No document or iframe cloning.
export function transitionFrames(effect: TransitionEffect, direction = 1, incoming = true, lightweight = false, nativeStyle?: string): Keyframe[] {
  const d = direction < 0 ? -1 : 1, amplitude = lightweight ? .72 : 1;
  const perspective = 'perspective(var(--deck-transition-perspective,2000px))';
  const rest: Keyframe = {opacity:1,transform:'none',filter:'none',clipPath:'inset(0 0 0 0)',transformOrigin:'50% 50%',borderRadius:'0px'};
  const keep = [{...rest},{...rest}];
  // Stagger opacity handoff so two readable pages never remain superimposed.
  const pair = (enter: Keyframe, exit: Keyframe): Keyframe[] => {
    const first={...rest,transformOrigin:exit.transformOrigin ?? '50% 50%'};
    const last={...rest,transformOrigin:enter.transformOrigin ?? '50% 50%'};
    if(enter.opacity===0 || exit.opacity===0)return incoming
      ? [{offset:0,...enter,opacity:0},{offset:.2,opacity:0},{offset:.62,opacity:1},{offset:1,...last}]
      : [{offset:0,...first},{offset:.08,opacity:1},{offset:.36,opacity:0},{offset:1,...exit,opacity:0}];
    return incoming ? [enter,last] : [first,exit];
  };
  function polygon(points: [number,number][]) { return `polygon(nonzero,${points.map(([x,y])=>`${+x.toFixed(3)}% ${+y.toFixed(3)}%`).join(',')})`; }
  function tiled(mode: string, progress: number) {
    const columns = mode==='blinds' ? 1 : mode==='pixels' ? 6 : 3, rows = mode==='blinds' ? 6 : mode==='pixels' ? 4 : 3;
    const points: [number,number][] = [[0,0]];
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
      const order = mode==='blinds' ? y/(rows-1) : mode==='pixels' ? ((d>0?x:columns-1-x)+y/(rows-1)*.3)/(columns-1+.3) : (Math.abs(x-(columns-1)/2)+Math.abs(y-(rows-1)/2))/((columns+rows-2)/2);
      const raw=Math.min(1,Math.max(0,(progress-order*.22)/.78)), p=raw*raw*(3-2*raw);
      let l=x*100/columns,r=(x+1)*100/columns,t=y*100/rows,b=(y+1)*100/rows;
      if(mode==='blinds' || mode==='pixels'){if(d>0)r=l+(r-l)*p;else l=r-(r-l)*p;}
      else {const cx=(l+r)/2,cy=(t+b)/2;l=cx+(l-cx)*p;r=cx+(r-cx)*p;t=cy+(t-cy)*p;b=cy+(b-cy)*p;}
      // Retraced connectors and nonzero winding give a union without duplicate surfaces.
      points.push([l,t],[r,t],[r,b],[l,b],[l,t],[0,0]);
    }
    return polygon(points);
  }
  if(nativeStyle){
    if(nativeStyle==='NONE')return keep;
    if(nativeStyle==='DISSOLVE'||nativeStyle==='SMART_ANIMATE')return incoming?[{...rest,opacity:0},rest]:keep;
    const side=nativeStyle.split('_').at(-1),v=(side==='LEFT'?-1:1)*d,x=side==='LEFT'||side==='RIGHT',off=(sign:number)=>x?`translateX(${sign*v*100}%)`:`translateY(${sign*(side==='TOP'?-1:1)*d*100}%)`;
    if(nativeStyle.startsWith('PUSH_'))return incoming?[{...rest,transform:off(1)},rest]:[rest,{...rest,transform:off(-1)}];
    if(nativeStyle.startsWith('MOVE_FROM_'))return incoming?[{...rest,transform:off(1)},rest]:keep;
    if(nativeStyle.startsWith('SLIDE_FROM_'))return incoming?[{...rest,transform:off(1)},rest]:[rest,{...rest,opacity:0}];
    if(nativeStyle.startsWith('MOVE_OUT_'))return incoming?keep:[rest,{...rest,transform:off(1)}];
    if(nativeStyle.startsWith('SLIDE_OUT_'))return incoming?[{...rest,opacity:0},rest]:[rest,{...rest,transform:off(1)}];
  }
  if(effect==='none')return keep;
  if(['blinds','mosaic','pixels'].includes(effect))return incoming ? Array.from({length:13},(_,i)=>({offset:i/12,opacity:1,clipPath:tiled(effect,i/12)})) : keep;
  if(effect==='iris')return incoming ? [{clipPath:'circle(0% at 50% 50%)'},{clipPath:'circle(75% at 50% 50%)'}] : keep;
  if(effect==='diamond')return incoming ? [{clipPath:polygon([[50,50],[50,50],[50,50],[50,50]])},{clipPath:polygon([[50,-50],[150,50],[50,150],[-50,50]])}] : keep;
  if(effect==='diagonal')return incoming ? [{clipPath:polygon(d>0?[[100,0],[100,0],[112,100],[112,100]]:[[-12,0],[-12,0],[0,100],[0,100]])},{clipPath:polygon([[-12,0],[100,0],[112,100],[0,100]])}] : keep;
  if(effect==='ribbon')return incoming ? [{clipPath:polygon(d>0?[[0,0],[100,100],[100,100],[0,0]]:[[100,0],[0,100],[0,100],[100,0]])},{clipPath:polygon(d>0?[[0,-100],[200,100],[100,200],[-100,0]]:[[100,-100],[-100,100],[0,200],[200,0]])}] : keep;
  if(effect==='split')return incoming ? [{clipPath:'inset(0% 50% 0% 50%)'},{clipPath:'inset(0% 0% 0% 0%)'}] : keep;
  if(effect==='wipe')return incoming ? [{clipPath:d>0?'inset(0% 100% 0% 0%)':'inset(0% 0% 0% 100%)'},{clipPath:'inset(0% 0% 0% 0%)'}] : keep;
  if(effect==='push')return pair({transform:`translateX(${d*100}%)`},{transform:`translateX(${-d*100}%)`});
  if(effect==='slide')return pair({opacity:0,transform:`translateX(${d*6*amplitude}%)`},{opacity:0,transform:`translateX(${-d*3*amplitude}%)`});
  if(effect==='zoom')return pair({opacity:0,transform:`scale(${1-.03*amplitude})`},{opacity:0,transform:`scale(${1+.015*amplitude})`});
  if(effect==='lift')return pair({transform:`translateY(${d*100}%)`},{transform:`translateY(${-d*6*amplitude}%) scale(.985)`});
  if(effect==='cover')return pair({transform:`translateX(${d*100}%)`},{transform:'scale(.975)',borderRadius:'12px'});
  if(effect==='parallax')return pair({transform:`translateX(${d*100}%) scale(${1+.025*amplitude})`},{transform:`translateX(${-d*10*amplitude}%) scale(.99)`});
  if(effect==='diagonal-slide')return pair({transform:`translate(${d*100}%,${d*10*amplitude}%)`},{transform:`translate(${-d*8*amplitude}%,${-d*4*amplitude}%) scale(.99)`});
  if(effect==='zoom-through')return pair({opacity:0,transform:`scale(${d>0?1-.12*amplitude:1+.14*amplitude})`},{opacity:0,transform:`scale(${d>0?1+.14*amplitude:1-.12*amplitude})`});
  if(effect==='pullback')return pair({opacity:0,transform:`scale(${1-.06*amplitude})`},{opacity:0,transform:`scale(${1-.04*amplitude})`});
  if(effect==='soft-focus')return pair({opacity:0,transform:'scale(1.012)',filter:lightweight?'none':'blur(3px)'},{opacity:0,transform:'scale(.994)',filter:lightweight?'none':'blur(2px)'});
  if(effect==='orbit')return pair({opacity:0,transform:`rotate(${-d*3*amplitude}deg) scale(${1+.035*amplitude})`},{opacity:0,transform:`rotate(${d*3*amplitude}deg) scale(${1-.03*amplitude})`});
  if(effect==='stack')return pair({opacity:0,transform:`translateY(${d*8*amplitude}%) scale(.95)`,borderRadius:'12px'},{opacity:0,transform:`translateY(${-d*3*amplitude}%) scale(.95)`,borderRadius:'12px'});
  if(effect==='flip')return pair({opacity:0,transform:`${perspective} rotateY(${-d*70*amplitude}deg)`},{opacity:0,transform:`${perspective} rotateY(${d*70*amplitude}deg)`});
  if(effect==='cube')return pair({transformOrigin:d>0?'0% 50%':'100% 50%',transform:`${perspective} translateX(${d*100}%) rotateY(${d*60*amplitude}deg)`},{transformOrigin:d>0?'100% 50%':'0% 50%',transform:`${perspective} translateX(${-d*100}%) rotateY(${-d*60*amplitude}deg)`});
  if(effect==='hinge')return pair({opacity:0,transformOrigin:d>0?'50% 0%':'50% 100%',transform:`${perspective} rotateX(${d*65*amplitude}deg)`},{opacity:0,transform:'scale(.985)'});
  return pair({opacity:0},{opacity:0});
}

// Figma transitions belong to the page being left; previous-page navigation is
// immediate in the native audience view. Deck presets retain their own timing.
export function resolvePageTransition(from: Slide | null | undefined, to: Slide, direction = 1): SlideTransition {
  if(direction>0&&from?.transition?.native)return from.transition;
  if(direction<0&&(from?.transition?.native||to.transition?.native))return {effect:'none',duration:100,easing:'linear'};
  if(!from&&to.transition?.native)return {effect:'none',duration:100,easing:'linear'};
  return direction < 0 && from?.transition?.effect === 'smart' ? from.transition : to.transition ?? {effect:'fade',duration:480,easing:'smooth'};
}

export type PageTransitionRun = {animations: Animation[]; finished: Promise<unknown>; cancel: () => void; setPaused: (paused: boolean) => void};
// Factory dependencies are passed explicitly so the editor, preview and download use the same runtime.
export function createPageTransition(frames: typeof transitionFrames, easings: Record<string,string>, smart?: typeof runSmartTransition, native?:typeof nativeSlideTransition, spring?:typeof nativeSpringEasing) {
  const springCurves=new Map<string,string|undefined>();
  return function(incoming: HTMLElement, outgoing: HTMLElement | null, transition: SlideTransition, direction: number, options: {reduced?: boolean; paused?: boolean; lightweight?: boolean; from?:Slide; to?:Slide; fromStep?:number; toStep?:number} = {}): PageTransitionRun {
    const animations: Animation[] = [];
    const restore: (()=>void)[] = [];
    let active = true, backdrop: HTMLElement | undefined;
    const cancel = () => {if(!active)return;active=false;animations.forEach(a=>a.cancel());backdrop?.remove();restore.forEach(fn=>fn());};
    const setPaused = (paused: boolean) => animations.forEach(a=>{if(a.playState==='finished'||a.playState==='idle')return;if(paused)a.pause();else if(a.playState==='paused')a.play();});
    const source=native?.(transition);
    if(!options.reduced && transition.effect!=='none' && typeof incoming.animate==='function') {
      const nativeEasing:Record<string,string>={LINEAR:'linear',EASE_IN:'cubic-bezier(.42,0,1,1)',EASE_OUT:'cubic-bezier(0,0,.58,1)',EASE_IN_AND_OUT:'cubic-bezier(.42,0,.58,1)'};
      if(source&&spring&&!springCurves.has(source.curve)){const curve=spring(source.curve);springCurves.set(source.curve,curve&&(typeof CSS==='undefined'||CSS.supports('animation-timing-function',curve))?curve:undefined);}
      const settings={duration:source?source.duration*1000:transition.duration,easing:source?springCurves.get(source.curve)??nativeEasing[source.curve]??easings[transition.easing]:easings[transition.easing],fill:'both' as FillMode};
      const stage=incoming.parentElement, doc=incoming.ownerDocument;
      // Native spring overshoot can uncover the page edge. Slides reveals black
      // there; a destination-colored plane incorrectly erases that movement.
      if(stage && doc && typeof getComputedStyle==='function') {
        const color=(target:HTMLElement|null)=>{const page=target?.querySelector<HTMLElement>('.slide-render,.slide,.transition-demo-page') ?? target;const value=page?getComputedStyle(page).backgroundColor:'';return value && value!=='rgba(0, 0, 0, 0)'?value:'rgb(24, 28, 25)';};
        const style=getComputedStyle(incoming);
        backdrop=doc.createElement('div');backdrop.dataset.transitionBackdrop='';backdrop.setAttribute('aria-hidden','true');
        Object.assign(backdrop.style,{position:'absolute',pointerEvents:'none',left:incoming.offsetLeft+'px',top:incoming.offsetTop+'px',width:incoming.clientWidth+'px',height:incoming.clientHeight+'px',translate:style.translate || 'none',backgroundColor:source?'#000':color(incoming),zIndex:'0'});
        stage.insertBefore(backdrop,outgoing ?? incoming);
        if(!source)try{animations.push(backdrop.animate([{backgroundColor:color(outgoing ?? incoming)},{backgroundColor:color(incoming)}],settings));}catch{/* Static tone remains if color animation is unavailable. */}
      }
      for(const [target,enter] of [[incoming,true],[outgoing,false]] as const) {
        if(!target)continue;
        const oldZ=target.style.zIndex;target.style.zIndex=Boolean(enter)!==Boolean(source&&/_OUT_TO_/.test(source.style))?'2':'1';restore.push(()=>{target.style.zIndex=oldZ;});
        if(typeof target.style.setProperty==='function') {
          const key='--deck-transition-perspective',old=target.style.getPropertyValue(key);
          target.style.setProperty(key,Math.max(600,(incoming.clientWidth || 600)*2.4)+'px');
          restore.push(()=>{if(old)target.style.setProperty(key,old);else target.style.removeProperty(key);});
        }
      }
      const handled=transition.effect==='smart' && outgoing && options.from && options.to && smart?.(incoming,outgoing,options.from,options.to,settings,animations,restore,{fromStep:options.fromStep,toStep:options.toStep,native:source?.style==='SMART_ANIMATE'});
      if(!handled)for(const [target,enter] of [[incoming,true],[outgoing,false]] as const){
        if(!target)continue;
        try {const values=frames(transition.effect,direction,enter,options.lightweight,source?.style);if(typeof CSS!=='undefined' && values.some(f=>f.clipPath && !CSS.supports('clip-path',String(f.clipPath))))throw new Error('Unsupported mask');animations.push(target.animate(values,settings));}
        catch {try {animations.push(target.animate(enter?[{offset:0,opacity:0},{offset:.2,opacity:0},{offset:.62,opacity:1},{offset:1,opacity:1}]:[{offset:0,opacity:1},{offset:.08,opacity:1},{offset:.36,opacity:0},{offset:1,opacity:0}],settings));}catch {/* Immediate static fallback. */}}
      }
    }
    setPaused(Boolean(options.paused));
    const finished = Promise.allSettled(animations.map(a=>a.finished)).then(()=>{
      if(!active)return;
      if(outgoing)outgoing.style.visibility='hidden';
      cancel();
    });
    return {animations,finished,cancel,setPaused};
  };
}
export const runPageTransition = createPageTransition(transitionFrames, TRANSITION_EASINGS, runSmartTransition,nativeSlideTransition,nativeSpringEasing);
