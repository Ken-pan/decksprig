import {createMediaDigestContext,type MediaDigestContext} from './media-digest-context';
import {mediaDigest,prepareStoredDocument,restoreStoredDocument,isStoredDocument,internDocumentImages,storedDocumentMetadata} from './document-storage';
import type {Deck} from './model';
import {validateDeck} from './model';
import {packStorageRead,restoreStorageRead} from './storage-read-packet';

export type BrowserReadContext={assets:Map<string,Promise<string>>;strings:Map<string,string>;digests:MediaDigestContext};
export const createBrowserReadContext=():BrowserReadContext=>({assets:new Map(),strings:new Map(),digests:createMediaDigestContext()});

let connection:Promise<IDBDatabase>|undefined;
export function mediaDatabase():Promise<IDBDatabase>{
 return connection??=new Promise((ok,no)=>{const r=indexedDB.open('deck-studio-shared-media',1);r.onupgradeneeded=()=>{for(const name of ['assets','backups','control'])r.result.createObjectStore(name,{keyPath:'id'});};r.onsuccess=()=>{const db=r.result;db.onversionchange=()=>{db.close();connection=undefined;};ok(db);};r.onerror=()=>{connection=undefined;no(r.error);};});
}
export function requestValue<T>(request:IDBRequest<T>):Promise<T>{return new Promise((ok,no)=>{request.onsuccess=()=>ok(request.result);request.onerror=()=>no(request.error);});}
export const complete=(tx:IDBTransaction)=>new Promise<void>((ok,no)=>{tx.oncomplete=()=>ok();tx.onabort=()=>no(tx.error??new Error('Storage transaction was interrupted.'));tx.onerror=()=>{};});
export async function mediaMode():Promise<'compact'|'legacy'>{const db=await mediaDatabase();return (await requestValue<any>(db.transaction('control').objectStore('control').get('mode')))?.value==='legacy'?'legacy':'compact';}
export async function setMediaMode(value:'compact'|'legacy'){const db=await mediaDatabase(),tx=db.transaction('control','readwrite'),done=complete(tx);tx.objectStore('control').put({id:'mode',value});await done;}
export const canOptimizeStorage=()=>typeof navigator!=='undefined'&&Boolean(navigator.locks);
let queue:Promise<unknown>=Promise.resolve();
export async function withBrowserMediaLock<T>(work:()=>Promise<T>):Promise<T>{
 if(canOptimizeStorage())return await navigator.locks.request('deck-studio-durable-media',work);
 const run=queue.catch(()=>{}).then(work);queue=run;return run;
}
async function unpackMediaBackup(backup:any,id:string,context?:MediaDigestContext):Promise<string>{
 if(!(backup?.blob instanceof Blob))throw new Error('Document media is missing or damaged. Restore a browser storage backup.');
 const stream=backup.compression==='gzip'?backup.blob.stream().pipeThrough(new DecompressionStream('gzip')):backup.blob.stream();
 const value=JSON.parse(await new Response(stream).text());if(typeof value!=='string'||await mediaDigest(value,context)!==id)throw new Error('The browser media rollback snapshot is damaged.');return value;
}
async function mediaBackup(data:string,id:string,context?:MediaDigestContext){
 const original=new Blob([JSON.stringify(data)],{type:'application/json'}),compression=typeof CompressionStream==='undefined'?'none':'gzip';
 const blob=compression==='gzip'?await new Response(original.stream().pipeThrough(new CompressionStream('gzip'))).blob():original;
 const result={id:'media:'+id,blob,compression};if(await unpackMediaBackup(result,id,context)!==data)throw new Error('Browser media backup verification failed.');return result;
}
export async function readAsset(id:string,cache=new Map<string,Promise<string>>(),context?:MediaDigestContext):Promise<string>{
 let value=cache.get(id);if(!value){value=(async()=>{const db=await mediaDatabase(),asset=await requestValue<any>(db.transaction('assets').objectStore('assets').get(id));if(typeof asset?.data==='string'&&await mediaDigest(asset.data,context)===id)return asset.data;return unpackMediaBackup(await requestValue<any>(db.transaction('backups').objectStore('backups').get('media:'+id)),id,context);})();cache.set(id,value);}return value;
}
export async function decodeBrowserRecord(raw:any,cache=new Map<string,Promise<string>>(),strings=new Map<string,string>(),context=createMediaDigestContext()):Promise<any>{
 if(!raw)return raw;
 if(raw.schema==='deck-studio/1'||isStoredDocument(raw))return restoreStoredDocument(internDocumentImages(raw,strings),id=>readAsset(id,cache,context),context);
 if(raw.deck){const deck=await decodeBrowserRecord(raw.deck,cache,strings,context),recoveries=[];for(const r of raw.recoveries??[])recoveries.push(await decodeBrowserRecord(r,cache,strings,context));return {...raw,deck,...(raw.recoveries?{recoveries}:{} )};}
 throw new Error('The browser storage record is invalid.');
}
export async function prepareBrowserRecord(raw:any):Promise<{record:any;media:Map<string,string>}>{
 return prepareRecord(raw,false,createMediaDigestContext());
}
// Only migrateBrowserRecord passes fresh, privately owned decoded leaves here.
// Public writers always run full validation, including on previously seen input.
async function prepareRecord(raw:any,decoded:boolean,context:MediaDigestContext):Promise<{record:any;media:Map<string,string>}>{
 if(raw.schema==='deck-studio/1')return prepareStoredDocument(decoded?raw:internDocumentImages(validateDeck(raw)),context);
 if(isStoredDocument(raw))return {record:raw,media:new Map()};
 if(raw.deck){const d=await prepareRecord(raw.deck,decoded,context),media=d.media,recoveries=[];for(const r of raw.recoveries??[]){const prepared=await prepareRecord(r,decoded,context);for(const item of prepared.media)media.set(...item);recoveries.push(prepared.record);}return {record:{...raw,deck:d.record,...(raw.recoveries?{recoveries}:{})},media};}
 throw new Error('The browser storage record is invalid.');
}
/** The returned private decode, rather than a caller flag, authorizes preparation. */
export async function decodeAndPrepareBrowserRecord(raw:any,context=createBrowserReadContext(),isolate=false){
 const input=isolate?{...createBrowserReadContext(),digests:context.digests}:context;
 let decoded=await decodeBrowserRecord(raw,input.assets,input.strings,input.digests);
 // Detach returned strings/metadata from a large cursor value's backing data.
 // The transport contains unique media once, so this is never a full JSON copy.
 if(isolate){
  const packet=structuredClone(packStorageRead(decoded)),root=packet.value;
  const assets=root.kind==='deck'?root.value.assets:root.kind==='draft'?root.value.media[0]?.assets:undefined;
  // All packet descriptors share this asset array. Keep one independent string
  // per image across matching branches, without retaining an old cursor value.
  for(let i=0;i<(assets?.length??0);i++){
   const value=assets[i];let shared=context.strings.get(value);
   if(shared===undefined){shared=value.length<=4_000_000?JSON.parse(JSON.stringify(value)):value;context.strings.set(shared!,shared!);}
   assets[i]=shared;
  }
  decoded=restoreStorageRead(packet);
 }
 return {...await prepareRecord(decoded,true,context.digests),decoded,context};
}

function hasStored(raw:any):boolean{return isStoredDocument(raw)||Boolean(raw?.deck&&(isStoredDocument(raw.deck)||(raw.recoveries??[]).some(isStoredDocument)));}
export async function persistMedia(media:Map<string,string>,backup?:{id:string;record:any},context?:MediaDigestContext){
 const db=await mediaDatabase();
 for(const[id,data]of media){
  const hasBackup=await requestValue(db.transaction('backups').objectStore('backups').getKey('media:'+id)),backup=hasBackup?undefined:await mediaBackup(data,id,context);
  const tx=db.transaction(['assets','control','backups'],'readwrite'),done=complete(tx),r=tx.objectStore('assets').get(id);let reason:unknown;
  r.onsuccess=()=>{if(backup){tx.objectStore('backups').put(backup);tx.objectStore('control').put({id:'backup:'+id,bytes:backup.blob.size});}if(r.result&&r.result.data!==data){reason=new Error('An existing browser media asset is damaged.');tx.abort();return;}if(!r.result){const bytes=new TextEncoder().encode(data).length;tx.objectStore('assets').put({id,data,bytes});tx.objectStore('control').put({id:'asset:'+id,bytes});}};
  try{await done;}catch(error){throw reason??error;}
 }
 if(backup){const tx=db.transaction('backups','readwrite'),done=complete(tx);tx.objectStore('backups').put(backup);await done;}
}
export async function migrateBrowserRecord(db:IDBDatabase,store:string,key:IDBValidKey,raw:any,onConverted:()=>void=()=>{},context=createBrowserReadContext()):Promise<any>{
 if(!raw)return raw;
 // Callers hold the shared Web Lock. Older clients are excluded by DB upgrades.
 const decoded=await decodeBrowserRecord(raw,context.assets,context.strings,context.digests);
 if(!canOptimizeStorage()||await mediaMode()==='legacy'||hasStored(raw))return decoded;
 const prepared=await prepareRecord(decoded,true,context.digests);if(!hasStored(prepared.record))return decoded;
 const id=`${db.name}:${store}:${JSON.stringify(key)}:${await mediaDigest(JSON.stringify(prepared.record))}`;
 await persistMedia(prepared.media,{id,record:{database:db.name,store,key,value:prepared.record}},context.digests);
 const tx=db.transaction(store,'readwrite'),done=complete(tx);tx.objectStore(store).put(prepared.record);await done;onConverted();return decoded;
}
export async function browserMediaStatus(){const db=await mediaDatabase(),rows=await requestValue<any[]>(db.transaction('control').objectStore('control').getAll(IDBKeyRange.bound('asset:','asset:\uffff')));const backups=await requestValue<any[]>(db.transaction('control').objectStore('control').getAll(IDBKeyRange.bound('backup:','backup:\uffff')));const estimate=await navigator.storage?.estimate?.();return {originBytes:estimate?.usage,mode:await mediaMode(),assets:rows.length,mediaBytes:rows.reduce((n,r)=>n+r.bytes,0),backupBytes:backups.reduce((n,r)=>n+r.bytes,0),safeOptimization:canOptimizeStorage()};}
export async function maintainDatabase(db:IDBDatabase,stores:string[],operation:'migrate'|'rollback'){
 let converted=0;const errors:{store:string;key:string;message:string}[]=[],cache=new Map<string,Promise<string>>(),strings=new Map<string,string>();
 for(const store of stores){const keys=await requestValue<IDBValidKey[]>(db.transaction(store).objectStore(store).getAllKeys());for(const key of keys){
  try{const raw=await requestValue<any>(db.transaction(store).objectStore(store).get(key));if(operation==='rollback'){if(!hasStored(raw))continue;const value=await decodeBrowserRecord(raw,cache,strings),tx=db.transaction(store,'readwrite'),done=complete(tx);tx.objectStore(store).put(value);await done;converted++;}
   else {if(hasStored(raw)){const prepared=await prepareBrowserRecord(await decodeBrowserRecord(raw,cache,strings));await persistMedia(prepared.media);}else await migrateBrowserRecord(db,store,key,raw,()=>converted++);}
  }catch(error){errors.push({store,key:JSON.stringify(key),message:(error as Error).message});}
 }}return {database:db.name,converted,errors};
}
export {storedDocumentMetadata};
