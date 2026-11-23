import {test} from 'node:test';
import {pptxColors} from './helpers/pptx-theme';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {COLLECTIONS,LAYOUTS,templateDeck,templateLibraryDeck,createLayout,embedTemplateArtwork,scaleTemplateSlide,templateLayouts} from '../src/core/templates';
import {TEMPLATE_MEDIA} from '../src/core/template-media';
import {createHash} from 'node:crypto';
import {validateDeck} from '../src/core/model';
import {findFont} from '../src/core/fonts';
import {applyDeckDesignSystem,contrastRatio} from '../src/core/deck-design-system';
import {tableAppearance} from '../src/core/table-appearance';
import {buildPptx} from '../src/core/pptx-export';
import JSZip from 'jszip';
import {loadResource} from '../server/resources';
import {prepareThemeArtwork,themedIllustrationColor} from '../src/core/theme-artwork';
import {PNG} from 'pngjs';
const themeLoader=async(id:string,color:string)=>{const data=await loadResource(id,color);return {src:`data:${data.type};base64,${data.bytes.toString('base64')}`,resource:data.resource};};

test('every collection has complete editable pages and licensed local typography',async()=>{
  for(const c of COLLECTIONS){
    const d=validateDeck(templateDeck(c.id));
    assert.equal(d.slides.length,c.story!.length);
    assert.ok(d.slides.every(s=>s.title===undefined));
    assert.ok(d.slides[0].elements.some(e=>e.type==='text'&&e.text.trim()));assert.ok(d.slides.at(-1)!.elements.some(e=>e.type==='text'&&e.text.trim()));
    assert.ok(contrastRatio(c.system.colors.ink,c.system.colors.background)>=4.5);
    assert.ok(contrastRatio(c.system.colors.muted,c.system.colors.background)>=4.5);
    for(const family of [c.display,c.body]){
      const font=findFont(family);assert.ok(font,`${family} must be bundled`);
      await access(`public${font.css}`);await access(`public${font.license}`);
    }
    for(const s of d.slides)for(const e of s.elements){
      assert.ok(e.x>=0&&e.y>=0&&e.x+e.w<=d.width&&e.y+e.h<=d.height,`${c.id}/${s.title}/${e.name}`);
      if(e.type==='text')assert.ok(e.design?.text);
    }
    const next=applyDeckDesignSystem(d,COLLECTIONS[1].system);
    assert.deepEqual(next.slides.map(s=>s.elements.map(e=>[e.id,e.text,e.x,e.y,e.w,e.h,e.src])),d.slides.map(s=>s.elements.map(e=>[e.id,e.text,e.x,e.y,e.w,e.h,e.src])));
  }
});
test('project-owned AI artwork embeds each source once with original bytes and provenance',async()=>{
  for(const c of COLLECTIONS){
    const d=templateDeck(c.id),before=JSON.stringify(d),reads:string[]=[];
    const images=d.slides.flatMap(s=>s.elements).filter(e=>e.type==='image');
    const portable=await embedTemplateArtwork(d,async src=>{reads.push(src);return new Uint8Array(await readFile(`public${src}`));},themeLoader);
    assert.equal(reads.length,new Set(images.map(e=>e.src)).size);assert.equal(JSON.stringify(d),before);validateDeck(portable);
    const embedded=portable.slides.flatMap(s=>s.elements).filter(e=>e.type==='image');
    for(let i=0;i<images.length;i++){
      const e=images[i],p=embedded[i],media=Object.values(TEMPLATE_MEDIA).find(m=>m.src===e.src);
      assert.ok(media,`${c.id}/${e.name} must be our local AI media`);
      assert.equal(p.src!.split(',')[0],e.src!.endsWith('.png')?'data:image/png;base64':'data:image/jpeg;base64');
      const themed=e.resource?.id.startsWith('blue-black:');
      assert.deepEqual(Buffer.from(p.src!.split(',')[1],'base64'),themed?(await loadResource(e.resource!.id,c.system.colors.accent)).bytes:await readFile(`public${e.src}`));
      assert.deepEqual(p.resource,themed?{...e.resource,color:c.system.colors.accent}:e.resource);
      if(media.resource){assert.match(media.resource.creator!,/Deckleaf.*AI-generated/);const original=media.resource.kind==='photo'?new URL(media.resource.sourceUrl).pathname:e.src;assert.equal(createHash('sha256').update(await readFile(`public${original}`)).digest('hex'),media.resource.originalSha256);}
    }
  }
  await assert.rejects(embedTemplateArtwork(templateDeck('portfolio'),async()=>{throw new Error('offline');}),/offline/);
});

test('theme-linked AI illustrations change pigment from their original while photos and alpha stay intact',async()=>{
  const d=await embedTemplateArtwork(templateDeck('portfolio'),async src=>new Uint8Array(await readFile(`public${src}`)),themeLoader);
  const before=JSON.stringify(d),system=COLLECTIONS[2].system,next=applyDeckDesignSystem(d,system);
  assert.ok(next.slides.flatMap(s=>s.elements).filter(e=>e.resource?.id.startsWith('blue-black:')).every(e=>themedIllustrationColor(e)===system.colors.accent));
  const calls:string[]=[];const prepared=await prepareThemeArtwork(next,async(id,color)=>{calls.push(id);return themeLoader(id,color);});
  assert.equal(calls.length,new Set(calls).size);assert.equal(JSON.stringify(d),before);
  const old=d.slides.flatMap(s=>s.elements),changed=prepared.slides.flatMap(s=>s.elements);
  for(const e of changed){const original=old.find(a=>a.id===e.id)!;if(e.resource?.kind==='photo')assert.equal(e.src,original.src);
    if(e.resource?.id.startsWith('blue-black:')){assert.equal(e.resource.color,system.colors.accent);assert.equal(e.resource.originalSha256,original.resource!.originalSha256);const a=PNG.sync.read(Buffer.from(original.src!.split(',')[1],'base64')),b=PNG.sync.read(Buffer.from(e.src!.split(',')[1],'base64'));assert.equal(a.width,b.width);assert.equal(a.height,b.height);for(let i=3;i<a.data.length;i+=4)assert.equal(a.data[i],b.data[i]);}
  }
  await assert.rejects(prepareThemeArtwork(next,async(id,color)=>{const result=await themeLoader(id,color);return {...result,resource:{...result.resource,originalSha256:'0'.repeat(64)}};}),/source has changed/);
});
test('insertable templates keep valid geometry on compact and portrait pages',()=>{
  for(const c of COLLECTIONS)for(const layout of LAYOUTS)for(const [width,height] of [[320,180],[720,1280]]){
    const d=templateDeck(c.id),s=createLayout(layout.id,1,c.id);d.width=width;d.height=height;d.slides=[scaleTemplateSlide(s,width,height)];
    validateDeck(d);assert.ok(d.slides[0].elements.every(e=>e.x+e.w<=width+.01&&e.y+e.h<=height+.01));
  }
});

test('layout picker follows each collection’s complete story and reader tasks',()=>{
  for(const c of COLLECTIONS){
    const layouts=templateLayouts(c.id),deck=templateLibraryDeck(c.id);
    assert.deepEqual(layouts.map(l=>l.id),c.layouts);
    assert.equal(layouts.length,deck.slides.length);
    assert.ok(deck.slides.every(s=>s.elements.some(e=>e.type==='text'&&e.text.trim())));
    assert.ok(layouts.every(l=>l.description.length>20));
  }
  assert.ok(templateLayouts('pitch').some(l=>l.name==='Business model'));
  assert.ok(templateLayouts('pitch').some(l=>l.name==='Team'));
  assert.ok(templateLayouts('report').some(l=>l.name==='Metric details'));
  assert.ok(!templateDeck('report').slides.flatMap(s=>s.elements).some(e=>e.text==='MY ROLE'||e.text==='Your contribution'));
});

test('Minimalist uses four distinct exclusive AI originals across its image pages',()=>{
  const d=templateDeck('minimal'),images=d.slides.flatMap(s=>s.elements).filter(e=>e.type==='image');
  assert.equal(new Set(images.map(e=>e.resource?.id)).size,4);
  assert.ok(images.every(e=>e.resource?.id.startsWith('template-artwork:minimal-')));
  assert.ok(d.slides[0].elements.some(e=>e.type==='image'&&e.resource?.id==='template-artwork:minimal-orbit'));
  const gallery=d.slides.find(s=>s.template?.prototype==='gallery')!.elements.filter(e=>e.type==='image');
  assert.equal(new Set(gallery.map(e=>e.src)).size,3);assert.ok(gallery.every(e=>!e.crop));
  for(const c of COLLECTIONS.filter(c=>c.id!=='minimal'))assert.ok(!templateDeck(c.id).slides.flatMap(s=>s.elements).some(e=>e.resource?.id.startsWith('template-artwork:minimal-')));
});

test('template charts and tables use their document palette in themes and PPTX',async()=>{
  const d=templateDeck('report'),dark=COLLECTIONS[3].system;
  const next=applyDeckDesignSystem(d,dark);
  const chart=next.slides.flatMap(s=>s.elements).find(e=>e.type==='chart')!;
  assert.equal(chart.fill,dark.colors.accent);assert.equal(chart.chart!.textColor,dark.colors.ink);
  const table=next.slides.flatMap(s=>s.elements).find(e=>e.type==='table')!;
  assert.deepEqual(tableAppearance(table,dark),{text:dark.colors.ink,line:dark.colors.line,background:dark.colors.background,header:dark.colors.surface});
  next.slides=next.slides.filter(s=>s.elements.some(e=>e.type==='table'));
  const zip=await JSZip.loadAsync(await buildPptx(next));
  const xml=await zip.file('ppt/slides/slide1.xml')!.async('string');
  const theme=await zip.file('ppt/theme/theme1.xml')!.async('string');
  const tableXml=xml.match(/<a:tbl>[\s\S]*?<\/a:tbl>/)![0];
  // Editable theme references must resolve to the same actual table palette.
  const colors=pptxColors(tableXml,theme);
  for(const color of [dark.colors.surface,dark.colors.ink,dark.colors.line])assert.ok(colors.has(color.slice(1)),`Missing table color ${color}`);
});
