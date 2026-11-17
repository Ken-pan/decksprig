import {readSfnt,writeSfnt,fontNames,withFontName} from './font-sfnt';
type HarfBuzz={memory:WebAssembly.Memory;_initialize:()=>void;
  malloc:(size:number)=>number;free:(ptr:number)=>void;
  hb_blob_create:(data:number,length:number,mode:number,user:number,destroy:number)=>number;hb_blob_destroy:(ptr:number)=>void;
  hb_face_create:(blob:number,index:number)=>number;hb_face_destroy:(ptr:number)=>void;hb_face_reference_blob:(ptr:number)=>number;
  hb_subset_input_get_flags:(ptr:number)=>number;hb_subset_input_set_flags:(ptr:number,flags:number)=>void;
  hb_subset_input_create_or_fail:()=>number;hb_subset_input_destroy:(ptr:number)=>void;hb_subset_input_keep_everything:(ptr:number)=>void;
  hb_subset_input_pin_all_axes_to_default:(input:number,face:number)=>number;hb_subset_input_pin_axis_location:(input:number,face:number,tag:number,value:number)=>number;
  hb_subset_or_fail:(face:number,input:number)=>number;hb_blob_get_length:(ptr:number)=>number;hb_blob_get_data:(ptr:number,length:number)=>number;
};
let engine:Promise<HarfBuzz>|undefined;
async function load(){
  const url=new URL('../../node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm',import.meta.url);
  const bytes=url.protocol==='file:'?await(await import('node:fs/promises')).readFile(url):await(async()=>{const r=await fetch(url);if(!r.ok)throw new Error('Native font conversion could not load. Retry the export.');return r.arrayBuffer();})();
  const {instance}=await WebAssembly.instantiate(bytes,{}),h=instance.exports as HarfBuzz;h._initialize();return h;
}
/** Pin variable axes while retaining every glyph, Unicode, name and layout item. */
export async function instantiateFont(bytes:Uint8Array,weight:number):Promise<Uint8Array>{
  let source=readSfnt(bytes);if(!source.tables.has('fvar')&&!source.tables.has('CFF2'))return bytes;
  let restoredNames:Uint8Array|undefined;
  if(source.tables.has('CFF2')&&!source.tables.has('fvar')){
    // HarfBuzz's CFF2 downgrade requires a pinned axis, even for static CFF2.
    // A hidden zero-range axis changes no outlines and is removed in the result.
    const used=fontNames(source);let id=256;while(used.has(id))id++;if(id>65534)throw new Error('No native font axis name is available.');
    restoredNames=source.tables.get('name');source=withFontName(source,id,'Native export axis');
    const axis=new Uint8Array(36),v=new DataView(axis.buffer),os=source.tables.get('OS/2')!,value=new DataView(os.buffer,os.byteOffset).getUint16(4);
    v.setUint16(0,1);v.setUint16(4,16);v.setUint16(6,2);v.setUint16(8,1);v.setUint16(10,20);v.setUint16(14,8);v.setUint32(16,0x77676874);
    for(const p of [20,24,28])v.setInt32(p,value*65536);v.setUint16(32,1);v.setUint16(34,id);source.tables.set('fvar',axis);bytes=writeSfnt(source);
  }
  const h=await(engine??=load()),ptr=h.malloc(bytes.length);if(!ptr)throw new Error('Not enough memory to convert this font.');
  let blob=0,face=0,input=0,result=0,out=0;
  try{
    new Uint8Array(h.memory.buffer).set(bytes,ptr);blob=h.hb_blob_create(ptr,bytes.length,0,0,0);face=h.hb_face_create(blob,0);input=h.hb_subset_input_create_or_fail();
    if(!blob||!face||!input)throw new Error('The variable font could not be read.');
    h.hb_subset_input_keep_everything(input);
    if(source.tables.has('CFF2'))h.hb_subset_input_set_flags(input,h.hb_subset_input_get_flags(input)|0x4000);
    if(source.tables.has('fvar')&&!h.hb_subset_input_pin_all_axes_to_default(input,face))throw new Error('The variable font axes could not be preserved.');
    const fvar=source.tables.get('fvar');if(fvar){if(fvar.length<16)throw new Error('The variable font axis data is invalid.');const v=new DataView(fvar.buffer,fvar.byteOffset,fvar.byteLength),offset=v.getUint16(4),count=v.getUint16(8),size=v.getUint16(10);
    if(size<20||offset+count*size>fvar.length)throw new Error('The variable font axis data is invalid.');
    for(let i=0;i<count;i++){const p=offset+i*size,tag=v.getUint32(p);if(tag===0x77676874){const low=v.getInt32(p+4)/65536,high=v.getInt32(p+12)/65536;if(!h.hb_subset_input_pin_axis_location(input,face,tag,Math.max(low,Math.min(high,weight))))throw new Error('The variable font weight could not be preserved.');}}
    }
    result=h.hb_subset_or_fail(face,input);if(!result)throw new Error('The variable font could not be converted.');out=h.hb_face_reference_blob(result);const length=h.hb_blob_get_length(out),data=h.hb_blob_get_data(out,0);const converted=new Uint8Array(h.memory.buffer,data,length).slice();if(restoredNames){const font=readSfnt(converted);font.tables.set('name',restoredNames);return writeSfnt(font);}return converted;
  }finally{if(out)h.hb_blob_destroy(out);if(result)h.hb_face_destroy(result);if(input)h.hb_subset_input_destroy(input);if(face)h.hb_face_destroy(face);if(blob)h.hb_blob_destroy(blob);h.free(ptr);}
}
