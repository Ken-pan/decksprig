import {enhanceWebsiteSeo} from './website-seo.mjs';
import {build} from 'vite';
import {mkdir,cp,readFile,writeFile,rm,readdir,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {build as bundle} from 'esbuild';
import {copyRuntimeFonts} from './public-assets.mjs';
import {publicOrigin} from './public-origin.mjs';

const root=resolve(import.meta.dirname,'..');
const staging=process.env.DECK_STUDIO_WEB_OUTPUT?resolve(process.env.DECK_STUDIO_WEB_OUTPUT):undefined;
const candidate=staging?resolve(staging,'build'):resolve(root,'output/web-editor/build'),out=staging?resolve(staging,'dist'):resolve(root,'output/website/dist');
const origin=publicOrigin();
process.env.VITE_DECK_RUNTIME='browser';
if(!process.argv.includes('--package-only'))await build({publicDir:false,define:{'import.meta.env.VITE_DECKSPRIG_PUBLIC_ORIGIN':JSON.stringify(origin)},plugins:[{
  name:'public-template-attribution',
  transform(code,id){if(id===resolve(root,'src/core/template-media.ts'))return code.replaceAll('http://127.0.0.1:4310/',origin+'/');},
}],build:{outDir:candidate,emptyOutDir:true,rollupOptions:{input:{studio:resolve(root,'index.html')}}}});
if(process.argv.includes('--editor-only'))process.exit(0);
await rm(out,{recursive:true,force:true});
execFileSync(process.execPath,['scripts/build-website.mjs',out],{cwd:root,stdio:'inherit'});
await cp(resolve(candidate,'assets'),resolve(out,'assets'),{recursive:true});
await cp(resolve(candidate,'index.html'),resolve(out,'app.html'));
await cp(resolve(candidate,'.vite'),resolve(out,'.vite'),{recursive:true});
await copyRuntimeFonts(resolve(root,'public'),out);
for(const name of ['brand'])await cp(resolve(root,'public',name),resolve(out,name),{recursive:true,filter:path=>!path.includes('/references')&&!path.includes('/qa')});
await mkdir(resolve(out,'export-icons'),{recursive:true});
for(const name of ['broadser.svg'])await cp(resolve(root,'public/export-icons',name),resolve(out,'export-icons',name));
for(const name of ['favicon.svg','favicon.ico'])await cp(resolve(root,'public',name),resolve(out,name));
await cp(resolve(root,'public/speaker.html'),resolve(out,'speaker.html'));
await cp(resolve(root,'public/publication-preview.html'),resolve(out,'publication-preview.html'));
for(const name of ['privacy.html','licenses.html','legal.css','licenses'])await cp(resolve(root,'public',name),resolve(out,name),{recursive:true});
await enhanceWebsiteSeo(out,publicOrigin());
await mkdir(resolve(out,'examples'),{recursive:true});
for(const name of ['decksprig-demo.deck.json','deckleaf-demo.deck.json'])await cp(resolve(root,'public/examples',name),resolve(out,'examples',name));
// Only project-owned template artwork is public; imported examples stay excluded.
await cp(resolve(root,'public/examples/template-assets'),resolve(out,'examples/template-assets'),{recursive:true});
await cp(resolve(root,'plugins/figma-export'),resolve(out,'plugins/figma-export'),{recursive:true,filter:path=>!path.endsWith('.ts')});
execFileSync(resolve(root,'node_modules/.bin/tsx'),['scripts/build-browser-resources.ts',resolve(out,'resources')],{cwd:root,stdio:'inherit'});
// Netlify resolves /app to app.html. Marketing stays at the domain root.
await writeFile(resolve(out,'_redirects'),'/app /app.html 200\n/speaker /speaker.html 200\n');
const html=await readFile(resolve(out,'app.html'),'utf8'),hashes=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(match=>"'sha256-"+createHash('sha256').update(match[1]).digest('base64')+"'");
const csp=`default-src 'self'; script-src 'self' ${hashes.join(' ')}; style-src 'self' 'unsafe-inline'; font-src 'self' data: https:; img-src 'self' data: blob: https:; connect-src 'self' data: blob: https:; worker-src 'self' blob:; frame-src 'self' https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'`;
// Worker scripts receive their own response policy. Export workers read embedded
// image data and blob URLs just as the main browser editor does.
const workerCsp="default-src 'self'; script-src 'self'; connect-src 'self' data: blob: https:; img-src 'self' data: blob: https:; font-src 'self' data: https:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
const websiteHeaders=await readFile(resolve(out,'_headers'),'utf8');
// Keep caching and worker execution policy together in one asset header block.
if([...websiteHeaders.matchAll(/^\/assets\/\*\s*$/gm)].length!==1)throw new Error('Expected one website asset header block.');
const editorHeaders=websiteHeaders.replace(/^\/assets\/\*\r?\n/m,`/assets/*\n  Content-Security-Policy: ${workerCsp}\n`);
await writeFile(resolve(out,'_headers'),editorHeaders+`\n/app*\n  Content-Security-Policy: ${csp}\n  X-Robots-Tag: noindex\n\n/speaker*\n  Content-Security-Policy: ${csp}\n  X-Robots-Tag: noindex\n`);
// Only this opaque sandbox hosts the generated HTML's inline player. The app
// retains its hash-based script policy and never accepts document messages.
await writeFile(resolve(out,'_headers'),(await readFile(resolve(out,'_headers'),'utf8'))+`\n/publication-preview.html\n  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data: https:; img-src 'self' data: blob: https:; connect-src 'self' data: blob: https:; frame-src 'self' https:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'none'; sandbox allow-scripts\n  X-Frame-Options: SAMEORIGIN\n  X-Robots-Tag: noindex\n`);
const functions=staging?resolve(staging,'functions'):resolve(root,'output/web-editor/functions');await mkdir(functions,{recursive:true});
await bundle({entryPoints:[resolve(root,'netlify/functions/open-resources.ts')],outdir:functions,bundle:true,platform:'node',target:'node22',format:'cjs',define:{'import.meta.url':'__filename'},minify:true});
const files={};
async function inspect(dir,prefix=''){for(const entry of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,entry.name),key=prefix+entry.name;if(entry.isDirectory())await inspect(path,key+'/');else{const bytes=await readFile(path);if(/\.(js|html|json|txt)$/.test(key)&&/\/Users\/kenpan|DECK_AI_KEY=|\.data\/decks/.test(bytes.toString()))throw new Error(`Private local path found in publication: ${key}`);files[key]={bytes:(await stat(path)).size,sha256:createHash('sha256').update(bytes).digest('hex')};}}}
await inspect(out);for(const path of ['app.html','publication-preview.html','examples/decksprig-demo.deck.json','examples/deckleaf-demo.deck.json'])if(!files[path])throw new Error(`Missing public workflow asset: ${path}`);await writeFile(staging?resolve(staging,'build-manifest.json'):resolve(root,'output/web-editor/build-manifest.json'),JSON.stringify({origin,runtime:'browser',storage:'IndexedDB',files},null,2));
console.log(`Browser publication ready: ${Object.keys(files).length} files. Local documents and private examples excluded.`);
