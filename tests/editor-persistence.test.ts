import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { compileModule } from 'svelte/compiler';
import { newDeck, blankSlide, element } from '../src/core/model';
import {beginPropertyGesture} from '../src/core/property-gesture';
import {layoutItemOperations,canAddAutoLayout} from '../src/core/group-commands';
import {createCanvasMoveScene} from '../src/core/canvas-container-move';
import {selectMovedLayers} from '../src/core/moved-layer-selection';

import type { Editor as EditorType } from '../src/core/editor.svelte';
import {clearTextSizeCache} from '../src/core/text-layout';
import {clipboardContent} from '../src/core/clipboard';

// Exercise the actual rune module in Node, with only HTTP replaced. This uses
// the same Svelte compiler as the app, without duplicating the save algorithm.
const directory=await mkdtemp(join(tmpdir(),'deck-editor-persistence-'));
const source=await readFile('src/core/editor.svelte.ts','utf8');
const javascript=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const compiled=compileModule(javascript,{generate:'client',filename:'editor.svelte.js'}).js.code
  .replace(/(from\s+|import\s*\()(['"])(\.\/[^'"]+)\2/g,(_all,prefix,quote,path)=>`${prefix}${quote}${pathToFileURL(resolve('src/core',path+'.ts')).href}${quote}`)
  .replace(/(['"])svelte\/internal\/client\1/g,()=>JSON.stringify(import.meta.resolve('svelte/internal/client')));
await writeFile(join(directory,'editor.mjs'),compiled);
const {Editor}=await import(pathToFileURL(join(directory,'editor.mjs')).href) as {Editor:new()=>EditorType};

test('property drags form one undo entry across pauses and isolate the next gesture',()=>{
  const e=new Editor(),slide=blankSlide();slide.elements=[element('rect',{id:'a',x:20})];e.deck=newDeck('Numeric gesture',[slide]);e.activeId=slide.id;e.choose('a');
  try{
    e.patch({x:30},'prop-x');
    const drag=beginPropertyGesture(e);
    drag.apply(()=>e.patch({x:40},'prop-x'));
    e.lastMergeTime=0; // A long pause must not split the pointer gesture.
    drag.apply(()=>e.patch({x:70},'prop-x'));drag.finish();
    assert.equal(e.past.length,2);assert.equal(e.selection[0].x,70);
    e.undo();assert.equal(e.selection[0].x,30);e.redo();assert.equal(e.selection[0].x,70);
    const next=beginPropertyGesture(e);next.apply(()=>e.patch({x:80},'prop-x'));next.finish();
    assert.equal(e.past.length,3);e.undo();assert.equal(e.selection[0].x,70);
  }finally{clearTimeout(e.timer);}
});

test('cancelled property drags restore the value and redo history without touching a new selection',()=>{
  const e=new Editor(),slide=blankSlide();slide.elements=[element('rect',{id:'a',x:20}),element('rect',{id:'b',x:200})];e.deck=newDeck('Cancel numeric gesture',[slide]);e.activeId=slide.id;e.choose('a');
  try{
    e.patch({x:30},'prop-x');e.undo();
    const future=e.future;
    const drag=beginPropertyGesture(e);drag.apply(()=>e.patch({x:50},'prop-x'));drag.finish(true);
    assert.equal(e.selection[0].x,20);assert.equal(e.past.length,0);assert.equal(e.future,future);e.redo();assert.equal(e.selection[0].x,30);
    const stale=beginPropertyGesture(e);e.choose('b');stale.apply(()=>e.patch({x:500},'prop-x'));stale.finish(true);
    assert.equal(e.selection[0].x,200);
  }finally{clearTimeout(e.timer);}
});

test('property gestures stop after an external revision and never roll it back',()=>{
  const e=new Editor(),slide=blankSlide();slide.elements=[element('rect',{id:'a',x:20,y:30})];e.deck=newDeck('Interrupted numeric gesture',[slide]);e.activeId=slide.id;e.choose('a');
  try{
    const drag=beginPropertyGesture(e);assert(drag.apply(()=>e.patch({x:40},'prop-x')));
    e.patch({y:90});assert.equal(drag.isCurrent(),false);
    assert.equal(drag.apply(()=>e.patch({x:80},'prop-x')),false);assert.equal(drag.finish(true),false);
    assert.equal(e.selection[0].x,40);assert.equal(e.selection[0].y,90);assert.equal(e.past.length,2);
  }finally{clearTimeout(e.timer);}
});

test('cancelling a property drag preserves a full undo stack',()=>{
  const e=new Editor(),slide=blankSlide();slide.elements=[element('rect',{id:'a',x:20})];e.deck=newDeck('Full numeric history',[slide]);e.activeId=slide.id;e.choose('a');
  try{
    for(let x=21;x<=70;x++)e.patch({x});const past=e.past;
    const drag=beginPropertyGesture(e);drag.apply(()=>e.patch({x:80},'prop-x'));assert(drag.finish(true));
    assert.equal(e.past,past);assert.equal(e.past.length,50);assert.equal(e.selection[0].x,70);
  }finally{clearTimeout(e.timer);}
});

test('batch duplicate, delete and reorder each have one undo step and restore the correct page selection',()=>{
  const e=new Editor(),slides=Array.from({length:5},(_,i)=>({...blankSlide(),notes:`Notes ${i}`,hidden:i===1,elements:[element('text',{text:`Page ${i}`,locked:true})],source:{provider:'Fixture',fidelity:'source-render' as const,render:'data:image/png;base64,AA==',warnings:[]}}));
  e.deck=newDeck('Slide actions',slides);e.chooseSlide(slides[1].id);e.selectSlide(slides[3].id,{toggle:true});e.sourceMode=true;
  const selected=[slides[1].id,slides[3].id];
  try{
    const copies=e.duplicateSlides();assert.equal(copies.length,2);assert.equal(e.deck.slides.length,7);assert.equal(e.past.length,1);assert.equal(e.deck.revision,1);assert.equal(e.sourceMode,true);
    assert.deepEqual(e.deck.slides.slice(4,6).map(s=>s.notes),['Notes 1','Notes 3']);assert.deepEqual(e.selectedSlides,copies);assert.equal(e.deck.slides[4].hidden,true);assert.equal(e.deck.slides[4].source!.render,slides[1].source.render);
    e.undo();assert.deepEqual(e.deck.slides.map(s=>s.id),slides.map(s=>s.id));assert.deepEqual(e.selectedSlides,selected);assert.equal(e.activeId,slides[3].id);
    e.redo();assert.deepEqual(e.selectedSlides,copies);assert.equal(e.activeId,copies[0]);e.undo();
    assert(e.deleteSlides());assert.equal(e.past.length,1);assert.deepEqual(e.deck.slides.map(s=>s.id),[slides[0].id,slides[2].id,slides[4].id]);assert.equal(e.activeId,slides[4].id);assert.equal(e.sourceMode,true);
    e.undo();assert.deepEqual(e.selectedSlides,selected);assert.equal(e.activeId,slides[3].id);e.redo();assert.equal(e.activeId,slides[4].id);e.undo();
    assert(e.dropSlides(selected,slides[4].id,true));assert.deepEqual(e.deck.slides.map(s=>s.id),[slides[0].id,slides[2].id,slides[4].id,...selected]);assert.deepEqual(e.selectedSlides,selected);assert.equal(e.past.length,1);assert.equal(e.sourceMode,true);
    e.undo();assert.deepEqual(e.deck.slides.map(s=>s.id),slides.map(s=>s.id));assert.deepEqual(e.selectedSlides,selected);e.redo();assert.deepEqual(e.selectedSlides,selected);
  }finally{clearTimeout(e.timer);}
});

test('slide actions reject stale IDs, stale drag revisions and deleting the entire document without partial changes',()=>{
  const e=new Editor(),slides=Array.from({length:3},()=>blankSlide());e.deck=newDeck('Guards',slides);e.chooseSlide(slides[0].id);
  try{
    const original=e.deck;e.selectAllSlides();assert.equal(e.deleteSlides(),false);assert.equal(e.deck,original);assert.equal(e.past.length,0);
    assert.deepEqual(e.duplicateSlides([slides[0].id,'stale']),[]);assert.equal(e.deck,original);
    assert.equal(e.deleteSlides([slides[0].id,'stale']),false);assert.equal(e.deck,original);
    e.commit([{op:'rename_deck',title:'New revision'}]);const revision=e.deck.revision,deck=e.deck;
    assert.equal(e.dropSlides([slides[0].id],slides[2].id,true,0),false);assert.equal(e.deck,deck);assert.equal(e.deck.revision,revision);assert.match(e.error,/document has changed/);
    assert.equal(e.dropSlides([slides[0].id],slides[0].id),false);assert.equal(e.deck,deck);
  }finally{clearTimeout(e.timer);}
});

test('multi-page clipboard paste carries hidden state, notes, nested content and fonts in one transaction',async()=>{
  const {clipboardFormats}=await import('../src/core/clipboard'),{readClipboardContent}=await import('../src/core/clipboard-codec');
  const e=new Editor(),slides=Array.from({length:3},(_,i)=>({...blankSlide(),notes:`Notes ${i}`,hidden:i===2,elements:[element('text',{text:`Page ${i}`,fontFamily:'Carried'})]}));
  e.deck=newDeck('Source',slides);e.deck.fonts=[{family:'Carried',name:'Carried',data:'data:font/woff2;base64,YQ==',weight:'400',style:'normal'}];e.chooseSlide(slides[0].id);e.selectSlide(slides[2].id,{toggle:true});
  const content=e.copySlides()!,wire=clipboardFormats(content),decoded=readClipboardContent(wire.json)!;
  const target=blankSlide();e.deck=newDeck('Target',[target]);e.chooseSlide(target.id);e.deck.fonts=[{family:'Carried',name:'Other',data:'data:font/woff2;base64,Yg==',weight:'400',style:'normal'}];
  try{
    e.pasteContent(decoded);assert.equal(e.deck.slides.length,3);assert.equal(e.past.length,1);assert.equal(e.deck.revision,1);assert.equal(e.selectedSlides.length,2);assert.equal(e.activeId,e.deck.slides[1].id);
    assert.deepEqual(e.deck.slides.slice(1).map(s=>s.notes),['Notes 0','Notes 2']);assert.equal(e.deck.slides[2].hidden,true);assert.equal(e.deck.fonts!.length,2);
    assert.match(e.deck.slides[1].elements[0].fontFamily,/Carried Copy/);assert.equal(e.deck.slides[1].elements[0].fontFamily,e.deck.slides[2].elements[0].fontFamily);
    assert.equal(content.slides![0].elements[0].fontFamily,'Carried');e.undo();assert.equal(e.deck.slides.length,1);assert.equal(e.deck.fonts!.length,1);assert.deepEqual(e.selectedSlides,[target.id]);
    e.redo();assert.equal(e.deck.slides.length,3);assert.equal(e.selectedSlides.length,2);
  }finally{clearTimeout(e.timer);}
});


test('clipboard paste distinguishes same-page copies, cross-page positions, cut moves and exact placement',()=>{
  const e=new Editor(),a=blankSlide(),b=blankSlide();a.elements=[element('rect',{id:'original',x:100,y:80,w:100,h:60})];e.deck=newDeck('Clipboard',[a,b]);e.activeId=a.id;e.choose('original');
  try{
    e.copy();e.paste();assert.equal(e.selection[0].x,124);e.undo();e.paste({inPlace:true});assert.equal(e.selection[0].x,100);e.undo();
    e.choose('original');e.copy();e.remove();e.paste();assert.equal(e.selection[0].x,100);assert.equal(e.slide!.elements.length,1);e.undo();e.undo();assert.equal(e.slide!.elements[0].id,'original');
    e.choose('original');e.copy();e.chooseSlide(b.id);e.paste();assert.equal(e.selection[0].x,100);assert.equal(e.selection[0].y,80);e.paste();assert.equal(e.selection[0].x,124);e.undo();e.undo();e.paste({point:{x:300,y:200}});assert.equal(e.selection[0].x,300);assert.equal(e.selection[0].y,200);
  }finally{clearTimeout(e.timer);}
});

test('cross-document object paste keeps source appearance and fonts and restores both with one undo',()=>{
  const e=new Editor(),source=blankSlide(),target=blankSlide();source.elements=[element('text',{id:'source-text',text:'Source',fontFamily:'Carried',fill:'#dd0000',design:{fill:'accent'},x:50,y:60})];const deck=newDeck('Source',[source]);deck.fonts=[{family:'Carried',name:'Carried',data:'data:font/woff2;base64,YQ==',weight:'400',style:'normal'}];
  const payload=clipboardContent(deck,source,{members:source.elements,groups:[],layouts:[]});e.deck=newDeck('Target',[target]);e.activeId=target.id;
  try{e.pasteContent(payload);assert.equal(e.selection[0].fill,'#dd0000');assert.equal(e.selection[0].design,undefined);assert.equal(e.selection[0].fontFamily,'Carried');assert.equal(e.deck.fonts!.length,1);assert.equal(e.past.length,1);e.undo();assert.equal(e.slide!.elements.length,0);assert.equal(e.deck.fonts,undefined);e.redo();assert.equal(e.slide!.elements.length,1);assert.equal(e.deck.fonts!.length,1);}finally{clearTimeout(e.timer);}
});

test('whole-slide clipboard preserves notes, source reference and authored styling across documents',()=>{
  const e=new Editor(),source=blankSlide();source.notes='Speaker notes';source.background='#fff0ee';source.backgroundStyle='accent';source.elements=[element('rect',{id:'source-object',fill:'#cd1234',design:{fill:'accent'},x:30,y:50})];source.source={provider:'PDF',fidelity:'converted',warnings:[],render:'data:image/png;base64,YQ=='};e.deck=newDeck('Source',[source]);e.activeId=source.id;
  const payload=e.copy(source.id)!;const target=blankSlide();e.deck=newDeck('Target',[target]);e.deck.pageElements={header:'Destination header',footer:'Destination footer',date:'Today',pageNumbers:true,numberFormat:'number',startAt:1,hideOnCover:false,divider:true};e.activeId=target.id;
  try{e.pasteContent(payload);assert.equal(e.deck.slides.length,2);assert.equal(e.activeId,e.deck.slides[1].id);assert.equal(e.slide!.notes,'Speaker notes');assert.equal(e.slide!.background,'#fff0ee');assert.equal(e.slide!.elements.length,1);assert.equal(e.slide!.elements[0].fill,'#cd1234');assert.equal(e.slide!.source!.render,source.source.render);e.undo();assert.equal(e.deck.slides.length,1);assert.equal(e.activeId,target.id);e.redo();assert.equal(e.deck.slides.length,2);assert.equal(e.slide!.notes,'Speaker notes');}finally{clearTimeout(e.timer);}
});
test('clipboard snapshots remain immutable across source edits and successive native decodes',async()=>{
  const {readClipboardContent}=await import('../src/core/clipboard-codec'),{clipboardFormats}=await import('../src/core/clipboard');
  const e=new Editor(),slide=blankSlide();slide.elements=[element('text',{id:'original',text:'Captured',x:40,y:40})];e.deck=newDeck('Snapshot',[slide]);e.activeId=slide.id;e.choose('original');
  try{const c=e.copy()!,wire=clipboardFormats(c);e.deck.slides[0].elements[0].text='Later';assert.equal(c.members[0].text,'Captured');assert(Object.isFrozen(c.members[0]));e.pasteContent(readClipboardContent(wire.json)!);assert.equal(e.selection[0].text,'Captured');assert.equal(e.selection[0].x,64);e.pasteContent(readClipboardContent(wire.json)!);assert.equal(e.selection[0].x,88);e.undo();assert.equal(e.slide!.elements.length,2);e.undo();assert.equal(e.slide!.elements[0].text,'Later');}finally{clearTimeout(e.timer);}
});
test('pasting a fully hidden group keeps it selected through undo and redo without showing its contents',async()=>{
  const e=new Editor(),slide=blankSlide();slide.groups=[{id:'hidden',name:'Hidden group'}];slide.elements=[element('rect',{id:'h1',hidden:true,group:'hidden'}),element('rect',{id:'h2',hidden:true,group:'hidden'})];e.deck=newDeck('Hidden clipboard',[slide]);e.activeId=slide.id;e.chooseGroup('hidden');
  try{e.copy();e.paste();const pasted=e.selectedContainer;assert(pasted&&pasted!=='hidden');assert.equal(e.selected.length,2);assert(e.selection.every(v=>v.hidden));e.undo();assert.equal(e.slide!.elements.length,2);assert.equal(e.selectedContainer,'hidden');e.redo();assert.equal(e.selectedContainer,pasted);assert.equal(e.selected.length,2);assert(e.selection.every(v=>v.hidden));}finally{clearTimeout(e.timer);}
});

test('notification history preserves repeated messages without changing document revisions',()=>{
  const editor=new Editor();const deck=newDeck('Notifications',[blankSlide()]);editor.deck=deck;
  for(let i=0;i<25;i++)editor.notify('Copied');
  assert.equal(editor.noticeSequence,25);assert.equal(editor.noticeHistory.length,20);
  assert.equal(editor.noticeHistory[0].id,25);assert.equal(editor.noticeHistory[1].id,24);
  editor.notify('Clipboard unavailable','warning');assert.equal(editor.noticeTone,'warning');
  editor.notice='';assert.equal(editor.noticeHistory[0].message,'Clipboard unavailable');
  assert.equal(editor.deck,deck);assert.equal(editor.deck.revision,0);assert.equal(editor.past.length,0);
});

test('slide visibility remains editable, undoable and persisted without switching the source view',async()=>{
  const editor=new Editor(),slide=blankSlide();slide.elements=[element('text',{text:'Backup evidence',locked:true})];
  slide.source={provider:'Fixture',fidelity:'source-render',render:'data:image/png;base64,AA==',warnings:[]};
  editor.deck=newDeck('Hidden page',[slide,blankSlide()]);editor.activeId=slide.id;editor.sourceMode=true;
  const original=globalThis.fetch;let saved:any;
  globalThis.fetch=async(_url,options)=>{saved=JSON.parse(String(options?.body)).deck;return new Response(JSON.stringify(saved));};
  try{
    editor.commit([{op:'update_slide',slideId:slide.id,patch:{hidden:true}}]);
    assert.equal(editor.slide!.hidden,true);assert.equal(editor.sourceMode,true);assert.equal(editor.past.length,1);
    editor.undo();assert.equal(Boolean(editor.slide!.hidden),false);assert.equal(editor.sourceMode,true);
    editor.redo();assert.equal(editor.slide!.hidden,true);assert.equal(editor.sourceMode,true);
    assert.equal(editor.slide!.elements[0].text,'Backup evidence');await editor.flush();
    assert.equal(saved.slides[0].hidden,true);assert.equal(editor.dirty,false);
  }finally{clearTimeout(editor.timer);globalThis.fetch=original;}
});

test('batch visibility is one undo step, restores mixed flags and selection, and persists only document state',async()=>{
  const e=new Editor(),slides=Array.from({length:5},()=>blankSlide());slides[1].hidden=true;
  slides[3].source={provider:'Fixture',fidelity:'source-render',render:'data:image/png;base64,AA==',warnings:[]};
  e.deck=newDeck('Batch visibility',slides);e.chooseSlide(slides[1].id);e.selectSlide(slides[3].id,{toggle:true});e.sourceMode=true;
  const ids=[slides[1].id,slides[3].id],original=globalThis.fetch;let saved:any;
  globalThis.fetch=async(_url,options)=>{saved=JSON.parse(String(options?.body)).deck;return new Response(JSON.stringify(saved));};
  try{
    assert.equal(e.setSlidesHidden(ids,true),1);assert.equal(e.deck.revision,1);assert.equal(e.past.length,1);assert.equal(e.sourceMode,true);
    assert.deepEqual(e.selectedSlides,ids);assert.deepEqual(e.deck.slides.map(s=>Boolean(s.hidden)),[false,true,false,true,false]);
    assert.equal(e.setSlidesHidden(ids,true),0);assert.equal(e.past.length,1);
    e.undo();assert.deepEqual(e.deck.slides.map(s=>Boolean(s.hidden)),[false,true,false,false,false]);assert.deepEqual(e.selectedSlides,ids);assert.equal(e.activeId,slides[3].id);assert.equal(e.sourceMode,true);
    e.redo();assert.deepEqual(e.deck.slides.map(s=>Boolean(s.hidden)),[false,true,false,true,false]);assert.deepEqual(e.selectedSlides,ids);
    assert.equal(e.setSlidesHidden(ids,false),2);assert.equal(e.past.length,2);e.undo();assert.equal(e.deck.slides[3].hidden,true);
    await e.flush();assert.equal(saved.slides[1].hidden,true);assert.equal(saved.slides[3].source.render,slides[3].source!.render);
    assert(!('selectedSlides' in saved));assert(!('slideSelectionMode' in saved));assert.equal(e.dirty,false);
  }finally{clearTimeout(e.timer);globalThis.fetch=original;}
});

test('slide selection remains distinct from active focus, prunes deleted IDs and resets on navigation',()=>{
  const e=new Editor(),slides=Array.from({length:4},()=>blankSlide());e.deck=newDeck('Selection lifecycle',slides);e.chooseSlide(slides[0].id);
  try{
    e.selectSlide(slides[2].id,{toggle:true});assert.deepEqual(e.selectedSlides,[slides[0].id,slides[2].id]);
    e.selectSlide(slides[2].id,{toggle:true});assert.deepEqual(e.selectedSlides,[slides[0].id]);assert.equal(e.activeId,slides[2].id);assert.equal(e.selectingSlides,true);
    e.beginSlideSelection();e.selectSlide(slides[0].id);assert.deepEqual([...e.selectedSlides],[]);assert.equal(e.slideSelectionMode,true);
    e.selectSlide(slides[1].id,{focusOnly:true});assert.deepEqual([...e.selectedSlides],[]);assert.equal(e.activeId,slides[1].id);
    e.selectAllSlides();e.commit([{op:'delete_slide',slideId:slides[1].id}]);assert.deepEqual(e.selectedSlides,[slides[0].id,slides[2].id,slides[3].id]);assert.equal(e.selectedSlides.length,3);
    e.undo();assert.equal(e.selectedSlides.length,4);assert.equal(e.activeId,slides[1].id);
    const revision=e.deck.revision,before=e.deck;e.setSlidesHidden([slides[0].id,'stale'],true);assert.equal(e.deck,before);assert.equal(e.deck.revision,revision);assert.match(e.error,/no longer exists/);
    e.chooseSlide(slides[3].id);assert.deepEqual(e.selectedSlides,[slides[3].id]);assert.equal(e.slideSelectionMode,false);assert.equal(e.selectingSlides,false);
  }finally{clearTimeout(e.timer);}
});

test('save failure state stays actionable until a successful retry and does not mark ordinary operation errors as save failures',async()=>{
  const editor=new Editor(), original=globalThis.fetch;editor.deck=newDeck('Original',[blankSlide()]);editor.savedRevision=0;
  let fail=true;
  globalThis.fetch=async(_url,options)=>fail?new Response('{"error":"Library unavailable"}',{status:503}):new Response(JSON.stringify(JSON.parse(String(options?.body)).deck));
  try {
    editor.commit([{op:'rename_deck',title:'Unsaved changes'}]);await editor.flush();
    assert.equal(editor.saveFailed,true);assert.equal(editor.saveState,'Not saved');assert.equal(editor.dirty,true);
    fail=false;await editor.flush();assert.equal(editor.saveFailed,false);assert.equal(editor.error,'');assert.equal(editor.dirty,false);
    editor.error='Invalid operation';assert.equal(editor.saveFailed,false);
  } finally {clearTimeout(editor.timer);globalThis.fetch=original;}
});
await rm(directory,{recursive:true});

test('measured editor views are reused and invalidated by edits, fonts, history and page changes',()=>{
  const editor=new Editor(),s=blankSlide();s.elements=[element('rect',{id:'view-a',group:'view-group',x:0,y:0,w:60,h:30}),element('rect',{id:'view-b',group:'view-group',x:200,y:0,w:60,h:30})];
  s.autoLayouts=[{id:'view-group',name:'Row',order:['view-a','view-b'],direction:'horizontal',gap:10,padding:{top:0,right:0,bottom:0,left:0},align:'start',justify:'start',columns:2,x:0,y:0,w:130,h:30,widthMode:'hug',heightMode:'hug'}];
  const second=blankSlide();editor.deck=newDeck('Cached view',[s,second]);editor.activeId=s.id;
  try{const view=editor.slide!;assert.equal(view.elements[1].x,70);assert.equal(editor.slide,view);assert.equal(editor.slide,view);clearTextSizeCache();assert.notEqual(editor.slide,view);assert.equal(editor.slide!.elements[1].x,70);
    editor.selected=['view-a'];editor.patch({w:100});assert.equal(editor.slide!.elements[1].x,110);editor.undo();assert.equal(editor.slide!.elements[1].x,70);editor.redo();assert.equal(editor.slide!.elements[1].x,110);editor.chooseSlide(second.id);assert.equal(editor.slide!.id,second.id);editor.chooseSlide(s.id);assert.equal(editor.slide!.elements[1].x,110);
  }finally{clearTimeout(editor.timer);}
});

test('the measured page cache owns only its page and fonts, and releases an empty document',()=>{
  const editor=new Editor(),slide=blankSlide();slide.elements=[element('text',{text:'Cached title',textSizing:'auto-height'})];editor.deck=newDeck('Cache ownership',[slide,blankSlide()]);
  const view=editor.slide;
  editor.deck={...editor.deck!,title:'Renamed without changing the page'};
  assert.equal(editor.slide,view);
  editor.deck={...editor.deck!,onlineFonts:[{id:'example-sans',family:'Example Sans',category:'sans',version:'1.0.0',chinese:false,weights:[400],styles:['normal'],license:'OFL-1.1',licenseNotice:'Fixture font for the cache ownership test.'}]};
  const cached=(editor as any).measuredView;void editor.slide;
  assert.notEqual((editor as any).measuredView,cached);
  assert.equal((editor as any).measuredView.onlineFonts,editor.deck.onlineFonts);
  assert(!('deck' in (editor as any).measuredView));
  editor.deck=null;assert.equal(editor.slide,undefined);assert.equal((editor as any).measuredView,undefined);
});

test('nested groups preserve descendants, selection context, independent IDs and parent orders across undo/save/paste',async()=>{
  const original=globalThis.fetch,editor=new Editor(),writes:any[]=[];
  const slide=blankSlide();slide.elements=[element('rect',{id:'nested-a',x:0,y:0,w:100,h:50}),element('rect',{id:'nested-b',x:120,y:0,w:100,h:50}),element('rect',{id:'nested-c',x:0,y:150,w:240,h:50}),element('rect',{id:'nested-hidden',x:250,y:0,w:100,h:50,hidden:true})];
  editor.deck=newDeck('Nested clipboard',[slide,blankSlide('Paste target')]);editor.activeId=slide.id;editor.selected=['nested-a','nested-b'];
  globalThis.fetch=async(_url,options)=>{writes.push(JSON.parse(options!.body as string));return new Response('{"ok":true}');};
  try{
    await editor.autoLayout();const child=editor.selectedContainer;assert(child);
    editor.commit([{op:'update_element',slideId:slide.id,elementId:'nested-hidden',patch:{group:child}}]);
    editor.selected=['nested-a','nested-b','nested-c'];editor.selectedGroup='';await editor.autoLayout();const root=editor.selectedContainer;assert(root&&root!==child);assert.equal(editor.slide!.groups!.find(g=>g.id===child)!.parent,root);
    await editor.group(false,true);const wrapper=editor.selectedContainer;assert.notEqual(wrapper,root);editor.undo();assert.equal(editor.selectedContainer,root);editor.redo();assert.equal(editor.slide!.groups!.find(g=>g.id===root)!.parent,wrapper);
    editor.copy();assert.equal(editor.clipboardGroups.length,3);assert.equal(editor.clipboard.length,4);
    editor.chooseSlide(editor.deck!.slides[1].id);editor.paste();assert.equal(editor.slide!.groups!.length,3);assert.equal(editor.slide!.autoLayouts!.length,2);assert.equal(editor.slide!.elements.length,4);assert(editor.slide!.elements.some(e=>e.hidden));assert(editor.slide!.groups!.every(g=>![root,child,wrapper].includes(g.id)));
    const copiedRoot=editor.slide!.groups!.find(g=>!g.parent)!;assert.equal(editor.selectedContainer,copiedRoot.id);
    await editor.group(true);assert.equal(editor.slide!.groups!.length,2);assert.equal(editor.slide!.autoLayouts!.length,2);editor.undo();assert.equal(editor.slide!.groups!.length,3);
    await editor.flush();assert.equal(writes.at(-1).deck.slides[1].groups.length,3);assert.equal(editor.dirty,false);
  }finally{clearTimeout(editor.timer);globalThis.fetch=original;}
});

test('a hidden container can be selected and group delete includes its hidden descendants',async()=>{
  const editor=new Editor(),slide=blankSlide();slide.elements=[element('rect',{id:'hidden-a',hidden:true,group:'hidden-group'}),element('rect',{id:'hidden-b',hidden:true,group:'hidden-group'})];editor.deck=newDeck('Hidden group',[slide]);editor.activeId=slide.id;
  try{editor.chooseGroup('hidden-group');assert.equal(editor.selectedContainer,'hidden-group');editor.copy();assert.equal(editor.clipboard.length,2);editor.remove();assert.equal(editor.slide!.elements.length,0);editor.undo();assert.equal(editor.slide!.elements.length,2);assert.equal(editor.selectedContainer,'hidden-group');}finally{clearTimeout(editor.timer);}
});

test('layer moves save both container orders and restore hierarchy and selection in one undo step',async()=>{
  const original=globalThis.fetch,editor=new Editor(),writes:any[]=[];
  const slide=blankSlide();slide.groups=[{id:'left',name:'Left'},{id:'child',name:'Child',parent:'left'},{id:'right',name:'Right'}];slide.elements=[element('rect',{id:'a',group:'left',w:50,h:40}),element('rect',{id:'b',group:'child',w:60,h:40}),element('rect',{id:'hidden',group:'child',hidden:true}),element('rect',{id:'c',group:'right',w:70,h:40})];
  const flow={direction:'horizontal' as const,gap:10,padding:{top:0,right:0,bottom:0,left:0},align:'start' as const,justify:'start' as const,columns:2,x:100,y:100,w:400,h:100,widthMode:'fixed' as const,heightMode:'fixed' as const};slide.autoLayouts=[{...flow,id:'left',name:'Left',order:['a','child']},{...flow,id:'right',name:'Right',order:['c']}];
  editor.deck=newDeck('Layer history',[slide,blankSlide()]);editor.activeId=slide.id;editor.chooseGroup('child');
  globalThis.fetch=async(_url,options)=>{writes.push(JSON.parse(options!.body as string));return new Response('{"ok":true}');};
  try{
    assert.equal(await editor.moveLayers(['child'],{target:'c',position:'before'}),true);assert.equal(editor.past.length,1);assert.equal(editor.selectedContainer,'child');assert.equal(editor.editingGroup,'right');
    assert.equal(editor.slide!.groups!.find(g=>g.id==='child')!.parent,'right');assert.deepEqual(editor.slide!.autoLayouts!.map(l=>l.order),[['a'],['child','c']]);assert(editor.slide!.elements.find(e=>e.id==='hidden')!.hidden);
    editor.undo();assert.equal(editor.slide!.groups!.find(g=>g.id==='child')!.parent,'left');assert.equal(editor.selectedContainer,'child');assert.deepEqual(editor.slide!.autoLayouts!.map(l=>l.order),[['a','child'],['c']]);
    editor.redo();assert.equal(editor.editingGroup,'right');assert.equal(editor.selectedContainer,'child');assert.equal(editor.slide!.groups!.find(g=>g.id==='child')!.parent,'right');
    await editor.flush();assert.equal(writes.at(-1).deck.slides[0].groups.find((g:any)=>g.id==='child').parent,'right');assert.equal(editor.dirty,false);
  }finally{clearTimeout(editor.timer);globalThis.fetch=original;}
});

test('a layer move rejects stale revisions, page switches and document switches before writing history',async()=>{
  const editor=new Editor(),slide=blankSlide();slide.elements=[element('rect',{id:'a'}),element('rect',{id:'b'})];editor.deck=newDeck('Stale drag',[slide,blankSlide()]);editor.activeId=slide.id;
  try{
    const revision=editor.deck.revision,deckId=editor.deck.id;editor.commit([{op:'rename_deck',title:'Newer'}]);const current=editor.deck;
    assert.equal(await editor.moveLayers(['a'],{target:'b',position:'before'},revision,slide.id,deckId),false);assert.equal(editor.deck,current);assert.equal(editor.past.length,1);assert.match(editor.error,/changed/);
    editor.chooseSlide(editor.deck!.slides[1].id);assert.equal(await editor.moveLayers(['a'],{target:'b',position:'before'},editor.deck!.revision,slide.id,deckId),false);
    editor.deck=newDeck('Another document',[slide]);editor.activeId=slide.id;const other=editor.deck;assert.equal(await editor.moveLayers(['a'],{target:'b',position:'before'},other.revision,slide.id,deckId),false);assert.equal(editor.deck,other);
  }finally{clearTimeout(editor.timer);}
});

test('a canvas drop saves hierarchy, free geometry and hidden subtree frames in one undo step',async()=>{
  const original=globalThis.fetch,editor=new Editor(),writes:any[]=[];const slide=blankSlide();slide.groups=[{id:'parent',name:'Parent'},{id:'child',name:'Child',parent:'parent'}];slide.elements=[element('rect',{id:'a',group:'child',x:100,y:100,w:80,h:50}),element('rect',{id:'hidden',group:'child',hidden:true,x:100,y:180,w:80,h:50}),element('rect',{id:'other',group:'parent',x:300,y:100,w:100,h:50})];slide.autoLayouts=[{id:'child',name:'Child',order:['a','hidden'],direction:'horizontal',gap:10,padding:{top:0,right:0,bottom:0,left:0},align:'start',justify:'start',columns:2,x:100,y:100,w:100,h:60,widthMode:'fixed',heightMode:'fixed'}];slide.autoLayouts.push({...slide.autoLayouts[0],id:'parent',name:'Parent',order:['child','other'],x:100,y:100,w:400,h:100});editor.deck=newDeck('Canvas drop',[slide]);editor.activeId=slide.id;editor.chooseGroup('child');
  globalThis.fetch=async(_url,options)=>{writes.push(JSON.parse(options!.body as string));return new Response('{"ok":true}');};
  try{const scene=createCanvasMoveScene(editor.slide!,editor.selected,editor.selectionScope),drop=scene.target({x:800,y:500},600,300);editor.commit(scene.operations(drop,600,300),'','manual',editor.deck.revision);selectMovedLayers(editor,scene.roots,drop.parent);assert.equal(editor.past.length,1);assert.equal(editor.selectedContainer,'child');assert.equal(editor.editingGroup,'');assert.equal(editor.slide!.autoLayouts!.find(l=>l.id==='child')!.x,700);assert.equal(editor.slide!.elements.find(e=>e.id==='hidden')!.y,480);editor.undo();assert.equal(editor.slide!.groups!.find(g=>g.id==='child')!.parent,'parent');assert.equal(editor.slide!.autoLayouts!.find(l=>l.id==='child')!.x,100);editor.redo();assert.equal(editor.slide!.groups!.find(g=>g.id==='child')!.parent,undefined);assert.equal(editor.slide!.autoLayouts!.find(l=>l.id==='child')!.x,700);await editor.flush();assert.equal(writes.at(-1).deck.slides[0].autoLayouts.find((l:any)=>l.id==='child').x,700);assert.equal(editor.dirty,false);}finally{clearTimeout(editor.timer);globalThis.fetch=original;}
});

test('copy, paste and undo preserve wrapped Fill members and their independent size limits',async()=>{
  const original=globalThis.fetch,editor=new Editor(),writes:any[]=[];const slide=blankSlide();slide.elements=[element('rect',{id:'fill-a',x:0,y:0,w:100,h:50}),element('rect',{id:'fill-b',x:120,y:0,w:100,h:50}),element('rect',{id:'fill-c',x:240,y:0,w:100,h:50})];editor.deck=newDeck('Adaptive copy',[slide,blankSlide('Paste target')]);editor.activeId=slide.id;editor.selected=slide.elements.map(e=>e.id);
  globalThis.fetch=async(_url,options)=>{writes.push(JSON.parse(options!.body as string));return new Response('{"ok":true}');};
  try{
    await editor.autoLayout();editor.commit([{op:'set_group_layout',slideId:slide.id,layout:{...editor.slide!.autoLayouts![0],wrap:true,lineGap:18,widthMode:'fixed',w:420}}]);editor.commit(layoutItemOperations(editor.slide!,['fill-a'],{widthMode:'fill',minWidth:80,maxWidth:200}));editor.copy();editor.duplicateSelection();const copy=editor.slide!.autoLayouts![1];assert.equal(copy.wrap,true);assert.equal(copy.lineGap,18);assert.notEqual(copy.id,editor.slide!.autoLayouts![0].id);const child=editor.slide!.elements.find(e=>e.group===copy.id&&e.layoutItem?.widthMode==='fill')!;assert.equal(child.layoutItem!.maxWidth,200);assert.equal(child.layoutItem!.minWidth,80);
    editor.undo();assert.equal(editor.slide!.autoLayouts!.length,1);editor.chooseSlide(editor.deck!.slides[1].id);editor.paste();assert.equal(editor.slide!.autoLayouts![0].wrap,true);assert.equal(editor.slide!.autoLayouts![0].lineGap,18);assert.equal(editor.slide!.elements.find(e=>e.layoutItem)?.layoutItem?.maxWidth,200);await editor.flush();assert.equal(writes.at(-1).deck.slides[1].autoLayouts[0].wrap,true);assert.equal(editor.dirty,false);
  }finally{clearTimeout(editor.timer);globalThis.fetch=original;}
});

test('auto layout persists, duplicates with independent rules, and survives undo/redo and cross-slide paste',async()=>{
  const original=globalThis.fetch,editor=new Editor(),writes:any[]=[];
  const slide=blankSlide();slide.elements=[element('rect',{id:'a',x:100,y:100,w:100,h:50}),element('rect',{id:'b',x:300,y:100,w:80,h:50})];
  editor.deck=newDeck('Auto layout',[slide,blankSlide('Paste target')]);editor.activeId=slide.id;editor.selected=['a','b'];
  globalThis.fetch=async(_url,options)=>{writes.push(JSON.parse(options!.body as string));return new Response('{"ok":true}');};
  try {
    await editor.autoLayout();const layout=editor.slide!.autoLayouts![0];assert.equal(layout.direction,'horizontal');
    editor.undo();assert(!editor.slide!.autoLayouts);editor.redo();assert.equal(editor.slide!.autoLayouts![0].id,layout.id);
    editor.copy();editor.duplicateSelection();assert.equal(editor.slide!.autoLayouts!.length,2);const duplicate=editor.slide!.autoLayouts![1];assert.notEqual(duplicate.id,layout.id);assert(duplicate.order.every(id=>!layout.order.includes(id)));
    editor.chooseSlide(editor.deck!.slides[1].id);editor.paste();assert.equal(editor.slide!.autoLayouts!.length,1);assert.equal(editor.slide!.elements.length,2);assert.notEqual(editor.slide!.autoLayouts![0].id,layout.id);
    await editor.flush();assert.equal(writes.at(-1).deck.slides[1].autoLayouts.length,1);assert.equal(editor.dirty,false);
  } finally {clearTimeout(editor.timer);globalThis.fetch=original;}
});

test('insertion into a selected auto layout joins the flow and removing it is undoable',async()=>{
  const editor=new Editor(),slide=blankSlide();slide.elements=[element('rect',{id:'a',w:100,h:50}),element('rect',{id:'b',x:300,w:100,h:50})];editor.deck=newDeck('Insertion',[slide]);editor.activeId=slide.id;editor.selected=['a','b'];
  try{await editor.autoLayout();editor.add(element('rect',{id:'c',w:100,h:50}));assert.equal(editor.slide!.autoLayouts![0].order.length,3);assert.equal(editor.slide!.elements[2].group,editor.slide!.autoLayouts![0].id);editor.remove();assert.equal(editor.slide!.autoLayouts![0].order.length,2);editor.undo();assert.equal(editor.slide!.autoLayouts![0].order.length,3);}finally{clearTimeout(editor.timer);}
});

test('a no-op flush cannot swallow an edit made in the same turn',async()=>{
  const original=globalThis.fetch,editor=new Editor(),writes:any[]=[];
  editor.deck=newDeck('Original',[blankSlide()]);editor.savedRevision=0;
  globalThis.fetch=async(_url,options)=>{writes.push(JSON.parse(options!.body as string));return new Response('{"ok":true}');};
  try {
    const idle=editor.flush();editor.commit([{op:'rename_deck',title:'New revision'}]);await Promise.all([idle,editor.flush()]);
    assert.equal(writes.length,1);assert.equal(writes[0].expectedRevision,0);assert.equal(writes[0].deck.title,'New revision');assert.equal(editor.dirty,false);
  } finally {clearTimeout(editor.timer);globalThis.fetch=original;}
});

test('concurrent flush callers share the flight and drain edits created while a save is pending',async()=>{
  const original=globalThis.fetch,editor=new Editor(),writes:any[]=[];
  let release!:()=>void,seen!:()=>void;const held=new Promise<void>(ok=>release=ok),firstSeen=new Promise<void>(ok=>seen=ok);
  editor.deck=newDeck('Original',[blankSlide()]);editor.savedRevision=0;
  globalThis.fetch=async(_url,options)=>{writes.push(JSON.parse(options!.body as string));if(writes.length===1){seen();await held;}return new Response('{"ok":true}');};
  try {
    editor.commit([{op:'rename_deck',title:'First'}]);const first=editor.flush();await firstSeen;
    editor.commit([{op:'rename_deck',title:'Latest'}]);const second=editor.flush();assert.equal(first,second);assert.equal(editor.saveState,'Saving…');
    release();await second;
    assert.deepEqual(writes.map(w=>({base:w.expectedRevision,revision:w.deck.revision,title:w.deck.title})),[{base:0,revision:1,title:'First'},{base:1,revision:2,title:'Latest'}]);
    assert.equal(editor.savedRevision,2);assert.equal(editor.dirty,false);assert.equal(editor.saveState,'Saved locally');
  } finally {release();clearTimeout(editor.timer);globalThis.fetch=original;}
});

test('a failed save cannot switch or create documents and retains the current revision',async()=>{
  const original=globalThis.fetch,editor=new Editor(),methods:string[]=[];
  editor.deck=newDeck('Original',[blankSlide()]);editor.savedRevision=0;
  globalThis.fetch=async(_url,options)=>{methods.push(options?.method||'GET');return new Response('{"error":"Revision conflict"}',{status:409});};
  try {
    editor.commit([{op:'rename_deck',title:'Unsaved branch'}]);await editor.flush();const current=editor.deck;
    await assert.rejects(editor.open('other'),/have not been saved/);
    await assert.rejects(editor.create(newDeck('Other',[blankSlide()])),/recovery draft/);
    assert.equal(editor.deck,current);assert.equal(editor.deck.title,'Unsaved branch');assert.equal(editor.savedRevision,0);assert.equal(editor.dirty,true);assert(methods.every(method=>method==='PUT'));
  } finally {clearTimeout(editor.timer);globalThis.fetch=original;}
});

test('long editing retains all 50 undo steps while sharing immutable unchanged pages and objects',()=>{
 const editor=new Editor(),slide=blankSlide('Edited page'),other=blankSlide('Original page');
 slide.elements=[element('text',{id:'edited',text:'Original'}),element('image',{id:'media',src:'data:image/png;base64,AA=='})];
 editor.deck=newDeck('History',[slide,other]);editor.activeId=slide.id;const original=editor.deck;
 try{
  for(let i=0;i<120;i++){editor.commit([{op:'update_element',slideId:slide.id,elementId:'edited',patch:{text:'Revision '+i}}]);clearTimeout(editor.timer);}
  assert.equal(editor.past.length,50);assert.equal(editor.deck!.slides[1],original.slides[1]);assert.equal(editor.deck!.slides[0].elements[1],original.slides[0].elements[1]);
  assert.equal(original.slides[0].elements[0].text,'Original');assert.equal(editor.past[0].slides[0].elements[0].text,'Revision 69');
  const latest=editor.deck;
  for(let i=0;i<50;i++)editor.undo();assert.equal(editor.deck!.slides[0].elements[0].text,'Revision 69');assert.equal(editor.future.length,50);
  for(let i=0;i<50;i++)editor.redo();assert.equal(editor.deck!.slides[0].elements[0].text,'Revision 119');assert.equal(editor.deck!.slides[1],latest!.slides[1]);assert.equal(latest!.revision,120);
  const mutable=editor.snapshot();mutable.slides[1].title='Independent export';assert.equal(editor.deck!.slides[1].title,'Original page');
 }finally{clearTimeout(editor.timer);}
});

test('revision sharing keeps reordered identities, canonical defaults and complete atomic validation',()=>{
 const editor=new Editor(),a=blankSlide('A'),b=blankSlide('B');a.elements=[element('rect',{id:'one'}),element('rect',{id:'two'})];editor.deck=newDeck('Canonical',[a,b]);editor.activeId=a.id;
 const original=editor.deck;
 try{
  editor.commit([{op:'reorder_slides',ids:[b.id,a.id]},{op:'reorder_elements',slideId:a.id,ids:['two','one']}]);
  assert.equal(editor.deck!.slides[0],original.slides[1]);assert.equal(editor.deck!.slides[1].elements[0],original.slides[0].elements[1]);
  const before=editor.deck;editor.commit([{op:'rename_deck',title:'Must roll back'},{op:'update_element',slideId:a.id,elementId:'one',patch:{opacity:2}}]);assert.equal(editor.deck,before);assert.match(editor.error,/1/);
  editor.undo();assert.deepEqual(editor.deck!.slides.map(s=>s.id),[a.id,b.id]);assert.equal(original.revision,0);
 }finally{clearTimeout(editor.timer);}
});

test('asynchronous export readers keep the captured revision while later edits remain independent',async()=>{
 const editor=new Editor(),slide=blankSlide();slide.elements=[element('text',{id:'caption',text:'Captured'})];editor.deck=newDeck('Read',[slide]);editor.activeId=slide.id;
 try{const pending=editor.readDocument();editor.commit([{op:'update_element',slideId:slide.id,elementId:'caption',patch:{text:'Latest'}}]);const read=await pending;assert.equal(read.revision,0);assert.equal(read.slides[0].elements[0].text,'Captured');assert.equal(editor.deck!.slides[0].elements[0].text,'Latest');}finally{clearTimeout(editor.timer);}
});

test('successive group paste offsets follow surviving copies across undo/redo, while Duplicate preserves the clipboard',async()=>{
 const editor=new Editor(),slide=blankSlide();slide.elements=[element('rect',{id:'a',x:100,y:100,w:100,h:50}),element('rect',{id:'b',x:240,y:100,w:80,h:50}),element('text',{id:'t',text:'Other'})];editor.deck=newDeck('Paste offsets',[slide]);editor.activeId=slide.id;editor.selected=['a','b'];
 try{
  await editor.group();const original=editor.selectedContainer;editor.copy();editor.paste();assert.equal(editor.slide!.elements.at(-2)!.x,124);const first=editor.selectedContainer;editor.paste();assert.equal(editor.slide!.elements.at(-2)!.x,148);assert.notEqual(editor.selectedContainer,first);assert.notEqual(first,original);editor.undo();editor.paste();assert.equal(editor.slide!.elements.at(-2)!.x,148);editor.undo();editor.undo();editor.redo();assert.equal(editor.slide!.elements.at(-2)!.x,124);editor.undo();editor.choose('t');editor.duplicateSelection();editor.paste();assert.equal(editor.slide!.elements.at(-2)!.type,'rect');assert.equal(editor.slide!.elements.at(-2)!.x,124);assert.equal(editor.clipboard[0].id,'a');
 }finally{clearTimeout(editor.timer);}
});
test('sorting and locking a group restore complete hidden membership and layer order in one undo step',async()=>{
 const editor=new Editor(),slide=blankSlide();slide.groups=[{id:'g',name:'Group'}];slide.elements=[element('rect',{id:'a',group:'g'}),element('rect',{id:'hidden',group:'g',hidden:true}),element('rect',{id:'b',group:'g'}),element('rect',{id:'c'})];editor.deck=newDeck('Group history',[slide]);editor.activeId=slide.id;editor.chooseGroup('g');
 try{
  editor.reorderSelection('front');assert.deepEqual(editor.slide!.elements.map(e=>e.id),['c','a','hidden','b']);editor.undo();assert.deepEqual(editor.slide!.elements.map(e=>e.id),['a','hidden','b','c']);editor.redo();editor.patch({locked:true});assert(editor.slide!.elements.filter(e=>e.group==='g').every(e=>e.locked));editor.undo();assert(editor.slide!.elements.filter(e=>e.group==='g').every(e=>!e.locked));editor.redo();assert(editor.slide!.elements.filter(e=>e.group==='g').every(e=>e.locked));const frozen=editor.deck;editor.reorderSelection('back');assert.equal(editor.deck,frozen);editor.patch({locked:false});assert(editor.slide!.elements.filter(e=>e.group==='g').every(e=>!e.locked));
 }finally{clearTimeout(editor.timer);}
});

function editingFixture(){const s=blankSlide();s.groups=[{id:'outer',name:'Outer'},{id:'child',name:'Cards',parent:'outer'}];s.elements=[element('rect',{id:'a',group:'child',x:100,y:100,w:100,h:60}),element('rect',{id:'b',group:'child',x:240,y:100,w:80,h:60}),element('text',{id:'t',group:'outer',x:100,y:240,text:'Caption'}),element('rect',{id:'hidden',group:'child',hidden:true,x:20,y:20})];const e=new Editor();e.deck=newDeck('Editing',[s,blankSlide('Paste target')]);e.activeId=s.id;return e;}
test('duplicating an entered container preserves its parent and Fill rules while paste follows the edited scope',()=>{
 const e=editingFixture();try{
  e.commit([{op:'set_group',slideId:e.activeId,group:{...e.slide!.groups!.find(g=>g.id==='child')!,layoutItem:{widthMode:'fill',heightMode:'fixed',minWidth:80}}}]);
  const sizing=e.slide!.groups!.find(g=>g.id==='child')!.layoutItem;e.enterGroup('child');e.chooseGroup('child');e.copy();e.duplicateSelection();const copy=e.selectedContainer;assert(copy&&copy!=='child');const group=e.slide!.groups!.find(g=>g.id===copy)!;assert.equal(group.parent,'outer');assert.deepEqual(group.layoutItem,sizing);assert.equal(e.slide!.elements.filter(v=>v.group===copy).length,3);
  assert.equal(e.editingGroup,'outer');e.undo();assert.equal(e.selectedContainer,'child');assert.equal(e.editingGroup,'child');assert.equal(e.slide!.groups!.length,2);e.redo();assert.equal(e.slide!.groups!.find(g=>g.id===copy)!.parent,'outer');assert.equal(e.editingGroup,'outer');
  e.enterGroup('child');e.paste();assert.equal(e.slide!.groups!.find(g=>g.id===e.selectedContainer)!.parent,'child');assert.equal(e.slide!.groups!.find(g=>g.id===e.selectedContainer)!.layoutItem,undefined);
 }finally{clearTimeout(e.timer);}
});
test('group editing persists while switching siblings, traverses one level at a time and restores edited scope on Undo',()=>{
 const e=editingFixture();try{e.choose('a');assert.equal(e.selectedContainer,'outer');assert(e.drillInto('a'));assert.equal(e.editingGroup,'outer');assert.equal(e.selectedContainer,'child');assert(e.drillInto('a'));assert.equal(e.editingGroup,'child');assert.deepEqual(e.selected,['a']);e.choose('b');assert.deepEqual(e.selected,['b']);assert.equal(e.selectionScope,'b');const before=e.slide!.elements;e.commit([{op:'update_element',slideId:e.activeId,elementId:'b',patch:{x:270}}]);e.exitGroup();assert.equal(e.editingGroup,'outer');assert.equal(e.selectedContainer,'child');e.undo();assert.equal(e.editingGroup,'child');assert.deepEqual(e.selected,['b']);assert.deepEqual(e.slide!.elements,before);e.redo();assert.equal(e.slide!.elements[1].x,270);e.exitGroup(true);assert.equal(e.editingGroup,'');assert.equal(e.selectedContainer,'outer');}finally{clearTimeout(e.timer);}
});
test('copying one visible leaf never copies hidden siblings or wraps it in ancestor groups, while scoped paste joins the current container',()=>{
 const e=editingFixture();try{e.enterGroup('child');e.choose('a');e.copy();assert.equal(e.clipboard.length,1);assert.equal(e.clipboardGroups.length,0);e.paste();const copy=e.slide!.elements.at(-1)!;assert.equal(copy.group,'child');assert.equal(copy.x,124);assert.equal(e.editingGroup,'child');e.undo();assert.equal(e.slide!.elements.length,4);e.chooseSlide(e.deck!.slides[1].id);assert.equal(e.editingGroup,'');e.paste();assert.equal(e.slide!.elements.length,1);assert(!e.slide!.elements[0].group);assert(!e.slide!.groups);e.undo();assert.equal(e.slide!.elements.length,0);e.redo();assert.equal(e.slide!.elements.length,1);}finally{clearTimeout(e.timer);}
});
test('a single visible member can move independently from its hidden locked sibling',async()=>{
 const e=editingFixture();const {moveElements}=await import('../src/core/operations');try{e.commit([{op:'update_element',slideId:e.activeId,elementId:'b',patch:{hidden:true,locked:true}}]);e.enterGroup('child');e.choose('a');const before=e.slide!.elements;e.commit(moveElements(e.operationDocument(),e.activeId,e.selected,25,15,e.selectionScope));assert.equal(e.slide!.elements[0].x,125);assert.deepEqual(e.slide!.elements.slice(1),before.slice(1));e.copy();assert.equal(e.clipboard.length,1);e.undo();assert.equal(e.slide!.elements[0].x,100);assert.equal(e.editingGroup,'child');}finally{clearTimeout(e.timer);}
});

test('cross-slide Undo/Redo returns to the page and group of the edited transaction after navigating away',()=>{
 const e=editingFixture();try{const first=e.activeId,second=e.deck!.slides[1].id;e.enterGroup('child');e.choose('b');e.commit([{op:'update_element',slideId:first,elementId:'b',patch:{x:280}}]);e.chooseSlide(second);e.undo();assert.equal(e.activeId,first);assert.equal(e.editingGroup,'child');assert.deepEqual(e.selected,['b']);e.chooseSlide(second);e.redo();assert.equal(e.activeId,first);assert.equal(e.editingGroup,'child');assert.deepEqual(e.selected,['b']);assert.equal(e.slide!.elements[1].x,280);e.copy();e.chooseSlide(second);e.paste();const copied=e.selected[0];e.chooseSlide(first);e.undo();assert.equal(e.activeId,second);assert.equal(e.slide!.elements.length,0);e.chooseSlide(first);e.redo();assert.equal(e.activeId,second);assert.deepEqual(e.selected,[copied]);assert.equal(e.slide!.elements[0].id,copied);}finally{clearTimeout(e.timer);}
});

test('group editing Select all retains direct units and insertion joins the current group with reversible membership',async()=>{
 const e=editingFixture();try{e.enterGroup('child');e.selectAll();assert.equal(e.selectedContainer,'');assert.equal(e.selectionScope,'@scope:child');e.copy();assert.equal(e.clipboardGroups.length,0);assert.equal(e.clipboard.length,2);const before=e.snapshot();e.enterGroup('child');e.add(element('rect',{id:'new-member',x:150,y:150,w:40,h:30}));assert.equal(e.slide!.elements.at(-1)!.group,'child');e.undo();assert.deepEqual(e.slide!.elements,before.slides[0].elements);assert.equal(e.editingGroup,'child');e.redo();assert.equal(e.slide!.elements.at(-1)!.group,'child');assert.equal(e.editingGroup,'child');}finally{clearTimeout(e.timer);}
});
test('adding in an auto-layout editing scope uses the chosen flow slot and history restores order and Hug bounds',async()=>{
 const e=new Editor(),s=blankSlide();s.id='s';s.groups=[{id:'g',name:'Flow'}];s.elements=[element('rect',{id:'flow-a',group:'g',x:100,y:100,w:80,h:40}),element('rect',{id:'flow-b',group:'g',x:200,y:100,w:60,h:40})];s.elements.push(element('rect',{id:'flow-hidden',group:'g',hidden:true}));s.autoLayouts=[{id:'g',name:'Flow',direction:'horizontal',gap:20,padding:{top:0,right:0,bottom:0,left:0},align:'start',justify:'start',columns:2,x:100,y:100,w:160,h:40,widthMode:'hug',heightMode:'hug',order:['flow-a','flow-b','flow-hidden']}];e.deck=newDeck('Flow',[s]);e.activeId='s';try{e.enterGroup('g');const before=e.snapshot();e.add(element('rect',{id:'flow-new',x:190,y:100,w:40,h:30}));assert.equal(e.slide!.elements.at(-1)!.group,'g');assert.deepEqual(e.slide!.autoLayouts![0].order,['flow-a','flow-new','flow-b','flow-hidden']);assert.equal(e.slide!.autoLayouts![0].w,220);e.undo();assert.deepEqual(e.slide,before.slides[0]);assert.equal(e.editingGroup,'g');e.redo();assert.deepEqual(e.slide!.autoLayouts![0].order,['flow-a','flow-new','flow-b','flow-hidden']);e.remove();assert.deepEqual(e.slide!.autoLayouts![0].order,['flow-a','flow-b','flow-hidden']);e.undo();assert.deepEqual(e.slide!.autoLayouts![0].order,['flow-a','flow-new','flow-b','flow-hidden']);}finally{clearTimeout(e.timer);}
});

test('Move out of group retains the member selection, saves once and restores its editing scope through history',async()=>{
 const e=editingFixture(),original=globalThis.fetch,writes:any[]=[];globalThis.fetch=async(_url,options)=>{writes.push(JSON.parse(options!.body as string));return new Response('{"ok":true}');};
 try{e.enterGroup('child');e.choose('b');const before=e.snapshot();assert.equal(await e.moveOutOfGroup(),true);assert.equal(e.past.length,1);assert.equal(e.editingGroup,'outer');assert.deepEqual(e.selected,['b']);assert.equal(e.selectedContainer,'');assert.equal(e.slide!.elements.find(v=>v.id==='b')!.group,'outer');assert.equal(e.slide!.elements.find(v=>v.id==='b')!.x,240);
 e.undo();assert.equal(e.editingGroup,'child');assert.deepEqual(e.selected,['b']);assert.deepEqual(e.slide,before.slides[0]);e.redo();assert.equal(e.editingGroup,'outer');assert.deepEqual(e.selected,['b']);assert.equal(e.slide!.elements.find(v=>v.id==='b')!.group,'outer');await e.flush();assert.equal(writes.at(-1).deck.slides[0].elements.find((v:any)=>v.id==='b').group,'outer');assert.equal(e.dirty,false);
 }finally{clearTimeout(e.timer);globalThis.fetch=original;}
});
test('Move to slide preserves a selected nested container and rejects a changed selection before lazy command execution',async()=>{
 const e=editingFixture();try{e.enterGroup('outer');e.chooseGroup('child');const before=e.snapshot();assert.equal(await e.moveOutOfGroup(true),true);assert.equal(e.selectedContainer,'child');assert.equal(e.editingGroup,'');for(const member of e.slide!.elements)assert.deepEqual(member,before.slides[0].elements.find(v=>v.id===member.id));assert.equal(e.slide!.groups!.find(g=>g.id==='child')!.parent,undefined);e.undo();assert.equal(e.selectedContainer,'child');assert.equal(e.editingGroup,'outer');assert.equal(e.slide!.groups!.find(g=>g.id==='child')!.parent,'outer');
 const pending=e.moveOutOfGroup();e.choose('t',false,true);const revision=e.deck!.revision;assert.equal(await pending,false);assert.equal(e.deck!.revision,revision);assert.match(e.error,/selection changed/);
 }finally{clearTimeout(e.timer);}
});


test('auto layout creation requires multiple objects or a selected group, including a one-member group',async()=>{
  const e=new Editor(),slide=blankSlide();
  slide.groups=[{id:'group',name:'Group'}];
  slide.elements=[element('rect',{id:'a'}),element('rect',{id:'b',x:200}),element('rect',{id:'child',group:'group',x:400})];
  e.deck=newDeck('Auto layout eligibility',[slide]);e.activeId=slide.id;
  try{
    e.choose('a');assert.equal(canAddAutoLayout(e.selected.length,e.selectedContainer),false);
    const revision=e.deck.revision;await e.autoLayout();
    assert.equal(e.deck.revision,revision);assert.equal(e.past.length,0);assert.equal(e.slide?.autoLayouts?.length??0,0);
    e.selected=['a','b'];assert.equal(canAddAutoLayout(e.selected.length,e.selectedContainer),true);
    await e.autoLayout();assert.equal(e.slide?.autoLayouts?.length,1);
    e.chooseGroup('group');assert.equal(e.selection.length,1);assert.equal(canAddAutoLayout(e.selected.length,e.selectedContainer),true);
    await e.autoLayout();assert(e.slide?.autoLayouts?.some(layout=>layout.id==='group'));
    e.choose('child',false,true);assert.equal(e.selectedContainer,'');assert.equal(canAddAutoLayout(e.selected.length,e.selectedContainer),false);
  }finally{clearTimeout(e.timer);}
});


test('recovery selection distinguishes same-document branches and captures the chosen copy before navigation',async()=>{
 const e=new Editor(),a=newDeck('Branch A',[blankSlide()]),b={...structuredClone(a),title:'Branch B',revision:7};
 e.recoveries=[a,b];const originals=structuredClone(e.recoveries),copies:typeof a[]=[];
 e.create=async deck=>{copies.push(deck);};
 e.recoveryIndex=1;assert.equal(e.recovery,b);await e.recoverAsCopy();
 e.recoveryIndex=0;await e.recoverAsCopy();await e.recoverAsCopy();
 assert.deepEqual(copies.map(d=>d.title),['Branch B · Recovery draft','Branch A · Recovery draft','Branch A · Recovery draft']);
 assert.equal(new Set(copies.map(d=>d.id)).size,3);assert(copies.every(d=>d.id!==a.id&&d.revision===0));
 assert.deepEqual(e.recoveries,originals);assert.deepEqual(copies[0].slides,b.slides);
 e.recoveryIndex=99;assert.equal(e.recovery,undefined);await e.recoverAsCopy();assert.equal(copies.length,3);
 let release!:()=>void;e.create=async deck=>{copies.push(deck);await new Promise<void>(resolve=>release=resolve);};
 e.recoveryIndex=1;const pending=e.recoverAsCopy();e.recoveryIndex=0;release();await pending;
 assert.equal(copies.at(-1)!.title,'Branch B · Recovery draft');assert.deepEqual(e.recoveries,originals);
});
