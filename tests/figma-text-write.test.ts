import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tableHost} from './helpers/figma-table-host';
import {applyDeckToFigma,setNativeText} from '../plugins/figma-export/native';
import {serializeForDeck} from '../plugins/figma-export/capture';
import {importFigma} from '../src/importers/figma';
import {element} from '../src/core/model';
import {sameFigmaTextAppearance,projectFigmaChanges,mergeFigmaDeck} from '../src/core/figma-sync';
import {textRangeStylePatch} from '../src/core/text-range-format';

const imported=(slide:any)=>importFigma({url:'https://www.figma.com/slides/file',fileKey:'file',slides:[serializeForDeck(slide)]});
function textFixture(){
  const f=tableHost(),text=f.node('TEXT');text.characters='One\nTwo';text.fontSize=20;text.textDecoration='NONE';text.textAutoResize='NONE';text.textAlignVertical='TOP';text.fills=[{type:'SOLID',color:{r:0,g:0,b:0},opacity:1}];f.slide.appendChild(text);
  let rangeWrites=0;
  for(const method of ['setRangeFontName','setRangeTextCase','setRangeFontSize','setRangeFills','setRangeTextDecoration','setRangeLetterSpacing','setRangeParagraphSpacing','setRangeParagraphIndent','setRangeLineHeight'])text[method]=()=>{rangeWrites++;};
  return {...f,text,get rangeWrites(){return rangeWrites;}};
}

test('paragraph-only alignment changes affect appearance while unused object alignment does not',()=>{
  const f=textFixture(),before=imported(f.slide).slides[0].elements[0],after={...before,...textRangeStylePatch(before,{align:'right'},{start:4,end:7})};
  assert.equal(sameFigmaTextAppearance(before,after),false);
  const same={...before,align:'right' as const};assert.equal(sameFigmaTextAppearance(before,same),true);
  assert.equal(sameFigmaTextAppearance(element('text',{text:'One\nTwo',align:'left'}),element('text',{text:'One\nTwo',align:'right'})),false);
});

test('one effective paragraph alignment writes the same native TEXT and roundtrips with its inverse',async()=>{
  for(const alignment of ['right','justify'] as const){
    const f=textFixture(),before=imported(f.slide),after=structuredClone(before),e=after.slides[0].elements[0],sourceId=f.text.id;
    e.paragraphs=e.paragraphs!.map(p=>({...p,align:alignment}));assert.equal(e.align,'left');
    await applyDeckToFigma(f.host,after,before);assert.equal(f.text.textAlignHorizontal,alignment==='justify'?'JUSTIFIED':'RIGHT');assert.equal(f.text.id,sourceId);assert.equal(f.text.characters,'One\nTwo');assert(f.rangeWrites>0);
    const readback=imported(f.slide);assert.deepEqual(readback.slides[0].elements[0].paragraphs!.map(p=>p.align),[alignment,alignment]);assert.equal(sameFigmaTextAppearance(e,readback.slides[0].elements[0]),true);
    await applyDeckToFigma(f.host,before,after);assert.equal(f.text.textAlignHorizontal,'LEFT');assert.equal(f.text.id,sourceId);assert.deepEqual(imported(f.slide).slides[0].elements[0].paragraphs!.map(p=>p.align),['left','left']);
  }
});

test('mixed paragraph alignment rejects before fonts, title, identity, text or undo writes',async()=>{
  const f=textFixture(),before=imported(f.slide),after=structuredClone(before),e=after.slides[0].elements[0],snapshot=JSON.stringify(serializeForDeck(f.slide)),title=f.host.root.name;let writes=0;
  after.title='Would otherwise rename native';Object.assign(e,textRangeStylePatch(e,{align:'right'},{start:4,end:7}));
  f.host.listAvailableFontsAsync=async()=>{writes++;throw Error('Fonts were reached');};f.host.commitUndo=()=>writes++;f.slide.setPluginData=()=>writes++;f.text.setPluginData=()=>writes++;
  await assert.rejects(()=>applyDeckToFigma(f.host,after,before),/different paragraph alignments.*No content was changed/);assert.equal(writes,0);assert.equal(f.host.root.name,title);assert.equal(JSON.stringify(serializeForDeck(f.slide)),snapshot);assert.equal(f.rangeWrites,0);
  const target=new Proxy({},{set(){throw Error('Native setter reached');}});assert.throws(()=>setNativeText(target,e,new Map()),/different paragraph alignments/);
});

test('incoming native alignment projects correctly and concurrent rich paragraph edits require a conflict choice',()=>{
  const f=textFixture(),before=imported(f.slide),local=structuredClone(before);local.slides[0].elements[0].paragraphs![1].runs[0].color='#3355aa80';
  f.text.textAlignHorizontal='RIGHT';const remote=imported(f.slide),projected=projectFigmaChanges(before,before,remote),merged=mergeFigmaDeck(before,local,projected);
  assert.deepEqual(projected.slides[0].elements[0].paragraphs!.map(p=>p.align),['right','right']);assert.equal(merged.deck,undefined);assert(merged.conflicts.some(conflict=>conflict.path.endsWith('.paragraphs')));assert.equal(local.slides[0].elements[0].paragraphs![1].runs[0].color,'#3355aa80');assert.deepEqual(before.slides[0].elements[0].paragraphs!.map(p=>p.align),['left','left']);
});
