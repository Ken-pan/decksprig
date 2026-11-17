import type {Deck} from './model';
import {packDocumentMedia,restoreDocumentMedia,type PackedDocumentMedia} from './document-media-transport';
import {packDraft,restoreDraft,type PackedDraft} from './draft-media-transport';

export function packStorageRead(value:any){
 const media:PackedDocumentMedia[]=[];
 function pack(input:any):any{
  if(Array.isArray(input))return {kind:'array',value:input.map(pack)};
  if(input?.schema==='deck-studio/1'){const p=packDocumentMedia(input,65536,1);media.push(p);return {kind:'deck',value:p};}
  if(input?.schema==='deck-studio-drafts/1')return {kind:'drafts',records:input.records.map(pack)};
  if(input?.deck?.schema==='deck-studio/1'){const docs=[input.deck,...input.recoveries??[]].map(d=>packDocumentMedia(d,65536,1));const p={record:{...input,deck:docs[0].deck,...(input.recoveries?{recoveries:docs.slice(1).map(d=>d.deck)}:{})},media:docs};media.push(...docs);return {kind:'draft',value:p};}
  if(input?.firstSlide){const p=packDocumentMedia({schema:'deck-studio/1',id:input.id,title:input.title,revision:input.revision,updatedAt:input.updatedAt,width:input.width,height:input.height,slides:[input.firstSlide]} as Deck,65536,1);media.push(p);return {kind:'preview',entry:{...input,firstSlide:undefined},value:p};}
  return {kind:'plain',value:input};
 }
 const result=pack(value),assets:string[]=[],ids=new Map<string,number>();
 for(const m of media){const map=m.assets.map(value=>{let id=ids.get(value);if(id===undefined){id=assets.length;assets.push(value);ids.set(value,id);}return id;});m.references=m.references.map(ref=>({...ref,asset:map[ref.asset]}));m.assets=assets;}
 return {schema:'deck-studio/read-packet-1',value:result};
}
export function restoreStorageRead(packet:any):any{
 if(packet?.schema!=='deck-studio/read-packet-1')return packet;
 function read(p:any):any{
  if(p.kind==='array')return p.value.map(read);
  if(p.kind==='deck')return restoreDocumentMedia(p.value);
  if(p.kind==='draft')return restoreDraft(p.value as PackedDraft);
  if(p.kind==='drafts')return {schema:'deck-studio-drafts/1',records:p.records.map(read)};
  if(p.kind==='preview')return {...p.entry,firstSlide:restoreDocumentMedia(p.value).slides[0]};
  return p.value;
 }return read(packet.value);
}
