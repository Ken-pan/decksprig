import {abortable,requestSignal} from '../async-abort';
export const sha256=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes))),b=>b.toString(16).padStart(2,'0')).join('');
export const dataUrl=(blob:Blob,signal?:AbortSignal)=>new Promise<string>((resolve,reject)=>{
  signal?.throwIfAborted();const reader=new FileReader();
  const cleanup=()=>{signal?.removeEventListener('abort',abort);reader.onload=null;reader.onerror=null;reader.onabort=null;};
  const canceled=()=>{cleanup();reject(signal?.reason??new DOMException('Canceled','AbortError'));};
  const abort=()=>{reader.abort();canceled();};
  reader.onload=()=>{const value=String(reader.result);cleanup();resolve(value);};
  reader.onerror=()=>{const error=reader.error;cleanup();reject(error);};reader.onabort=canceled;
  signal?.addEventListener('abort',abort,{once:true});reader.readAsDataURL(blob);
});
export async function imagePixels(blob:Blob,signal?:AbortSignal){
  signal?.throwIfAborted();
  const decoding=createImageBitmap(blob,{premultiplyAlpha:'none',colorSpaceConversion:'none'});
  void decoding.then(bitmap=>{if(signal?.aborted)bitmap.close();},()=>{});
  const bitmap=await abortable(decoding,signal);
  if(signal?.aborted){bitmap.close();signal.throwIfAborted();}
  if(bitmap.width*bitmap.height>20_000_000){bitmap.close();throw new Error('This image exceeds the pixel limit.');}
  const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),context=canvas.getContext('2d',{willReadFrequently:true})!;
  context.drawImage(bitmap,0,0);bitmap.close();return {canvas,context,pixels:context.getImageData(0,0,canvas.width,canvas.height)};
}
export async function checkedBlob(url:string,signal?:AbortSignal){const response=await fetch(url,{signal:requestSignal(signal)});if(!response.ok)throw new Error('The image could not be loaded. Download it from its source and upload it here.');const blob=await response.blob();if(blob.size>12_000_000)throw new Error('Choose an image smaller than 12 MB.');return blob;}
