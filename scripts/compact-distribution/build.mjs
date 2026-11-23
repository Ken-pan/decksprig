import {cp, link, mkdir, readFile, rename, rm, stat, unlink, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {archivePackage, distributionOutput, freshOutput, inventory} from '../distribution.mjs';
import {checkHash, parallel, sha256, transformFile} from './archive.mjs';
import {stageCodec} from './codec.mjs';

const {values} = parseArgs({options: {input: {type: 'string'}, output: {type: 'string'}}});
if (!values.input || !values.output || !process.env.WASI_SDK_PATH) {
  throw new Error('Set WASI_SDK_PATH and pass --input <distribution> --output <new-output-directory>.');
}
const source = resolve(values.input, 'app');
const output = distributionOutput(values.output);
const original = JSON.parse(await readFile(join(values.input, 'release.json'), 'utf8')).packages.app.archive;
const report = JSON.parse(await readFile(join(source, 'release-manifest.json'), 'utf8'));
const actual = await inventory(source);
const expected = Object.keys(report.files);
if (Object.keys(actual).length !== expected.length + 1 ||
    expected.some(path => actual[path]?.sha256 !== report.files[path].sha256)) {
  throw new Error('Input app does not match its release manifest.');
}

await freshOutput(output);
const installer = join(output, 'installer');
const images = join(installer, 'images');
const payload = join(output, 'payload');
await mkdir(images, {recursive: true});
await mkdir(payload);
const codec = await stageCodec(installer, join(output, 'build'));
for (const file of ['archive.mjs', 'unpack.mjs']) await cp(join(import.meta.dirname, file), join(installer, file));

const groups = new Map();
for (const [path, {bytes, sha256}] of Object.entries(report.files)) {
  if (!/^dist\/(?:[\w.-]+\/)*[\w.-]+\.png$/.test(path) || bytes < 150_000) continue;
  const entry = groups.get(sha256) ?? {sha256, bytes, paths: []};
  entry.paths.push(path);
  groups.set(sha256, entry);
}

const results = await parallel([...groups.values()], async entry => {
  const filename = join(images, entry.sha256 + '.bin');
  const restored = filename + '.png';
  const original = join(source, entry.paths[0]);
  await transformFile(codec.encode, ['pack'], original, filename);
  if ((await stat(filename)).size >= entry.bytes * .95) {
    await unlink(filename);
    return null;
  }
  // Confirm the shipped decoder, with the shipped Node entry point, can
  // reproduce this input. Leave an exact original if the codec cannot.
  try {
    await transformFile(process.execPath, codec.decode, filename, restored);
    await checkHash(restored, entry.sha256);
    return {...entry, packedSha256: await sha256(filename)};
  } catch (error) {
    console.warn(`Keeping original ${entry.paths[0]}: ${error.message}`);
    await unlink(filename);
    return null;
  } finally {
    await unlink(restored).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
});
const packed = results.filter(Boolean);
const omitted = new Set(packed.flatMap(entry => entry.paths));
for (const path of Object.keys(actual)) {
  if (omitted.has(path)) continue;
  const target = join(payload, 'app', path);
  await mkdir(dirname(target), {recursive: true});
  try { await link(join(source, path), target); }
  catch (error) {
    if (error.code !== 'EXDEV') throw error;
    await cp(join(source, path), target);
  }
}

const core = await archivePackage(payload, 'app', 'core.tar.gz');
await rename(join(payload, core.file), join(installer, core.file));
await rm(payload, {recursive: true});
await writeFile(join(installer, 'payload.json'), JSON.stringify({format: 'decksprig-compact/1', coreSha256: core.sha256, images: packed}, null, 2));
await writeFile(join(installer, 'README.md'), [
  '# Decksprig compact offline installer',
  'Requires Node.js 22.14 or newer and the system tar command. The installer uses its bundled decoder and works without an internet connection.',
  'Run `node installer/unpack.mjs "<new-installation-directory>"` from the folder containing installer/. Choose a path that does not exist and whose parent already exists.',
  'Next run `node "<new-installation-directory>/app/runtime/server.mjs"` and open http://127.0.0.1:4310/. For an existing document library, see app/README.md in the installation.',
  'The installer verifies the archive and restored files before finalizing. Codec licenses are in licenses/.',
].join('\n\n') + '\n');
const archive = await archivePackage(output, 'installer', 'decksprig-compact-offline.tar', {gzip: false});
if (archive.bytes >= original.bytes) throw new Error('Compact archive is not smaller than the standard archive.');
await writeFile(join(output, 'release.json'), JSON.stringify({
  format: 'decksprig-compact/1', archive, standardArchive: original,
  restoredPngs: omitted.size, packedObjects: packed.length, downloadBytesSaved: original.bytes - archive.bytes,
}, null, 2) + '\n');
await writeFile(join(output, 'SHA256SUMS'), `${archive.sha256}  ${archive.file}\n`);
console.log(`Restored PNGs: ${omitted.size}. Saved ${original.bytes - archive.bytes} download bytes.`);
