import {readFile, readdir, writeFile, mkdir, cp} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {createHash} from 'node:crypto';

// Reproduce notices from the exact installed lockfile, including build tools.
// No dependency updates or registry credentials are involved.
const root = resolve(import.meta.dirname, '..');
const lock = JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8'));
const entries = [], missing = [];
const runtimeNotices=JSON.parse(await readFile(resolve(root,'public/licenses/upstream/font-runtime-notices.json'),'utf8'));
const optionalNotices = JSON.parse(await readFile(resolve(root,'public/licenses/upstream/package-notices.json'),'utf8'));
const exists = async path => readFile(path, 'utf8').catch(() => '');
for (const [path, locked] of Object.entries(lock.packages)) {
  if (!path.startsWith('node_modules/')) continue;
  const directory = resolve(root, path), name = locked.name ?? path.split('node_modules/').at(-1);
  const packageText = await exists(resolve(directory, 'package.json'));
  const pkg = packageText ? JSON.parse(packageText) : locked;
  let sources = await readdir(directory).catch(() => []);
  sources = sources.filter(file => /^(?:licen[cs]e|copying|notice|thirdpartynotice)(?:[._-]|$)/i.test(file));
  let texts = (await Promise.all(sources.map(async file => ({file, text: await exists(resolve(directory, file))})))).filter(source => source.text);
  if (!texts.length && name.startsWith('@iconify-json/')) {
    const file = 'public/resources/licenses/' + name.split('/')[1] + '.txt';
    const text = await exists(resolve(root, file)); if (text) texts = [{file, text}];
  }
  if (!texts.length && name.startsWith('@rolldown/binding-')) {
    const text = await exists(resolve(root, 'node_modules/rolldown/LICENSE'));
    if (text) texts = [{file: 'rolldown/LICENSE', text}];
  }
  if (!texts.length && name.startsWith('lightningcss-')) {
    const text = await exists(resolve(root, 'node_modules/lightningcss/LICENSE'));
    if (text) texts = [{file: 'lightningcss/LICENSE', text}];
  }
  if (!texts.length) {
    const key = {'@nodable/entities':'nodable-entities','boolbase':'boolbase','is-reference':'is-reference','locate-character':'locate-character'}[name];
    if (key) { const file = 'public/licenses/upstream/' + key + '.txt'; const text = await exists(resolve(root, file)); if (text) texts = [{file, text}]; }
  }
  if (!texts.length && name === 'isarray') {
    const text = await exists(resolve(directory, 'README.md')); if (text.includes('Permission is hereby granted')) texts = [{file: 'README.md', text: text.slice(text.indexOf('## License'))}];
  }
  if (!texts.length && name === 'https') {
    // This empty compatibility package contains only package metadata, no code.
    texts = [{file: 'package.json (no implementation files)', text: packageText}];
  }
  if (!texts.length) {
    const fallback = optionalNotices[name + '@' + locked.version];
    if (fallback) { const file = 'public/licenses/upstream/' + fallback.file; const text = await exists(resolve(root,file)); if(text) texts = [{file,text}]; }
  }
  // Optional OS binaries share their parent binding's license. Uninstalled
  // packages must still receive a notice in a portable source distribution.
  if (!texts.length && name.startsWith('@resvg/resvg-js-')) {
    const text = await exists(resolve(root, 'node_modules/@resvg/resvg-js/LICENSE'));
    if (text) texts = [{file: '@resvg/resvg-js/LICENSE', text}];
  }
  if (!texts.length && name.startsWith('@esbuild/')) {
    const text = await exists(resolve(root, 'node_modules/esbuild/LICENSE.md'));
    if (text) texts = [{file: 'esbuild/LICENSE.md', text}];
  }
  if (!texts.length && name.startsWith('@rollup/rollup-')) {
    const text = await exists(resolve(root, 'node_modules/rollup/LICENSE.md'));
    if (text) texts = [{file: 'rollup/LICENSE.md', text}];
  }
  if (!texts.length && name.startsWith('@napi-rs/canvas-')) {
    const parent = resolve(root, 'node_modules/@napi-rs/canvas');
    for (const file of await readdir(parent).catch(() => [])) if (/^license/i.test(file)) {
      const text = await exists(resolve(parent, file)); if (text) texts.push({file: '@napi-rs/canvas/' + file, text});
    }
  }
  for(const extra of runtimeNotices[name+'@'+locked.version]??[]){
    const file='public/licenses/upstream/'+extra.file,text=await exists(resolve(root,file));
    if(createHash('sha256').update(text).digest('hex')!==extra.sha256)throw new Error('Native font runtime notice changed: '+file);
    texts.push({file,text});
  }
  const license = name === 'jszip' ? 'MIT (selected from MIT OR GPL-3.0-or-later)' : String(locked.license || pkg.license || 'UNDECLARED');
  if (!texts.length) missing.push({name, version: locked.version, license});
  entries.push({name, version: locked.version, license, dev: Boolean(locked.dev), optional: Boolean(locked.optional), repository: typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url, notices: texts});
}
for(const asset of JSON.parse(await readFile(resolve(root,'public/licenses/upstream/vendored-font-runtime.json'),'utf8'))){
  if(createHash('sha256').update(await readFile(resolve(root,asset.file))).digest('hex')!==asset.sha256)throw new Error('Vendored font runtime changed: '+asset.file);
  const notices=[];
  for(const notice of asset.notices){const text=await readFile(resolve(root,notice.file),'utf8');if(createHash('sha256').update(text).digest('hex')!==notice.sha256)throw new Error('Vendored font notice changed: '+notice.file);notices.push({file:notice.file,text});}
  entries.push({name:asset.name,version:asset.version,license:asset.license,repository:asset.repository,dev:false,optional:false,notices});
}
if (missing.length) { console.error(JSON.stringify(missing)); throw new Error('Missing license texts; see package list above.'); }
entries.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
const intro = 'Deckleaf third-party dependency notices\nGenerated from package-lock.json. Original notices are reproduced below.\nJSZip is used under its MIT option. MPL-2.0 build components keep their file-level license; Deckleaf code is MIT.\nPlatform alternatives and build-only tools are included for completeness; this is not a claim that all are shipped in the browser.\n\n';
const text = intro + entries.map(entry => `${'='.repeat(72)}\n${entry.name}@${entry.version}\nLicense: ${entry.license}\n${entry.repository ? 'Upstream: ' + entry.repository + '\n' : ''}${entry.notices.map(notice => `\n--- ${notice.file} ---\n${notice.text.trim()}\n`).join('')}`).join('\n');
await mkdir(resolve(root, 'public/licenses'), {recursive: true});
await writeFile(resolve(root, 'public/licenses/third-party-notices.txt'), text);
await writeFile(resolve(root, 'public/licenses/dependencies.json'), JSON.stringify(entries.map(({notices, ...entry}) => ({...entry, noticeFiles: notices.map(notice => notice.file)})), null, 2) + '\n');
await writeFile(resolve(root, 'THIRD_PARTY_NOTICES.md'), '# Third-party notices\n\nThe full dependency license texts and copyright notices are in [public/licenses/third-party-notices.txt](public/licenses/third-party-notices.txt); the versioned inventory is [public/licenses/dependencies.json](public/licenses/dependencies.json). Regenerate with `npm ci && npm run licenses:generate`.\n\nFonts retain their OFL files in `public/fonts`. Icon dataset notices are in `public/resources/licenses`. ECharts notices are in `public/licenses/charts`. Artwork scope and required attributions are in [ASSET_LICENSES.md](ASSET_LICENSES.md) and resource manifests. Keep these files when redistributing a build.\n\nJSZip is used under MIT. MPL build tools retain MPL obligations for their covered files when redistributed; this does not relicense the application. External platforms and imported user documents are not licensed by this project.\n');
console.log(`Dependency notices: ${entries.length} lockfile packages, ${Buffer.byteLength(text)} bytes.`);

for (const [source,target] of [['LICENSE','deckleaf-MIT.txt'],['PRIVACY.md','privacy.txt'],['ASSET_LICENSES.md','assets.txt']]) await cp(resolve(root,source),resolve(root,'public/licenses',target));
