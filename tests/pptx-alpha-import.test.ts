import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import {importPptx} from '../src/importers/pptx';
import {pptxColor,pptxTextProperties} from '../src/importers/pptx-color';
import {buildPptx} from '../src/core/pptx-export';
import {validateDeck,element,blankSlide,newDeck} from '../src/core/model';
import {tablePresentation,tableCellStyle,tableCellRuns} from '../src/core/table-rendering';
import {applyImmutableOperations} from '../src/core/operations';
import {tableCellTextElement,tableCellTextPatch,cellTextClipboard,readCellTextClipboard,pasteCellText} from '../src/core/table-cell-text';
import {textRangeStylePatch} from '../src/core/text-range-format';

const props=(rgb:string,ops:string)=>`<a:srgbClr val="${rgb}">${ops}</a:srgbClr>`;
async function nativeSource(){
  const p=new PptxGenJS();p.layout='LAYOUT_WIDE';const s=p.addSlide();
  for(let i=1;i<=6;i++)s.addShape(p.ShapeType.rect,{x:.3+i,y:.5,w:.7,h:.7,fill:{color:`A1100${i}`},line:{color:'BF3584',transparency:50},objectName:`Paint ${i}`});
  s.addText('Inherited hidden / visible',{x:.5,y:2,w:8,h:1,fontFace:'Arial',fontSize:30,color:'B11001',objectName:'Native text'});
  s.addTable([[{text:'Alpha',options:{color:'C11001'}},{text:'Opaque',options:{color:'C11002'}}],[{text:'Hidden',options:{color:'C11003'}},{text:[{text:'Ri',options:{color:'C11004'}},{text:'ch',options:{color:'C11005'}}]}]],{x:.5,y:3,w:10,colW:[5,5],rowH:[1,1],fontFace:'Arial',fontSize:28,color:'C11001',fill:{color:'FFFFFF'},border:{type:'solid',pt:1,color:'D11001'},autoPage:false});
  const z=await JSZip.loadAsync(await p.write({outputType:'uint8array'}) as Uint8Array),file=z.file('ppt/slides/slide1.xml')!;
  let xml=await file.async('string');
  const replacements:Record<string,string>={
    A11001:props('4F63E7','<a:alpha val="50000"/>'),
    A11002:props('4F63E7','<a:alphaOff val="-50000"/><a:alphaMod val="200000"/>'),
    A11003:props('4F63E7','<a:alphaMod val="200000"/><a:alphaOff val="-50000"/>'),
    A11004:props('4F63E7','<a:alpha val="60000"/><a:alphaMod val="50000"/><a:alphaOff val="20000"/><a:alphaMod val="50000"/>'),
    A11005:'<a:sysClr val="windowText" lastClr="BF3584"><a:alphaMod val="25000"/></a:sysClr>',
    A11006:'<a:schemeClr val="accent1"><a:alphaMod val="50000"/></a:schemeClr>',
    B11001:props('4F63E7','<a:alpha val="50000"/>'),
    C11001:props('4F63E7','<a:alpha val="50000"/>'),C11002:props('BF3584','<a:alpha val="100000"/>'),
    C11003:props('BF3584','<a:alpha val="0"/>'),C11004:props('4F63E7','<a:alpha val="25000"/>'),C11005:props('BF3584','<a:alpha val="100000"/>'),
    D11001:props('BF3584','<a:alpha val="0"/>'),
  };
  for(const [marker,paint] of Object.entries(replacements))xml=xml.replaceAll(new RegExp(`<a:srgbClr val="${marker}"(?:\\s*/>|>[\\s\\S]*?</a:srgbClr>)`,'g'),paint);
  xml=xml.replace('<a:t>Inherited hidden / visible</a:t>','<a:t>Visible</a:t>');
  // Explicit run paint must replace an inherited noFill, rather than coexisting with it.
  const start=xml.indexOf('<a:t>Visible</a:t>'),paragraph=xml.lastIndexOf('<a:p>',start);
  xml=xml.slice(0,paragraph)+xml.slice(paragraph).replace('<a:p>','<a:p><a:pPr><a:defRPr><a:noFill/></a:defRPr></a:pPr>');
  z.file(file.name,xml);
  for(const f of Object.values(z.files).filter(f=>/^ppt\/theme\/theme\d+\.xml$/.test(f.name))){
    z.file(f.name,(await f.async('string')).replace(/<a:accent1>[\s\S]*?<\/a:accent1>/,`<a:accent1>${props('4F63E7','<a:alpha val="80000"/>')}</a:accent1>`));
  }
  assert(!Object.keys(z.files).some(name=>name.includes('decksprig')||name.includes('deck-studio')));
  return z.generateAsync({type:'uint8array'});
}

test('native producer colors preserve ordered, repeated and theme/system alpha transforms without metadata',async()=>{
  const deck=await importPptx(await nativeSource(),'Native alpha.pptx');validateDeck(deck);
  const paints=deck.slides[0].elements.filter(e=>e.name.startsWith('Paint '));
  assert.deepEqual(paints.map(e=>e.fill),['#4F63E780','#4F63E7','#4F63E780','#4F63E740','#BF358440','#4F63E766']);
  assert(paints.every(e=>e.stroke==='#BF358480'));
  const text=deck.slides[0].elements.find(e=>e.text==='Visible')!;assert.equal(text.fill,'#4F63E780');assert.equal(text.paragraphs![0].runs[0].color,'#4F63E780');
});

test('native table default, local and mixed-run foreground alpha survives validated export/reimport',async()=>{
  const deck=await importPptx(await nativeSource(),'Native alpha.pptx'),table=deck.slides[0].elements.find(e=>e.type==='table')!,before=JSON.stringify(deck);
  const verify=(e:typeof table)=>{const p=tablePresentation(e);assert.equal(tableCellStyle(p,0,0).color.toLowerCase(),'#4f63e780');assert.equal(tableCellStyle(p,0,1).color.toLowerCase(),'#bf3584');assert.equal(tableCellStyle(p,1,0).color.toLowerCase(),'#bf358400');const runs=tableCellRuns(p,1,1,'Rich');assert.equal((runs[0].color??tableCellStyle(p,1,1).color).toLowerCase(),'#4f63e740');assert.equal((runs[1].color??tableCellStyle(p,1,1).color).toLowerCase(),'#bf3584');assert.equal(p.borders,'none');};
  verify(table);const back=await importPptx(await buildPptx(deck),'Exported alpha.pptx');validateDeck(back);verify(back.slides[0].elements.find(e=>e.type==='table')!);assert.equal(JSON.stringify(deck),before);
});

test('partial cell backgrounds retain alpha without an unsupported-paint warning',async()=>{
  const z=await JSZip.loadAsync(await nativeSource()),f=z.file('ppt/slides/slide1.xml')!,xml=await f.async('string');
  z.file(f.name,xml.replaceAll('<a:srgbClr val="FFFFFF"/>',props('FFFFFF','<a:alpha val="50000"/>')));
  const deck=await importPptx(await z.generateAsync({type:'uint8array'}),'Partial cell background.pptx');validateDeck(deck);
  assert(!deck.slides[0].source?.warnings.some(w=>w.includes('transparent')&&w.includes('source reference')));
  const table=deck.slides[0].elements.find(e=>e.type==='table')!;assert.equal(tableCellStyle(tablePresentation(table),0,0).background,'#FFFFFF80');
});

test('manual and AI cell formatting, clipboard and serialization retain alpha without changing the source',()=>{
  const e=element('table',{cells:[['Alpha','Other']],fill:'#4f63e780',tableStyle:{headerRow:false,bodyFill:'#ffffff',headerText:'#bf358480'}}),slide={...blankSlide(),elements:[e]},deck=newDeck('Editable alpha',[slide]),before=JSON.stringify(deck);
  const draft=tableCellTextElement(e,0,0),styled={...draft,...textRangeStylePatch(draft,{fill:'#bf358440'},{start:1,end:4})},copy=cellTextClipboard(styled,{start:1,end:4})!;
  assert.equal(copy.runs[0].color,'#bf358440');assert.deepEqual(readCellTextClipboard(JSON.stringify(copy)),copy);
  const pasted=pasteCellText(tableCellTextElement(e,0,1),{start:0,end:5},copy),patch=tableCellTextPatch(e,0,1,pasted.element);
  for(const actor of ['manual','ai'] as const){const result=applyImmutableOperations(deck,[{op:'update_element',slideId:slide.id,elementId:e.id,patch}],deck.revision,actor);validateDeck(JSON.parse(JSON.stringify(result)));assert.equal(result.revision,deck.revision+1);assert(result.slides[0].elements[0].tableStyle?.cellStyles?.some(c=>c.runs?.some(r=>r.color==='#bf358440')));}
  assert.equal(JSON.stringify(deck),before);
});

test('alpha boundaries and explicit noFill respect paint inheritance',()=>{
  assert.equal(pptxColor({srgbClr:{val:'4F63E7',alpha:{val:'25%'}}},{},{},'transparent',true),'#4F63E740');
  assert.equal(pptxColor({srgbClr:{val:'4F63E7',alpha:{val:'invalid'}}},{},{},'transparent',true),'#4F63E7');
  assert.equal(pptxColor({srgbClr:{val:'4F63E7',alphaOff:{val:'-200000'}}},{},{},'transparent',true),'#4F63E700');
  const visible={solidFill:{srgbClr:{val:'4F63E7'}}};
  assert.equal(pptxColor(pptxTextProperties({noFill:{}},visible),{},{},'transparent',true),'#4F63E7');
  assert.equal(pptxColor(pptxTextProperties(visible,{noFill:{}}),{},{},'#000000',true),'transparent');
});
