import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { ACCENT_PRESETS, ORIGINAL_ACCENT, recolorAccentPixels } from '../public/resources/accent-engine.js';
import { blueBlackLibrary } from '../server/blue-black';
import { searchResources, loadResource } from '../server/resources';
import { blankSlide, newDeck, element, validateDeck } from '../src/core/model';
import { applyOperations } from '../src/core/operations';
import { illustrationAccentOperations } from '../src/core/illustration-accent';
import { shelfEntry, readShelf } from '../src/core/resource-shelf';

test('accent replacement changes original pigment precisely while preserving neutral colors and alpha', () => {
  for (const preset of ACCENT_PRESETS) {
    const pixels = new Uint8Array([47,91,255,255, 22,22,22,255, 255,255,255,255, 40,40,40,64, 47,91,255,0]);
    recolorAccentPixels(pixels, preset.color);
    assert.deepEqual([...pixels.slice(0,3)], [1,3,5].map(i => parseInt(preset.color.slice(i,i+2),16)));
    assert.deepEqual([...pixels.slice(4)], [22,22,22,255, 255,255,255,255, 40,40,40,64, 47,91,255,0]);
  }
  assert.throws(() => recolorAccentPixels(new Uint8Array(4), 'red'));
});
test('every current PNG retains its source hash, alpha, size and all neutral pixels through recoloring', async () => {
  const assets = await blueBlackLibrary(); assert(assets.length >= 48);
  for (const asset of assets) {
    const originalBytes = await readFile(`public/resources/blue-black-v1/${asset.file}`);
    assert.equal(createHash('sha256').update(originalBytes).digest('hex'), asset.sha256, asset.id);
    const original = PNG.sync.read(originalBytes), copy = Buffer.from(original.data);
    recolorAccentPixels(copy, '#35664d'); let changed = 0;
    for (let i=0;i<copy.length;i+=4) {
      if (copy[i+3] !== original.data[i+3]) throw new Error(`${asset.id}: alpha changed`);
      if (copy[i] !== original.data[i] || copy[i+1] !== original.data[i+1] || copy[i+2] !== original.data[i+2]) changed++;
      if (Math.max(original.data[i],original.data[i+1],original.data[i+2]) - Math.min(original.data[i],original.data[i+1],original.data[i+2]) < 8 && (copy[i] !== original.data[i] || copy[i+1] !== original.data[i+1] || copy[i+2] !== original.data[i+2])) throw new Error(`${asset.id}: neutral changed`);
    }
    assert(changed > 100, `${asset.id} has no detected accent`);
    assert.equal(original.width,asset.width); assert.equal(original.height,asset.height);
  }
});
test('local catalog includes current assets, search tags, color metadata, favorites and exact original restoration', async () => {
  const assets = await blueBlackLibrary(), first = assets[0];
  const page = await searchResources(new URLSearchParams({kind:'illustration',collection:'blue-black',q:first.id}));
  assert.equal(page.items.length,1); const item = page.items[0]; assert(item.colorable); assert.equal(item.originalSha256,first.sha256);
  assert.equal(readShelf(JSON.stringify([shelfEntry(item,'#35664d')]))[0].resource.color,'#35664d');
  const original = await loadResource(item.id,ORIGINAL_ACCENT); assert.deepEqual(original.bytes,await readFile(`public/resources/blue-black-v1/${first.file}`));
  const green = await loadResource(item.id,'#35664d'); assert.equal(green.resource.color,'#35664d'); assert.equal(green.resource.originalSha256,first.sha256);
  const decoded = PNG.sync.read(green.bytes); assert.equal(decoded.width,first.width); assert.equal(decoded.height,first.height);
  // Concurrent previews reuse one source but must keep their colors independent.
  const [thumb, cobalt, repeat] = await Promise.all([
    loadResource(item.id,'#35664d',true),
    loadResource(item.id,ORIGINAL_ACCENT,true),
    loadResource(item.id,'#35664d',true),
  ]);
  assert.deepEqual(thumb.bytes,repeat.bytes);
  const preview = PNG.sync.read(thumb.bytes);
  const uncolored = PNG.sync.read(cobalt.bytes);
  assert(Math.max(preview.width,preview.height)<=480);
  assert.deepEqual(preview.data,recolorAccentPixels(uncolored.data,'#35664d'));
  await assert.rejects(loadResource('blue-black:../../.env'));
});
test('batch recoloring is atomic, skips locks, preserves layout and provenance and persists document default', async () => {
  const data = await loadResource('blue-black:scene-01-guidance', ORIGINAL_ACCENT);
  const resource = data.resource, src = `data:image/png;base64,${data.bytes.toString('base64')}`;
  const slide = blankSlide(), second = blankSlide();
  slide.elements.push(element('image',{src,resource,x:10,y:20,w:30,h:40,rotation:17,fit:'cover'}), element('image',{src,resource,locked:true}));
  second.elements.push(element('image',{src,resource}));
  const deck = newDeck('Accent',[slide,second]); let loads=0;
  const ops = await illustrationAccentOperations(deck,slide.id,[],'deck','#bd365b',async()=>{loads++;return {src:'data:image/png;base64,AA==',resource:{...resource,color:'#bd365b'}};});
  const next = applyOperations(deck,ops,deck.revision); assert.equal(loads,1); assert.equal(next.illustrationAccent,'#bd365b');
  assert.equal(next.slides[0].elements[1].src,src); assert.equal(deck.illustrationAccent,undefined); assert.equal(deck.revision,0);
  for (const key of ['id','x','y','w','h','rotation','fit'] as const) assert.equal(next.slides[0].elements[0][key],deck.slides[0].elements[0][key]);
  assert.equal(next.slides[0].elements[0].resource?.originalSha256,resource.originalSha256); validateDeck(JSON.parse(JSON.stringify(next)));
  assert.throws(()=>applyOperations(next,ops,deck.revision));
  await assert.rejects(illustrationAccentOperations(deck,slide.id,[],'deck','#bd365b',async()=>{throw new Error('offline');}));
  await assert.rejects(illustrationAccentOperations(deck,slide.id,[],'deck','#bd365b',async()=>({src,resource:{...resource,originalSha256:'0'.repeat(64)}})));
  const selection = await illustrationAccentOperations(deck,slide.id,[slide.elements[0].id],'selection','#bd365b',async()=>({src:'data:image/png;base64,AA==',resource:{...resource,color:'#bd365b'}})); assert.equal(selection.length,1);
});
