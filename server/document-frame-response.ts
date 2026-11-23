import {boundedDocumentJsonParts} from '../src/core/document-json-parts';
import {documentFile,DOCUMENT_FILE_SCHEMA,DOCUMENT_FILE_IMAGE} from '../src/core/document-file';
import {storedDocumentMetadata,type StoredDocument} from '../src/core/document-storage';
import {DOCUMENT_FRAME_HEADER_LIMIT,DOCUMENT_FRAME_MAX_ASSET,documentFramePrefixes} from '../src/core/document-frame-format.mjs';
import type {Deck} from '../src/core/model';

const base64Prefixes=documentFramePrefixes.slice(1);

export function prepareDocumentFrames(deck: Deck) {
  const packed=documentFile(deck,1);
  if(packed.schema!==DOCUMENT_FILE_SCHEMA)return;
  const {assets,...metadata}=packed;
  const base64Bytes=assets.reduce((total,asset)=>
    total+(base64Prefixes.some(prefix=>asset.startsWith(prefix))?asset.length:0),0);
  if(base64Bytes<1_048_576)return;

  return frameDocument(metadata,assets,encodeDocumentAsset);
}

/** Validate a compact manifest before streaming its individually authenticated blobs. */
export function prepareStoredDocumentFrames(record:StoredDocument,load:(id:string)=>Promise<MediaFrame>){
  storedDocumentMetadata(record);
  const {id,deck,assets,references}=record;
  const uses=new Uint32Array(assets.length);
  for(const {asset} of references)uses[asset]++;
  let expanded=0;
  return frameDocument({schema:DOCUMENT_FILE_SCHEMA,id,deck,references},assets,async(id,index)=>{
    const asset=await load(id);
    expanded+=asset.characters*uses[index];
    if(asset.characters>DOCUMENT_FRAME_MAX_ASSET||expanded>256_000_000){
      throw new Error('This Deck file has invalid or incomplete image references.');
    }
    return asset;
  },true);
}

export type MediaFrame={tag:number;bytes:Buffer;characters:number};
function frameDocument(metadata:object,assets:string[],encode:(asset:string,index:number)=>MediaFrame|Promise<MediaFrame>,prefetch=false){
  const headerParts: Buffer[]=[];
  let headerLength=0;
  for(const part of boundedDocumentJsonParts({...metadata,count:assets.length})){
    headerLength+=Buffer.byteLength(part);
    if(headerLength>DOCUMENT_FRAME_HEADER_LIMIT)return;
    headerParts.push(Buffer.from(part));
  }
  return encodeDocumentFrames(headerLength,headerParts,assets,encode,prefetch);
}

// A big-endian uint32 precedes the JSON manifest. Each following asset is a
// one-byte encoding tag, uint32 length, and either binary data or a JSON string.
async function* encodeDocumentFrames(headerLength:number, headerParts:Buffer[], assets:string[],encode:(asset:string,index:number)=>MediaFrame|Promise<MediaFrame>,prefetch:boolean) {
  const size=Buffer.allocUnsafe(4);
  size.writeUInt32BE(headerLength);
  yield size;
  yield* headerParts;
  let next:Promise<MediaFrame>|undefined;
  try{
    for(let index=0;index<assets.length;index++){
      const {tag,bytes}=await(next??encode(assets[index],index));
      if(prefetch&&index+1<assets.length){
        // The next disk read overlaps this frame. Rejections are handled
        // immediately and are delivered when the consumer reaches that frame.
        next=Promise.resolve().then(()=>encode(assets[index+1],index+1));
        void next.catch(()=>{});
      }else next=undefined;
      const frame=Buffer.allocUnsafe(5);
      frame[0]=tag;
      frame.writeUInt32BE(bytes.length,1);
      yield frame;
      for(let offset=0;offset<bytes.length;offset+=262_144){
        yield bytes.subarray(offset,offset+262_144);
      }
    }
  }finally{
    await next?.catch(()=>{});
  }
}

function encodeBase64(tag:number,encoded:string,characters:number):MediaFrame|undefined {
  const bytes=Buffer.from(encoded,'base64');
  // The native decoder accepts alternate spellings. Require exact round trip
  // before omitting anything from the original file.
  if(bytes.length&&bytes.toString('base64')===encoded)return {tag,bytes,characters};
}

const jsonPrefixes=documentFramePrefixes.map(prefix=>Buffer.from('"'+prefix));
/** A canonical Base64 JSON literal can be authenticated without a full string parse. */
export function encodeCanonicalJsonAsset(raw:Buffer){
  if(raw[raw.length-1]!==34)return;
  const tag=jsonPrefixes.findIndex((prefix,index)=>index>0&&raw.subarray(0,prefix.length).equals(prefix));
  if(tag>0)return encodeBase64(tag,raw.toString('latin1',jsonPrefixes[tag].length,raw.length-1),raw.length-2);
}

export function encodeDocumentAsset(asset:string):MediaFrame {
  if(!DOCUMENT_FILE_IMAGE.test(asset))throw new Error('This Deck file has invalid or incomplete image references.');
  const tag=documentFramePrefixes.findIndex((prefix,index)=>index>0&&asset.startsWith(prefix));
  if(tag>0){
    const frame=encodeBase64(tag,asset.slice(documentFramePrefixes[tag].length),asset.length);
    if(frame)return frame;
  }
  return {tag:0,bytes:Buffer.from(JSON.stringify(asset)),characters:asset.length};
}
