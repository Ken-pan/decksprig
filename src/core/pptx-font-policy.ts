import type JSZip from 'jszip';
import type {Deck} from './model';
import {findFont} from './fonts';
import {cjkFallback,fontFamilyKey,sameFontFamily} from './font-stack';

/** Keep unknown/imported CJK coverage intact; known Latin faces use the canvas fallback. */
export function nativeFontPolicy(deck:Pick<Deck,'fonts'|'onlineFonts'>,importedHan?:Map<string,boolean>){
  const imported=new Set(deck.fonts?.map(f=>fontFamilyKey(f.family)));
  const online=new Map(deck.onlineFonts?.map(f=>[fontFamilyKey(f.family),f]));
  return (family:string):string=>{
    if(/^\+(mj|mn)-lt$/.test(family))return family.replace(/lt$/,'ea');
    const key=fontFamilyKey(family),font=online.get(key)??findFont(family);
    if(imported.has(key))return importedHan?.get(key)===false?cjkFallback(family)??family:family;
    if(!font||font.chinese)return family;
    return cjkFallback(family,font.category)??family;
  };
}
const decode=(text:string)=>text.replace(/&(?:amp|lt|gt|apos|quot);|&#(?:x[\da-f]+|\d+);/gi,entity=>{
  const named:Record<string,string>={'&amp;':'&','&lt;':'<','&gt;':'>','&apos;':"'",'&quot;':'"'};
  return named[entity]??String.fromCodePoint(parseInt(entity.slice(entity[2].toLowerCase()==='x'?3:2,-1),entity[2].toLowerCase()==='x'?16:10));
});
const escape=(text:string)=>text.replace(/[&"<>]/g,c=>({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[c]!));
/** Apply after all writers, including themed placeholders, tables and chart labels. */
export async function bindPptxEastAsianFonts(zip:JSZip,deck:Deck,importedHan?:Map<string,boolean>){
  const family=nativeFontPolicy(deck,importedHan);let changed=false;
  for(const [path,file]of Object.entries(zip.files)){
    if(!/^ppt\/(?:slides|slideLayouts|slideMasters|charts|theme)\/[^/]+\.xml$/.test(path))continue;
    const source=await file.async('string'),theme=path.startsWith('ppt/theme/');
    const result=source.replace(/(<a:latin\b[^>]*\btypeface="([^"]*)"[^>]*\/>)(\s*<a:ea\b[^>]*\/>\s*)?/g,(original,latin,raw,ea)=>{
      const primary=decode(raw),declared=ea?.match(/\btypeface="([^"]*)"/)?.[1],next=family(primary);
      if(next===primary&&!findFont(primary)&&!deck.onlineFonts?.some(f=>sameFontFamily(f.family,primary)))return original;
      if(declared!==undefined&&decode(declared)===next)return original;
      // Preserve an explicitly different East Asian face from another writer.
      if(!theme&&declared&& !sameFontFamily(primary,decode(declared))&&!/^\+(mj|mn)-lt$/.test(primary))return original;
      return latin+`<a:ea typeface="${escape(next)}"/>`;
    });
    if(result!==source){zip.file(path,result);changed=true;}
  }
  return changed;
}
