import type {HtmlClipboard} from './html-clipboard';
/** Keep parsing arbitrary external markup off the editing thread. */
export function prepareHtmlClipboard(html:string):Promise<HtmlClipboard|undefined>{
  if(html.length>2_000_000)return Promise.reject(Error('Paste up to 2 MB of formatted content. Copy a smaller range.'));
  return new Promise((resolve,reject)=>{
    let worker:Worker;try{worker=new Worker(new URL('./html-clipboard.worker.ts',import.meta.url),{type:'module'});}catch{reject(Error('Formatted paste is unavailable. Paste as text or retry.'));return;}
    const finish=(value?:HtmlClipboard,error?:string)=>{clearTimeout(timer);worker.terminate();if(error)reject(Error(error));else resolve(value);};
    const timer=setTimeout(()=>finish(undefined,'Formatted paste took too long. Copy a smaller range and retry.'),15_000);
    worker.onmessage=event=>finish(event.data.value,event.data.error);
    worker.onerror=event=>{event.preventDefault();finish(undefined,'Formatted paste could not be read. Paste as text or retry.');};
    worker.onmessageerror=()=>finish(undefined,'Formatted paste could not be read. Copy the content again.');
    worker.postMessage(html);
  });
}
