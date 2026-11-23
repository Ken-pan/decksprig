import {cp, mkdir, readFile, readdir, rename, stat, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, relative, join} from 'node:path';
import {execFileSync} from 'node:child_process';

// Build a reviewable source candidate from explicit public inputs, never from
// git add . or the working directory's historical evidence and local documents.
const root = resolve(import.meta.dirname, '..');
const releaseId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid;
const output = process.env.DECKLEAF_SOURCE_OUTPUT ? resolve(process.env.DECKLEAF_SOURCE_OUTPUT) : resolve(root, 'output/open-source', releaseId);
const candidate = join(output, '.deckleaf-stage-' + releaseId);
const finalCandidate = join(output, 'deckleaf');
if (relative(root, output).startsWith('..') || !relative(root, output).split(/[\\/]/).includes('output')) throw new Error('Source packages must be staged inside a project output directory.');
const files = ['.gitignore', 'README.md', 'README.zh-CN.md', 'llms.txt', 'LICENSE', 'ASSET_LICENSES.md', 'PRIVACY.md', 'SECURITY.md', 'CONTRIBUTING.md', 'THIRD_PARTY_NOTICES.md', 'package.json', 'package-lock.json', 'index.html', 'brand.html', 'characters.html', 'svelte.config.js', 'tsconfig.json', 'vite.config.ts', 'netlify.toml', 'website.netlify.toml', 'docs/branding.md', 'docs/provenance.md'];
const scripts = ['build-template-covers.ts', 'render-welcome-covers.mjs', 'public-assets.mjs', 'distribution.mjs', 'package-distribution.mjs', 'build-local-runtime.mjs', 'package-export-sources.mjs', 'build-template-fonts.py', 'build-icon-counts.mjs', 'build-brand.mjs', 'adopt-brand.mjs', 'build-figma-plugin.mjs', 'check-startup.mjs', 'compress-assets.mjs', 'build-browser.mjs', 'browser-preload.mjs', 'local-document-preload.mjs', 'public-origin.mjs', 'storage-maintenance.ts', 'build-browser-resources.ts', 'build-website.mjs', 'build-character-library.mjs', 'review-character-library.ts', 'package-source.mjs', 'release-content.mjs', 'generate-notices.mjs', 'build-deck-graphics.mjs', 'build-release-demo.ts'];
const resources = new Set(['blue-black-v1', 'characters-v1', 'deck-graphics-v1', 'doodles', 'illlustrations', 'licenses']);
const motionExamples = new Set(['modern-transitions-showcase.html', 'modern-transitions-showcase.json', 'smart-motion-studies.html', 'smart-motion-studies.json', 'motion-prototype-fixture.html', 'motion-choreography-demo.html', 'motion-choreography-demo.json', 'deckleaf-demo.deck.json','decksprig-demo.deck.json']);
const privateText = /\bim-(?:compare|collection|search)\b|portfolio\d{4}|\/Users\/[^/\s]+\/(?:Projects|Documents)\//;
import {containsReleaseCredential} from './release-content.mjs';
function publicFile(path) {
  const rel = relative(root, path).split('\\').join('/');
  const parts = rel.split('/');
  if (parts.some(part => ['.DS_Store', 'qa', 'references', 'node_modules'].includes(part))) {
    if (rel !== 'public/brand/references' && !rel.startsWith('public/brand/references/approved-logo-') && rel !== 'public/brand/references/header-outline-vector.svg') return false;
  }
  if (rel.startsWith('public/') && parts.some(part => part.startsWith('__'))) return false;
  if (rel.endsWith('.zip') && rel !== 'public/resources/deck-graphics-v1/deck-graphics-v1.zip') return false;
  if (rel.endsWith('/generation-progress.json')) return false;
  if (rel.startsWith('public/examples/') && !rel.startsWith('public/examples/template-assets') && !motionExamples.has(parts[2])) return false;
  if (rel.startsWith('public/resources/') && parts.length >= 3 && !resources.has(parts[2]) && !parts[2].includes('.')) return false;
  return true;
}
await mkdir(output, {recursive: true});
try { await stat(finalCandidate); throw new Error('This output already contains a source candidate. Choose a new output directory; existing candidates are preserved.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(candidate);
for (const file of files) {
  await mkdir(resolve(candidate, file, '..'), {recursive: true});
  await cp(resolve(root, file), resolve(candidate, file));
}
for (const dir of ['src', 'server', 'tests', 'plugins', 'netlify', 'public', '.github']) {
  await cp(resolve(root, dir), resolve(candidate, dir), {recursive: true, filter: publicFile});
}
await mkdir(join(candidate, 'scripts'));
for (const script of scripts) await cp(join(root, 'scripts', script), join(candidate, 'scripts', script));
for (const script of ['website-seo.mjs', 'task-guides.mjs', 'task-guides.json', 'task-guides.css']) {
  await cp(join(root, 'scripts', script), join(candidate, 'scripts', script));
}
for (const dir of ['src', 'notices']) {
  await cp(join(root, 'scripts/compact-distribution', dir), join(candidate, 'scripts/compact-distribution', dir), {recursive: true, filter: publicFile});
}
for (const entry of await readdir(join(root, 'scripts/compact-distribution'), {withFileTypes: true})) {
  if (entry.isFile() && /^(?:Cargo\.(?:toml|lock)|[a-z-]+\.mjs)$/.test(entry.name)) {
    await cp(join(root, 'scripts/compact-distribution', entry.name), join(candidate, 'scripts/compact-distribution', entry.name));
  }
}
await cp(join(root, 'docs/open-source'), join(candidate, 'docs/open-source'), {recursive: true, filter: path => !path.endsWith('research.md')});
// Generator and regression-test source inputs must survive the ancestor filters.
for (const input of ['public/brand/references/header-outline-vector.svg', 'public/brand/references/approved-logo-source.png', 'public/brand/references/approved-logo-vector.svg', 'public/brand/references/approved-logo-trace.json', 'public/resources/blue-black-v1/manifest.json', 'public/resources/characters-v1/reviews.json', 'public/examples/template-assets/paper-study.jpg']) {
  await stat(join(candidate, input));
}
const manifest = {};
async function inspect(dir) {
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name), name = relative(candidate, path).split('\\').join('/');
    if (entry.isDirectory()) { await inspect(path); continue; }
    if (!entry.isFile()) throw new Error(`A source package cannot contain symbolic links: ${name}`);
    const bytes = await readFile(path);
    if (/\.(?:json|html|mjs|cjs|js|ts|svelte|md|txt|css|svg|yml|yaml|toml)$/.test(name)) {
      const text = bytes.toString('utf8');
      if (privateText.test(text) || containsReleaseCredential(text)) throw new Error(`Private content requires review: ${name}`);
    }
    manifest[name] = {bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
  }
}
await inspect(candidate);
await rename(candidate, finalCandidate);
const archive = join(output, 'deckleaf-source.tar.gz');
if (!process.argv.includes('--stage-only')) execFileSync('tar', ['-czf', archive + '.tmp', '-C', output, 'deckleaf'], {env: {...process.env, COPYFILE_DISABLE: '1'}});
if (!process.argv.includes('--stage-only')) await rename(archive + '.tmp', archive);
const report = {status: 'private-release-candidate', files: Object.keys(manifest).length, sourceBytes: Object.values(manifest).reduce((sum, file) => sum + file.bytes, 0), archiveBytes: process.argv.includes('--stage-only') ? 0 : (await stat(archive)).size, filesByPath: manifest};
await writeFile(join(output, 'deckleaf-source-manifest.json'), JSON.stringify(report, null, 2) + '\n');
if (!process.argv.includes('--stage-only')) await writeFile(join(output, 'SHA256SUMS'), createHash('sha256').update(await readFile(archive)).digest('hex') + '  deckleaf-source.tar.gz\n');
console.log(JSON.stringify({output, status: report.status, files: report.files, sourceMB: +(report.sourceBytes / 1e6).toFixed(1), archiveMB: +(report.archiveBytes / 1e6).toFixed(1)}));
