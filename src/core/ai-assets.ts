import {patchSchema} from './patch-schema';
import {z} from './schema';
import type {Deck,SlideElement} from './model';
import type {Operation} from './operations';
import type {EditScope} from './ai-editing';
import type {EditingServices} from './ai-tools';
import {resourceReplacementPatch} from './resource-replacement';
import {resourceReplacementContext} from './resource-replacement-context';
import {canRecolorResource,isGraphicBackground} from './resource-purpose';
import {defaultIllustrationColor} from './illustration-defaults';
import {deckDesignSystem} from './deck-design-system';
import {GraphicRecipeSchema} from './graphic-recipe';
import {CharacterRecipeSchema} from './character-recipe-schema';

export const ReadAssetsSchema=z.strictObject({slideIds:z.optional(z.array(z.string()).check(z.maxLength(3000))),elementIds:z.optional(z.array(z.string()).check(z.maxLength(3000))),query:z.optional(z.string().check(z.maxLength(120))),kind:z.optional(z.enum(['all','icon','illustration','photo','region-fill'])),offset:z.optional(z.number().check(z.int()).check(z.minimum(0))),limit:z.optional(z.number().check(z.int()).check(z.minimum(1)).check(z.maximum(40)))});
export const ReplaceAssetsSchema=z.strictObject({baseRevision:z.number().check(z.int()).check(z.minimum(0)),replacements:z.array(z.strictObject({
  slideId:z.string(),elementId:z.string(),resourceId:z.optional(z.string().check(z.minLength(1)).check(z.maxLength(200))),
  sourceSlideId:z.optional(z.string()),sourceElementId:z.optional(z.string().clone().register(z.globalRegistry,{description:'Only reuse different existing artwork when requested. Never supply the target itself. Normal replacements use a different resourceId from search_resources.'})),
  color:z.optional(z.string().check(z.regex(/^#[\da-fA-F]{6}$/))),graphic:z.optional(patchSchema(GraphicRecipeSchema)),
  characterRecipeJson:z.optional(z.string().check(z.maxLength(4000))),fit:z.optional(z.enum(['auto','contain','cover','region'])),
})).check(z.minLength(1)).check(z.maxLength(12))});

function replacementBlock(e:SlideElement) {
  if(e.locked)return 'Unlock this object in the editor before replacing its asset.';
  if(e.sourceRegion||!e.src)return 'This object uses an imported source region. Preserve the source; choose a standalone image.';
  return undefined;
}
const purpose=(e:SlideElement)=>isGraphicBackground(e.resource?.id)?'region-fill':e.resource?.kind??'photo';
export function readAssets(deck:Deck,input:z.infer<typeof ReadAssetsSchema>,scope?:EditScope) {
  const slideIds=input.slideIds?.length?input.slideIds:scope?.slideIds,elementIds=input.elementIds?.length?input.elementIds:scope?.elementIds;
  if(slideIds?.some(id=>!deck.slides.some(s=>s.id===id))||elementIds?.some(id=>!deck.slides.some(s=>(!slideIds||slideIds.includes(s.id))&&s.elements.some(e=>e.id===id))))throw new Error('Object or slide no longer exists. Read the current IDs again.');
  const query=input.query?.normalize('NFKC').toLowerCase()??'',items=deck.slides.flatMap((s,index)=>{
    if(slideIds&&!slideIds.includes(s.id))return [];
    return s.elements.filter(e=>e.type==='image'&&(!elementIds?.length||elementIds.includes(e.id))&&(!input.kind||input.kind==='all'||purpose(e)===input.kind)&&[e.id,e.name,e.resource?.title,e.resource?.id].some(v=>v?.normalize('NFKC').toLowerCase().includes(query))).map(e=>{
      const r=e.resource,blocked=replacementBlock(e);
      return {slideId:s.id,slideNumber:index+1,elementId:e.id,name:e.name,purpose:purpose(e),box:{x:e.x,y:e.y,w:e.w,h:e.h},fit:e.fit,group:e.group,hidden:e.hidden,canReplace:!blocked,...(blocked?{blocked}:{}),
        resource:r?{id:r.id,kind:r.kind,title:r.title,provider:r.provider,creator:r.creator,license:r.license,sourceUrl:r.sourceUrl,licenseUrl:r.licenseUrl,color:r.color,originalSha256:r.originalSha256,graphicRecipe:r.graphicRecipe,characterRecipe:r.characterRecipe}:undefined,
        search:resourceReplacementContext(r),canRecolor:canRecolorResource(r),template:s.template?{layout:s.template.prototype,collection:s.template.collection}:undefined};
    });
  });
  const offset=input.offset??0,limit=input.limit??20;
  return {deckId:deck.id,baseRevision:deck.revision,total:items.length,items:items.slice(offset,offset+limit),nextOffset:offset+limit<items.length?offset+limit:null,instruction:'For replacement, search_resources with the returned library filters and choose a DIFFERENT resourceId. prepare_asset_replacements keeps the existing frames and returns one recipe for review. Omit resourceId only to customize the current library asset. Reuse a different document object only when requested; never use the target as its own source.'};
}

export async function prepareAssetReplacements(deck:Deck,input:z.infer<typeof ReplaceAssetsSchema>,services?:EditingServices) {
  if(input.baseRevision!==deck.revision)throw new Error('The document revision changed. Read assets and prepare replacements again.');
  const targets=new Set<string>();
  const find=(slideId:string,elementId:string)=>{const e=deck.slides.find(s=>s.id===slideId)?.elements.find(e=>e.id===elementId);if(!e)throw new Error('Image no longer exists. Use read_assets to choose an image object.');if(e.type!=='image')throw new Error(`The target is a ${e.type} object. To turn text or a shape into artwork, use search_resources, prepare_resource and prepare_element, then delete the old object in the same prepared proposal. Asset replacements require an existing image object.`);return e;};
  // Validate the whole batch before loading any external resource.
  const jobs=input.replacements.map(item=>{
    const key=`${item.slideId}/${item.elementId}`;if(targets.has(key))throw new Error('Use each replacement target once.');targets.add(key);
    const target=find(item.slideId,item.elementId),blocked=replacementBlock(target);if(blocked)throw new Error(blocked);
    if(Boolean(item.sourceSlideId)!==Boolean(item.sourceElementId))throw new Error('Supply both sourceSlideId and sourceElementId to reuse document artwork.');
    if(item.sourceElementId&&(item.resourceId||item.color||item.graphic||item.characterRecipeJson))throw new Error('Reuse document artwork or choose/customize a library resource in one replacement.');
    const source=item.sourceElementId?find(item.sourceSlideId!,item.sourceElementId):undefined;
    if(source===target)throw new Error('Choose different document artwork. Reusing the target itself does not replace its asset. Use search_resources to find a suitable replacement.');
    if(source&&(source.sourceRegion||!source.src))throw new Error('The source uses an imported region. Choose standalone document artwork.');
    const id=item.resourceId??target.resource?.id;
    if(!source&&!id)throw new Error('Supply an existing resourceId from search_resources, or document artwork IDs from read_assets.');
    if(!source&&!services)throw new Error('The resource library is unavailable. Reuse standalone document artwork instead.');
    if(item.graphic&&!id?.startsWith('deck-graphics:'))throw new Error('Graphic settings apply only to Decksprig patterns, textures and accents.');
    if(item.characterRecipeJson&&!id?.startsWith('character:'))throw new Error('Character settings require an existing character resource.');
    return {item,target,source,id:id!};
  });
  const loaded=new Map<string,Awaited<ReturnType<NonNullable<EditingServices>['importResource']>>>(),operations:Operation[]=[],details:unknown[]=[];
  for(const {item,target,source,id} of jobs){
    const same=id===target.resource?.id;
    let image:Pick<SlideElement,'src'|'resource'|'name'>;
    if(source)image={src:source.src,resource:source.resource,name:source.name};
    else {
      const recolorable=canRecolorResource({id});
      if(item.color&&!recolorable)throw new Error('This resource cannot be recolored. Use a supported icon/illustration, or its character settings.');
      const color=recolorable?(item.color??target.resource?.color??(id.startsWith('iconify:')?deckDesignSystem(deck).colors.ink:defaultIllustrationColor(deck))):undefined;
      const graphicRecipe=id.startsWith('deck-graphics:')?(item.graphic?GraphicRecipeSchema.parse({... (same?target.resource?.graphicRecipe:undefined),...item.graphic}):same?target.resource?.graphicRecipe:undefined):undefined;
      const characterRecipe=item.characterRecipeJson?CharacterRecipeSchema.parse(JSON.parse(item.characterRecipeJson)):same?target.resource?.characterRecipe:undefined;
      if(characterRecipe&&id.startsWith('character:')&&id!==`character:${characterRecipe.variantId}`)throw new Error('The character resourceId must match the chosen variantId. Use an existing variant.');
      const key=JSON.stringify([id,color,graphicRecipe,characterRecipe]);
      let data=loaded.get(key);if(!data){data=await services!.importResource({id,color,graphicRecipe,characterRecipe});loaded.set(key,data);}
      if(data.resource.id!==id)throw new Error('The resource source has changed. Search the library again.');
      image={...data,name:data.resource.title.slice(0,200)};
    }
    const region=isGraphicBackground(image.resource?.id),kind=image.resource?.kind;
    if(item.fit==='region'&&!region)throw new Error('Region fill requires a pattern or texture; icons, illustrations and photos retain their proportions.');
    const unchangedSource=image.src===target.src&&JSON.stringify(image.resource)===JSON.stringify(target.resource);
    const sameAsset=image.resource?.id&&image.resource.id===target.resource?.id;
    const fit=item.fit&&item.fit!=='auto'?(item.fit==='region'?'fill':item.fit):sameAsset?target.fit:region?'fill':kind==='photo'&&target.fit==='cover'?'cover':'contain';
    const patch=resourceReplacementPatch(image,{fit});
    // Source provenance is never rewritten. Standalone replacements have no region.
    delete patch.sourceRegion;
    if(sameAsset)patch.crop=target.crop;
    if(fit==='fill'&&region){patch.fit='fill';patch.aspectRatioLocked=false;}
    // A deliberate local color no longer follows the previous accent binding.
    if(target.design?.fill&&image.resource?.color?.toLowerCase()!==(target.resource?.color??target.fill).toLowerCase()){const design={...target.design};delete design.fill;patch.design=design;}
    if(unchangedSource&&patch.fit===target.fit)throw new Error('This replacement is unchanged: the asset already uses the requested color, style and fit. For a customization request, report that it already matches; do not choose different artwork. For an artwork replacement request, search_resources can find a different asset.');
    const unset:('crop'|'resource')[]=[];if(!patch.crop&&target.crop)unset.push('crop');if(!image.resource&&target.resource)unset.push('resource');
    operations.push({op:'update_element',slideId:item.slideId,elementId:item.elementId,patch,...(unset.length?{unset}:{})});
    details.push({slideId:item.slideId,elementId:item.elementId,resourceId:image.resource?.id,kind,purpose:region?'region-fill':kind??'photo',fit:patch.fit,license:image.resource?.license,framePreserved:true});
  }
  return {operations,replacements:details};
}
