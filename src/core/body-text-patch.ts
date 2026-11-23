import type {SlideElement} from './model';
import {isTextShape,shapeTextElement,shapeTextPatch} from './shape-text';
import {textDraftPatch} from './text-range-format';
export type BodyTextLayout={id:string;w:number;h:number;x?:number;y?:number;textSizing?:SlideElement['textSizing']};
/** Preserve non-text properties and fixed frames; an unchanged editor is no operation. */
export function bodyTextPatch(base:SlideElement,current:SlideElement,layout?:BodyTextLayout|null):Partial<SlideElement>|null{
  const before=isTextShape(base)?shapeTextElement(base):base;
  if(JSON.stringify(textDraftPatch(current))===JSON.stringify(textDraftPatch(before)))return null;
  return {...(isTextShape(base)?shapeTextPatch(base,current):textDraftPatch(current)),...(layout?.id===base.id&&layout.x!==undefined?{x:layout.x,y:layout.y,w:layout.w,h:layout.h,textSizing:layout.textSizing}:{})};
}
