import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readSfnt,editableEmbedding} from '../src/core/font-sfnt';
import {instantiateFont} from '../src/core/font-instance';
import {trueTypeOutlines} from '../src/core/font-cff';

for(const name of ['manrope-cff.otf','manrope-cff2.otf'])test(`native ${name} conversion retains every glyph, character and shaping table`,async()=>{
  const bytes=await readFile('tests/fixtures/fonts/'+name),before=Buffer.from(bytes),original=readSfnt(bytes);
  const instance=await instantiateFont(bytes,400),result=readSfnt(await trueTypeOutlines(instance));
  assert.equal(result.signature,0x10000);assert(result.tables.has('glyf'));assert(!result.tables.has('CFF '));assert(!result.tables.has('CFF2'));
  const glyphs=(f:ReturnType<typeof readSfnt>)=>{const b=f.tables.get('maxp')!;return new DataView(b.buffer,b.byteOffset).getUint16(4);};
  assert.equal(glyphs(result),glyphs(original));
  for(const tag of ['cmap','GPOS','GSUB','OS/2'])assert.deepEqual(result.tables.get(tag),readSfnt(instance).tables.get(tag),tag);
  assert.equal(editableEmbedding(result),editableEmbedding(original));assert.deepEqual(bytes,before);
});
