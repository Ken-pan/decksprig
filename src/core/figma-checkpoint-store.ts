import {validateDeck} from './model';
import {figmaReconnectScope,type FigmaCheckpoint} from './figma-sync-recovery';
import {withBrowserMediaLock,decodeBrowserRecord,requestValue,complete} from './browser-media-store';
import {prepareStoredDocument,restoreStoredDocument} from './document-storage';

const schema='deck-studio-figma-checkpoint/1';
let opening:Promise<IDBDatabase>|undefined;
function database(){
  return opening??=new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('deck-studio-figma-sync',1);let blocked=false;
    request.onupgradeneeded=()=>request.result.createObjectStore('checkpoints',{keyPath:'id'});
    request.onblocked=()=>{blocked=true;opening=undefined;reject(new Error('Close older Deck Studio tabs to save the Figma connection.'));};
    request.onsuccess=()=>{const db=request.result;if(blocked){db.close();return;}db.onversionchange=()=>{db.close();opening=undefined;};db.onclose=()=>{opening=undefined;};resolve(db);};
    request.onerror=()=>{opening=undefined;reject(request.error);};
  });
}
/** Select only document data: connection capabilities never enter this record. */
export function figmaCheckpointRecord(checkpoint:FigmaCheckpoint){
  const deck=validateDeck(checkpoint.deck),native=validateDeck(checkpoint.native);
  figmaReconnectScope({deck,native});
  return {schema,id:deck.id,deck,recoveries:[native]};
}
export function readFigmaCheckpointRecord(value:any,id:string):FigmaCheckpoint{
  if(value?.schema!==schema||value.id!==id||value.deck?.id!==id||value.recoveries?.length!==1)throw new Error('The saved Figma connection is invalid. Both documents are preserved.');
  const result={deck:validateDeck(value.deck),native:validateDeck(value.recoveries[0])};figmaReconnectScope(result);return result;
}
/** One self-contained snapshot replaces its predecessor; native render history
 * must not accumulate in the shared media store on every drag or nudge. */
export async function prepareFigmaCheckpoint(checkpoint:FigmaCheckpoint){
  const record=figmaCheckpointRecord(checkpoint),[deck,native]=await Promise.all([prepareStoredDocument(record.deck),prepareStoredDocument(record.recoveries[0])]);
  const payload={...record,deck:deck.record,recoveries:[native.record],media:Object.fromEntries(new Map([...deck.media,...native.media]))};
  const source=new Blob([JSON.stringify(payload)],{type:'application/json'}),compression=typeof CompressionStream==='undefined'?'none':'gzip';
  const blob=compression==='gzip'?await new Response(source.stream().pipeThrough(new CompressionStream('gzip'))).blob():source;
  return {schema,id:record.id,compression,blob};
}
export async function restoreFigmaCheckpoint(raw:any,id:string):Promise<FigmaCheckpoint>{
  if(raw?.blob instanceof Blob){
    if(raw.schema!==schema||raw.id!==id||!['gzip','none'].includes(raw.compression))throw new Error('The saved Figma connection is invalid. Both documents are preserved.');
    const stream=raw.compression==='gzip'?raw.blob.stream().pipeThrough(new DecompressionStream('gzip')):raw.blob.stream(),payload=JSON.parse(await new Response(stream).text());
    if(payload.schema!==schema||payload.id!==id||payload.recoveries?.length!==1||!payload.media||typeof payload.media!=='object')throw new Error('The saved Figma connection is incomplete. Both documents are preserved.');
    const load=async(key:string)=>{const value=payload.media[key];if(typeof value!=='string')throw new Error('Saved Figma media is missing. Both documents are preserved.');return value;};
    const [deck,native]=await Promise.all([restoreStoredDocument(payload.deck,load),restoreStoredDocument(payload.recoveries[0],load)]);
    return readFigmaCheckpointRecord({...payload,deck,recoveries:[native]},id);
  }
  // Retain earlier acknowledged points without rewriting or deleting their media.
  return readFigmaCheckpointRecord(await decodeBrowserRecord(raw),id);
}
export async function saveFigmaCheckpoint(checkpoint:FigmaCheckpoint){
  await withBrowserMediaLock(async()=>{
    const record=await prepareFigmaCheckpoint(checkpoint),db=await database(),tx=db.transaction('checkpoints','readwrite'),done=complete(tx);tx.objectStore('checkpoints').put(record);await done;
  });
}
export async function readFigmaCheckpoint(id:string):Promise<FigmaCheckpoint|undefined>{
  return withBrowserMediaLock(async()=>{
    const db=await database(),raw=await requestValue(db.transaction('checkpoints').objectStore('checkpoints').get(id));
    return raw?restoreFigmaCheckpoint(raw,id):undefined;
  });
}
