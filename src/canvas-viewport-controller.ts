import {tick} from 'svelte';
import {canvasWheel,pagesWithWheel,SlideWheelPager} from './canvas-wheel';
import {captureViewAnchor,scrollForAnchor,type ViewAnchor,type ViewGeometry} from './canvas-viewport-anchor';

export type ViewportOptions = {scale:number; fit:boolean; key:string; slideKey:string; pageBlocked:boolean; page:(direction:number)=>void; zoom:(value:number|'fit')=>void; cancel:()=>void};
const controls = 'button,a,input,textarea,select,[contenteditable="true"],[popover],.prototype-shell';

// View navigation never creates a document transaction. Keep its anchor in
// document coordinates, so changes to zoom or pane geometry share one rule.
export function canvasViewport(node:HTMLElement, options:ViewportOptions) {
  let anchor:ViewAnchor|undefined, frame=0, touchDriven=false, disposed=false,keepScreenPoint=false;
  let panPending=false,panX=0,panY=0;
  const pager=new SlideWheelPager();
  let pointerViewport:{id:number;width:number;height:number}|undefined;
  const rememberPointer=(event:PointerEvent)=>{
    if(event.button!==0||!(event.target instanceof Element)||event.target.closest('button:not(.resize-handle),a,input,textarea,select,[contenteditable="true"],[popover],.prototype-shell'))return;
    pointerViewport={id:event.pointerId,width:innerWidth,height:innerHeight};
  };
  const finishPointer=(event:PointerEvent)=>{
    if(pointerViewport?.id!==event.pointerId)return;
    const previous=pointerViewport;pointerViewport=undefined;
    // Resize dispatch may lag behind pointerup. Compare the actual dimensions
    // before the object's handler can commit a gesture from the old viewport.
    if(previous.width!==innerWidth||previous.height!==innerHeight)options.cancel();
  };
  const cancelPointer=(event:PointerEvent)=>{if(pointerViewport?.id===event.pointerId)pointerViewport=undefined;};
  const scope=node.closest('.editor-app');
  const interact=()=>pager.reset();
  let focused=document.activeElement instanceof HTMLElement&&scope?.contains(document.activeElement)?document.activeElement:undefined;
  const focus=(event:Event)=>{if(event.target instanceof HTMLElement)focused=event.target;};
  function recoverFocus() {
    if(!focused?.isConnected||!document.hasFocus()||document.querySelector('dialog:modal'))return;
    if(document.activeElement!==focused&&document.activeElement!==document.body)return;
    const available=(target:HTMLElement|null)=>Boolean(target?.isConnected&&target.getClientRects().length&&!target.closest('[inert],[hidden]')&&getComputedStyle(target).visibility!=='hidden');
    if(available(focused))return;
    const fallback=focused.closest('.slide-rail')?scope?.querySelector<HTMLElement>('.slide-thumb.current'):scope?.querySelector<HTMLElement>('.property-panel:not([inert]) .panel-close');
    (available(fallback??null)?fallback:node)?.focus({preventScroll:true});
  }
  const artwork=()=>node.querySelector<HTMLElement>('.stage-canvas');
  function margins() {
    // Leave room to keep the pinch/wheel anchor when one axis nearly fits.
    // The gutters belong to the workspace, never the slide or its export.
    node.style.setProperty('--canvas-pan-x',`${options.fit?0:node.clientWidth/2}px`);
    node.style.setProperty('--canvas-pan-y',`${options.fit?0:node.clientHeight/2}px`);
  }
  function capture(horizontal=.5,vertical=.5) {
    const art=artwork();if(!art||!options.scale)return undefined;
    return captureViewAnchor(geometry(art),horizontal,vertical);
  }
  function geometry(art:HTMLElement):ViewGeometry {return {width:node.clientWidth,height:node.clientHeight,left:node.clientLeft,top:node.clientTop,
    scrollX:node.scrollLeft,scrollY:node.scrollTop,artX:art.offsetLeft,artY:art.offsetTop,scale:options.scale};}
  function reconcile() {
    frame=0;if(disposed)return;
    margins();const art=artwork();if(!art)return;
    if(options.fit)node.scrollTo(0,0);
    else if(!anchor)node.scrollTo(0,0);
    else if(!touchDriven&&!node.hasAttribute('data-touch-navigating')) {
      const scroll=scrollForAnchor(anchor,geometry(art),keepScreenPoint);node.scrollTo(scroll.left,scroll.top);
    }
    touchDriven=false;keepScreenPoint=false;anchor=capture();recoverFocus();
  }
  function schedule() {if(!frame)frame=requestAnimationFrame(reconcile);}
  const scrolled=()=>{if(!frame)anchor=capture();};
  function wheel(event:WheelEvent,replay=false) {
    if(!replay&&event.defaultPrevented||!(event.target instanceof Element)||event.target.closest('button,a,input,textarea,select,[popover],.prototype-shell'))return;
    const navigation=canvasWheel(event,{width:node.clientWidth,height:node.clientHeight});
    if(!navigation)return;
    const art=artwork(),style=getComputedStyle(node);
    const fits=options.fit||Boolean(art&&art.offsetHeight<=node.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)+1);
    const typing=document.activeElement instanceof Element&&Boolean(document.activeElement.closest('input,textarea,[contenteditable="true"]'));
    if(pagesWithWheel(navigation,{fits,blocked:options.pageBlocked||Boolean(pointerViewport)||typing,shift:event.shiftKey})){
      event.preventDefault();const direction=pager.take(navigation.kind==='pan'?navigation.y:0,event.timeStamp);
      if(direction){options.cancel();options.page(direction);}return;
    }
    pager.reset();
    if(navigation.kind==='pan'&&!options.fit&&!panPending&&!(event.shiftKey&&!event.deltaX)&&!replay)return;
    event.preventDefault();
    if(navigation.kind==='zoom')zoomWheel({x:event.clientX,y:event.clientY,delta:navigation.delta});
    else void panWheel(navigation.x,navigation.y);
  }
  async function panWheel(x:number,y:number) {
    panX+=x;panY+=y;if(panPending)return;
    panPending=true;const key=options.key;
    // Leaving fit adds workspace gutters. Preserve the artwork's current anchor
    // before applying the first scroll, so navigation starts without a jump.
    if(options.fit){anchor=capture();options.zoom(options.scale);}
    await tick();
    if(!disposed&&options.key===key){
      cancelAnimationFrame(frame);reconcile();
      node.scrollBy({left:panX,top:panY,behavior:'instant'});anchor=capture();
    }
    panPending=false;panX=0;panY=0;
  }
  function zoomWheel(point:{x:number;y:number;delta:number}) {
    const rect=node.getBoundingClientRect(),delta=point.delta;
    anchor=capture((point.x-rect.left-node.clientLeft)/node.clientWidth,(point.y-rect.top-node.clientTop)/node.clientHeight);
    options.zoom(Math.max(.1,Math.min(4,options.scale*Math.exp(-Math.max(-120,Math.min(120,delta))*.002))));
    schedule();
  }
  function key(event:KeyboardEvent) {
    if(event.defaultPrevented||event.isComposing||event.keyCode===229||event.altKey||!(event.ctrlKey||event.metaKey)||!(event.target instanceof Element)||event.target.closest(controls)||document.querySelector('dialog:modal,[popover]:popover-open:not([role="tooltip"])'))return;
    if(!['+','=','-','0'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    zoomKey(event.key);
  }
  const zoomKey=(key:string)=>options.zoom(key==='0'?'fit':Math.round(Math.max(.1,Math.min(4,options.scale+(key==='-'?-.1:.1)))*100)/100);
  const resize=new ResizeObserver(schedule);resize.observe(node);
  const art=artwork();if(art)resize.observe(art);
  margins();anchor=capture();node.addEventListener('scroll',scrolled);node.addEventListener('wheel',wheel,{passive:false});node.addEventListener('keydown',key);
  scope?.addEventListener('focusin',focus);window.addEventListener('resize',schedule);
  scope?.addEventListener('pointerdown',interact,true);scope?.addEventListener('keydown',interact,true);
  node.addEventListener('pointerdown',rememberPointer,true);node.addEventListener('pointerup',finishPointer,true);node.addEventListener('pointercancel',cancelPointer,true);
  return {
    zoomWheel,zoomKey,
    async replay(inputs:(WheelEvent|string)[]) {
      for(const input of inputs){
        if(disposed)return;
        if(typeof input==='string')zoomKey(input);
        else wheel(input,true);
        await tick();
      }
    },
    update(next:ViewportOptions) {
      const changed=next.scale!==options.scale||next.fit!==options.fit||next.key!==options.key||next.slideKey!==options.slideKey;
      // Fit can recalculate when a new page has different surrounding controls.
      // That layout change must not release the current gesture's paging lock.
      if(next.scale!==options.scale&&!next.fit||next.fit!==options.fit||next.key!==options.key||next.pageBlocked!==options.pageBlocked)pager.reset();
      if(!changed){options=next;return;}
      const touch=node.hasAttribute('data-touch-navigating');
      // Entering manual view introduces native scrollbars. Preserve the same
      // screen point for this transition rather than its newly smaller center.
      keepScreenPoint||=options.fit&&!next.fit;
      if(next.scale!==options.scale&&!touch)options.cancel();
      if(next.key!==options.key)anchor=undefined;
      else if(next.slideKey!==options.slideKey){const art=artwork();anchor=art?{...capture()!,x:art.offsetWidth/options.scale/2,y:art.offsetHeight/options.scale/2}:undefined;}
      touchDriven||=touch;options=next;margins();
      void tick().then(()=>{if(disposed)return;const art=artwork();if(art)resize.observe(art);schedule();});
    },
    destroy(){disposed=true;cancelAnimationFrame(frame);resize.disconnect();node.removeEventListener('scroll',scrolled);node.removeEventListener('wheel',wheel);node.removeEventListener('keydown',key);scope?.removeEventListener('focusin',focus);scope?.removeEventListener('pointerdown',interact,true);scope?.removeEventListener('keydown',interact,true);window.removeEventListener('resize',schedule);node.removeEventListener('pointerdown',rememberPointer,true);node.removeEventListener('pointerup',finishPointer,true);node.removeEventListener('pointercancel',cancelPointer,true);node.style.removeProperty('--canvas-pan-x');node.style.removeProperty('--canvas-pan-y');},
  };
}
