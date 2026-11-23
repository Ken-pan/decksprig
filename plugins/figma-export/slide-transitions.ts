export interface NativeTransitionPlan {node:any;transition:any;authored?:boolean}
const signature=(t:any)=>JSON.stringify(t?.style==='NONE'?['NONE']:[t?.style,Math.round((t?.duration??0)*1e6),t?.curve,t?.timing?.type,t?.timing?.type==='AFTER_DELAY'?Math.round((t.timing.delay??0)*1e6):null]);
/** Read transition values only; unrelated slide content is never traversed. */
export function snapshotNativeTransitions(slides:any[]):Map<string,NativeTransitionPlan>{
 const plans=new Map<string,NativeTransitionPlan>();
 for(const node of slides)if(typeof node.getSlideTransition==='function'&&typeof node.setSlideTransition==='function'){
  const t=node.getSlideTransition();plans.set(node.id,{node,transition:{...t,timing:{...t.timing}}});
 }
 return plans;
}
/** Removing the final slide/row can reset its predecessor's outgoing edge.
 * Apply after every structural operation. Reassert non-NONE snapshots even if
 * the host exposes a cached getter during the current transaction. */
export function applyNativeTransitions(plans:Iterable<NativeTransitionPlan>,structural=false,onwrite:()=>void=()=>{}):boolean{
 let changed=false;
 for(const {node,transition,authored} of plans){
  if(node.removed||typeof node.setSlideTransition!=='function')continue;
  const readable=typeof node.getSlideTransition==='function';
  if(!authored&&!(structural&&transition.style!=='NONE')&&(!readable||signature(node.getSlideTransition())===signature(transition)))continue;
  onwrite();changed=true;
  node.setSlideTransition({...transition,duration:Math.max(.01,transition.duration),timing:{...transition.timing}});
  if(readable&&signature(node.getSlideTransition())!==signature(transition))throw new Error('Figma could not retain a slide transition after changing the slide structure. The sync was cancelled.');
 }
 return changed;
}
