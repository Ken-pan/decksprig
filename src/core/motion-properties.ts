import type {ElementAnimation, SlideElement} from './model';
import {defaultAnimation} from './motion';

/** Locked values are readable, but do not affect an editable selection's state. */
export function motionPropertyState<K extends keyof ElementAnimation>(selection:SlideElement[], key:K) {
  const editable=selection.filter(item=>!item.locked),items=editable.length?editable:selection;
  const values=items.map(item=>{
    const animation={...defaultAnimation,...item.animation};
    return (key==='withTransition'?Boolean(animation.withTransition):key==='phase'?animation.phase??'in':animation[key]) as ElementAnimation[K];
  });
  return {value:values[0]??(key==='phase'?'in':defaultAnimation[key]),mixed:values.some(value=>key==='easingBezier'?JSON.stringify(value)!==JSON.stringify(values[0]):value!==values[0])};
}
