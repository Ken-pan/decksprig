import { defineConfig } from 'vite';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runtimePublicAssets} from './scripts/public-assets.mjs';
import {browserPreload} from './scripts/browser-preload.mjs';
import {localDocumentPreload} from './scripts/local-document-preload.mjs';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// These leaf modules already belong to the initial graph in both editions.
// Merge their small chunks without pulling optional dependencies into startup.
const corePrimitives = /\/src\/core\/(?:text-editing\.ts|table-rich-text\.ts|text-sizing\.ts|design-system-schema\.ts|chart-schema\.ts|interactions\.ts|table-schema\.ts|document-data\.ts|document-media-transport\.ts|template-scaling\.ts|shapes\.ts|slide-visibility\.ts|shape-schema\.ts|draft-store\.ts|drawing-identity\.ts|resource-purpose\.ts|font-fallbacks\.json|font-stack\.ts|json-request\.ts|chart-caption\.ts|chart-format\.ts|runtime\.ts|container-tree\.ts|inline-text-width\.ts|ui-copy\.ts)$/;
const startupUI = /\/src\/(?:core\/(?:slide-label|shape-label-color|page-layout-geometry|color-contrast)|pointer-cursor|ui-viewport)\.ts$/;
const startupIcons = /\/node_modules\/@lucide\/svelte\/dist\/icons\/(?:arrow-left|arrow-right|book-open|check|chevron-down|copy|eye-off|plus)\.svelte$/;

const localPreload=browserPreload();
const coverSource = new URL('./src/core/template-covers.json', import.meta.url);
const coverSnapshot = new URL('./src/assets/welcome/source.sha256', import.meta.url);

function currentWelcomeSnapshot() {
  const sourceHash = createHash('sha256').update(readFileSync(coverSource)).digest('hex');
  return sourceHash === readFileSync(coverSnapshot, 'utf8').trim();
}

export default defineConfig(({command}) => ({
  worker: {format: 'es'},
  publicDir: command === 'build' ? false : 'public',
  define:{
    __DECK_NATIVE_FONT_CODECS__:'true',
    __DECK_STATIC_WELCOME_COVERS__:JSON.stringify(command === 'build' && !process.env.DECK_STUDIO_LIVE_WELCOME && currentWelcomeSnapshot()),
  },
  plugins: [svelte(), ...(process.env.VITE_DECK_RUNTIME === 'browser' ? [] : [runtimePublicAssets(),localPreload.plugin,localDocumentPreload()])],
  server: {hmr: false},
  build: {
    outDir: process.env.DECK_STUDIO_BUILD_DIR || 'dist',
    target: 'es2022',
    manifest: true,
    modulePreload:process.env.VITE_DECK_RUNTIME==='browser'?undefined:{resolveDependencies:localPreload.resolveDependencies},
    rollupOptions: {input: {studio: 'index.html', characters: 'characters.html', brand: 'brand.html'},output:{codeSplitting:{groups:[{name:'core-primitives',test:(id:string)=>corePrimitives.test(id)||startupUI.test(id)||id.endsWith('/src/brand-name.js'),priority:100,includeDependenciesRecursively:false},{name:'startup-icons',test:startupIcons,includeDependenciesRecursively:false},{name:'line-geometry',test:/\/src\/core\/(?:line-path|hit-testing)\.ts$/,includeDependenciesRecursively:false},...['chart-caption','chart-continuation','template-edit-adaptation','table-fit'].map(name=>({name,test:new RegExp(`/src/core/${name}\\.ts$`),includeDependenciesRecursively:false})),{name:'command-search',test:/\/src\/components\/ui\/(?:CommandSearch|SearchResults|SearchField)\.svelte$/,includeDependenciesRecursively:false}]}}},
  },
}));
