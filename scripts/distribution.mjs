import {cp, link, mkdir, readFile, readdir, lstat, rename, unlink, writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, relative, dirname, join} from 'node:path';
import {execFileSync} from 'node:child_process';

export const projectRoot = resolve(import.meta.dirname, '..');
export function distributionOutput(value, root = projectRoot) {
  const output = resolve(value), rel = relative(root, output);
  if (rel.startsWith('..') || !rel.split(/[\\/]/).includes('output')) throw new Error('Distribution packages must be staged inside a project output directory.');
  return output;
}
export async function freshOutput(output) {
  await mkdir(dirname(output), {recursive: true});
  // Refuse to merge releases or erase another task's output.
  await mkdir(output);
}
export async function inventory(directory) {
  /** @type {Record<string, {bytes: number, sha256: string}>} */
  const files = {};
  async function walk(folder) {
    for (const entry of (await readdir(folder, {withFileTypes: true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      const file = join(folder, entry.name), path = relative(directory, file).split('\\').join('/');
      if (entry.isDirectory()) await walk(file);
      else {
        if (!entry.isFile()) throw new Error(`Distribution cannot contain symbolic links: ${path}`);
        const bytes = await readFile(file);
        files[path] = {bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
      }
    }
  }
  await walk(directory);
  return files;
}
export async function packageManifest(directory, kind) {
  const files = await inventory(directory);
  const report = {format: 'deckleaf-distribution/1', kind, files, payloadBytes: Object.values(files).reduce((sum,file)=>sum+file.bytes,0)};
  await writeFile(join(directory, 'release-manifest.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}
/** Deduplicate identical raster artwork in a freshly staged release. */
export async function linkDuplicateArtwork(directory, files) {
  const seen = new Map();
  let saved = 0;
  for (const [path, entry] of Object.entries(files)) {
    if (!/^(examples|resources)\/.*\.(png|jpe?g|webp)(\.stored\.br)?$/.test(path)) continue;
    const target = join(directory, path);
    const first = seen.get(entry.sha256);
    if (!first) {
      seen.set(entry.sha256, target);
      continue;
    }
    const temporary = target + '.linking';
    await link(first, temporary);
    try { await rename(temporary, target); }
    finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    saved += entry.bytes;
  }
  return saved;
}
export async function archivePackage(parent, name, filename, {gzip = true} = {}) {
  const file = join(parent, filename), temporary = file + '.tmp';
  execFileSync('tar', [gzip ? '-czf' : '-cf', temporary, '-C', parent, name], {env: {...process.env, COPYFILE_DISABLE: '1'}, stdio: 'inherit'});
  await rename(temporary, file);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return {file: filename, bytes: (await lstat(file)).size, sha256: hash.digest('hex')};
}
export async function exportSources(root, destination) {
  await freshOutput(destination);
  const manifestPath = 'public/fonts/pptx/manifest.json';
  const faces = JSON.parse(await readFile(resolve(root, manifestPath), 'utf8'));
  const catalog = JSON.parse(await readFile(resolve(root, 'src/core/font-catalog.json'), 'utf8'));
  const inputs = new Set([manifestPath, 'scripts/build-template-fonts.py', 'src/core/font-catalog.json', 'LICENSE', 'ASSET_LICENSES.md', 'THIRD_PARTY_NOTICES.md']);
  const fontPath = path => {
    const absolute = resolve(root, path);
    if (!absolute.startsWith(resolve(root, 'public/fonts') + '/') || !/^public\/fonts\//.test(path)) throw new Error('Invalid font source path.');
    return absolute;
  };
  for (const face of faces) {
    for (const url of [face.ttf, face.license]) {
      if (typeof url !== 'string' || !url.startsWith('/fonts/')) throw new Error('Missing font source or license.');
      fontPath('public' + url); inputs.add('public' + url);
    }
    for (const [path, expected] of Object.entries(face.sourceHashes)) {
      const bytes = await readFile(fontPath(path));
      if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error(`Font source integrity failed: ${path}`);
      inputs.add(path);
    }
    const font = catalog.find(font => font.family === face.family);
    if (!font) throw new Error(`Missing font catalog source: ${face.family}`);
    for (const url of [font.css, font.license]) { fontPath('public' + url); inputs.add('public' + url); }
  }
  for (const path of inputs) {
    const source = resolve(root, path);
    if (!(await lstat(source)).isFile()) throw new Error(`Source must be a regular file: ${path}`);
    await mkdir(dirname(resolve(destination, path)), {recursive: true});
    await cp(source, resolve(destination, path));
  }
  await writeFile(join(destination, 'README.md'), `# Deckleaf export font sources\n\nThis separate development package contains the original manifest, full TTF faces, licenses, font generator and all hashed inputs for the ${faces.length} bundled editable PPTX faces. Original source-relative paths are preserved. It is not required at runtime: the app already includes full FNTDATA for offline editable export, browser fonts, licenses and template originals.\n\nThe public/fonts/pptx/manifest.json here is the original source manifest, not a runtime replacement. Its file and sha256 fields describe the generated FNTDATA outputs, which ship with the app. Every sourceHashes input is included and verified. The full catalog is retained for provenance; the included generator's default families have complete inputs. Other catalog families are available in the repository.\n\nTo regenerate those faces in this source tree, install Python fonttools and Brotli, then run python3 scripts/build-template-fonts.py. Generation has not been run by the packaging step. No network, credentials or user documents are included by the packager.\n`);
  return packageManifest(destination, 'export-sources');
}
