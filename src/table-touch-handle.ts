import type {SlideElement} from './core/model';
import {resizeCursor} from './core/interactions';
import {visualBounds} from './ui-viewport';
import {tableHandlePoint} from './core/table-handle-placement';
import './table-touch-handle.css';

type Options={root?:HTMLElement;element:SlideElement;scale:number;axis:'row'|'column';boundary:number;floating:boolean;active:boolean};
/** Keep the selected resize target outside clipped slide content and inside the workspace. */
export function floatingTableHandle(node:HTMLElement,initial:Options){
  let options=initial,marker:Comment|undefined,frame=0,observer:ResizeObserver|undefined;
  function position(){
    if(!marker||!options.root)return;
    const {element:e,scale,axis,boundary}=options,r=options.root.getBoundingClientRect(),a=e.rotation*Math.PI/180;
    const lx=(axis==='column'?boundary-e.w/2:e.w/2+26/scale)*(e.flipX?-1:1),ly=(axis==='row'?boundary-e.h/2:e.h/2+26/scale)*(e.flipY?-1:1);
    const preferred={x:r.left+r.width/2+(lx*Math.cos(a)-ly*Math.sin(a))*scale,y:r.top+r.height/2+(lx*Math.sin(a)+ly*Math.cos(a))*scale};
    const v=visualBounds(),stage=options.root.closest('.canvas-stage')?.getBoundingClientRect(),dock=document.querySelector('.canvas-insert-dock')?.getBoundingClientRect();
    const left=Math.max(v.left,stage?.left??v.left),right=Math.min(v.left+v.width,stage?.right??v.left+v.width),top=Math.max(v.top,stage?.top??v.top),bottom=Math.min(v.top+v.height,stage?.bottom??v.top+v.height,dock&&dock.width>0&&dock.height>0?dock.top-8:Infinity);
    const paper=options.root.closest('.slide-render')?.getBoundingClientRect();
    const {x,y}=tableHandlePoint(preferred,axis,r,{left,top,width:Math.max(1,right-left),height:Math.max(1,bottom-top)},paper,Math.abs(e.rotation%180)<.01);
    Object.assign(node.style,{position:'fixed',left:`${x-22}px`,top:`${y-22}px`,right:'auto',bottom:'auto',width:'44px',height:'44px',transform:'none',zIndex:'155',cursor:resizeCursor(e,axis==='row'?'s':'e')});node.style.setProperty('--handle-unit','1px');
  }
  function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(position);}
  function detach(){
    if(!marker)return;cancelAnimationFrame(frame);observer?.disconnect();observer=undefined;
    window.removeEventListener('resize',schedule);document.removeEventListener('scroll',schedule,true);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);
    marker.before(node);marker.remove();marker=undefined;node.classList.remove('floating-table-handle');
    for(const name of ['position','left','top','right','bottom','width','height','transform','z-index','cursor','--handle-unit'])node.style.removeProperty(name);
    node.style.setProperty(options.axis==='column'?'left':'top',`${options.boundary/(options.axis==='column'?options.element.w:options.element.h)*100}%`);
  }
  function update(next:Options){
    options=next;
    if(!options.floating||!options.active||!options.root){detach();return;}
    if(!marker){marker=document.createComment('table resize handle');node.before(marker);document.body.append(node);node.classList.add('floating-table-handle');window.addEventListener('resize',schedule);document.addEventListener('scroll',schedule,true);window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);observer=new ResizeObserver(schedule);observer.observe(options.root);const stage=options.root.closest('.canvas-stage');if(stage)observer.observe(stage);}
    position();schedule();
  }
  update(options);
  return {update,destroy(){detach();cancelAnimationFrame(frame);}};
}
