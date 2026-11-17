import {readStorageDirect} from './storage-read-direct';
import {packStorageRead} from './storage-read-packet';
const channel=globalThis as unknown as {postMessage:(value:unknown)=>void;onmessage:(event:MessageEvent)=>void};
channel.onmessage=async event=>{const {id,url,body}=event.data;try{channel.postMessage({type:'result',id,value:packStorageRead(await readStorageDirect(url,body))});}catch(error){channel.postMessage({type:'result',id,error:(error as Error).message});}};
channel.postMessage({type:'ready'});
