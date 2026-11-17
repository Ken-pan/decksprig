import type {Deck} from './model';
import type {NativePptxFace} from './pptx-fonts';
import {typographyUses} from './font-usage';
import {fontFamilyKey} from './font-stack';
import {decodeBase64} from './base64';
import {decodeFontContainer} from './font-container';
import {instantiateFont} from './font-instance';
import {readSfnt,editableEmbedding,fontNames,hasHanGlyphs,renameSfnt,writeSfnt,makeEot} from './font-sfnt';
type DocumentFont=NonNullable<Deck['fonts']>[number];
export type ImportedPptxFonts={faces:NativePptxFace[];han:Map<string,boolean>};
function range(font:DocumentFont){const [low,high=low]=font.weight.split(' ').map(Number);if(low<1||high>1000||low>high)throw new Error('The imported font weight range is invalid.');return {low,high};}
function choose(fonts:DocumentFont[],weight:number,italic:boolean){
  const exact=fonts.filter(f=>(f.style==='italic')===italic),available=exact.length?exact:fonts;
  return [...available].reverse().sort((a,b)=>{const x=range(a),y=range(b);return Math.abs(weight-Math.max(x.low,Math.min(x.high,weight)))-Math.abs(weight-Math.max(y.low,Math.min(y.high,weight)));})[0];
}
/** Work on export-owned bytes, never register converted faces in the document. */
export async function prepareImportedPptxFonts(deck:Deck):Promise<ImportedPptxFonts>{
  const byFamily=new Map<string,DocumentFont[]>();
  for(const font of deck.fonts??[]){const key=fontFamilyKey(font.family);byFamily.set(key,[...byFamily.get(key)??[],font]);}
  const needed=typographyUses(deck.slides,deck.onlineFonts,false);
  if(deck.designSystem)for(const role of ['title','body']as const)needed.push({family:deck.designSystem.typography[role].fontFamily,weight:400,italic:false,text:''});
  const faces:NativePptxFace[]=[],han=new Map<string,boolean>(),decoded=new Map<string,Promise<Uint8Array>>(),done=new Set<string>();let total=0;
  for(const use of needed){
    const key=fontFamilyKey(use.family),fonts=byFamily.get(key);if(!fonts?.length)continue;
    // PresentationML exposes the same four style slots used by bundled fonts.
    const desired=use.weight>=600?700:400,source=choose(fonts,desired,use.italic),limits=range(source);
    const syntheticBold=desired===700&&limits.high<600,weight=syntheticBold?400:desired,italic=use.italic&&source.style==='italic';
    const style=weight>=600?(italic?'boldItalic':'bold'):(italic?'italic':'regular'),id=key+':'+style;
    if(done.has(id))continue;done.add(id);
    try{
      let raw=decoded.get(source.data);
      if(!raw){raw=decodeFontContainer(decodeBase64(source.data.slice(source.data.indexOf(',')+1)));decoded.set(source.data,raw);}
      const bytes=await raw,original=readSfnt(bytes),flags=editableEmbedding(original),metadata=fontNames(original);
      han.set(key,hasHanGlyphs(original));
      const instance=await instantiateFont(bytes,Math.max(limits.low,Math.min(limits.high,desired))),outlines=readSfnt(instance).signature===0x4f54544f?await (await import('./font-cff')).trueTypeOutlines(instance):instance;
      const sfnt=writeSfnt(renameSfnt(readSfnt(outlines),source.family,weight,italic)),payload=makeEot(sfnt);
      total+=payload.length;if(total>128_000_000)throw new Error('The used native fonts exceed 128 MB. Use fewer font families for PowerPoint.');
      const notice=[['Original family',metadata.get(1)],['Copyright',metadata.get(0)],['License',metadata.get(13)],['License URL',metadata.get(14)]].filter(([,value])=>value).map(([label,value])=>label+': '+value).join('\n');
      faces.push({family:source.family,style,bytes:payload,fsType:flags,notice});
    }catch(error){throw new Error(`Cannot export font “${source.family}”: ${error instanceof Error?error.message:'The font could not be converted.'}`);}
  }
  return {faces,han};
}
