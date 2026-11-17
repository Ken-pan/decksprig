import {decodeBase64} from './base64';

/** Embedded raster media is local data; decoding it does not need network access. */
export async function loadPptxImage(src:string,name:string,load:typeof fetch=fetch):Promise<Blob>{
  const embedded=/^data:(image\/[^;,]+);base64,/i.exec(src);
  if(embedded){
    const payload=src.slice(embedded[0].length);
    return new Blob([decodeBase64(payload.includes('%')?decodeURIComponent(payload):payload)],{type:embedded[1]});
  }
  const response=await load(src);
  if(!response.ok)throw new Error(`Cannot read image: ${name}`);
  return response.blob();
}
