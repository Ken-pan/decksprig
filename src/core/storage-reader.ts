import {BackgroundDocumentSaver} from './background-document-save';
import {restoreStorageRead} from './storage-read-packet';
const reader=new BackgroundDocumentSaver(()=>new Worker(new URL('./storage-read.worker.ts',import.meta.url),{type:'module'}),0,'Could not finish reading browser storage. Your stored documents are retained. Retry opening.');
import {readStorageDirect} from './storage-read-direct';
export async function readStorageInBackground(kind:string,input:any):Promise<any>{return restoreStorageRead(await reader.save(kind,input,()=>readStorageDirect(kind,input)));}
