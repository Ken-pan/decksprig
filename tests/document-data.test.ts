import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloneDocumentData, sameDocumentData } from '../src/core/document-data';
import { blankSlide, element, newDeck, validateDeck } from '../src/core/model';
import { applyOperations } from '../src/core/operations';
import {  draftRecord } from '../src/core/drafts';
import {resolveDraft} from '../src/core/draft-resolution';
import { LatestWriteQueue } from '../src/core/latest-write-queue';

test('document copies isolate editable containers while preserving embedded media, typography and source data', () => {
  const slide=blankSlide('Evidence');
  slide.elements=[element('image',{src:'data:image/png;base64,'+'A'.repeat(1_000_000)}),element('text',{text:'Original',runs:[{text:'Original',bold:true}]})];
  const deck=newDeck('Snapshot',[slide]);
  const copy=cloneDocumentData(deck);
  assert.deepEqual(copy,JSON.parse(JSON.stringify(deck)));
  copy.slides[0].elements[1].runs![0].text='Changed';copy.slides[0].notes='New notes';
  assert.equal(deck.slides[0].elements[1].runs![0].text,'Original');assert.equal(deck.slides[0].notes,'');
  assert.equal(copy.slides[0].elements[0].src,deck.slides[0].elements[0].src);
  assert.deepEqual(validateDeck(copy).slides[0].elements[0],deck.slides[0].elements[0]);
});

test('optional fields retain persisted JSON semantics and shared objects remain independently editable', () => {
  const shared={value:'Kept',missing:undefined},input={a:shared,b:shared,values:[undefined,null,false,0,'']};
  const copied=cloneDocumentData(input);
  assert.deepEqual(copied,JSON.parse(JSON.stringify(input)));
  copied.a.value='Edited';assert.equal(copied.b.value,'Kept');assert.equal(input.a.value,'Kept');
  assert.equal(sameDocumentData(input,JSON.parse(JSON.stringify(input))),true);
  assert.equal(sameDocumentData({a:1,b:2},{b:2,a:1}),true);
  assert.equal(sameDocumentData({a:null},{a:undefined}),false);
  assert.equal(sameDocumentData([false,0,''],[null,null,null]),false);
  const circular:any={};circular.self=circular;assert.throws(()=>cloneDocumentData(circular),/circular/);
});

test('copy optimization retains atomic validation and immutable undo snapshots', () => {
  const slide=blankSlide('Protected'),text=element('text',{text:'Before'}),locked=element('rect',{locked:true});slide.elements=[text,locked];
  const deck=newDeck('Transaction',[slide]),before=cloneDocumentData(deck);
  assert.throws(()=>applyOperations(deck,[{op:'update_element',slideId:slide.id,elementId:text.id,patch:{text:'After'}},{op:'delete_element',slideId:slide.id,elementId:locked.id}]),/locked/);
  assert.deepEqual(deck,before);
  const after=applyOperations(deck,[{op:'update_element',slideId:slide.id,elementId:text.id,patch:{text:'After'}}]);
  assert.equal(after.slides[0].elements[0].text,'After');assert.equal(before.slides[0].elements[0].text,'Before');
  assert.throws(()=>applyOperations(after,[{op:'rename_deck',title:'Stale'}],before.revision),/changed/);
});

test('copy-on-write transactions protect frozen rich text and keep returned documents independently editable', () => {
  const slide=blankSlide('Rich text'),text=element('text',{text:'Original',fontSize:20,textSizing:'auto-height',runs:[{text:'Original',fontSize:18}],paragraphs:[{runs:[{text:'Original',fontSize:18}],lineSpacing:24,align:'left',spaceBefore:0,spaceAfter:0,indent:0,firstLineIndent:0}]});
  slide.elements=[text];const deck=newDeck('Protected',[slide,blankSlide('Untouched')]);
  function freeze(value:unknown){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}}
  freeze(deck);
  const next=applyOperations(deck,[{op:'update_element',slideId:slide.id,elementId:text.id,patch:{fontSize:40,fontFamily:'Lora'}}],0,'manual',e=>({w:e.w,h:90}));
  assert.equal(deck.slides[0].elements[0].runs![0].fontSize,18);assert.equal(deck.slides[0].elements[0].paragraphs![0].lineSpacing,24);
  assert.equal(next.slides[0].elements[0].runs![0].fontSize,36);assert.equal(next.slides[0].elements[0].h,90);
  next.slides[1].title='Editable result';assert.equal(deck.slides[1].title,'Untouched');
});

test('full final validation still rejects duplicate base slide IDs without modifying either slide', () => {
  const slide=blankSlide('Invalid duplicate');slide.elements=[element('text',{text:'Original',textSizing:'auto-height'})];
  const deck=newDeck('Base',[slide]),duplicate=cloneDocumentData(deck.slides[0]);deck.slides.push(duplicate);
  const before=cloneDocumentData(deck);
  assert.throws(()=>applyOperations(deck,[{op:'update_element',slideId:slide.id,elementId:slide.elements[0].id,patch:{text:'Changed'}}],0,'manual',e=>({w:e.w,h:130})),/Duplicate slide/);
  assert.deepEqual(deck,before);
});

test('transaction reference checks reject cyclic groups before invoking recursive text measurement', () => {
  const slide=blankSlide();slide.elements=[element('text',{id:'text',group:'a',textSizing:'auto-height'})];
  slide.groups=[{id:'a',name:'A'},{id:'b',name:'B',parent:'a'}];
  const deck=newDeck('Cycle',[slide]),before=cloneDocumentData(deck);
  let measured=false;
  assert.throws(()=>applyOperations(deck,[{op:'set_group',slideId:slide.id,group:{id:'a',name:'A',parent:'b'}},{op:'update_element',slideId:slide.id,elementId:'text',patch:{text:'Changed'}}],0,'manual',e=>{measured=true;return {w:e.w,h:80};}),/ancestors/);
  assert.equal(measured,false);assert.deepEqual(deck,before);
});

test('final canonical validation rejects invalid measured geometry and unrelated malformed base data atomically', () => {
  const slide=blankSlide();slide.elements=[element('text',{id:'text',textSizing:'auto-height'})];
  const deck=newDeck('Validation',[slide]),before=cloneDocumentData(deck);
  assert.throws(()=>applyOperations(deck,[{op:'update_element',slideId:slide.id,elementId:'text',patch:{text:'Changed'}}],0,'manual',()=>({w:100,h:Infinity})));
  assert.deepEqual(deck,before);
  (deck.slides[0].elements[0] as any).unexpected='Rejected';
  assert.throws(()=>applyOperations(deck,[{op:'rename_deck',title:'New title'}]));
  assert.equal(deck.title,'Validation');
});

test('reordering rejects duplicate and missing IDs while preserving an independently editable result', () => {
  const slide=blankSlide();slide.elements=[element('rect',{id:'a'}),element('rect',{id:'b'})];
  const deck=newDeck('Order',[slide]);
  for(const ids of [['a','a'],['a','missing']])assert.throws(()=>applyOperations(deck,[{op:'reorder_elements',slideId:slide.id,ids}]),/each existing ID/);
  const next=applyOperations(deck,[{op:'reorder_elements',slideId:slide.id,ids:['b','a']}]);
  assert.deepEqual(next.slides[0].elements.map(e=>e.id),['b','a']);
  next.slides[0].elements[0].x=42;assert.notEqual(deck.slides[0].elements[1].x,42);
});

test('draft equality preserves real branch conflicts without serializing media', () => {
  const slide=blankSlide('Draft');slide.elements=[element('text',{text:'Disk'})];const disk=newDeck('Draft',[slide]);
  const same=cloneDocumentData(disk);assert.deepEqual(resolveDraft(draftRecord(same,0),disk),{conflicts:[]});
  const changed=applyOperations(disk,[{op:'update_element',slideId:slide.id,elementId:slide.elements[0].id,patch:{text:'Local'}}]);
  assert.deepEqual(resolveDraft(draftRecord(changed,0),disk).restore,changed);
  const other=applyOperations(disk,[{op:'update_element',slideId:slide.id,elementId:slide.elements[0].id,patch:{text:'Other window'}}]);
  const resolution=resolveDraft(draftRecord(changed,0,[cloneDocumentData(changed)]),other);
  assert.equal(resolution.restore,undefined);assert.equal(resolution.conflicts?.length,1);
});

test('waiting writes coalesce by document while every caller waits for durable completion', async () => {
  const log:{id:string;revision:number}[]=[];let release!:()=>void;
  const hold=new Promise<void>(resolve=>release=resolve);
  const queue=new LatestWriteQueue<{id:string;revision:number}>(async value=>{log.push(value);if(value.revision===1)await hold;});
  const first=queue.enqueue('a',{id:'a',revision:1});await Promise.resolve();
  let latestDone=false;
  const second=queue.enqueue('a',{id:'a',revision:2});const third=queue.enqueue('a',{id:'a',revision:3}).then(()=>latestDone=true);
  const other=queue.enqueue('b',{id:'b',revision:4});const idle=queue.idle();
  assert.equal(latestDone,false);assert.deepEqual(log,[{id:'a',revision:1}]);
  release();await Promise.all([first,second,third,other,idle]);
  assert.deepEqual(log,[{id:'a',revision:1},{id:'a',revision:3},{id:'b',revision:4}]);assert.equal(latestDone,true);
});

test('same-turn backups persist the latest revision without losing caller acknowledgements', async () => {
  const saved:number[]=[];const queue=new LatestWriteQueue<number>(async value=>{saved.push(value);});
  await Promise.all(Array.from({length:20},(_,i)=>queue.enqueue('document',i)));
  assert.deepEqual(saved,[19]);await queue.idle();
});

test('failed persistence does not poison later writes or leave readers waiting', async () => {
  let release!:()=>void;const hold=new Promise<void>(resolve=>release=resolve);const saved:number[]=[];
  const queue=new LatestWriteQueue<number>(async value=>{if(value===1){await hold;throw new Error('Storage unavailable');}saved.push(value);});
  const first=queue.enqueue('document',1),failed=assert.rejects(first,/Storage unavailable/);await Promise.resolve();
  const next=queue.enqueue('document',2);release();await Promise.all([failed,next,queue.idle()]);
  assert.deepEqual(saved,[2]);await queue.enqueue('document',3);assert.deepEqual(saved,[2,3]);
});
