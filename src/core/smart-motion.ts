import type { Slide, SlideElement } from './model';
import {resolveObjectMotion} from './motion-sequence';

export type SmartPair = {from: SlideElement; to: SlideElement; basis: 'key' | 'name'; changed: string[]; dissolve: boolean};
export type SmartPlan = {pairs: SmartPair[]; issues: string[]};

// Serialized with the HTML player: all matching rules live inside this function.
export function matchSmartLayers(from: Slide, to: Slide, steps: {fromStep?: number; toStep?: number} = {},resolve:typeof resolveObjectMotion=resolveObjectMotion): SmartPlan {
  const issues: string[] = [], pairs: SmartPair[] = [];
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const eligible = (s: Slide, step: number) => {
    const entries=new Map(resolve(s).entries.map(entry=>[entry.id,entry]));
    return s.elements.filter(e=>{const entry=entries.get(e.id);return !e.hidden&&e.motionMatch!=='off'&&!e.sourceRegion&&!['prototype','line'].includes(e.type)&&(!entry||(entry.phase==='out'?step<entry.cue:step>=entry.cue));});
  };
  const old = eligible(from, steps.fromStep ?? Infinity), next = eligible(to, steps.toStep ?? 0);
  const context = (e: SlideElement, s: Slide) => e.group ? 'group:'+s.elements.filter(x=>x.group===e.group && !x.hidden).map(x=>x.type+':'+normalize(x.name)).sort().join('|') : 'root';
  const identity = (e: SlideElement, s: Slide) => e.motionKey?.trim() ? 'key:'+e.motionKey.trim() : normalize(e.name) ? 'name:'+e.type+':'+context(e,s)+':'+normalize(e.name) : '';
  const index = (es: SlideElement[], s: Slide) => {const map=new Map<string,SlideElement[]>();for(const e of es){const key=identity(e,s);if(key)map.set(key,[...(map.get(key) ?? []),e]);}return map;};
  const a=index(old,from), b=index(next,to), warned=new Set<string>();
  for(const [key,items] of b){
    const previous=a.get(key) ?? [];
    if(items.length>1 || previous.length>1){if(!warned.has(key)){issues.push(`${items[0].motionKey ? 'Match ID' : 'Object name'}“${items[0].motionKey || items[0].name}” is duplicated. These objects were not matched automatically.`);warned.add(key);}continue;}
    if(!previous.length)continue;
    const x=previous[0], y=items[0];
    if(x.type!==y.type){issues.push(`“${y.name}” has different object types. Using dissolve instead.`);continue;}
    const changed=['x','y','w','h','rotation','opacity','fill','stroke','strokeWidth','radius','flipX','flipY'].filter(k=>JSON.stringify(x[k as keyof SlideElement])!==JSON.stringify(y[k as keyof SlideElement]));
    const same=(keys:string[])=>keys.every(k=>JSON.stringify(x[k as keyof SlideElement])===JSON.stringify(y[k as keyof SlideElement]));
    let dissolve=!same(['flipX','flipY']);
    if(y.type==='text'){
      const ratio=x.fontSize/y.fontSize, close=(v:number,w:number)=>Math.abs(v-w)<.01;
      const proportional=close(x.w/y.w,ratio)&&close(x.h/y.h,ratio)&&close(x.letterSpacing,y.letterSpacing*ratio)&&(['top','right','bottom','left'] as const).every(k=>close(x.padding?.[k] ?? 0,(y.padding?.[k] ?? 0)*ratio));
      dissolve ||= !same(['text','runs','paragraphs','fontFamily','fontWeight','italic','underline','strikethrough','align','verticalAlign','lineHeight','wrap','clipText','maxLines']) || !proportional;
      if(!same(['text','runs','paragraphs','fontSize','fontFamily','fontWeight','padding','letterSpacing','italic','underline','strikethrough','align','verticalAlign','lineHeight','wrap','clipText','maxLines']))changed.push('text');
    }else if(y.type==='image'){
      dissolve ||= !same(['src','fit','crop']);if(!same(['src','fit','crop']))changed.push('image');
    }else if(y.type==='table' || y.type==='chart'){
      dissolve ||= !same(['cells','tableStyle','values','chart','fontFamily','fontSize','fontWeight','w','h','fill','padding','align','lineHeight']);if(dissolve)changed.push('content');
    }
    pairs.push({from:x,to:y,basis:key.startsWith('key:')?'key':'name',changed,dissolve});
  }
  return {pairs,issues};
}

// Existing incoming/outgoing nodes only. No bitmap overlays, clones or live iframe copies.
export function createSmartTransition(match: typeof matchSmartLayers) {
  return function(incoming: HTMLElement, outgoing: HTMLElement, from: Slide, to: Slide, settings: KeyframeAnimationOptions, animations: Animation[], restore: (()=>void)[], steps: {fromStep?:number;toStep?:number;native?:boolean} = {}) {
    const nodes=(root:HTMLElement)=>new Map([...root.querySelectorAll<HTMLElement>('[data-element-id],.e[data-id]')].map(n=>[n.dataset.elementId || n.dataset.id!,n]));
    const old=nodes(outgoing), next=nodes(incoming), plan=match(from,to,steps);
    const visible=(n:HTMLElement|undefined)=>Boolean(n && !n.querySelector<HTMLElement>('.element-motion')?.inert && getComputedStyle(n.querySelector('.element-motion') || n).visibility!=='hidden');
    const pairs=plan.pairs.filter(p=>visible(old.get(p.from.id)) && visible(next.get(p.to.id)));
    if(!pairs.length&&!steps.native)return false;
    for(const root of [incoming,outgoing]){const page=root.querySelector<HTMLElement>('.slide-render,.slide');if(page){const bg=page.style.backgroundColor;page.style.backgroundColor='transparent';restore.push(()=>page.style.backgroundColor=bg);}}
    const animate=(n:HTMLElement,frames:Keyframe[])=>{try{animations.push(n.animate(frames,settings));}catch{/* The existing node remains visible in its final state. */}};
    const baseOpacity=(n:HTMLElement)=>Number(getComputedStyle(n).opacity);
    const fade=(n:HTMLElement,enter:boolean)=>{const opacity=baseOpacity(n);animate(n,steps.native?(enter?[{opacity:0},{opacity}]:[{opacity},{opacity:0}]):enter?[{offset:0,opacity:0},{offset:.2,opacity:0},{offset:.62,opacity},{offset:1,opacity}]:[{offset:0,opacity},{offset:.08,opacity},{offset:.36,opacity:0},{offset:1,opacity:0}]);};
    const hide=(n:HTMLElement)=>{const value=n.style.visibility;n.style.visibility='hidden';restore.push(()=>n.style.visibility=value);};
    const nearest=(a:number,b:number)=>b+((a-b+180)%360+360)%360-180;
    function geometry(n:HTMLElement,x:SlideElement,y:SlideElement,enter:boolean,dissolve:boolean){
      const own=enter?y:x, sx=x.w/y.w, sy=x.h/y.h;
      const flip=(e:SlideElement)=>[e.flipX?-1:1,e.flipY?-1:1];
      if(own.type==='image' && Math.abs(sx-sy)>.001){
        const contain=n.style.contain;n.style.contain='layout style';restore.push(()=>n.style.contain=contain);
        const f=flip(own);animate(n,[{left:x.x+'px',top:x.y+'px',width:x.w+'px',height:x.h+'px',transform:`rotate(${nearest(x.rotation,y.rotation)}deg) scale(${f[0]},${f[1]})`},{left:y.x+'px',top:y.y+'px',width:y.w+'px',height:y.h+'px',transform:`rotate(${y.rotation}deg) scale(${f[0]},${f[1]})`}]);return;
      }
      const preserve=dissolve && ['text','table','chart'].includes(own.type);
      const f=flip(dissolve?own:x), end=flip(dissolve?own:y);
      const dx=preserve?x.x-y.x:x.x+x.w/2-y.x-y.w/2,dy=preserve?x.y-y.y:x.y+x.h/2-y.y-y.h/2;
      if(enter)animate(n,[{transform:`translate(${dx}px,${dy}px) rotate(${nearest(x.rotation,y.rotation)}deg) scale(${(preserve?1:sx)*f[0]},${(preserve?1:sy)*f[1]})`},{transform:`rotate(${y.rotation}deg) scale(${end[0]},${end[1]})`}]);
      else animate(n,[{transform:`rotate(${nearest(x.rotation,y.rotation)}deg) scale(${f[0]},${f[1]})`},{transform:`translate(${-dx}px,${-dy}px) rotate(${y.rotation}deg) scale(${(preserve?1:1/sx)*end[0]},${(preserve?1:1/sy)*end[1]})`}]);
    }
    const usedOld=new Set<string>(),usedNext=new Set<string>();
    for(const p of pairs){
      const a=old.get(p.from.id)!,b=next.get(p.to.id)!,x=p.from,y=p.to;usedOld.add(x.id);usedNext.add(y.id);
      if(!p.changed.length){hide(a);continue;}
      geometry(b,x,y,true,p.dissolve);
      if(p.dissolve){geometry(a,x,y,false,true);fade(a,false);fade(b,true);}
      else {
        hide(a);const visual=b.querySelector<HTMLElement>('.element-visual') || b;animate(visual,[{opacity:x.opacity},{opacity:y.opacity}]);
        const shape=b.querySelector<HTMLElement>('.shape-content') || (['rect','ellipse'].includes(y.type)?b:null);
        if(shape){animate(shape,[{backgroundColor:x.fill,borderColor:x.stroke,borderWidth:x.strokeWidth+'px'},{backgroundColor:y.fill,borderColor:y.stroke,borderWidth:y.strokeWidth+'px'}]);}
        const polygon=b.querySelector<SVGElement>('polygon');if(y.type==='diamond' && polygon)animate(polygon as unknown as HTMLElement,[{fill:x.fill,stroke:x.stroke,strokeWidth:x.strokeWidth},{fill:y.fill,stroke:y.stroke,strokeWidth:y.strokeWidth}]);
        const text=b.querySelector<HTMLElement>('.text-content') || (y.type==='text'?b:null);if(text)animate(text,[{color:x.fill},{color:y.fill}]);
        const rounded=b.querySelector<HTMLElement>('.image-clip,.shape-content') || (['rect','image'].includes(y.type)?b:null);
        if(rounded && y.type!=='ellipse')animate(rounded,[{borderRadius:y.type==='image' && Math.abs(x.w/y.w-x.h/y.h)>.001?x.radius+'px':`${x.radius/(x.w/y.w)}px / ${x.radius/(x.h/y.h)}px`},{borderRadius:y.radius+'px'}]);
      }
    }
    for(const [id,n]of old)if(!usedOld.has(id)){if(visible(n))fade(n,false);else hide(n);}
    for(const [id,n]of next)if(!usedNext.has(id) && visible(n))fade(n,true);
    return true;
  };
}
export const runSmartTransition = createSmartTransition(matchSmartLayers);
