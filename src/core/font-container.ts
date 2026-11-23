import {fontTag,MAX_FONT_BYTES,readSfnt,writeSfnt} from './font-sfnt';
const invalid=()=>new Error('This font container is invalid or too large. Import another font file.');
async function inflate(bytes:Uint8Array,expected:number){
  const stream=new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate')),reader=stream.getReader(),parts:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>expected)throw invalid();parts.push(value);}}finally{await reader.cancel().catch(()=>{});}
  if(size!==expected)throw invalid();const out=new Uint8Array(size);let p=0;for(const part of parts){out.set(part,p);p+=part.length;}return out;
}
async function woff(bytes:Uint8Array){
  const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(bytes.length<44||data.getUint32(8)!==bytes.length)throw invalid();
  const count=data.getUint16(12),size=data.getUint32(16);if(!count||count>1024||44+count*20>bytes.length||size>MAX_FONT_BYTES)throw invalid();
  const blocks:Uint8Array[]=[];let total=12+count*16;
  for(let i=0;i<count;i++){const p=44+i*20,offset=data.getUint32(p+4),compressed=data.getUint32(p+8),original=data.getUint32(p+12);if(offset<44+count*20||offset+compressed>bytes.length||compressed>original||original>MAX_FONT_BYTES)throw invalid();total+=Math.ceil(original/4)*4;if(total>size)throw invalid();const source=bytes.subarray(offset,offset+compressed);blocks.push(compressed===original?source:await inflate(source,original));}
  if(total!==size)throw invalid();const out=new Uint8Array(size),v=new DataView(out.buffer),power=2**Math.floor(Math.log2(count));v.setUint32(0,data.getUint32(4));v.setUint16(4,count);v.setUint16(6,power*16);v.setUint16(8,Math.log2(power));v.setUint16(10,count*16-power*16);let offset=12+count*16;
  blocks.forEach((b,i)=>{const p=12+i*16,q=44+i*20;out.set(bytes.subarray(q,q+4),p);v.setUint32(p+4,data.getUint32(q+16));v.setUint32(p+8,offset);v.setUint32(p+12,b.length);out.set(b,offset);offset+=Math.ceil(b.length/4)*4;});return writeSfnt(readSfnt(out));
}
async function woff2(bytes:Uint8Array){
  if(bytes.length<48)throw invalid();const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(data.getUint32(8)!==bytes.length||data.getUint32(16)>MAX_FONT_BYTES)throw invalid();
  return (await import('./font-woff2')).decodeWoff2(bytes);
}
export async function decodeFontContainer(bytes:Uint8Array):Promise<Uint8Array>{
  if(bytes.length>MAX_FONT_BYTES)throw invalid();const tag=fontTag(bytes);
  const result=tag==='wOFF'?await woff(bytes):tag==='wOF2'?await woff2(bytes):bytes;
  readSfnt(result);return result;
}
