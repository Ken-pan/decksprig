import { jsonRequest } from './json-request';
import type {Deck} from './model';
import {packDocumentMedia} from './document-media-transport';
import {documentMediaUpdate,type DocumentSaveReceipt,type SavedMediaBase} from './document-media-update';

type Reply = {type: 'ready'} | {type: 'result'; id: number; value?: unknown; error?: string; status?: number};
type Pending = {resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>};

// No request is sent before the worker acknowledges startup. Startup failures
// can safely fall back; a failure after dispatch must never silently replay a PUT.
export class BackgroundDocumentSaver {
  private worker?: Worker;
  private ready?: Promise<boolean>;
  private pending = new Map<number, Pending>();
  private sequence = 0;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private failWorker?: () => void;
  constructor(private createWorker: () => Worker = () => new Worker(new URL('./document-save.worker.ts', import.meta.url), {type: 'module'}), private idleMs = 1500, private failureMessage = 'Could not finish saving. Keep this tab open and retry saving or export a copy.', private requestTimeoutMs = 120_000) {}

  private releaseIdle(worker:Worker) {
    clearTimeout(this.idleTimer);
    if(this.pending.size)return;
    this.idleTimer=setTimeout(()=>{
      if(this.worker!==worker||this.pending.size)return;
      worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;worker.terminate();
      this.worker=undefined;this.ready=undefined;this.idleTimer=undefined;this.failWorker=undefined;
    },this.idleMs);
    // Node test doubles should not keep the test process alive for idle cleanup.
    if(typeof this.idleTimer==='object')this.idleTimer.unref?.();
  }

  private start(): Promise<boolean> {
    if (this.ready) return this.ready;
    let worker: Worker;
    try { worker = this.createWorker(); } catch { return Promise.resolve(false); }
    this.worker = worker;
    this.ready = new Promise(resolve => {
      let started = false;
      const timer = setTimeout(() => fail(), 5000);
      const fail = () => {
        if (this.worker !== worker) return;
        clearTimeout(timer);clearTimeout(this.idleTimer);worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;worker.terminate();
        this.worker = undefined; this.ready = undefined; this.failWorker = undefined;
        for (const waiter of this.pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error(this.failureMessage)); }
        this.pending.clear();
        if (!started) resolve(false);
      };
      this.failWorker = fail;
      worker.onerror = event => { event.preventDefault(); fail(); };
      worker.onmessageerror = fail;
      worker.onmessage = event => {
        const reply = event.data as Reply;
        if (reply.type === 'ready') { started = true; clearTimeout(timer); resolve(true); return; }
        const waiter = this.pending.get(reply.id); if (!waiter) return;
        clearTimeout(waiter.timer);
        this.pending.delete(reply.id);
        if (reply.error) waiter.reject(Object.assign(new Error(reply.error), {status: reply.status}));
        else waiter.resolve(reply.value);
        this.releaseIdle(worker);
      };
    });
    return this.ready;
  }

  async save<T = any>(url: string, body: unknown, fallback?: () => Promise<T>, method: 'PUT' | 'POST' = 'PUT', minimal: boolean | 'receipt' = false): Promise<T> {
    clearTimeout(this.idleTimer);
    if (!(await this.start())) return fallback?fallback():jsonRequest<T>(url,method,body,fetch,{minimal,compact:true});
    clearTimeout(this.idleTimer);
    const worker = this.worker;
    if (!worker) throw new Error(this.failureMessage);
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      // A worker or request that never replies must not hold the shared editor
      // save flight forever. Its write outcome is uncertain: reject, never replay.
      const timer = setTimeout(() => this.failWorker?.(), this.requestTimeoutMs);
      this.pending.set(id, {resolve, reject, timer});
      try {
        const input=body as {schema?:string;deck?:Deck};
        const deck=input?.schema==='deck-studio/1'?body as Deck:input?.deck?.schema==='deck-studio/1'?input.deck:undefined;
        const media=deck?packDocumentMedia(deck):undefined;
        const payload=media?.references.length?(input.schema==='deck-studio/1'?media.deck:{...input,deck:media.deck}):body;
        worker.postMessage({id,url,body:payload,method,minimal,...(media?.references.length?{media}:{})});
      }
      catch (error) { clearTimeout(timer);this.pending.delete(id); reject(error);this.releaseIdle(worker); }
    });
  }
}

const saver = new BackgroundDocumentSaver();
export async function saveDocumentInBackground(url: string, body: {deck: Deck; expectedRevision: number}, base?: SavedMediaBase): Promise<DocumentSaveReceipt | undefined> {
  const update = base?.deck.revision === body.expectedRevision ? documentMediaUpdate(body.deck, base) : undefined;
  if (update) {
    try {
      return await saver.save(url, {...body, deck: update}, undefined, 'PUT', 'receipt');
    } catch (error) {
      // Only an explicit precondition failure tells us no update was applied.
      // Conflicts and uncertain writes keep the existing recovery behavior.
      if ((error as {status?:number}).status !== 412) throw error;
    }
  }
  return saver.save(url, body, undefined, 'PUT', 'receipt');
}
export function createDocumentInBackground<T = any>(url: string, body: unknown, minimal: boolean | 'receipt' = false): Promise<T> {
  return saver.save<T>(url,body,undefined,'POST',minimal);
}
