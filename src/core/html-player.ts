import {nativeSlideTransition,createNativeAdvance} from './figma-transitions';
import {nativeSpringEasing} from './figma-spring';
import {EASINGS,entranceFrames,createElementPlayback,navigateCue,resolveObjectMotion,objectCueDuration} from './motion';
import { transitionFrames, createPageTransition, resolvePageTransition, TRANSITION_EASINGS } from './transitions';
import { createPlaybackGestures } from './player-gestures';
import { matchSmartLayers, createSmartTransition } from './smart-motion';
// Serialized browser runtime. Core cue navigation and entrance playback are shared with the editor.
function standalonePlayer(deck: any, original: boolean, wrap: HTMLElement, createPage: (s: any) => HTMLElement, node: (tag: string, text?: string) => HTMLElement, motion: any) {
  let index = 0, step = 0, replay = 0, epoch = 0, quiet = false, paused = false, printing = false;
  let entering = false, restored = false, background = document.visibilityState === 'hidden';
  let sharedIds = new Set<string>();
  let focused: HTMLDialogElement | null = null;
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => quiet || mq.matches;
  const plans=new Map<any,any>();
  function planFor(s:any){let plan=plans.get(s);if(!plan){plan=motion.resolveMotion(s);plan.byId=new Map(plan.entries.map((e:any)=>[e.id,e]));plans.set(s,plan);}return plan;}
  const orders = () => original ? [] : planFor(deck.slides[index]).orders;
  const transitions = new Set<Animation>();
  const players = new Map<string, {element: any; offset: number; control: {update: (p: any) => void; destroy: () => void}}>();
  const embeds = new Set<() => void>();
  const playElement = motion.player(motion.easings, motion.entrance);
  const matchSmart=(from:any,to:any,steps:any)=>motion.smartMatcher(from,to,steps,motion.resolveMotion);
  const runTransition = motion.pageFactory(motion.transition, motion.pageEasings, motion.smartFactory(matchSmart),motion.nativePage,motion.nativeSpring);
  let pageRun: ReturnType<typeof runTransition> | undefined;
  const nativeAdvance=motion.advance();
  function scheduleNative(){const timing=motion.nativePage(deck.slides[index].transition??{})?.timing;nativeAdvance.update(`${index}:${step}:${replay}`,index<deck.slides.length-1&&step===orders().length&&timing?.type==='AFTER_DELAY'?(timing.delay??0)+(reduced()?0:motion.cueDuration(deck.slides[index],step,motion.resolveMotion)):undefined,paused||Boolean(focused)||background||printing||entering||Boolean((document.getElementById('credits') as HTMLDialogElement)?.open),()=>go(1));}
  function parameters(e:any,offset:number,s=deck.slides[index],cueStep=step){return {animation:e.animation,entry:planFor(s).byId.get(e.id),step:cueStep,orders:original?[]:planFor(s).orders,enabled:!original,reduced:reduced(),paused:paused||Boolean(focused)||background||printing,entering,restored,shared:sharedIds.has(e.id),replay,offset};}
  function updatePlayers() { players.forEach(p=>p.control.update(parameters(p.element,p.offset))); }
  function syncPause() { const hold=paused || Boolean(focused) || background || printing; transitions.forEach(a=>{if(a.playState==='finished'||a.playState==='idle')return;if(hold)a.pause();else if(a.playState==='paused')a.play()}); updatePlayers();scheduleNative(); }
  function count() {
    const total = orders().length;
    document.getElementById('count')!.textContent = `${index + 1} / ${deck.slides.length}${total ? ` · ${step}/${total}  steps` : ''}`;
    (document.getElementById('prev') as HTMLButtonElement).disabled = index === 0 && step === 0;
    (document.getElementById('next') as HTMLButtonElement).disabled = index === deck.slides.length - 1 && step === total;
    pauseButton.textContent=paused?'Resume':'Pause'; pauseButton.setAttribute('aria-pressed',String(paused)); (pauseButton as HTMLButtonElement).disabled=reduced()&&motion.nativePage(deck.slides[index].transition??{})?.timing.type!=='AFTER_DELAY';scheduleNative();
  }
  function prototype(e: any) {
    const p=e.prototype, shell=node('dialog') as HTMLDialogElement, body=node('div'), header=node('header'), heading=node('h2',e.name), close=node('button','Close expanded preview');
    shell.className='prototype'; shell.open=true; shell.setAttribute('role','group'); shell.setAttribute('aria-label',e.name); header.className='embed-focus-head'; header.hidden=true; body.className='embed-body'; header.append(heading,close); shell.append(header,body);
    let timer: ReturnType<typeof setTimeout> | undefined, origin: HTMLElement | null=null, focusButton: HTMLElement | undefined;
    function restore() {
      if (focused!==shell) return;
      focused=null; shell.classList.remove('focused'); shell.setAttribute('role','group'); shell.removeAttribute('aria-modal'); header.hidden=true; if(focusButton)focusButton.hidden=false;
      if(!shell.open)shell.show(); syncPause(); if(origin?.isConnected)origin.focus();
    }
    function closeFocus(){shell.close();restore()}
    close.onclick=closeFocus; shell.oncancel=ev=>{ev.preventDefault();closeFocus()}; shell.onclose=()=>{if(!shell.open)restore()};
    function focus(){origin=focusButton ?? document.activeElement as HTMLElement;shell.close();focused=shell;shell.classList.add('focused');shell.setAttribute('role','dialog');shell.setAttribute('aria-modal','true');header.hidden=false;if(focusButton)focusButton.hidden=true;shell.showModal();close.focus();syncPause()}
    function start() {
      clearTimeout(timer); body.replaceChildren();
      const u=new URL(p.url),isFigma=['figma.com','www.figma.com','embed.figma.com'].includes(u.hostname);
      if(isFigma){u.hostname='embed.figma.com';for(const [k,v] of Object.entries({'embed-host':'deck-studio','scaling':p.scaling,'content-scaling':p.responsive?'responsive':'fixed','device-frame':String(p.deviceFrame),'footer':String(p.chrome),'show-proto-sidebar':'false'}))u.searchParams.set(k,String(v));}
      const frame=node('iframe') as HTMLIFrameElement; frame.title=e.name;frame.src=u.toString();frame.allow='fullscreen';frame.setAttribute('allowfullscreen','');frame.referrerPolicy='strict-origin-when-cross-origin';frame.setAttribute('sandbox',u.origin===location.origin?'allow-scripts allow-forms allow-popups':'allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock');
      const status=node('div','Loading prototype…');status.className='embed-status';status.setAttribute('role','status');timer=setTimeout(()=>status.textContent='If the preview is blank, the site may block embedding. Open the original link to continue.',12000);frame.onload=()=>{clearTimeout(timer);status.remove()};
      const tools=node('div');tools.className='embed-tools';tools.append(node('span',e.name));const reload=node('button','Reload');reload.onclick=start;focusButton=node('button','Expand preview');focusButton.hidden=focused===shell;focusButton.onclick=focus;
      const link=node('a','Open original link') as HTMLAnchorElement;link.href=p.url;link.target='_blank';link.rel='noopener noreferrer';const end=node('button','Stop interacting');end.onclick=()=>{if(focused===shell)closeFocus();clearTimeout(timer);cover()};tools.append(reload,focusButton,link,end);body.append(frame,status,tools);
    }
    function cover(){body.replaceChildren();if(p.poster){const image=node('img') as HTMLImageElement;image.src=p.poster;image.alt=e.name;image.className='embed-poster';body.append(image)}const c=node('div');c.className='embed-cover';c.append(node('strong',e.name));const button=node('button','Interact');button.onclick=()=>{start();if(matchMedia('(max-width:760px)').matches)focus()};c.append(button);body.append(c)}
    embeds.add(()=>{clearTimeout(timer);if(focused===shell)closeFocus()});cover();return shell;
  }
  function hydrate(page: HTMLElement, s: any, all: boolean) {
    const plan=planFor(s);
    for(const el of page.querySelectorAll<HTMLElement>('.e')){
      const e=s.elements.find((e:any)=>e.id===el.dataset.id);if(!e)continue;
      if(e.type==='prototype' && e.prototype)el.replaceChildren(all?node('div',`${e.name}\n${e.prototype.url}`):prototype(e));
      const inner=node('div');inner.className='element-motion';inner.append(...el.childNodes);el.append(inner);
      if(!all){const entry=plan.byId.get(e.id),offset=entry?.legacy&&entry.trigger==='auto'?entry.start-(e.animation?.delay??0):0;players.set(e.id,{element:e,offset,control:playElement(inner,parameters(e,offset))})}
    }
  }
  function viewportScale(){return Math.max(0,Math.min(innerWidth/deck.width,wrap.clientHeight/deck.height))}
  function shell(s:any,all=false){const holder=node('div'),page=createPage(s);holder.className='page-shell';holder.dataset.slideId=s.id;const scale=all?1:viewportScale();Object.assign(holder.style,{width:deck.width*scale+'px',height:deck.height*scale+'px'});page.style.transform=`scale(${scale})`;holder.append(page);hydrate(page,s,all);return holder}
  function render(direction=1, previous:any=null, previousStep=0){
    const id=++epoch,old=wrap.lastElementChild as HTMLElement|null;pageRun?.cancel();transitions.forEach(a=>a.cancel());transitions.clear();players.forEach(p=>{p.control.update({...parameters(p.element,p.offset,previous??deck.slides[index],previousStep),restored:true});p.control.destroy();});players.clear();embeds.forEach(dispose=>dispose());embeds.clear();wrap.replaceChildren();
    const t=motion.resolvePage(previous,deck.slides[index],direction);entering=!reduced() && t.effect!=='none';
    sharedIds=new Set(t.effect==='smart' && previous && !original ? matchSmart(previous,deck.slides[index],{fromStep:previousStep,toStep:step}).pairs.map((p:any)=>p.to.id) : []);
    const current=shell(deck.slides[index]);wrap.append(current);
    if(entering){if(old){old.classList.add('outgoing');old.inert=true;old.setAttribute('aria-hidden','true');wrap.prepend(old)}pageRun=runTransition(current,old,t,direction,{paused:paused || Boolean(focused) || background,lightweight:matchMedia('(max-width:760px)').matches,from:previous,to:deck.slides[index],fromStep:previousStep,toStep:step});const run=pageRun;run.animations.forEach((a:Animation)=>transitions.add(a));run.finished.then(()=>{run.animations.forEach((a:Animation)=>transitions.delete(a));if(id===epoch){old?.remove();entering=false;updatePlayers();scheduleNative()}})}
    count();document.title=deck.title;
  }
  function settlePage(){epoch++;pageRun?.cancel();transitions.clear();wrap.querySelector('.outgoing')?.remove();entering=false;}
  function jump(next:number,nextStep=0,complete=false){if(next===index){if(nextStep!==step || complete)settlePage();restored=complete;step=nextStep;updatePlayers();count();return}const direction=next>index?1:-1,previous=deck.slides[index],previousStep=step;restored=complete || direction<0;index=next;step=nextStep;replay++;render(direction,previous,previousStep)}
  function go(direction:number){const next=motion.navigate(index,step,direction,deck.slides.map((s:any)=>original?0:planFor(s).orders.length));jump(next.index,next.step)}
  function restart(){sharedIds.clear();step=0;restored=false;replay++;paused=false;settlePage();const id=epoch,current=wrap.querySelector<HTMLElement>('.page-shell'),t=deck.slides[index].transition || {effect:'fade',duration:480,easing:'smooth'};entering=Boolean(current && !reduced() && t.effect!=='none');if(current && entering){const run=runTransition(current,null,t,1,{paused:Boolean(focused) || background,lightweight:matchMedia('(max-width:760px)').matches});pageRun=run;run.animations.forEach((a:Animation)=>transitions.add(a));run.finished.then(()=>{run.animations.forEach((a:Animation)=>transitions.delete(a));if(id===epoch){entering=false;updatePlayers();scheduleNative()}})}syncPause();count()}
  function togglePause(){if((pauseButton as HTMLButtonElement).disabled)return;paused=!paused;syncPause();count()}
  function preference(){if(reduced()){settlePage();paused=false}updatePlayers();count()}
  const nav=document.querySelector('nav')!,replayButton=node('button','Replay'),pauseButton=node('button','Pause'),quietButton=node('button','Reduce motion');replayButton.onclick=restart;pauseButton.onclick=togglePause;pauseButton.title='Pause slide motion. Embedded prototypes use their own controls.';quietButton.setAttribute('aria-pressed','false');quietButton.onclick=()=>{quiet=!quiet;quietButton.setAttribute('aria-pressed',String(quiet));preference()};nav.append(replayButton,pauseButton,quietButton);
  document.getElementById('count')!.setAttribute('aria-live','polite');document.getElementById('prev')!.onclick=()=>go(-1);document.getElementById('next')!.onclick=()=>go(1);
  wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Presentation canvas');wrap.setAttribute('aria-description','Use arrow keys to navigate slides. With the canvas focused, press R to replay or P to pause.');
  const gestures=motion.gestures((direction:number)=>{if(!printing && !focused)go(direction)},(target:HTMLElement)=>target.focus({preventScroll:true}));
  wrap.onclick=gestures.click;wrap.onpointerdown=gestures.pointerdown;wrap.onpointermove=gestures.pointermove;wrap.onpointerup=gestures.pointerup;wrap.onpointercancel=gestures.pointercancel;
  onkeydown=event=>{if(event.defaultPrevented || event.keyCode===229 || focused || printing || event.metaKey || event.ctrlKey || event.altKey || event.isComposing || (document.getElementById('credits') as HTMLDialogElement).open || (event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),.prototype'))return;if((event.target as HTMLElement)?.closest('button,a') && [' ','Enter'].includes(event.key))return;if(['ArrowRight',' ','PageDown'].includes(event.key)){event.preventDefault();go(1)}if(['ArrowLeft','PageUp'].includes(event.key)){event.preventDefault();go(-1)}const canvas=wrap.contains(event.target as Node) && !(event.target as HTMLElement)?.closest('button,a');if(canvas && event.key.toLowerCase()==='r')restart();if(canvas && event.key.toLowerCase()==='p')togglePause();if(event.key==='Home'){event.preventDefault();jump(0,0,true)}if(event.key==='End'){event.preventDefault();jump(deck.slides.length-1,original?0:planFor(deck.slides.at(-1)).orders.length,true)}};
  onresize=()=>{settlePage();updatePlayers();document.documentElement.style.setProperty('--player-nav-height',nav.getBoundingClientRect().height+'px');const live=wrap.querySelector<HTMLElement>('.page-shell:not(.outgoing):not(.print-copy)');if(!live)return;const scale=viewportScale();Object.assign(live.style,{width:deck.width*scale+'px',height:deck.height*scale+'px'});(live.querySelector('.slide') as HTMLElement).style.transform=`scale(${scale})`};
  new ResizeObserver(()=>window.dispatchEvent(new Event('resize'))).observe(nav);window.dispatchEvent(new Event('resize'));
  mq.addEventListener('change',preference);
  document.addEventListener('visibilitychange',()=>{background=document.visibilityState==='hidden';syncPause()});
  document.getElementById('credits')!.addEventListener('toggle',scheduleNative);addEventListener('pagehide',()=>nativeAdvance.destroy());
  onbeforeprint=()=>{if(printing)return;settlePage();printing=true;syncPause();wrap.querySelectorAll('.page-shell').forEach(p=>p.classList.add('print-live'));for(const s of deck.slides){const copy=shell(s,true);copy.classList.add('print-copy');wrap.append(copy)}};
  onafterprint=()=>{printing=false;wrap.querySelectorAll('.print-copy').forEach(p=>p.remove());wrap.querySelectorAll('.print-live').forEach(p=>p.classList.remove('print-live'));syncPause()};render();wrap.focus({preventScroll:true});
}
export function htmlPlayerScript(){return `(${standalonePlayer.toString()})(deck,original,wrap,slide,node,{easings:${JSON.stringify(EASINGS)},pageEasings:${JSON.stringify(TRANSITION_EASINGS)},entrance:${entranceFrames.toString()},transition:${transitionFrames.toString()},pageFactory:${createPageTransition.toString()},nativePage:${nativeSlideTransition.toString()},nativeSpring:${nativeSpringEasing.toString()},advance:${createNativeAdvance.toString()},resolvePage:${resolvePageTransition.toString()},player:${createElementPlayback.toString()},gestures:${createPlaybackGestures.toString()},smartMatcher:${matchSmartLayers.toString()},smartFactory:${createSmartTransition.toString()},navigate:${navigateCue.toString()},resolveMotion:${resolveObjectMotion.toString()},cueDuration:${objectCueDuration.toString()}});`}
export const htmlPlayerStyles=`[hidden]{display:none!important}#wrap{position:relative;touch-action:pan-y pinch-zoom;height:calc(100dvh - var(--player-nav-height,56px))}.page-shell{position:absolute;left:50%;top:50%;translate:-50% -50%;overflow:hidden;background:#000}.page-shell.outgoing{pointer-events:none}.element-motion{width:100%;height:100%;transform-origin:center}.prototype{position:relative;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;border:1px solid #c8d2c3;background:#edf0e9;color:#26362c;font:14px/1.5 Inter,sans-serif}.embed-body{position:relative;height:100%}.embed-poster{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}.embed-cover{position:absolute;inset:0;background:#f4f6f0dd;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px}.embed-cover strong{font-size:24px}.embed-cover button{background:#365440;color:white;border-radius:6px;padding:12px 20px}.prototype iframe{width:100%;height:calc(100% - 44px);border:0;display:block}.embed-tools{position:absolute;bottom:0;left:0;right:0;height:44px;display:flex;align-items:center;gap:10px;padding:0 10px;background:#edf0e9;color:#26362c}.embed-tools span{margin-right:auto;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12px}.prototype a{color:#365440}.embed-status{position:absolute;top:10px;left:10px;right:10px;background:#f4f6f0;padding:8px;font-size:12px;pointer-events:none}.prototype.focused{position:fixed;inset:0;margin:auto;width:min(1000px,calc(100vw - 32px));height:min(80dvh,900px);border-radius:8px;overflow:hidden}.prototype.focused .embed-body{height:calc(100% - 52px)}.prototype.focused::backdrop{background:#0009}.embed-focus-head{height:52px;display:flex;justify-content:space-between;align-items:center;padding:0 16px;border-bottom:1px solid #c8d2c3}.embed-focus-head h2{font-size:16px}.embed-focus-head button{min-height:44px}nav{height:56px;gap:10px;font-size:13px}nav button{min-width:40px;min-height:44px}nav button:disabled{opacity:.4}nav button[aria-pressed=true]{background:#344333;border-radius:6px}.print-copy{display:none}@media(max-width:600px){nav{gap:2px;font-size:12px}nav button{padding:6px;min-width:36px}.prototype.focused{width:calc(100vw - 16px);height:80dvh}.prototype.focused .embed-tools button,.prototype.focused .embed-tools a{min-height:44px;padding:4px}.embed-tools span{max-width:22%}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}@media print{.page-shell{position:relative;left:0;top:0;translate:none;background:transparent}.print-live{display:none!important}.print-copy{display:block}.element-motion{visibility:visible!important}.prototype.focused{display:none!important}}`;

// Responsive control rows reserve their measured height, including optional credits.
export const htmlPlayerResponsiveStyles=`.page-shell{backface-visibility:hidden}.page-shell:not(.outgoing){z-index:1}.page-shell.outgoing{z-index:0}nav{flex-wrap:wrap;height:auto;min-height:56px;padding:4px 8px}nav button{min-width:44px;min-height:44px}#wrap:focus-visible{outline:2px solid #b7c7ad;outline-offset:-3px}button:focus-visible,a:focus-visible{outline:2px solid currentColor;outline-offset:2px}#credits{border:1px solid #c8d2c3;max-width:none;width:auto;margin:0;height:auto;max-height:none}#credits::backdrop{background:#0009}@media(max-width:600px){nav{display:grid;grid-template-columns:minmax(44px,1fr) minmax(104px,1fr) minmax(44px,1fr);gap:2px 6px;font-size:12px}nav #prev{grid-column:1;grid-row:1}nav #count{grid-column:2;grid-row:1;text-align:center;white-space:nowrap}nav #next{grid-column:3;grid-row:1}nav #credits-toggle{grid-column:1/-1;grid-row:3}nav button{min-width:44px}#credits{inset:16px;padding:16px}.embed-focus-head h2{max-width:65%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.embed-tools{gap:2px;padding:0 4px}.embed-tools span{display:none}.embed-tools button,.embed-tools a{flex:1;text-align:center}}@media print{#credits{display:none!important}}`;
