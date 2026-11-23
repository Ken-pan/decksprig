import type JSZip from 'jszip';
import type {Deck} from './model';
import {fontFamilyKey} from './font-stack';
import {typographyUses} from './font-usage';
import {nativeFontPolicy} from './pptx-font-policy';
import {embedFontLicenses} from './pptx-font-licenses';
import type {ImportedPptxFonts} from './pptx-imported-fonts';
declare const __DECK_NATIVE_FONT_CODECS__:boolean;
/** The Figma sandbox exports measured geometry but has no embedded font files. */
export const nativeFontCodecs=typeof __DECK_NATIVE_FONT_CODECS__==='undefined'||__DECK_NATIVE_FONT_CODECS__;
export type PptxFontLoader=(path:string)=>Promise<Uint8Array>;
const browserLoader:PptxFontLoader=async path=>{const r=await fetch(path);if(!r.ok)throw new Error('Native font data could not load. Retry the export.');return new Uint8Array(await r.arrayBuffer());};
export type NativePptxFace={family:string;style:'regular'|'bold'|'italic'|'boldItalic';file?:string;bytes?:Uint8Array;fsType:number;license?:string;notice?:string};
type Face=NativePptxFace;
/** Full fonts allow future edits. Only bundled, verified OFL faces are embedded. */
export async function embedPptxFonts(zip:JSZip,deck:Deck,load:PptxFontLoader=browserLoader,prepared?:ImportedPptxFonts):Promise<boolean>{
  if(load===browserLoader&&typeof location==='undefined')return false;
  prepared??=nativeFontCodecs&&deck.fonts?.length?await (await import('./pptx-imported-fonts')).prepareImportedPptxFonts(deck):undefined;
  const raw=await load('/fonts/pptx/manifest.json'),faces=JSON.parse(new TextDecoder().decode(raw)) as Face[];
  const needed=new Map<string,Set<Face['style']>>(),eastAsian=nativeFontPolicy(deck,prepared?.han),imported=new Set(deck.fonts?.map(f=>fontFamilyKey(f.family)));
  function add(family:string,weight:number,italic:boolean){
    const key=fontFamilyKey(family);if(imported.has(key))return;
    const styles=needed.get(key)??new Set<Face['style']>();
    styles.add(weight>=600?(italic?'boldItalic':'bold'):(italic?'italic':'regular'));needed.set(key,styles);
  }
  for(const use of typographyUses(deck.slides,deck.onlineFonts,false)){
    add(use.family,use.weight,use.italic);
    if(/[\p{Script=Han}\u3000-\u303f\uff00-\uffef]/u.test(use.text))add(eastAsian(use.family),use.weight,use.italic);
  }
  // Theme Latin faces are editable even before their first placeholder is filled.
  if(deck.designSystem)for(const role of ['title','body']as const)add(deck.designSystem.typography[role].fontFamily,400,false);
  const selected:Face[]=[...prepared?.faces??[]];
  for(const [key,styles]of needed){
    const available=faces.filter(f=>fontFamilyKey(f.family)===key);
    for(const style of styles){
      const face=available.find(f=>f.style===style)??available.find(f=>f.style===(style==='boldItalic'?'bold':'regular'))??available[0];
      if(face&&!selected.includes(face))selected.push(face);
    }
  }
  if(!selected.length)return false;
  const order:Face['style'][]=['regular','bold','italic','boldItalic'];selected.sort((a,b)=>order.indexOf(a.style)-order.indexOf(b.style));
  let rels=await zip.file('ppt/_rels/presentation.xml.rels')!.async('string'),xml=await zip.file('ppt/presentation.xml')!.async('string'),content=await zip.file('[Content_Types].xml')!.async('string');
  let rel=Math.max(0,...[...rels.matchAll(/Id="rId(\d+)"/g)].map(m=>Number(m[1])))+1;const entries=new Map<string,string[]>();
  for(const [i,face] of selected.entries()){
    if(!face.bytes&&face.fsType!==0)throw new Error('This font does not permit full editable embedding.');
    const bytes=face.bytes??await load(face.file!),data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(data.getUint16(34,true)!==0x504c||data.getUint32(0,true)!==bytes.byteLength)throw new Error('Native font payload is invalid.');
    const id=`rId${rel++}`,path=`fonts/template-font-${i+1}.fntdata`;zip.file('ppt/'+path,bytes);
    rels=rels.replace('</Relationships>',`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="${path}"/></Relationships>`);
    entries.set(face.family,[...(entries.get(face.family)??[]),`<p:${face.style} r:id="${id}"/>`]);
  }
  const esc=(v:string)=>v.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  const list=`<p:embeddedFontLst>${[...entries].map(([family,refs])=>`<p:embeddedFont><p:font typeface="${esc(family)}"/>${refs.join('')}</p:embeddedFont>`).join('')}</p:embeddedFontLst>`;
  xml=xml.replace(/ embedTrueTypeFonts="[^"]*"| saveSubsetFonts="[^"]*"/g,'').replace(/<p:presentation\b/,'<p:presentation embedTrueTypeFonts="1" saveSubsetFonts="0"');
  xml=xml.replace(/(<p:defaultTextStyle\b|<p:extLst\b|<\/p:presentation>)/,list+'$1');
  if(!content.includes('Extension="fntdata"'))content=content.replace('</Types>','<Default Extension="fntdata" ContentType="application/x-fontdata"/></Types>');
  zip.file('ppt/presentation.xml',xml);zip.file('ppt/_rels/presentation.xml.rels',rels);zip.file('[Content_Types].xml',content);
  await embedFontLicenses(zip,selected,load);
  return true;
}
