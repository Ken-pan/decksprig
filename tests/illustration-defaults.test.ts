import {ICON_SETS} from '../src/core/resources';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Resvg} from '@resvg/resvg-js';
import {PNG} from 'pngjs';
import {XMLValidator} from 'fast-xml-parser';
import {transparentIllustrationSvg,themedIllustrationSvg,standaloneIllustrationSvg} from '../public/resources/illustration-engine.js';
import {illustrationLibrary} from '../server/resource-catalog';
import {loadResource,searchResources} from '../server/resources';
import {newDeck,blankSlide,element} from '../src/core/model';
import {resourceElement} from '../src/core/resources';
import {defaultIllustrationColor,isThemedIllustration} from '../src/core/illustration-defaults';
import {applyDeckDesignSystem,deckDesignSystem,DESIGN_PRESETS} from '../src/core/deck-design-system';
import {prepareThemeArtwork,themedIllustrationColor} from '../src/core/theme-artwork';
import {illustrationAccentOperations} from '../src/core/illustration-accent';
import {applyOperations} from '../src/core/operations';

const embedded=async(id:string,color:string,recipe?:{strength:number;scale:number;rotation:number})=>{const data=await loadResource(id,color,false,recipe);return {src:`data:${data.type};base64,${data.bytes.toString('base64')}`,resource:data.resource};};

test('all 130 themed library derivatives have actual transparency, visible foreground and intact original files',async()=>{
  const records=await illustrationLibrary();assert.equal(records.length,130);
  for(const record of records){
    const original=await readFile('public/resources/illlustrations/'+record.file);const sourceHash=createHash('sha256').update(original).digest('hex');
    const data=await loadResource('illlustrations:'+record.id,'#35664d');assert.equal(data.type,'image/svg+xml');assert.equal(data.resource.color,'#35664d');assert.equal(data.resource.sourceUrl,record.sourceUrl);
    const svg=data.bytes.toString();assert.equal(XMLValidator.validate(svg),true,record.id);assert(!/<image\b[^>]+(?:href|xlink:href)=["'](?!data:|#)/i.test(svg));
    const png=PNG.sync.read(new Resvg(data.bytes,{fitTo:{mode:'width',value:160}}).render().asPng());let clear=0,ink=0;
    for(let i=3;i<png.data.length;i+=4){if(!png.data[i])clear++;else ink++;}
    assert(clear>png.width*png.height*.01,record.id+' has no transparent area');assert(ink>100,record.id+' lost its foreground');
    assert.equal(createHash('sha256').update(await readFile('public/resources/illlustrations/'+record.file)).digest('hex'),sourceHash);
  }
});

test('transparent theme processing keeps masks, interior whites, black outlines, alpha and gradient shading',()=>{
  const source='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><mask id="m"><rect width="100" height="100" fill="#fff"/></mask><linearGradient id="g"><stop stop-color="#f05b83"/><stop offset="1" stop-color="#ac365b"/></linearGradient></defs><rect width="100" height="100" fill="#aaa"/><g mask="url(#m)"><rect x="10" y="10" width="30" height="30" fill="#fff" stroke="#000"/><path d="M20 30h40v40H20z" fill="#f05b83" opacity="0.4"/><path d="M20 30h20v20H20z" fill="#ac365b"/></g></svg>';
  const transparent=transparentIllustrationSvg(source);assert.match(transparent,/<mask id="m"><rect width="100" height="100" fill="#fff"\/>/);assert(!transparent.includes('fill="#aaa"'));assert.match(transparent,/width="30" height="30" fill="#fff" stroke="#000"/);
  const result=themedIllustrationSvg(source,'#35664d');assert.match(result,/#35664d/);assert.match(result,/opacity="0.4"/);assert.match(result,/fill="#fff" stroke="#000"/);assert.equal(XMLValidator.validate(result),true);
  assert.equal((result.match(/<path/g)||[]).length,2);assert.notEqual(result.match(/stop offset="1" stop-color="([^"]+)"/)?.[1],'#35664d');
});

test('ticket vector derivative preserves its foreground paths and removes only unavailable external raster effects',async()=>{
  const original=await readFile('public/resources/illlustrations/day34-ticket.svg','utf8'),standalone=standaloneIllustrationSvg(original,'illlustrations:day34-ticket');
  assert.equal((standalone.match(/<path\b/g)||[]).length,(original.match(/<path\b/g)||[]).length);assert(!standalone.includes('<image'));assert.equal(XMLValidator.validate(standalone),true);
  assert.equal(standaloneIllustrationSvg(original,'another-id'),original);
});

test('new Art defaults use document illustration color, with theme links and independent custom variants',async()=>{
  const deck=newDeck('Theme',[blankSlide()]);deck.designSystem=DESIGN_PRESETS[2];const accent=defaultIllustrationColor(deck);assert.equal(accent,deckDesignSystem(deck).colors.accent);
  for(const id of ['blue-black:scene-01-guidance','doodles:reading','illlustrations:118-macbook','deck-graphics:accent-curved-arrow']){
    const data=await embedded(id,accent),image=resourceElement(data.src,data.resource,400,400,deck);assert(isThemedIllustration(image.resource));assert.equal(image.fill,accent);assert.equal(image.design?.fill,'accent');
    const custom=await embedded(id,'#bd365b'),independent=resourceElement(custom.src,custom.resource,400,400,deck);assert.equal(independent.design,undefined);assert.equal(independent.resource?.color,'#bd365b');
  }
  assert.equal(defaultIllustrationColor({...deck,illustrationAccent:'#147a83'}),'#147a83');
  assert(!isThemedIllustration({id:'deck-graphics:fine-dots'}));assert(!isThemedIllustration({id:'iconify:lucide:star'}));
});

test('document theme changes render every linked Art source and preserve graphic recipes and custom colors',async()=>{
  const deck=newDeck('Theme',[blankSlide()]),accent=defaultIllustrationColor(deck),recipe={strength:.5,scale:1,rotation:0};
  for(const id of ['blue-black:scene-01-guidance','doodles:reading','illlustrations:118-macbook','deck-graphics:accent-curved-arrow']){const data=await embedded(id,accent,id.startsWith('deck-graphics:')?recipe:undefined);deck.slides[0].elements.push(resourceElement(data.src,data.resource,400,400,deck));}
  const custom=await embedded('illlustrations:118-macbook','#bd365b');deck.slides[0].elements.push(resourceElement(custom.src,custom.resource,400,400,deck));
  const source=JSON.stringify(deck),styled=applyDeckDesignSystem(deck,DESIGN_PRESETS[1]);assert(styled.slides[0].elements.slice(0,4).every(e=>themedIllustrationColor(e)===DESIGN_PRESETS[1].colors.accent));assert.equal(themedIllustrationColor(styled.slides[0].elements[4]),undefined);
  const prepared=await prepareThemeArtwork(styled,embedded);assert.equal(JSON.stringify(deck),source);assert(prepared.slides[0].elements.slice(0,4).every(e=>e.resource?.color===DESIGN_PRESETS[1].colors.accent));assert.deepEqual(prepared.slides[0].elements[3].resource?.graphicRecipe,recipe);assert.equal(prepared.slides[0].elements[4].src,custom.src);
});

test('browser catalog compatibility and resource rendering match the local transparent theme pipeline',async()=>{
  const records=await illustrationLibrary(),server=await searchResources(new URLSearchParams({kind:'illustration',collection:'illlustrations'}));
  const items=server.items.slice(0,3).map(item=>({...item,colorable:false,file:'/resources/illlustrations/'+records.find(r=>'illlustrations:'+r.id===item.id)!.file}));
  const ticket=(await searchResources(new URLSearchParams({kind:'illustration',collection:'illlustrations',q:'ticket'}))).items[0];items.push({...ticket,colorable:false,file:'/resources/illlustrations/day34-ticket.png'});
  const oldFetch=globalThis.fetch,oldReader=globalThis.FileReader;
  class Reader{result='';error=null;onload?:()=>void;onerror?:()=>void;readAsDataURL(blob:Blob){void blob.arrayBuffer().then(data=>{this.result=`data:${blob.type};base64,${Buffer.from(data).toString('base64')}`;this.onload?.();});}}
  globalThis.FileReader=Reader as unknown as typeof FileReader;
  globalThis.fetch=async input=>{const path=String(input);if(path==='/resources/catalog.json')return Response.json({items,catalog:{iconCount:0,illustrationCount:items.length,collections:[]},icons:Object.fromEntries(ICON_SETS.map(({id})=>[id,{author:'QA fixture',license:'MIT',licenseUrl:'https://example.invalid/license',notice:'Synthetic illustration fixture notice'}]))});assert(path.startsWith('/resources/illlustrations/'));return new Response(await readFile('public'+path),{headers:{'Content-Type':path.endsWith('.svg')?'image/svg+xml':'image/png'}});};
  try{const {browserResourceJson}=await import('../src/core/web/resources');const page=await browserResourceJson('/api/resources/search',new URLSearchParams({kind:'illustration',view:'illustrations'}),'GET',{});assert(page.items.every((i:{colorable?:boolean})=>i.colorable));
    for(const item of items){const local=await embedded(item.id,'#7652b5'),web=await browserResourceJson('/api/resources/import',new URLSearchParams(),'POST',{id:item.id,color:'#7652b5'});assert.equal(web.resource.color,local.resource.color);assert.equal(web.src,local.src);}
  }finally{globalThis.fetch=oldFetch;globalThis.FileReader=oldReader;}
});

test('batch illustration colors include all Art families and preserve separate accent variants',async()=>{
  const deck=newDeck('Batch',[blankSlide()]);
  for(const id of ['blue-black:scene-01-guidance','doodles:reading','illlustrations:118-macbook','deck-graphics:accent-curved-arrow','deck-graphics:accent-curved-arrow']){
    const recipe=id.startsWith('deck-graphics:')?{strength:deck.slides[0].elements.length===3?.5:1,scale:1,rotation:0}:undefined;
    deck.slides[0].elements.push(element('image',await embedded(id,'#7652b5',recipe)));
  }
  const before=JSON.stringify(deck);let calls=0;
  const ops=await illustrationAccentOperations(deck,deck.slides[0].id,[],'deck','#35664d',async(id,color,recipe)=>{calls++;return embedded(id,color,recipe);});
  const next=applyOperations(deck,ops,deck.revision);assert.equal(calls,5);assert.equal(next.revision,1);assert.equal(next.illustrationAccent,'#35664d');assert(next.slides[0].elements.every(e=>e.resource?.color==='#35664d'));assert.equal(JSON.stringify(deck),before);
  assert.equal(next.slides[0].elements[3].resource?.graphicRecipe?.strength,.5);assert.equal(next.slides[0].elements[4].resource?.graphicRecipe?.strength,1);
});
