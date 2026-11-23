/** A key lookup avoids decoding the potentially large acknowledged snapshot.
 * Aborting an upgrade keeps ordinary documents from creating a sync database. */
export function hasFigmaCheckpoint(id:string):Promise<boolean>{
 return new Promise(resolve=>{
  if(typeof indexedDB==='undefined'){resolve(false);return;}
  let request:IDBOpenDBRequest;
  try{request=indexedDB.open('deck-studio-figma-sync');}catch{resolve(false);return;}
  request.onupgradeneeded=()=>request.transaction?.abort();
  request.onerror=request.onblocked=()=>resolve(false);
  request.onsuccess=()=>{
   const db=request.result;db.onversionchange=()=>db.close();
   if(!db.objectStoreNames.contains('checkpoints')){db.close();resolve(false);return;}
   try{const key=db.transaction('checkpoints').objectStore('checkpoints').getKey(id);key.onsuccess=()=>{db.close();resolve(key.result!==undefined);};key.onerror=()=>{db.close();resolve(false);};}catch{db.close();resolve(false);}
  };
 });
}
