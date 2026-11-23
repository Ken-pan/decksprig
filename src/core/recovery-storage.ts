import type {StoredDraftRecord} from './draft-store';
import {draftDB} from './recovery-database';
import {isBrowserEdition} from './runtime';
import {withBrowserMediaLock,mediaMode,prepareBrowserRecord,persistMedia,requestValue,complete,migrateBrowserRecord,createBrowserReadContext} from './browser-media-store';

export async function writeRecoveryRecord(record:StoredDraftRecord){
 return withBrowserMediaLock(async()=>{
  const db=await draftDB();let value:any=record;
  if(await mediaMode()==='compact'){
   const prepared=await prepareBrowserRecord(record);await persistMedia(prepared.media);value=prepared.record;
  }
  const tx=db.transaction('drafts','readwrite'),done=complete(tx);tx.objectStore('drafts').put(value);await done;
 });
}
/** Read only this document's branches, including pre-index legacy records. */
export async function readRecoveryRecords(id:string){
 return withBrowserMediaLock(async()=>{
  let upgraded:any[]|undefined;
  const db=await draftDB({id,receive:records=>{upgraded=records;}});
  if(upgraded)return isBrowserEdition||upgraded.length>1?{schema:'deck-studio-drafts/1',records:upgraded.map(value=>isBrowserEdition?{...value,id}:value)}:upgraded[0];
  const context=createBrowserReadContext(),store=db.transaction('drafts').objectStore('drafts');
  const [indexed,legacyBranches]=await Promise.all([requestValue<IDBValidKey[]>(store.index('byDocument').getAllKeys(IDBKeyRange.only(id))),requestValue<IDBValidKey[]>(store.getAllKeys(IDBKeyRange.bound(id+'@',id+'@\uffff')))]);
  const keys=[...new Set<IDBValidKey>([id,...indexed,...legacyBranches])],records:any[]=[];
  for(const key of keys){const raw=await requestValue<any>(db.transaction('drafts').objectStore('drafts').get(key));if(!raw)continue;
   if((raw.documentId??raw.deck?.id??raw.id)!==id)continue;
   const value=await migrateBrowserRecord(db,'drafts',key,raw,undefined,context);records.push(isBrowserEdition?{...value,id}:value);
  }
  return isBrowserEdition||records.length>1?{schema:'deck-studio-drafts/1',records}:records[0];
 });
}
