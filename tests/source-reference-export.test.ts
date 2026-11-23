import test from 'node:test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import JSZip from 'jszip';
import {XMLParser} from 'fast-xml-parser';
import {newDeck,blankSlide} from '../src/core/model';
import {buildPptx} from '../src/core/pptx-export';
const png=(w:number,h:number)=>{const p=new PNG({width:w,height:h});p.data.fill(255);return PNG.sync.write(p);};
const close=(a:number,b:number)=>assert(Math.abs(a-b)<2,`${a} != ${b}`);

test('source-reference PPTX contains mixed-aspect images without cropping or stretching and retains original bytes/notes',async()=>{
 const sizes=[[160,90],[90,160],[120,90],[320,90],[32,18]] as const,bytes=sizes.map(([w,h])=>png(w,h)),slides=sizes.map((_,i)=>({...blankSlide(),notes:`Original notes ${i}`,hidden:i===3,source:{provider:'Fixture',fidelity:'source-render' as const,warnings:[],render:'data:image/png;base64,'+bytes[i].toString('base64')}})),d=newDeck('Mixed references',slides),before=JSON.stringify(d),calls:string[]=[];
 slides.push({...slides[0],id:'repeated-source',notes:'Same source on another slide'});
 const deck={...d,slides},input=JSON.stringify(deck),zip=await JSZip.loadAsync(await buildPptx(deck,true,async(src)=>{calls.push(src);const image=PNG.sync.read(Buffer.from(src.split(',')[1],'base64'));return {w:image.width,h:image.height};})),parser=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,attributeNamePrefix:''});
 assert.equal(calls.length,5,'Repeated reference images reuse the same dimension read');
 // EMU placement independently describes centered contain in a 1440×810 canvas.
 const expected=[[0,0,1440,810],[492.1875,0,455.625,810],[180,0,1080,810],[0,202.5,1440,405],[0,0,1440,810],[0,0,1440,810]];
 for(let i=0;i<slides.length;i++){const xml=await zip.file(`ppt/slides/slide${i+1}.xml`)!.async('string'),s=parser.parse(xml).sld,pic=s.cSld.spTree.pic;assert(!Array.isArray(pic));const frame=pic.spPr.xfrm,[x,y,w,h]=expected[i];close(Number(frame.off.x),x*9525);close(Number(frame.off.y),y*9525);close(Number(frame.ext.cx),w*9525);close(Number(frame.ext.cy),h*9525);assert.equal(pic.blipFill.srcRect,undefined);assert(xml.includes('show="0"')===(i===3));const notes=await zip.file(`ppt/notesSlides/notesSlide${i+1}.xml`)!.async('string');assert(notes.includes(slides[i].notes));}
 const media=await Promise.all(Object.values(zip.files).filter(f=>!f.dir&&/^ppt\/media\/.*\.png$/.test(f.name)).map(f=>f.async('nodebuffer')));for(const b of bytes)assert(media.some(actual=>actual.equals(b)),'Native export preserves each source PNG byte-for-byte');assert.equal(JSON.stringify(d),before);assert.equal(JSON.stringify(deck),input);
});

test('source-reference export contains within preserved native page units and rejects unreadable dimensions',async()=>{
 const s=blankSlide();s.source={provider:'PDF',fidelity:'source-render',warnings:[],render:'data:image/png;base64,'+png(90,160).toString('base64')};const d=newDeck('Native page',[s]);d.provenance={provider:'PowerPoint',filename:'source.pptx',importedAt:new Date().toISOString(),pageSize:{width:960,height:540,canvasWidth:1440,canvasHeight:810}};
 const zip=await JSZip.loadAsync(await buildPptx(d,true,async()=>({w:90,h:160}))),parser=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,attributeNamePrefix:''}),size=parser.parse(await zip.file('ppt/presentation.xml')!.async('string')).presentation.sldSz,frame=parser.parse(await zip.file('ppt/slides/slide1.xml')!.async('string')).sld.cSld.spTree.pic.spPr.xfrm;assert.equal(Number(size.cx),960*12700);assert.equal(Number(size.cy),540*12700);close(Number(frame.ext.cx),303.75*12700);close(Number(frame.ext.cy),540*12700);close(Number(frame.off.x),(960-303.75)/2*12700);
 for(const invalid of [{w:0,h:100},{w:100,h:NaN}])await assert.rejects(buildPptx(d,true,async()=>invalid),/source reference.*Attach the source PDF/i);
});
