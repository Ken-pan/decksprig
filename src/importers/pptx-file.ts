import type {Deck} from '../core/model';
import {restoreDocumentMedia} from '../core/document-media-transport';
import type {PptxWorkerReply} from './pptx-import.worker';

async function parseInWorker(file: File, sourceReady?: () => void): Promise<Deck | undefined> {
  let worker: Worker;
  try { worker = new Worker(new URL('./pptx-import.worker.ts', import.meta.url), {type: 'module'}); }
  catch { return; }
  try {
    return await new Promise<Deck | undefined>((resolve, reject) => {
      worker.onmessage = ({data}: MessageEvent<PptxWorkerReply>) => {
        try {
          if (data.type === 'source-ready') sourceReady?.();
          else if (data.type === 'error') reject(new Error(data.message));
          else resolve(restoreDocumentMedia(data.value));
        } catch (error) { reject(error); }
      };
      worker.onerror = event => { event.preventDefault(); resolve(undefined); };
      worker.onmessageerror = () => resolve(undefined);
      // A File is immutable and can be read by either worker or fallback.
      try { worker.postMessage(file); } catch { resolve(undefined); }
    });
  } finally { worker.terminate(); }
}

export async function readPptxFile(file: File, sourceReady?: () => void) {
  const parsed = await parseInWorker(file, sourceReady);
  if (parsed) return parsed;
  const {importPptx} = await import('./pptx');
  return importPptx(await file.arrayBuffer(), file.name, sourceReady);
}
