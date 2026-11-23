import {forEachDocumentImage, packDocumentMedia, type MediaLocation} from './document-media-transport';
import type {Deck} from './model';

export const MEDIA_UPDATE_SCHEMA = 'deck-studio/media-update-1';
export const MEDIA_REVISION_HEADER = 'X-Deck-Media-Revision';
export type SavedMediaBase = {deck: Deck; token: string};
export type DocumentSaveReceipt = {id: string; revision: number; updatedAt: string; mediaToken?: string};

/** Send references only to images known to be identical in the committed base. */
export function documentMediaUpdate(deck: Deck, base: SavedMediaBase) {
  if (deck.id !== base.deck.id || deck.revision <= base.deck.revision) return;
  const known = new Map<string, MediaLocation>();
  forEachDocumentImage(base.deck, (value, location) => known.set(value, location), 65_536);
  if (!known.size) return;
  const packed = packDocumentMedia(deck, 65_536, 1);
  if (!packed.assets.length || packed.assets.length > 4000 || packed.references.length > 100_000
      || packed.references.reduce((size, ref) => size + packed.assets[ref.asset].length, 0) > 256_000_000) return;
  const assets = packed.assets.map(value => known.get(value) ?? value);
  if (assets.every(value => typeof value === 'string')) return;
  return {schema: MEDIA_UPDATE_SCHEMA, token: base.token, id: deck.id, ...packed, assets};
}
