import {fontFamilyKey,sameFontFamily} from './font-stack';
import {uid,type Deck,type Slide,type SlideElement,type SlideGroup,type GroupLayout} from './model';
import {cloneDocumentData as clone} from './document-data';
import {selectionBounds,type Point} from './interactions';
import {packDocumentMedia} from './document-media-transport';
import type {Operation} from './operations';
import {selectedSlideOrder} from './slide-order';

export type PastePlacement = {inPlace?:boolean;point?:Point};
export const CLIPBOARD_MIME='application/x-deck-studio';
export type ClipboardContent={format:'deck-studio/clipboard/1';kind:'objects'|'slide'|'slides';deckId:string;slideId:string;width:number;height:number;members:SlideElement[];groups:SlideGroup[];layouts:GroupLayout[];slide?:Slide;slides?:Slide[];fonts:NonNullable<Deck['fonts']>;onlineFonts:NonNullable<Deck['onlineFonts']>};
export const MAX_CLIPBOARD=80_000_000;
const snapshots=new WeakSet<ClipboardContent>();
const formats=new WeakMap<ClipboardContent,{json:string;text:string;html:string}>();
/** Only adopt freshly created, independent data. Caller-owned values are captured below. */
export function ownClipboardContent(content:ClipboardContent):ClipboardContent {
  const frozen=new WeakSet<object>();
  const freeze=(value:unknown)=>{if(!value||typeof value!=='object'||frozen.has(value))return;frozen.add(value);for(const child of Object.values(value))freeze(child);Object.freeze(value);};
  freeze(content);snapshots.add(content);return content;
}
export function captureClipboardContent(content:ClipboardContent):ClipboardContent{return snapshots.has(content)?content:ownClipboardContent(clone(content));}
/** Source crops must travel with their own render, never the destination page's render. */
export function portableMembers(members:SlideElement[],slide:Slide):SlideElement[]{
  return clone(members).map(e=>{
    if(e.type==='image'&&e.sourceRegion){
      if(slide.source?.render){e.src=slide.source.render;e.crop=e.sourceRegion;}
      else if(!e.src)throw new Error('Attach the source reference before copying this image.');
      delete e.sourceRegion;
    }
    return e;
  });
}
function carriedFonts(deck:Deck,elements:SlideElement[]):Pick<ClipboardContent,'fonts'|'onlineFonts'>{
  const families=new Set<string>();
  for(const e of elements){
    families.add(fontFamilyKey(e.fontFamily));
    for(const item of [...(e.runs??[]),...(e.paragraphs??[]).flatMap(p=>[...p.runs,...(p.endStyle?[p.endStyle]:[])]),...(e.tableStyle?.cellStyles??[]).flatMap(cell=>[cell,...(cell.runs??[])])])if(item.fontFamily)families.add(fontFamilyKey(item.fontFamily));
  }
  return {fonts:clone((deck.fonts??[]).filter(f=>families.has(fontFamilyKey(f.family)))),onlineFonts:clone((deck.onlineFonts??[]).filter(f=>families.has(fontFamilyKey(f.family))))};
}
export function clipboardContent(deck:Deck,slide:Slide,content:{members:SlideElement[];groups:ClipboardContent['groups'];layouts:ClipboardContent['layouts']},wholeSlide=false):ClipboardContent {
  const copiedSlide=wholeSlide?clone(slide):undefined;
  const members=copiedSlide?.elements??portableMembers(content.members,slide);
  const groups=copiedSlide?(copiedSlide.groups??clone(content.groups)):clone(content.groups),groupIds=new Set(groups.map(g=>g.id));
  if(!wholeSlide){
    for(const e of members)if(e.group&&!groupIds.has(e.group)){delete e.group;delete e.layoutItem;}
    for(const g of groups)if(g.parent&&!groupIds.has(g.parent)){delete g.parent;delete g.layoutItem;}
  }
  return ownClipboardContent({format:'deck-studio/clipboard/1',kind:wholeSlide?'slide':'objects',deckId:deck.id,slideId:slide.id,width:deck.width,height:deck.height,
    members,groups,layouts:copiedSlide?.autoLayouts??clone(content.layouts),...(copiedSlide?{slide:copiedSlide}:{}),...carriedFonts(deck,members)});
}
export function clipboardText(content:ClipboardContent):string {
  return (content.kind==='slides'?content.slides!.flatMap(slide=>slide.elements):content.kind==='slide'?content.slide!.elements:content.members).map(e=>e.type==='table'?e.cells?.map(row=>row.map(cell=>/[\t\r\n"]/.test(cell)?`"${cell.replaceAll('"','""')}"`:cell).join('\t')).join('\n'):e.text||e.name).filter(Boolean).join('\n');
}
export function clipboardSlides(deck:Deck,ids:readonly string[]):ClipboardContent|undefined {
  const order=selectedSlideOrder(deck.slides.map(slide=>slide.id),ids);if(!order.length)return;
  const selected=new Set(order),slides=clone(deck.slides.filter(slide=>selected.has(slide.id)));
  return ownClipboardContent({format:'deck-studio/clipboard/1',kind:'slides',deckId:deck.id,slideId:order[0],width:deck.width,height:deck.height,members:[],groups:[],layouts:[],slides,...carriedFonts(deck,slides.flatMap(slide=>slide.elements))});
}
export function clipboardFormats(content:ClipboardContent){
  const cached=snapshots.has(content)?formats.get(content):undefined;if(cached)return cached;
  // One slide representation and one copy of each repeated image, including source crops.
  const slide=content.kind==='slide'?content.slide!:{id:content.slideId,background:'#ffffff',notes:'',elements:content.members,groups:content.groups,autoLayouts:content.layouts};
  const packed=packDocumentMedia({schema:'deck-studio/1',id:'clipboard',title:'Clipboard',width:content.width,height:content.height,revision:0,updatedAt:'',slides:content.kind==='slides'?content.slides!:[slide]},1024);
  const json=JSON.stringify({format:content.kind==='slides'?'deck-studio/clipboard/3':'deck-studio/clipboard/2',kind:content.kind,deckId:content.deckId,slideId:content.slideId,width:content.width,height:content.height,fonts:content.fonts,onlineFonts:content.onlineFonts,...(content.kind==='slides'?{slides:packed.deck.slides}:{slide:packed.deck.slides[0]}),assets:packed.assets,references:packed.references});
  if(json.length>MAX_CLIPBOARD)throw new Error('This selection is too large for the clipboard. Copy fewer objects.');
  const text=clipboardText(content),escaped=text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const result={json,text,html:`<div data-deck-studio-clipboard="${encodeURIComponent(json)}"><pre>${escaped}</pre></div>`};
  if(snapshots.has(content))formats.set(content,result);return result;
}
export function pasteOffset(members:SlideElement[],layouts:ClipboardContent['layouts'],page:Pick<Deck,'width'|'height'>,step:number,placement:PastePlacement={}):Point {
  const bounds=selectionBounds(members.filter(e=>!e.hidden))??selectionBounds(members);
  if(!bounds)return{x:0,y:0};
  if(placement.inPlace)return{x:0,y:0};
  // Include padded auto-layout frames so a copied container keeps its complete footprint.
  const x=Math.min(bounds.x,...layouts.map(l=>l.x)),y=Math.min(bounds.y,...layouts.map(l=>l.y));
  const w=Math.max(bounds.x+bounds.w,...layouts.map(l=>l.x+l.w))-x,h=Math.max(bounds.y+bounds.h,...layouts.map(l=>l.y+l.h))-y;
  const wanted=placement.point??{x:x+24*step,y:y+24*step};
  return{x:Math.max(0,Math.min(wanted.x,Math.max(0,page.width-w)))-x,y:Math.max(0,Math.min(wanted.y,Math.max(0,page.height-h)))-y};
}

/** Register carried fonts in the same transaction without overwriting destination fonts. */
export function clipboardFonts(content:ClipboardContent,deck:Deck):{content:ClipboardContent;operations:Operation[]} {
  const operations:Operation[]=[],aliases=new Map<string,string>();
  for(const [key,family] of new Map(content.fonts.map(f=>[fontFamilyKey(f.family),f.family]))){
    const carried=content.fonts.filter(f=>fontFamilyKey(f.family)===key),sameFace=(a:typeof carried[number],b:typeof carried[number])=>a.weight===b.weight&&a.style===b.style;
    if(!carried.some(font=>deck.fonts?.some(f=>fontFamilyKey(f.family)===key&&sameFace(f,font)&&f.data!==font.data)))continue;
    const prefix=`${family.slice(0,70)} Copy `;
    const existing=deck.fonts?.find(f=>fontFamilyKey(f.family).startsWith(fontFamilyKey(prefix))&&carried.some(c=>sameFace(f,c)&&f.data===c.data)&&carried.every(c=>!deck.fonts?.some(other=>sameFontFamily(other.family,f.family)&&sameFace(other,c)&&other.data!==c.data)));
    aliases.set(key,existing?.family??`${prefix}${uid().slice(-8)}`);
  }
  const c=aliases.size?clone(content):content;
  const rename=(e:SlideElement)=>{e.fontFamily=aliases.get(fontFamilyKey(e.fontFamily))??e.fontFamily;for(const r of [...(e.runs??[]),...(e.paragraphs??[]).flatMap(p=>[...p.runs,...(p.endStyle?[p.endStyle]:[])])])if(r.fontFamily)r.fontFamily=aliases.get(fontFamilyKey(r.fontFamily))??r.fontFamily;for(const cell of e.tableStyle?.cellStyles??[]){if(cell.fontFamily)cell.fontFamily=aliases.get(fontFamilyKey(cell.fontFamily))??cell.fontFamily;for(const r of cell.runs??[])if(r.fontFamily)r.fontFamily=aliases.get(fontFamilyKey(r.fontFamily))??r.fontFamily;}};
  if(aliases.size){c.members.forEach(rename);c.slide?.elements.forEach(rename);c.slides?.forEach(slide=>slide.elements.forEach(rename));}
  for(const sourceFont of c.fonts){const font=aliases.size?{...sourceFont,family:aliases.get(fontFamilyKey(sourceFont.family))??sourceFont.family}:sourceFont;if(!deck.fonts?.some(f=>sameFontFamily(f.family,font.family)&&f.weight===font.weight&&f.style===font.style&&f.data===font.data))operations.push({op:'register_local_font',font});}
  for(const font of c.onlineFonts)if(!deck.onlineFonts?.some(f=>sameFontFamily(f.family,font.family)))operations.push({op:'register_online_font',font});
  return{content:c,operations};
}

export function detachClipboardStyles(e:SlideElement):SlideElement {
  const copy={...e};delete copy.design;delete copy.designPattern;delete copy.pageElement;return copy;
}
