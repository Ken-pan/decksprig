import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createServer} from 'node:net';
import {newDeck,blankSlide,element} from '../src/core/model';
import {documentFile,readDocumentFile} from '../src/core/document-file';
import {documentMediaUpdate, MEDIA_REVISION_HEADER} from '../src/core/document-media-update';
import {readDocumentFrameBody} from '../src/core/document-frame-reader';
import {DOCUMENT_FRAME_ACCEPT,DOCUMENT_FRAME_TYPE} from '../src/core/document-frame-format.mjs';

test('a static directory read failure returns JSON before headers and leaves the resource server running', async () => {
  const directory=await mkdtemp(resolve(tmpdir(),'deck-resource-server-'));
  const reservation=createServer();await new Promise<void>(ok=>reservation.listen(0,'127.0.0.1',ok));
  const port=(reservation.address() as any).port;await new Promise<void>(ok=>reservation.close(()=>ok()));
  await mkdir(resolve(directory,'dist/resources'),{recursive:true});await writeFile(resolve(directory,'dist/index.html'),'<!doctype html><title>Fixture</title>');
  const processPath=resolve('server/index.ts');
  const child=spawn(process.execPath,['--import',import.meta.resolve('tsx'),processPath],{cwd:directory,env:{...process.env,NODE_ENV:'production',PORT:String(port),DECK_STUDIO_DATA:resolve(directory,'data')},stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',data=>stderr+=data.toString());
  try {
    await new Promise<void>((ok,no)=>{const timer=setTimeout(()=>no(new Error('Server startup timed out: '+stderr)),10000);child.stdout.on('data',data=>{if(data.toString().includes(`http://127.0.0.1:${port}`)){clearTimeout(timer);ok();}});child.once('exit',code=>{clearTimeout(timer);no(new Error(`Server exited ${code}: ${stderr}`));});});
    const response=await fetch(`http://127.0.0.1:${port}/resources/`);assert.equal(response.status,404);assert.equal((await response.json()).error,'File not found.');
    const decks=await fetch(`http://127.0.0.1:${port}/api/decks`);assert.equal(decks.status,200);assert.deepEqual(await decks.json(),[]);
    const blank=newDeck('Explicit blank',[blankSlide()]);
    const created=await fetch(`http://127.0.0.1:${port}/api/decks`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(blank)});assert.equal(created.status,200);
    const opened=await fetch(`http://127.0.0.1:${port}/api/decks/${blank.id}`);assert.equal(opened.status,200);assert.deepEqual(await opened.json(),blank);
    const invalid=await fetch(`http://127.0.0.1:${port}/api/decks`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...blank,id:'invalid-copy',title:''})});assert.equal(invalid.status,400);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/decks/invalid-copy`)).status,404);
    const badSave=await fetch(`http://127.0.0.1:${port}/api/decks/${blank.id}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({deck:{...blank,revision:1,width:-1},expectedRevision:0})});assert.equal(badSave.status,400);
    assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/api/decks/${blank.id}`)).json(),blank);
    const missing=await fetch(`http://127.0.0.1:${port}/api/decks/${blank.id}`,{method:'PUT',headers:{'content-type':'application/json'},body:'{}'});assert.equal(missing.status,400);
    const shared=newDeck('Compact transport',[blankSlide()]);shared.slides[0].elements=Array.from({length:6},()=>element('image',{src:'data:image/png;base64,'+'A'.repeat(100000)}));
    const base=`http://127.0.0.1:${port}/api/decks`,headers={'content-type':'application/json',Prefer:'return=minimal'};
    const compactCreated=await fetch(base,{method:'POST',headers,body:JSON.stringify(documentFile(shared))});assert.equal(compactCreated.status,200);assert.equal((await compactCreated.json()).id,shared.id);
    assert.deepEqual(await(await fetch(base+'/'+shared.id)).json(),shared);
    const changed={...shared,title:'Updated',revision:1},save=await fetch(base+'/'+shared.id,{method:'PUT',headers,body:JSON.stringify({deck:documentFile(changed),expectedRevision:0})});assert.equal(save.status,200);
    const current=await(await fetch(base+'/'+shared.id,{headers:{Accept:'application/vnd.deck-studio+json'}})).json();assert.deepEqual(readDocumentFile(current),changed);
    const history=await(await fetch(base+'/'+shared.id+'/history/0',{headers:{Accept:'application/vnd.deck-studio+json'}})).json();assert.deepEqual(readDocumentFile(history),shared);
    const stale=await fetch(base+'/'+shared.id,{method:'PUT',headers,body:JSON.stringify({deck:documentFile({...changed,revision:2}),expectedRevision:0})});assert.equal(stale.status,409);
    const bad=JSON.parse(JSON.stringify(documentFile({...changed,revision:2})));bad.references[0].asset=99;
    assert.equal((await fetch(base+'/'+shared.id,{method:'PUT',headers,body:JSON.stringify({deck:bad,expectedRevision:1})})).status,400);
    assert.deepEqual(await(await fetch(base+'/'+shared.id)).json(),changed);

    // Reuse both source and editable images across moves, while uploading only
    // genuinely new media and validating the completed document normally.
    const first = blankSlide();
    const second = blankSlide();
    const image = (letter: string) => 'data:image/png;base64,' + letter.repeat(100_000);
    first.source = {provider:'PDF',render:image('B'),fidelity:'source-render',warnings:[]};
    first.elements = [element('image',{src:image('C')})];
    second.elements = [element('image',{src:image('D')}),element('image',{src:image('F')})];
    const previous = newDeck('Reuse media', [first,second]);
    assert.equal((await fetch(base,{method:'POST',headers,body:JSON.stringify(previous)})).status,200);
    const url = base + '/' + previous.id;
    const snapshot = await fetch(url);
    const token = snapshot.headers.get(MEDIA_REVISION_HEADER);
    assert.ok(token);
    assert.deepEqual(await snapshot.json(),previous);
    const next = {...previous,revision:1,slides:[
      {...second,elements:[{...second.elements[0],src:image('E')}]},
      {...first,elements:[element('image',{src:image('C')}),first.elements[0]]},
    ]};
    const patch = documentMediaUpdate(next,{deck:previous,token});
    assert.ok(patch);
    assert.equal(patch.assets.filter(asset=>typeof asset === 'string').length,1);
    const put = (deck:unknown,expectedRevision:number) => fetch(url,{
      method:'PUT',headers:{...headers,[MEDIA_REVISION_HEADER]:'request'},
      body:JSON.stringify({deck,expectedRevision}),
    });
    const forged = structuredClone(patch);
    forged.assets[0] = {slide:499,element:-1,field:'render'};
    assert.equal((await put(forged,0)).status,400);
    const saved = await put(patch,0);
    assert.equal(saved.status,200);
    const receipt = await saved.json();
    const reopened = await fetch(url);
    assert.equal(reopened.headers.get(MEDIA_REVISION_HEADER),receipt.mediaToken);
    assert.notEqual(receipt.mediaToken,token);
    assert.deepEqual(await reopened.json(),next);
    assert.deepEqual(await (await fetch(url+'/history/0')).json(),previous);
    assert.equal((await put(patch,0)).status,409);

    const third = {...next,revision:2,title:'After storage format changed'};
    const pending = documentMediaUpdate(third,{deck:next,token:receipt.mediaToken});
    assert.ok(pending);
    const migrated = await fetch(`http://127.0.0.1:${port}/api/storage`,{method:'POST',headers,body:JSON.stringify({operation:'migrate'})});
    assert.equal(migrated.status,200);
    assert.deepEqual((await migrated.json()).errors,[]);
    assert.equal((await put(pending,1)).status,412);
    assert.deepEqual(await (await fetch(url)).json(),next);
    assert.equal((await fetch(url+'/history/1')).status,404);
    const retried = await put(documentFile(third),1);
    assert.equal(retried.status,200);
    const retryReceipt = await retried.json();
    const fourth = {...third,revision:3,title:'Reuse in compact storage'};
    const compactPatch = documentMediaUpdate(fourth,{deck:third,token:retryReceipt.mediaToken});
    assert.ok(compactPatch);
    assert.equal((await put(compactPatch,2)).status,200);
    assert.deepEqual(await (await fetch(url)).json(),fourth);
    assert.deepEqual(await (await fetch(url+'/history/2')).json(),third);
    const wire=()=>fetch(url,{headers:{Accept:DOCUMENT_FRAME_ACCEPT}});
    const hydrate=(res:Response)=>readDocumentFrameBody(res.body!,bytes=>Buffer.from(bytes).toString('base64'));
    const streamed=await wire();
    assert.equal(streamed.headers.get('Content-Type'),DOCUMENT_FRAME_TYPE);
    assert.deepEqual(readDocumentFile(await hydrate(streamed)),fourth);
    const latest=await fetch(url);
    assert.equal(streamed.headers.get(MEDIA_REVISION_HEADER),latest.headers.get(MEDIA_REVISION_HEADER));
    await latest.body?.cancel();
    const manifestPath=resolve(directory,'data/decks',previous.id+'.json');
    const untouched=await readFile(manifestPath);
    const stored=JSON.parse(untouched.toString());
    const asset=resolve(directory,'data/storage-v1/assets',stored.assets.at(-1)+'.json');
    const originalMedia=await readFile(asset);
    try{
      await writeFile(asset,Buffer.concat([Buffer.from(' \n'),originalMedia,Buffer.from('\t')]));
      assert.deepEqual(readDocumentFile(await hydrate(await wire())),fourth);
      await writeFile(asset,JSON.stringify('data:image/png;base64,'+'A'.repeat(100_000)));
      const damaged=await wire();
      assert.equal(damaged.headers.get('Content-Type'),DOCUMENT_FRAME_TYPE);
      await assert.rejects(hydrate(damaged));
      assert.equal((await fetch(url)).status,400);
      assert.deepEqual(await readFile(manifestPath),untouched);
    }finally{await writeFile(asset,originalMedia);}
    assert.deepEqual(readDocumentFile(await hydrate(await wire())),fourth);
    assert(!stderr.includes('ERR_HTTP_HEADERS_SENT'));
  } finally { child.kill('SIGTERM');await new Promise<void>(ok=>{if(child.exitCode!==null)ok();else child.once('exit',()=>ok());});await rm(directory,{recursive:true,force:true}); }
});
