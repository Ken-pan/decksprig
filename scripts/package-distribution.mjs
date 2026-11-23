import {resolve} from 'node:path';
import {cp, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {projectRoot, distributionOutput, freshOutput, inventory, packageManifest, linkDuplicateArtwork, exportSources, archivePackage} from './distribution.mjs';
import {buildLocalRuntime} from './build-local-runtime.mjs';
const index = process.argv.indexOf('--output');
if (index >= 0 && !process.argv[index + 1]) throw new Error('Missing output directory.');
const output = distributionOutput(index >= 0 ? process.argv[index + 1] : resolve(projectRoot, 'output/distribution', new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid));
await freshOutput(output);
const app = resolve(output, 'app'), website = resolve(output, 'website');
const dist = resolve(app, 'dist');
// Keep generators sequential: they own shared generated brand/plugin outputs.
execFileSync('npm', ['run', 'build'], {cwd: projectRoot, env: {...process.env, DECK_STUDIO_BUILD_DIR: dist, DECK_STUDIO_COMPACT_BUILD: '1'}, stdio: 'inherit'});
await buildLocalRuntime(resolve(app, 'runtime'));
const packedArtwork = process.argv.includes('--pack-artwork')
  ? await (await import('./compact-distribution/pack-artwork.mjs')).packArtwork(app, resolve(output, 'codec-build')) : undefined;
const sharedExampleBytes = packedArtwork ? await (await import('./compact-distribution/example-variant.mjs')).packExampleVariant(app) : 0;
for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) await cp(resolve(projectRoot, name), resolve(app, name));
await writeFile(resolve(app, 'README.md'), '# Decksprig local app\n\nWith Node.js 22.14 or newer, run `node runtime/server.mjs` and open http://127.0.0.1:4310/. The directory containing this README is the app root. You can also launch the service from another directory by passing the absolute path to its script.\n\nDocuments default to app/.data. Set DECK_STUDIO_DATA to an absolute location for a different library, including an existing library outside the app. For a stdio MCP client, run `node /path/to/app/runtime/mcp.mjs` with the same DECK_STUDIO_DATA setting. Node.js and optional native conversion tools are installed separately.\n');
execFileSync(process.execPath, ['scripts/build-website.mjs', website], {cwd: projectRoot, stdio: 'inherit'});
execFileSync(process.execPath, ['scripts/compress-assets.mjs'], {cwd: projectRoot, env: {...process.env, DECK_STUDIO_BUILD_DIR: website, DECK_STUDIO_COMPACT_BUILD: '0'}, stdio: 'inherit'});
const reports = {app: await packageManifest(app, 'offline-app'), website: await packageManifest(website, 'website'), 'export-sources': await exportSources(projectRoot, resolve(output, 'export-sources'))};
const artworkFiles = Object.fromEntries(Object.entries(reports.app.files).filter(([path]) => path.startsWith('dist/')).map(([path, entry]) => [path.slice(5), entry]));
const sharedArtworkBytes = await linkDuplicateArtwork(dist, artworkFiles);
const archives = {};
for (const name of Object.keys(reports)) archives[name] = await archivePackage(output, name, `deckleaf-${name}.tar.gz`);
const packages = {};
for (const [name, report] of Object.entries(reports)) {
  const files = await inventory(resolve(output, name));
  packages[name] = {kind: report.kind, files: Object.keys(files).length, unpackedBytes: Object.values(files).reduce((sum,file)=>sum+file.bytes,0), archive: archives[name]};
  if (name === 'app') packages[name].sharedArtworkBytes = sharedArtworkBytes;
  if (name === 'app' && sharedExampleBytes) packages[name].sharedExampleBytes = sharedExampleBytes;
  if (name === 'app' && packedArtwork) packages[name].packedArtwork = packedArtwork;
}
await writeFile(resolve(output, 'release.json'), JSON.stringify({format: 'deckleaf-distribution/1', packages, totalUnpackedBytes: Object.values(packages).reduce((sum,p)=>sum+p.unpackedBytes,0), totalArchiveBytes: Object.values(archives).reduce((sum,a)=>sum+a.bytes,0)}, null, 2) + '\n');
await writeFile(resolve(output, 'SHA256SUMS'), Object.values(archives).map(a=>`${a.sha256}  ${a.file}\n`).join(''));
await writeFile(resolve(output, 'README.md'), '# Decksprig distribution packages\n\napp/ contains the local editor, production Node service, stdio MCP service, complete offline export fonts and original template media. Run `node app/runtime/server.mjs` with Node.js 22.14 or newer. Read app/README.md for library locations and configuration. Node.js, personal documents and optional native converters are separate.\n\nwebsite/ is the independent marketing site. Its /app link is a deployment integration point. Use the existing build:web command when assembling the compatible combined browser hosting layout. This command does not deploy either package.\n\nexport-sources/ retains original TTF faces, source manifest, licenses, generator and hashed inputs. Source manifests keep their original paths inside that package.\n\nrelease.json reports each unpacked and archived size plus aggregate totals. Keep SHA256SUMS with the tar.gz files. Existing source assets and documents are never removed by this packager.\n');
console.log(JSON.stringify({output, packages}, null, 2));
