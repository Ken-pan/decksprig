const projectOrigin = import.meta.env.VITE_DECKSPRIG_PUBLIC_ORIGIN || 'https://decksprig.kens-toolbox.com';
import {z} from '../schema';
import {CharacterManifestSchema,CharacterRecipeSchema,SavedCharacterVariantSchema,CharacterRequestInputSchema,CharacterGenerationRequestSchema,REGION_NAMES,DEFAULT_CHARACTER_PALETTE,characterVariant,customizeCharacterPixels,measureCharacterAccent,generationPrompt,defaultCharacterRecipe,type CharacterRecipe} from '../characters';
import type {ResourceItem} from '../resources';
import {readWebSource,writeWebRecord,listWebRecords} from './store';
import {checkedBlob,sha256,imagePixels,dataUrl} from './media';
let manifestPromise:Promise<z.infer<typeof CharacterManifestSchema>>|undefined;
const manifest=()=>manifestPromise??=fetch('/resources/characters-v1/manifest.json').then(r=>r.json()).then(raw=>CharacterManifestSchema.parse(raw));
async function checkedImage(file:string,hash?:string){const blob=await checkedBlob('/resources/characters-v1/'+file);if(hash&&await sha256(new Uint8Array(await blob.arrayBuffer()))!==hash)throw new Error('The character asset failed validation. Reload to try again.');return blob;}
export async function renderCharacter(raw:unknown){
  const recipe=CharacterRecipeSchema.parse(raw),catalog=await manifest(),variant=characterVariant(catalog,recipe),palette=variant.palette??DEFAULT_CHARACTER_PALETTE;
  const original=await checkedImage(variant.file,variant.sha256);
  const resource:ResourceItem={id:`character:${recipe.variantId}`,kind:'illustration',provider:'Characters and scenes',title:`${catalog.characters.find(c=>c.id===recipe.characterId)!.label} · ${catalog.scenes.find(s=>s.id===recipe.sceneId)!.label}`,creator:'Decksprig · AI-generated',sourceUrl:projectOrigin+'/app',license:'CC0 1.0',licenseUrl:projectOrigin+'/resources/characters-v1/README.md',attributionRequired:false,attribution:'AI-generated artwork · CC0 1.0',originalSha256:variant.sha256,characterRecipe:recipe,color:recipe.clothesColor,previewUrl:''};
  const unchanged=recipe.skinMode==='classic'&&recipe.clothesColor===palette.clothes&&(recipe.renderVersion==='3'||recipe.hairColor===palette.hair)&&recipe.accentColor===palette.accent;
  if(unchanged)return {blob:original,item:resource,width:variant.width,height:variant.height};
  const {canvas,context,pixels}=await imagePixels(original);
  if(canvas.width!==variant.width||canvas.height!==variant.height)throw new Error('The character dimensions do not match.');
  const labels=new Uint8Array(canvas.width*canvas.height),coverage=new Uint8Array(labels.length);
  for(const [index,region]of REGION_NAMES.entries()){
    const mask=await imagePixels(await checkedImage(variant.masks[region],variant.maskSha256?.[region]));
    if(mask.canvas.width!==canvas.width||mask.canvas.height!==canvas.height)throw new Error('The mask dimensions do not match.');
    for(let i=0;i<labels.length;i++)if(mask.pixels.data[i*4+3]){if(labels[i]||!pixels.data[i*4+3])throw new Error('Invalid reviewed character mask.');labels[i]=index+1;coverage[i]=mask.pixels.data[i*4+3];}
  }
  customizeCharacterPixels(new Uint8Array(pixels.data.buffer),labels,recipe,{coverage:recipe.renderVersion!=='1'?coverage:undefined,palette,calibration:variant.calibration,accentCalibration:measureCharacterAccent(new Uint8Array(pixels.data.buffer),labels)});
  context.putImageData(pixels,0,0);return {blob:await canvas.convertToBlob({type:'image/png'}),item:resource,width:variant.width,height:variant.height};
}
export async function characterEmbedded(recipe:unknown){const data=await renderCharacter(recipe);const {previewUrl,...resource}=data.item;return {src:await dataUrl(data.blob),resource,width:data.width,height:data.height};}
async function saved(id:string){z.string().check(z.guid()).parse(id);const record=await readWebSource<{value:any;blob:Blob}>('character:'+id);if(!record)throw new Error('This character is not saved in this browser.');const value=SavedCharacterVariantSchema.parse(record.value);if(value.imageSha256&&await sha256(new Uint8Array(await record.blob.arrayBuffer()))!==value.imageSha256)throw new Error('The saved snapshot failed validation.');const item:ResourceItem={id:`character-saved:${id}`,kind:'illustration',provider:'Characters and scenes',title:value.name,creator:'Decksprig · AI-generated',sourceUrl:projectOrigin+'/app',license:'CC0 1.0',licenseUrl:projectOrigin+'/resources/characters-v1/README.md',attributionRequired:false,attribution:'AI-generated artwork · CC0 1.0',originalSha256:value.originalSha256,characterRecipe:value.recipe,previewUrl:''};return {blob:record.blob,item,width:value.width!,height:value.height!};}
export async function characterResource(id:string){if(id.startsWith('character-saved:'))return saved(id.slice(16));const variant=(await manifest()).variants.find(v=>`character:${v.id}`===id);if(!variant)throw new Error('Unknown character version.');return renderCharacter(defaultCharacterRecipe(variant));}
export async function browserCharacterJson(path:string,method:string,body:any){
  if(path.endsWith('/catalog'))return {...await manifest(),saved:await listWebRecords('character'),requests:await listWebRecords('character-request'),warnings:[]};
  if(path.endsWith('/render')){if(!body.savedId)return characterEmbedded(body.recipe);const data=await saved(body.savedId);const {previewUrl,...resource}=data.item;return {src:await dataUrl(data.blob),resource,width:data.width,height:data.height};}
  if(path.endsWith('/variants')){
    const input=z.strictObject({name:z.string().check(z.trim()).check(z.minLength(1)).check(z.maxLength(120)),recipe:CharacterRecipeSchema,baseSha256:z.string().check(z.regex(/^[a-f0-9]{64}$/))}).parse(body),data=await renderCharacter(input.recipe);
    if(data.item.originalSha256!==input.baseSha256)throw new Error('The original character changed. Save it again.');
    const catalog=await manifest(),value=SavedCharacterVariantSchema.parse({id:crypto.randomUUID(),name:input.name,recipe:input.recipe,originalSha256:input.baseSha256,createdAt:new Date().toISOString(),imageSha256:await sha256(new Uint8Array(await data.blob.arrayBuffer())),width:data.width,height:data.height,characterLabel:catalog.characters.find(c=>c.id===input.recipe.characterId)!.label,sceneLabel:catalog.scenes.find(s=>s.id===input.recipe.sceneId)!.label});
    await writeWebRecord('sources',{id:'character:'+value.id,kind:'character',value,blob:data.blob});return value;
  }
  if(path.endsWith('/requests')){
    if(method==='GET')return listWebRecords('character-request');
    const input=CharacterRequestInputSchema.parse(body),catalog=await manifest(),variant=characterVariant(catalog,input.recipe),person=catalog.characters.find(c=>c.id===input.recipe.characterId)!,master=catalog.variants.find(v=>v.id===person.masterVariantId)!;
    const value=CharacterGenerationRequestSchema.parse({id:crypto.randomUUID(),status:'pending-generation',createdAt:new Date().toISOString(),...input,prompt:generationPrompt(catalog,input.recipe,input),reference:{variantId:variant.id,sourceSha256:variant.sha256,identityRevision:person.identityRevision??1,masterVariantId:master.id,masterSha256:master.sha256}});
    await writeWebRecord('sources',{id:'character-request:'+value.id,kind:'character-request',value});return value;
  }
  throw new Error('Unsupported character action.');
}
export async function browserCharacterPreview(path:string,params:URLSearchParams){const match=path.match(/\/variants\/([\da-f-]+)\/image$/);const data=match?await saved(match[1]):await renderCharacter(JSON.parse(params.get('recipe')||'null'));return new Response(data.blob,{headers:{'Content-Type':'image/png'}});}
