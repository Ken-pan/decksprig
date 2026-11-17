import test from 'node:test';import assert from 'node:assert/strict';import JSZip from 'jszip';
import {element,blankSlide,newDeck,type SlideElement}from'../src/core/model';import {buildPptx}from'../src/core/pptx-export';import {importPptx}from'../src/importers/pptx';import {renderedPptxTextStyles}from'../src/core/pptx-text-styles';import {readPptxTextMetadata}from'../src/core/pptx-text-metadata';import {textBodyXml}from'../src/core/pptx-fidelity';
const paragraph=(text:string)=>({runs:[{text}],align:'left' as const,spaceBefore:26,spaceAfter:22,indent:0,firstLineIndent:0});
const native=async(e:SlideElement,template=false)=>{const s=blankSlide();s.elements=[e];return buildPptx(newDeck('Case',[s]),false,undefined,template,undefined,{nativeTextGeometry:true});};
test('native case mapping retains all five modes, mixed boundaries and Unicode source on a guarded round trip',async()=>{
 for(const mode of ['none','upper','lower','title','small-caps']as const){
  const e=element('text',{text:'heLLo woRLD · ßeta · 中文text',textCase:mode,fontFamily:'Arial',w:1200,h:140,fontSize:32,runs:[{text:'he',color:'#663399'},{text:'LLo',fontWeight:700},{text:' woRLD · ßeta · 中文text',italic:true}]}),before=JSON.stringify(e),bytes=await native(e),zip=await JSZip.loadAsync(bytes),xml=await zip.file('ppt/slides/slide1.xml')!.async('string'),restored=(await importPptx(bytes,'case.pptx')).slides[0].elements.find(v=>v.type==='text')!;
  assert(xml.includes(`cap="${mode==='upper'?'all':mode==='small-caps'?'small':'none'}"`));assert.equal(restored.text,e.text);assert.equal(restored.textCase,mode==='none'?undefined:mode);if(mode!=='none')assert.deepEqual(restored.runs,e.runs);assert.equal(JSON.stringify(e),before);
  if(mode==='upper')assert(xml.includes('SSeta'));if(mode==='lower')assert(xml.includes('llo'));if(mode==='title')assert(xml.includes('He'));
 }
});
test('titlecase follows representative CSS word boundaries without downcasing, expanding ligatures or breaking styled words',()=>{
 const cases=[['heLLo woRLD','HeLLo WoRLD'],["foo-bar don’t O'NEILL","Foo-Bar Don’t O'NEILL"],['123abc (word) “quoted”','123abc (Word) “Quoted”'],['élève ßeta 中文text','Élève ßeta 中文Text'],['a.b/c_d🙂word','A.B/C_d🙂Word'],['ǳuro ǆungla ﬁle ﬄag','ǲuro ǅungla ﬁle ﬄag'],['中文hello عربtext','中文Hello عربtext']];
 for(const [text,expected]of cases)assert.equal(renderedPptxTextStyles(element('text',{text,textCase:'title'})).text,expected);
 const e=element('text',{text:'heLLo woRLD',textCase:'title',runs:[{text:'he'},{text:'LLo',italic:true},{text:' wo',textCase:'none'},{text:'RLD'}]});assert.equal(renderedPptxTextStyles(e).text,'HeLLo woRLD');
 const lower=element('text',{text:'ΟΣ ΟΣ',textCase:'lower',runs:[{text:'ΟΣ '},{text:'Ο'},{text:'Σ',fontWeight:700}]});assert.equal(renderedPptxTextStyles(lower).text,'ος οσ');
 const context=element('text',{text:'hello ßeta',textCase:'title',runs:[{text:'hello ße',textCase:'none'},{text:'ta'}]});assert.equal(renderedPptxTextStyles(context).text,'hello ßeta');
 const inherited=element('text',{text:'hello ßeta',textCase:'upper',runs:[{text:'hello ßeta',textCase:'small-caps'}]});assert.equal(renderedPptxTextStyles(inherited).text,'HELLO SSETA');assert.equal(renderedPptxTextStyles(inherited).paragraphs![0].runs[0].textCase,'small-caps');
});
test('edge spacing is native visible insets for all alignments and restores original paragraphs, padding, policy and source geometry',async()=>{
 for(const verticalAlign of ['top','middle','bottom']as const){const e=element('text',{text:'Paragraph',fontFamily:'Arial',verticalAlign,paragraphSpacingAtEdges:true,padding:{top:5,left:3,bottom:11,right:7},paragraphs:[paragraph('Paragraph')]}),before=JSON.stringify(e),rendered=renderedPptxTextStyles(e);
  assert.deepEqual(rendered.padding,{top:31,left:3,bottom:33,right:7});assert.equal(rendered.paragraphs![0].spaceBefore,0);assert.equal(rendered.paragraphs![0].spaceAfter,0);assert.deepEqual(renderedPptxTextStyles(rendered),rendered);
  const bytes=await native(e),restored=(await importPptx(bytes,'edges.pptx')).slides[0].elements.find(v=>v.type==='text')!;assert.deepEqual(restored.padding,e.padding);assert.deepEqual(restored.paragraphs,e.paragraphs);assert.equal(restored.paragraphSpacingAtEdges,true);assert.deepEqual([restored.x,restored.y,restored.w,restored.h],[e.x,e.y,e.w,e.h]);assert.equal(JSON.stringify(e),before);
 }
});
test('external content, caps, paragraph, inset and line-height edits cannot be overwritten by saved source styles',async()=>{
 const e=element('text',{text:'SOURCE WORDS',textCase:'lower',fontFamily:'Arial',paragraphSpacingAtEdges:true,paragraphs:[paragraph('SOURCE WORDS')]}),bytes=await native(e);
 for(const mutate of [(s:string)=>s.replace('source words','Edited native words'),(s:string)=>s.replaceAll('cap="none"','cap="all"'),(s:string)=>s.replace('<a:spcPts val="0"/>','<a:spcPts val="900"/>'),(s:string)=>s.replace('tIns="247650"','tIns="95250"'),(s:string)=>s.replace('val="125000"','val="180000"')]){
  const zip=await JSZip.loadAsync(bytes),original=await zip.file('ppt/slides/slide1.xml')!.async('string'),changed=mutate(original);assert.notEqual(changed,original);zip.file('ppt/slides/slide1.xml',changed);const out=(await importPptx(await zip.generateAsync({type:'uint8array'}),'edited.pptx')).slides[0].elements.find(v=>v.type==='text')!;assert.notEqual(out.text,e.text);assert.equal(out.textCase,undefined);assert.notDeepEqual(out.paragraphs,e.paragraphs);
 }
});
test('shape and connector labels keep their visual case while unchanged files restore original editable characters',async()=>{
 for(const type of ['rect','line']as const){const e=element(type,{text:'SHAPE SOURCE',textCase:'lower',fontFamily:'Arial',x:80,y:100,w:500,h:type==='line'?1:140}),bytes=await native(e),zip=await JSZip.loadAsync(bytes),xml=await zip.file('ppt/slides/slide1.xml')!.async('string');assert(xml.includes('shape source'));const out=(await importPptx(bytes,'shape.pptx')).slides[0].elements.find(v=>v.type==='text')!;assert.equal(out.text,e.text);assert.equal(out.textCase,e.textCase);const metadata=await readPptxTextMetadata(zip);assert(metadata?.slides[0][0].renderedBody);}
});
