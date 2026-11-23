import { libraryAssetCopy } from '../src/core/library-copy';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { ORIGINAL_ACCENT, normalizeAccent } from '../public/resources/accent-engine.js';
import { attributionText, type ResourceItem } from '../src/core/resources';
import { assetPath, assetStamp, packagedRoot, readAsset, packedImage, restoreImage } from './runtime-assets';

export type BlueBlackAsset = {id: string; file: string; title: string; type: string; theme: string; keywords: string[]; alt: string; suggestedUsage: string; width: number; height: number; sha256: string};
const root = assetPath('resources/blue-black-v1'), manifestPath = resolve(root, 'manifest.json');
let catalog: {stamp: string; assets: Promise<BlueBlackAsset[]>} | undefined;
async function readCatalog() {
  const stamp = await assetStamp(manifestPath);
  if (catalog?.stamp !== stamp) {
    const assets = readAsset(manifestPath).then(raw => (JSON.parse(raw.toString('utf8')).assets as BlueBlackAsset[]).map(libraryAssetCopy)).catch(error => {
      if (catalog?.assets === assets) catalog = undefined;
      throw error;
    });
    catalog = {stamp, assets};
  }
  return catalog.assets;
}
export async function blueBlackLibrary(): Promise<BlueBlackAsset[]> {
  return structuredClone(await readCatalog());
}
export function blueBlackItem(asset: BlueBlackAsset): ResourceItem {
  const resource = {id: `blue-black:${asset.id}`, kind: 'illustration' as const, provider: 'Blue & Black', title: asset.title,
    creator: 'Deckleaf · AI-generated', sourceUrl: 'http://127.0.0.1:4310/resources/blue-black-v1/index.html',
    license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attributionRequired: false, attribution: '', licenseNotice: `Project-generated AI artwork dedicated by Ken Pan under CC0 1.0, to the extent he holds rights. Original SHA-256: ${asset.sha256}`,
    originalSha256: asset.sha256, color: ORIGINAL_ACCENT};
  return {...resource, attribution: attributionText(resource), colorable: true, collection: 'blue-black', illustrationType: asset.type === 'scene' ? 'scene' : 'spot', category: asset.type === 'character' ? 'people' : 'work', tags: [...asset.keywords, asset.theme, asset.suggestedUsage],
    previewUrl: `/api/resources/preview?id=${encodeURIComponent(resource.id)}`, width: asset.width, height: asset.height};
}
type RenderJob = {resolve: (bytes: Buffer) => void; reject: (error: Error) => void};
type ImageWorker = {thread: Worker; jobs: Map<number, RenderJob>; idleTimer?: ReturnType<typeof setTimeout>};
const imageWorkers: Array<ImageWorker | undefined> = [undefined, undefined];
let nextJob = 0;

function imageWorker(slot: number): ImageWorker {
  const current = imageWorkers[slot];
  if (current) return current;
  const thread = new Worker(new URL('./illustration-image.worker.mjs', import.meta.url), {
    execArgv: [],
    workerData: {packed: Boolean(packagedRoot)},
  });
  const jobs = new Map<number, RenderJob>();
  const worker: ImageWorker = {thread, jobs};
  function fail(error: Error) {
    clearTimeout(worker.idleTimer);
    if (imageWorkers[slot] === worker) imageWorkers[slot] = undefined;
    for (const job of jobs.values()) job.reject(error);
    jobs.clear();
  }
  thread.on('error', fail);
  thread.on('exit', () => fail(new Error('The illustration renderer stopped. Try again.')));
  thread.on('message', ({id, result, error}: {id: number; result?: Uint8Array; error?: string}) => {
    const job = jobs.get(id);
    if (!job) return;
    jobs.delete(id);
    if (!jobs.size) idle(worker, slot);
    if (result) job.resolve(Buffer.from(result.buffer, result.byteOffset, result.byteLength));
    else job.reject(new Error(error || 'Unable to render the illustration.'));
  });
  imageWorkers[slot] = worker;
  return worker;
}

function idle(worker: ImageWorker, slot: number) {
  worker.thread.unref();
  worker.idleTimer = setTimeout(() => {
    imageWorkers[slot] = undefined;
    void worker.thread.terminate();
  }, 60_000).unref();
}

function renderImage(path: string, accent: string, preview: boolean, previewPath?: string, original?: Buffer, previewWebpSha256?: string) {
  // Keep a file's color variants on the same thread so they reuse its pixels.
  let hash = 0;
  for (let i = 0; i < path.length; i++) hash = (Math.imul(hash, 31) + path.charCodeAt(i)) >>> 0;
  const slot = hash % imageWorkers.length;
  const worker = imageWorker(slot), {thread, jobs} = worker;
  const id = nextJob++;
  return new Promise<Buffer>((resolve, reject) => {
    clearTimeout(worker.idleTimer);
    thread.ref();
    jobs.set(id, {resolve, reject});
    try { thread.postMessage({id, path, accent, preview, previewPath, original, previewWebpSha256}); }
    catch (error) {
      jobs.delete(id);
      if (!jobs.size) idle(worker, slot);
      reject(error);
    }
  });
}

export async function blueBlackImage(id: string, color: string, preview: boolean) {
  const asset = (await readCatalog()).find(a => `blue-black:${a.id}` === id);
  if (!asset || !/^png\/[\w-]+\.png$/.test(asset.file)) throw new Error('This illustration does not exist.');
  const path = resolve(root, asset.file);
  const accent = normalizeAccent(color);
  const image = await packedImage(path);
  const bytes = accent === ORIGINAL_ACCENT && !preview ? await readAsset(path)
    : await renderImage(path, accent, preview, preview ? image?.previewPath : undefined,
      image && (!preview || !image.previewPath) ? await restoreImage(image) : undefined,
      preview ? image?.previewWebpSha256 : undefined);
  return {item: blueBlackItem(asset), bytes};
}
