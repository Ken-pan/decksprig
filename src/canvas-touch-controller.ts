import {tick} from 'svelte';
import {touchFrame,touchZoom,type TouchPoint} from './core/touch-navigation';

export type TouchOptions = {scale:()=>number; zoom:(scale:number)=>void; cancel:()=>void; key:string; editing:boolean};
// Navigation owns only touch pointers. Object tools retain their single-pointer
// transactions; a second contact cancels that provisional transaction first.
export function canvasTouch(node:HTMLElement, options:TouchOptions) {
  const points = new Map<number,TouchPoint>();
  let navigating=false, blocked=false, pan=false, panning=false, frame=0, epoch=0;
  let origin={x:0,y:0,distance:0}, anchor={x:0,y:0}, scale=1;
  const artwork=()=>node.querySelector<HTMLElement>('.stage-canvas');
  const controls='button:not(.resize-handle),a,input,textarea,select,[contenteditable="true"],.selection-context,.prototype-shell,[popover]';
  const capture=(id:number)=>{try{node.setPointerCapture(id);}catch{/* Contact may already have ended. */}};
  function reset() {
    epoch++;cancelAnimationFrame(frame);frame=0;navigating=false;blocked=false;pan=false;panning=false;
    const ids=[...points.keys()];points.clear();
    for(const id of ids)if(node.hasPointerCapture(id))node.releasePointerCapture(id);
    delete node.dataset.touchNavigating;
  }
  function down(event:PointerEvent) {
    if(event.pointerType!=='touch'||options.editing||!(event.target instanceof Element))return;
    if(event.target.closest(controls)||!artwork())return;
    if(!points.size&&event.isPrimary===false){options.cancel();blocked=true;}
    points.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(blocked){event.preventDefault();event.stopImmediatePropagation();capture(event.pointerId);return;}
    if(points.size===1){origin=touchFrame([...points.values()]);pan=!event.target.closest('.slide-element,.resize-handle,.insertion-surface,.drawing-surface');
      const rect=artwork()!.getBoundingClientRect();anchor={x:(origin.x-rect.left)/options.scale(),y:(origin.y-rect.top)/options.scale()};return;}
    options.cancel();event.preventDefault();event.stopImmediatePropagation();
    navigating=true;pan=false;node.dataset.touchNavigating='';
    for(const id of points.keys())capture(id);
    origin=touchFrame([...points.values()]);scale=options.scale();
    const rect=artwork()!.getBoundingClientRect();anchor={x:(origin.x-rect.left)/scale,y:(origin.y-rect.top)/scale};
  }
  function move(event:PointerEvent) {
    if(!points.has(event.pointerId))return;
    points.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(blocked){event.preventDefault();event.stopImmediatePropagation();return;}
    if(navigating){
      event.preventDefault();event.stopImmediatePropagation();cancelAnimationFrame(frame);
      const current=touchFrame([...points.values()].slice(0,2)),generation=epoch;
      frame=requestAnimationFrame(async()=>{
        frame=0;options.zoom(touchZoom(scale,origin.distance,current.distance));await tick();
        if(generation!==epoch||!navigating)return;
        const rect=artwork()?.getBoundingClientRect();if(!rect)return;
        node.scrollBy(rect.left+anchor.x*options.scale()-current.x,rect.top+anchor.y*options.scale()-current.y);
      });
    }else if(pan){
      const dx=event.clientX-origin.x,dy=event.clientY-origin.y;
      if(Math.hypot(dx,dy)<8&&!panning)return;
      if(!panning){panning=true;options.cancel();node.dataset.touchNavigating='';options.zoom(options.scale());}
      capture(event.pointerId);event.preventDefault();event.stopImmediatePropagation();
      cancelAnimationFrame(frame);const point={x:event.clientX,y:event.clientY},generation=epoch;
      frame=requestAnimationFrame(async()=>{
        frame=0;await tick();if(generation!==epoch||navigating||!pan||points.size!==1)return;
        const rect=artwork()?.getBoundingClientRect();if(!rect)return;
        node.scrollBy(rect.left+anchor.x*options.scale()-point.x,rect.top+anchor.y*options.scale()-point.y);
      });
    }
  }
  function end(event:PointerEvent) {
    if(!points.has(event.pointerId))return;
    if(navigating||blocked){event.preventDefault();event.stopImmediatePropagation();blocked=true;navigating=false;epoch++;cancelAnimationFrame(frame);frame=0;delete node.dataset.touchNavigating;}
    points.delete(event.pointerId);
    if(!points.size)reset();
  }
  const lost=(event:PointerEvent)=>{if(event.target===node&&points.has(event.pointerId)){options.cancel();reset();}};
  const abort=()=>{options.cancel();reset();};
  const visibility=()=>{if(document.hidden)abort();};
  const mode=()=>node.toggleAttribute('data-canvas-touch',!options.editing);
  mode();node.addEventListener('pointerdown',down,true);node.addEventListener('pointermove',move,true);
  node.addEventListener('pointerup',end,true);node.addEventListener('pointercancel',end,true);node.addEventListener('lostpointercapture',lost);
  window.addEventListener('blur',abort);window.addEventListener('resize',abort);document.addEventListener('visibilitychange',visibility);
  return {
    update(next:TouchOptions){if(next.key!==options.key||next.editing!==options.editing)abort();options=next;mode();},
    destroy(){abort();node.removeAttribute('data-canvas-touch');node.removeEventListener('pointerdown',down,true);node.removeEventListener('pointermove',move,true);node.removeEventListener('pointerup',end,true);node.removeEventListener('pointercancel',end,true);node.removeEventListener('lostpointercapture',lost);window.removeEventListener('blur',abort);window.removeEventListener('resize',abort);document.removeEventListener('visibilitychange',visibility);},
  };
}
