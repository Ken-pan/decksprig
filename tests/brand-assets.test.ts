import {BRAND_NAME} from '../src/brand-name.js';
import {BRAND} from '../src/branding';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import JSZip from 'jszip';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { BRAND_ASSETS } from '../src/brand-assets';
import { serveStatic } from '../server/static';

const read = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url));
const sha = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const master = read('public/brand/logo.svg');
const manifest = JSON.parse(read('public/brand/manifest.json').toString());
const paths = (svg: string) => [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map(match => match[1]);

test('current display identity reaches runtime, generated entries and plugin metadata', () => {
  assert.equal(BRAND_NAME, 'Decksprig');
  assert.equal(BRAND.name, BRAND_NAME);
  assert.equal(manifest.name, BRAND_NAME);
  for (const entry of ['index.html', 'brand.html', 'characters.html']) {
    const title = read(entry).toString().match(/<title>([^<]*)<\/title>/)?.[1];
    assert.ok(title?.includes(BRAND_NAME), `${entry} uses the current display name`);
    assert.ok(!title?.includes('Deckleaf'));
  }
  assert.equal(JSON.parse(read('plugins/figma-export/manifest.json').toString()).name, `${BRAND_NAME} · Slides sync`);
});

test('all active logo entry points and derivatives use the reviewed vector revision', () => {
  assert.equal(manifest.masterSha256, sha(master));
  assert.equal(BRAND_ASSETS.revision, sha(master).slice(0, 12));
  assert.equal(manifest.sourceSha256, sha(read('public/brand/references/approved-logo-source.png')));
  const geometry = paths(master.toString()); assert.equal(geometry.length, 2);
  for (const name of ['public/favicon.svg', 'public/brand/app-icon.svg', 'public/brand/apple-touch-icon.svg']) assert.deepEqual(paths(read(name).toString()), geometry, name);
  for (const name of ['index.html', 'characters.html', 'brand.html']) {
    const html = read(name).toString();
    for (const url of [BRAND_ASSETS.favicon, BRAND_ASSETS.fallbackIcon, BRAND_ASSETS.touchIcon]) assert.ok(html.includes(url), `${name} uses ${url}`);
  }
  assert.ok(read('src/brand-assets.css').toString().includes(BRAND_ASSETS.logo));
  for (const file of manifest.files) assert.equal(sha(read(`public/${file.path}`)), file.sha256, file.path);
});

test('raster mark retains the solid card, transparent sprout and separate rear card', () => {
  const logo = PNG.sync.read(read('public/brand/logo.png'));
  assert.equal(logo.width, 1024); assert.equal(logo.height, 1024);
  const alpha = (x: number, y: number) => logo.data[(Math.floor(y * 10.24) * logo.width + Math.floor(x * 10.24)) * 4 + 3];
  assert.ok(alpha(50, 20) > 250, 'front card is filled');
  assert.equal(alpha(30, 44), 0, 'leaf is a transparent cutout');
  assert.equal(alpha(42.4, 70), 0, 'stem cutout reaches the lower gap');
  assert.ok(alpha(90, 50) > 250, 'rear card exists');
  assert.equal(alpha(81, 50), 0, 'rear-card spacing is transparent');
});

test('ICO fallback and downloadable kit contain the current image frames', async () => {
  const icon = read('public/favicon.ico'); assert.equal(icon.readUInt16LE(2), 1); assert.equal(icon.readUInt16LE(4), 2);
  for (const [index, size] of [16, 32].entries()) {
    const at = 6 + index * 16, bytes = icon.readUInt32LE(at + 8), offset = icon.readUInt32LE(at + 12);
    assert.equal(icon[at], size);
    const frame = icon.subarray(offset, offset + bytes), png = PNG.sync.read(frame);
    assert.equal(png.width, size); assert.equal(png.height, size);
    assert.deepEqual(frame, read(`public/brand/favicon-${size}.png`));
  }
  const kit = await JSZip.loadAsync(read('output/brand/Deck-Studio-Brand-Kit.zip'));
  for (const file of manifest.files) assert.equal(sha(await kit.file(file.path)!.async('nodebuffer')), file.sha256);
});

test('production ICO fallback uses an image response and revalidates its cache', async () => {
  const icon = fileURLToPath(new URL('../public/favicon.ico', import.meta.url));
  const server = createServer((request, response) => { void serveStatic(request, response, icon); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as {port: number};
    const response = await fetch(`http://127.0.0.1:${address.port}${BRAND_ASSETS.fallbackIcon}`);
    assert.equal(response.headers.get('content-type'), 'image/x-icon');
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), read('public/favicon.ico'));
  } finally {
    server.closeIdleConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
