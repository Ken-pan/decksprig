import {automaticShapeTextColor} from './shape-label-color';
import type {SlideElement} from './model';
import {textDraftPatch} from './text-range-format';
import {lineLabelElement} from './line-label';

// Shared by the canvas and standalone HTML player; keep this factory portable.
export function createShapeTextRendering(lineLabel?: (e:SlideElement)=>SlideElement, automaticInk=automaticShapeTextColor) {
  function isTextShape(e?: Pick<SlideElement, 'type' | 'designPattern' | 'sourceRegion'>): boolean {
    return Boolean(e && ['rect', 'ellipse', 'diamond', 'line'].includes(e.type) && !e.designPattern && !e.sourceRegion);
  }
  function shapeTextElement(e: SlideElement): SlideElement {
    if(e.type==='line'&&lineLabel)return lineLabel(e);
    // Automatic contrast follows the shape fill until an explicit text color is chosen.
    const insetX = Math.min(16, e.w * .1), insetY = Math.min(12, e.h * .1);
    return {...e, type: 'text', fill: e.shapeText?.color ?? automaticInk(e.fill),
      align: e.shapeText?.align ?? 'center', verticalAlign: e.shapeText?.verticalAlign ?? 'middle',
      padding: e.padding ?? {left: insetX, right: insetX, top: insetY, bottom: insetY},
      textSizing: 'fixed', clipText: true, design: undefined, nativeTextLayout: undefined};
  }
  return {isTextShape, shapeTextElement};
}
export const {isTextShape, shapeTextElement} = createShapeTextRendering(lineLabelElement);
export {canEditText} from './shapes';

// Store label styling independently of the shape's fill and geometry.
export function shapeTextPatch(base: SlideElement, text: SlideElement): Partial<SlideElement> {
  // Contenteditable keeps a trailing <br> when emptied. A blank line label
  // should disappear instead of leaving an empty background on the connector.
  if(base.type==='line'&&!text.text.trim())text={...text,text:'',runs:undefined,paragraphs:undefined};
  const {fill, align, ...patch} = textDraftPatch(text);
  const before = shapeTextElement(base);
  return {...patch, lineHeight: text.lineHeight, letterSpacing: text.letterSpacing, shapeText: {...base.shapeText,
    ...(fill !== before.fill ? {color: fill} : {}),
    ...(align !== before.align ? {align} : {}),
    ...(text.verticalAlign !== before.verticalAlign ? {verticalAlign: text.verticalAlign} : {}),
  }};
}
