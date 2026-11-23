import type {CanvasMotionPlayback} from './motion-runtime';

/** Editing never loads the playback runtime. Keep this gate small for startup. */
export function lazyElementPlayback(node:HTMLElement,initial:CanvasMotionPlayback){
 let latest=initial,dead=false,loading=false,control:{update:(p:CanvasMotionPlayback)=>void;destroy:()=>void}|undefined;
 function update(p:CanvasMotionPlayback){
  latest=p;if(control){control.update(p);return;}if(!p.enabled){node.style.visibility='';node.inert=false;return;}if(loading)return;
  if(!p.restored&&!p.shared&&p.animation&&p.animation.effect!=='none'&&p.animation.phase!=='out'){node.style.visibility='hidden';node.inert=true;}
  loading=true;void import('./motion-runtime').then(runtime=>{if(!dead){if(latest.enabled)control=runtime.playCanvasElement(node,latest);else{node.style.visibility='';node.inert=false;}}}).catch(()=>{if(!dead){node.style.visibility='';node.inert=false;}}).finally(()=>loading=false);
 }
 update(initial);return {update,destroy:()=>{dead=true;control?.destroy();}};
}
