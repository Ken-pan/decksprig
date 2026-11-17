import {imageDimensions} from './image-dimensions';
import {loadPptxImage} from './pptx-image';

type Entry={src:string;users:number;controller:AbortController;ready:Promise<string|undefined>;resolve:(url:string|undefined)=>void;url?:string};
const entries=new Map<string,Entry>(),queue:Entry[]=[];
let running=0;
const MAX_CONCURRENT=2;
const MAX_EDGE=768;

async function preview(entry:Entry):Promise<string|undefined>{
  const blob=await loadPptxImage(entry.src,'Slide thumbnail', (url,options)=>fetch(url,{...options,signal:entry.controller.signal}));
  const size=await imageDimensions(blob,'Slide thumbnail',entry.controller.signal);
  if(entry.controller.signal.aborted)return;
  // Small images need no second encoded rendition. GIF/SVG never enter this path.
  if(Math.max(size.w,size.h)<=MAX_EDGE)return entry.src;
  const scale=MAX_EDGE/Math.max(size.w,size.h),w=Math.max(1,Math.round(size.w*scale)),h=Math.max(1,Math.round(size.h*scale));
  const bitmap=await createImageBitmap(blob,{resizeWidth:w,resizeHeight:h,resizeQuality:'high'});
  let canvas:OffscreenCanvas|undefined;
  try{
    canvas=new OffscreenCanvas(w,h);
    canvas.getContext('2d')!.drawImage(bitmap,0,0);
    if(entry.controller.signal.aborted)return;
    const output=await canvas.convertToBlob({type:'image/png'});
    if(entry.controller.signal.aborted)return;
    entry.url=URL.createObjectURL(output);return entry.url;
  }finally{bitmap.close();if(canvas){canvas.width=0;canvas.height=0;}}
}
async function renderEntry(entry:Entry){
  try{entry.resolve(await preview(entry));}catch{entry.resolve(undefined);}
  finally{if(!entry.users&&entry.url){URL.revokeObjectURL(entry.url);entry.url=undefined;}running--;drain();}
}
function drain(){
  while(running<MAX_CONCURRENT&&queue.length){const entry=queue.shift()!;if(!entry.users)continue;running++;void renderEntry(entry);}
}

/** At most two decodes, shared by visible thumbnails; no cache survives its last user. */
export function acquireThumbnail(src:string):{ready:Promise<string|undefined>;release:()=>void}{
  if(typeof OffscreenCanvas==='undefined'||typeof createImageBitmap==='undefined'||!(/^data:image\/(?:png|jpeg|webp);base64,/i.test(src)||/^\/examples\/.*\.(?:png|jpe?g|webp)(?:[?#]|$)/i.test(src)))return {ready:Promise.resolve(src),release:()=>{}};
  let entry=entries.get(src);
  if(!entry){let resolve!:Entry['resolve'];const ready=new Promise<string|undefined>(ok=>resolve=ok);entry={src,users:0,controller:new AbortController(),ready,resolve};entries.set(src,entry);queue.push(entry);}
  const owned=entry;owned.users++;void drain();let released=false;
  return {ready:owned.ready,release(){
    if(released)return;released=true;
    if(--owned.users)return;
    if(entries.get(src)===owned)entries.delete(src);owned.controller.abort();
    const index=queue.indexOf(owned);if(index>=0){queue.splice(index,1);owned.resolve(undefined);}
    if(owned.url){URL.revokeObjectURL(owned.url);owned.url=undefined;}
  }};
}
