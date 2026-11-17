import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { blankSlide, newDeck, element } from '../src/core/model';
import { applyOperations } from '../src/core/operations';

const directory=await mkdtemp(join(tmpdir(),'deck-startup-history-'));
process.env.DECK_STUDIO_DATA=directory;
const store=await import('../server/store');await store.initStore();

test('startup distinguishes empty, invalid and valid documents without rewriting sources',async()=>{
  assert.equal(await store.hasSavedDeck(),false);
  const invalid=join(store.DATA,'decks','invalid.json');await writeFile(invalid,'{preserved source');
  assert.equal(await store.hasSavedDeck(),false);
  const deck=newDeck('Saved',[blankSlide('Original')]);await store.saveDeck(deck,null);
  assert.equal(await store.hasSavedDeck(),true);
  assert.equal(await readFile(invalid,'utf8'),'{preserved source');
  await unlink(join(store.DATA,'decks',deck.id+'.json'));assert.equal(await store.hasSavedDeck(),false);
});

test('history summaries retain version order/content and still require a live document',async()=>{
  const deck=newDeck('Before',[blankSlide('Source')]);await store.saveDeck(deck,null);
  const renamed=applyOperations(deck,[{op:'rename_deck',title:'After'}]);await store.saveDeck(renamed,0);
  const noted=applyOperations(renamed,[{op:'update_slide',slideId:deck.slides[0].id,patch:{notes:'Preserved note'}}]);await store.saveDeck(noted,1);
  const entries=await store.listHistory(deck.id);
  assert.deepEqual(entries.map(e=>({revision:e.revision,title:e.title,count:e.count})),[{revision:1,title:'After',count:1},{revision:0,title:'Before',count:1}]);
  assert.equal((await store.readHistory(deck.id,0)).title,'Before');
  assert.equal((await store.readDeck(deck.id)).slides[0].notes,'Preserved note');
  await assert.rejects(store.readHistory(deck.id,-1),/Invalid revision/);
  await unlink(join(store.DATA,'decks',deck.id+'.json'));
  await assert.rejects(store.listHistory(deck.id),/ENOENT/);await assert.rejects(store.readHistory(deck.id,0),/ENOENT/);
  assert.equal(JSON.parse(await readFile(join(store.DATA,'history',deck.id+'-0.json'),'utf8')).title,'Before');
});

test('large chunked saves preserve source bytes/history and reject stale revisions before replacement',async()=>{
  const deck=newDeck('Large original',[blankSlide('Original')]);
  deck.slides[0].elements=Array.from({length:8},()=>element('image',{src:'data:image/png;base64,'+'A'.repeat(600000)}));
  await store.saveDeck(deck,null);
  const changed=applyOperations(deck,[{op:'rename_deck',title:'Saved change'}]);await store.saveDeck(changed,0);
  assert.deepEqual(await store.readHistory(deck.id,0),deck);assert.deepEqual(await store.readDeck(deck.id),changed);
  await assert.rejects(store.saveDeck({...changed,revision:2},0),{status:409});
  assert.deepEqual(await store.readDeck(deck.id),changed);assert.deepEqual(await store.readHistory(deck.id,0),deck);
});

test('history lists cap numeric revisions, ignore unrelated lookalike names and refresh changed originals',async()=>{
  const deck=newDeck('Current',[blankSlide()]);await store.saveDeck(deck,null);
  for(let revision=0;revision<55;revision++)await writeFile(join(store.DATA,'history',`${deck.id}-${revision}.json`),JSON.stringify({...deck,title:`Version ${revision}`,revision}));
  const lookalikes=['0001','9999999999999999999999999999','1.backup'];
  for(const suffix of lookalikes)await writeFile(join(store.DATA,'history',`${deck.id}-${suffix}.json`),'preserved unrelated bytes');
  const versions=await store.listHistory(deck.id);assert.equal(versions.length,50);assert.deepEqual(versions.map(v=>v.revision),Array.from({length:50},(_,i)=>54-i));
  versions[0].title='Caller mutation';assert.equal((await store.listHistory(deck.id))[0].title,'Version 54');
  await writeFile(join(store.DATA,'history',`${deck.id}-54.json`),JSON.stringify({...deck,title:'External history replacement',revision:999}));
  const external=(await store.listHistory(deck.id))[0];assert.equal(external.title,'External history replacement');assert.equal(external.revision,54);
  for(const suffix of lookalikes)assert.equal(await readFile(join(store.DATA,'history',`${deck.id}-${suffix}.json`),'utf8'),'preserved unrelated bytes');
  const live=join(store.DATA,'decks',deck.id+'.json');await writeFile(live,'{corrupt live document');
  await assert.rejects(store.listHistory(deck.id));await assert.rejects(store.readHistory(deck.id,54));
});
