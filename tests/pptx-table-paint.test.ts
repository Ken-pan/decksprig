import {test} from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {XMLValidator} from 'fast-xml-parser';
import {nativeTablePaintSource} from './helpers/pptx-table-paint';
import {importPptx} from '../src/importers/pptx';
import {buildPptx} from '../src/core/pptx-export';
import {validateDeck,element,type Deck} from '../src/core/model';
import {compositeColor,contrastRatio} from '../src/core/color-contrast';
import {tablePresentation,tableCellStyle,tableCellBox} from '../src/core/table-rendering';
import {applyImmutableOperations} from '../src/core/operations';
import {clipboardContent,clipboardFormats} from '../src/core/clipboard';
import {readClipboardContent} from '../src/core/clipboard-codec';

function verify(deck:Deck){
  validateDeck(deck);const table=deck.slides[0].elements.find(e=>e.type==='table')!,p=tablePresentation(table);
  assert.deepEqual([[0,0],[0,1],[1,0],[1,1]].map(([r,c])=>tableCellStyle(p,r,c).background.toLowerCase()),['#4f63e780','#bf358440','transparent','#4f63e780']);
  assert.equal(p.line.toLowerCase(),'#4f63e780');
  assert.equal(tableCellBox(p,1,1).edges.top.color.toLowerCase(),'#bf358440');
  assert.equal(tableCellBox(p,1,1).edges.top.style,'dashed');
  assert(tableCellBox(p,1,1).edges.top.width>0);
  assert(!deck.slides[0].source?.warnings.some(w=>w.includes('transparent')&&w.includes('reference')));
  return table;
}

test('metadata-free native cell fills and directional borders retain theme colors and ordered alpha',async()=>{
  const bytes=await nativeTablePaintSource(),z=await JSZip.loadAsync(bytes);
  assert(!Object.keys(z.files).some(p=>p.includes('deck-studio')||p.includes('decksprig')));
  verify(await importPptx(bytes,'Table paint.pptx'));
});

test('native table common/local paint exports valid RGB plus alpha and reimports without changing source data',async()=>{
  const deck=await importPptx(await nativeTablePaintSource(),'Table paint.pptx'),before=JSON.stringify(deck),bytes=await buildPptx(deck),z=await JSZip.loadAsync(bytes);
  for(const f of Object.values(z.files).filter(f=>/\.(xml|rels)$/.test(f.name))){const xml=await f.async('string');assert.equal(XMLValidator.validate(xml),true,f.name);for(const m of xml.matchAll(/<a:srgbClr val="([^"]+)"/g))assert.match(m[1],/^[\da-f]{6}$/i);}
  const xml=await z.file('ppt/slides/slide1.xml')!.async('string');
  assert.match(xml,/<a:lnT[^>]*>[\s\S]*?<a:srgbClr val="bf3584"><a:alpha val="25098"\/>/i);
  verify(await importPptx(bytes,'Roundtrip table paint.pptx'));assert.equal(JSON.stringify(deck),before);
  const short=structuredClone(deck),t=short.slides[0].elements.find(e=>e.type==='table')!;t.stroke='#4f68';t.tableStyle={...t.tableStyle,lineColor:undefined,cellStyles:[]};const compact=await JSZip.loadAsync(await buildPptx(short)),compactXml=await compact.file('ppt/slides/slide1.xml')!.async('string');assert.match(compactXml,/<a:srgbClr val="44ff66"><a:alpha val="53333"\/>/i);
});

test('table paint updates share manual/AI validation and structured clipboard without losing alpha',async()=>{
  const deck=await importPptx(await nativeTablePaintSource(),'Table paint.pptx'),table=verify(deck),slide=deck.slides[0],before=JSON.stringify(deck);
  const style={...table.tableStyle,headerFill:'#4f63e740',bodyFill:'#bf358480',stripeFill:'#73856ecc',lineColor:'#4f63e780'};
  for(const actor of ['manual','ai']as const){const next=applyImmutableOperations(deck,[{op:'update_element',slideId:slide.id,elementId:table.id,patch:{tableStyle:style}}],deck.revision,actor);validateDeck(next);assert.equal(next.revision,deck.revision+1);const e=next.slides[0].elements.find(e=>e.id===table.id)!,formats=clipboardFormats(clipboardContent(next,next.slides[0],{members:[e],groups:[],layouts:[]}));assert.deepEqual(readClipboardContent(formats.json)!.members[0].tableStyle,e.tableStyle);}
  assert.throws(()=>applyImmutableOperations(deck,[{op:'update_element',slideId:slide.id,elementId:table.id,patch:{tableStyle:{...style,bodyFill:'#invalid'}}}],deck.revision,'ai'));
  assert.equal(JSON.stringify(deck),before);
});

test('derived table paints retain alpha and automatic header ink uses the composited fill',()=>{
  const e=element('table',{cells:[['Header'],['Body'],['Stripe']],fill:'#172b26',tableStyle:{headerRow:true,banded:true,bodyFill:'#4f63e780',headerFill:'#bf358480'}}),p=tablePresentation(e);
  assert.equal(p.headerText,'#172b26');assert(contrastRatio(p.headerText,compositeColor(p.header,'#ffffff'))>=4.5);
  assert.equal(p.stripe.slice(-2),'80');
  const automatic=tablePresentation({...e,tableStyle:{...e.tableStyle,headerFill:undefined}});assert.equal(automatic.header.slice(-2),'80');
  assert.equal(tablePresentation({...e,tableStyle:{...e.tableStyle,headerText:'#ffffff40'}}).headerText,'#ffffff40');
});
