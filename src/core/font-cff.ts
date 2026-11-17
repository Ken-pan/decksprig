import {readSfnt,writeSfnt} from './font-sfnt';
import {quadraticContour} from './font-curves';
import {yieldForInput} from './text-layout';

/** Convert only outline-dependent tables; retain original glyph IDs and shaping data. */
export async function trueTypeOutlines(bytes:Uint8Array):Promise<Uint8Array>{
  const original=readSfnt(bytes);if(original.signature!==0x4f54544f)return bytes;
  if(!original.tables.has('CFF '))throw new Error('This CFF2 font could not be converted to static CFF outlines.');
  const [{default:readerImport},{default:writerImport}]=await Promise.all([import('fonteditor-core/lib/ttf/otfreader'),import('fonteditor-core/lib/ttf/ttfwriter')]);
  const Reader='default' in readerImport?readerImport.default:readerImport,Writer='default' in writerImport?writerImport.default:writerImport;
  const reader=new Reader();let object:FontCffObject;try{object=reader.read(new Uint8Array(bytes).buffer);}catch{throw new Error('The CFF outline format could not be read. Import another font file.');}finally{reader.dispose();}
  const glyphs=original.tables.get('maxp')!,count=new DataView(glyphs.buffer,glyphs.byteOffset).getUint16(4);
  if(object.glyf.length!==count)throw new Error('The CFF glyph order could not be retained.');
  let deadline=performance.now()+8;
  for(const glyph of object.glyf){
    if(performance.now()>=deadline){await yieldForInput();deadline=performance.now()+8;}
    glyph.contours=(glyph.contours??[]).map(contour=>quadraticContour(contour).reverse());
    const points=glyph.contours.flat();if(points.length>65535||glyph.contours.length>32767)throw new Error('The CFF glyph has too many native points.');
    glyph.xMin=points.length?Math.min(...points.map(p=>p.x)):0;glyph.xMax=points.length?Math.max(...points.map(p=>p.x)):0;glyph.yMin=points.length?Math.min(...points.map(p=>p.y)):0;glyph.yMax=points.length?Math.max(...points.map(p=>p.y)):0;glyph.leftSideBearing=glyph.xMin;
    let x=0,y=0;for(const p of points){if(Math.abs(p.x-x)>32767||Math.abs(p.y-y)>32767)throw new Error('The CFF coordinate deltas exceed the native font limit.');x=p.x;y=p.y;}
  }
  object.version=1;object.maxp.version=1;object.maxp.maxZones=1;delete object.CFF;delete object.VORG;
  let written:ArrayBuffer;try{written=new Writer({hinting:false}).write(object);}catch{throw new Error('The CFF outline could not be written as a native TrueType face.');}
  const generated=readSfnt(new Uint8Array(written)),tables=new Map(original.tables);
  tables.delete('CFF ');tables.delete('CFF2');tables.delete('VORG');
  for(const tag of ['glyf','loca','maxp','hmtx','hhea','head']){const table=generated.tables.get(tag);if(!table)throw new Error('The converted CFF font is incomplete.');tables.set(tag,table);}
  const oldHead=original.tables.get('head')!,newHead=tables.get('head')!.slice();newHead.set(oldHead.subarray(20,36),20);tables.set('head',newHead);
  const advance=(font:ReturnType<typeof readSfnt>,i:number)=>{const h=font.tables.get('hhea')!,m=font.tables.get('hmtx')!,n=new DataView(h.buffer,h.byteOffset).getUint16(34);return new DataView(m.buffer,m.byteOffset).getUint16(Math.min(i,n-1)*4);};
  for(let i=0;i<count;i++)if(advance(original,i)!==advance(generated,i))throw new Error('The CFF advance widths changed during export.');
  const convertedMaxp=tables.get('maxp')!;if(new DataView(convertedMaxp.buffer,convertedMaxp.byteOffset).getUint16(4)!==count)throw new Error('The CFF glyph count changed during export.');
  return writeSfnt({signature:0x00010000,tables});
}
