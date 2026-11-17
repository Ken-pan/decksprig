import {test} from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {loadBoundedZip, readZipBytes, readZipXml, validateArchive} from '../src/core/safe-zip';
import {importPptx} from '../src/importers/pptx';

const archive = async (name: string, value: string) => new JSZip().file(name, value).generateAsync({type: 'uint8array', compression: 'DEFLATE'});
test('ordinary compressed XML stays readable and cached reads respect lower limits', async () => {
  const bytes = await archive('ppt/presentation.xml', '<presentation><title>Hello &amp; welcome</title></presentation>');
  const zip = await loadBoundedZip(bytes);
  assert.match(await readZipXml(zip, 'ppt/presentation.xml'), /Hello &amp; welcome/);
  await assert.rejects(readZipBytes(zip, 'ppt/presentation.xml', 8), /import limits/);
});
test('unsafe paths, encrypted entries and invalid directories are rejected before decompression', async () => {
  assert.throws(() => validateArchive(new Uint8Array(22)), /import limits/);
  await assert.rejects(loadBoundedZip(await archive('../outside.xml', 'payload')), /import limits/);
  const bytes = await archive('safe.xml', 'payload'), view = new DataView(bytes.buffer);
  const end = bytes.length - 22, central = view.getUint32(end + 16, true), local = view.getUint32(central + 42, true);
  view.setUint16(central + 8, 1, true); view.setUint16(local + 6, 1, true);
  assert.throws(() => validateArchive(bytes), /import limits/);
});
test('symbolic links cannot cross a native application extraction boundary', async () => {
  const bytes = await new JSZip().file('linked.xml', '/outside', {unixPermissions:'120777'}).generateAsync({type:'uint8array',platform:'UNIX'});
  assert.throws(() => validateArchive(bytes), /import limits/);
});
test('oversized declared entries are rejected before native conversion', async () => {
  const bytes = await archive('ppt/presentation.xml', '<presentation/>'), view = new DataView(bytes.buffer);
  const central = view.getUint32(bytes.length - 6, true);
  view.setUint32(central + 24, 400_000_000, true);
  assert.throws(() => validateArchive(bytes), /import limits/);
});
test('actual inflated bytes are bounded even when ZIP headers understate size', async () => {
  const bytes = await archive('payload.xml', 'x'.repeat(200_000)), view = new DataView(bytes.buffer);
  const central = view.getUint32(bytes.length - 6, true), local = view.getUint32(central + 42, true);
  view.setUint32(central + 24, 1, true); view.setUint32(local + 22, 1, true);
  const zip = await loadBoundedZip(bytes);
  await assert.rejects(readZipBytes(zip, 'payload.xml', 1000), /import limits/);
});
test('PPTX rejects XML document types and custom entities', async () => {
  const bytes = await archive('ppt/presentation.xml', '<!DOCTYPE p [<!ENTITY boom "danger">]><presentation>&boom;</presentation>');
  await assert.rejects(importPptx(bytes, 'unsafe.pptx'), /entity declarations/);
});

test('ambiguous ZIP paths cannot alias another entry after JSZip normalization', async () => {
  for(const name of ['./safe.xml','ppt/./slide.xml','ppt//slide.xml','ppt/slide.xml:stream','ppt/line\n.xml']) {
    await assert.rejects(loadBoundedZip(await archive(name,'payload')), /import limits/);
  }
});

test('Unicode path extra fields cannot change validated names or alias another entry',async()=>{
  const crc32=(input:Uint8Array)=>{let crc=0xffffffff;for(const byte of input){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;};
  for(const alternate of ['../escaped.xml','different.xml']){
    const original=Buffer.from(await new JSZip().file('safe.xml','payload').generateAsync({type:'uint8array'})),end=original.length-22,start=original.readUInt32LE(end+16),length=original.readUInt16LE(start+28),extra=Buffer.alloc(9+Buffer.byteLength(alternate));extra.writeUInt16LE(0x7075,0);extra.writeUInt16LE(extra.length-4,2);extra[4]=1;extra.writeUInt32LE(crc32(Buffer.from('safe.xml')),5);extra.write(alternate,9);const pos=start+46+length,modified=Buffer.concat([original.subarray(0,pos),extra,original.subarray(pos)]);modified.writeUInt16LE(extra.length,start+30);modified.writeUInt32LE(original.readUInt32LE(end+12)+extra.length,end+extra.length+12);
    assert.notEqual(Object.keys((await JSZip.loadAsync(modified)).files)[0],'safe.xml');await assert.rejects(loadBoundedZip(modified),/import limits/);
  }
});

test('a local-only Unicode filename override is rejected before native extraction',async()=>{
  const original=Buffer.from(await new JSZip().file('safe.xml','payload').generateAsync({type:'uint8array'})),end=original.length-22,central=original.readUInt32LE(end+16),nameLength=original.readUInt16LE(26),extra=Buffer.alloc(9+Buffer.byteLength('../escaped.xml'));extra.writeUInt16LE(0x7075,0);extra.writeUInt16LE(extra.length-4,2);extra[4]=1;extra.write('../escaped.xml',9);const pos=30+nameLength,modified=Buffer.concat([original.subarray(0,pos),extra,original.subarray(pos)]);modified.writeUInt16LE(extra.length,28);modified.writeUInt32LE(central+extra.length,end+extra.length+16);await assert.rejects(loadBoundedZip(modified),/import limits/);
});

test('evicting ZIP buffers releases cached data without resetting expansion accounting',async()=>{
  const {releaseZipBytes}=await import('../src/core/safe-zip');
  const zip=await loadBoundedZip(await archive('image.png','original bytes'));
  const first=await readZipBytes(zip,'image.png');releaseZipBytes(zip,'image.png');
  const second=await readZipBytes(zip,'image.png');assert.deepEqual(first,second);assert.notEqual(first,second);
  await assert.rejects(readZipBytes(zip,'image.png',1),/import limits/);releaseZipBytes(zip,'image.png');
  const entry=zip.file('image.png')!;
  // Simulate dishonest streams without allocating hundreds of MB in the test.
  (entry as any).internalStream=()=>{let data:(value:unknown)=>void;const stream={on(event:string,fn:any){if(event==='data')data=fn;return stream;},pause(){},resume(){queueMicrotask(()=>data({length:40_000_001}));}};return stream;};
  for(let i=0;i<7;i++){await assert.rejects(readZipBytes(zip,'image.png'),/import limits/);releaseZipBytes(zip,'image.png');}
  (entry as any).internalStream=()=>{let data:(value:unknown)=>void;const stream={on(event:string,fn:any){if(event==='data')data=fn;return stream;},pause(){},resume(){queueMicrotask(()=>data(new Uint8Array(1)));}};return stream;};
  await assert.rejects(readZipBytes(zip,'image.png'),/import limits/);
});
