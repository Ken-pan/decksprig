import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
import JSZip from 'jszip';
import {readSfnt,writeSfnt,renameSfnt,fontNames,makeEot,editableEmbedding,hasHanGlyphs} from '../src/core/font-sfnt';
import {decodeFontContainer} from '../src/core/font-container';
import {instantiateFont} from '../src/core/font-instance';
import {newDeck,blankSlide,element} from '../src/core/model';
import {prepareImportedPptxFonts} from '../src/core/pptx-imported-fonts';
import {buildPptx} from '../src/core/pptx-export';

const source=()=>readFile('public/fonts/pptx/manrope-regular.ttf');
const data=(bytes:Uint8Array,kind='ttf')=>`data:font/${kind};base64,${Buffer.from(bytes).toString('base64')}`;
const checksum=(bytes:Uint8Array)=>{let sum=0;const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);for(let i=0;i<bytes.length;i+=4)sum=(sum+v.getUint32(i))>>>0;return sum;};
function woff(bytes:Uint8Array){
  const font=readSfnt(bytes),tables=[...font.tables].map(([tag,b])=>{const compressed=deflateSync(b);return {tag,bytes:compressed.length<b.length?compressed:b,original:b};});
  const out=new Uint8Array(44+tables.length*20+tables.reduce((sum,t)=>sum+Math.ceil(t.bytes.length/4)*4,0)),v=new DataView(out.buffer);out.set(Buffer.from('wOFF'));v.setUint32(4,font.signature);v.setUint32(8,out.length);v.setUint16(12,tables.length);v.setUint32(16,12+tables.length*16+tables.reduce((sum,t)=>sum+Math.ceil(t.original.length/4)*4,0));let offset=44+tables.length*20;
  tables.forEach((t,i)=>{const p=44+i*20;out.set(Buffer.from(t.tag),p);v.setUint32(p+4,offset);v.setUint32(p+8,t.bytes.length);v.setUint32(p+12,t.original.length);out.set(t.bytes,offset);offset+=Math.ceil(t.bytes.length/4)*4;});return out;
}

test('native alias rewriting preserves every static outline/layout/license table and produces sorted names and valid checksums',async()=>{
  const bytes=await source(),before=Buffer.from(bytes),font=readSfnt(bytes),originalNames=fontNames(font);
  const rebuilt=writeSfnt(renameSfnt(font,'本地 Font Alias',400,false)),result=readSfnt(rebuilt),names=fontNames(result);
  assert.equal(names.get(1),'本地 Font Alias');for(const id of [0,13,14])assert.equal(names.get(id),originalNames.get(id));
  for(const [tag,table]of font.tables)if(!['name','head','OS/2','DSIG'].includes(tag))assert.deepEqual(result.tables.get(tag),table,tag);
  assert.equal(checksum(rebuilt),0xb1b0afba);assert.deepEqual(bytes,before);
  const n=result.tables.get('name')!,v=new DataView(n.buffer,n.byteOffset,n.byteLength),keys=[];for(let i=0;i<v.getUint16(2);i++){const p=6+i*12;keys.push([0,2,4,6].map(j=>v.getUint16(p+j)).map(x=>String(x).padStart(5,'0')).join(':'));}assert.deepEqual(keys,[...keys].sort());
  const eot=makeEot(rebuilt),e=new DataView(eot.buffer);assert.equal(e.getUint32(0,true),eot.length);assert.equal(e.getUint32(4,true),rebuilt.length);assert.equal(e.getUint16(34,true),0x504c);assert.deepEqual(eot.slice(-rebuilt.length),rebuilt);
});

test('WOFF decoding retains original table bytes and rebuilds a valid SFNT checksum',async()=>{
  const bytes=await source(),original=readSfnt(bytes),decoded=await decodeFontContainer(woff(bytes)),result=readSfnt(decoded);
  assert.equal(checksum(decoded),0xb1b0afba);for(const [tag,table]of original.tables)if(!['head','DSIG'].includes(tag))assert.deepEqual(result.tables.get(tag),table,tag);
});

test('WOFF2 variable conversion retains glyph and Unicode coverage while producing actual static weights',async()=>{
  const compressed=await readFile('public/fonts/ui-manrope.woff2'),original=await decodeFontContainer(compressed),font=readSfnt(original),glyphs=new DataView(font.tables.get('maxp')!.buffer,font.tables.get('maxp')!.byteOffset).getUint16(4);
  const regular=readSfnt(await instantiateFont(original,400)),bold=readSfnt(await instantiateFont(original,700));
  for(const [weight,result]of [[400,regular],[700,bold]]as const){assert(!result.tables.has('fvar'));const maxp=result.tables.get('maxp')!,os=result.tables.get('OS/2')!;assert.equal(new DataView(maxp.buffer,maxp.byteOffset).getUint16(4),glyphs);assert.equal(new DataView(os.buffer,os.byteOffset).getUint16(4),weight);assert.deepEqual(result.tables.get('cmap'),font.tables.get('cmap'));for(const table of ['GPOS','GSUB'])assert(result.tables.has(table));}
  assert.notDeepEqual(regular.tables.get('glyf'),bold.tables.get('glyf'));assert.notDeepEqual(regular.tables.get('hmtx'),bold.tables.get('hmtx'));
});

test('editable embedding preserves permission flags, rejects restricted/print/bitmap-only fonts and allows full no-subsetting faces',async()=>{
  const bytes=await source();
  for(const [version,flags,allowed]of [[4,0,true],[4,8,true],[4,0x108,true],[4,0x100,true],[4,2,false],[4,4,false],[4,0x200,false],[4,12,false],[2,12,true],[1,0x200,true]]as const){
    const font=readSfnt(bytes),os=font.tables.get('OS/2')!.slice(),v=new DataView(os.buffer);v.setUint16(0,version);v.setUint16(8,flags);font.tables.set('OS/2',os);
    if(allowed){assert.equal(editableEmbedding(font),flags);assert.equal(new DataView(makeEot(writeSfnt(renameSfnt(font,'Allowed font',400,false))).buffer).getUint16(32,true),flags);}else assert.throws(()=>editableEmbedding(font),/does not allow editable embedding/);
  }
  assert.equal(hasHanGlyphs(readSfnt(bytes)),false);assert.equal(hasHanGlyphs(readSfnt(await readFile('public/fonts/pptx/noto-serif-sc-regular.ttf'))),true);
});

test('used imported aliases coexist with bundled CJK, retain actual styles/notices and leave the input document untouched',async()=>{
  const bytes=await readFile('public/fonts/ui-manrope.woff2'),slide=blankSlide();slide.elements=[element('text',{fontFamily:'lora',text:'Private 中文'}),element('text',{fontFamily:'LORA',fontWeight:700,text:'Bold private'}),element('text',{fontFamily:'Unused',text:'Hidden',hidden:true})];
  const deck=newDeck('Private native fonts',[slide]);deck.designSystem=undefined;deck.fonts=[{family:'LORA',name:'Original.woff2',weight:'100 900',style:'normal',data:data(bytes,'woff2')},{family:'Unused',name:'Bad font',weight:'400',style:'normal',data:'data:font/ttf;base64,QQ=='}];const before=JSON.stringify(deck);
  const prepared=await prepareImportedPptxFonts(deck);assert.deepEqual(prepared.faces.map(f=>f.style),['regular','bold']);assert.equal(prepared.han.get('lora'),false);
  const zip=await JSZip.loadAsync(await buildPptx(deck,false,async()=>({w:1,h:1}),false,async p=>new Uint8Array(await readFile('public'+p))));
  const xml=await zip.file('ppt/presentation.xml')!.async('string'),slideXml=await zip.file('ppt/slides/slide1.xml')!.async('string');assert(xml.includes('typeface="LORA"'));assert(xml.includes('typeface="Noto Serif SC"'));assert(!xml.includes('typeface="Unused"'));assert(slideXml.includes('<a:ea typeface="Noto Serif SC"/>'));
  const properties=await zip.file('docProps/custom.xml')!.async('string');assert(properties.includes('Original family:'));assert(properties.includes('Copyright:'));assert(properties.includes('License URL:'));assert.equal(JSON.stringify(deck),before);
});

test('malformed containers and unsupported embedding fail without changing font originals or the document',async()=>{
  await assert.rejects(()=>decodeFontContainer(new Uint8Array([1,2,3])),/invalid/);
  const bytes=await source(),font=readSfnt(bytes),os=font.tables.get('OS/2')!.slice();new DataView(os.buffer).setUint16(8,2);font.tables.set('OS/2',os);const restricted=writeSfnt(font);
  const s=blankSlide();s.elements=[element('text',{fontFamily:'Restricted',text:'Private'})];const d=newDeck('Restricted font',[s]);d.designSystem=undefined;d.fonts=[{family:'Restricted',name:'Restricted.ttf',weight:'400',style:'normal',data:data(restricted)}];const before=JSON.stringify(d);
  await assert.rejects(()=>prepareImportedPptxFonts(d),/Restricted.*does not allow editable embedding/);assert.equal(JSON.stringify(d),before);
});
