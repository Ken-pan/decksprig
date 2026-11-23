import {test} from 'node:test';
import assert from 'node:assert/strict';
import {templateDeck} from '../src/core/templates';
import {documentTextChoices,documentFontChoices} from '../src/core/document-style-choices';
import {documentFontSelectionOperations} from '../src/core/font-selection';
import {findFont,fontOperations} from '../src/core/fonts';
import {applyOperations} from '../src/core/operations';
import {applyDeckDesignSystem} from '../src/core/deck-design-system';
import {objectTextStyleOperations,objectStyleWeightOperations} from '../src/core/object-style-operations';
import {textRangeStylePatch,textRangeTarget} from '../src/core/text-range-format';
import {validateDeck,element} from '../src/core/model';
import {documentJsonBlob} from '../src/core/document-json';
// Picker overrides are independent of a template flow's adaptive font budget.
const freeBody=(d:ReturnType<typeof templateDeck>)=>{const source=d.slides[0].elements.find(e=>e.design?.text==='body')!,e={...structuredClone(source),id:'free-body',group:undefined,layoutItem:undefined,textSizing:'fixed' as const};d.slides[0].elements.push(e);return e;};

test('document choices use professional role values, preserve layout/page scales and deduplicate paired fonts',()=>{
 const d=templateDeck('review'),system=d.designSystem!;system.typography.title.fontSize=110;system.typography.body.fontSize=34;
 const title=d.slides[0].elements.find(e=>e.design?.text==='title')!;title.design!.textScale=.9;title.fontSize=41;title.design!.overrides=['fontSize'];
 const choices=documentTextChoices(d,[title]);assert.equal(choices[0].size,99);assert.equal(choices.find(c=>c.role==='body')!.size,34);
 assert.equal(documentTextChoices({...d,width:720,height:405},[title])[0].size,49.5);
 const other=structuredClone(title);other.design!.textScale=1;assert.equal(documentTextChoices(d,[title,other])[0].size,undefined);
 assert.deepEqual(documentFontChoices(d).map(c=>c.roles),[['title','heading'],['body','caption']]);
});
test('choosing a document font links only the family and keeps typography, rich emphasis, colors and protected objects',async()=>{
 const d=templateDeck('review'),s=d.slides[0],e=freeBody(d);d.designSystem!.typography.title.fontFamily='Lora';
 e.fontSize=43;e.fontWeight=700;e.design!.overrides=['fontSize','fontWeight'];e.runs=[{text:'Inherited',fontFamily:e.fontFamily,bold:true,color:e.fill},{text:'Custom',fontFamily:'Georgia',italic:true,color:'#ff0088'}];
 const locked=element('text',{locked:true}),source=element('text',{sourceRegion:{left:0,top:0,right:.5,bottom:.5}});s.elements.push(locked,source);
 const before=structuredClone(d),originalDocument=globalThis.document;globalThis.document={createElement:()=>({remove(){}}),head:{append:(link:{onload:()=>void})=>queueMicrotask(()=>link.onload())},fonts:{load:async()=>[]}} as unknown as Document;
 try{
  const ops=await documentFontSelectionOperations(d,s.id,[e.id,locked.id,source.id],findFont('Lora')!);globalThis.document=originalDocument;const linked=applyOperations(d,ops);const result=linked.slides[0].elements.find(v=>v.id===e.id)!;
  assert.equal(result.design!.font,'title');assert.equal(result.design!.text,'body');assert.equal(result.fontFamily,'Lora');assert.equal(result.fontSize,43);assert.equal(result.fontWeight,700);assert.equal(result.lineHeight,e.lineHeight);
  assert.equal(result.runs![0].bold,true);assert.equal(result.runs![1].italic,true);assert.equal(result.runs![1].color,'#ff0088');assert.deepEqual(linked.slides[0].elements.find(v=>v.id===locked.id),locked);assert.deepEqual(linked.slides[0].elements.find(v=>v.id===source.id),source);assert.deepEqual(d,before);
  const system=structuredClone(linked.designSystem!);system.typography.title.fontFamily='Space Grotesk';system.typography.body.fontFamily='Inter';system.typography.body.fontSize=36;
  const changed=applyDeckDesignSystem(linked,system).slides[0].elements.find(v=>v.id===e.id)!;assert.equal(changed.fontFamily,'Space Grotesk');assert.equal(changed.fontSize,43);assert.equal(changed.fontWeight,700);assert.equal(changed.runs![0].fontFamily,'Space Grotesk');assert.equal(changed.runs![1].fontFamily,'Space Grotesk');
  const json=await documentJsonBlob(linked);assert.equal(validateDeck(JSON.parse(await json.text())).slides[0].elements.find(v=>v.id===e.id)!.design!.font,'title');
  const custom=applyOperations(linked,fontOperations(linked,s.id,[e.id],'Georgia'));assert.equal(custom.slides[0].elements.find(v=>v.id===e.id)!.design?.font,undefined);
  const reset=applyOperations(linked,objectTextStyleOperations(linked,s.id,[e.id],undefined,true));assert.equal(reset.slides[0].elements.find(v=>v.id===e.id)!.design?.font,undefined);assert.equal(reset.slides[0].elements.find(v=>v.id===e.id)!.fontFamily,linked.designSystem!.typography.body.fontFamily);
 }finally{globalThis.document=originalDocument;}
});
test('document weight restores only its weight rule while font, size and color overrides remain',()=>{
 const d=templateDeck('review'),s=d.slides[0],e=freeBody(d);e.fontSize=43;e.fontWeight=700;e.fill='#ff0088';e.design!.font='title';e.design!.overrides=['fontSize','fontWeight'];e.runs=[{text:'Bold',bold:true,italic:true,color:'#ff0088'}];
 const after=applyOperations(d,objectStyleWeightOperations(d,s.id,[e.id])).slides[0].elements.find(v=>v.id===e.id)!;
 assert.equal(after.fontWeight,d.designSystem!.typography.body.fontWeight);assert.equal(after.fontSize,43);assert.equal(after.fill,'#ff0088');assert.equal(after.design!.font,'title');assert.deepEqual(after.design!.overrides,['fontSize']);assert.equal(after.runs![0].bold,undefined);assert.equal(after.runs![0].italic,true);assert.equal(after.runs![0].color,'#ff0088');
});
test('inline document-style formatting changes only selected characters and stays explicitly local',()=>{
 const e=element('text',{text:'One 中😀 Two',fontFamily:'Inter',fill:'#233744'}),before=structuredClone(e),range={start:4,end:7};
 const patch=textRangeStylePatch(e,{fontFamily:'Lora',fontSize:34,fontWeight:600,fill:'#9b503b'},range);const next={...e,...patch};
 assert.equal(next.text,e.text);assert.equal(next.fontFamily,'Inter');assert.equal(textRangeTarget(next,{start:0,end:3}).paragraphs![0].runs[0].fontFamily,undefined);assert.equal(textRangeTarget(next,range).paragraphs![0].runs[0].fontFamily,'Lora');assert.equal(textRangeTarget(next,{start:8,end:11}).paragraphs![0].runs[0].fontFamily,undefined);assert.deepEqual(e,before);
});

test('authored text fitting preserves a manually overridden font size in its native flow',()=>{
 const d=templateDeck('review'),s=d.slides[0],e=s.elements.find(e=>e.design?.text==='body'&&e.layoutItem?.basisFontSize)!;
 const manual=applyOperations(d,[{op:'update_element',slideId:s.id,elementId:e.id,patch:{fontSize:43}}]);
 const system=structuredClone(manual.designSystem!);system.typography.body.fontFamily='Lora';
 const after=applyDeckDesignSystem(manual,system).slides[0].elements.find(item=>item.id===e.id)!;
 assert.equal(after.fontSize,43);assert(after.design?.overrides?.includes('fontSize'));
});
