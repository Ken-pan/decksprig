/** Read oriented browser dimensions without putting a data URI in its image cache. */
export function imageDimensions(blob:Blob,name:string,signal?:AbortSignal):Promise<{w:number;h:number}> {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new DOMException('Cancelled','AbortError'));return;}
    const url=URL.createObjectURL(blob),image=new Image();
    const finish=(error?:Error)=>{
      const size={w:image.naturalWidth,h:image.naturalHeight};
      image.onload=null;image.onerror=null;image.removeAttribute('src');URL.revokeObjectURL(url);signal?.removeEventListener('abort',cancel);
      if(error)reject(error);else if(!size.w||!size.h)reject(new Error(`Cannot read image: ${name}`));else resolve(size);
    };
    const cancel=()=>finish(new DOMException('Cancelled','AbortError'));
    signal?.addEventListener('abort',cancel,{once:true});
    image.onload=()=>finish();image.onerror=()=>finish(new Error(`Cannot read image: ${name}`));image.src=url;
  });
}
