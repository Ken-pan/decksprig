import {packDocumentMedia,restoreDocumentMedia,type PackedDocumentMedia} from './document-media-transport';
import type {StoredDraftRecord} from './draft-store';

export type PackedDraft = {record: StoredDraftRecord; media: PackedDocumentMedia[]};
// Recovery branches use the same transport as the active revision. This
// envelope is transient: IDB still contains full, independently readable decks.
export function packDraft(record: StoredDraftRecord): PackedDraft {
  const media=[record.deck,...record.recoveries??[]].map(deck=>packDocumentMedia(deck));
  return {record:{...record,deck:media[0].deck,...(record.recoveries?{recoveries:media.slice(1).map(item=>item.deck)}:{})},media};
}
export function restoreDraft(input: PackedDraft): StoredDraftRecord {
  const decks=input.media.map(restoreDocumentMedia);
  return {...input.record,deck:decks[0],...(input.record.recoveries?{recoveries:decks.slice(1)}:{})};
}
