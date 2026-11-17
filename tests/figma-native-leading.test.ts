import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {compileModule} from 'svelte/compiler';
import {tableHost} from './helpers/figma-table-host';
import {applyDeckToFigma,setNativeText} from '../plugins/figma-export/native';
import {serializeForDeck} from '../plugins/figma-export/capture';
import {importFigma} from '../src/importers/figma';
import {textRangeStylePatch} from '../src/core/text-range-format';
import {textStylePatch} from '../src/core/text-style';
import {projectFigmaChanges,mergeFigmaDeck} from '../src/core/figma-sync';
import type {Editor as EditorType} from '../src/core/editor.svelte';

const directory=await mkdtemp(join(tmpdir(),'deck-leading-history-'));
const javascript=ts.transpileModule(await readFile('src/core/editor.svelte.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const compiled=compileModule(javascript,{generate:'client',filename:'editor.svelte.js'}).js.code
  .replace(/(from\s+|import\s*\()(['"])(\.\/[^'"]+)\2/g,(_all,prefix,quote,path)=>`${prefix}${quote}${pathToFileURL(resolve('src/core',path+'.ts')).href}${quote}`)
  .replace(/(['"])svelte\/internal\/client\1/g,()=>JSON.stringify(import.meta.resolve('svelte/internal/client')));
await writeFile(join(directory,'editor.mjs'),compiled);
const {Editor}=await import(pathToFileURL(join(directory,'editor.mjs')).href) as {Editor:new()=>EditorType};
after(()=>rm(directory,{recursive:true,force:true}));
const imported=(slide:any)=>importFigma({url:'https://www.figma.com/slides/file',fileKey:'file',slides:[serializeForDeck(slide)]});
const clone=<T>(value:T):T=>structuredClone(value);

function richFixture(destructiveCharacters=false){
  const f=tableHost(),text=f.node('TEXT'),content='Plugin connection acceptance',paint=[{type:'SOLID',color:{r:31/255,g:31/255,b:31/255},opacity:1}];
  const base={fontName:{family:'Inter',style:'Regular'},fontSize:56,fills:paint,textDecoration:'NONE',lineHeight:{unit:'AUTO'},letterSpacing:{unit:'PIXELS',value:0},textCase:'ORIGINAL',paragraphSpacing:0,paragraphIndent:0};
  let raw=content,styles=raw.split('').map(()=>clone(base));
  const patch=(key:string,value:any,start=0,end=styles.length)=>{for(let i=start;i<end;i++)(styles[i]as any)[key]=clone(value);};
  Object.defineProperty(text,'characters',{configurable:true,get:()=>raw,set(value:string){raw=value;if(styles.length!==value.length)styles=value.split('').map(()=>clone(base));if(destructiveCharacters)patch('lineHeight',{unit:'PIXELS',value:12});}});
  for(const key of Object.keys(base))Object.defineProperty(text,key,{configurable:true,get(){const values=styles.map(s=>(s as any)[key]);return values.every(v=>JSON.stringify(v)===JSON.stringify(values[0]))?clone(values[0]??(base as any)[key]):Symbol('mixed');},set(value:any){patch(key,value);}});
  text.getStyledTextSegments=(fields:string[])=>{
    const result:any[]=[];for(let i=0;i<styles.length;i++){
      const s=styles[i],values:any={};for(const key of fields)values[key]=key==='fontWeight'?/bold/i.test(s.fontName.style)?700:400:(s as any)[key];
      const previous=result.at(-1),signature=JSON.stringify(values);if(previous?.signature===signature){previous.end=i+1;previous.characters+=raw[i];}else result.push({...clone(values),characters:raw[i],start:i,end:i+1,signature});
    }return result.map(({signature,...s})=>s);
  };
  for(const [method,key]of Object.entries({setRangeFontName:'fontName',setRangeFontSize:'fontSize',setRangeFills:'fills',setRangeTextDecoration:'textDecoration',setRangeLineHeight:'lineHeight',setRangeLetterSpacing:'letterSpacing',setRangeTextCase:'textCase',setRangeParagraphSpacing:'paragraphSpacing',setRangeParagraphIndent:'paragraphIndent'}))text[method]=(start:number,end:number,value:any)=>patch(key,value,start,end);
  text.resize(797,68);text.textAutoResize='WIDTH_AND_HEIGHT';text.textAlignVertical='TOP';f.slide.appendChild(text);
  return {...f,text,paint,leading:()=>styles.map(s=>clone(s.lineHeight)),publicState:()=>({id:text.id,width:text.width,height:text.height,characters:text.characters,alignment:text.textAlignHorizontal,leading:styles.map(s=>clone(s.lineHeight)),styles:clone(styles)})};
}
const fontMap=new Map([['Regular','Regular'],['Bold','Bold'],['Italic','Italic']].map(([name,style])=>[JSON.stringify(['Inter',name==='Bold'?700:400,name==='Italic']),{family:'Inter',style}]));

test('native AUTO survives partial Bold, incoming native range formatting and both real Editor Undo steps',async()=>{
  const f=richFixture(),nativeBefore=imported(f.slide),editor=new Editor();editor.deck=clone(nativeBefore);editor.activeId=editor.deck.slides[0].id;editor.scheduleSave=()=>{};editor.choose(editor.deck.slides[0].elements[0].id);
  // The real acceptance document retains this measured projection of AUTO.
  editor.deck.slides[0].elements[0].paragraphs![0].lineSpacing=67.2;
  const initial=clone(editor.deck),baseline=f.publicState(),slideId=editor.activeId,elementId=editor.selection[0].id;
  editor.commit([{op:'update_element',slideId,elementId,patch:textRangeStylePatch(editor.selection[0],{fontWeight:700},{start:0,end:6})}]);
  await applyDeckToFigma(f.host,editor.deck,initial);assert.deepEqual(f.text.lineHeight,{unit:'AUTO'});assert.equal(editor.past.length,1);
  const sent=clone(editor.deck),nativeBase=imported(f.slide);
  f.text.setRangeFontName(7,17,{family:'Inter',style:'Italic'});f.text.setRangeFills(7,17,[{type:'SOLID',color:{r:.9,g:.2,b:.1},opacity:1}]);
  const projected=projectFigmaChanges(sent,nativeBase,imported(f.slide)),merged=mergeFigmaDeck(sent,editor.deck,projected);assert.equal(merged.conflicts.length,0);assert(merged.deck);editor.replace(merged.deck);assert.equal(editor.past.length,2);
  let previous=clone(editor.deck);editor.undo();await applyDeckToFigma(f.host,editor.deck!,previous);assert.deepEqual(f.text.lineHeight,{unit:'AUTO'});
  previous=clone(editor.deck);editor.undo();await applyDeckToFigma(f.host,editor.deck!,previous);assert.deepEqual(f.publicState(),baseline);assert.equal(editor.past.length,0);assert.equal(editor.selection[0].text,initial.slides[0].elements[0].text);
});

test('unrelated rich formatting restores exact mixed native AUTO, percent and pixel leading after destructive style setters',()=>{
  const f=richFixture(true);f.text.setRangeLineHeight(6,17,{unit:'PERCENT',value:140});f.text.setRangeLineHeight(17,28,{unit:'PIXELS',value:71});
  const before=imported(f.slide).slides[0].elements[0],after={...before,...textRangeStylePatch(before,{underline:true},{start:1,end:5})},leading=f.leading();
  setNativeText(f.text,after,fontMap,before);assert.deepEqual(f.leading(),leading);assert.equal(f.text.getStyledTextSegments(['textDecoration'])[1].textDecoration,'UNDERLINE');
  setNativeText(f.text,before,fontMap,after);assert.deepEqual(f.leading(),leading);
});

test('native float quantization does not turn an unrelated style edit into an authored leading edit',()=>{
  const f=richFixture(true),before=imported(f.slide).slides[0].elements[0];before.paragraphs![0].lineSpacing=67.2;const after={...before,...textRangeStylePatch(before,{italic:true},{start:7,end:17})};after.paragraphs![0].lineSpacing=67.19999694824219;
  setNativeText(f.text,after,fontMap,before);assert.deepEqual(f.text.lineHeight,{unit:'AUTO'});
});

test('explicit authored leading and new text use the requested pixels instead of restoring native AUTO',()=>{
  const f=richFixture(),before=imported(f.slide).slides[0].elements[0],after={...before,...textStylePatch(before,{lineHeight:1.5})};setNativeText(f.text,after,fontMap,before);assert.deepEqual(f.text.lineHeight,{unit:'PIXELS',value:84});
  const fresh=richFixture();setNativeText(fresh.text,before,fontMap);assert.deepEqual(fresh.text.lineHeight,{unit:'PIXELS',value:67.2});
});

test('unreadable mixed leading fails preflight before any title, binding, text or undo mutation',async()=>{
  const f=richFixture(),before=imported(f.slide),after=clone(before);Object.assign(after.slides[0].elements[0],textRangeStylePatch(after.slides[0].elements[0],{fontWeight:700},{start:0,end:6}));after.title='Must remain unchanged';const title=f.host.root.name;let writes=0;
  Object.defineProperty(f.text,'lineHeight',{get:()=>Symbol('mixed')});const segments=f.text.getStyledTextSegments;f.text.getStyledTextSegments=(fields:string[])=>segments(fields).map((s:any)=>({...s,...(fields.includes('lineHeight')?{lineHeight:{unit:'UNKNOWN'}}:{})}));
  f.slide.setPluginData=()=>writes++;f.text.setPluginData=()=>writes++;f.host.commitUndo=()=>writes++;
  await assert.rejects(()=>applyDeckToFigma(f.host,after,before),/native line height.*could not be preserved/);assert.equal(writes,0);assert.equal(f.host.root.name,title);assert.equal(f.text.characters,'Plugin connection acceptance');
});
