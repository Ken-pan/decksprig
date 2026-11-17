import JSZip from 'jszip';
import {readZipXml} from './safe-zip';
import {z} from './schema';
import {TextRunSchema,ParagraphSchema,ElementSchema,type Deck,type SlideElement} from './model';
import {renderedStyleFingerprint} from './native-text-layout';
import {isTextShape,shapeTextElement} from './shape-text';
import {needsPptxTextMetadata,renderedPptxTextStyles} from './pptx-text-styles';
const path='customXml/deck-studio-text.xml';
const escape=(s:string)=>s.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!));
const schema=z.strictObject({version:z.literal(2),canvasWidth:z.number().check(z.minimum(100)).check(z.maximum(10000)),canvasHeight:z.number().check(z.minimum(100)).check(z.maximum(10000)),slides:z.array(z.array(z.strictObject({name:z.string().check(z.maxLength(120)),text:z.string().check(z.maxLength(50000)),renderedText:z.string().check(z.maxLength(50000)),renderedStyle:z.string().check(z.maxLength(200000)),renderedBody:z.optional(z.string().check(z.regex(/^[a-f0-9]{64}$/))),fontWeight:z.optional(ElementSchema.shape.fontWeight),italic:z.optional(ElementSchema.shape.italic),underline:z.optional(ElementSchema.shape.underline),letterSpacing:z.optional(ElementSchema.shape.letterSpacing),align:z.optional(ElementSchema.shape.align),verticalAlign:z.optional(ElementSchema.shape.verticalAlign),textSizing:z.optional(ElementSchema.shape.textSizing),textCase:ElementSchema.shape.textCase,paragraphSpacingAtEdges:ElementSchema.shape.paragraphSpacingAtEdges,clipText:ElementSchema.shape.clipText,maxLines:z.optional(z.number().check(z.int()).check(z.minimum(1)).check(z.maximum(1000))),wrap:z.boolean(),textFit:z.optional(z.enum(['none','normal','shape'])),fontFamily:z.string().check(z.maxLength(100)),fontSize:z.number().check(z.gt(0)),strikethrough:ElementSchema.shape.strikethrough,lineHeight:z.optional(z.number().check(z.minimum(.5)).check(z.maximum(4))),fill:z.string(),x:z.number(),y:z.number(),w:z.number().check(z.gt(0)),h:z.number().check(z.gt(0)),padding:ElementSchema.shape.padding,renderedPadding:ElementSchema.shape.padding,renderedFrame:z.object({x:z.number(),y:z.number(),w:z.number().check(z.gt(0)),h:z.number().check(z.gt(0))}),runs:z.optional(z.array(TextRunSchema).check(z.maxLength(5000))),paragraphs:z.optional(z.array(ParagraphSchema).check(z.maxLength(5000))),nativeTextLayout:ElementSchema.shape.nativeTextLayout})).check(z.maxLength(3000))).check(z.maxLength(500))});
export async function writePptxTextMetadata(zip:JSZip,deck:Deck,authored=deck){
 const slides:TextMetadata[][]=[];
 for(const [i,slide] of authored.slides.entries()){
  const candidates=slide.elements.filter(e=>!e.hidden&&(e.type==='text'||isTextShape(e))).map(e=>e.type==='text'?e:{...shapeTextElement(e),id:e.id+(e.type==='line'?':label':'')}).filter(needsPptxTextMetadata);
  const entries:TextMetadata[]=[];if(!candidates.length){slides.push(entries);continue;}
  const bodies=await pptxTextBodyDigests(await zip.file(`ppt/slides/slide${i+1}.xml`)!.async('string'),new Set(candidates.map(e=>e.id)));
  for(const e of candidates){
   if(!bodies.get(e.id))continue;
   const native=deck.slides[i].elements.find(v=>v.id===e.id);if(!native)continue;
   const rendered=renderedPptxTextStyles(native.type==='text'?native:shapeTextElement(native)),scale=authored.width/deck.width;
   entries.push({name:e.id,text:e.text,renderedText:rendered.text,renderedStyle:renderedStyleFingerprint(rendered,scale),renderedBody:bodies.get(e.id),fontWeight:e.fontWeight,italic:e.italic,underline:e.underline,letterSpacing:e.letterSpacing,align:e.align,verticalAlign:e.verticalAlign,textSizing:e.textSizing,textCase:e.textCase,paragraphSpacingAtEdges:e.paragraphSpacingAtEdges,clipText:e.clipText,maxLines:e.maxLines,wrap:e.wrap,textFit:e.textFit,fontFamily:e.fontFamily,fontSize:e.fontSize,strikethrough:e.strikethrough,lineHeight:e.lineHeight,fill:e.fill,x:e.x,y:e.y,w:e.w,h:e.h,padding:e.padding,renderedPadding:{left:(rendered.padding?.left??0)*scale,right:(rendered.padding?.right??0)*scale,top:(rendered.padding?.top??0)*scale,bottom:(rendered.padding?.bottom??0)*scale},renderedFrame:{x:rendered.x*scale,y:rendered.y*scale,w:rendered.w*scale,h:rendered.h*scale},runs:e.runs,paragraphs:e.paragraphs,nativeTextLayout:e.nativeTextLayout});
  }
  slides.push(entries);
 }
 if(!slides.some(s=>s.length))return;
 const value=JSON.stringify({version:2,canvasWidth:authored.width,canvasHeight:authored.height,slides});if(value.length>5_000_000)throw new Error('The text truncation metadata is too large.');
 zip.file(path,`<?xml version="1.0" encoding="UTF-8"?><deck:text xmlns:deck="https://deck.studio/pptx/text/1">${escape(value)}</deck:text>`);
 const types=zip.file('[Content_Types].xml');if(types)zip.file('[Content_Types].xml',(await types.async('string')).replace('</Types>',`<Override PartName="/${path}" ContentType="application/xml"/></Types>`));
 const rel='ppt/_rels/presentation.xml.rels',file=zip.file(rel);if(file)zip.file(rel,(await file.async('string')).replace('</Relationships>',`<Relationship Id="rIdDeckStudioText" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../${path}"/></Relationships>`));
}
export async function readPptxTextMetadata(zip:JSZip){
 const file=zip.file(path);if(!file)return undefined;if((file as any)._data?.uncompressedSize>5_000_000)return undefined;
 try{const raw=await readZipXml(zip,path,5_000_000);if(raw.length>5_000_000)return undefined;const {XMLParser}=await import('fast-xml-parser');const parsed=new XMLParser({removeNSPrefix:true}).parse(raw);return schema.parse(JSON.parse(parsed.text));}catch{return undefined;}
}

/** Only our safe object IDs participate; duplicate names cannot restore source. */
export async function pptxTextBodyDigests(source:string,names?:ReadonlySet<string>){
 const bodies=new Map<string,string|undefined>();
 for(const shape of source.matchAll(/<p:sp(?=[\s>])[\s\S]*?<\/p:sp>/g)){
  const name=shape[0].match(/<p:cNvPr\b[^>]* name="([a-zA-Z0-9_.:-]+)"/)?.[1],body=shape[0].match(/<p:txBody>[\s\S]*?<\/p:txBody>/)?.[0];
  if(!name||!body||names&&!names.has(name))continue;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body));
  const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  bodies.set(name,bodies.has(name)?undefined:hash);
 }
 return bodies;
}
/** Font/theme passes can rewrite the native body after the source is recorded. */
export async function refreshPptxTextMetadata(zip:JSZip){
 const value=await readPptxTextMetadata(zip);if(!value)return;
 for(const [i,entries] of value.slides.entries()){
  if(!entries.length)continue;const file=zip.file(`ppt/slides/slide${i+1}.xml`);if(!file)continue;
  const bodies=await pptxTextBodyDigests(await file.async('string'),new Set(entries.map(e=>e.name)));
  for(const entry of entries)entry.renderedBody=bodies.get(entry.name);
 }
 zip.file(path,`<?xml version="1.0" encoding="UTF-8"?><deck:text xmlns:deck="https://deck.studio/pptx/text/1">${escape(JSON.stringify(value))}</deck:text>`);
}

type TextMetadata=z.infer<typeof schema>['slides'][number][number];
export function pptxSourceTextStyle(entry:TextMetadata):Partial<SlideElement>{
 if(!entry.renderedBody)return {};
 return {fontFamily:entry.fontFamily,fontSize:entry.fontSize,fill:entry.fill,fontWeight:entry.fontWeight,italic:entry.italic,underline:entry.underline,strikethrough:entry.strikethrough,letterSpacing:entry.letterSpacing,align:entry.align,verticalAlign:entry.verticalAlign,textSizing:entry.textSizing,textCase:entry.textCase};
}
export function pptxTextStyleMatches(e:SlideElement,entry:TextMetadata){
 // Importers promote the first run to the element default. Source defaults are
 // needed only for synthetic paragraph breaks; visible imported runs still
 // prove the effective native font/theme mapping before any source is restored.
 if(entry.renderedBody)return renderedStyleFingerprint({...e,...pptxSourceTextStyle(entry),textCase:entry.textCase==='upper'||entry.textCase==='small-caps'?entry.textCase:undefined})===entry.renderedStyle;
 return renderedStyleFingerprint(e)===entry.renderedStyle&&e.fontFamily===entry.fontFamily&&Math.abs(e.fontSize-entry.fontSize)<.05&&e.fill.toLowerCase()===entry.fill.toLowerCase();
}
