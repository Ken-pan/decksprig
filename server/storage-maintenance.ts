import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,readFile,readdir,stat,lstat,rename,unlink,open,chmod} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {createGzip,createGunzip} from 'node:zlib';
import {pipeline} from 'node:stream/promises';
import {Transform,Writable} from 'node:stream';
import {isStoredDocument,prepareStoredDocument} from '../src/core/document-storage';
import {sameDocumentData} from '../src/core/document-data';
import {readStreamingJson} from './stream-document-json';
import {storageRoot,withStorageLock,atomicStorageJson,readDeckStorage,writeMedia,setStorageMode,storageMode,fileSignature,assertStorageLock,durableRename} from './media-storage';

type Entry={path:string;backup:string;originalSha:string;mode:number;manifestSha:string;before:number;after:number;state:'prepared'|'converted'|'restored'};
type Journal={schema:'deck-studio/storage-migration-1';id:string;state:string;entries:Entry[];errors:{path:string;message:string}[]};
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
async function hashFile(path:string){const h=createHash('sha256');for await(const c of createReadStream(path))h.update(c);return h.digest('hex');}
async function files(root:string){const result:string[]=[];for(const kind of ['decks','history']){await mkdir(resolve(root,kind),{recursive:true});for(const name of await readdir(resolve(root,kind)))if(/^[\w.:-]+\.json$/.test(name)){const path=resolve(root,kind,name);if((await lstat(path)).isFile())result.push(path);}}return result.sort();}
async function backupFile(source:string,target:string){
 await mkdir(dirname(target),{recursive:true,mode:0o700});const temp=target+'.'+crypto.randomUUID()+'.tmp',hash=createHash('sha256');
 try{await pipeline(createReadStream(source),new Transform({transform(chunk,_enc,done){hash.update(chunk);done(null,chunk);}}),createGzip({level:3}),createWriteStream(temp,{flags:'wx',mode:0o600}));const expected=hash.digest('hex'),verified=createHash('sha256');await pipeline(createReadStream(temp),createGunzip(),new Writable({write(chunk,_enc,done){verified.update(chunk);done();}}));if(verified.digest('hex')!==expected)throw Error('Backup verification failed.');const file=await open(temp,'r');try{await file.sync();}finally{await file.close();}await durableRename(temp,target);return expected;}catch(error){await unlink(temp).catch(()=>{});throw error;}
}
async function restoreBackup(source:string,target:string,entry:Entry,root:string){
 const temp=target+'.'+crypto.randomUUID()+'.tmp',hash=createHash('sha256');
 try{await pipeline(createReadStream(source),createGunzip(),new Transform({transform(chunk,_enc,done){hash.update(chunk);done(null,chunk);}}),createWriteStream(temp,{flags:'wx',mode:0o600}));if(hash.digest('hex')!==entry.originalSha)throw Error('The rollback snapshot is damaged.');await chmod(temp,entry.mode);const file=await open(temp,'r');try{await file.sync();}finally{await file.close();}assertStorageLock(root);await durableRename(temp,target);}catch(error){await unlink(temp).catch(()=>{});throw error;}
}
export async function localStorageStatus(root:string){
 let recordBytes=0,backupBytes=0,mediaBytes=0,records=0;for(const path of await files(root)){recordBytes+=(await stat(path)).size;records++;}
 async function sum(dir:string):Promise<number>{let total=0;for(const entry of await readdir(dir,{withFileTypes:true}).catch(()=>[])){const path=resolve(dir,entry.name);if(entry.isDirectory())total+=await sum(path);else if(entry.isFile())total+=(await stat(path)).size;}return total;}
 backupBytes=await sum(resolve(storageRoot(root),'backups'));mediaBytes=await sum(resolve(storageRoot(root),'assets'));
 return {mode:await storageMode(root),records,recordBytes,mediaBytes,backupBytes,activeBytes:recordBytes+mediaBytes,totalBytes:recordBytes+mediaBytes+backupBytes};
}
/** Cooperative writers are locked; older servers must be stopped for offline CLI migration. */
export async function migrateLocalStorage(root:string,progress: (value:unknown)=>void=()=>{},failAfter=Infinity){
 return withStorageLock(root,async()=>{
  const id=new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID(),base=resolve(storageRoot(root),'backups',id),journal:Journal={schema:'deck-studio/storage-migration-1',id,state:'migrating',entries:[],errors:[]},journalPath=resolve(base,'journal.json');await mkdir(base,{recursive:true,mode:0o700});
  const checkpoint=()=>atomicStorageJson(journalPath,journal,root);await checkpoint();let unchanged=0;
  try{
   for(const path of await files(root)){
    const rel=relative(root,path);let entry:Entry|undefined;
    try{
     const signature=await fileSignature(path),raw=await readStreamingJson(path);if(isStoredDocument(raw)){await readDeckStorage(path,root);unchanged++;continue;}
     const deck=await import('../src/core/model').then(({validateDeck})=>validateDeck(raw)),prepared=await prepareStoredDocument(deck);if(!isStoredDocument(prepared.record)){unchanged++;continue;}
     const backup=rel+'.gz',originalSha=await backupFile(path,resolve(base,backup));if(await fileSignature(path)!==signature)throw Error('The source changed during migration; it was left untouched.');
     const encoded=JSON.stringify(prepared.record);entry={path:rel,backup,originalSha,mode:(await stat(path)).mode&0o777,manifestSha:sha(encoded),before:(await stat(path)).size,after:Buffer.byteLength(encoded),state:'prepared'};journal.entries.push(entry);await checkpoint();
     await writeMedia(root,prepared.media);if(await fileSignature(path)!==signature)throw Error('The source changed before commit; it was left untouched.');
     await atomicStorageJson(path,prepared.record,root);if(!sameDocumentData(deck,await readDeckStorage(path,root)))throw Error('The migrated document does not match its source.');
     entry.state='converted';await checkpoint();progress({converted:journal.entries.filter(e=>e.state==='converted').length,path:rel});
     if(journal.entries.filter(e=>e.state==='converted').length>=failAfter)throw Object.assign(Error('Injected migration interruption'),{injected:true});
    }catch(error:any){
     if(error.injected)throw error;
     if(entry&&await hashFile(path).catch(()=> '')===entry.manifestSha){await restoreBackup(resolve(base,entry.backup),path,entry,root);entry.state='restored';}
     journal.errors.push({path:rel,message:error.message});await checkpoint();
    }
   }
   await setStorageMode(root,'compact');journal.state='complete';await checkpoint();return {batchId:id,converted:journal.entries.filter(e=>e.state==='converted').length,unchanged,errors:journal.errors,...await localStorageStatus(root)};
  }catch(error){journal.state='interrupted';await checkpoint();throw error;}
 });
}
export async function rollbackLocalStorage(root:string,progress:(value:unknown)=>void=()=>{}){
 return withStorageLock(root,async()=>{
  await setStorageMode(root,'legacy');const snapshots=new Map<string,{entry:Entry;base:string}>(),backups=resolve(storageRoot(root),'backups');
  for(const name of (await readdir(backups).catch(()=>[])).sort()){const base=resolve(backups,name);try{const journal=JSON.parse(await readFile(resolve(base,'journal.json'),'utf8')) as Journal;for(const entry of journal.entries){if(!/^(decks|history)\/[\w.:-]+\.json$/.test(entry.path)||entry.backup!==entry.path+'.gz'||!/^[a-f0-9]{64}$/.test(entry.originalSha)||!/^[a-f0-9]{64}$/.test(entry.manifestSha))throw new Error('A storage rollback receipt is invalid.');snapshots.set(entry.path,{entry,base});}}catch(error:any){if(error.code!=='ENOENT')throw error;}}
  let restored=0,exact=0;const errors:{path:string;message:string}[]=[];
  for(const path of await files(root)){
   const rel=relative(root,path);
   try{const raw=await readStreamingJson(path);if(!isStoredDocument(raw))continue;const snapshot=snapshots.get(rel);
    if(snapshot&&await hashFile(path)===snapshot.entry.manifestSha){await restoreBackup(resolve(snapshot.base,snapshot.entry.backup),path,snapshot.entry,root);exact++;}
    else {const latest=await readDeckStorage(path,root);await atomicStorageJson(path,latest,root);}
    restored++;progress({restored,path:rel});
   }catch(error:any){errors.push({path:rel,message:error.message});}
  }
  return {restored,byteExactSnapshots:exact,errors,...await localStorageStatus(root)};
 });
}
