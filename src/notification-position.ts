import { visualBounds, type ViewportBounds } from './ui-viewport';

type Rect = {left:number; right:number; top:number; bottom:number};
export function notificationPlacement(size:{width:number;height:number}, viewport:ViewportBounds, options:{canvas?:Rect; footer?:Rect; top?:number} = {}) {
  const margin=viewport.width<=760?12:16, gap=12;
  const canvas=viewport.width>760?options.canvas:undefined;
  const leftEdge=Math.max(viewport.left,canvas?.left??viewport.left)+margin;
  const rightEdge=Math.min(viewport.left+viewport.width,canvas?.right??viewport.left+viewport.width)-margin;
  const width=Math.min(size.width,Math.max(1,rightEdge-leftEdge)),left=rightEdge-width;
  const topEdge=Math.max(viewport.top+margin,options.top??viewport.top+margin);
  let bottom=viewport.top+viewport.height-margin;
  const footer=options.footer;
  if(footer&&footer.left<rightEdge&&footer.right>left&&footer.bottom>topEdge)bottom=Math.min(bottom,footer.top-gap);
  const available=Math.max(0,bottom-topEdge),height=Math.min(size.height,available);
  return {left,top:Math.max(topEdge,bottom-height),width,maxHeight:available,hidden:available<Math.min(size.height,80)};
}

/** A modal's confirmation may wait; its editing area must remain usable. */
export function dialogNotificationPlacement(height:number,available:number,viewportHeight:number,bodyMinimum=120){
  const maxHeight=Math.max(0,Math.min(viewportHeight*.3,available-bodyMinimum-16));
  return {maxHeight,hidden:maxHeight<height};
}

export function positionDialogNotification(node:HTMLElement,owner:HTMLDialogElement){
  const body=owner.querySelector<HTMLElement>('.modal-body');
  let frame=0,lastField:HTMLElement|undefined;
  const apply=()=>{
    const occupied=[...owner.children].filter(child=>child!==body&&child!==node).reduce((total,child)=>{
      const css=getComputedStyle(child);return total+child.getBoundingClientRect().height+(parseFloat(css.marginTop)||0)+(parseFloat(css.marginBottom)||0);
    },0);
    const viewport=visualBounds();
    // Measure the full message even while its slot is collapsed. A partially
    // visible confirmation should wait rather than become another scroll box.
    node.style.setProperty('--notification-max-height',`${viewport.height}px`);
    const height=[...node.children].reduce((total,child)=>total+child.getBoundingClientRect().height,0);
    const result=dialogNotificationPlacement(height,owner.clientHeight-occupied,viewport.height,Math.max(120,parseFloat(getComputedStyle(owner).fontSize)*6));
    node.style.maxHeight=`${result.hidden?0:result.maxHeight}px`;
    // Pause through the same visibility event used by workspace notifications.
    const hidden=String(result.hidden);
    if(node.dataset.notificationHidden!==hidden){node.dataset.notificationHidden=hidden;node.dispatchEvent(new Event('notificationvisibilitychange'));}
    if(result.hidden&&node.contains(document.activeElement))(lastField?.isConnected?lastField:owner.querySelector<HTMLElement>('.modal-head button'))?.focus({preventScroll:true});
  };
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(apply);};
  const focus=(event:FocusEvent)=>{if(event.target instanceof HTMLElement&&body?.contains(event.target))lastField=event.target;};
  const resize=new ResizeObserver(schedule);
  for(const element of [owner,...owner.children,...node.children])resize.observe(element);
  owner.addEventListener('focusin',focus);window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);
  apply();
  return {destroy(){cancelAnimationFrame(frame);resize.disconnect();owner.removeEventListener('focusin',focus);window.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('resize',schedule);}};
}

// Use the actual footer and canvas geometry: wrapping tools, panel visibility,
// text sizing and short screens change their size independently of breakpoints.
export function positionNotification(node:HTMLElement) {
  let frame=0,settleUntil=performance.now()+400;
  const editor=document.querySelector<HTMLElement>('.editor-app');
  const rect=(selector:string)=>{
    const element=editor?.querySelector<HTMLElement>(selector);
    return element&&element.getClientRects().length&&!element.closest('[inert],[hidden]')?element.getBoundingClientRect():undefined;
  };
  const apply=()=>{
    const viewport=visualBounds(),header=rect('.topbar'),feedback=rect('.notification-feedback');
    // The insertion dock can extend above its footer. Protect the actual
    // controls, rather than the footer's sometimes empty layout rectangle.
    const controls=[...editor?.querySelectorAll<HTMLElement>('.stage-footer button,.stage-footer input,.canvas-insert-dock')??[]].filter(e=>e.getClientRects().length&&!e.closest('[inert],[hidden]')).map(e=>e.getBoundingClientRect());
    const footer=controls.length?{left:Math.min(...controls.map(r=>r.left)),right:Math.max(...controls.map(r=>r.right)),top:Math.min(...controls.map(r=>r.top)),bottom:Math.max(...controls.map(r=>r.bottom))}:undefined;
    const height=Math.ceil([...node.children].reduce((total,child)=>total+child.getBoundingClientRect().height,0)||node.scrollHeight);
    const result=notificationPlacement({width:Math.min(360,viewport.width-24),height},viewport,{canvas:rect('.canvas-stage'),footer,top:Math.max(viewport.top,header?.bottom??0,feedback?.bottom??0)+12});
    node.style.left=`${result.left}px`;node.style.top=`${result.top}px`;
    node.style.width=`${result.width}px`;node.style.maxHeight=`${result.maxHeight}px`;
    node.style.setProperty('--notification-max-height',`${result.maxHeight}px`);
    const hidden=String(result.hidden);
    if(node.dataset.notificationHidden!==hidden){node.dataset.notificationHidden=hidden;node.dispatchEvent(new Event('notificationvisibilitychange'));}
    // Layout motion can change a control's position without changing its size.
    // Follow the short transition, then leave no permanent animation loop.
    if(performance.now()<settleUntil)frame=requestAnimationFrame(apply);
  };
  const schedule=()=>{cancelAnimationFrame(frame);settleUntil=performance.now()+400;frame=requestAnimationFrame(apply);};
  const resize=new ResizeObserver(schedule);
  for(const element of [node,editor,...editor?.querySelectorAll('.workspace,.topbar,.canvas-stage,.slide-rail,.stage-footer,.canvas-insert-dock')??[]])if(element)resize.observe(element);
  const footer=editor?.querySelector('.stage-footer');
  const content=new MutationObserver(()=>{const dock=editor?.querySelector('.canvas-insert-dock');if(dock)resize.observe(dock);schedule();});
  if(footer)content.observe(footer,{childList:true,subtree:true});
  window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);
  apply();
  return {destroy(){cancelAnimationFrame(frame);resize.disconnect();content.disconnect();window.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);}};
}
