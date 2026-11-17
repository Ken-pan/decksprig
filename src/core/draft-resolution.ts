import {validateDeck,type Deck} from './model';
import {sameDocumentData} from './document-data';
import type {DraftRecord} from './drafts';

// Revision numbers order one branch; they do not prove that two branches agree.
export function resolveDraft(value: unknown, disk: Deck): {restore?: Deck; conflicts?: Deck[]} {
  if (!value || typeof value !== 'object') return {};
  if ((value as {schema?:string}).schema === 'deck-studio-drafts/1') {
    const branches=(value as {records:unknown[]}).records.map(record=>resolveDraft(record,disk));
    const restores:Deck[]=[],conflicts:Deck[]=[];
    const add=(into:Deck[],deck:Deck)=>{if(!into.some(candidate=>sameDocumentData(candidate,deck)))into.push(deck);};
    for(const branch of branches){if(branch.restore)add(restores,branch.restore);for(const conflict of branch.conflicts??[])add(conflicts,conflict);}
    if(restores.length===1&&!conflicts.length)return {restore:restores[0]};
    for(const restore of restores)add(conflicts,restore);
    return {conflicts};
  }
  const record = value as Partial<DraftRecord>;
  const deck = validateDeck(record.schema === 'deck-studio-draft/1' ? record.deck : value);
  if (deck.id !== disk.id) throw new Error('The recovery draft does not match this document.');
  const conflicts = (record.recoveries ?? []).map(validateDeck);
  if (conflicts.some(d => d.id !== disk.id)) throw new Error('The recovery draft does not match this document.');
  if (sameDocumentData(deck, disk)) return {conflicts};
  if (record.schema === 'deck-studio-draft/1' && Number.isInteger(record.baseRevision) && record.baseRevision === disk.revision && deck.revision > disk.revision) return {restore: deck, conflicts};
  if (!conflicts.some(d => sameDocumentData(d, deck))) conflicts.unshift(deck);
  return {conflicts};
}

