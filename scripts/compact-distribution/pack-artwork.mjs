import {mkdir, readFile, stat, unlink, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {PNG} from 'pngjs';
import {illustrationThumbnail} from '../../server/illustration-thumbnail.mjs';
import {createThumbnailDecoder} from '../../server/illustration-webp.mjs';
import {inventory} from '../distribution.mjs';
import {checkHash, parallel, transformFile} from './archive.mjs';
import {stageCodec} from './codec.mjs';

const gallery = 'resources/blue-black-v1/png/';
const provenance = 'examples/template-assets/originals/';

export async function packArtwork(app, buildDir) {
  const dist = join(app, 'dist');
  const store = join(app, 'runtime', 'packed-images');
  const files = await inventory(dist);
  const groups = new Map();
  for (const [path, {bytes, sha256}] of Object.entries(files)) {
    if (!path.endsWith('.png') || bytes < 150_000 || bytes > 4 * 1024 * 1024) continue;
    const entry = groups.get(sha256) ?? {sha256, bytes, paths: []};
    entry.paths.push(path);
    groups.set(sha256, entry);
  }
  // Preserve the ordinary editor's and template previews' existing image paths.
  const selected = [...groups.values()].filter(({paths}) => paths.every(path => path.startsWith(gallery) || path.startsWith(provenance)));
  await mkdir(store);
  const codec = await stageCodec(store, buildDir, {thumbnail:true});
  const decodeThumbnail = createThumbnailDecoder(codec.thumbnailDecoder);
  const packed = await parallel(selected, async ({sha256, bytes, paths}) => {
    const original = join(dist, paths[0]);
    const encoded = join(store, sha256 + '.bin');
    const roundtrip = encoded + '.png';
    const preview = paths.some(path => path.startsWith(gallery));
    const thumbnail = preview ? illustrationThumbnail(PNG.sync.read(await readFile(original))) : undefined;
    const png = thumbnail ? PNG.sync.write(thumbnail) : undefined;
    await transformFile(codec.encode, ['pack'], original, encoded);
    const packedBytes = (await stat(encoded)).size;
    if (packedBytes+(png?.length??0) >= bytes * .95) { await unlink(encoded); return null; }
    try {
      await transformFile(process.execPath, codec.decode, encoded, roundtrip);
      await checkHash(roundtrip, sha256);
    } catch (error) {
      console.warn(`Keeping original ${paths[0]}: ${error.message}`);
      await unlink(encoded);
      return null;
    } finally {
      await unlink(roundtrip).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
    let webp;
    if (thumbnail && png) {
      const previewPath = join(store, sha256 + '.preview');
      const pixels = previewPath + '.rgba';
      const candidate = previewPath + '.webp';
      await writeFile(previewPath + '.png', png);
      const size = Buffer.allocUnsafe(8);
      size.writeUInt32LE(thumbnail.width, 0);
      size.writeUInt32LE(thumbnail.height, 4);
      await writeFile(pixels, Buffer.concat([size, thumbnail.data]));
      try {
        await transformFile(codec.encode, ['pack-thumbnail'], pixels, candidate);
        const encoded = await readFile(candidate);
        if (encoded.length < png.length) {
          const decoded = decodeThumbnail(encoded);
          if (decoded.width === thumbnail.width && decoded.height === thumbnail.height && decoded.data.equals(thumbnail.data)) {
            webp = {bytes: encoded.length, sha256: createHash('sha256').update(encoded).digest('hex')};
          }
        }
        if (!webp) await unlink(candidate);
      } finally {
        await unlink(pixels);
      }
    }
    return {sha256, bytes, paths, preview, packedBytes, pngBytes: png?.length ?? 0, webp};
  });
  const index = {};
  let savedBytes = 0;
  const entries=packed.filter(Boolean);
  const rawPreviewBytes=entries.reduce((total,entry)=>total+entry.pngBytes,0);
  const optimizedPreviewBytes=entries.reduce((total,entry)=>total+(entry.webp?.bytes??entry.pngBytes),0);
  const decoderBytes=(await stat(codec.thumbnailDecoder)).size;
  const useWebp=rawPreviewBytes-optimizedPreviewBytes>decoderBytes;
  if(!useWebp)await unlink(codec.thumbnailDecoder);
  let webpPreviews=0,packedMediaBytes=0;
  for (const entry of entries) {
    const webp=useWebp?entry.webp:undefined;
    if(entry.webp)await unlink(join(store,entry.sha256+(webp?'.preview.png':'.preview.webp')));
    if(webp)webpPreviews++;
    for (const path of entry.paths) {
      index[path] = {sha256: entry.sha256, bytes: entry.bytes, preview: entry.preview,previewWebpSha256:webp?.sha256};
      await unlink(join(dist, path));
    }
    const stored=entry.packedBytes+(webp?.bytes??entry.pngBytes);
    savedBytes += entry.bytes - stored;
    packedMediaBytes+=stored;
  }
  await writeFile(join(store, 'index.json'), JSON.stringify(index));
  const supportBytes = Object.values(await inventory(store)).reduce((sum, file) => sum + file.bytes, 0);
  return {files: Object.keys(index).length, packedMediaBytes, supportBytes: supportBytes - packedMediaBytes, savedBytes: savedBytes - (supportBytes - packedMediaBytes),
    webpPreviews,previewBytesSaved:useWebp?rawPreviewBytes-optimizedPreviewBytes-decoderBytes:0};
}
