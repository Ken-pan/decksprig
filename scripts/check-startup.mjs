import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const buildRoot = process.env.DECK_STUDIO_BUILD_DIR || 'dist';
const manifest = JSON.parse(await readFile(join(buildRoot, '.vite/manifest.json'), 'utf8'));
const assets = new Set(), visited = new Set();
function include(key) {
  if (visited.has(key)) return;
  visited.add(key);
  const chunk = manifest[key];
  if (!chunk) throw new Error(`Missing build manifest entry: ${key}`);
  assets.add(chunk.file);
  for (const css of chunk.css || []) assets.add(css);
  for (const imported of chunk.imports || []) include(imported);
}
include('index.html');
let javascript = 0, css = 0;
for (const file of assets) {
  const size = (await stat(join(buildRoot, file))).size;
  if (file.endsWith('.js')) javascript += size;
  if (file.endsWith('.css')) css += size;
}
// Browser-only transports must be removed before dependency discovery, rather
// than emitted as unreachable chunks in the local distribution.
if (process.env.VITE_DECK_RUNTIME !== 'browser' && Object.keys(manifest).some(key => key.startsWith('src/core/web/'))) {
  throw new Error('Local build includes the browser-only backend. Keep transport imports behind build-time branches.');
}
const welcome = manifest['src/components/WorkspaceWelcome.svelte'];
if (welcome && [...welcome.imports || [], ...welcome.dynamicImports || []].includes('src/core/templates.ts')) {
  throw new Error('Welcome previews must use generated covers instead of generating full template stories. Run npm run build:previews.');
}
if (welcome?.imports?.some(key => /SlideCanvas|template-covers/.test(manifest[key].name ?? key))) {
  throw new Error('The welcome screen must defer the live template renderer.');
}
const deferred = /(?:SlideRail|SlideCanvas|ObjectInspector|ResourceLibrary|CharacterLibrary|AutoLayoutDialog|Presentation|FontLibrary|FidelityReview|VersionHistory|AIPanel|MotionPanel|PrintDocument|CanvasLayoutGuides|CanvasContainerDrop|proposal-copy|arrangement-operations|pptx|pdf|export|google-native)/i;
// Match the stable chunk name. A content hash may coincidentally contain
// "pdf" or another feature name even when the chunk is editor infrastructure.
const eagerFeatures = [...visited].filter(key => deferred.test(manifest[key].name ?? key.replace(/-[\w-]{8}\.(?:js|css)$/, ''))).map(key => manifest[key].file);
if (javascript > 450_000 || css > 180_000 || eagerFeatures.length) {
  throw new Error(`Startup budget exceeded: JS ${javascript} / 450000, CSS ${css} / 180000. Eager optional features: ${eagerFeatures.join(', ') || 'none'}`);
}
console.log(`Startup budget: JS ${(javascript / 1000).toFixed(1)} KB / 450 KB; CSS ${(css / 1000).toFixed(1)} KB / 180 KB; optional features deferred.`);
