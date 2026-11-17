import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import JSZip from 'jszip';
import {blankSlide,element,newDeck} from '../src/core/model';
import {buildPptx} from '../src/core/export';
import {importPptx} from '../src/importers/pptx';
import {importFigma} from '../src/importers/figma';
import {paragraphStyle} from '../src/core/typography';
import PptxGenJS from 'pptxgenjs';

test('imported native page units and point sizes survive export without widening the physical page',async()=>{
 const p=new PptxGenJS();p.defineLayout({name:'Original',width:10,height:5.625});p.layout='Original';p.addSlide().addText('Original points',{x:1,y:1,w:5,h:1,fontFace:'Arial',fontSize:23.52});
 const bytes=await p.write({outputType:'uint8array'})as Uint8Array;const imported=await importPptx(bytes,'original.pptx');assert.equal(imported.width,1440);
 const z=await JSZip.loadAsync(await buildPptx(imported));const presentation=await z.file('ppt/presentation.xml')!.async('string');assert(presentation.includes('cx="9144000"'));assert(presentation.includes('cy="5143500"'));
 const xml=await z.file('ppt/slides/slide1.xml')!.async('string');assert(xml.includes('sz="2352"'));
});

test('fixed text geometry and first/last paragraph spacing survive the production PPTX writer',async()=>{
 const s=blankSlide();const e=element('text',{x:40,y:70,w:450,h:220,verticalAlign:'middle',paragraphSpacingAtEdges:true,text:'A\nB',paragraphs:[
  {runs:[{text:'A',fontSize:24}],align:'left',indent:0,firstLineIndent:0,spaceBefore:12,spaceAfter:0},
  {runs:[{text:'B',fontSize:24}],align:'left',indent:0,firstLineIndent:0,spaceBefore:0,spaceAfter:30}
 ]});s.elements=[e];
 const bytes=await buildPptx(newDeck('Paragraphs',[s]));const z=await JSZip.loadAsync(bytes);const xml=await z.file('ppt/slides/slide1.xml')!.async('string');
 assert(xml.includes('spcFirstLastPara="0"'));assert(xml.includes('tIns="114300"'));assert(xml.includes('bIns="285750"'));assert(xml.includes('<a:normAutofit fontScale="100000" lnSpcReduction="0"/>'));
 const out=(await importPptx(bytes,'fixed.pptx')).slides[0].elements.find(v=>v.type==='text')!;
 assert.equal(out.y,e.y);assert.equal(out.h,e.h);assert.equal(out.paragraphSpacingAtEdges,true);assert.equal(out.paragraphs![1].spaceAfter,30);
 e.paragraphSpacingAtEdges=false;
 const legacy=await JSZip.loadAsync(await buildPptx(newDeck('Suppressed',[s])));legacy.remove('customXml/deck-studio-text.xml');
 const suppressed=(await importPptx(await legacy.generateAsync({type:'uint8array'}),'legacy.pptx')).slides[0].elements.find(v=>v.type==='text')!;
 assert.equal(suppressed.paragraphs![1].spaceAfter,30);assert(paragraphStyle(suppressed.paragraphs![0],suppressed).includes('padding-top:0px'));assert(paragraphStyle(suppressed.paragraphs![1],suppressed).includes('padding-bottom:0px'));
});

test('Figma native text properties override incomplete REST exports without flattening text',async()=>{
 const native={id:'t',type:'TEXT',name:'Caption',characters:'Full editable caption',fontSize:24,textAlignHorizontal:'LEFT',textAlignVertical:'TOP',textTruncation:'ENDING',maxLines:2,width:200,height:71,absoluteBoundingBox:{x:0,y:0,width:200,height:71},getStyledTextSegments:()=>[{start:0,end:21,fontName:{family:'Inter',style:'Regular'},fontSize:24,fontWeight:400,fills:[{type:'SOLID',color:{r:0,g:0,b:0}}],textDecoration:'NONE',lineHeight:{unit:'PIXELS',value:36},letterSpacing:{unit:'PIXELS',value:0}}]};
 const root:any={id:'s',type:'FRAME',name:'Source',x:0,y:0,width:1920,height:1080,children:[native],absoluteBoundingBox:{x:0,y:0,width:1920,height:1080},exportAsync:async({format}:any)=>format==='PNG'?new Uint8Array([1]):{document:{id:'s',name:'Source',absoluteBoundingBox:{x:0,y:0,width:1920,height:1080},children:[{id:'t',type:'TEXT',characters:'Full editable caption',absoluteBoundingBox:native.absoluteBoundingBox,style:{fontFamily:'Inter',fontSize:22.8}}]}}};
 let download:any;const figma:any={editorType:'figma',root:{name:'Source'},currentPage:{selection:[],children:[root]},base64Encode:()=>'',showUI:()=>{},ui:{postMessage:(m:any)=>{if(m.type==='download')download=m;}},closePlugin:()=>{}};
 vm.runInNewContext(await readFile(new URL('../plugins/figma-export/code.js',import.meta.url),'utf8'),{figma,__html__:''});
 await figma.ui.onmessage({type:'export'});assert(download);
 const e=importFigma(JSON.parse(download.json)).slides[0].elements[0];assert.equal(e.type,'text');assert.equal(e.fontSize,24);assert.equal(e.maxLines,2);assert.equal(e.text,'Full editable caption');
});

test('scaled Figma text uses local font units and infers truncation in the transformed box',()=>{
 const d=importFigma({slides:[{id:'s',name:'Scaled',absoluteBoundingBox:{x:0,y:0,width:1920,height:1080},children:[{id:'t',type:'TEXT',characters:'Editable text',absoluteBoundingBox:{x:20,y:30,width:400,height:144},size:{x:200,y:72},relativeTransform:[[2,0,20],[0,2,30]],style:{fontFamily:'Inter',fontSize:24,lineHeightPx:36,textTruncation:'ENDING'}}]}]});
 assert.equal(d.slides[0].elements[0].fontSize,48);assert.equal(d.slides[0].elements[0].maxLines,2);
});
