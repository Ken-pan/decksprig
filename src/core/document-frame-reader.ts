import {DOCUMENT_FRAME_HEADER_LIMIT,DOCUMENT_FRAME_MAX_ASSET,DOCUMENT_FRAME_TYPE,documentFramePrefixes} from './document-frame-format.mjs';
import {adoptDocumentFileRevision} from './document-revision';
import {jsonRequest} from './json-request';
import {MEDIA_REVISION_HEADER} from './document-media-update';

const invalid = () => new Error('The document transfer is incomplete or invalid. Reopen the document to try again.');
const jsonDecoder = new TextDecoder('utf-8',{fatal:true});
const readLength = (bytes:Uint8Array,offset=0) => new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(offset);

class ByteReader {
  private chunk: Uint8Array = new Uint8Array();
  private offset = 0;
  constructor(private reader: ReadableStreamDefaultReader<Uint8Array>) {}

  async read(length: number) {
    if(length<=this.chunk.length-this.offset){
      const result=this.chunk.subarray(this.offset,this.offset+length);
      this.offset+=length;
      return result;
    }
    const result=new Uint8Array(length);
    let written=0;
    while(written<length){
      if(this.offset===this.chunk.length){
        const part=await this.reader.read();
        if(part.done)throw invalid();
        this.chunk=part.value;
        this.offset=0;
      }
      const count=Math.min(length-written,this.chunk.length-this.offset);
      result.set(this.chunk.subarray(this.offset,this.offset+count),written);
      this.offset+=count;
      written+=count;
    }
    return result;
  }

  async end() {
    if(this.offset!==this.chunk.length)throw invalid();
    for(;;){
      const part=await this.reader.read();
      if(part.done)return;
      if(part.value.length)throw invalid();
    }
  }
}

export async function readDocumentFrameBody(body: ReadableStream<Uint8Array>, base64:(value: Uint8Array)=>string) {
  const reader=body.getReader(), bytes=new ByteReader(reader);
  try{
    const size=readLength(await bytes.read(4));
    if(!size||size>DOCUMENT_FRAME_HEADER_LIMIT)throw invalid();
    const {count,...manifest}=JSON.parse(jsonDecoder.decode(await bytes.read(size)));
    if(manifest.schema!=='deck-studio/file-1'||!Number.isInteger(count)||count<1||count>4000||Object.hasOwn(manifest,'assets'))throw invalid();
    const assets:string[]=[];
    let characters=0;
    for(let index=0;index<count;index++){
      const frame=await bytes.read(5),tag=frame[0],length=readLength(frame,1),prefix=documentFramePrefixes[tag];
      if(prefix===undefined||!length||length>(tag?DOCUMENT_FRAME_MAX_ASSET*3/4:DOCUMENT_FRAME_MAX_ASSET*6+2))throw invalid();
      const data=await bytes.read(length);
      const value:unknown=tag?prefix+base64(data):JSON.parse(jsonDecoder.decode(data));
      if(typeof value!=='string'||value.length>DOCUMENT_FRAME_MAX_ASSET||(characters+=value.length)>256_000_000)throw invalid();
      assets.push(value);
    }
    await bytes.end();
    return {...manifest,assets};
  } catch(error){
    void reader.cancel(error).catch(()=>{});
    throw error;
  } finally { reader.releaseLock(); }
}

export async function readLocalDocumentResponse<T>(url:string,response:Response,options?:Parameters<typeof jsonRequest>[4]):Promise<T> {
  if(!response.ok||response.headers.get('Content-Type')?.split(';',1)[0].trim().toLowerCase()!==DOCUMENT_FRAME_TYPE){
    return jsonRequest<T>(url,'GET',undefined,async()=>response,options);
  }
  options?.onMediaToken?.(response.headers.get(MEDIA_REVISION_HEADER));
  if(!response.body)throw invalid();
  const toBase64=(Uint8Array.prototype as Uint8Array & {toBase64:()=>string}).toBase64;
  const envelope=await readDocumentFrameBody(response.body,value=>toBase64.call(value));
  return await adoptDocumentFileRevision(envelope) as T;
}
