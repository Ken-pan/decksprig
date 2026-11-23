import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FONT_LIBRARY, searchFonts, fontOperations, fontWeights, textStylePatch, usedLibraryFonts, embeddedLibraryFonts } from '../src/core/fonts';
import { blankSlide, element, newDeck } from '../src/core/model';
import { applyOperations } from '../src/core/operations';

test('every bundled font has a complete local face definition, font files and OFL notice', async () => {
  assert.equal(FONT_LIBRARY.length, 26);
  assert.equal(new Set(FONT_LIBRARY.map(f => f.family)).size, 26);
  for (const font of FONT_LIBRARY) {
    const css = await readFile(resolve('public', `.${font.css}`), 'utf8');
    const license = await readFile(resolve('public', `.${font.license}`), 'utf8');
    assert.match(license, /SIL OPEN FONT LICENSE/i, font.family);
    assert.match(license, /copyright/i, font.family);
    assert(css.includes(font.family));
    const urls = [...css.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)].map(m => m[1]);
    assert(urls.length > 0, font.family);
    for (const url of urls) { assert(url.startsWith('/fonts/')); await access(resolve('public', `.${url}`)); }
    assert(font.weights.includes(400));
  }
});
test('font search combines name, Chinese aliases, category, language and favorites', () => {
  assert.deepEqual(searchFonts('思源', 'sans', 'chinese').map(f => f.family), ['Noto Sans SC']);
  assert.deepEqual(searchFonts('思源').slice(0, 2).map(f => f.family), ['Noto Sans SC', 'Noto Serif SC']);
  assert.equal(searchFonts('思源黑体')[0].family, 'Noto Sans SC');
  assert.deepEqual(searchFonts('jetbrains').map(f => f.family), ['JetBrains Mono']);
  assert(searchFonts('衬线').length > 0);
  assert(searchFonts('衬线').every(f => f.category === 'serif'));
  assert(searchFonts('sans').every(f => f.category === 'sans'));
  assert.equal(searchFonts('Playfair Display')[0].family, 'Playfair Display');
  assert(searchFonts('等宽').every(f => f.category === 'mono'));
  assert.equal(searchFonts('', 'all', 'chinese').length, 3);
  assert.deepEqual(searchFonts('', 'all', 'all', ['Lora']).map(f => f.family), ['Lora']);
  assert.equal(searchFonts('missing font').length, 0);
});
test('batch family changes include shape labels and preserve contents, provenance and noneditable objects', () => {
  const slide = blankSlide();
  const a = element('text', {text: 'Alpha', fontWeight: 300, runs: [{text: 'Al', color: '#ff0000', bold: true, fontFamily: 'Arial'}, {text: 'pha', italic: true, fontSize: 22}]});
  const b = element('text', {text: 'Different content', fontWeight: 800});
  const locked = element('text', {text: 'Locked', locked: true});
  const shape = element('rect', {text: 'Shape label'}), image = element('image', {src: 'data:image/png;base64,aA=='}), lockedShape = element('rect', {text: 'Locked label', locked: true});
  slide.elements = [a, b, locked, shape, image, lockedShape];
  slide.source = {provider: 'Fixture', fidelity: 'converted', warnings: ['Original reference']};
  const deck = newDeck('Font changes', [slide]), before = JSON.stringify(deck);
  const ops = fontOperations(deck, slide.id, slide.elements.map(e => e.id), 'Lora');
  assert.deepEqual(ops.map(op => 'elementId' in op ? op.elementId : undefined), [a.id, b.id, shape.id]);
  const next = applyOperations(deck, ops);
  assert.equal(JSON.stringify(deck), before);
  const [na, nb, nl, ns, ni, nls] = next.slides[0].elements;
  assert.equal(na.text, 'Alpha'); assert.equal(nb.text, 'Different content');
  assert.equal(na.fontWeight, 400); assert.equal(nb.fontWeight, 700);
  assert.deepEqual(na.runs, a.runs!.map(r => ({...r, fontFamily: 'Lora'})));
  assert.deepEqual(ns, {...shape, fontFamily: 'Lora', fontWeight: 400});
  assert.deepEqual(nl, locked); assert.deepEqual(ni, image); assert.deepEqual(nls, lockedShape);
  assert.deepEqual(next.slides[0].source, deck.slides[0].source);
  assert.equal(next.revision, deck.revision + 1);
});
test('typography edits clear only the relevant run override', () => {
  const e = element('text', {text: 'Styled', runs: [{text: 'Styled', fontSize: 10, color: '#123456', fontFamily: 'Lora', italic: true, bold: true, fontWeight: 700}]});
  assert.deepEqual(textStylePatch(e, {fontSize: 36}).runs, [{...e.runs![0], fontSize: undefined}]);
  assert.deepEqual(textStylePatch(e, {fontWeight: 400}).runs, [{...e.runs![0], bold: undefined, fontWeight: undefined}]);
});
test('batch text styling preserves each text and paragraph while replacing only requested overrides', () => {
  const a=element('text',{id:'first',text:'First',runs:[{text:'First',color:'#000000',underline:true,bold:true}]}),b=element('text',{id:'second',text:'Second\nBody',paragraphs:[{align:'left',spaceBefore:12,spaceAfter:8,indent:4,firstLineIndent:0,runs:[{text:'Second',color:'#123456',italic:true}]},{align:'right',spaceBefore:2,spaceAfter:4,indent:0,firstLineIndent:0,runs:[{text:'Body',color:'#654321'}]}]});
  const slide=blankSlide();slide.elements=[a,b];const deck=newDeck('Style content preservation',[slide]);
  const next=applyOperations(deck,slide.elements.map(e=>({op:'update_element',slideId:slide.id,elementId:e.id,patch:textStylePatch(e,{fill:'#aa2244',underline:false,align:'center'})})));
  assert.deepEqual(next.slides[0].elements.map(e=>e.text),['First','Second\nBody']);
  assert.equal(next.slides[0].elements[0].runs![0].text,'First');assert.equal(next.slides[0].elements[0].runs![0].bold,true);assert.equal(next.slides[0].elements[0].runs![0].color,undefined);
  assert.deepEqual(next.slides[0].elements[1].paragraphs!.map(p=>p.runs.map(r=>r.text)),[['Second'],['Body']]);
  assert.ok(next.slides[0].elements[1].paragraphs!.every(p=>p.align==='center'&&p.runs.every(r=>r.color===undefined)));
  assert.equal(next.slides[0].elements[1].paragraphs![0].spaceBefore,12);assert.equal(next.slides[0].elements[1].paragraphs![0].runs[0].italic,true);
});
test('font weights reflect the family and embedded custom font range', () => {
  assert.deepEqual(fontWeights('Bebas Neue'), [400]);
  assert.deepEqual(fontWeights('Bodoni Moda'), [400,500,600,700,800,900]);
  assert.deepEqual(fontWeights('Inter', [{family: 'Inter', name: 'custom.woff2', weight: '300 500', style: 'normal', data: 'data:font/woff2;base64,AA=='}]), [300,400,500]);
});
test('HTML font embedding covers rich-run families and preserves the OFL notices without local or CDN dependencies', async () => {
  const slide = blankSlide(); slide.elements = [element('text', {fontFamily: 'Lora', runs: [{text: 'Body '}, {text: 'Rich', fontFamily: 'JetBrains Mono'}]})];
  const deck = newDeck('Offline export', [slide]);
  assert.deepEqual(usedLibraryFonts(deck).map(f => f.family), ['Lora', 'JetBrains Mono']);
  const previous = globalThis.fetch;
  globalThis.fetch = async input => new Response(await readFile(resolve('public', `.${String(input)}`)));
  try {
    const css = (await embeddedLibraryFonts(deck)).join('\n');
    assert.match(css, /data:font\/woff2;base64,/);
    assert.match(css, /SIL OPEN FONT LICENSE/);
    assert(!/url\(['"]?\//.test(css));
    assert(!/font-family: 'Noto Sans SC'/.test(css));
  } finally { globalThis.fetch = previous; }
  deck.fonts = [{family: 'Lora', name: 'custom.woff2', weight: '400', style: 'normal', data: 'data:font/woff2;base64,AA=='}];
  assert.deepEqual(usedLibraryFonts(deck).map(f => f.family), ['JetBrains Mono']);
});

test('compact rendering fallbacks match every bundled font category', async()=>{
  const {fontStack}=await import('../src/core/font-stack');
  for(const font of FONT_LIBRARY)assert.equal(fontStack(font.family),fontStack(font.family,font.category));
  assert.equal(fontStack('Unknown'), '"Unknown", "Noto Sans SC", "PingFang SC", sans-serif');
  assert.equal(fontStack('Online serif','serif'), '"Online serif", "Noto Serif SC", "Songti SC", serif');
});
