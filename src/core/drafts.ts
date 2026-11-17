import { type Deck } from './model';
import { cloneDocumentData } from './document-data';
import { LatestWriteQueue } from './latest-write-queue';
import {isBrowserEdition} from './runtime';

export type DraftRecord = {schema: 'deck-studio-draft/1'; id: string; deck: Deck; baseRevision: number; recoveries?: Deck[]};
export function draftRecord(deck: Deck, baseRevision: number, recoveries: Deck[] = []): DraftRecord {
  return {schema: 'deck-studio-draft/1', id: deck.id, deck, baseRevision, ...(recoveries.length ? {recoveries} : {})};
}

const writes = new LatestWriteQueue<DraftRecord>(async copy => {
  const stored=isBrowserEdition?{...copy,id:`${copy.id}@${browserBranch}`,documentId:copy.id}:copy;
  if(typeof Worker==='undefined')return (await import('./draft-store')).writeStoredDraft(stored);
  await (await import('./background-draft-save')).saveDraftInBackground(stored);
});
// Separate tab branches keep one tab's successful save from erasing another's
// conflicting recovery draft. Old branches are read together after a reload.
const browserBranch=isBrowserEdition?crypto.randomUUID():'';
export function saveDraft(record: DraftRecord): Promise<void> {
  // Capture the caller's revision before any asynchronous database work.
  return writes.enqueue(record.id, cloneDocumentData(record));
}
// Editor revisions and recovery branches are replacement-based immutable data.
// Their containers need no extra eager clone before the ordered IDB write.
// Mutable import/SDK callers continue to use saveDraft's independent capture.
export function saveImmutableDraft(record: DraftRecord): Promise<void> {
  return writes.enqueue(record.id, record);
}
export async function readDraft(id: string): Promise<unknown> {
  await writes.idle();
  return (await import('./storage-reader')).readStorageInBackground('draft',{id});
}
