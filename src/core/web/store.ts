import {BRAND_NAME} from '../../brand-name.js';
import {validateDeck, type Deck} from '../model';
import {summarizeDeck, requirePreviewRevision, type LibrarySummary, type LibraryPreview} from '../library-summary';
import {readHistorySummaries} from './history';
import {withBrowserMediaLock,canOptimizeStorage,mediaMode,prepareBrowserRecord,persistMedia,decodeBrowserRecord,migrateBrowserRecord,requestValue,complete,storedDocumentMetadata} from '../browser-media-store';

const stores = ['documents', 'history', 'proposals', 'sources', 'metadata', 'library'] as const;
let opening: Promise<IDBDatabase> | undefined;
const failure = (message: string, status = 409) => Object.assign(new Error(message), {status});
const id = (value: string) => { if (!/^[\w.:-]{1,120}$/.test(value)) throw failure('Invalid document ID.', 422); return value; };
function storageError(error: unknown): Error {
  if ((error as DOMException)?.name === 'QuotaExceededError') return failure('Browser storage is full. Your current changes are retained. Export a Deck file to back them up.', 507);
  return error instanceof Error ? error : failure('Could not save in this browser. Export a backup and allow site storage.');
}
export function webDatabase(): Promise<IDBDatabase> {
  if (opening) return opening;
  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('deck-studio-web-documents', 3);
    let blocked = false;
    request.onupgradeneeded = event => {
      for (const name of stores) {
        if (request.result.objectStoreNames.contains(name)) continue;
        const store = request.result.createObjectStore(name, {keyPath: name === 'history' ? ['deckId','revision'] : 'id'});
        if (name === 'history' || name === 'proposals') store.createIndex('byDocument', 'deckId');
      }
      if((event as IDBVersionChangeEvent).oldVersion>=2)return;
      // Upgrade existing installations once, with bounded cursor ownership.
      // Originals are untouched; malformed documents remain available for recovery.
      const tx = request.transaction!;
      const cursor = tx.objectStore('documents').openCursor();
      cursor.onsuccess = () => {
        const record = cursor.result;
        if (!record) return;
        try { tx.objectStore('library').put(summarizeDeck(record.value.schema==='deck-studio/storage-1'?record.value.deck:validateDeck(record.value))); }
        catch { /* Match the local library's malformed-document behavior. */ }
        record.continue();
      };
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => { db.close(); if (opening === promise) opening = undefined; };
      db.onclose = () => { if (opening === promise) opening = undefined; };
      resolve(db);
    };
    request.onerror = () => reject(storageError(request.error));
    request.onblocked = () => { blocked = true; reject(failure(`Close older ${BRAND_NAME} tabs, then reload to open browser storage.`)); };
  });
  opening = promise;
  void promise.catch(() => { if (opening === promise) opening = undefined; });
  return promise;
}
async function read<T>(name: typeof stores[number], key: IDBValidKey): Promise<T | undefined> {
  const db = await webDatabase();
  return new Promise((resolve,reject) => {
    const request = db.transaction(name).objectStore(name).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(storageError(request.error));
  });
}
export async function writeWebRecord(name: 'sources' | 'proposals', value: {id: string; [key: string]: unknown}): Promise<void> {
  const db = await webDatabase();
  return new Promise((resolve,reject) => {
    const tx = db.transaction(name,'readwrite'); tx.objectStore(name).put(value);
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(storageError(tx.error)); tx.onerror = () => {};
  });
}
export const readWebSource = <T>(key: string) => read<T>('sources',key);
export async function listWebRecords<T>(kind:string):Promise<T[]>{
  const db=await webDatabase();return new Promise((resolve,reject)=>{const request=db.transaction('sources').objectStore('sources').getAll();request.onsuccess=()=>resolve(request.result.filter(record=>record.kind===kind).map(record=>record.value));request.onerror=()=>reject(storageError(request.error));});
}

export function validateBrowserSave(old: Deck | undefined, deck: Deck, expectedRevision: number | null) {
  if (old && (expectedRevision === null || old.revision !== expectedRevision || deck.revision <= old.revision)) throw failure('This document was updated in another tab. Your changes are retained. Export a copy before continuing.');
  if (!old && expectedRevision !== null) throw failure('This document no longer exists. Export a copy of your changes.');
}
async function saveLegacyWebDeck(raw: unknown, expectedRevision: number | null): Promise<Deck> {
  const deck = validateDeck(raw); id(deck.id);
  const db = await webDatabase();
  return new Promise((resolve,reject) => {
    const tx = db.transaction(['documents','history','library'],'readwrite');
    let reason: unknown;
    const documents = tx.objectStore('documents'), request = documents.get(deck.id);
    request.onsuccess = () => {
      try {
        const old = request.result as Deck | undefined;
        validateBrowserSave(old,deck,expectedRevision);
        if (old) tx.objectStore('history').put({deckId:old.id,revision:old.revision,deck:old});
        documents.put(deck);
        tx.objectStore('library').put(summarizeDeck(deck));
      } catch(error) { reason=error;tx.abort(); }
    };
    tx.oncomplete = () => resolve(deck);
    tx.onabort = () => reject(storageError(reason || tx.error));
    tx.onerror = () => {};
  });
}
export async function saveWebDeck(raw:unknown,expectedRevision:number|null):Promise<Deck>{
 const deck=validateDeck(raw);id(deck.id);return withBrowserMediaLock(async()=>{
  if(!canOptimizeStorage()||await mediaMode()==='legacy')return saveLegacyWebDeck(deck,expectedRevision);
  const db=await webDatabase(),oldRaw=await read<any>('documents',deck.id),old=oldRaw?await decodeBrowserRecord(oldRaw):undefined;
  validateBrowserSave(old,deck,expectedRevision);
  const next=await prepareBrowserRecord(deck),prior=old?await prepareBrowserRecord(old):undefined;
  if(prior)for(const item of prior.media)next.media.set(...item);
  await persistMedia(next.media,prior?{id:`${db.name}:documents:${deck.id}:${old!.revision}`,record:{database:db.name,store:'documents',key:deck.id,value:prior.record}}:undefined);
  const tx=db.transaction(['documents','history','library'],'readwrite'),done=complete(tx);
  if(prior)tx.objectStore('history').put({deckId:deck.id,revision:old!.revision,deck:prior.record});
  tx.objectStore('documents').put(next.record);tx.objectStore('library').put(summarizeDeck(deck));await done;return deck;
 });
}
export async function readWebDeck(key: string): Promise<Deck> {
  return withBrowserMediaLock(async()=>{const db=await webDatabase(),raw=await read<any>('documents',id(key));if(!raw)throw failure('Document not found in this browser.',404);return migrateBrowserRecord(db,'documents',key,raw);});
}
export async function readWebLibraryPreview(key: string, expectedRevision?: number): Promise<LibraryPreview> {
  const deck = await readWebDeck(key);
  requirePreviewRevision(deck.revision, expectedRevision);
  return {...summarizeDeck(deck), firstSlide: deck.slides[0]};
}
export async function listWebDecks(includePreview=true): Promise<LibraryPreview[]> {
  const db = await webDatabase();
  const entries = await new Promise<LibrarySummary[]>((resolve, reject) => {
    const request = db.transaction('library').objectStore('library').getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(storageError(request.error));
  });
  entries.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  if (!includePreview) return entries;
  // Preserve the legacy full-list contract, without cloning every document at once.
  const previews: LibraryPreview[] = new Array(entries.length);
  let cursor = 0;
  await Promise.all(Array.from({length: Math.min(4, entries.length)}, async () => {
    while (cursor < entries.length) {
      const index = cursor++;
      previews[index] = await readWebLibraryPreview(entries[index].id);
    }
  }));
  return previews;
}
export async function webHistory(key:string, revision?:number) {
  const current=await read<any>('documents',id(key));if(!current)throw failure('Document not found in this browser.',404);storedDocumentMetadata(current);const db=await webDatabase();
  if(revision!==undefined)return withBrowserMediaLock(async()=>{const value=await read<any>('history',[key,revision]);if(!value)throw failure('Version not found.',404);return (await migrateBrowserRecord(db,'history',[key,revision],value)).deck;});
  return readHistorySummaries(db.transaction('history').objectStore('history'),key).catch(error=>{throw storageError(error);});
}
