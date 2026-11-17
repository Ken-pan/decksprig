/** Cancel the caller promptly while still observing late rejections. */
export function abortable<T>(work:Promise<T>,signal?:AbortSignal):Promise<T> {
  if (!signal) return work;
  if (signal.aborted) { void work.catch(() => {}); return Promise.reject(signal.reason); }
  return new Promise<T>((resolve,reject) => {
    const abort = () => { cleanup(); reject(signal.reason); };
    const cleanup = () => signal.removeEventListener('abort',abort);
    signal.addEventListener('abort',abort,{once:true});
    work.then(value => { cleanup(); resolve(value); },error => { cleanup(); reject(error); });
  });
}
export function requestSignal(signal?:AbortSignal,timeout=30000) {
  return signal ? AbortSignal.any([signal,AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
}

/** Successful values are reusable; each pending read has independent subscribers.
 * Canceling the last subscriber releases its network request and permits retry. */
export class SharedRequest<T> {
  private entry?:{controller:AbortController;promise:Promise<T>;subscribers:number;settled:boolean};
  constructor(private load:(signal:AbortSignal)=>Promise<T>,private keepValue=true) {}
  get(signal?:AbortSignal):Promise<T> {
    signal?.throwIfAborted();
    let entry=this.entry;
    if (!entry) {
      const controller=new AbortController();
      entry={controller,promise:undefined as unknown as Promise<T>,subscribers:0,settled:false};
      const current=entry;
      current.promise=Promise.resolve().then(() => this.load(controller.signal)).then(value => {
        current.settled=true;if(!this.keepValue&&this.entry===current)this.entry=undefined;return value;
      },error => {
        current.settled=true;if(this.entry===current)this.entry=undefined;throw error;
      });
      this.entry=current;
    }
    const current=entry;current.subscribers++;
    return abortable(current.promise,signal).finally(() => {
      current.subscribers--;
      if (!current.subscribers && !current.settled) {
        if(this.entry===current)this.entry=undefined;
        current.controller.abort();
      }
    });
  }
}
