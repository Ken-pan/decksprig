import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {PNG} from 'pngjs';
import {CharacterRecipeSchema,CharacterManifestSchema,CharacterLibrarySourceSchema,CharacterReviewSchema,characterReviewApproved,characterAttributeChoices,resolveCharacterVariant,defaultCharacterRecipe,twoColorCharacterRecipe,measureCharacterPalette,measureCharacterAccent,customizeCharacterPixels,characterVariant,generationPrompt,type CharacterManifest} from '../src/core/characters';
import {blankSlide,newDeck,validateDeck} from '../src/core/model';
import {resourceElement,resourceOperation} from '../src/core/resources';
import {applyOperations} from '../src/core/operations';
import {shelfKey,shelfItem} from '../src/core/resource-shelf';
const root='public/resources/characters-v1';
const manifest:CharacterManifest=CharacterManifestSchema.parse(JSON.parse(await readFile(`${root}/manifest.json`,'utf8')));
test('catalog validates unique IDs, cross references and safe asset paths',()=>{
 assert.throws(()=>CharacterManifestSchema.parse({...manifest,variants:[...manifest.variants,manifest.variants[0]]}));
 assert.throws(()=>CharacterManifestSchema.parse({...manifest,variants:manifest.variants.map((v,i)=>i? v:{...v,sceneId:'missing'})}));
 assert.throws(()=>CharacterManifestSchema.parse({...manifest,variants:manifest.variants.map((v,i)=>i? v:{...v,file:'../private.png'})}));
 assert.throws(()=>CharacterManifestSchema.parse({...manifest,characters:manifest.characters.map((p,i)=>i?p:{...p,masterVariantId:'missing'})}));
});
test('authoring is declarative and approval is tied to source and every mask, not build success',async()=>{
 const source=CharacterLibrarySourceSchema.parse(JSON.parse(await readFile(`${root}/library-source.json`,'utf8')));
 const reviews=CharacterReviewSchema.parse(JSON.parse(await readFile(`${root}/reviews.json`,'utf8')));
 assert.deepEqual(source.characters,manifest.characters);assert.deepEqual(source.scenes,manifest.scenes);
 for(const variant of manifest.variants){const review=reviews.variants[variant.id];assert(characterReviewApproved(review,variant));
  assert.equal(characterReviewApproved(undefined,variant),false);assert.equal(characterReviewApproved({...review,checks:{...review.checks,identity:false}},variant),false);
  assert.equal(characterReviewApproved(review,{...variant,sha256:'0'.repeat(64)}),false);
  assert.equal(characterReviewApproved(review,{...variant,maskSha256:{...variant.maskSha256!,hair:'0'.repeat(64)}}),false);
 }
});
test('attribute controls never silently change clothes, expression or eyewear',()=>{
 const base=defaultCharacterRecipe(manifest.variants.find(v=>v.id==='yun-search-confused-shirt')!);
 for(const attribute of ['expression','outfit','accessory'] as const){const choices=characterAttributeChoices(manifest,base,attribute);assert(choices.length>=2);
  for(const choice of choices)for(const other of ['expression','outfit','accessory'] as const)if(other!==attribute)assert.equal(choice[other],characterVariant(manifest,base)[other]);
 }
 const satisfied={...base,variantId:'yun-search-satisfied-shirt'};
 assert(!characterAttributeChoices(manifest,satisfied,'outfit').some(v=>v.outfit==='hoodie'));
 const unreviewed={...manifest,variants:manifest.variants.map(v=>({...v,approved:false}))};
 assert.throws(()=>characterAttributeChoices(unreviewed,base,'expression'));
 const resolved=resolveCharacterVariant(manifest,base,{sceneId:'form'});
 assert.equal(resolved?.variant.id,'yun-form-focused-shirt');assert.deepEqual(resolved?.changed,['expression']);
 assert.deepEqual(resolveCharacterVariant({...manifest,variants:[...manifest.variants].reverse()},base,{characterId:'an'}),resolveCharacterVariant(manifest,base,{characterId:'an'}));
 assert.equal(resolveCharacterVariant(manifest,base,{sceneId:'missing'}),null);
});
test('rendering v2 preserves black detail and partial mask coverage; legacy recipes retain v1',()=>{
 const base={...defaultCharacterRecipe(manifest.variants[0]),renderVersion:'2' as const},legacy={...base} as Partial<typeof base>;delete legacy.renderVersion;
 assert.equal(CharacterRecipeSchema.parse(legacy).renderVersion,'1');assert.equal(base.renderVersion,'2');
 const pixels=Buffer.from([0,0,0,255,11,11,11,255,22,22,22,200,255,255,255,255,47,91,255,0]);
 const labels=Uint8Array.from([3,3,3,0,2]);
 const changed=customizeCharacterPixels(Buffer.from(pixels),labels,{...base,hairColor:'#808080'},{coverage:Uint8Array.from([255,255,128,0,255])});
 assert.deepEqual([...changed.slice(0,4)],[0,0,0,255]);assert.deepEqual([...changed.slice(4,8)],[64,64,64,255]);
 assert.deepEqual([...changed.slice(8,12)],[75,75,75,200]);assert.deepEqual(changed.slice(12),pixels.slice(12));
 assert.throws(()=>customizeCharacterPixels(Buffer.from(pixels),Uint8Array.from([4,0,0,0,0]),base));
});
test('calibration maps actual generated pigment to the requested color, without changing originals or legacy rendering',()=>{
 const base={...defaultCharacterRecipe(manifest.variants[0]),renderVersion:'2' as const},pixels=Buffer.from([254,254,254,255,1,87,254,255,15,15,15,255]),labels=Uint8Array.from([1,2,3]);
 const calibration=measureCharacterPalette(pixels,labels);assert.deepEqual(calibration,{skin:'#fefefe',clothes:'#0157fe',hair:'#0f0f0f'});
 const custom={...base,skinMode:'natural' as const,skinColor:'#79503a',clothesColor:'#f1cde2',hairColor:'#c3b7a7'};
 const modified=customizeCharacterPixels(Buffer.from(pixels),labels,custom,{calibration});
 assert.deepEqual([...modified],[121,80,58,255,241,205,226,255,195,183,167,255]);
 assert.deepEqual(customizeCharacterPixels(Buffer.from(pixels),labels,base,{calibration}),pixels);
 assert.deepEqual(customizeCharacterPixels(Buffer.from(pixels),labels,{...custom,renderVersion:'1'},{calibration}),customizeCharacterPixels(Buffer.from(pixels),labels,{...custom,renderVersion:'1'}));
 const flatBlack=customizeCharacterPixels(Buffer.from([0,0,0,255]),Uint8Array.from([3]),{...base,hairColor:'#808080'},{palette:{skin:'#ffffff',clothes:'#2f5bff',hair:'#000000',accent:'#2f5bff'}});
 assert.deepEqual([...flatBlack],[128,128,128,255]);
});
test('new recipes expose two independent colors while older recipes keep their stored behavior',()=>{
 const base=defaultCharacterRecipe(manifest.variants[0]);assert.equal(base.renderVersion,'3');
 const legacy={...base,renderVersion:'2' as const,clothesColor:'#35664d',hairColor:'#c3b7a7',accentColor:'#bd365b'};
 assert.deepEqual(CharacterRecipeSchema.parse(legacy),legacy);
 const next=twoColorCharacterRecipe(legacy);assert.equal(next.accentColor,next.clothesColor);assert.equal(next.hairColor,'#161616');assert.equal(next.renderVersion,'3');
 assert.equal(CharacterRecipeSchema.parse({...next,accentColor:'#000000',hairColor:'#ff0000'}).accentColor,next.clothesColor);
 const pixels=Buffer.from([255,255,255,255,1,87,254,255,15,15,15,255,2,84,254,255,12,14,35,255]),labels=Uint8Array.from([1,2,3,0,0]);
 const calibrated=measureCharacterPalette(pixels,labels),accentCalibration=measureCharacterAccent(pixels,labels);
 assert.equal(accentCalibration,'#0254fe');
 const result=customizeCharacterPixels(Buffer.from(pixels),labels,{...next,skinMode:'natural',skinColor:'#79503a'},{calibration:calibrated,accentCalibration});
 assert.deepEqual([...result],[121,80,58,255,53,102,77,255,15,15,15,255,53,102,77,255,12,14,35,255]);
});
test('pilot has three distinct identity references and covers all nine role/scene pairs with generated versions',()=>{
 assert.equal(manifest.characters.length,3);assert.equal(manifest.scenes.length,3);assert.equal(manifest.variants.length,18);
 for(const person of manifest.characters){assert(manifest.variants.some(v=>v.id===person.masterVariantId));for(const scene of manifest.scenes)assert(manifest.variants.some(v=>v.characterId===person.id&&v.sceneId===scene.id));
  const search=manifest.variants.filter(v=>v.characterId===person.id&&v.sceneId==='search');assert(search.some(v=>v.expression==='satisfied'));assert(search.some(v=>v.outfit==='hoodie'));assert(search.some(v=>v.accessory==='none'));assert(search.some(v=>v.accessory==='round-glasses'));}
 const recipe=defaultCharacterRecipe(manifest.variants[0]);assert.throws(()=>CharacterRecipeSchema.parse({...recipe,skinColor:'red'}));assert.throws(()=>characterVariant(manifest,{...recipe,characterId:'unknown'}));
});
test('all source hashes, mask dimensions and alpha are preserved; each individual color change is confined to its region',async()=>{
 for(const variant of manifest.variants){
  const bytes=await readFile(`${root}/${variant.file}`);assert.equal(createHash('sha256').update(bytes).digest('hex'),variant.sha256,variant.id);
  const original=PNG.sync.read(bytes),labels=new Uint8Array(original.width*original.height);assert.equal(original.width,variant.width);assert.equal(original.height,variant.height);
  for(const [region,label]of [['skin',1],['clothes',2],['hair',3]] as const){const bytes=await readFile(`${root}/${variant.masks[region]}`);assert.equal(createHash('sha256').update(bytes).digest('hex'),variant.maskSha256?.[region]);const mask=PNG.sync.read(bytes);assert.equal(mask.width,original.width);assert.equal(mask.height,original.height);let count=0;
   for(let i=0;i<labels.length;i++)if(mask.data[i*4+3]){assert.equal(labels[i],0);labels[i]=label;count++;}assert(count>100,`${variant.id} ${region}`);}
  assert.deepEqual(measureCharacterPalette(original.data,labels),variant.calibration);
  const base={...defaultCharacterRecipe(variant),renderVersion:'2' as const},options={palette:variant.palette,calibration:variant.calibration,accentCalibration:measureCharacterAccent(original.data,labels)};assert.deepEqual(customizeCharacterPixels(Buffer.from(original.data),labels,base,options),original.data);
  for(const [label,patch]of [[1,{skinMode:'natural',skinColor:'#79503a'}],[2,{clothesColor:'#bd365b'}],[3,{hairColor:'#6f5542'}]] as const){
   const modified=customizeCharacterPixels(Buffer.from(original.data),labels,CharacterRecipeSchema.parse({...base,...patch}),options);let changed=0;
   for(let i=0;i<labels.length;i++){const p=i*4; if(modified[p+3]!==original.data[p+3])throw new Error(`${variant.id}: alpha changed`);
    const difference=modified[p]!==original.data[p]||modified[p+1]!==original.data[p+1]||modified[p+2]!==original.data[p+2];
    if(difference){changed++;if(labels[i]!==label)throw new Error(`${variant.id}: unselected region changed`);}}
   assert(changed>100,`${variant.id} ${label}`);
  }
  const modern=twoColorCharacterRecipe({...base,skinMode:'natural',skinColor:'#79503a',clothesColor:'#35664d',hairColor:'#c3b7a7',accentColor:'#bd365b'});
  const modified=customizeCharacterPixels(Buffer.from(original.data),labels,modern,options);let clothing=0,props=0;
  for(let i=0;i<labels.length;i++){const p=i*4;if(modified[p+3]!==original.data[p+3])throw new Error(`${variant.id}: alpha changed`);
   const changed=modified[p]!==original.data[p]||modified[p+1]!==original.data[p+1]||modified[p+2]!==original.data[p+2];
   if(labels[i]===3&&changed)throw new Error(`${variant.id}: hair changed`);
   if(changed){if(labels[i]===2)clothing++;if(labels[i]===0)props++;}
  }
  assert(clothing>100&&props>100,`${variant.id}: shared color did not reach both clothing and props`);
  const skinOnly=customizeCharacterPixels(Buffer.from(original.data),labels,twoColorCharacterRecipe({...base,skinMode:'natural',skinColor:'#79503a'}),options);
  for(let i=0;i<labels.length;i++)if(labels[i]!==1)for(let c=0;c<4;c++)if(skinOnly[i*4+c]!==original.data[i*4+c])throw new Error(`${variant.id}: skin changed another region`);
 }
});
test('character recipes travel with undoable document transactions and locked images reject replacement',()=>{
 const variant=manifest.variants[0],recipe=defaultCharacterRecipe(variant),deck=newDeck('Characters',[blankSlide()]);
 const resource={id:`character:${variant.id}`,kind:'illustration' as const,title:'Character',provider:'Characters',creator:'Deckleaf',sourceUrl:'http://127.0.0.1:4310/characters.html',license:'本地生成素材',licenseUrl:'http://127.0.0.1:4310/characters.html',attribution:'Character',attributionRequired:false,originalSha256:variant.sha256,characterRecipe:recipe};
 const legacyResource={...resource,characterRecipe:{...recipe,renderVersion:'2' as const}};
 assert.notEqual(shelfKey(legacyResource),shelfKey({...legacyResource,characterRecipe:{...legacyResource.characterRecipe,hairColor:'#6f5542'}}));
 assert.equal(shelfKey(resource),shelfKey({...resource,characterRecipe:{...recipe,hairColor:'#6f5542'}}));
 assert.notEqual(shelfKey(resource),shelfKey({...resource,characterRecipe:{...recipe,skinMode:'natural'}}));
 assert(!shelfItem({resource:{...resource,id:'character-saved:00000000-0000-4000-8000-000000000000'},colorable:false}).previewUrl.includes('recipe='));
 const image=resourceElement('data:image/png;base64,AA==',resource,variant.width,variant.height,deck),first=applyOperations(deck,[resourceOperation(deck,deck.slides[0].id,image)]);
 assert.deepEqual(validateDeck(JSON.parse(JSON.stringify(first))).slides[0].elements[0].resource?.characterRecipe,recipe);assert.equal(deck.slides[0].elements.length,0);
 const changed={...image,src:'data:image/png;base64,AB==',resource:{...resource,characterRecipe:{...recipe,clothesColor:'#35664d'}}};
 const next=applyOperations(first,[resourceOperation(first,first.slides[0].id,changed,image.id)]);
 assert.equal(next.slides[0].elements[0].id,image.id);assert.equal(next.slides[0].elements[0].x,image.x);assert.equal(first.slides[0].elements[0].src,image.src);
 first.slides[0].elements[0].locked=true;assert.throws(()=>resourceOperation(first,first.slides[0].id,changed,image.id));
});
test('server stores immutable local variants and explicit pending requests, preserving original bytes',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'deck-character-test-'));process.env.DECK_STUDIO_DATA=directory;
 try{const {renderCharacter,saveCharacterVariant,savedCharacterImage,savedCharacterEmbedded,characterCatalog,saveCharacterRequest}=await import('../server/characters');
  const variant=manifest.variants[0],recipe=defaultCharacterRecipe(variant),original=await renderCharacter(recipe);assert.deepEqual(original.bytes,await readFile(`${root}/${variant.file}`));
  const custom=twoColorCharacterRecipe({...recipe,skinMode:'natural',clothesColor:'#35664d'}),saved=await saveCharacterVariant({name:'Pilot',recipe:custom,baseSha256:variant.sha256}),image=await savedCharacterImage(saved.id);
  assert.deepEqual(image.record.recipe,custom);assert.deepEqual(image.bytes,(await renderCharacter(custom)).bytes);assert.equal(image.record.originalSha256,variant.sha256);
  assert.equal(createHash('sha256').update(image.bytes).digest('hex'),saved.imageSha256);
  const embedded=await savedCharacterEmbedded(saved.id);assert.equal(embedded.resource.id,`character-saved:${saved.id}`);assert.deepEqual(Buffer.from(embedded.src.split(',')[1],'base64'),image.bytes);
  // A retired catalog reference cannot change or prevent importing a saved PNG.
  await writeFile(join(directory,'character-variants',`${saved.id}.json`),JSON.stringify({...saved,recipe:{...saved.recipe,variantId:'retired-version'}}));
  assert.deepEqual(Buffer.from((await savedCharacterEmbedded(saved.id)).src.split(',')[1],'base64'),image.bytes);
  await writeFile(join(directory,'character-variants','00000000-0000-4000-8000-000000000000.json'),'{broken');
  const catalog=await characterCatalog();assert(catalog.saved.some(v=>v.id===saved.id));assert.equal(catalog.warnings.length,1);
  await writeFile(join(directory,'character-variants',`${saved.id}.png`),Buffer.from('damaged'));
  await assert.rejects(savedCharacterImage(saved.id),/snapshot failed validation/);
  await assert.rejects(saveCharacterVariant({name:'Bad',recipe,baseSha256:'0'.repeat(64)}));await assert.rejects(savedCharacterImage('../../.env'));
  const request=await saveCharacterRequest({recipe,expression:'satisfied',outfit:'jacket',accessory:'earrings',details:'same identity'});assert.equal(request.status,'pending-generation');assert(request.prompt.includes(variant.sha256));assert(request.prompt.includes('same identity'));
  assert.equal(request.reference?.sourceSha256,variant.sha256);assert.equal(request.reference?.identityRevision,1);assert(request.prompt.includes('Identity master'));
  assert.deepEqual((await renderCharacter(custom)).bytes,(await renderCharacter(custom)).bytes);
  assert(generationPrompt(manifest,recipe,{expression:'satisfied',outfit:'shirt',accessory:'none',details:''}).includes('review identity'));
  const legacy=CharacterRecipeSchema.parse({...recipe,renderVersion:'2',hairColor:'#c3b7a7',clothesColor:'#35664d',accentColor:'#bd365b'});
  const oldSaved=await saveCharacterVariant({name:'Legacy',recipe:legacy,baseSha256:variant.sha256}),oldBytes=(await savedCharacterImage(oldSaved.id)).bytes;
  await renderCharacter(twoColorCharacterRecipe(legacy));assert.deepEqual((await savedCharacterImage(oldSaved.id)).bytes,oldBytes);assert.equal((await savedCharacterImage(oldSaved.id)).record.recipe.renderVersion,'2');
 }finally{await rm(directory,{recursive:true,force:true});}
});
