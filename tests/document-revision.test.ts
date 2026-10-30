import {z} from 'zod';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankSlide,element,newDeck,validateDeck,type Deck} from '../src/core/model';
import {applyOperations,applyImmutableOperations,type Operation} from '../src/core/operations';
import {adoptDeckRevision,takeDeckRevision,validateDeckRevision} from '../src/core/document-revision';
import {cloneDocumentData} from '../src/core/document-data';
import {DEFAULT_PAGE_ELEMENTS} from '../src/core/page-elements';
import {DEFAULT_DESIGN_SYSTEM} from '../src/core/design-system-schema';

function fixture():Deck {
  const slide=blankSlide();slide.id='first';
  slide.groups=[{id:'group',name:'Evidence'}];
  slide.elements=[element('text',{id:'text',text:'Original',textSizing:'auto-height',group:'group',runs:[{text:'Original',fontSize:20}]}),element('rect',{id:'shape',group:'group'}),element('image',{id:'image',src:'data:image/png;base64,AA=='}),element('rect',{id:'locked',locked:true})];
  slide.source={provider:'Fixture',fidelity:'native',warnings:['Original reference']};
  const other=blankSlide();other.id='second';
  const deck=newDeck('Revision fixture',[slide,other]);deck.provenance={provider:'Fixture',filename:'original.deck.json'};
  return deck;
}
const measure=(e:{w:number})=>({w:e.w,h:96});
const clean=(deck:Deck)=>({...deck,updatedAt:''});

test('adoption detaches caller data and recursively freezes the canonical revision',()=>{
  const original=fixture(),owned=adoptDeckRevision(original);
  assert.notEqual(owned,original);assert.notEqual(owned.slides[0].elements,original.slides[0].elements);
  assert(Object.isFrozen(owned));assert(Object.isFrozen(owned.slides));assert(Object.isFrozen(owned.slides[0].elements[0].runs![0]));
  original.slides[0].elements[0].text='Caller edit';assert.equal(owned.slides[0].elements[0].text,'Original');
  assert.throws(()=>owned.slides[0].elements[0].runs!.push({text:'Illegal mutation'}),TypeError);
  assert.equal(adoptDeckRevision(owned),owned);
});

test('editor ownership transfer retains canonical page and object identities',()=>{
  const original=fixture(),page=original.slides[0],text=page.elements[0],owned=takeDeckRevision(original);
  assert.equal(owned,original);assert.equal(owned.slides[0],page);assert.equal(owned.slides[0].elements[0],text);
  assert(Object.isFrozen(text));assert(Object.isFrozen(owned.provenance));
});

test('immutable transactions share unchanged pages and objects while mutable API results remain independent',()=>{
  const base=adoptDeckRevision(fixture()),next=applyImmutableOperations(base,[{op:'update_element',slideId:'first',elementId:'shape',patch:{x:500}}],0,'manual',measure);
  assert.notEqual(next.slides[0],base.slides[0]);assert.equal(next.slides[1],base.slides[1]);
  assert.equal(next.slides[0].elements[0],base.slides[0].elements[0]);assert.equal(next.slides[0].source,base.slides[0].source);assert.equal(next.provenance,base.provenance);
  assert(Object.isFrozen(next.slides[0].elements[1]));assert.equal(base.slides[0].elements[1].x,96);
  const mutable=applyOperations(next,[{op:'rename_deck',title:'Mutable result'}]);
  mutable.slides[1].notes='Independent';assert.equal(next.slides[1].notes,'');
});

test('changed metadata, removals and defaults retain complete canonical schema validation',()=>{
  const base=adoptDeckRevision(fixture()),next={...base,revision:1,provenance:undefined};
  assert.deepEqual(validateDeckRevision(base,next),validateDeck(next));
  const omitted={...base};delete omitted.provenance;
  assert.deepEqual(validateDeckRevision(base,omitted),validateDeck(omitted));
  for(const patch of [{width:99},{revision:-1},{extra:'Rejected'},{title:''}])assert.throws(()=>validateDeckRevision(base,{...base,...patch} as Deck));
  const defaulted={...base,slides:[{id:'defaults',elements:[]}] as unknown as Deck['slides']};
  assert.deepEqual(validateDeckRevision(base,defaulted),validateDeck(defaulted));
});

test('reused immutable pages still obey document-wide identities and changed page dimensions',()=>{
  const slide=blankSlide();slide.layout={margins:{left:100,right:100,top:20,bottom:20},columns:1,gutter:0};
  const base=adoptDeckRevision(newDeck('Bounds',[slide],400,300));
  assert.throws(()=>validateDeckRevision(base,{...base,slides:[base.slides[0],base.slides[0]]}),/Duplicate slide/);
  assert.throws(()=>validateDeckRevision(base,{...base,width:150}),/Margins/);
  assert.throws(()=>validateDeckRevision(base,{...base,slides:[]}),(error:unknown)=>error instanceof z.core.$ZodError&&error.issues.some(issue=>issue.code==='too_small'&&issue.minimum===1));
});

test('externally frozen roots cannot bypass validation or preserve mutable children as trusted data',()=>{
  const original=fixture();Object.freeze(original);
  const owned=adoptDeckRevision(original);assert(Object.isFrozen(owned.slides[0].elements[0]));
  original.slides[0].elements[0].text='Still mutable outside';assert.equal(owned.slides[0].elements[0].text,'Original');
  const invalid={...fixture(),unexpected:true};Object.freeze(invalid);assert.throws(()=>adoptDeckRevision(invalid));
});

test('invalid operations, measured geometry, locked objects and stale AI proposals remain atomic',()=>{
  const base=adoptDeckRevision(fixture()),before=cloneDocumentData(base);
  assert.throws(()=>applyImmutableOperations(base,[{op:'update_element',slideId:'first',elementId:'text',patch:{text:'Changed'}},{op:'delete_element',slideId:'first',elementId:'locked'}],0,'manual',measure),/locked/);
  assert.throws(()=>applyImmutableOperations(base,[{op:'update_element',slideId:'first',elementId:'text',patch:{text:'Changed'}}],0,'manual',()=>({w:100,h:Infinity})));
  assert.throws(()=>applyImmutableOperations(base,[{op:'update_element',slideId:'first',elementId:'locked',patch:{locked:false}}],0,'ai'),/locked/);
  assert.throws(()=>applyImmutableOperations(base,[{op:'rename_deck',title:'Stale'}],1,'ai'),/changed/);
  assert.deepEqual(base,before);assert(Object.isFrozen(base.slides[0].elements[0]));
});

test('immutable and full canonical paths agree through edits, hierarchy, page fields, fonts and reorders',()=>{
  let full=fixture(),immutable=adoptDeckRevision(full);
  const added=blankSlide();added.id='added';
  const batches:Operation[][]=[
    [{op:'update_element',slideId:'first',elementId:'text',patch:{fontSize:40,text:'Edited rich text'}}],
    [{op:'update_element',slideId:'first',elementId:'shape',patch:{fill:'#466653',x:220,y:400}}],
    [{op:'set_group',slideId:'first',group:{id:'parent',name:'Parent'}},{op:'set_group',slideId:'first',group:{id:'group',name:'Evidence',parent:'parent'}}],
    [{op:'add_element',slideId:'second',element:element('rect',{id:'added-object'})}],
    [{op:'reorder_elements',slideId:'first',ids:['image','text','shape','locked']}],
    [{op:'set_design_system',system:DEFAULT_DESIGN_SYSTEM,adopt:true}],
    [{op:'register_local_font',font:{family:'Fixture Font',name:'Source font',data:'data:font/woff2;base64,AA==',weight:'100 900',style:'normal'}}],
    [{op:'add_slide',slide:added,afterId:'first'}],
    [{op:'set_page_elements',settings:{...DEFAULT_PAGE_ELEMENTS,header:'{title}',hideOnCover:false}}],
    [{op:'rename_deck',title:'Renamed'}],
    [{op:'reorder_slides',ids:['second','added','first']}],
    [{op:'delete_slide',slideId:'added'}],
  ];
  const randomUUID=crypto.randomUUID;
  function deterministic<T>(run:()=>T):T {
    let count=0;crypto.randomUUID=()=>`${(++count).toString(16).padStart(8,'0')}-0000-4000-8000-000000000000`;
    try{return run();}finally{crypto.randomUUID=randomUUID;}
  }
  for(const operations of batches){
    full=deterministic(()=>applyOperations(full,operations,full.revision,'manual',measure));
    immutable=deterministic(()=>applyImmutableOperations(immutable,operations,immutable.revision,'manual',measure));
    assert.deepEqual(clean(immutable),clean(full));assert.deepEqual(validateDeck(immutable),immutable);
  }
});
