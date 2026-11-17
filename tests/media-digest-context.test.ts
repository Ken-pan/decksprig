import {test} from 'node:test';import assert from 'node:assert/strict';import {createMediaDigestContext,digestMedia} from '../src/core/media-digest-context';import {mediaDigest,prepareStoredDocument,restoreStoredDocument} from '../src/core/document-storage';import {newDeck,blankSlide,element} from '../src/core/model';import {prepareBrowserRecord} from '../src/core/browser-media-store';
async function counted(work:(calls:()=>number)=>Promise<void>){const own=Object.getOwnPropertyDescriptor(crypto.subtle,'digest'),original=crypto.subtle.digest;let count=0;Object.defineProperty(crypto.subtle,'digest',{configurable:true,value:function(this:SubtleCrypto,...args:Parameters<SubtleCrypto['digest']>){count++;return original.apply(this,args);}});try{await work(()=>count);}finally{if(own)Object.defineProperty(crypto.subtle,'digest',own);else delete (crypto.subtle as any).digest;}}
test('computed digest contexts share work for identical values and never trust a serialized token',()=>counted(async calls=>{
 const context=createMediaDigestContext(),value='data:image/png;base64,ABCD';const [a,b]=await Promise.all([digestMedia(value,context),digestMedia(value,context)]);assert.equal(a,b);assert.equal(calls(),1);assert.notEqual(await digestMedia(value+'E',context),a);assert.equal(calls(),2);await digestMedia(value,createMediaDigestContext());assert.equal(calls(),3);await assert.rejects(digestMedia(value,structuredClone(context)));assert.equal(calls(),3);
}));
test('digest memoization evicts within its budget and does not retain oversized values',()=>counted(async calls=>{
 const c=createMediaDigestContext(),a='A'.repeat(3_000_000),b='B'.repeat(3_000_000);await digestMedia(a,c);await digestMedia(b,c);await digestMedia(a,c);assert.equal(calls(),3);const large='C'.repeat(4_200_000);await digestMedia(large,c);await digestMedia(large,c);assert.equal(calls(),5);
}));
test('a matching context never accepts a changed asset or mismatched asset identity',async()=>{
 const s=blankSlide();s.elements=[element('image',{src:'data:image/png;base64,'+'ABCD'.repeat(20000)})];const d=newDeck('Verified media',[s]),context=createMediaDigestContext(),p=await prepareStoredDocument(d,context),stored=p.record as any,source=s.elements[0].src!;assert.equal(stored.schema,'deck-studio/storage-1');assert.deepEqual(await restoreStoredDocument(stored,async()=>source,context),d);await assert.rejects(restoreStoredDocument(stored,async()=>source+'changed',context),/damaged/);const wrong={...stored,assets:['0'.repeat(64)]};await assert.rejects(restoreStoredDocument(wrong,async()=>source,context),/damaged/);
});
test('public browser preparation validates mutable inputs on every call',async()=>{
 const d=newDeck('Mutable public input',[blankSlide()]);await prepareBrowserRecord(d);(d as any).width=0;await assert.rejects(prepareBrowserRecord(d));await assert.rejects(prepareBrowserRecord({trusted:true,decoded:true,deck:d}));
});
test('a failed digest is evicted so an operation can retry without trusting failed work',async()=>{
 const own=Object.getOwnPropertyDescriptor(crypto.subtle,'digest'),original=crypto.subtle.digest;let calls=0;
 Object.defineProperty(crypto.subtle,'digest',{configurable:true,value:function(this:SubtleCrypto,...args:Parameters<SubtleCrypto['digest']>){if(++calls===1)return Promise.reject(new Error('Injected digest failure'));return original.apply(this,args);}});
 try{const context=createMediaDigestContext(),value='data:image/png;base64,AQID';await assert.rejects(digestMedia(value,context),/Injected/);const digest=await digestMedia(value,context);assert.equal(calls,2);assert.equal(await digestMedia(value,context),digest);assert.equal(calls,2);}finally{if(own)Object.defineProperty(crypto.subtle,'digest',own);else delete (crypto.subtle as any).digest;}
});
test('atomic upgrade preparation validates each mutable input instead of trusting previous decodes',async()=>{
 const {decodeAndPrepareBrowserRecord,createBrowserReadContext}=await import('../src/core/browser-media-store');
 const slide=blankSlide();slide.elements=[element('image',{src:'data:image/png;base64,'+'AQID'.repeat(20000)})];
 const d=newDeck('Mutable upgrade source',[slide]),raw={id:d.id,deck:d,recoveries:[{...d,title:'Conflict',revision:1}],baseRevision:0},context=createBrowserReadContext();
 const prepared=await decodeAndPrepareBrowserRecord(raw,context);assert.deepEqual(prepared.decoded.deck,d);
 assert.deepEqual((await decodeAndPrepareBrowserRecord(raw,context,true)).decoded,prepared.decoded);
 d.width=0;await assert.rejects(decodeAndPrepareBrowserRecord(raw,context));
 await assert.rejects(decodeAndPrepareBrowserRecord(raw,context,true));
 await assert.rejects(decodeAndPrepareBrowserRecord({...raw,trusted:true,decoded:true},context));
});
