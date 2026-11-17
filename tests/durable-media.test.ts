import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,rm,readdir,unlink} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {newDeck,blankSlide,element} from '../src/core/model';import {readStreamingJson} from '../server/stream-document-json';import {readDeckForSave,readDeckStorage,setStorageMode,writeDeckHistory,writeDeckStorage,withStorageLock} from '../server/media-storage';import {migrateLocalStorage,rollbackLocalStorage} from '../server/storage-maintenance';

const fixture=()=>{const slide=blankSlide('Original title'),src='data:image/png;base64,'+'AQID'.repeat(20000);slide.source={provider:'PDF',render:src,fidelity:'source-render',warnings:['Preserve original']};slide.notes='Notes 中文 🐈';slide.elements=[element('image',{src,crop:{left:.1,top:0,right:.05,bottom:0}}),element('image',{src})];const d=newDeck('Original',[slide]);d.fonts=[{family:'Original',name:'owned.woff2',data:'data:font/woff2;base64,AQID',weight:'400',style:'normal'}];d.provenance={provider:'PPTX',filename:'original.pptx'};return d;};
test('incremental JSON matches JSON.parse at UTF8/escape boundaries, duplicate keys and invalid tails',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'deck-stream-'));try{const path=join(dir,'x.json');
 for(const value of [{a:'x'.repeat(65520)+'中文🐈\\"\n\ud800',b:[1,-.5e23,true,false,null]},JSON.parse('{"__proto__":{"safe":true},"a":1,"a":2}'),[{},[],null]]){const text=JSON.stringify(value);await writeFile(path,text+' '.repeat(140000));assert.deepEqual(await readStreamingJson(path),JSON.parse(text));}
 for(const text of ['{"a":1} {"b":2}','[1,]','{"a":','{"x":"\\uZZZZ"}','01']){await writeFile(path,text);await assert.rejects(readStreamingJson(path));}
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('migration shares media across documents/history, byte-restores originals, and keeps post-migration edits on rollback',async()=>{
 const root=await mkdtemp(join(tmpdir(),'deck-durable-'));try{await mkdir(join(root,'decks'));await mkdir(join(root,'history'));const deck=fixture(),original=' \n'+JSON.stringify(deck,null,2)+'\n',path=join(root,'decks',deck.id+'.json');await writeFile(path,original);await writeFile(join(root,'history',deck.id+'-0.json'),JSON.stringify(deck));
 const result=await migrateLocalStorage(root);assert.equal(result.converted,2);assert.deepEqual(result.errors,[]);assert.equal((await readdir(join(root,'storage-v1/assets'))).length,1);assert.deepEqual(await readDeckStorage(path,root),deck);assert(result.activeBytes<Buffer.byteLength(original));
 const rollback=await rollbackLocalStorage(root);assert.equal(rollback.byteExactSnapshots,2);assert.equal(await readFile(path,'utf8'),original);
 await migrateLocalStorage(root);const next={...deck,title:'Latest retained edit',revision:1};await withStorageLock(root,()=>writeDeckStorage(path,next,root));const restored=await rollbackLocalStorage(root);assert.deepEqual(restored.errors,[]);assert.deepEqual(JSON.parse(await readFile(path,'utf8')),next);assert.equal((await readDeckStorage(path,root)).title,next.title);
 const again=await migrateLocalStorage(root);assert.deepEqual(again.errors,[]);assert.deepEqual(await readDeckStorage(path,root),next);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('interrupted conversion is resumable and damaged assets never overwrite the rollback snapshot',async()=>{
 const root=await mkdtemp(join(tmpdir(),'deck-interrupt-'));try{await mkdir(join(root,'decks'));await mkdir(join(root,'history'));const d=fixture(),path=join(root,'decks',d.id+'.json');await writeFile(path,JSON.stringify(d));await writeFile(join(root,'history',d.id+'-0.json'),JSON.stringify(d));
 await assert.rejects(migrateLocalStorage(root,()=>{},1),/interruption/);assert.deepEqual(await readDeckStorage(path,root),d);const resumed=await migrateLocalStorage(root);assert.deepEqual(resumed.errors,[]);
 const asset=(await readdir(join(root,'storage-v1/assets')))[0];await writeFile(join(root,'storage-v1/assets',asset),'"damaged"');await assert.rejects(readDeckStorage(path,root),/damaged/);const rollback=await rollbackLocalStorage(root);assert.deepEqual(rollback.errors,[]);assert.deepEqual(JSON.parse(await readFile(path,'utf8')),d);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('compact history reuses validated media, rechecks mutations and retains removed images', async () => {
 const root = await mkdtemp(join(tmpdir(),'deck-revision-media-'));
 try {
   const original=fixture(),current=join(root,'decks',original.id+'.json'),history=join(root,'history',original.id+'-0.json');
   await withStorageLock(root,async()=>{
     await setStorageMode(root,'compact');
     await writeDeckStorage(current,original,root);
     const before = await readFile(current,'utf8');
     const loaded = await readDeckForSave(current,root);
     assert.ok(loaded?.snapshot);
     const directory=join(root,'storage-v1','assets');
     const [name]=await readdir(directory),path=join(directory,name);
     const content=await readFile(path,'utf8');
     await writeFile(path,content.replace('AQID','BAUG'));
     await assert.rejects(writeDeckHistory(history,loaded.deck,root,loaded.snapshot),/media asset is damaged/);
     await assert.rejects(readFile(history),{code:'ENOENT'});
     assert.equal(await readFile(current,'utf8'),before);
     await unlink(path);
     await assert.rejects(readDeckForSave(current,root),{code:'ENOENT'});
     await writeDeckHistory(history,loaded.deck,root,loaded.snapshot);
     assert.equal(await readFile(path,'utf8'),content);
     const replacement=blankSlide('New slide');
     replacement.elements=[element('image',{src:'data:image/png;base64,'+'BAUG'.repeat(20000)})];
     const updated={...original,revision:1,slides:[replacement]};
     await writeDeckStorage(current,updated,root,false,undefined,loaded.snapshot);
     assert.equal((await readdir(directory)).length,2);
     assert.deepEqual(await readDeckStorage(current,root),updated);
     assert.deepEqual(await readDeckStorage(history,root),original);
   });
 } finally { await rm(root,{recursive:true,force:true}); }
});

test('compact media checks accept equivalent JSON encodings and require the canonical digest',async()=>{
 const root=await mkdtemp(join(tmpdir(),'deck-media-encoding-'));
 try{
   const deck=fixture(),document=join(root,'decks',deck.id+'.json');
   await setStorageMode(root,'compact');
   await writeDeckStorage(document,deck,root);
   const raw=JSON.parse(await readFile(document,'utf8')),id=raw.assets[0];
   const assets=join(root,'storage-v1','assets'),path=join(assets,id+'.json');
   const canonical=await readFile(path,'utf8');
   for(const body of [' \n'+canonical+'\t',canonical.replace('AQID','\\u0041QID')]){
     await writeFile(path,body);
     assert.deepEqual(await readDeckStorage(document,root),deck);
     assert.deepEqual((await readDeckForSave(document,root))?.deck,deck);
     const wrongId=createHash('sha256').update(body).digest('hex');
     await writeFile(join(assets,wrongId+'.json'),body);
     await writeFile(document,JSON.stringify({...raw,assets:[wrongId]}));
     await assert.rejects(readDeckStorage(document,root),/missing or damaged/);
     await writeFile(document,JSON.stringify(raw));
   }
   await writeFile(path,canonical.replace('AQID','BAUG'));
   await assert.rejects(readDeckForSave(document,root),/missing or damaged/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('preparing a browser recovery record preserves frozen editor-owned source images',async()=>{
 const {prepareBrowserRecord}=await import('../src/core/browser-media-store');const d=fixture(),source=d.slides[0].source!.render;Object.freeze(d.slides[0].source);for(const e of d.slides[0].elements)Object.freeze(e);Object.freeze(d.slides[0]);Object.freeze(d.slides);Object.freeze(d);
 const prepared=await prepareBrowserRecord({id:d.id,deck:d,baseRevision:0,savedAt:Date.now()});assert(prepared.media.size>0);assert.equal(d.slides[0].source!.render,source);assert.equal(d.slides[0].elements[0].src,source);
});
