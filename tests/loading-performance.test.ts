import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, unlink, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { initializeWorkspace,workspaceEntryId,workspaceDocumentURL,workspaceTemplateId } from '../src/core/workspace-startup';
import { slideFontFamilies } from '../src/core/font-loading';
import { blankSlide, element, newDeck } from '../src/core/model';
import { applyOperations } from '../src/core/operations';
import { serveStatic, preferredEncodings } from '../server/static';

test('default entry never restores a document, while document and resource links are explicit', () => {
  assert.equal(workspaceEntryId('', 'previous'), null);
  assert.equal(workspaceEntryId('?document=chosen', 'previous'), 'chosen');
  assert.equal(workspaceEntryId('?document=', 'previous'), null);
  assert.equal(workspaceEntryId('?library=blue-black', 'previous'), 'previous');
  assert.equal(workspaceEntryId('?library=unknown', 'previous'), null);
  assert.equal(workspaceEntryId('?document=chosen&library=blue-black', 'previous'), 'chosen');
  assert.equal(workspaceDocumentURL('https://example.com/app?document=old&x=1#slide', 'doc:two'), '/app?document=doc%3Atwo&x=1#slide');
});

test('template links name a known collection and never replace an explicit document', () => {
  const ids = ['portfolio', 'review'];
  assert.equal(workspaceTemplateId('?template=review', ids), 'review');
  assert.equal(workspaceTemplateId('?template=unknown', ids), null);
  assert.equal(workspaceTemplateId('?template=', ids), null);
  assert.equal(workspaceTemplateId('?template=review&document=chosen', ids), null);
  assert.equal(workspaceTemplateId('', ids), null);
});

test('startup opens only an explicit document without listing the library', async () => {
  const calls: string[] = [];
  await initializeWorkspace({activeId:'active', open:async id => {calls.push(id);}});
  await initializeWorkspace({activeId:null, open:async id => {calls.push(id);}});
  assert.deepEqual(calls,['active']);
});

test('missing document returns to the chooser and conflict/draft failures stay visible', async () => {
  const opened: string[] = [];
  await initializeWorkspace({activeId:'deleted', open:async id => {opened.push(id);throw Object.assign(new Error('Deleted'),{status:404});}});
  assert.deepEqual(opened,['deleted']);
  for (const status of [409,500,undefined]) {
    await assert.rejects(initializeWorkspace({activeId:'protected',open:async()=>{throw Object.assign(new Error('Preserve current state'),{status});}}),/Preserve/);
  }
});

test('font discovery retains rich text families and excludes hidden/media defaults', () => {
  const slide=blankSlide('Fonts');
  slide.elements=[element('text',{fontFamily:'Manrope',runs:[{text:'A',fontFamily:'Inter'}]}),element('text',{fontFamily:'Bodoni Moda',paragraphs:[{runs:[{text:'B',fontFamily:'Lora'}],align:'left',spaceBefore:0,spaceAfter:0,indent:0,firstLineIndent:0}]}),element('image',{fontFamily:'Unused'}),element('text',{hidden:true,fontFamily:'Hidden'}),element('table',{fontFamily:'Noto Sans SC'})];
  assert.deepEqual(slideFontFamilies(slide),['Manrope','Inter','Bodoni Moda','Lora','Noto Sans SC']);
});

test('library metadata cache invalidates after saves, external atomic replacement and deletion', async () => {
  process.env.DECK_STUDIO_DATA=await mkdtemp(join(tmpdir(),'deck-loading-store-'));
  const store=await import('../server/store');await store.initStore();
  const deck=newDeck('Cache fixture',[blankSlide('First')]);
  await store.saveDeck(deck,null);
  const summaries=await store.listDecks(false);assert.equal(summaries[0].title,'Cache fixture');assert.equal('firstSlide' in summaries[0],false);
  const previews=await store.listDecks();previews[0].firstSlide!.title='Caller mutation';
  assert.equal((await store.listDecks())[0].firstSlide!.title,'First');
  const updated=applyOperations(deck,[{op:'update_slide',slideId:deck.slides[0].id,patch:{notes:'Saved'}}]);
  await store.saveDeck(updated,0);assert.equal((await store.listDecks())[0].firstSlide!.notes,'Saved');
  const path=join(store.DATA,'decks',deck.id+'.json');
  const original=JSON.parse(await readFile(path,'utf8'));original.title='External edit';
  await writeFile(path+'.replacement',JSON.stringify(original));await rename(path+'.replacement',path);
  assert.equal((await store.listDecks(false))[0].title,'External edit');
  assert.equal((await store.readDeck(deck.id)).revision,updated.revision);
  await unlink(path);assert.deepEqual(await store.listDecks(),[]);
});

test('production assets negotiate gzip, validate cache and never serve stale compressed content', async () => {
  assert.deepEqual(preferredEncodings('br;q=0, gzip;q=0.8'),['gzip']);
  assert.deepEqual(preferredEncodings('gzip;q=1,br;q=.5'),['gzip','br']);
  const directory=await mkdtemp(join(tmpdir(),'deck-static-'));
  const path=join(directory,'sample.css'),body='body{color:green}'.repeat(200);
  await writeFile(path,body);await writeFile(path+'.gz',gzipSync(body));
  const server=createServer((req,res)=>{void serveStatic(req,res,path).catch(()=>{res.writeHead(500);res.end();});});
  await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));
  const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  try {
    const response=await fetch(url,{headers:{'Accept-Encoding':'gzip'}});
    assert.equal(response.headers.get('content-encoding'),'gzip');assert.equal(await response.text(),body);
    assert.equal(response.headers.get('vary'),'Accept-Encoding');assert.equal(response.headers.get('cache-control'),'no-cache');
    const cached=await fetch(url,{headers:{'Accept-Encoding':'gzip','If-None-Match':response.headers.get('etag')!}});
    assert.equal(cached.status,304);assert.equal(await cached.text(),'');
    const identity=await fetch(url,{headers:{'Accept-Encoding':'gzip;q=0,br;q=0'}});
    assert.equal(identity.headers.get('content-encoding'),null);assert.equal(await identity.text(),body);
    await writeFile(path,'updated stylesheet');
    const changed=await fetch(url,{headers:{'Accept-Encoding':'gzip','If-None-Match':response.headers.get('etag')!}});
    assert.equal(changed.status,200);assert.equal(changed.headers.get('content-encoding'),null);assert.equal(await changed.text(),'updated stylesheet');
    const head=await fetch(url,{method:'HEAD'});assert.equal(await head.text(),'');assert.equal(head.headers.get('content-length'),String('updated stylesheet'.length));
  } finally { await new Promise<void>(ok=>server.close(()=>ok())); }
});
