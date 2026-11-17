import type {Deck,SlideElement} from './model';
import {fontWeights} from './fonts';
import {isTextShape,shapeTextElement} from './shape-text';
import {textPropertyState,textPropertyValues} from './text-properties';

/** Match the rendered family; mixed families offer only weights already in use. */
export function textWeightOptions(items:SlideElement[],fonts?:Deck['fonts'],onlineFonts?:Deck['onlineFonts']):number[]{
  const text=items.map(item=>isTextShape(item)?shapeTextElement(item):item);
  const family=textPropertyState(text,'fontFamily');
  return [...new Set([...(!family.mixed&&family.value?fontWeights(family.value,fonts,onlineFonts):[]),...textPropertyValues(text,'fontWeight')])].sort((a,b)=>a-b);
}
