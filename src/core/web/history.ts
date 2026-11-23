import {storedDocumentMetadata} from '../document-storage';
import {HISTORY_LIMIT,historySummary,type HistorySummary} from '../history-summary';

// Reverse index order also reverses the compound primary key [deckId, revision].
// Keep one document-bearing cursor value at a time and stop at the visible cap.
export function readHistorySummaries(store:IDBObjectStore,key:string):Promise<HistorySummary[]> {
  return new Promise((resolve,reject)=>{
    const entries:HistorySummary[]=[],request=store.index('byDocument').openCursor(IDBKeyRange.only(key),'prev');
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const cursor=request.result;
      if(!cursor){resolve(entries);return;}
      try{entries.push(historySummary(storedDocumentMetadata(cursor.value.deck)));}
      catch(error){reject(error);return;}
      if(entries.length===HISTORY_LIMIT)resolve(entries);else cursor.continue();
    };
  });
}
