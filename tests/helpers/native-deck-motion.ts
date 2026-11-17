import fixture from '../fixtures/native-deck-motion.json';
import JSZip from 'jszip';
import {deflateRawSync} from 'node:zlib';
import * as zlib from 'node:zlib';

export type Definition={name:string;kind:string;fields:{name:string;type:string|null;isArray:boolean;value:number}[]};
export function nativeFixture(){return structuredClone(fixture) as {definitions:Definition[];nodes:any[]};}
class Writer {
 bytes:number[]=[];
 byte(n:number){this.bytes.push(n&255);}
 uint(n:number){do{const b=n&127;n=Math.floor(n/128);this.byte(b|(n?128:0));}while(n);}
 int(n:number){this.uint(n<0?(~n*2+1)>>>0:n*2);}
 string(s:string){this.bytes.push(...new TextEncoder().encode(s),0);}
 float(n:number){if(n===0){this.byte(0);return;}const b=new ArrayBuffer(4),v=new DataView(b);v.setFloat32(0,n,true);const x=v.getUint32(0,true),rotated=((x<<9)|(x>>>23))>>>0;for(let i=0;i<4;i++)this.byte(rotated>>>i*8);}
 output(){return Uint8Array.from(this.bytes);}
}
function schemaBytes(definitions:Definition[]){
 const w=new Writer(),primitives=['bool','byte','int','uint','float','string','int64','uint64'];w.uint(definitions.length);
 for(const d of definitions){w.string(d.name);w.byte(['ENUM','STRUCT','MESSAGE'].indexOf(d.kind));w.uint(d.fields.length);for(const f of d.fields){w.string(f.name);const primitive=primitives.indexOf(f.type??'');w.int(d.kind==='ENUM'?0:primitive>=0?~primitive:definitions.findIndex(d=>d.name===f.type));w.byte(f.isArray?1:0);w.uint(f.value);}}
 return w.output();
}
function messageBytes(definitions:Definition[],nodes:any[]){
 const w=new Writer();function value(type:string,value:any){
  if(type==='bool'||type==='byte')w.byte(Number(value));else if(type==='uint')w.uint(value);else if(type==='int')w.int(value);else if(type==='float')w.float(value);else if(type==='string')w.string(value);else{
   const d=definitions.find(d=>d.name===type)!;
   if(d.kind==='ENUM'){w.uint(typeof value==='number'?value:d.fields.find(f=>f.name===value)!.value);return;}
   const fields=d.kind==='STRUCT'?d.fields:d.fields.filter(f=>value[f.name]!==undefined);
   for(const f of fields){if(d.kind==='MESSAGE')w.uint(f.value);const item=value[f.name];if(f.isArray){w.uint(item.length);for(const child of item)valueOf(f.type!,child);}else valueOf(f.type!,item);}
   if(d.kind==='MESSAGE')w.uint(0);
  }
 }
 function valueOf(type:string,item:any){value(type,item);}
 value('Message',{nodeChanges:nodes});return w.output();
}
export async function nativeArchive(options:{fixture?:ReturnType<typeof nativeFixture>;version?:number;body?:Uint8Array;schema?:Uint8Array;canvas?:Uint8Array;assetBytes?:number;zipCompression?:'STORE'|'DEFLATE'}={}){
 const f=options.fixture??nativeFixture(),schema=options.schema??schemaBytes(f.definitions),body=options.body??messageBytes(f.definitions,f.nodes);
 const zstd=(zlib as any).zstdCompressSync as (bytes:Uint8Array)=>Uint8Array;
 const chunks=[deflateRawSync(schema),zstd(body)],canvas=options.canvas??Buffer.concat([Buffer.from('fig-deck'),u32(options.version??106),...chunks.flatMap(b=>[u32(b.length),b])]);
 const zip=new JSZip();zip.file('canvas.fig',canvas,{compression:options.zipCompression??'STORE'});if(options.assetBytes)zip.file('images/untouched',new Uint8Array(options.assetBytes),{compression:'STORE'});
 return {archive:await zip.generateAsync({type:'uint8array'}),canvas,schema,body};
}
export function memorySource(bytes:Uint8Array){const reads:{offset:number;length:number}[]=[];return {size:bytes.length,reads,read:async(offset:number,length:number)=>{reads.push({offset,length});return bytes.slice(offset,offset+length);}};}
function u32(n:number){const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;}
