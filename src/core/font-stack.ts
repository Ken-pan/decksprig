import fallbacks from './font-fallbacks.json';
export const fontCategories:Record<string,string>=fallbacks;
/** A self-contained factory keeps canvas and standalone delivery on the same fallback policy. */
export function createFontStack(categories:Record<string,string>){
  // Preserve normalization and dotless I. This key has Unicode default caseless
  // equivalence, including full expansions; original document names stay intact.
  function fontFamilyKey(family:string):string {
    return family.replace(/[^\x00-\x7f]/gu,c=>c==='ı'?c:c.toUpperCase().replace('ẞ','SS')).toLowerCase();
  }
  function sameFontFamily(a:string,b:string){return fontFamilyKey(a)===fontFamilyKey(b);}
  const known=new Map(Object.entries(categories).map(([family,category])=>[fontFamilyKey(family),category]));
  function cjkFallback(family:string,category=known.get(fontFamilyKey(family))):string|undefined {
    return category==='mono'?undefined:category==='serif'?'Noto Serif SC':'Noto Sans SC';
  }
  function fontStack(family:string,category=known.get(fontFamilyKey(family))) {
    return `"${family.replace(/[";{}<>\\]/g,'')}", ${category==='serif'?'"Noto Serif SC", "Songti SC", serif':category==='mono'?'monospace':'"Noto Sans SC", "PingFang SC", sans-serif'}`;
  }
  return {fontStack,cjkFallback,fontFamilyKey,sameFontFamily};
}
export const {fontStack,cjkFallback,fontFamilyKey,sameFontFamily}=createFontStack(fontCategories);
