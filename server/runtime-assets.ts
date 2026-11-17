import {readFile, stat} from 'node:fs/promises';
import {relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {brotliDecompress} from 'node:zlib';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {applyExampleVariant,demoName,exampleLimit,exampleVariantFile,legacyDemoName} from './example-variant.mjs';

declare const __DECK_PACKAGED_SERVER__: boolean;
export const packagedRoot = typeof __DECK_PACKAGED_SERVER__ !== 'undefined' && __DECK_PACKAGED_SERVER__
  ? fileURLToPath(new URL('../', import.meta.url)) : undefined;
const decompress = promisify(brotliDecompress);
const exec = promisify(execFile);
const imageRoot = packagedRoot && resolve(packagedRoot, 'runtime/packed-images');
const maxImageBytes = 4 * 1024 * 1024;
type PackedImageEntry = {sha256: string; bytes: number; preview?: boolean; previewWebpSha256?: string};
type PackedImage = PackedImageEntry & {file: string; previewPath?: string};
let packedIndex: Promise<Record<string, PackedImageEntry>> | undefined;

export async function packedImage(path: string): Promise<PackedImage | undefined> {
  if (!imageRoot) return;
  const key = relative(distributionRoot(), path).split(sep).join('/');
  if (!key.endsWith('.png') || key.startsWith('../')) return;
  packedIndex ??= readFile(resolve(imageRoot, 'index.json'), 'utf8').then(JSON.parse).catch(error => {
    if (error.code === 'ENOENT') return {};
    packedIndex = undefined;
    throw error;
  });
  const entry = (await packedIndex)[key];
  if (!entry || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > maxImageBytes) return;
  const file = resolve(imageRoot, entry.sha256 + '.bin');
  return {...entry, file, previewPath: entry.preview ? resolve(imageRoot, entry.sha256 + (entry.previewWebpSha256 ? '.preview.webp' : '.preview.png')) : undefined};
}

const restorations = new Map<string, Promise<Buffer>>();
const restored = new Map<string, Buffer>();
const waiting: Array<() => void> = [];
let active = 0, cachedBytes = 0;

export async function restoreImage(image: PackedImage) {
  // Install artifacts are immutable. Include the packed file stamp so replacing
  // a file during troubleshooting won't reuse the old verified bytes.
  const info = await stat(image.file, {bigint:true});
  const key = `${image.file}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
  const cached = restored.get(key);
  if (cached) { restored.delete(key); restored.set(key, cached); return cached; }
  const existing = restorations.get(key);
  if (existing) return existing;
  const task = (async () => {
    if (active < 2) active++;
    else await new Promise<void>(resolve => waiting.push(resolve));
    try {
      const {stdout} = await exec(process.execPath, ['--disable-warning=ExperimentalWarning', resolve(imageRoot!, 'decode.mjs'), image.file],
        {encoding: 'buffer', maxBuffer: maxImageBytes, timeout: 15_000, windowsHide: true});
      if (stdout.length !== image.bytes || createHash('sha256').update(stdout).digest('hex') !== image.sha256) {
        throw new Error('Packaged artwork integrity check failed.');
      }
      restored.set(key, stdout);
      cachedBytes += stdout.length;
      while (cachedBytes > 8 * 1024 * 1024) {
        const oldest = restored.keys().next().value!;
        cachedBytes -= restored.get(oldest)!.length;
        restored.delete(oldest);
      }
      return stdout;
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  })().finally(() => restorations.delete(key));
  restorations.set(key, task);
  return task;
}

export function distributionRoot() {
  return resolve(process.env.DECK_STUDIO_DIST || (packagedRoot ? resolve(packagedRoot, 'dist') : 'dist'));
}

export function assetPath(...parts: string[]) {
  return resolve(packagedRoot ? distributionRoot() : 'public', ...parts);
}

export async function packagedExample(path: string) {
  if(!packagedRoot||path!==resolve(distributionRoot(),legacyDemoName))return;
  const file=resolve(packagedRoot,exampleVariantFile);
  const info=await stat(file).catch((error:NodeJS.ErrnoException)=>{
    if(error.code!=='ENOENT')throw error;
  });
  if(!info)return;
  if(!info.isFile()||info.size>256*1024)throw new Error('Packaged example integrity check failed.');
  const {size,sha256,edits}=JSON.parse(await readFile(file,'utf8'));
  if(!Number.isSafeInteger(size)||size<1||size>exampleLimit||typeof sha256!=='string'||!/^[a-f0-9]{64}$/.test(sha256)){
    throw new Error('Packaged example integrity check failed.');
  }
  return {file,bytes:size as number,sha256,edits};
}
export async function restoreExample(plan: NonNullable<Awaited<ReturnType<typeof packagedExample>>>) {
  const base = await decompress(await readFile(resolve(distributionRoot(),demoName+'.stored.br')),{maxOutputLength:exampleLimit});
  const bytes = applyExampleVariant(base,plan.edits,plan.bytes);
  if(createHash('sha256').update(bytes).digest('hex')!==plan.sha256)throw new Error('Packaged example integrity check failed.');
  return bytes;
}

/** Read trusted package data in its original representation. The development
 * and ordinary source-service paths continue to use the source artwork. */
export async function readAsset(path: string): Promise<Buffer> {
  try { return await readFile(path); }
  catch (error) {
    if (!packagedRoot || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    try { return await decompress(await readFile(path + '.stored.br')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const image = await packedImage(path);
      if (image) return restoreImage(image);
      const example = await packagedExample(path);
      if (example) return restoreExample(example);
      throw error;
    }
  }
}

export async function readAssetText(path: string) {
  return (await readAsset(path)).toString('utf8');
}

export async function assetStamp(path: string) {
  const readStamp = (file: string) => stat(file, {bigint: true});
  const info = await readStamp(path).catch(async error => {
    if (!packagedRoot || error.code !== 'ENOENT') throw error;
    const image = await packedImage(path);
    const example = image ? undefined : await packagedExample(path);
    return readStamp(image?.file ?? example?.file ?? path + '.stored.br');
  });
  return `${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
}
