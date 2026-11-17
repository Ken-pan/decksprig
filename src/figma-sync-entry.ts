import {availableFocus,restoreFocus} from './ui-focus';

/** Keep the lazy connection entry inside the current workspace controls. */
export function placeFigmaSyncStatus(node:HTMLElement){
  let target:HTMLElement|null=null,frame=0,disposed=false,focused=false,lastFocus:HTMLElement|undefined;
  const resize=new ResizeObserver(schedule);
  node.hidden=true;
  function focusChanged(event:FocusEvent){
    focused=event.target instanceof HTMLElement&&node.contains(event.target);
    if(focused)lastFocus=event.target as HTMLElement;
  }
  function releaseFocus(){
    if(!focused||document.activeElement!==document.body&&!node.contains(document.activeElement))return;
    const next=Array.from(target?.querySelectorAll<HTMLElement>('button')??[]).find(button=>!node.contains(button)&&availableFocus(button));
    focused=false;restoreFocus(next);
  }
  function hide(){node.hidden=true;releaseFocus();}
  function layout(){
    frame=0;if(disposed)return;
    const next=document.querySelector<HTMLElement>('.workspace-tools');
    if(next!==target){resize.disconnect();target=next;if(target)resize.observe(target);resize.observe(node);}
    if(!target){hide();node.remove();return;}
    if(node.parentElement!==target){node.hidden=true;target.prepend(node);}
    if(innerWidth<=760||!target.getClientRects().length){hide();return;}
    const siblings=Array.from(target.children).filter((child):child is HTMLElement=>child instanceof HTMLElement&&child!==node&&child.getClientRects().length>0);
    for(const child of siblings)resize.observe(child);
    const used=siblings.reduce((sum,child)=>{const s=getComputedStyle(child);return sum+Math.max(child.getBoundingClientRect().width,child.scrollWidth)+parseFloat(s.marginLeft||'0')+parseFloat(s.marginRight||'0');},0);
    node.dataset.compact='false';node.hidden=false;
    function fits(){
      if(!target)return false;
      const style=getComputedStyle(target),width=target.clientWidth-parseFloat(style.paddingLeft||'0')-parseFloat(style.paddingRight||'0');
      const room=width-used-(parseFloat(style.columnGap||'0')||0)*siblings.length,rect=target.getBoundingClientRect(),viewport=window.visualViewport;
      const left=viewport?.offsetLeft??0,right=left+(viewport?.width??innerWidth);
      const navigation=target.parentElement?.querySelector<HTMLElement>('.document-navigation'),nav=navigation?.getClientRects().length?navigation.getBoundingClientRect():undefined;
      return width>0&&node.getBoundingClientRect().width<=room&&rect.left>=left&&rect.right<=right&&(!nav||rect.top>=nav.bottom||rect.bottom<=nav.top||rect.left>=nav.right+8||rect.right<=nav.left-8);
    }
    if(!fits())node.dataset.compact='true';
    if(!fits()){hide();return;}
    if(focused&&document.activeElement===document.body&&availableFocus(lastFocus))lastFocus.focus({preventScroll:true});
  }
  function schedule(){if(!disposed&&!frame)frame=requestAnimationFrame(layout);}
  const mutations=new MutationObserver(schedule);
  mutations.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('focusin',focusChanged);
  window.addEventListener('resize',schedule);
  window.visualViewport?.addEventListener('resize',schedule);
  window.visualViewport?.addEventListener('scroll',schedule);
  layout();
  return {destroy(){disposed=true;cancelAnimationFrame(frame);resize.disconnect();mutations.disconnect();document.removeEventListener('focusin',focusChanged);window.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);node.remove();}};
}
