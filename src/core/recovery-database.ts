import {BRAND_NAME} from '../brand-name.js';
import {isBrowserEdition} from './runtime';
import {canOptimizeStorage,mediaMode,createBrowserReadContext,decodeAndPrepareBrowserRecord,persistMedia} from './browser-media-store';

export type RecoveryUpgradeRead={id:string;receive:(records:any[])=>void};
// The original store survives until the replacement and backups are ready.
// Its rename and removal are both inside the same atomic upgrade transaction.
const archivePrefix='drafts-before-index-1';
function largeImageRecord(raw:any):boolean {
 const decks=[raw?.deck??raw,...(Array.isArray(raw?.recoveries)?raw.recoveries:[])];let bytes=0,sites=0,largest=0;
 if(decks.length>100)return false;
 const add=(value:unknown)=>{if(typeof value==='string'&&value.length>=1024&&value.startsWith('data:image/')){bytes+=value.length;sites++;largest=Math.max(largest,value.length);}};
 for(const deck of decks){if(deck?.schema!=='deck-studio/1'||!Array.isArray(deck.slides)||deck.slides.length>500)return false;for(const slide of deck.slides){if(!Array.isArray(slide?.elements)||slide.elements.length>3000)return false;add(slide.source?.render);for(const element of slide.elements){add(element?.src);add(element?.prototype?.poster);}if(bytes>256_000_000||sites>4000)return false;}}
 return bytes>=1_000_000&&largest>=65536;
}

/** Atomic v1 upgrade: index compact rows instead of deserializing large rows twice. */
export async function openRecoveryDatabase(name:string,read?:RecoveryUpgradeRead):Promise<IDBDatabase>{
 const optimize=canOptimizeStorage()&&await mediaMode()==='compact';
 return new Promise((ok,no)=>{
  const request=indexedDB.open(name,2);let blocked=false,failure:unknown,keepAlive=false,converted=false,validRead=true;
  const selected:{key:IDBValidKey;value:any;indexed:boolean;legacy:boolean}[]=[],context=createBrowserReadContext();
  request.onblocked=()=>{blocked=true;no(new Error(`Close older ${BRAND_NAME} tabs, then retry the storage upgrade.`));};
  request.onerror=()=>{keepAlive=false;no(failure??request.error);};
  request.onupgradeneeded=()=>{
   const db=request.result,tx=request.transaction!;
   if(blocked){tx.abort();return;}
   const existed=db.objectStoreNames.contains('drafts'),source=existed?tx.objectStore('drafts'):db.createObjectStore('drafts',{keyPath:'id'});
   if(source.indexNames.contains('byDocument'))return;
   if(!existed||!optimize||source.keyPath!=='id'||source.autoIncrement||source.indexNames.length){source.createIndex('byDocument','documentId');return;}
   const abort=(error:unknown)=>{failure=error;keepAlive=false;try{tx.abort();}catch{/* Already aborted by a failed IDB request. */}};
   tx.addEventListener('abort',()=>{keepAlive=false;});
   tx.addEventListener('error',event=>{failure??=(event.target as IDBRequest).error;});
   // advance(1) avoids continue() prefetch and reuses one value cursor.
   let target:IDBObjectStore|undefined,ready:(()=>void)|undefined,archiveName='',nativeFallback=false;
   const probes:(IDBKeyRange|undefined)[]=read?[IDBKeyRange.bound(read.id+'@',read.id+'@\uffff'),IDBKeyRange.only(read.id),undefined]:[undefined];
   let remaining:IDBKeyRange[]=[];
   // Async crypto/compression runs outside this transaction's active callbacks.
   // Queue its finished write in the next scalar IDB callback, never a timer.
   const pulse=()=>{if(!keepAlive)return;try{const action=ready;ready=undefined;action?.();if(!keepAlive)return;const pending=source.getKey('__deck-studio-upgrade-keepalive__');pending.onsuccess=pulse;}catch(error){abort(error);}};
   const scan=(range?:IDBKeyRange)=>{
    const keys=source.openKeyCursor(range);
    keys.onsuccess=()=>{
     const keyCursor=keys.result;
     if(!keyCursor){if(remaining.length){scan(remaining.shift());return;}ready=()=>{keepAlive=false;db.deleteObjectStore(archiveName);};return;}
     // A dedicated one-value cursor is exhausted before requesting the next
     // key, limiting cursor-held buffers to one record at a time.
     const values=source.openCursor(IDBKeyRange.only(keyCursor.primaryKey));let readValue=false;
     values.onsuccess=()=>{
      let current=values.result;
      if(!current){if(!readValue){abort(new Error('Could not finish upgrading browser recovery storage. Your original drafts are retained. Retry opening.'));return;}if(nativeFallback)source.createIndex('byDocument','documentId');else keyCursor.advance(1);return;}
      readValue=true;
      let raw=current.value;const key=current.primaryKey;
      if(!target){
       if(!largeImageRecord(raw)){nativeFallback=true;const end=current;current=null;raw=undefined;end.advance(1);return;}
       remaining=[IDBKeyRange.upperBound(key,true),IDBKeyRange.lowerBound(key,true)];
       let archive=archivePrefix,suffix=0;while(db.objectStoreNames.contains(archive))archive=archivePrefix+'-'+(++suffix);
       source.name=archive;archiveName=archive;target=db.createObjectStore('drafts',{keyPath:'id'});target.createIndex('byDocument','documentId');converted=true;keepAlive=true;pulse();
      }
      const indexed=Boolean(read&&raw?.documentId===read.id),legacy=Boolean(read&&typeof key==='string'&&IDBKeyRange.bound(read.id+'@',read.id+'@\uffff').includes(key));
      const matches=Boolean(read&&(key===read.id||indexed||legacy)&&(raw?.documentId??raw?.deck?.id??raw?.id)===read.id);
      const row=matches?context:createBrowserReadContext();row.digests=context.digests;
      void (async()=>{
       let prepared;
       try{prepared=await decodeAndPrepareBrowserRecord(raw,row,true);}
       catch{if(matches)validRead=false;return {record:raw};}
       await persistMedia(prepared.media,prepared.media.size?{id:`${name}:drafts:index-1:${crypto.randomUUID()}`,record:{database:name,store:'drafts',key,value:prepared.record}}:undefined,context.digests);
       return matches?{record:prepared.record,decoded:prepared.decoded}:{record:prepared.record};
      })().then(result=>{raw=undefined;ready=()=>{const write=target!.put(result.record);result.record=undefined;write.onsuccess=()=>{if(matches&&Object.hasOwn(result,'decoded'))selected.push({key,value:result.decoded,indexed,legacy});const end=current!;current=null;end.advance(1);};};},abort);
     };
    };
   };

   // Probe keys without materializing unrelated values. A single-value cursor
   // can be closed before native fallback; successful conversion scans both
   // complementary ranges and still copies every original record exactly once.
   const probe=()=>{if(!probes.length){source.createIndex('byDocument','documentId');return;}const key=source.openKeyCursor(probes.shift());key.onsuccess=()=>{if(key.result)scan(IDBKeyRange.only(key.result.primaryKey));else probe();};};
   probe();
  };
  request.onsuccess=()=>{
   const db=request.result;if(blocked){db.close();return;}
   db.onversionchange=()=>db.close();
   if(converted&&read&&validRead){selected.sort((a,b)=>indexedDB.cmp(a.key,b.key));const ordered=[...selected.filter(r=>r.key===read.id),...selected.filter(r=>r.indexed),...selected.filter(r=>r.legacy)];try{read.receive([...new Set(ordered)].map(r=>r.value));}catch(error){db.close();no(error);return;}}
   ok(db);
  };
 });
}

let connection:Promise<IDBDatabase>|undefined;
export function draftDB(read?:RecoveryUpgradeRead):Promise<IDBDatabase>{
 if(connection)return connection;
 const opened=openRecoveryDatabase(isBrowserEdition?'deck-studio-web-recovery':'deck-studio-local',read).then(db=>{
  const clear=()=>{if(connection===opened)connection=undefined;};
  db.onversionchange=()=>{db.close();clear();};db.onclose=clear;return db;
 });
 connection=opened;void opened.catch(()=>{if(connection===opened)connection=undefined;});return opened;
}
