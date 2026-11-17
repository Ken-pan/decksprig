import {readBodyTextClipboard,readBodyHtmlClipboard,type BodyTextClipboard} from './body-text-clipboard-codec';
/** Large internal copies contain no media, but can still have many typed runs. */
export function prepareBodyTextClipboard(raw:string,fromHtml=false):Promise<BodyTextClipboard|undefined>{
  if(raw.length>(fromHtml?240_000_000:80_000_000))return Promise.reject(Error('This selection is too large for the clipboard. Copy less text.'));
  if(raw.length<=262144)return Promise.resolve(fromHtml?readBodyHtmlClipboard(raw):readBodyTextClipboard(raw));
  return new Promise((resolve,reject)=>{
    let worker:Worker;try{worker=new Worker(new URL('./body-text-clipboard.worker.ts',import.meta.url),{type:'module'});}catch{reject(Error('Formatted text could not be read. Paste as plain text or retry.'));return;}
    const finish=(value?:BodyTextClipboard,error?:string)=>{clearTimeout(timer);worker.terminate();if(error)reject(Error(error));else resolve(value);};
    const timer=setTimeout(()=>finish(undefined,'This text took too long to read. Copy a smaller selection and retry.'),15_000);
    worker.onmessage=event=>finish(event.data.value,event.data.error);
    worker.onerror=event=>{event.preventDefault();finish(undefined,'Formatted text could not be read. Paste as plain text or retry.');};
    worker.onmessageerror=()=>finish(undefined,'Formatted text could not be read. Copy the text again.');worker.postMessage({raw,fromHtml});
  });
}
