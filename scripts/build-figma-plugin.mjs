import {BRAND_NAME} from '../src/brand-name.js';
import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {Script} from 'node:vm';
const root=new URL('../',import.meta.url),ui=new URL('plugins/figma-export/ui.html',root);
export function brandPluginUI(html,brandName=BRAND_NAME){
  return html.replace(/(<!-- deck-studio-brand:start -->[\s\S]*?<h2\b[^>]*>)[^<]*(<\/h2>[\s\S]*?<!-- deck-studio-brand:end -->)/,(_match,before,after)=>before+brandName+after)
    .replace(/(<p\b[^>]*\bid="status"[^>]*>)Get a code in [^<]* → Figma Slides\.(<\/p>)/,(_match,before,after)=>`${before}Get a code in ${brandName} → Figma Slides.${after}`);
}
async function bundle(entry,globalName,target='es2022'){
  const result=await build({entryPoints:[new URL(entry,root).pathname],bundle:true,write:false,minify:true,format:'iife',globalName,platform:'browser',target,plugins:[{
    name:'figma-font-capability',
    setup(plugin){
      // The capture API provides font names/geometry, never original font files.
      plugin.onResolve({filter:/^\.\/pptx-imported-fonts$/},()=>({path:'figma-font-codecs-unavailable',namespace:'figma-capability'}));
      plugin.onLoad({filter:/.*/,namespace:'figma-capability'},()=>({contents:'export async function prepareImportedPptxFonts(){throw new Error("Import font files in the local editor before native font conversion.");}',loader:'js'}));
    },
  }],define:{'import.meta.env':'{}','__DECK_NATIVE_FONT_CODECS__':'false'},logLevel:'warning'});
  const code=result.outputFiles[0].text;new Script(code);return code;
}
const [pptx,native,uiSource]=await Promise.all([bundle('plugins/figma-export/pptx.ts','DeckStudioPptx'),bundle('plugins/figma-export/main.ts','DeckStudioFigma','es2017'),readFile(new URL('plugins/figma-export/ui.js',root),'utf8')]);
const uiCode=uiSource.replace(/^const BRAND_NAME = '[^']*';/m,()=>`const BRAND_NAME = ${JSON.stringify(BRAND_NAME)};`);
new Script(uiCode);
const inline=code=>code.replace(/<\/script/gi,'<\\/script');
let html=await readFile(ui,'utf8');
html=html.replace(/<title>[^<]*<\/title>/,`<title>${BRAND_NAME} · Figma Slides</title>`).replace(/placeholder="Paste code from [^"]*"/,`placeholder="Paste code from ${BRAND_NAME}"`);
html=brandPluginUI(html);
html=html.replace(/<!-- deck-studio-pptx:start -->[\s\S]*?<!-- deck-studio-pptx:end -->/,()=>`<!-- deck-studio-pptx:start --><script>${inline(pptx)}</script><!-- deck-studio-pptx:end -->`);
html=html.replace(/<!-- deck-studio-ui:start -->[\s\S]*?<!-- deck-studio-ui:end -->/,()=>`<!-- deck-studio-ui:start --><script>${inline(uiCode)}</script><!-- deck-studio-ui:end -->`);
// Unchanged builds must not hot-reload an active Figma sync connection.
async function writeChanged(path,value){if(await readFile(path,'utf8').catch(()=>undefined)!==value)await writeFile(path,value);}
// The UI and native code are written only after all three scripts parse.
await writeChanged(ui,html);await writeChanged(new URL('plugins/figma-export/code.js',root),native);
const manifestURL=new URL('plugins/figma-export/manifest.json',root),manifest=JSON.parse(await readFile(manifestURL,'utf8'));manifest.name=`${BRAND_NAME} · Slides sync`;await writeChanged(manifestURL,JSON.stringify(manifest,null,2)+'\n');
console.log(`Built Figma plugin: UI ${(Buffer.byteLength(pptx)/1024).toFixed(1)} KB; native ${(Buffer.byteLength(native)/1024).toFixed(1)} KB.`);
