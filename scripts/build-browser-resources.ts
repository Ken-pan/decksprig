import {publicOrigin} from './public-origin.mjs';
const origin=publicOrigin();
import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {searchResources,resourceCatalog} from '../server/resources';
import {iconLibrary,illustrationLibrary} from '../server/resource-catalog';
import {blueBlackLibrary} from '../server/blue-black';
import {characterManifest} from '../server/characters';
import {graphicLibrary,graphicItem} from '../server/deck-graphics';
import {ICON_SETS,attributionText} from '../src/core/resources';

const out=resolve(process.argv[2]||'output/web-editor/resources');
await mkdir(out,{recursive:true});
const items=[];
for(let page=1;;page++){
  const result=await searchResources(new URLSearchParams({kind:'illustration',page:String(page)}));
  items.push(...result.items);if(!result.hasMore)break;
}
const blue=await blueBlackLibrary(),illustrations=await illustrationLibrary(),graphics=await graphicLibrary();
for(const item of items){
  let file='';
  if(item.id.startsWith('blue-black:')){
    file='blue-black-v1/'+blue.find(asset=>`blue-black:${asset.id}`===item.id)!.file;
    item.sourceUrl=origin+'/resources/blue-black-v1/README.md';
    item.licenseUrl='https://creativecommons.org/publicdomain/zero/1.0/';item.attribution=attributionText(item);
  }else if(item.id.startsWith('deck-graphics:')){
    file='deck-graphics-v1/'+graphics.find(asset=>graphicItem(asset).id===item.id)!.file;
    if(!item.attributionRequired){item.sourceUrl=origin+'/resources/deck-graphics-v1/README.md';item.attribution=attributionText(item);item.licenseNotice=item.licenseNotice?.replaceAll('http://127.0.0.1:4310/resources/deck-graphics-v1/README.md',item.sourceUrl);}
  }else if(item.id.startsWith('doodles:'))file=`doodles/${item.id.slice(8)}.svg`;
  else file='illlustrations/'+illustrations.find(asset=>`illlustrations:${asset.id}`===item.id)!.file;
  if(!/^[\w/-]+\.(png|svg)$/.test(file))throw new Error('Invalid published asset path.');
  await mkdir(resolve(out,file,'..'),{recursive:true});await cp(resolve('public/resources',file),resolve(out,file));
  if(item.id==='illlustrations:day34-ticket'){await cp(resolve('public/resources/illlustrations/day34-ticket.svg'),resolve(out,'illlustrations/day34-ticket.svg'));}
  Object.assign(item,{file:'/resources/'+file});
}
await mkdir(resolve(out,'icons'),{recursive:true});
const licenses=JSON.parse(await readFile('public/resources/licenses/index.json','utf8'));
const iconInfo:Record<string,unknown>={};
for(const set of ICON_SETS){const library=await iconLibrary(set.id);await writeFile(resolve(out,'icons',set.id+'.json'),JSON.stringify(library.data));iconInfo[set.id]={author:library.info.author.name,license:library.info.license.title,licenseUrl:licenses[set.id].url,notice:await readFile(`public/resources/licenses/${set.id}.txt`,'utf8')};}
await writeFile(resolve(out,'catalog.json'),JSON.stringify({catalog:await resourceCatalog(),items,icons:iconInfo}));
const characters=await characterManifest();
await mkdir(resolve(out,'characters-v1'),{recursive:true});
await writeFile(resolve(out,'characters-v1/manifest.json'),JSON.stringify(characters));
for(const variant of characters.variants){for(const file of [variant.file,...Object.values(variant.masks)]){await mkdir(resolve(out,'characters-v1',file,'..'),{recursive:true});await cp(resolve('public/resources/characters-v1',file),resolve(out,'characters-v1',file));}}
for(const name of ['blue-black-v1','characters-v1','deck-graphics-v1'])await cp(resolve('public/resources',name,'README.md'),resolve(out,name,'README.md'));
for(const file of ['gallery.js','manifest.json','deck-graphics-v1.zip'])await cp(resolve('public/resources/deck-graphics-v1',file),resolve(out,'deck-graphics-v1',file));
await cp(resolve('public/resources/graphic-engine.js'),resolve(out,'graphic-engine.js'));
console.log(`Browser resources: ${items.length} illustrations, ${characters.variants.filter(v=>v.approved).length} reviewed character versions, ${ICON_SETS.length} icon collections.`);

await writeFile(resolve(out,'deck-graphics-v1/index.html'),(await readFile(resolve('public/resources/deck-graphics-v1/index.html'),'utf8')).replace('name="deck-editor-path" content="/"','name="deck-editor-path" content="/app"'));

await cp(resolve('public/resources/licenses'),resolve(out,'licenses'),{recursive:true});
