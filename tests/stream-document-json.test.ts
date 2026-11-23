import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {join,dirname} from 'node:path';import {tmpdir} from 'node:os';import {readDocumentJson,readStreamingJson} from '../server/stream-document-json';import {readDeckStorage} from '../server/media-storage';import {newDeck,blankSlide,element} from '../src/core/model';
const media='data:image/png;base64,'+'ABCD'.repeat(20000);
async function owned(work:(path:string)=>Promise<void>){const dir=await mkdtemp(join(tmpdir(),'deck-fast-json-'));try{await work(join(dir,'input.json'));}finally{await rm(dir,{recursive:true,force:true});}}
test('bounded native reads preserve legacy syntax and reject malformed small documents',()=>owned(async path=>{
 const text='\ufeff{"__proto__":{"owned":true},"title":"中文🐈","dup":1,"dup":2,"media":'+JSON.stringify(media)+'}';
 await writeFile(path,text);
 assert.deepEqual(await readDocumentJson(path),await readStreamingJson(path));
 assert.equal(({} as {owned?:boolean}).owned,undefined);
 for(const payload of ['{"broken":','{"a":1} true',Buffer.from([34,0xed,0xa0,0x80,34])]){
  await writeFile(path,payload);
  await assert.rejects(readDocumentJson(path));
 }
 const large={media:media+'A'.repeat(2*1024*1024),end:'完整'};
 await writeFile(path,JSON.stringify(large));
 assert.deepEqual(await readDocumentJson(path),large);
}));
test('streamed JSON preserves cached token mismatches, encoded spellings, keys and duplicate fields',()=>owned(async path=>{
 const values=[{first:media,again:media,short:'data:image/png;base64,ABCD',changed:media.slice(0,-1)+'E',third:media,unicode:media+'中文🐈\ud800',last:media}, {[media]:media,nested:[media,{poster:media}],__proto__:null},JSON.parse('{"__proto__":{"owned":true},"constructor":"safe"}')];
 for(const v of values){const text=JSON.stringify(v);await writeFile(path,text);assert.deepEqual(await readStreamingJson(path),JSON.parse(text));}
 const spellings=`{"first":${JSON.stringify(media)},"second":${JSON.stringify(media).replace('data:','data\\u003a')},"first":${JSON.stringify(media+'suffix')},"third":${JSON.stringify(media)}}`;await writeFile(path,spellings);assert.deepEqual(await readStreamingJson(path),JSON.parse(spellings));assert.equal(({} as any).owned,undefined);
}));
test('fixed input buffer preserves quotes, escapes and UTF8 across 64 KiB boundaries',()=>owned(async path=>{
 for(const tail of ['\\\\','\\"','中','🐈'])for(const offset of [-1,0,1]){const prefix='{"padding":"',text=prefix+'a'.repeat(65536-Buffer.byteLength(prefix)+offset)+tail+'","first":'+JSON.stringify(media)+',"again":'+JSON.stringify(media)+'}';await writeFile(path,text);assert.deepEqual(await readStreamingJson(path),JSON.parse(text));}
 for(const size of [65533,65534,65535,65536,65537,131069]){const text=JSON.stringify({first:'data:image/png;base64,'+'A'.repeat(size),again:media,other:'x'.repeat(size)});await writeFile(path,text);assert.deepEqual(await readStreamingJson(path),JSON.parse(text));}
}));
test('oversized tokens keep the bounded fallback and exact text',()=>owned(async path=>{
 const big=media+'Z'.repeat(2*1024*1024),text=JSON.stringify({before:media,large:big,again:big,notes:'中'.repeat(800000),after:media});await writeFile(path,text);assert.deepEqual(await readStreamingJson(path),JSON.parse(text));
}));
test('cached prefixes never accept truncated, malformed or invalid UTF8 input',()=>owned(async path=>{
 const valid=JSON.stringify(media),texts=[`{"first":${valid},"again":${valid.slice(0,65550)}`,`{"first":${valid},"again":${valid.slice(0,-1)}\\q"}`,`{"first":${valid},"again":${valid}} true`,`{"first":${valid},"again":${valid},}`,`{"first":${valid},"again":${valid.slice(0,-1)}\u001f"}`,`{"first":${valid},"again":${valid.slice(0,-1)}\\uZZZZ"}`,`{"first":${valid},"again":${valid}`];
 for(const text of texts){await writeFile(path,text);await assert.rejects(readStreamingJson(path));}
 for(const bytes of [[0xc0,0xaf],[0xed,0xa0,0x80],[0xf4,0x90,0x80,0x80],[0xe2,0x82]]){await writeFile(path,Buffer.concat([Buffer.from(`{"first":${valid},"again":"${media}`),Buffer.from(bytes),Buffer.from('"}')]));await assert.rejects(readStreamingJson(path));}
}));
test('cached media never skips document schema or global reference checks',()=>owned(async path=>{
 const s=blankSlide();s.elements=[element('image',{src:media}),element('image',{src:media})];const d=newDeck('Complete validation',[s]);for(const value of [{...d,width:0},{...d,slides:[s,s]},{...d,slides:[{...s,elements:[s.elements[0],s.elements[0]]}] }]){await writeFile(path,JSON.stringify(value));await assert.rejects(readDeckStorage(path,join(path,'..')));}
}));
test('deterministic valid JSON corpus agrees with the native JSON model',()=>owned(async path=>{
 let state=12345;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
 for(let i=0;i<80;i++){const value={i,first:media,again:i%3?media:media+'\udfff',text:Array.from({length:40},()=>['中文','🐈','"','\\','\n','a'][random()%6]).join(''),nested:[random()/100,null,true,{['key'+i]:media}],number:i%2?-1e-100:1e100},text=JSON.stringify(value,null,i%3);await writeFile(path,text);assert.deepEqual(await readStreamingJson(path),JSON.parse(text));}
}));

test('prefetched read failures are surfaced and resources close on malformed input',()=>owned(async path=>{
 await assert.rejects(readStreamingJson(path),{code:'ENOENT'});
 await assert.rejects(readStreamingJson(dirname(path)),{code:'EISDIR'});
 await writeFile(path,'{"first":'+JSON.stringify(media)+',"bad": !'+media);await assert.rejects(readStreamingJson(path));
 await writeFile(path,JSON.stringify({afterError:media,again:media}));assert.deepEqual(await readStreamingJson(path),{afterError:media,again:media});
}));
