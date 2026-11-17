import {withBrowserMediaLock,setMediaMode,browserMediaStatus,maintainDatabase,canOptimizeStorage} from './browser-media-store';
import {openRecoveryDatabase} from './recovery-database';
async function existingDatabase(name:string):Promise<IDBDatabase>{
 return new Promise((ok,no)=>{const r=indexedDB.open(name);r.onerror=()=>no(r.error);r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();ok(r.result);};});
}
export async function maintainBrowserStorage(operation:'status'|'migrate'|'rollback'){
 if(operation==='status')return browserMediaStatus();
 if(!canOptimizeStorage())throw new Error('This browser cannot safely optimize shared storage. Existing documents remain readable.');
 return withBrowserMediaLock(async()=>{
  await setMediaMode(operation==='migrate'?'compact':'legacy');const results=[];
  const existing=typeof indexedDB.databases==='function'?new Set((await indexedDB.databases()).map(d=>d.name)):undefined;
  // Keep the browser application transport out of the local distribution.
  // Local maintenance can still visit an already existing browser database.
  if(import.meta.env?.VITE_DECK_RUNTIME==='browser'){const db=await(await import('./web/store')).webDatabase();results.push(await maintainDatabase(db,['documents','history'],operation));}
  else if(existing?.has('deck-studio-web-documents')){const db=await existingDatabase('deck-studio-web-documents');try{results.push(await maintainDatabase(db,['documents','history'],operation));}finally{db.close();}}
  for(const name of ['deck-studio-local','deck-studio-web-recovery']){
   if(existing?!existing.has(name):name!==(import.meta.env?.VITE_DECK_RUNTIME==='browser'?'deck-studio-web-recovery':'deck-studio-local'))continue;
   const db=await openRecoveryDatabase(name);try{results.push(await maintainDatabase(db,['drafts'],operation));}finally{db.close();}
  }
  return {...await browserMediaStatus(),results};
 });
}
