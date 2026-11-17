import {open,type FileHandle} from 'node:fs/promises';
import {JSONParser} from '@streamparser/json';

const chunkBytes=65536;
const imagePrefix=Buffer.from('"data:image/');
// One cached literal and at most one pending literal. Larger strings continue
// through the original incremental decoder instead of growing the raw buffer.
const literalLimit=2*1024*1024;
const nativeJsonLimit=2*1024*1024;
const nativeDecoder=new TextDecoder('utf-8',{fatal:true});

/** Small manifests can use the native parser without staging a large legacy document. */
export async function readDocumentJson(path:string):Promise<unknown>{
 const file=await open(path,'r');
 try{
  const info=await file.stat();
  if(info.isFile()&&info.size<=nativeJsonLimit){
   const input=Buffer.allocUnsafe(info.size+1);
   let used=0;
   while(used<input.length){
    const {bytesRead}=await file.read(input,used,input.length-used,used);
    if(!bytesRead)return JSON.parse(nativeDecoder.decode(input.subarray(0,used)));
    used+=bytesRead;
   }
   // The file grew after stat. The positioned reads above left the stream at zero.
  }
  return await readStreamedFile(file);
 }finally{await file.close();}
}
function imagePrefixSoFar(parts:Buffer[]):boolean {
 let at=0;
 for(const part of parts)for(const byte of part){
  if(byte!==imagePrefix[at++])return false;
  if(at===imagePrefix.length)return true;
 }
 return true;
}

/** Bounded JSON syntax/UTF8 decoding; callers still validate the complete model. */
export async function readStreamingJson(path:string):Promise<unknown>{
 const file=await open(path,'r');
 try{return await readStreamedFile(file);}
 finally{await file.close();}
}

async function readStreamedFile(file:FileHandle):Promise<unknown>{
 const parser=new JSONParser({stringBufferSize:chunkBytes});
 const images=new Map<string,string>(),decoder=new TextDecoder('utf-8',{fatal:true});
 let result:unknown,seen=false,pendingImage:string|undefined;
 parser.onValue=({value,key,parent})=>{
  // The structural parser consumed a string in this exact value position. Its
  // real literal has already passed strict UTF8 decoding and native JSON.parse.
  if(pendingImage!==undefined){
   value=pendingImage;pendingImage=undefined;
   if(!parent||key===undefined)throw new Error('Invalid image string position.');
   Object.defineProperty(parent,key,{value,writable:true,enumerable:true,configurable:true});
  }
  if(typeof value==='string'&&value.length>=chunkBytes&&value.startsWith('data:image/')){
   const existing=images.get(value);
   if(existing!==undefined&&parent&&key!==undefined)Object.defineProperty(parent,key,{value:existing,writable:true,enumerable:true,configurable:true});
   else images.set(value,value);
  }
  if(parent===undefined){result=value;seen=true;}
 };
 const inputBuffers=[Buffer.allocUnsafe(chunkBytes),Buffer.allocUnsafe(chunkBytes)];
 let inside=false,escaped=false,last=0,buffered=false,size=0,parts:Buffer[]=[];
 let cachedLiteral:Buffer|undefined,cachedValue:string|undefined,matching=false,matched=0;
 const flush=()=>{for(const part of parts)parser.write(part);parts=[];buffered=false;};
 const append=(part:Buffer,retain=false)=>{
  if(!part.length)return;
  if(!buffered){parser.write(part);return;}
  if(matching&&cachedLiteral){
   const expected=cachedLiteral.subarray(matched,matched+part.length);
   if(expected.length===part.length&&expected.equals(part)){matched+=part.length;size+=part.length;return;}
   // Recover the byte-identical prefix on a cache miss, then validate the entire
   // new token. Prefix/length/hash equality alone never authorizes reuse.
   matching=false;if(matched)parts.push(cachedLiteral.subarray(0,matched));
  }
  parts.push(part);size+=part.length;
  if(!imagePrefixSoFar(parts)){flush();return;}
  if(size>literalLimit){flush();cachedLiteral=undefined;cachedValue=undefined;return;}
  // The input buffer is reused. Only an unfinished, uncached token owns a copy.
  if(retain)parts[parts.length-1]=Buffer.from(part);
 };
 const emitImage=(value:string)=>{
  pendingImage=value;parser.write('""');
  if(pendingImage!==undefined)throw new Error('The image token was not consumed.');
 };
 const finish=()=>{
  if(buffered){
   if(matching&&cachedLiteral&&size===cachedLiteral.length)emitImage(cachedValue!);
   else {
    if(matching&&cachedLiteral)parts.push(cachedLiteral.subarray(0,matched));
    if(size>=chunkBytes&&size>=imagePrefix.length){
     const raw=parts.length===1?parts[0]:Buffer.concat(parts,size);
     const value:unknown=JSON.parse(decoder.decode(raw));
     if(typeof value!=='string')throw new Error('Invalid image string.');
     cachedLiteral=inputBuffers.some(b=>raw.buffer===b.buffer)?Buffer.from(raw):raw;cachedValue=value;
     emitImage(value);
    }else flush();
   }
  }
  parts=[];
 };
 // Overlap one read with decoding, without allocating a new buffer per chunk.
 // The buffers alternate; retained token slices have already been copied.
 let index=0,pendingRead=file.read(inputBuffers[0],0,chunkBytes,null);
 try{
  while(true){
   const {bytesRead}=await pendingRead;if(!bytesRead)break;
   const chunk=inputBuffers[index].subarray(0,bytesRead);index=1-index;
   pendingRead=file.read(inputBuffers[index],0,chunkBytes,null);let i=0;
   while(i<chunk.length){
    let start=i;
    if(!inside){
     const quote=chunk.indexOf(34,i),end=quote<0?chunk.length:quote;
     if(end>i){
      parser.write(chunk.subarray(i,end));
      for(let j=end-1;j>=i;j--){const c=chunk[j];if(c!==32&&c!==9&&c!==10&&c!==13){last=c;break;}}
     }
     if(quote<0)break;
     inside=true;buffered=last===58;parts=[];size=0;escaped=false;
     matching=buffered&&Boolean(cachedLiteral);matched=0;start=quote;i=quote+1;
    }
    if(escaped&&i<chunk.length){i++;escaped=false;}
    let ended=false;
    while(i<chunk.length){
     const quote=chunk.indexOf(34,i),slash=chunk.indexOf(92,i);
     if(slash>=0&&(quote<0||slash<quote)){
      i=slash+2;if(i>chunk.length){escaped=true;i=chunk.length;}continue;
     }
     if(quote>=0){
      append(chunk.subarray(start,quote+1));finish();
      i=quote+1;inside=false;last=34;ended=true;break;
     }
     i=chunk.length;
    }
    if(!ended)append(chunk.subarray(start,chunk.length),true);
   }
  }
 }finally{
  // Drain the single prefetched read even when syntax/UTF8 validation throws.
  await pendingRead.catch(()=>{});
 }
 if(inside&&buffered){if(matching&&cachedLiteral)parts.push(cachedLiteral.subarray(0,matched));flush();}
 if(!parser.isEnded)parser.end();
 if(!seen)throw new Error('The document JSON is incomplete.');
 return result;
}
