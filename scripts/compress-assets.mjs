import { readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, gzip, constants } from 'node:zlib';

const br = promisify(brotliCompress), gz = promisify(gzip);
const compact = process.env.DECK_STUDIO_COMPACT_BUILD === '1';
const extensions = new Set(['.js', '.mjs', '.css', '.html', '.json', '.svg', '.txt', '.ttf', '.otf']);
const compactExtensions = new Set([...extensions, '.fntdata', '.wasm', '.png']);
compactExtensions.delete('.txt'); // License notices are readable directly on disk.
let files = 0, bytes = 0, compressedBytes = 0, stored = 0;
async function compress(directory) {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await compress(path); continue; }
    const extension = extname(path);
    if (!(compact ? compactExtensions : extensions).has(extension)) continue;
    const original = await readFile(path);
    if (original.length < 1024) continue;
    const quality = compact && extension === '.fntdata' ? 8 : 5;
    const brotliRequest = br(original, {params: {[constants.BROTLI_PARAM_QUALITY]: quality}});
    if (compact) {
      const brotli = await brotliRequest;
      if (brotli.length >= original.length * .95) continue;
      await writeFile(path + '.stored.br', brotli);
      await unlink(path);
      stored++;
      compressedBytes += brotli.length;
    } else {
      const [brotli, zipped] = await Promise.all([brotliRequest, gz(original, {level: 6})]);
      if (brotli.length < original.length) await writeFile(path + '.br', brotli);
      if (zipped.length < original.length) await writeFile(path + '.gz', zipped);
      compressedBytes += Math.min(original.length, brotli.length);
    }
    files++; bytes += original.length;
  }
}
await compress(process.env.DECK_STUDIO_BUILD_DIR || 'dist');
console.log(`${compact ? 'Stored' : 'Precompressed'} ${compact ? stored : files} assets: ${(bytes / 1e6).toFixed(2)} MB → ${(compressedBytes / 1e6).toFixed(2)} MB (Brotli).`);
