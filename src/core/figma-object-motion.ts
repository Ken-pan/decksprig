import {z} from './schema';
import {ElementSchema,type SlideElement} from './model';

/** Our portable playback settings, never Figma Slides' native Animate data. */
export const DECK_OBJECT_MOTION_KEY='deck-studio-object-motion-v1';
export const DECK_OBJECT_MOTION_NAMESPACE='deck_studio.motion';
const schema=z.strictObject(z.pick(ElementSchema, {animation:true,motionKey:true,motionMatch:true}).shape);
export type DeckObjectMotion=Pick<SlideElement,'animation'|'motionKey'|'motionMatch'>;
export const restoredObjectMotionWarning='Deck Studio object motion was restored from file metadata. Native Figma object animations were not captured or translated.';
const invalid='Invalid Deck Studio object motion metadata was ignored. Existing native Figma animations stay unchanged.';
const unsupported='Unsupported object motion metadata was ignored. Existing native Figma animations stay unchanged.';
const utf8Size=(value:string)=>{let size=0;for(const character of value){const code=character.codePointAt(0)!;size+=code>0xffff?4:code>0x7ff?3:code>0x7f?2:1;}return size;};

export function decodeDeckObjectMotion(value:unknown):{data?:DeckObjectMotion;warning?:string}{
 if(value===undefined||value==='')return {};
 try{
  const raw=typeof value==='string'?value:JSON.stringify(value);
  if(!raw||raw.length>4096||utf8Size(raw)>4096)return {warning:invalid};
  const envelope=JSON.parse(raw);
  if(!envelope||typeof envelope!=='object'||Array.isArray(envelope))return {warning:invalid};
  if(envelope.version!==1||envelope.source!=='deck-studio')return {warning:unsupported};
  const {version:_version,source:_source,...data}=envelope,result=schema.safeParse(data);
  return result.success?{data:result.data}:{warning:invalid};
 }catch{return {warning:invalid};}
}

export function encodeDeckObjectMotion(element:DeckObjectMotion):string{
 const data=schema.parse({animation:element.animation,motionKey:element.motionKey,motionMatch:element.motionMatch});
 if(!Object.values(data).some(value=>value!==undefined))return '';
 const raw=JSON.stringify({version:1,source:'deck-studio',...data});
 if(utf8Size(raw)>4096)throw Error('The object motion settings exceed the supported metadata limit.');
 return raw;
}

/** A missing capture capability is not an explicit request to clear settings. */
export function unreadableDeckObjectMotionNodes(bundle:any):ReadonlySet<string>{
 const unreadable=new Set<string>(),supported=bundle?.deckStudioMotionVersion===1;
 const visit=(node:any)=>{if(!node||typeof node!=='object')return;if(typeof node.id==='string'&&(!supported||node.deckStudioMotionWarning||node.deckStudioMotion!==undefined&&decodeDeckObjectMotion(node.deckStudioMotion).warning))unreadable.add(node.id);if(Array.isArray(node.children))node.children.forEach(visit);};
 if(Array.isArray(bundle?.slides))bundle.slides.forEach(visit);return unreadable;
}
