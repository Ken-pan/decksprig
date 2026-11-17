import type {Deck,SlideElement} from './model';
import {deckDesignSystem,TEXT_LABELS} from './deck-design-system';
import {TEXT_ROLES,type TextRole} from './design-system-schema';
import {fontFamilyKey,sameFontFamily} from './font-stack';

export function documentTextChoices(deck:Pick<Deck,'width'|'height'|'designSystem'>,elements:SlideElement[]=[]){
  const system=deckDesignSystem(deck),scale=Math.min(deck.width/1440,deck.height/810);
  return TEXT_ROLES.map(role=>{
    const style=system.typography[role];
    const values=elements.length?elements.map(e=>Math.min(500,Math.max(4,style.fontSize*scale*(e.design?.text===role?(e.design.textScale??1):1)))):[Math.min(500,Math.max(4,style.fontSize*scale))];
    return {role,label:TEXT_LABELS[role],...style,size:values.every(v=>Math.abs(v-values[0])<.001)?values[0]:undefined};
  });
}
export function documentFontChoices(deck:Pick<Deck,'designSystem'>){
  const system=deckDesignSystem(deck),choices:{family:string;roles:TextRole[];label:string}[]=[];
  for(const role of TEXT_ROLES){
    const family=system.typography[role].fontFamily,existing=choices.find(c=>sameFontFamily(c.family,family));
    if(existing)existing.roles.push(role);else choices.push({family,roles:[role],label:''});
  }
  return choices.map(c=>({...c,label:c.roles.map(r=>TEXT_LABELS[r]).join(', ')}));
}
export function documentFontRole(deck:Pick<Deck,'designSystem'>,family:string,element:SlideElement):TextRole|undefined{
  const roles=documentFontChoices(deck).find(c=>sameFontFamily(c.family,family))?.roles??[];
  return [element.design?.text,element.design?.font,'heading','body','title','caption'].find(role=>role&&roles.includes(role as TextRole)) as TextRole|undefined;
}
