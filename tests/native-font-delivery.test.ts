import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import {FONT_LIBRARY} from '../src/core/fonts';
import {newDeck,blankSlide,element} from '../src/core/model';
import {embedPptxFonts} from '../src/core/pptx-fonts';
import {nativeFontPolicy,bindPptxEastAsianFonts} from '../src/core/pptx-font-policy';
import {buildPptx} from '../src/core/pptx-export';

const load=async(path:string)=>new Uint8Array(await readFile('public'+path));
const emptyPackage=()=>{
  const zip=new JSZip();zip.file('ppt/presentation.xml','<p:presentation></p:presentation>');
  zip.file('ppt/_rels/presentation.xml.rels','<Relationships></Relationships>');
  zip.file('[Content_Types].xml','<Types></Types>');return zip;
};

test('all built-in families have native regular/bold/italic styles from intact licensed originals',async()=>{
  const manifest=JSON.parse(await readFile('public/fonts/pptx/manifest.json','utf8'));
  const keys=new Set<string>();
  for(const font of FONT_LIBRARY){
    const styles=['regular',...(font.weights.length>1?['bold']:[]),...(font.styles.includes('italic')?['italic',...(font.weights.length>1?['boldItalic']:[])]:[])];
    for(const style of styles)assert(manifest.some((face:{family:string;style:string})=>face.family===font.family&&face.style===style),font.family+' '+style);
  }
  for(const face of manifest){
    const key=face.family+':'+face.style;assert(!keys.has(key),key);keys.add(key);
    const payload=await readFile('public'+face.file),raw=await readFile('public'+face.ttf);
    assert.equal(createHash('sha256').update(payload).digest('hex'),face.sha256);
    assert.equal(payload.readUInt32LE(0),payload.length);assert.equal(payload.readUInt32LE(4),raw.length);
    assert.equal(payload.readUInt16LE(32),0);assert.equal(payload.readUInt16LE(34),0x504c);
    assert.equal(payload[27],Number(face.style.includes('Italic')||face.style==='italic'));
    assert(payload.subarray(payload.length-raw.length).equals(raw));
    assert((await readFile('public'+face.license,'utf8')).includes('SIL OPEN FONT LICENSE'));
    for(const [source,hash]of Object.entries(face.sourceHashes))assert.equal(createHash('sha256').update(await readFile(source)).digest('hex'),hash);
  }
});

test('native East Asian binding follows known fallback categories and preserves custom, unknown and CJK faces',async()=>{
  const deck=newDeck('Font binding',[blankSlide()]);deck.fonts=[{family:'LORA',name:'Custom.ttf',weight:'400',style:'normal',data:'data:font/ttf;base64,AA=='}];
  deck.onlineFonts=[{id:'figtree',family:'Figtree',category:'serif',chinese:false,weights:[400],styles:['normal'],version:'5.3.0',license:'OFL-1.1',licenseNotice:'SIL OPEN FONT LICENSE'}];
  const resolve=nativeFontPolicy(deck);
  assert.equal(resolve('lora'),'lora');assert.equal(resolve('Bodoni Moda'),'Noto Serif SC');
  assert.equal(resolve('wOrK sAnS'),'Noto Sans SC');assert.equal(resolve('FIGTREE'),'Noto Serif SC');
  for(const family of ['Noto Serif SC','Ma Shan Zheng','Unknown CJK','JetBrains Mono'])assert.equal(resolve(family),family);
  assert.equal(resolve('+mj-lt'),'+mj-ea');
  const zip=new JSZip(),source='<a:rPr><a:latin typeface="Bodoni Moda"/><a:ea typeface="Bodoni Moda"/><a:cs typeface="Other"/></a:rPr><a:defRPr><a:latin typeface="wOrK sAnS"/></a:defRPr><a:rPr><a:latin typeface="Bodoni Moda"/><a:ea typeface="Explicit CJK"/></a:rPr><a:rPr><a:latin typeface="+mj-lt"/><a:ea typeface="+mj-ea"/></a:rPr>';
  for(const path of ['ppt/slides/slide1.xml','ppt/charts/chart1.xml','ppt/slideLayouts/slideLayout1.xml'])zip.file(path,source);
  await bindPptxEastAsianFonts(zip,deck);
  for(const file of Object.values(zip.files).filter(f=>!f.dir)){
    const xml=await file.async('string');
    assert(xml.includes('<a:ea typeface="Noto Serif SC"/><a:cs typeface="Other"/>'));
    assert(xml.includes('<a:latin typeface="wOrK sAnS"/><a:ea typeface="Noto Sans SC"/>'));
    assert(xml.includes('<a:ea typeface="Explicit CJK"/>'));assert(xml.includes('<a:ea typeface="+mj-ea"/>'));
  }
});

test('native embedding selects actual style use, ignores hidden/covered artwork and carries full notices in a linked standard part',async()=>{
  const slide=blankSlide();slide.elements=[
    element('text',{fontFamily:'lOrA',text:'中文 regular'}),
    element('text',{fontFamily:'Lora',text:'Bold italic',fontWeight:700,italic:true}),
    element('text',{fontFamily:'Bodoni Moda',text:'Hidden',hidden:true}),
    element('rect',{fontFamily:'Manrope',text:''}),
    element('table',{fontFamily:'JetBrains Mono',cells:[['Visible','Covered']],tableStyle:{headerRow:false,merges:[{row:0,column:0,rowSpan:1,columnSpan:2}],cellStyles:[{row:0,column:1,fontFamily:'Bodoni Moda'}]}}),
  ];
  const deck=newDeck('Used native faces',[slide]);deck.designSystem=undefined;
  const before=JSON.stringify(deck),requests:string[]=[],zip=emptyPackage();
  zip.file('docProps/custom.xml','<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property pid="2" name="Retained"><vt:lpwstr>Original</vt:lpwstr></property></Properties>');
  await embedPptxFonts(zip,deck,async path=>{requests.push(path);return load(path);});
  const xml=await zip.file('ppt/presentation.xml')!.async('string');
  for(const family of ['Lora','Noto Serif SC','JetBrains Mono'])assert(xml.includes('typeface="'+family+'"'));
  for(const family of ['Bodoni Moda','Manrope','Noto Sans SC'])assert(!xml.includes('typeface="'+family+'"'));
  const lora=xml.match(/<p:embeddedFont><p:font typeface="Lora"\/>[\s\S]*?<\/p:embeddedFont>/)![0];
  assert(lora.indexOf('<p:regular')<lora.indexOf('<p:boldItalic'));assert(!lora.includes('<p:bold '));
  assert.equal(requests.filter(p=>p.endsWith('lora-OFL.txt')).length,1);
  const properties=await zip.file('docProps/custom.xml')!.async('string');
  assert(properties.includes('name="Retained"'));assert(properties.includes('name="Decksprig embedded font licenses"'));assert(properties.includes('SIL OPEN FONT LICENSE'));
  assert((await zip.file('_rels/.rels')!.async('string')).includes('/custom-properties"'));
  assert((await zip.file('[Content_Types].xml')!.async('string')).includes('PartName="/docProps/custom.xml"'));
  assert.equal(JSON.stringify(deck),before);
});

test('ordinary and provenance documents export actual bundled fonts without requiring template enhancement',async()=>{
  for(const provenance of [undefined,{provider:'pptx',filename:'Original.pptx'}])for(const template of [false,true]){
    const slide=blankSlide();slide.elements=[element('text',{fontFamily:'lOrA',text:'Portable 中文',textSizing:'fixed'})];
    const deck=newDeck('Native ordinary',[slide]);deck.designSystem=undefined;deck.provenance=provenance;
    const before=JSON.stringify(deck),zip=await JSZip.loadAsync(await buildPptx(deck,false,async()=>({w:1,h:1}),template,load));
    const slideXml=await zip.file('ppt/slides/slide1.xml')!.async('string'),presentation=await zip.file('ppt/presentation.xml')!.async('string');
    assert(slideXml.includes('<a:latin typeface="lOrA"/><a:ea typeface="Noto Serif SC"/>'));
    assert(presentation.includes('<p:font typeface="Lora"/>'));assert(presentation.includes('<p:font typeface="Noto Serif SC"/>'));
    assert((await zip.file('[Content_Types].xml')!.async('string')).includes(template?'presentationml.template.main+xml':'presentationml.presentation.main+xml'));
    assert.equal(JSON.stringify(deck),before);
  }
});

test('themed table typography retains explicit mixed fonts and global font overrides',async()=>{
  for(const override of [false,true]){
    const slide=blankSlide();slide.template={prototype:'cover',variant:'base',density:'presentation'};
    slide.elements=[element('table',{fontFamily:override?'Lora':'Work Sans',cells:[['Body 中文','Mixed 中文']],design:{text:'body',overrides:override?['fontFamily']:undefined},tableStyle:{headerRow:false,cellStyles:[{row:0,column:1,runs:[{text:'Mixed 中文',fontFamily:'Bodoni Moda'}]}]}})];
    const deck=newDeck('Native mixed table',[slide]);deck.designSystem!.typography.body.fontFamily='Work Sans';
    const zip=await JSZip.loadAsync(await buildPptx(deck,false,async()=>({w:1,h:1}))),xml=await zip.file('ppt/slides/slide1.xml')!.async('string');
    assert.match(xml,/<a:latin\b[^>]*typeface="Bodoni Moda"[^>]*\/><a:ea typeface="Noto Serif SC"\/>/);
    assert.match(xml,override?/<a:latin\b[^>]*typeface="Lora"[^>]*\/><a:ea typeface="Noto Serif SC"\/>/:/<a:latin\b[^>]*typeface="\+mn-lt"[^>]*\/><a:ea typeface="\+mn-ea"\/>/);
  }
});
