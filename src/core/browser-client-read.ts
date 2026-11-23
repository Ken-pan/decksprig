import {jsonRequest as direct} from './json-request';
import {readStorageInBackground} from './storage-reader';
function browserClientRead(url:string,fallback:()=>Promise<any>){
 const target=new URL(url,location.href),path=target.pathname;
 const history=path.match(/^\/api\/decks\/([\w.:-]+)\/history(?:\/(\d+))?$/);if(history)return readStorageInBackground('history',{id:history[1],revision:history[2]===undefined?undefined:Number(history[2])});
 const preview=path.match(/^\/api\/decks\/([\w.:-]+)\/preview$/);if(preview)return readStorageInBackground('preview',{id:preview[1],revision:target.searchParams.has('revision')?Number(target.searchParams.get('revision')):undefined});
 const document=path.match(/^\/api\/decks\/([\w.:-]+)$/);if(document)return readStorageInBackground('document',{id:document[1]});
 if(path==='/api/decks')return readStorageInBackground('list',{preview:target.searchParams.get('view')!=='summary'});
 return fallback();
}

export const browserJsonRequest:typeof direct=async(url,method='GET',body,transport=fetch,options={})=>{
 if(method!=='GET')return direct(url,method,body,transport,options);
 if(options.signal?.aborted)throw new DOMException('Cancelled','AbortError');
 const value=await browserClientRead(url,()=>direct(url,method,body,transport,options));
 if(options.signal?.aborted)throw new DOMException('Cancelled','AbortError');return value;
};
