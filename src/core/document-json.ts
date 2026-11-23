import type {Deck} from './model';
import {yieldForInput} from './text-layout';
import {documentJsonParts,type DocumentJsonOptions} from './document-json-parts';

type JsonOptions = DocumentJsonOptions & {now?: () => number; yieldTask?: () => Promise<void>};

// Encode pages/objects into byte-backed Blob parts instead of keeping a full
// JSON string, a parsed copy and a second concatenated HTML string in JS heap.
// Documents contain plain JSON; canonical validation happens before this reader.
export async function documentJsonBlob(deck: Deck, options: JsonOptions = {}): Promise<Blob> {
  return jsonDataBlob(deck, options);
}

/** The same bounded encoder for internal transport metadata, not a document format. */
export async function jsonDataBlob(value: unknown, options: JsonOptions = {}): Promise<Blob> {
  const now = options.now ?? (() => performance.now()), yieldTask = options.yieldTask ?? yieldForInput;
  const blobs: Blob[] = [];
  let buffer: string[] = [], characters = 0, started = now();
  const flush = () => { if (buffer.length) blobs.push(new Blob(buffer)); buffer = []; characters = 0; };
  for (const part of documentJsonParts(value,options)) {
    buffer.push(part); characters += part.length;
    if (characters >= 262_144) flush();
    if (now() - started >= 8) { flush(); await yieldTask(); started = now(); }
  }
  flush();
  return new Blob(blobs, {type: 'application/json'});
}
