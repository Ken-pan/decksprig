import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, access, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {brotliCompressSync} from 'node:zlib';
import {buildLocalRuntime} from '../scripts/build-local-runtime.mjs';
import {runtimePublicAssets, writeRuntimeFontManifest} from '../scripts/public-assets.mjs';
import {distributionOutput, exportSources, freshOutput} from '../scripts/distribution.mjs';

const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
async function put(root: string, path: string, bytes: Uint8Array | string) {
  await mkdir(join(root, path, '..'), {recursive:true});await writeFile(join(root,path),bytes);
}
async function fixture(root: string) {
  const payload=Buffer.alloc(64);payload.writeUInt32LE(64,0);payload.writeUInt16LE(0x504c,34);
  const face={family:'Fixture',style:'regular',weight:400,file:'/fonts/pptx/fixture.fntdata',ttf:'/fonts/pptx/fixture.ttf',license:'/fonts/pptx/fixture-OFL.txt',fsType:0,sha256:sha(payload),sourceHashes:{'public/fonts/fixture/source.woff2':sha('source font')}};
  await put(root,'public/fonts/pptx/manifest.json',JSON.stringify([face]));
  await put(root,'public/fonts/pptx/fixture.fntdata',payload);
  await put(root,'public/fonts/pptx/fixture.ttf','original full TTF');
  await put(root,'public/fonts/pptx/fixture.ttf.br','source sidecar');
  await put(root,'public/fonts/pptx/fixture-OFL.txt','source license');
  await put(root,'public/fonts/fixture/source.woff2','source font');
  await put(root,'public/fonts/fixture/OFL.txt','original license');
  await put(root,'public/fonts/fixture.css','runtime font CSS');
  await put(root,'public/fonts/document.ttf','required runtime TTF');
  await put(root,'public/website/hero.png','original website art');
  await put(root,'public/examples/template-assets/originals/source.png','original provenance asset');
  await put(root,'src/core/font-catalog.json',JSON.stringify([{family:'Fixture',css:'/fonts/fixture.css',license:'/fonts/fixture/OFL.txt'}]));
  for (const path of ['scripts/build-template-fonts.py','LICENSE','ASSET_LICENSES.md','THIRD_PARTY_NOTICES.md']) await put(root,path,'retained source');
  return face;
}

test('app distribution separates website/source TTF but retains offline font payloads, licenses, runtime TTF and original template links',async t=>{
  const root=await mkdtemp(join(tmpdir(),'deck-split-assets-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const face=await fixture(root),before=await readFile(join(root,'public/fonts/pptx/manifest.json'),'utf8');
  const plugin=runtimePublicAssets();plugin.configResolved({root,build:{outDir:'app'}});await plugin.closeBundle();
  for(const path of ['website','fonts/pptx/fixture.ttf','fonts/pptx/fixture.ttf.br'])await assert.rejects(access(join(root,'app',path)));
  for(const path of ['fonts/pptx/fixture.fntdata','fonts/pptx/fixture-OFL.txt','fonts/document.ttf','examples/template-assets/originals/source.png'])await access(join(root,'app',path));
  const manifest=JSON.parse(await readFile(join(root,'app/fonts/pptx/manifest.json'),'utf8'));
  assert.equal(manifest[0].sha256,face.sha256);assert(!('ttf' in manifest[0]));assert(!('sourceHashes' in manifest[0]));
  assert.equal(await readFile(join(root,'public/fonts/pptx/manifest.json'),'utf8'),before);
  assert.equal(await readFile(join(root,'public/website/hero.png'),'utf8'),'original website art');
  await writeFile(join(root,'app/fonts/pptx/fixture.fntdata'),'corruption');
  await assert.rejects(writeRuntimeFontManifest(join(root,'public'),join(root,'app')),/integrity/);
});

test('source packages retain the exact original manifest, hashed inputs, TTF and licenses and reject inconsistent source hashes',async t=>{
  const root=await mkdtemp(join(tmpdir(),'deck-export-sources-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await fixture(root);const output=join(root,'output/sources');
  const report=await exportSources(root,output);
  assert.equal(report.kind,'export-sources');
  assert.deepEqual(await readFile(join(output,'public/fonts/pptx/manifest.json')),await readFile(join(root,'public/fonts/pptx/manifest.json')));
  assert.equal(await readFile(join(output,'public/fonts/pptx/fixture.ttf'),'utf8'),'original full TTF');
  assert.equal(report.files['public/fonts/fixture/source.woff2'].sha256,sha('source font'));
  await assert.rejects(exportSources(root,output),{code:'EEXIST'});
  await writeFile(join(root,'public/fonts/fixture/source.woff2'),'changed');
  await assert.rejects(exportSources(root,join(root,'output/invalid')),/source integrity/);
});

test('distribution staging refuses unrelated or existing destinations',async t=>{
  const root=await mkdtemp(join(tmpdir(),'deck-release-output-'));t.after(()=>rm(root,{recursive:true,force:true}));
  assert.throws(()=>distributionOutput(join(root,'public'),root),/output directory/);
  assert.throws(()=>distributionOutput(join(root,'../output'),root),/output directory/);
  assert.equal(distributionOutput(join(root,'output/release'),root),join(root,'output/release'));
  await freshOutput(join(root,'output/release'));await assert.rejects(freshOutput(join(root,'output/release')),{code:'EEXIST'});
});

test('the packaged server boots outside the repository and serves only its frontend tree',async t=>{
  const root=await mkdtemp(join(tmpdir(),'deck-standalone-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const app=join(root,'app');
  const html=Buffer.from('<!doctype html><title>Standalone editor</title>');
  await put(app,'dist/index.html.stored.br',brotliCompressSync(html));
  const resourceRoot='resources/blue-black-v1';
  const illustration=JSON.parse(await readFile(join('public',resourceRoot,'manifest.json'),'utf8')).assets[0];
  const png=await readFile(join('public',resourceRoot,illustration.file));
  await put(app,join('dist',resourceRoot,illustration.file+'.stored.br'),brotliCompressSync(png));
  await put(app,join('dist',resourceRoot,'manifest.json.stored.br'),brotliCompressSync(JSON.stringify({assets:[illustration]})));
  await buildLocalRuntime(join(app,'runtime'));
  const reservation=createServer();
  await new Promise<void>(ok=>reservation.listen(0,'127.0.0.1',ok));
  const port=(reservation.address() as {port:number}).port;
  await new Promise<void>(ok=>reservation.close(()=>ok()));
  const child=spawn(process.execPath,[join(app,'runtime','server.mjs')],{
    cwd:root,env:{PATH:process.env.PATH,PORT:String(port)},stdio:['ignore','pipe','pipe'],
  });
  const done=new Promise<void>(ok=>child.once('close',()=>ok()));
  try {
    await new Promise<void>((ok,fail)=>{
      const timer=setTimeout(()=>fail(new Error('Packaged server did not start.')),10_000);
      child.stdout.on('data',data=>{if(data.toString().includes('127.0.0.1:'+port)){clearTimeout(timer);ok();}});
      child.once('close',code=>{clearTimeout(timer);fail(new Error('Packaged server exited with status '+code));});
    });
    const origin='http://127.0.0.1:'+port;
    const page=await fetch(origin);
    assert.equal(page.status,200);
    assert.deepEqual(Buffer.from(await page.arrayBuffer()),html);
    const image=await fetch(origin+'/'+join(resourceRoot,illustration.file));
    assert.equal(image.headers.get('Content-Type'),'image/png');
    assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
    const id='blue-black:'+illustration.id;
    const preview=await fetch(origin+'/api/resources/preview?id='+encodeURIComponent(id)+'&color=%2335664d');
    assert.equal(preview.status,200);
    assert.equal(preview.headers.get('Content-Type'),'image/png');
    await preview.arrayBuffer();
    const restored=await fetch(origin+'/api/resources/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,color:'#2f5bff'})});
    assert.equal(restored.status,200);
    assert.equal((await restored.json()).src,'data:image/png;base64,'+png.toString('base64'));
    assert.equal((await fetch(origin+'/runtime/server.mjs')).status,404);
    assert.equal((await fetch(origin+'/.data/decks/private.json')).status,404);
    assert.deepEqual(await (await fetch(origin+'/api/decks?view=summary')).json(),[]);
    await access(join(app,'.data','decks'));
  } finally {
    child.kill();
    await done;
  }
});
