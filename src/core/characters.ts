import {z} from './schema';
import { recolorAccentPixels } from '../../public/resources/accent-engine.js';

const key = z.string().check(z.regex(/^[a-z][a-z0-9-]{0,99}$/));
const hex = z.pipe(z.string().check(z.regex(/^#[\da-f]{6}$/i)), z.transform(value => value.toLowerCase()));
const sha = z.string().check(z.regex(/^[\da-f]{64}$/));
const assetPath = z.string().check(z.regex(/^(png|masks)\/[a-z][a-z0-9-]*\.png$/));
export const REGION_NAMES = ['skin', 'clothes', 'hair'] as const;
export const ATTRIBUTE_NAMES = ['expression', 'outfit', 'accessory'] as const;
export type CharacterAttribute = typeof ATTRIBUTE_NAMES[number];
import {CharacterRecipeSchema,type CharacterRecipe} from './character-recipe-schema';
export {CharacterRecipeSchema};
export type {CharacterRecipe};
export const CharacterPaletteSchema = z.strictObject({skin: hex, clothes: hex, hair: hex, accent: z.literal('#2f5bff')});
export const DEFAULT_CHARACTER_PALETTE = {skin:'#ffffff', clothes:'#2f5bff', hair:'#161616', accent:'#2f5bff'} as const;
const regionPaths = z.strictObject({skin: assetPath, clothes: assetPath, hair: assetPath});
const regionHashes = z.strictObject({skin: sha, clothes: sha, hair: sha});
const RegionPaletteSchema=z.strictObject({skin:hex,clothes:hex,hair:hex});
export const CharacterVariantSchema = z.strictObject({
  id: key, characterId: key, sceneId: key, expression: key, outfit: key, accessory: key,
  file: assetPath, sha256: sha, width: z.number().check(z.int()).check(z.minimum(1)).check(z.maximum(8192)), height: z.number().check(z.int()).check(z.minimum(1)).check(z.maximum(8192)),
  masks: regionPaths, maskSha256: z.optional(regionHashes), palette: z.optional(CharacterPaletteSchema), calibration:z.optional(RegionPaletteSchema), approved: z.boolean(),
}).check(z.refine(v => v.width * v.height <= 20_000_000, 'The character image exceeds the pixel limit.'));
export type CharacterVariant = z.infer<typeof CharacterVariantSchema>;
const CharacterDefinitionSchema = z.strictObject({
  id: key, label: z.string().check(z.minLength(1)).check(z.maxLength(120)), identity: z.string().check(z.minLength(1)).check(z.maxLength(2000)), originalId: key,
  masterVariantId: key, identityRevision: z.optional(z.number().check(z.int()).check(z.gt(0))),
});
export type CharacterDefinition = z.infer<typeof CharacterDefinitionSchema>;
export const CharacterManifestSchema = z.strictObject({
  schema: z.literal('deck-studio/characters/1'), characters: z.array(CharacterDefinitionSchema).check(z.minLength(1)).check(z.maxLength(1000)),
  scenes: z.array(z.strictObject({id:key, label:z.string().check(z.minLength(1)).check(z.maxLength(120))})).check(z.minLength(1)).check(z.maxLength(1000)),
  variants: z.array(CharacterVariantSchema).check(z.minLength(1)).check(z.maxLength(10000)),
}).check(z.superRefine((value, context) => {
  for (const field of ['characters', 'scenes', 'variants'] as const) {
    const ids = new Set<string>();
    value[field].forEach((entry, index) => {
      if (ids.has(entry.id)) context.addIssue({code:'custom',path:[field,index,'id'],message:'Duplicate resource ID.'});
      ids.add(entry.id);
    });
  }
  value.variants.forEach((variant, index) => {
    if (!value.characters.some(p => p.id === variant.characterId) || !value.scenes.some(s => s.id === variant.sceneId))
      context.addIssue({code:'custom',path:['variants',index],message:'The referenced character or scene does not exist.'});
  });
  value.characters.forEach((person, index) => {
    if (!value.variants.some(v => v.id === person.masterVariantId && v.characterId === person.id))
      context.addIssue({code:'custom',path:['characters',index,'masterVariantId'],message:'The identity reference version does not exist.'});
  });
}));
export type CharacterManifest = z.infer<typeof CharacterManifestSchema>;
const coordinate=z.number().check(z.minimum(0)).check(z.maximum(1));
export const CharacterLibrarySourceSchema = z.strictObject({
  schema:z.literal('deck-studio/character-authoring/1'), characters:z.array(CharacterDefinitionSchema),
  scenes:z.array(z.strictObject({id:key,label:z.string().check(z.minLength(1))})),
  palette:CharacterPaletteSchema,
  autoMasks:z.record(key,z.strictObject({headRect:z.tuple([coordinate,coordinate,coordinate,coordinate]),defaultAccessory:z._default(key, 'none'),handSeeds:z.record(key,z.array(z.tuple([coordinate,coordinate])).check(z.minLength(1))),
    clothesBounds:z.strictObject({maxX:coordinate,minY:coordinate,maxY:coordinate})})),
  variants:z._default(z.record(key,z.strictObject({maskMode:z.literal('authored'),masks:regionPaths,palette:z.optional(CharacterPaletteSchema)})), {}),
});
export const CharacterReviewSchema=z.strictObject({
  schema:z.literal('deck-studio/character-reviews/1'), variants:z.record(key,z.strictObject({
    decision:z.enum(['approved','rejected']), sourceSha256:sha, maskSha256:regionHashes,
    reviewer:z.string().check(z.trim()).check(z.minLength(1)).check(z.maxLength(120)), reviewedAt:z.string().check(z.iso.datetime()), evidence:z.string().check(z.minLength(1)),
    checks:z.strictObject({identity:z.boolean(),anatomy:z.boolean(),alpha:z.boolean(),regions:z.boolean()}),
  })),
});
export function characterReviewApproved(review:z.infer<typeof CharacterReviewSchema>['variants'][string]|undefined,variant:Pick<CharacterVariant,'sha256'|'maskSha256'>){
  return Boolean(review && review.decision==='approved' && review.sourceSha256===variant.sha256 && Object.values(review.checks).every(Boolean) && REGION_NAMES.every(region=>review.maskSha256[region]===variant.maskSha256?.[region]));
}
export const SavedCharacterVariantSchema = z.strictObject({
  id:z.string().check(z.guid()), name:z.string().check(z.trim()).check(z.minLength(1)).check(z.maxLength(120)), recipe:CharacterRecipeSchema,
  originalSha256:sha, createdAt:z.string().check(z.iso.datetime()), imageSha256:z.optional(sha),
  width:z.optional(z.number().check(z.int()).check(z.gt(0))), height:z.optional(z.number().check(z.int()).check(z.gt(0))),
  characterLabel:z.optional(z.string()), sceneLabel:z.optional(z.string()),
});
export type SavedCharacterVariant = z.infer<typeof SavedCharacterVariantSchema>;
export const CharacterRequestInputSchema = z.strictObject({
  recipe:CharacterRecipeSchema, expression:key, outfit:key, accessory:key, details:z._default(z.string().check(z.trim()).check(z.maxLength(1000)), ''),
});
export const CharacterGenerationRequestSchema = z.strictObject(z.extend(CharacterRequestInputSchema, {
  id:z.string().check(z.guid()), status:z.literal('pending-generation'), createdAt:z.string().check(z.iso.datetime()), prompt:z.string(),
  reference:z.optional(z.strictObject({variantId:key,sourceSha256:sha,identityRevision:z.number().check(z.int()).check(z.gt(0)),masterVariantId:key,masterSha256:sha})),
}).shape);
export type CharacterGenerationRequest = z.infer<typeof CharacterGenerationRequestSchema>;
export type CharacterCatalog = CharacterManifest & {saved:SavedCharacterVariant[]; requests?:CharacterGenerationRequest[]; warnings?:string[]};
export const EXPRESSION_OPTIONS = [{id:'confused',label:'Confused'},{id:'focused',label:'Focused'},{id:'fatigued',label:'Tired'},{id:'satisfied',label:'Satisfied'}];
export const OUTFIT_OPTIONS = [{id:'shirt',label:'Shirt'},{id:'hoodie',label:'Hoodie'},{id:'jacket',label:'Jacket'}];
export const ACCESSORY_OPTIONS = [{id:'none',label:'No glasses'},{id:'round-glasses',label:'Round glasses'},{id:'earrings',label:'Earrings'}];
export const SKIN_PRESETS = ['#f3d9c5','#e8bb98','#cf9571','#a86e4b','#79503a','#4d3329'];
export function defaultCharacterRecipe(variant:CharacterVariant):CharacterRecipe {
  const palette=variant.palette??DEFAULT_CHARACTER_PALETTE;
  return CharacterRecipeSchema.parse({characterId:variant.characterId,sceneId:variant.sceneId,variantId:variant.id,renderVersion:'3',clothesColor:palette.clothes});
}
export function twoColorCharacterRecipe(raw:unknown):CharacterRecipe{return CharacterRecipeSchema.parse({...CharacterRecipeSchema.parse(raw),renderVersion:'3'});}
export function characterVariant(manifest:CharacterManifest, recipe:CharacterRecipe) {
  const variant=manifest.variants.find(v=>v.id===recipe.variantId && v.approved);
  if (!variant || variant.characterId!==recipe.characterId || variant.sceneId!==recipe.sceneId) throw new Error('This character version is unavailable or has not passed review.');
  return variant;
}
/** Attribute controls only offer combinations that keep the other attributes intact. */
export function characterAttributeChoices(manifest:CharacterManifest, recipe:CharacterRecipe, attribute:CharacterAttribute) {
  const current=characterVariant(manifest,recipe);
  return manifest.variants.filter(v=>v.approved && v.characterId===current.characterId && v.sceneId===current.sceneId && ATTRIBUTE_NAMES.every(a=>a===attribute || v[a]===current[a])).sort((a,b)=>a.id.localeCompare(b.id));
}
/** Cross-scene/person changes are explicit best matches, independent of manifest ordering. */
export function resolveCharacterVariant(manifest:CharacterManifest, recipe:CharacterRecipe, target:{characterId?:string;sceneId?:string}) {
  const current=characterVariant(manifest,recipe), characterId=target.characterId??recipe.characterId, sceneId=target.sceneId??recipe.sceneId;
  const weights={expression:1,outfit:4,accessory:8};
  const ranked=manifest.variants.filter(v=>v.approved && v.characterId===characterId && v.sceneId===sceneId).sort((a,b)=>{
    const score=(v:CharacterVariant)=>ATTRIBUTE_NAMES.reduce((sum,k)=>sum+(v[k]===current[k]?0:weights[k]),0);
    return score(a)-score(b) || a.id.localeCompare(b.id);
  });
  const variant=ranked[0];
  return variant ? {variant,changed:ATTRIBUTE_NAMES.filter(k=>variant[k]!==current[k])} : null;
}

/** Generated pigment varies around the nominal palette; measure only reviewed interiors. */
export function measureCharacterPalette(pixels:Uint8Array,labels:Uint8Array):z.infer<typeof RegionPaletteSchema>{
  if(labels.length*4!==pixels.length)throw new Error('The region mask dimensions do not match.');
  const histograms=REGION_NAMES.map(()=>[new Uint32Array(256),new Uint32Array(256),new Uint32Array(256)]),counts=[0,0,0];
  for(let i=0;i<labels.length;i++){const region=labels[i]-1;if(region<0||region>2||pixels[i*4+3]<200)continue;counts[region]++;for(let c=0;c<3;c++)histograms[region][c][pixels[i*4+c]]++;}
  const colors=histograms.map((histogram,region)=>{
    if(!counts[region])throw new Error('The region mask has no usable pixels for calibration.');
    return '#'+histogram.map(bins=>{let seen=0;for(let value=0;value<256;value++){seen+=bins[value];if(seen>counts[region]/2)return value.toString(16).padStart(2,'0');}return 'ff';}).join('');
  });
  return {skin:colors[0],clothes:colors[1],hair:colors[2]};
}
export function measureCharacterAccent(pixels:Uint8Array,labels:Uint8Array):string{
  if(labels.length*4!==pixels.length)throw new Error('The region mask dimensions do not match.');
  const channels=[new Uint32Array(256),new Uint32Array(256),new Uint32Array(256)];let count=0;
  for(let i=0;i<labels.length;i++){
    const p=i*4,r=pixels[p],g=pixels[p+1],b=pixels[p+2],position=(g-r)/(b-r);
    if(labels[i]||pixels[p+3]<230||b-r<120||b-g<50||position<-.15||position>.65)continue;
    count++;for(let c=0;c<3;c++)channels[c][pixels[p+c]]++;
  }
  if(!count)return DEFAULT_CHARACTER_PALETTE.accent;
  return '#'+channels.map(channel=>{let seen=0;for(let value=0;value<256;value++){seen+=channel[value];if(seen>count/2)return value.toString(16).padStart(2,'0');}return 'ff';}).join('');
}
/** Labels: 0 props, 1 skin, 2 clothes, 3 hair; soft mask coverage never changes source alpha. */
export function customizeCharacterPixels(pixels:Uint8Array, labels:Uint8Array, raw:CharacterRecipe, options:{coverage?:Uint8Array;palette?:z.infer<typeof CharacterPaletteSchema>;calibration?:z.infer<typeof RegionPaletteSchema>;accentCalibration?:string}={}) {
  const recipe=CharacterRecipeSchema.parse(raw), palette=options.palette??DEFAULT_CHARACTER_PALETTE;
  if (labels.length*4!==pixels.length || (options.coverage && options.coverage.length!==labels.length)) throw new Error('The region mask dimensions do not match.');
  const rgb=(color:string)=>[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
  const calibrated=recipe.renderVersion!=='1'&&options.calibration?options.calibration:palette;
  const sources=[undefined,rgb(calibrated.skin),rgb(calibrated.clothes),rgb(calibrated.hair)];
  const ranges=sources.map(source=>source?Math.max(...source)-Math.min(...source):0);
  const targets=[undefined,recipe.skinMode==='natural'?rgb(recipe.skinColor):undefined,rgb(recipe.clothesColor),rgb(recipe.hairColor)];
  const changed=[false,recipe.skinMode==='natural'&&recipe.skinColor!==palette.skin,recipe.clothesColor!==palette.clothes,recipe.renderVersion!=='3'&&recipe.hairColor!==palette.hair];
  const propSource=rgb(options.accentCalibration??palette.accent),propTarget=rgb(recipe.accentColor);
  let accents:Uint8Array|undefined;
  if(recipe.renderVersion!=='3'&&recipe.accentColor!==palette.accent){accents=Uint8Array.from(pixels);recolorAccentPixels(accents,recipe.accentColor);}
  for(let i=0;i<labels.length;i++) {
    const label=labels[i], p=i*4;
    if(label>3)throw new Error('Invalid character region label.');
    if(!pixels[p+3])continue;
    if(!label){
      if(recipe.renderVersion==='3'&&recipe.accentColor!==palette.accent){
        const r=pixels[p],g=pixels[p+1],b=pixels[p+2],position=(g-r)/(b-r);
        if(b>90&&b-r>12&&b-g>8&&position>=-.15&&position<=.65){
          const weight=Math.min(1,(b-r)/Math.max(1,propSource[2]-propSource[0]));
          for(let c=0;c<3;c++)pixels[p+c]=Math.round(Math.max(0,Math.min(255,pixels[p+c]+(propTarget[c]-propSource[c])*weight)));
        }
      }else if(accents)for(let c=0;c<3;c++)pixels[p+c]=accents[p+c];
      continue;
    }
    if(!changed[label])continue;
    const source=sources[label]!,target=targets[label]!;
    const coverage=(options.coverage?.[i]??255)/255;
    const current=[pixels[p],pixels[p+1],pixels[p+2]];
    const range=ranges[label];
    const weight=recipe.renderVersion==='1'?Math.min(1,(current[2]-current[0])/208):Math.max(0,Math.min(1,(Math.max(...current)-Math.min(...current))/Math.max(1,range)));
    for(let c=0;c<3;c++) {
      const next=recipe.renderVersion==='1'
        ? label===1?current[c]*target[c]/255:label===2?current[c]+(target[c]-source[c])*weight:target[c]+current[c]-source[c]
        : label===2&&range>16?current[c]+(target[c]-source[c])*weight:source[c]===0?target[c]+current[c]*(255-target[c])/255:current[c]*target[c]/source[c];
      pixels[p+c]=Math.round(current[c]+(Math.max(0,Math.min(255,next))-current[c])*coverage);
    }
  }
  return pixels;
}
export function generationPrompt(manifest:CharacterManifest, raw:CharacterRecipe, changes:{expression:string;outfit:string;accessory:string;details:string}) {
  const recipe=CharacterRecipeSchema.parse(raw), variant=characterVariant(manifest,recipe), person=manifest.characters.find(p=>p.id===recipe.characterId)!;
  const master=manifest.variants.find(v=>v.id===person.masterVariantId)!;
  const colorRule=recipe.renderVersion==='3'?' Only skin and one shared clothing/prop accent are editable colors. Keep the reference hair color and silhouette unchanged.':'';
  return `Identity-preserving raster edit. Identity master: ${master.file} (SHA-256 ${master.sha256}), identity revision ${person.identityRevision??1}. Scene reference: ${variant.file} (SHA-256 ${variant.sha256}). Character ${person.label}: ${person.identity}. Keep this identity, face proportions, line thickness, body proportions, scene props and other people unchanged. Scene: ${recipe.sceneId}. Requested expression: ${changes.expression}; outfit: ${changes.outfit}; accessory: ${changes.accessory}. ${changes.details}\nColor recipe (apply only within reviewed semantic regions): ${JSON.stringify(recipe)}.${colorRule} Coordinate eyebrows, eyes, mouth and posture for emotion. Preserve real transparent alpha and opaque subject interiors. No text, logos, gradients or shadows. Do not overwrite the reference. Save a new transparent PNG and review identity/anatomy/alpha before adoption. New or changed source/masks must not be published without renewed review.`;
}
