import {execFileSync} from 'node:child_process';
import {cp, mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';

const noticeName = /^(?:LICEN[CS]E|COPYING|COPYRIGHT|NOTICE|PATENTS)(?:[-_.].*|$)/i;
const localNotices = join(import.meta.dirname, 'notices');

export async function writeNotices(installer, cargoManifest, sdk, env) {
  const dest = join(installer, 'licenses');
  await mkdir(dest);
  const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--locked', '--format-version', '1',
    '--filter-platform', 'wasm32-wasip1', '--manifest-path', cargoManifest], {env, encoding: 'utf8'}));
  const packages = metadata.packages.filter(entry => entry.source);
  const localFiles = await readdir(localNotices);
  const sources = [];
  for (const entry of packages) {
    const name = `${entry.name}-${entry.version}`;
    const directory = dirname(entry.manifest_path);
    const folders = [directory];
    if (entry.source.includes('microsoft/preflate-rs')) folders.push(dirname(directory));
    if (entry.name === 'libwebp-sys') folders.push(join(directory, 'vendor'));
    if (entry.name === 'bitcode_derive' || entry.name === 'default-boxed-derive') {
      const parentName = entry.name === 'bitcode_derive' ? 'bitcode' : 'default-boxed';
      const parent = packages.find(pkg => pkg.name === parentName);
      folders.push(dirname(parent.manifest_path));
    }
    const notes = new Map();
    for (const folder of folders) {
      for (const file of await readdir(folder, {withFileTypes: true})) {
        if (file.isFile() && noticeName.test(file.name)) notes.set(file.name, join(folder, file.name));
      }
    }
    for (const filename of localFiles) {
      if (filename.startsWith(name + '-')) notes.set(filename.slice(name.length + 1), join(localNotices, filename));
    }
    if (!notes.size) throw new Error(`Missing license text for ${name}.`);
    await mkdir(join(dest, name));
    for (const [filename, path] of notes) await cp(path, join(dest, name, filename));
    sources.push({name, license: entry.license, source: entry.repository ?? entry.source});
  }
  const rustDocs = join(execFileSync('rustc', ['--print', 'sysroot'], {encoding: 'utf8'}).trim(), 'share/doc/rust');
  const std = join(dest, 'rust-standard-library');
  await mkdir(std);
  await cp(join(rustDocs, 'COPYRIGHT-library.html'), join(std, 'COPYRIGHT-library.html'));
  await cp(join(rustDocs, 'licenses'), join(std, 'licenses'), {recursive: true});
  const wasi = join(dest, 'wasi-libc');
  await mkdir(wasi);
  for (const filename of localFiles.filter(name => name.startsWith('wasi-libc-'))) {
    await cp(join(localNotices, filename), join(wasi, filename));
  }
  const sdkVersion = (await readFile(join(sdk, 'VERSION'), 'utf8')).trim();
  await writeFile(join(dest, 'sources.json'), JSON.stringify({sdkVersion, packages: sources}, null, 2) + '\n');
}
