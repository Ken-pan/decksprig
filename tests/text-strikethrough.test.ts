import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import JSZip from 'jszip';
import {element,blankSlide,newDeck,validateDeck} from '../src/core/model';
import {applyOperations} from '../src/core/operations';
import {textRangeStylePatch} from '../src/core/text-range-format';
import {textToggleState} from '../src/core/text-properties';
import {textStylePatch} from '../src/core/text-style';
import {shapeTextElement,shapeTextPatch} from '../src/core/shape-text';
import {createTypography,runStyle} from '../src/core/typography';
import {editedTextStyle} from '../src/core/text-editing';
import {nativeTextSpans,textLayoutFingerprint,createNativeTextRendering} from '../src/core/native-text-render';
import {resolveTextElement} from '../src/core/text-layout';
import {figmaVisibleLayout} from '../src/core/native-text-layout';
import {serializeForDeck} from '../plugins/figma-export/capture';
import {setNativeText,applyDeckToFigma} from '../plugins/figma-export/native';
import {sameFigmaTextAppearance} from '../src/core/figma-sync';
import {importFigma} from '../src/importers/figma';
import {buildPptx} from '../src/core/pptx-export';
import {importPptx} from '../src/importers/pptx';

test('strikethrough formats only a Unicode range and whole-object changes clear run overrides',()=>{
 const e=element('text',{id:'text',text:'A😀B',underline:true,runs:[{text:'A😀B',italic:true,color:'#123456'}]}),s=blankSlide();s.elements=[e];const d=newDeck('Strike',[s]);
 const patch=textRangeStylePatch(e,{strikethrough:true,underline:false},{start:2,end:3});
 assert.deepEqual(patch.runs,[{text:'A',italic:true,color:'#123456'},{text:'😀',italic:true,color:'#123456',strikethrough:true,underline:false},{text:'B',italic:true,color:'#123456'}]);
 const after=applyOperations(d,[{op:'update_element',slideId:s.id,elementId:e.id,patch}],d.revision);assert.equal(after.revision,d.revision+1);assert.equal(d.slides[0].elements[0].runs![0].strikethrough,undefined);assert.equal(after.slides[0].elements[0].text,e.text);
 const restored=applyOperations(after,[{op:'update_element',slideId:s.id,elementId:e.id,patch:{runs:e.runs,underline:e.underline}}],after.revision);assert.deepEqual(restored.slides[0].elements[0],e);
 const all={...after.slides[0].elements[0],...textStylePatch(after.slides[0].elements[0],{strikethrough:true,underline:false})};assert.equal(textToggleState([all],'strikethrough'),true);assert.equal(textToggleState([all],'underline'),false);assert.equal(textToggleState([e,{...e,strikethrough:false}],'strikethrough'),false);
 const content={...all,...editedTextStyle(all,'A😀B!')};assert.equal(textToggleState([content],'strikethrough'),true);
});

test('shape labels retain strikethrough through validation without changing shape paint or geometry',()=>{
 const shape=element('rect',{shape:'hexagon',fill:'#234567',text:'Archived',x:12,y:24,w:300,h:150}),text=shapeTextElement(shape),patch=shapeTextPatch(shape,{...text,...textRangeStylePatch(text,{strikethrough:true,underline:false})});
 const s=blankSlide();s.elements=[shape];const d=newDeck('Shape',[s]),result=validateDeck(applyOperations(d,[{op:'update_element',slideId:s.id,elementId:shape.id,patch}],d.revision)).slides[0].elements[0];
 assert.equal(result.strikethrough,true);for(const key of ['type','shape','fill','x','y','w','h'] as const)assert.equal(result[key],shape[key]);assert.equal(shapeTextElement(result).strikethrough,true);
});

test('leaf typography can remove an inherited decoration and the portable factory keeps the same result',()=>{
 const base=element('text',{underline:true,strikethrough:true});assert.match(runStyle({text:'A',underline:false,strikethrough:false},base),/text-decoration:none;/);assert.match(runStyle({text:'A'},base),/text-decoration:underline line-through;/);assert.match(runStyle({text:'A',underline:false},base),/text-decoration:line-through;/);
 const portable=runInNewContext(`(${createTypography.toString()})`,{__name:(f:Function)=>f})((family:string)=>family);assert.equal(portable.runStyle({text:'A',underline:false},base),createTypography(f=>f).runStyle({text:'A',underline:false},base));
});

test('native strike capture/import retains mixed ranges and glyph caches invalidate for a strike edit',()=>{
 const common={fontName:{family:'Inter',style:'Regular'},fontSize:32,fontWeight:400,fills:[{type:'SOLID',color:{r:0,g:0,b:0}}],lineHeight:{unit:'PIXELS',value:40},letterSpacing:{unit:'PIXELS',value:0}};
 const node={id:'t',type:'TEXT',name:'Mixed',characters:'Old New',absoluteBoundingBox:{x:10,y:20,width:300,height:60},getStyledTextSegments:()=>[{...common,start:0,end:4,textDecoration:'STRIKETHROUGH'},{...common,start:4,end:7,textDecoration:'NONE'}]};
 const captured=serializeForDeck(node),e=importFigma({slides:[{id:'s',name:'Slide',absoluteBoundingBox:{x:0,y:0,width:1920,height:1080},children:[captured]}]}).slides[0].elements[0];
 assert.equal(e.strikethrough,true);assert.equal(e.runs![0].strikethrough,true);assert.equal(e.runs![1].strikethrough,false);assert.equal(textToggleState([e],'strikethrough'),'mixed');
 const plain=element('text',{text:'Plain'});plain.nativeTextLayout={fingerprint:textLayoutFingerprint(plain),runs:[{text:plain.text}]};assert(nativeTextSpans({...plain,strikethrough:false}));assert.equal(nativeTextSpans({...plain,strikethrough:true}),undefined);assert(sameFigmaTextAppearance(plain,{...plain,strikethrough:false}));assert(!sameFigmaTextAppearance(plain,{...plain,strikethrough:true}));
 const wrapped=figmaVisibleLayout('<svg><text x="0" y="32">Old New</text></svg>',e)!;assert.deepEqual(wrapped.runs.map(r=>[r.text,r.strikethrough]),[['Old ',true],['New',false]]);
});

test('native text writer applies and clears strike ranges without replacing the node or unknown motion',()=>{
 const calls:any[]=[],motion={exit:'native'},n:any=new Proxy({id:'native-text',motion},{get(target,key){if(String(key).startsWith('setRange'))return(...args:any[])=>calls.push([key,...args]);return Reflect.get(target,key);}}),e=element('text',{fontFamily:'Inter',text:'Old New',strikethrough:true,runs:[{text:'Old ',strikethrough:true},{text:'New',strikethrough:false}]});
 setNativeText(n,e,new Map([[JSON.stringify(['Inter',400,false]),{family:'Inter',style:'Regular'}]]));assert.equal(n.textDecoration,'STRIKETHROUGH');assert.deepEqual(calls.filter(v=>v[0]==='setRangeTextDecoration'),[['setRangeTextDecoration',0,4,'STRIKETHROUGH'],['setRangeTextDecoration',4,7,'NONE']]);assert.equal(n.id,'native-text');assert.equal(n.motion,motion);
});

test('native combined-decoration rejection happens before any native object mutation',async()=>{
 const s=blankSlide();s.elements=[element('text',{text:'Valid'}),element('text',{name:'Combined',text:'Bad',underline:true,strikethrough:true})];let accesses=0;const figma=new Proxy({},{get(){accesses++;throw Error('Native was accessed');}});
 await assert.rejects(()=>applyDeckToFigma(figma,newDeck('Rejected',[s])),/one decoration per character/);assert.equal(accesses,0);
 let writes=0;const n=new Proxy({},{set(){writes++;return true;}});assert.throws(()=>setNativeText(n,s.elements[1],new Map()),/one decoration per character/);assert.equal(writes,0);
 const mixed=element('text',{text:'Bad',underline:true,runs:[{text:'Bad',strikethrough:true}]});assert.throws(()=>setNativeText(n,mixed,new Map()),/one decoration per character/);assert.equal(writes,0);
 const table=blankSlide();table.elements=[element('table',{underline:true,strikethrough:true,cells:[['Unsupported']]})];await assert.rejects(()=>applyDeckToFigma(figma,newDeck('Rejected table',[table])),/one decoration per character/);assert.equal(accesses,0);
});

test('native content-only edits preserve existing strike ranges and unknown source styling',()=>{
 const prior=element('text',{text:'Old New',strikethrough:true,runs:[{text:'Old ',strikethrough:true},{text:'New',strikethrough:false}]}),after={...prior,...editedTextStyle(prior,'Old New!')},motion={exit:'native'},leading={unit:'AUTO'};let characters=prior.text,writes=0;
 const n:any=new Proxy({motion,lineHeight:leading,insertCharacters(start:number,value:string){characters=characters.slice(0,start)+value+characters.slice(start);},deleteCharacters(start:number,end:number){characters=characters.slice(0,start)+characters.slice(end);}},{set(){writes++;throw Error('A content-only edit rewrote formatting');}});
 setNativeText(n,after,new Map(),prior);assert.equal(characters,after.text);assert.equal(writes,0);assert.equal(n.motion,motion);assert.equal(n.lineHeight,leading);
});

test('PPTX preserves editable strike ranges, shape labels and whole-object truncation metadata',async()=>{
 const s=blankSlide();s.elements=[element('text',{text:'Old New',runs:[{text:'Old ',strikethrough:true},{text:'New',strikethrough:false}]}),element('rect',{text:'Archived',strikethrough:true,w:300,h:100}),element('text',{text:'Truncated strike',strikethrough:true,maxLines:1,w:500,h:80})];
 const bytes=await buildPptx(newDeck('Strike export',[s])),zip=await JSZip.loadAsync(bytes),xml=await zip.file('ppt/slides/slide1.xml')!.async('string');assert.match(xml,/strike="sngStrike"/);assert.match(xml,/strike="noStrike"/);assert.match(xml,/Archived/);
 const imported=await importPptx(bytes,'strike.pptx'),mixed=imported.slides[0].elements.find(e=>e.text==='Old New')!,runs=mixed.paragraphs![0].runs;assert.equal(runs[0].strikethrough,true);assert.equal(Boolean(runs[1].strikethrough),false);
 const truncated=imported.slides[0].elements.find(e=>e.text==='Truncated strike')!;assert.equal(truncated.maxLines,1);assert.equal(truncated.strikethrough,true);
});


test('objects without native text snapshots do not traverse their authored runs to check a cache',()=>{
 const e=element('text',{text:'Rich body'});let reads=0;Object.defineProperty(e,'runs',{get(){reads++;throw Error('Unused body traversal');}});
 assert.equal(nativeTextSpans(e),undefined);e.textSizing='auto-height';assert.equal(resolveTextElement(e,{},()=>null),e);const portable=runInNewContext(`(${createNativeTextRendering.toString()})`,{__name:(f:Function)=>f})();assert.equal(portable.nativeTextSpans(e),undefined);assert.equal(reads,0);
 const cached=element('text',{text:'Stable snapshot',runs:[{text:'Stable snapshot',fontWeight:700}]});const layout={fingerprint:textLayoutFingerprint(cached),runs:cached.runs!};cached.nativeTextLayout=layout;assert.equal(nativeTextSpans(cached),layout);assert.equal(portable.nativeTextSpans(cached),layout);assert.equal(nativeTextSpans({...cached,text:'Changed snapshot'}),undefined);assert.equal(portable.nativeTextSpans({...cached,fontSize:cached.fontSize+1}),undefined);
});
