import{test}from'node:test';import assert from'node:assert/strict';import JSZip from'jszip';
import{nativeColor,nativeColorXml}from'../src/core/pptx-color';import{element,blankSlide,newDeck}from'../src/core/model';import{buildPptx}from'../src/core/pptx-export';
import{textBodyXml}from'../src/core/pptx-fidelity';import{lineStyleXml,shadowXml}from'../src/core/shape-pptx';
import{XMLValidator}from'fast-xml-parser';
test('native colors separate short and long hexadecimal alpha and compose object opacity',()=>{
 for(const [input,color,alpha]of[['#fff','ffffff',1],['#fff4','ffffff',68/255],['#ffffff40','ffffff',64/255],['#123456','123456',1],['transparent','FFFFFF',0]]as const){const actual=nativeColor(input,.6);assert.equal(actual.color,color);assert.equal(actual.alpha,alpha*.6);const xml=nativeColorXml(input,.6);assert.match(xml,new RegExp(`val="${color}"`));assert.match(xml,new RegExp(`alpha val="${Math.round(alpha*.6*100000)}"`));}
});
test('native text, connector lines and shadows emit valid RGB with composed alpha',()=>{
 const e=element('text',{text:'Alpha text',fill:'#12345680',opacity:.6,runs:[{text:'Alpha text',color:'#abc8'}]});
 const text=textBodyXml(e);assert.match(text,/<a:srgbClr val="aabbcc"><a:alpha val="32000"\/>/);assert.doesNotMatch(text,/val="abc8"/);
 const inherited=textBodyXml({...e,runs:undefined},{fill:'dk1'});assert.match(inherited,/<a:schemeClr val="dk1"><a:alpha val="30118"\/>/);
 const line=lineStyleXml(element('line',{stroke:'#12345680',opacity:.6}));assert.match(line,/<a:srgbClr val="123456"><a:alpha val="30118"\/>/);
 const shadow=shadowXml(element('rect',{shadow:{color:'#123456',opacity:.6,x:1,y:2,blur:3}}));assert.match(shadow,/<a:srgbClr val="123456"><a:alpha val="60000"\/>/);
});
test('actual native vector fill and stroke retain editable alpha and never write eight-digit RGB values',async()=>{
 const slide=blankSlide();slide.elements=[element('rect',{id:'alpha',fill:'#ffffff40',stroke:'#12345680',strokeWidth:2,opacity:.6,text:'Readable',shapeText:{color:'#ffffffcc'}}),element('rect',{id:'short',fill:'#abc4'})];const deck=newDeck('Alpha colors',[slide]),before=structuredClone(deck),zip=await JSZip.loadAsync(await buildPptx(deck,false,undefined,false,undefined,{nativeTextGeometry:true})),xml=await zip.file('ppt/slides/slide1.xml')!.async('string');
 const shape=xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g)!.find(x=>x.includes('name="alpha"'))!;assert.match(shape,/<a:srgbClr val="ffffff"><a:alpha val="15059"\/>/i);assert.match(shape,/<a:srgbClr val="123456"><a:alpha val="30118"\/>/i);assert.match(shape,/<a:srgbClr val="ffffff"><a:alpha val="48000"\/>/i);
 assert(![...xml.matchAll(/<a:srgbClr val="([^"]+)"/g)].some(m=>!/^[a-f0-9]{6}$/i.test(m[1])));assert.deepEqual(deck,before);
});
test('native table text keeps CSS alpha, invisible cells and explicit rich run overrides',async()=>{
 const slide=blankSlide();
 const colors=['#4f63e780','#abc8','transparent','#4f63e7'];
 slide.elements=colors.map((fill,i)=>element('table',{id:'alpha-table-'+i,fill,x:50,y:50+i*150,w:600,h:140,cells:[['Base','Hide','Split']],tableStyle:{headerRow:false,bodyFill:'transparent',borders:'none',cellStyles:[{row:0,column:1,color:'transparent'},{row:0,column:2,runs:[{text:'S',color:'transparent'},{text:'p',color:'#bf3584'},{text:'lit'}]}]}}));
 const deck=newDeck('Table alpha',[slide]),before=structuredClone(deck),zip=await JSZip.loadAsync(await buildPptx(deck,false,undefined,false,undefined,{nativeTextGeometry:true})),xml=await zip.file('ppt/slides/slide1.xml')!.async('string');
 assert.equal(XMLValidator.validate(xml),true);
 const frames=xml.match(/<p:graphicFrame>[\s\S]*?<\/p:graphicFrame>/g)!;
 for(const [i,frame]of frames.entries()){
  const paint=nativeColor(colors[i]),expected=nativeColorXml(colors[i]),cells=frame.match(/<a:tc\b[^>]*>[\s\S]*?<\/a:tc>/g)!;
  assert.match(cells[0],new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));
  assert.match(cells[1],/<a:alpha val="0"\/>/);
  const runs=cells[2].match(/<a:r>[\s\S]*?<\/a:r>/g)!;
  assert.match(runs[0],/<a:alpha val="0"\/>/);
  assert.match(runs[1],/<a:srgbClr val="bf3584"\/>/i);
  assert.match(runs[2],new RegExp(`srgbClr val="${paint.color}"`,'i'));
  if(paint.alpha!==1)assert.match(runs[2],new RegExp(`alpha val="${Math.round(paint.alpha*100000)}"`));
  assert.doesNotMatch(frame,/<a:srgbClr val="000000"/);
 }
 assert.equal(frames.length,colors.length);assert.deepEqual(deck,before);
});
