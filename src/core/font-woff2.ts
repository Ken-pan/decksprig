import {MAX_FONT_BYTES} from './font-sfnt';
// Direct ABI for the unmodified MIT WOFF2 binary. Provenance and all upstream
// runtime notices: src/vendor/woff2-codec/source.json and public/licenses.
type Codec={memory:WebAssembly.Memory;_initialize:()=>void;malloc:(n:number)=>number;free:(p:number)=>void;codec_run:(p:number,n:number,operation:number,limit:number,a:number,b:number,metadata:number,metadataSize:number,privateData:number,privateSize:number,engine:number,iterations:number)=>number;codec_status:()=>number;codec_size:()=>number;codec_release:()=>void};
let engine:Promise<Codec>|undefined;
async function load(){
  const url=new URL('../vendor/woff2-codec/codec.wasm',import.meta.url);
  const bytes=url.protocol==='file:'?await(await import('node:fs/promises')).readFile(url):await(async()=>{const r=await fetch(url);if(!r.ok)throw new Error('Native font conversion could not load. Retry the export.');return r.arrayBuffer();})();
  const {instance}=await WebAssembly.instantiate(bytes,{env:{emscripten_notify_memory_growth:()=>{}},wasi_snapshot_preview1:{proc_exit:()=>{throw new Error('The native font decoder stopped.');},fd_write:()=>0,fd_close:()=>0,fd_seek:()=>0}});
  const codec=instance.exports as Codec;codec._initialize();return codec;
}
export async function decodeWoff2(bytes:Uint8Array):Promise<Uint8Array>{
  if(typeof WebAssembly==='undefined')throw new Error('This browser cannot convert WOFF2 fonts for PowerPoint. Try another browser or a TTF font.');
  let codec:Codec;
  try{codec=await(engine??=load());}catch{engine=undefined;throw new Error('Native font conversion could not load. Try again, or use a TTF font.');}
  const pointer=codec.malloc(bytes.length+4);if(!pointer)throw new Error('Not enough memory to convert this font.');
  try{
    const heap=new Uint8Array(codec.memory.buffer);heap.set(bytes,pointer);heap.fill(0,pointer+bytes.length,pointer+bytes.length+4);
    const output=codec.codec_run(pointer,bytes.length,2,MAX_FONT_BYTES,0,0,0,0,0,0,0,15),status=codec.codec_status()&255,length=codec.codec_size();
    if(status||!output||!length||length>MAX_FONT_BYTES)throw new Error('This WOFF2 font could not be decoded within the native font limits. Import another font file.');
    return new Uint8Array(codec.memory.buffer,output,length).slice();
  }catch(error){engine=undefined;throw error;}finally{codec.codec_release();codec.free(pointer);}
}
