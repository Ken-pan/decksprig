import type {Bounds} from './core/interactions';

/** Fit rendered, rotated selection bounds without changing document geometry. */
export function selectionView(bounds:Bounds,width:number,height:number) {
  if (![bounds.x,bounds.y,bounds.w,bounds.h,width,height].every(Number.isFinite) || bounds.w<=0 || bounds.h<=0 || width<=0 || height<=0) return null;
  const padding=Math.min(80,width/4,height/4);
  return {x:bounds.x+bounds.w/2,y:bounds.y+bounds.h/2,scale:Math.max(.1,Math.min(4,(width-padding*2)/bounds.w,(height-padding*2)/bounds.h))};
}
