import {fontFamilyKey,sameFontFamily} from '../core/font-stack';
import type {Deck} from '../core/model';

/** Resolve exact licensed families, never silently substitute similarly named fonts. */
export async function prepareFigmaFonts(deck:Deck):Promise<Deck>{
  if(deck.provenance?.provider!=='Figma')return deck;
  const {findFont}=await import('../core/fonts');
  const families=new Set<string>();for(const s of deck.slides)for(const e of s.elements)if(e.type==='text'){families.add(e.fontFamily);for(const r of e.paragraphs?.flatMap(p=>p.runs)??e.runs??[])if(r.fontFamily)families.add(r.fontFamily);}
  const missing=[...families].filter(f=>!findFont(f)&&!deck.fonts?.some(v=>sameFontFamily(v.family,f))&&!deck.onlineFonts?.some(v=>sameFontFamily(v.family,f)));if(!missing.length)return deck;
  const available=[...deck.onlineFonts??[]],unresolved:string[]=[];
  try{
    const {onlineCatalog,onlineReference}=await import('../core/online-fonts'),catalog=await onlineCatalog();
    for(const family of missing){const exact=catalog.find(f=>sameFontFamily(f.family,family));if(exact)try{available.push(await onlineReference(exact));}catch{unresolved.push(family);}else unresolved.push(family);}
  }catch{unresolved.push(...missing);}
  const warning=unresolved.length?`Install these original fonts to compare editable text accurately: ${[...new Set(unresolved)].join(', ')}.`:undefined;
  return {...deck,...(available.length?{onlineFonts:available}:{}),slides:warning?deck.slides.map(s=>s.source?{...s,source:{...s.source,warnings:[...s.source.warnings,warning]}}:s):deck.slides};
}
