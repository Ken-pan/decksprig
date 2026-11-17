import {test} from 'node:test';
import assert from 'node:assert/strict';
import {brotliCompressSync,constants} from 'node:zlib';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {applyExampleVariant,demoName,exampleVariantFile,legacyDemoName} from '../server/example-variant.mjs';
import {packExampleVariant} from '../scripts/compact-distribution/example-variant.mjs';

test('the staged example variant restores every original byte from the shared example', async()=>{
  const root=await mkdtemp(join(tmpdir(),'deck-example-variant-'));
  try{
    await mkdir(join(root,'dist/examples'),{recursive:true});
    await mkdir(join(root,'runtime'));
    const artwork=Buffer.concat(Array.from({length:256},(_unused,index)=>createHash('sha256').update(String(index)).digest())).toString('base64');
    const base=Buffer.from(JSON.stringify({title:'Current example',artwork}));
    const legacy=Buffer.from(JSON.stringify({title:'Former example',artwork}));
    const old=join(root,'dist',legacyDemoName+'.stored.br');
    const compress=(input:Buffer)=>brotliCompressSync(input,{params:{[constants.BROTLI_PARAM_QUALITY]:1}});
    await writeFile(join(root,'dist',demoName+'.stored.br'),compress(base));
    await writeFile(old,compress(legacy));
    assert((await packExampleVariant(root))>6000);
    const plan=JSON.parse(await readFile(join(root,exampleVariantFile),'utf8'));
    assert.deepEqual(applyExampleVariant(base,plan.edits,plan.size),legacy);
    await assert.rejects(readFile(old),{code:'ENOENT'});
    const corrupt=[...plan.edits,{offset:0,length:10,text:''}];
    assert.throws(()=>applyExampleVariant(base,corrupt,plan.size),/integrity/);
  }finally{await rm(root,{recursive:true,force:true});}
});
