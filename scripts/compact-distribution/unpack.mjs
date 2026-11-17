import {link, lstat, mkdir, mkdtemp, readFile, rename, rm, rmdir} from 'node:fs/promises';
import {dirname, join, resolve, posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkHash, parallel, run, transformFile} from './archive.mjs';

const folder = import.meta.dirname;
const target = process.argv[2];
if (!target || process.argv.length !== 3) throw new Error('Usage: node unpack.mjs <new-installation-directory>');
const destination = resolve(target);
const index = JSON.parse(await readFile(join(folder, 'payload.json'), 'utf8'));
if (index.format !== 'decksprig-compact/1' || !Array.isArray(index.images)) throw new Error('Unknown installer format.');
const images = new Set();
const hash = /^[0-9a-f]{64}$/;

for (const entry of index.images) {
  if (!hash.test(entry.sha256) || !hash.test(entry.packedSha256) || !entry.paths?.length) {
    throw new Error('Invalid image record.');
  }
  for (const path of entry.paths) {
    if (!/^dist\/(?:[\w.-]+\/)*[\w.-]+\.png$/.test(path) || path !== posix.normalize(path) || images.has(path)) {
      throw new Error('Invalid or repeated image path.');
    }
    images.add(path);
  }
}

const existing = await lstat(destination).catch(error => {
  if (error.code !== 'ENOENT') throw error;
});
if (existing) throw new Error(`Installation directory already exists: ${destination}`);
let staged;
try {
  const core = join(folder, 'core.tar.gz');
  await checkHash(core, index.coreSha256);
  staged = await mkdtemp(join(dirname(destination), '.decksprig-install-'));
  await run('tar', ['-xzf', core, '-C', staged]);
  const app = join(staged, 'app');
  const decode = fileURLToPath(new URL('decode.mjs', import.meta.url));
  const manifest = JSON.parse(await readFile(join(app, 'release-manifest.json'), 'utf8'));
  await parallel(index.images, async ({sha256, paths, packedSha256}) => {
    if (paths.some(path => manifest.files[path]?.sha256 !== sha256)) throw new Error('Image does not match the release manifest.');
    const packed = join(folder, 'images', sha256 + '.bin');
    const [first, ...aliases] = paths.map(path => join(app, path));
    await checkHash(packed, packedSha256);
    await mkdir(dirname(first), {recursive: true});
    await transformFile(process.execPath, ['--disable-warning=ExperimentalWarning', decode], packed, first);
    await checkHash(first, sha256);
    for (const alias of aliases) {
      await mkdir(dirname(alias), {recursive: true});
      await link(first, alias);
    }
  });
  for (const [path, info] of Object.entries(manifest.files)) {
    if (!images.has(path)) await checkHash(join(app, path), info.sha256);
  }
  await mkdir(destination); // The first installer to finalize owns this path.
  try { await rename(app, join(destination, 'app')); }
  catch (error) {
    await rmdir(destination).catch(() => {});
    throw error;
  }
  console.log(`Installed at ${join(destination, 'app')}`);
} finally {
  if (staged) await rm(staged, {recursive: true, force: true});
}
