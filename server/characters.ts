import { characterDisplayLabel, sceneDisplayLabel } from '../src/core/library-copy';
import {readFile,writeFile,mkdir,readdir,rename,stat,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {z} from '../src/core/schema';
import {PNG} from 'pngjs';
import {DATA} from './store';
import {CharacterRecipeSchema,CharacterManifestSchema,CharacterReviewSchema,characterReviewApproved,SavedCharacterVariantSchema,CharacterRequestInputSchema,CharacterGenerationRequestSchema,REGION_NAMES,DEFAULT_CHARACTER_PALETTE,characterVariant,customizeCharacterPixels,measureCharacterAccent,generationPrompt,defaultCharacterRecipe,type CharacterRecipe,type CharacterVariant,type CharacterManifest,type SavedCharacterVariant} from '../src/core/characters';
import type {EmbeddedResource} from '../src/core/resources';
import type {ResourceAttribution} from '../src/core/model';

const root=resolve('public/resources/characters-v1');
const hash=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
const savedRoot=resolve(DATA,'character-variants'), requestsRoot=resolve(DATA,'character-requests');
const uuid=(value:string)=>z.string().check(z.guid()).parse(value);
const file=(path:string)=>{if(!/^(png|masks)\/[a-z][a-z0-9-]*\.png$/.test(path))throw new Error('Invalid character asset path.');return resolve(root,path);};
export async function characterManifest():Promise<CharacterManifest>{
  const manifest=CharacterManifestSchema.parse(JSON.parse(await readFile(resolve(root,'manifest.json'),'utf8')));
  const reviews=CharacterReviewSchema.parse(JSON.parse(await readFile(resolve(root,'reviews.json'),'utf8')));
  return {...manifest, characters: manifest.characters.map(c=>({...c,label:characterDisplayLabel(c.id,c.label)})), scenes: manifest.scenes.map(s=>({...s,label:sceneDisplayLabel(s.id,s.label)})), variants:manifest.variants.map(v=>({...v,approved:v.approved&&characterReviewApproved(reviews.variants[v.id],v)}))};
}
async function records<T>(directory:string,schema:z.ZodMiniType<T>){
  await mkdir(directory,{recursive:true});const items:T[]=[],warnings:string[]=[];
  for(const name of(await readdir(directory)).filter(n=>n.endsWith('.json')).sort()){
    try{uuid(name.slice(0,-5));items.push(schema.parse(JSON.parse(await readFile(resolve(directory,name),'utf8'))));}
    catch(error:any){if(error.code!=='ENOENT')warnings.push(`Local record ${name} could not be read. The original file is preserved.`);}
  }
  return {items,warnings};
}
async function atomic(path:string,value:unknown){
  const temporary=`${path}.${randomUUID()}.tmp`;
  try{await writeFile(temporary,JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});await rename(temporary,path);}
  finally{await rm(temporary,{force:true});}
}
export async function characterCatalog(){
  const saved=await records(savedRoot,SavedCharacterVariantSchema),requests=await records(requestsRoot,CharacterGenerationRequestSchema);
  const newest=<T extends {createdAt:string;id:string}>(items:T[])=>items.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
  return {...await characterManifest(),saved:newest(saved.items),requests:newest(requests.items),warnings:[...saved.warnings,...requests.warnings]};
}

type Prepared={original:Buffer;image:PNG;labels:Uint8Array;coverage:Uint8Array;accentCalibration:string};
// Keep only a few decoded images; rendered PNGs have a separate byte-bounded cache.
const preparedCache=new Map<string,Promise<Prepared>>(),renderCache=new Map<string,Buffer>();
let renderedBytes=0;
async function prepare(variant:CharacterVariant){
  const paths=[variant.file,...REGION_NAMES.map(region=>variant.masks[region])];
  const stamps=[];
  for(const path of paths){const s=await stat(file(path));stamps.push([path,s.size,s.mtimeMs,s.ctimeMs]);}
  const signature=JSON.stringify([variant.sha256,variant.maskSha256,variant.width,variant.height,stamps]);
  const cached=preparedCache.get(signature);
  if(cached){preparedCache.delete(signature);preparedCache.set(signature,cached);return {data:await cached,signature};}
  const pending=(async()=>{
    const original=await readFile(file(variant.file));if(hash(original)!==variant.sha256)throw new Error('The original character image has changed. Review the asset again.');
    const image=PNG.sync.read(original);
    if(image.width!==variant.width||image.height!==variant.height)throw new Error('The character image dimensions do not match the catalog.');
    const labels=new Uint8Array(image.width*image.height),coverage=new Uint8Array(labels.length);
    for(const [index,region]of REGION_NAMES.entries()){
      const bytes=await readFile(file(variant.masks[region]));
      if(variant.maskSha256 && hash(bytes)!==variant.maskSha256[region])throw new Error('The character mask has changed. Review the asset again.');
      const mask=PNG.sync.read(bytes);if(mask.width!==image.width||mask.height!==image.height)throw new Error('The region mask dimensions do not match.');
      let selected=0;
      for(let i=0;i<labels.length;i++)if(mask.data[i*4+3]){
        if(labels[i])throw new Error('Character region masks overlap.');
        if(!image.data[i*4+3])throw new Error('Character region masks cover the transparent background.');
        labels[i]=index+1;coverage[i]=mask.data[i*4+3];selected++;
      }
      if(!selected)throw new Error('The character region mask is empty.');
    }
    return {original,image,labels,coverage,accentCalibration:measureCharacterAccent(image.data,labels)};
  })();
  preparedCache.set(signature,pending);
  while(preparedCache.size>3)preparedCache.delete(preparedCache.keys().next().value!);
  try{return {data:await pending,signature};}catch(error){preparedCache.delete(signature);throw error;}
}
function rememberRender(key:string,bytes:Buffer){
  if(bytes.length>16_000_000)return;
  if(renderCache.has(key))renderedBytes-=renderCache.get(key)!.length;
  renderCache.delete(key);renderCache.set(key,bytes);renderedBytes+=bytes.length;
  while(renderedBytes>16_000_000 || renderCache.size>40){const oldest=renderCache.keys().next().value!;renderedBytes-=renderCache.get(oldest)!.length;renderCache.delete(oldest);}
}
function previewImage(image:PNG){
  const scale=Math.min(1,1536/Math.max(image.width,image.height));if(scale===1)return image;
  const output=new PNG({width:Math.max(1,Math.round(image.width*scale)),height:Math.max(1,Math.round(image.height*scale))});
  for(let y=0;y<output.height;y++)for(let x=0;x<output.width;x++){
    const sx=Math.max(0,Math.min(image.width-1,(x+.5)*image.width/output.width-.5)),sy=Math.max(0,Math.min(image.height-1,(y+.5)*image.height/output.height-.5));
    const x0=Math.floor(sx),y0=Math.floor(sy),dx=sx-x0,dy=sy-y0,sum=[0,0,0,0];
    for(const [xx,yy,w]of [[x0,y0,(1-dx)*(1-dy)],[Math.min(x0+1,image.width-1),y0,dx*(1-dy)],[x0,Math.min(y0+1,image.height-1),(1-dx)*dy],[Math.min(x0+1,image.width-1),Math.min(y0+1,image.height-1),dx*dy]]){
      const p=(yy*image.width+xx)*4,alpha=image.data[p+3]*w;sum[3]+=alpha;for(let c=0;c<3;c++)sum[c]+=image.data[p+c]*alpha;
    }
    const p=(y*output.width+x)*4;output.data[p+3]=Math.round(sum[3]);if(sum[3])for(let c=0;c<3;c++)output.data[p+c]=Math.round(sum[c]/sum[3]);
  }
  return output;
}
function attribution(recipe:CharacterRecipe,sourceSha256:string,characterLabel:string,sceneLabel:string):ResourceAttribution{
  return {id:`character:${recipe.variantId}`,kind:'illustration',provider:'Characters and scenes',title:`${characterLabel} · ${sceneLabel}`,creator:'Decksprig · AI-generated',
    sourceUrl:'http://127.0.0.1:4310/characters.html',license:'CC0 1.0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',attributionRequired:false,
    attribution:`${characterLabel} · ${sceneLabel} · AI-generated artwork · CC0 1.0`,originalSha256:sourceSha256,characterRecipe:recipe,color:recipe.clothesColor};
}
export async function renderCharacter(raw:unknown,preview=false){
  const recipe=CharacterRecipeSchema.parse(raw),manifest=await characterManifest(),variant=characterVariant(manifest,recipe);
  const {data,signature}=await prepare(variant),palette=variant.palette??DEFAULT_CHARACTER_PALETTE;
  const resource=attribution(recipe,variant.sha256,manifest.characters.find(c=>c.id===recipe.characterId)!.label,manifest.scenes.find(s=>s.id===recipe.sceneId)!.label);
  const unchanged=recipe.skinMode==='classic'&&recipe.clothesColor===palette.clothes&&(recipe.renderVersion==='3'||recipe.hairColor===palette.hair)&&recipe.accentColor===palette.accent;
  const key=JSON.stringify([signature,palette,variant.calibration,recipe,preview]);
  let bytes=renderCache.get(key);
  if(bytes){renderCache.delete(key);renderCache.set(key,bytes);}
  else if(unchanged&&(!preview||Math.max(data.image.width,data.image.height)<=1536))bytes=data.original;
  else{
    const image=new PNG({width:data.image.width,height:data.image.height});image.data=Buffer.from(data.image.data);
    customizeCharacterPixels(image.data,data.labels,recipe,{coverage:recipe.renderVersion!=='1'?data.coverage:undefined,palette,calibration:variant.calibration,accentCalibration:data.accentCalibration});
    bytes=PNG.sync.write(preview?previewImage(image):image);rememberRender(key,bytes);
  }
  return {bytes,resource,width:variant.width,height:variant.height};
}
export async function characterEmbedded(recipe:unknown):Promise<EmbeddedResource & {width:number;height:number}>{const data=await renderCharacter(recipe);return {src:`data:image/png;base64,${data.bytes.toString('base64')}`,resource:data.resource,width:data.width,height:data.height};}
export async function saveCharacterVariant(raw:unknown){
  const input=z.strictObject({name:z.string().check(z.trim()).check(z.minLength(1)).check(z.maxLength(120)),recipe:CharacterRecipeSchema,baseSha256:z.string().check(z.regex(/^[\da-f]{64}$/))}).parse(raw);
  const rendered=await renderCharacter(input.recipe);if(rendered.resource.originalSha256!==input.baseSha256)throw new Error('The original character image has changed. Save it again.');
  const manifest=await characterManifest();
  await mkdir(savedRoot,{recursive:true});const id=randomUUID();
  const record:SavedCharacterVariant={id,name:input.name,recipe:input.recipe,originalSha256:input.baseSha256,createdAt:new Date().toISOString(),imageSha256:hash(rendered.bytes),width:rendered.width,height:rendered.height,
    characterLabel:manifest.characters.find(p=>p.id===input.recipe.characterId)!.label,sceneLabel:manifest.scenes.find(s=>s.id===input.recipe.sceneId)!.label};
  const imagePath=resolve(savedRoot,`${id}.png`),temporary=`${imagePath}.tmp`;
  try{
    await writeFile(temporary,rendered.bytes,{mode:0o600,flag:'wx'});await rename(temporary,imagePath);
    // Metadata is the commit marker. No catalog reader sees an incomplete snapshot.
    await atomic(resolve(savedRoot,`${id}.json`),record);return record;
  }catch(error){await rm(imagePath,{force:true});throw error;}finally{await rm(temporary,{force:true});}
}
export async function savedCharacterImage(id:string){
  uuid(id);const record=SavedCharacterVariantSchema.parse(JSON.parse(await readFile(resolve(savedRoot,`${id}.json`),'utf8'))),bytes=await readFile(resolve(savedRoot,`${id}.png`));
  if(record.id!==id || (record.imageSha256&&hash(bytes)!==record.imageSha256))throw new Error('The saved character snapshot failed validation. The original file is preserved.');
  return {record,bytes};
}
export async function savedCharacterEmbedded(id:string){
  const {record,bytes}=await savedCharacterImage(id);
  const dimensions=record.width&&record.height?{width:record.width,height:record.height}:PNG.sync.read(bytes);
  const resource={...attribution(record.recipe,record.originalSha256,record.characterLabel??record.recipe.characterId,record.sceneLabel??record.recipe.sceneId),id:`character-saved:${record.id}`,title:record.name};
  return {src:`data:image/png;base64,${bytes.toString('base64')}`,resource,width:dimensions.width,height:dimensions.height};
}
export async function characterResource(id:string){
  if(id.startsWith('character-saved:')){const data=await savedCharacterEmbedded(id.slice(16));return {bytes:Buffer.from(data.src.slice(data.src.indexOf(',')+1),'base64'),type:'image/png',resource:data.resource,width:data.width,height:data.height};}
  const manifest=await characterManifest(),variant=manifest.variants.find(v=>`character:${v.id}`===id);if(!variant)throw new Error('This character version does not exist.');
  const data=await renderCharacter(defaultCharacterRecipe(variant));return {...data,type:'image/png'};
}
export async function saveCharacterRequest(raw:unknown){
  const input=CharacterRequestInputSchema.parse(raw),manifest=await characterManifest(),variant=characterVariant(manifest,input.recipe);
  await prepare(variant);
  const person=manifest.characters.find(p=>p.id===input.recipe.characterId)!,master=manifest.variants.find(v=>v.id===person.masterVariantId)!;
  if(!master.approved)throw new Error('The character identity reference has not passed review.');
  if(master.id!==variant.id)await prepare(master);
  const record=CharacterGenerationRequestSchema.parse({id:randomUUID(),status:'pending-generation',createdAt:new Date().toISOString(),...input,prompt:generationPrompt(manifest,input.recipe,input),
    reference:{variantId:variant.id,sourceSha256:variant.sha256,identityRevision:person.identityRevision??1,masterVariantId:master.id,masterSha256:master.sha256}});
  await mkdir(requestsRoot,{recursive:true});await atomic(resolve(requestsRoot,`${record.id}.json`),record);return record;
}
export async function characterRequests(){return (await records(requestsRoot,CharacterGenerationRequestSchema)).items.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
