import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeBase64} from '../src/core/base64';
import {loadPptxImage} from '../src/core/pptx-image';

test('binary decoding retains every byte and forgiving Base64 forms', () => {
  const bytes = Uint8Array.from({length: 4097}, (_, i) => i % 256);
  const encoded = Buffer.from(bytes).toString('base64');
  for (const value of [encoded, encoded.replace(/=+$/, ''), encoded.replace(/(.{73})/g, '$1\r\n\t ')]) {
    assert.deepEqual(decodeBase64(value), bytes);
  }
  assert.deepEqual(decodeBase64(''), new Uint8Array());
  assert.deepEqual(decodeBase64('Zh=='), new Uint8Array([102]));
});

test('malformed binary input rejects instead of silently discarding bytes', () => {
  for (const value of ['a', '@@@', 'AAAA=', '=AAA', 'AA===', 'AA==AA', 'AA\u00a0AA']) {
    assert.throws(() => decodeBase64(value), value);
  }
});

test('percent-escaped embedded image bytes remain local and unchanged', async () => {
  const bytes = new Uint8Array([0, 255, 254, 253, 64, 127, 128]);
  const encoded = encodeURIComponent(Buffer.from(bytes).toString('base64'));
  const blob = await loadPptxImage(`data:image/png;base64,${encoded}`, 'Local media', async () => {throw new Error('Unexpected network read');});
  assert.equal(blob.type, 'image/png');
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
  for (const payload of ['%', '%FF', '%ZZ']) {
    await assert.rejects(loadPptxImage(`data:image/png;base64,${payload}`, 'Invalid escape', async () => {throw new Error('Unexpected network read');}), URIError);
  }
});
