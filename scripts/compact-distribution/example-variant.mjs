import {readFile,unlink,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {brotliDecompressSync} from 'node:zlib';
import {applyExampleVariant,demoName,exampleLimit,exampleVariantFile,legacyDemoName} from '../../server/example-variant.mjs';

export async function packExampleVariant(app) {
  const basePath = resolve(app,'dist',demoName+'.stored.br');
  const legacyPath = resolve(app,'dist',legacyDemoName+'.stored.br');
  const compressed = await Promise.all([readFile(basePath),readFile(legacyPath)]).catch(error=>{
    if(error.code!=='ENOENT')throw error;
  });
  if (!compressed) return 0;
  let documents;
  try {
    documents=compressed.map(bytes=>brotliDecompressSync(bytes,{maxOutputLength:exampleLimit}));
  } catch (error) {
    if(error.code==='ERR_BUFFER_TOO_LARGE')return 0;
    throw error;
  }
  const [base,legacy]=documents;
  const edits = [];
  function compare(a,b) {
    if(a===b)return true;
    if(a&&b&&typeof a==='object'&&typeof b==='object'){
      const keys=Object.keys(a);
      return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&compare(a[key],b[key]));
    }
    if(typeof a!=='string'||typeof b!=='string'||edits.length===64)return false;
    const old=Buffer.from(JSON.stringify(a)),text=JSON.stringify(b);
    const offset=base.indexOf(old);
    if(text.length>4096||offset<0||base.indexOf(old,offset+1)>=0)return false;
    edits.push({offset,length:old.length,text});
    return true;
  }
  if (!compare(JSON.parse(base),JSON.parse(legacy))) return 0;
  edits.sort((a,b)=>a.offset-b.offset);
  const size=legacy.length, sha256=createHash('sha256').update(legacy).digest('hex');
  const plan=JSON.stringify({size,sha256,edits});
  const saved=compressed[1].length-Buffer.byteLength(plan);
  if(saved<=0)return 0;
  try{
    if(!applyExampleVariant(base,edits,size).equals(legacy))return 0;
  }catch{return 0;}
  await writeFile(resolve(app,exampleVariantFile),plan,{flag:'wx'});
  await unlink(legacyPath);
  return saved;
}
