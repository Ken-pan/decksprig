import test from 'node:test';
import assert from 'node:assert/strict';
import {newDeck,blankSlide,element} from '../src/core/model';
import {draftRecord} from '../src/core/drafts';
import {resolveDraft} from '../src/core/draft-resolution';
import {packDraft,restoreDraft} from '../src/core/draft-media-transport';

test('worker recovery transport retains full source/media/history and an assigned browser branch key',()=>{
  const slide=blankSlide();const image='data:image/png;base64,'+'A'.repeat(100_000);
  slide.source={provider:'PDF',fidelity:'source-render',warnings:[],render:image};slide.elements=[element('image',{src:image}),element('image',{src:image})];
  const deck=newDeck('Recovery transport',[slide]);deck.revision=4;
  const branch={...deck,title:'Other branch',revision:2},record={...draftRecord(deck,3,[branch]),id:deck.id+'@existing-tab',documentId:deck.id};
  const before=structuredClone(record),packed=packDraft(record);
  assert.deepEqual(record,before);assert.equal(packed.media.length,2);
  assert(packed.media.every(item=>item.assets.length===1&&item.references.length===3));
  const restored=restoreDraft(structuredClone(packed));assert.deepEqual(restored,before);
  const disk={...deck,title:'Saved version',revision:3};
  assert.deepEqual(resolveDraft({...restored,id:deck.id},disk),{restore:deck,conflicts:[branch]});
});

test('unique media, old records, and explicitly empty recovery arrays keep their canonical shape',()=>{
  const slide=blankSlide();slide.elements=[element('image',{src:'data:image/png;base64,'+'B'.repeat(100_000)})];
  const deck=newDeck('Unique media',[slide]);
  for(const record of [draftRecord(deck,0),{...draftRecord(deck,0),recoveries:[]}]){
    const restored=restoreDraft(structuredClone(packDraft(record)));assert.deepEqual(restored,record);
    assert.equal('recoveries' in restored,'recoveries' in record);
  }
});
