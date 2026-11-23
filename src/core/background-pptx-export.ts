import {abortable} from './async-abort';
import type {Deck} from './model';
import {packDocumentMedia} from './document-media-transport';
export type PptxExportRequest = {deck:Deck;original:boolean;template?:boolean;dimensions:Record<string,{w:number;h:number}>};

// Each export owns one worker. Terminate it after transferring the result so
// the export engine, decoded media and temporary ZIP allocations are released.
export async function buildPptxInBackground(request:PptxExportRequest, fallback:()=>Promise<Uint8Array>, createWorker=()=>new Worker(new URL('./pptx-export.worker.ts',import.meta.url),{type:'module'}),signal?:AbortSignal):Promise<Uint8Array> {
  signal?.throwIfAborted();
  // PptxGenJS builds a PNG preview for SVG through Image and canvas. Workers
  // have neither API; keep vector artwork and use the yielding DOM export path.
  const svg=(src?:string)=>Boolean(src&&(src.startsWith('data:image/svg')||/\.svg(?:[?#]|$)/i.test(src)));
  if(request.deck.slides.some(slide=>request.original&&slide.source?.render?svg(slide.source.render):slide.elements.some(e=>!e.hidden&&(e.type==='image'?svg(e.src):e.type==='prototype'?svg(e.prototype?.poster):false))))return abortable(fallback(),signal);
  let worker:Worker;
  try { worker=createWorker(); } catch { return abortable(fallback(),signal); }
  const bytes = await new Promise<Uint8Array | undefined>((resolve,reject)=>{
    let dispatched=false,finished=false;
    const timer=setTimeout(()=>fail(new Error('The PowerPoint export tool did not start.')),10000);
    let jobTimer:ReturnType<typeof setTimeout> | undefined;
    const close=()=>{finished=true;clearTimeout(timer);clearTimeout(jobTimer);worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;worker.terminate();signal?.removeEventListener('abort',abort);};
    const abort=()=>{if(finished)return;close();reject(signal?.reason);};
    signal?.addEventListener('abort',abort,{once:true});
    const fail=(error:Error)=>{if(finished)return;close();if(dispatched)reject(error);else resolve(undefined);};
    worker.onerror=event=>{event.preventDefault();fail(new Error('Could not finish the PowerPoint export. Try again; your document is unchanged.'));};
    worker.onmessageerror=()=>fail(new Error('Could not read the PowerPoint export.'));
    worker.onmessage=event=>{
      if(finished)return;
      const reply=event.data;
      if(reply.type==='ready'){
        if(reply.bitmapSupported===false){close();resolve(undefined);return;}
        if(dispatched)return;dispatched=true;clearTimeout(timer);
        jobTimer=setTimeout(()=>fail(new Error('PowerPoint export timed out. Retry exporting.')),120000);
        try{worker.postMessage({...request,media:packDocumentMedia(request.deck),deck:undefined});}catch(error){fail(error as Error);}return;
      }
      if(reply.type==='result'&&dispatched){close();if(reply.error)reject(new Error(reply.error));else resolve(reply.bytes);}
    };
  });
  signal?.throwIfAborted();
  return bytes ?? abortable(fallback(),signal);
}
