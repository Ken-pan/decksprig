import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import JSZip from 'jszip';import {newDeck,blankSlide,element} from '../src/core/model';import {buildPptx} from '../src/core/pptx-export';

function methods(bytes:Uint8Array){
  const data=Buffer.from(bytes),out=new Map<string,number>();
  for(let at=0;at<data.length-46;at++)if(data.readUInt32LE(at)===0x02014b50){
    const name=data.readUInt16LE(at+28),extra=data.readUInt16LE(at+30),comment=data.readUInt16LE(at+32);
    out.set(data.subarray(at+46,at+46+name).toString(),data.readUInt16LE(at+10));at+=45+name+extra+comment;
  }
  return out;
}
test('JPEG bytes remain stored without recompression while editable XML stays compressed',async()=>{
  const jpeg=await readFile('public/examples/template-assets/paper-study.jpg'),slide=blankSlide('Original JPEG');
  slide.notes='Original note';slide.elements=[element('image',{src:'data:image/jpeg;base64,'+jpeg.toString('base64')}),element('text',{text:'Editable source text'})];
  const deck=newDeck('Compressed photo',[slide]),before=JSON.stringify(deck),bytes=await buildPptx(deck,false,async()=>({w:800,h:600})),zip=await JSZip.loadAsync(bytes);
  const images=Object.keys(zip.files).filter(f=>/^ppt\/media\/.*\.jpe?g$/.test(f));assert.equal(images.length,1);assert.deepEqual(Buffer.from(await zip.file(images[0])!.async('uint8array')),jpeg);
  const encoded=methods(bytes);assert.equal(encoded.get(images[0]),0);assert.equal(encoded.get('ppt/slides/slide1.xml'),8);assert.equal(JSON.stringify(deck),before);
  assert((await zip.file('ppt/slides/slide1.xml')!.async('string')).includes('Editable source text'));
});

test('PPTX deduplicates raster data before initial ZIP generation while retaining crops and objects',async()=>{
  const {default:PptxGenJS}=await import('pptxgenjs'),write=PptxGenJS.prototype.write;
  let generatedMedia=0;
  PptxGenJS.prototype.write=async function(this:InstanceType<typeof PptxGenJS>,...args:Parameters<typeof write>){const bytes=await write.apply(this,args),zip=await JSZip.loadAsync(bytes as Uint8Array);generatedMedia=Object.values(zip.files).filter(f=>!f.dir&&f.name.startsWith('ppt/media/')).length;return bytes;} as typeof write;
  try {
    const jpeg=await readFile('public/examples/template-assets/paper-study.jpg'),src='data:image/jpeg;base64,'+jpeg.toString('base64'),slide=blankSlide();
    slide.elements=Array.from({length:12},(_,i)=>element('image',{src,fit:'fill',x:i*30,crop:{left:.1,top:.05,right:.2,bottom:.1}}));
    const deck=newDeck('Repeated original',[slide]),before=JSON.stringify(deck),zip=await JSZip.loadAsync(await buildPptx(deck));
    assert.equal(generatedMedia,1);const images=Object.values(zip.files).filter(f=>!f.dir&&f.name.startsWith('ppt/media/'));assert.equal(images.length,1);assert.deepEqual(Buffer.from(await images[0].async('uint8array')),jpeg);
    const xml=await zip.file('ppt/slides/slide1.xml')!.async('string');assert.equal((xml.match(/<p:pic>/g)||[]).length,12);assert.equal((xml.match(/<a:srcRect /g)||[]).length,12);assert.equal(JSON.stringify(deck),before);
    const {importPptx}=await import('../src/importers/pptx');const imported=await importPptx(await zip.generateAsync({type:'uint8array'}),'repeat.pptx');assert.equal(imported.slides[0].elements.length,12);assert(imported.slides[0].elements.every(e=>e.src===src&&e.crop?.left===.1));
  }finally {PptxGenJS.prototype.write=write;}
});
