import type {DraftRecord} from './drafts';
import type {RecoveryUpgradeRead} from './recovery-database';

export type StoredDraftRecord = DraftRecord & {documentId?: string};
export async function draftDB(read?:RecoveryUpgradeRead):Promise<IDBDatabase>{
 return (await import('./recovery-database')).draftDB(read);
}

// Persist the canonical record, including its already assigned tab branch key.
// Acknowledgement means the transaction committed, not merely that put returned.
export async function writeStoredDraft(record: StoredDraftRecord): Promise<void> {
  if(typeof navigator!=='undefined'&&navigator.locks){return (await import('./recovery-storage')).writeRecoveryRecord(record);}
  const db = await draftDB();
  await new Promise<void>((ok, no) => {
    const t = db.transaction('drafts', 'readwrite');
    t.objectStore('drafts').put(record);
    t.oncomplete = () => ok(); t.onerror = () => no(t.error); t.onabort = () => no(t.error);
  });
}
