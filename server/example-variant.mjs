export const demoName = 'examples/decksprig-demo.deck.json';
export const legacyDemoName = 'examples/deckleaf-demo.deck.json';
export const exampleVariantFile = 'runtime/example-document-variant.json';
export const exampleLimit = 4 * 1024 * 1024;

/** Apply sorted byte replacements to an immutable packaged example. */
export function applyExampleVariant(base, edits, size) {
  const invalid = () => new Error('Packaged example integrity check failed.');
  if (!Array.isArray(edits) || edits.length > 64 || !Number.isSafeInteger(size) || size < 1 || size > exampleLimit) throw invalid();
  const parts = [];
  let cursor = 0;
  for (const edit of edits) {
    if (!edit || typeof edit !== 'object') throw invalid();
    const {offset,length,text}=edit;
    if (!Number.isSafeInteger(offset) || offset < cursor || !Number.isSafeInteger(length) || length < 1
      || offset + length > base.length || typeof text !== 'string' || text.length > 4096) throw invalid();
    parts.push(base.subarray(cursor,offset),Buffer.from(text));
    cursor = offset + length;
  }
  parts.push(base.subarray(cursor));
  if (parts.reduce((total,part)=>total+part.length,0) !== size) throw invalid();
  return Buffer.concat(parts,size);
}
