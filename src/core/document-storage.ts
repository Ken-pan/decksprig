import {digestMedia,type MediaDigestContext} from './media-digest-context';
import {z} from './schema';
import {validateDeck,type Deck} from './model';
import {packDocumentMedia,type PackedDocumentMedia} from './document-media-transport';
import {readDocumentFile,DOCUMENT_FILE_SCHEMA} from './document-file';

export const STORAGE_SCHEMA='deck-studio/storage-1' as const;
const digest=z.string().check(z.regex(/^[a-f0-9]{64}$/));
const stored=z.strictObject({schema:z.literal(STORAGE_SCHEMA),id:z.string(),revision:z.number().check(z.int()).check(z.minimum(0)),updatedAt:z.string(),deck:z.unknown(),assets:z.array(digest).check(z.minLength(1)).check(z.maxLength(4000)),references:z.array(z.strictObject({slide:z.number().check(z.int()).check(z.minimum(0)).check(z.maximum(499)),element:z.number().check(z.int()).check(z.minimum(-1)).check(z.maximum(2999)),field:z.enum(['render','src','poster']),asset:z.number().check(z.int()).check(z.minimum(0)).check(z.maximum(3999))})).check(z.minLength(1)).check(z.maxLength(100000))});
export type StoredDocument={schema:typeof STORAGE_SCHEMA;id:string;revision:number;updatedAt:string;deck:Deck;assets:string[];references:PackedDocumentMedia['references']};
export const isStoredDocument=(raw:unknown):raw is StoredDocument=>(raw as {schema?:string})?.schema===STORAGE_SCHEMA;
export async function mediaDigest(value:string,context?:MediaDigestContext):Promise<string>{return digestMedia(value,context);}

/** Only freshly read, mutable JSON is interned; editor-owned revisions are never changed. */
export function internDocumentImages<T>(raw:T,strings=new Map<string,string>()):T {
  const add=(value:unknown)=>{if(typeof value!=='string'||value.length<65536||!value.startsWith('data:image/'))return value;const found=strings.get(value);if(found!==undefined)return found;strings.set(value,value);return value;};
  const d=raw as unknown as Deck;
  if(Array.isArray(d?.slides))for(const s of d.slides){if(s.source?.render)s.source.render=add(s.source.render) as string;for(const e of s.elements??[]){if(e.src)e.src=add(e.src) as string;if(e.prototype?.poster)e.prototype.poster=add(e.prototype.poster) as string;}}
  return raw;
}
export async function prepareStoredDocument(deck:Deck,context?:MediaDigestContext,verifiedDigest?:(value:string)=>string|undefined):Promise<{record:Deck|StoredDocument;media:Map<string,string>}> {
  const packed=packDocumentMedia(deck,1024,1),media=new Map<string,string>();
  if(!packed.assets.length||packed.assets.length>4000||packed.references.length>100000||packed.references.reduce((n,r)=>n+packed.assets[r.asset].length,0)>256000000)return {record:deck,media};
  const assets:string[]=[];
  for(const value of packed.assets){
    const id=verifiedDigest?.(value)??await mediaDigest(value,context);
    assets.push(id);media.set(id,value);
  }
  return {record:{schema:STORAGE_SCHEMA,id:deck.id,revision:deck.revision,updatedAt:deck.updatedAt,deck:packed.deck,assets,references:packed.references},media};
}
function descriptor(raw:unknown){const d=stored.parse(raw);return d;}
export async function restoreStoredDocument(raw:unknown,load:(id:string)=>Promise<string>,context?:MediaDigestContext):Promise<Deck>{
  return restoreVerifiedStoredDocument(raw,async id=>{
    const value=await load(id);
    if(await mediaDigest(value,context)!==id)throw new Error('Document media is missing or damaged. Restore a storage backup before continuing.');
    return value;
  });
}
/** Assemble a document from a loader that has authenticated each returned image. */
export async function restoreVerifiedStoredDocument(raw:unknown,load:(id:string)=>Promise<string>):Promise<Deck>{
  if(!isStoredDocument(raw))return validateDeck(internDocumentImages(raw));
  const d=descriptor(raw),assets:string[]=[];
  for(const id of d.assets)assets.push(await load(id));
  const deck=readDocumentFile({schema:DOCUMENT_FILE_SCHEMA,id:d.id,deck:d.deck,assets,references:d.references});
  if(deck.revision!==d.revision||deck.updatedAt!==d.updatedAt)throw new Error('The stored document metadata does not match.');
  return deck;
}
/** Validate metadata/references without loading image bytes, for scalar history rows. */
export function storedDocumentMetadata(raw:unknown):Deck {
  if(!isStoredDocument(raw))return validateDeck(internDocumentImages(raw));
  const d=descriptor(raw),deck=readDocumentFile({schema:DOCUMENT_FILE_SCHEMA,id:d.id,deck:d.deck,assets:d.assets.map(()=> 'data:image/png;base64,AQID'),references:d.references});
  if(deck.revision!==d.revision||deck.updatedAt!==d.updatedAt)throw new Error('The stored document metadata does not match.');return deck;
}
