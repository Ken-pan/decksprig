import {readFileSync, statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {parentPort, workerData} from 'node:worker_threads';
import {brotliDecompressSync} from 'node:zlib';
import {PNG} from 'pngjs';
import {recolorAccentPixels, ORIGINAL_ACCENT} from '../public/resources/accent-engine.js';
import {illustrationThumbnail} from './illustration-thumbnail.mjs';
import {createThumbnailDecoder} from './illustration-webp.mjs';

const thumbnails = new Map();
const limit = 6 * 1024 * 1024;
// Paeth keeps gallery preview PNGs small without scoring five filters for every row.
const previewPngOptions = {filterType: 4};
let thumbnailBytes = 0;
let webpDecoder;

function locateImage(path) {
  try { return {file: path, info: statSync(path, {bigint: true}), packed: false}; }
  catch (error) {
    if (!workerData?.packed || error.code !== 'ENOENT') throw error;
    const file = path + '.stored.br';
    return {file, info: statSync(file, {bigint: true}), packed: true};
  }
}

function decodePng({file, packed}) {
  const bytes = readFileSync(file);
  return PNG.sync.read(packed ? brotliDecompressSync(bytes) : bytes);
}

function thumbnail(path, asset, prescaled, previewWebpSha256) {
  const {ino, size, mtimeNs, ctimeNs} = asset.info;
  const stamp = `${ino}:${size}:${mtimeNs}:${ctimeNs}`;
  const cached = thumbnails.get(path);
  if (cached) {
    thumbnails.delete(path);
    if (cached.stamp === stamp) {
      thumbnails.set(path, cached);
      return cached.image;
    }
    thumbnailBytes -= cached.image.data.length;
  }
  let pixels;
  if(previewWebpSha256){
    const bytes=readFileSync(asset.file);
    if(createHash('sha256').update(bytes).digest('hex')!==previewWebpSha256)throw new Error('Packaged illustration thumbnail integrity check failed.');
    webpDecoder??=createThumbnailDecoder(join(dirname(asset.file),'thumbnail-decoder.wasm.br'));
    pixels=webpDecoder(bytes);
  }else pixels=decodePng(asset);
  const image = prescaled ? pixels : illustrationThumbnail(pixels);
  thumbnails.set(path, {stamp, image});
  thumbnailBytes += image.data.length;
  while (thumbnailBytes > limit) {
    const oldest = thumbnails.keys().next().value;
    thumbnailBytes -= thumbnails.get(oldest).image.data.length;
    thumbnails.delete(oldest);
  }
  return image;
}

parentPort.on('message', ({id, path, accent, preview, previewPath, original, previewWebpSha256}) => {
  try {
    const asset = original ? undefined : locateImage(previewPath ?? path);
    let image;
    if (original) {
      const png = PNG.sync.read(Buffer.from(original.buffer, original.byteOffset, original.byteLength));
      image = preview ? illustrationThumbnail(png) : png;
    } else image = preview ? thumbnail(path, asset, Boolean(previewPath),previewWebpSha256) : decodePng(asset);
    if (accent !== ORIGINAL_ACCENT) {
      const data = preview ? Buffer.from(image.data) : image.data;
      recolorAccentPixels(data, accent);
      image = {...image, data};
    }
    const bytes = PNG.sync.write(image, preview ? previewPngOptions : undefined);
    const result = Uint8Array.from(bytes); // Own an exact-sized transferable.
    parentPort.postMessage({id, result}, [result.buffer]);
  } catch (error) {
    parentPort.postMessage({id, error: error instanceof Error ? error.message : String(error)});
  }
});
