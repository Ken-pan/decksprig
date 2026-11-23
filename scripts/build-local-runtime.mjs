import {build} from 'esbuild';
import {createRequire, isBuiltin} from 'node:module';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {brotliCompress, constants} from 'node:zlib';
import {projectRoot} from './distribution.mjs';

const require = createRequire(import.meta.url);
const pack = promisify(brotliCompress);

export async function buildLocalRuntime(outdir) {
  const {metafile} = await build({
    absWorkingDir: projectRoot,
    entryPoints: {
      server: 'server/index.ts',
      mcp: 'server/mcp.ts',
      'illustration-image.worker': 'server/illustration-image.worker.mjs',
    },
    outdir,
    outExtension: {'.js': '.mjs'},
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    minify: true,
    legalComments: 'eof',
    define: {__DECK_PACKAGED_SERVER__: 'true', 'process.env.NODE_ENV': '"production"'},
    banner: {js: "import {createRequire as _createRequire} from 'node:module'; const require = _createRequire(import.meta.url);"},
    metafile: true,
  });
  for (const output of Object.values(metafile.outputs)) {
    for (const imported of output.imports) {
      if (imported.external && !isBuiltin(imported.path)) throw new Error(`Unbundled runtime dependency: ${imported.path}`);
    }
  }
  const counts = JSON.parse(await readFile(join(projectRoot, 'server/icon-counts.json'), 'utf8'));
  for (const [prefix, entry] of Object.entries(counts)) {
    if (!/^[a-z0-9-]+$/.test(prefix)) throw new Error('Invalid icon collection.');
    const name = `@iconify-json/${prefix}`;
    if (require(name + '/package.json').version !== entry.version) throw new Error(`Stale icon metadata for ${prefix}. Run the icon index generator.`);
    const destination = join(outdir, 'icons', prefix);
    await mkdir(destination, {recursive: true});
    for (const filename of ['icons.json', 'info.json']) {
      const bytes = await readFile(require.resolve(name + '/' + filename));
      if (filename === 'icons.json' && Object.keys(JSON.parse(bytes).icons).length !== entry.count) throw new Error(`Stale icon count for ${prefix}.`);
      await writeFile(join(destination, filename + '.stored.br'), await pack(bytes, {params: {[constants.BROTLI_PARAM_QUALITY]: 7}}));
    }
  }
}
