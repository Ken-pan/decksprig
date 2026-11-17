import JSZip from 'jszip';

export const ARCHIVE_LIMITS = {input: 100_000_000, entries: 15_000, entry: 40_000_000, expanded: 256_000_000} as const;
const invalid = () => new Error('This archive is invalid or exceeds import limits. Export a smaller PPTX or PDF from the source app.');

/** Inspect sizes and paths before any decompression or native-app handoff. */
export function validateArchive(input: ArrayBuffer | Uint8Array) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 22 || bytes.length > ARCHIVE_LIMITS.input) throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw invalid();
  const count = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), start = view.getUint32(end + 16, true);
  if (!count || count > ARCHIVE_LIMITS.entries || count !== view.getUint16(end + 8, true) || start + size !== end) throw invalid();
  let offset = start, total = 0;
  const names = new Set<string>(), decoder = new TextDecoder();
  // Reject different filenames in both central and local Unicode records.
  function checkExtra(field: number, extraLength: number, name: string) {
    const fieldEnd = field + extraLength;
    while (field < fieldEnd) {
      if (field + 4 > fieldEnd) throw invalid();
      const kind = view.getUint16(field, true), fieldLength = view.getUint16(field + 2, true), fieldNext = field + 4 + fieldLength;
      if (fieldNext > fieldEnd) throw invalid();
      if (kind === 0x7075 && (fieldLength < 5 || bytes[field + 4] !== 1 || decoder.decode(bytes.subarray(field + 9, fieldNext)) !== name)) throw invalid();
      field = fieldNext;
    }
  }
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw invalid();
    const flags = view.getUint16(offset + 8, true), method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true), expanded = view.getUint32(offset + 24, true);
    const length = view.getUint16(offset + 28, true), extra = view.getUint16(offset + 30, true), comment = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true), next = offset + 46 + length + extra + comment;
    const unixType = (view.getUint32(offset + 38, true) >>> 16) & 0xf000;
    if (next > end || flags & 1 || unixType === 0xa000 || ![0, 8].includes(method) || expanded > ARCHIVE_LIMITS.entry || (total += expanded) > ARCHIVE_LIMITS.expanded || view.getUint16(offset + 34, true)) throw invalid();
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + length), name = decoder.decode(nameBytes);
    if (!name || /[\u0000-\u001f]/.test(name) || name.includes('\\') || name.startsWith('/') || name.includes(':') || name.split('/').some((part,index,parts) => part === '.' || part === '..' || (!part && index !== parts.length - 1)) || names.has(name)) throw invalid();
    checkExtra(offset + 46 + length, extra, name);
    names.add(name);
    if (local + 30 > start || view.getUint32(local, true) !== 0x04034b50 || view.getUint16(local + 6, true) !== flags || view.getUint16(local + 8, true) !== method) throw invalid();
    const localNameLength = view.getUint16(local + 26, true), localExtra = view.getUint16(local + 28, true);
    const dataStart = local + 30 + localNameLength + localExtra;
    if (dataStart + compressed > start || localNameLength !== length || !nameBytes.every((byte, index) => bytes[local + 30 + index] === byte)) throw invalid();
    checkExtra(local + 30 + localNameLength, localExtra, name);
    offset = next;
  }
  if (offset !== end) throw invalid();
  return names;
}

export async function loadBoundedZip(input: ArrayBuffer | Uint8Array) {
  const expected = validateArchive(input), zip = await JSZip.loadAsync(input);
  const entries = Object.values(zip.files);
  if (entries.length !== expected.size || entries.some(file => !expected.has(file.name) || file.unsafeOriginalName && file.unsafeOriginalName !== file.name)) throw invalid();
  return zip;
}

// JSZip exposes entry streams at runtime but omits this method from its object typings.
type StreamingZipEntry = JSZip.JSZipObject & {internalStream(type:'uint8array'):JSZip.JSZipStreamHelper<Uint8Array>};
const budgets = new WeakMap<JSZip, {bytes: number; cache: Map<string, Promise<Uint8Array>>}>();
/** Bound actual inflated bytes too: an attacker can lie in ZIP size headers. */
export async function readZipBytes(zip: JSZip, path: string, limit: number = ARCHIVE_LIMITS.entry): Promise<Uint8Array> {
  let budget = budgets.get(zip);
  if (!budget) { budget = {bytes: 0, cache: new Map()}; budgets.set(zip, budget); }
  const cached = budget.cache.get(path);
  if (cached) { const bytes = await cached; if (bytes.length > limit) throw invalid(); return bytes; }
  const file = zip.file(path); if (!file) throw new Error('An archive entry is missing.');
  const owner = budget;
  const pending = new Promise<Uint8Array>((resolve, reject) => {
    let length = 0, stopped = false;
    const chunks: Uint8Array[] = [], stream = (file as StreamingZipEntry).internalStream('uint8array');
    stream.on('data', (chunk: Uint8Array) => {
      if (stopped) return;
      length += chunk.length; owner.bytes += chunk.length;
      if (length > limit || owner.bytes > ARCHIVE_LIMITS.expanded) { stopped = true; stream.pause(); chunks.length = 0; reject(invalid()); return; }
      chunks.push(chunk);
    }).on('error', reject).on('end', () => {
      if (stopped) return;
      const output = new Uint8Array(length); let cursor = 0;
      for (const chunk of chunks) { output.set(chunk, cursor); cursor += chunk.length; }
      chunks.length = 0; resolve(output);
    }).resume();
  });
  owner.cache.set(path, pending);
  return pending;
}
export async function readZipXml(zip: JSZip, path: string, limit = 15_000_000) {
  const raw = new TextDecoder().decode(await readZipBytes(zip, path, limit));
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(raw)) throw new Error('Document type and entity declarations are not supported in imported XML.');
  return raw;
}

/** Release an inflated entry after consuming it; its expansion remains charged.
 * Reading it again inflates and charges it again, so eviction cannot bypass limits. */
export function releaseZipBytes(zip: JSZip, path: string) {
  budgets.get(zip)?.cache.delete(path);
}

/** Check actual expansion of every entry before handing an upload to a native app. */
export async function verifyArchive(input: ArrayBuffer | Uint8Array) {
  const zip = await loadBoundedZip(input);
  for (const file of Object.values(zip.files)) if (!file.dir) {
    await readZipBytes(zip, file.name);
    releaseZipBytes(zip, file.name);
  }
}
