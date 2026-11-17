import {mkdir,readFile,open,rename,unlink,stat,lstat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {isUtf8} from 'node:buffer';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import type {BigIntStats} from 'node:fs';
import lockfile from 'proper-lockfile';
import {prepareStoredDocument,restoreVerifiedStoredDocument,storedDocumentMetadata,isStoredDocument,type StoredDocument} from '../src/core/document-storage';
import type {Deck} from '../src/core/model';
import {boundedDocumentJsonParts} from '../src/core/document-json-parts';
import {readDocumentJson} from './stream-document-json';
import {encodeCanonicalJsonAsset,encodeDocumentAsset,prepareStoredDocumentFrames} from './document-frame-response';

export const storageRoot=(root:string)=>resolve(root,'storage-v1');
const guards=new Map<string,()=>void>();
export async function withStorageLock<T>(root:string,work:()=>Promise<T>):Promise<T>{
 const directory=storageRoot(root);await mkdir(directory,{recursive:true,mode:0o700});let compromised:Error|undefined;
 const release=await lockfile.lock(root,{realpath:true,lockfilePath:resolve(directory,'write.lock'),stale:30000,update:5000,retries:{retries:650,factor:1,minTimeout:100,maxTimeout:100},onCompromised:error=>{compromised=error;}});
 guards.set(resolve(root),()=>{if(compromised)throw compromised;});
 try{const result=await work();if(compromised)throw compromised;return result;}
 finally{guards.delete(resolve(root));await release().catch(error=>{if(!compromised)throw error;});}
}
export async function durableRename(from:string,to:string){await rename(from,to);try{const dir=await open(dirname(to),'r');try{await dir.sync();}finally{await dir.close();}}catch(error:any){if(!['EINVAL','ENOTSUP','EISDIR'].includes(error.code))throw error;}}
export const assertStorageLock=(root:string)=>guards.get(resolve(root))?.();
export async function atomicStorageJson(path:string,value:unknown,root:string,onCommit?:(signature:string)=>void){
 await mkdir(dirname(path),{recursive:true,mode:0o700});
 const temp = path + '.' + crypto.randomUUID() + '.tmp';
 try {
   const file = await open(temp,'wx',0o600);
   try {
     for (const part of boundedDocumentJsonParts(value)) await file.writeFile(part,'utf8');
     await file.sync();
     assertStorageLock(root);
     await durableRename(temp,path);
     // Use the inode we wrote even if another writer replaces the path.
     if (onCommit) {
       const info = await file.stat({bigint:true}).catch(() => undefined);
       if (info) onCommit(storageFileSignature(info));
     }
   } finally { await file.close(); }
 } catch (error) {
   await unlink(temp).catch(() => {});
   throw error;
 }
}

const cloneFile = promisify(execFile);
const minimumCloneBytes = 4 * 1024 * 1024;

/** Only normal, private, large files benefit enough to launch macOS copy-on-write. */
export async function historyCloneSignature(path: string): Promise<string | undefined> {
  if (process.platform !== 'darwin') return;
  const info = await lstat(path, {bigint: true}).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (info?.isFile() && info.size >= minimumCloneBytes && (info.mode & 0o7777n) === 0o600n) {
    return storageFileSignature(info);
  }
}

/** Archive the exact validated file with a separate inode before replacing it. */
export async function cloneDeckHistory(source: string, target: string, signature: string, root: string): Promise<boolean> {
  const temp = `${target}.${crypto.randomUUID()}.tmp`;
  try {
    try {
      await cloneFile('/bin/cp', ['-c', source, temp], {timeout: 30_000, maxBuffer: 4096});
    } catch {
      // Unsupported volumes and copy errors can use the normal history writer.
      return false;
    }
    const file = await open(temp, 'r');
    try { await file.sync(); } finally { await file.close(); }
    if (await historyCloneSignature(source) !== signature) {
      throw Object.assign(new Error('This document was updated in another window. Your current changes are preserved. Export a copy before continuing.'), {status: 409});
    }
    assertStorageLock(root);
    await durableRename(temp, target);
    return true;
  } finally {
    await unlink(temp).catch(() => {});
  }
}
export async function storageMode(root:string):Promise<'compact'|'legacy'>{
 try{const state=JSON.parse(await readFile(resolve(storageRoot(root),'state.json'),'utf8'));return state.mode==='compact'?'compact':'legacy';}catch(error:any){if(error.code==='ENOENT')return 'legacy';throw error;}
}
export async function setStorageMode(root:string,mode:'compact'|'legacy'){await atomicStorageJson(resolve(storageRoot(root),'state.json'),{schema:'deck-studio/storage-control-1',mode},root);}
const assetPath=(root:string,id:string)=>{if(!/^[a-f0-9]{64}$/.test(id))throw new Error('Invalid media identity.');return resolve(storageRoot(root),'assets',id+'.json');};
type VerifiedMedia = ReadonlyMap<string, {id: string; signature: string}>;
type StorageSnapshot = {root: string; record: StoredDocument; media: Map<string, string>; verified: VerifiedMedia};

export async function readMedia(root:string,id:string):Promise<string>{
 return readMediaFile(assetPath(root,id));
}
async function readMediaBytes(path:string){
 const info=await lstat(path,{bigint:true});
 if(!info.isFile())throw new Error('Document media is missing or damaged.');
 const raw=await readFile(path);
 return {raw,info};
}
function parseMediaBytes(raw:Buffer,expectedId?:string){
 const value=JSON.parse(raw.toString('utf8'));
 if(typeof value!=='string')throw new Error('Document media is damaged.');
 if(expectedId)verifyMediaDigest(raw,value,expectedId);
 return value;
}
async function readMediaFile(path:string,expectedId?:string,onRead?:(value:string,signature:string)=>void):Promise<string>{
 const {raw,info}=await readMediaBytes(path);
 const value=parseMediaBytes(raw,expectedId);
 if(onRead)onRead(value,storageFileSignature(info));
 return value;
}
function checkMediaHash(actual:string,expected:string) {
 if(actual!==expected)throw new Error('Document media is missing or damaged. Restore a storage backup before continuing.');
}
function verifyMediaDigest(raw:Buffer,value:string,expectedId:string) {
 // Parsing already proved this is a string. With no surrounding whitespace,
 // escapes or invalid UTF-8, its original bytes are JSON.stringify(value).
 const canonical=raw[0]===34&&raw[raw.length-1]===34&&!raw.includes(92)&&isUtf8(raw);
 const actual=createHash('sha256').update(canonical?raw:JSON.stringify(value)).digest('hex');
 checkMediaHash(actual,expectedId);
}
async function readMediaFrame(root:string,id:string){
 const {raw}=await readMediaBytes(assetPath(root,id));
 const frame=encodeCanonicalJsonAsset(raw);
 if(!frame)return encodeDocumentAsset(parseMediaBytes(raw,id));
 checkMediaHash(createHash('sha256').update(raw).digest('hex'),id);
 return frame;
}
export function writeMedia(root:string,media:Map<string,string>){
 return persistMedia(root,media);
}
async function persistMedia(root:string,media:Map<string,string>,verified?:VerifiedMedia){
 await mkdir(resolve(storageRoot(root),'assets'),{recursive:true,mode:0o700});
 for(const [id,value]of media){
  const path=assetPath(root,id);
  const known=verified?.get(value);
  if(known?.id===id&&await mediaFileSignature(path)===known.signature)continue;
  const json=JSON.stringify(value);
  if(createHash('sha256').update(json).digest('hex')!==id)throw new Error('Media identity does not match.');
  try{const current=await readMedia(root,id);if(current!==value)throw new Error('An existing media asset is damaged. Restore a backup before continuing.');continue;}catch(error:any){if(error.code!=='ENOENT')throw error;}
  const temp=path+'.'+crypto.randomUUID()+'.tmp';try{const file=await open(temp,'wx',0o600);try{await file.writeFile(json,'utf8');await file.sync();}finally{await file.close();}assertStorageLock(root);await durableRename(temp,path);}catch(error){await unlink(temp).catch(()=>{});throw error;}
 }
}
async function mediaFileSignature(path: string): Promise<string | undefined> {
 const info = await lstat(path,{bigint:true}).catch((error:NodeJS.ErrnoException)=>{
   if(error.code!=='ENOENT')throw error;
 });
 if(info?.isFile())return storageFileSignature(info);
}

function hydrateDocument(raw:unknown,load:(id:string)=>Promise<string>) {
 const cache=new Map<string,Promise<string>>();
 return restoreVerifiedStoredDocument(raw,id=>{
   let value=cache.get(id);
   if(!value){value=load(id);cache.set(id,value);}
   return value;
 });
}
export async function readDeckStorage(path:string,root:string,metadataOnly=false):Promise<Deck>{
 const raw=await readDocumentJson(path);if(metadataOnly&&isStoredDocument(raw))return storedDocumentMetadata(raw);
 return hydrateDocument(raw,id=>readMediaFile(assetPath(root,id),id));
}
export async function readDeckDelivery(path:string,root:string,preferFrames:boolean):Promise<{deck:Deck}|{frames:AsyncGenerator<Buffer>}>{
 const raw=await readDocumentJson(path);
 const load=(id:string)=>readMediaFile(assetPath(root,id),id);
 const frames=preferFrames&&isStoredDocument(raw)?prepareStoredDocumentFrames(raw,id=>readMediaFrame(root,id)):undefined;
 if(frames)return {frames};
 return {deck:await hydrateDocument(raw,load)};
}
/** The snapshot stays local to a save under the storage lock. Hydration verifies every digest. */
export async function readDeckForSave(path:string,root:string):Promise<{deck:Deck;snapshot?:StorageSnapshot}|undefined> {
 const raw=await readDocumentJson(path).catch((error:NodeJS.ErrnoException)=>{
   if(error.code!=='ENOENT')throw error;
   return undefined;
 });
 if(raw===undefined)return;
 if(!isStoredDocument(raw))return {deck:await hydrateDocument(raw,id=>readMediaFile(assetPath(root,id),id))};
 const media=new Map<string,string>(),verified=new Map<string,{id:string;signature:string}>();
 const deck=await hydrateDocument(raw,id=>readMediaFile(assetPath(root,id),id,(value,signature)=>{
   media.set(id,value);
   verified.set(value,{id,signature});
 }));
 return {deck,snapshot:{root,record:raw,media,verified}};
}
export async function writeDeckHistory(path:string,deck:Deck,root:string,snapshot?:StorageSnapshot) {
 if(snapshot?.root===root&&await storageMode(root)==='compact'){
   await persistMedia(root,snapshot.media,snapshot.verified);
   return atomicStorageJson(path,snapshot.record,root);
 }
 await writeDeckStorage(path,deck,root);
}

export async function writeDeckStorage(path:string,deck:Deck,root:string,force=false,onCommit?:(signature:string)=>void,snapshot?:StorageSnapshot):Promise<Deck|StoredDocument>{
 if(!force&&await storageMode(root)==='legacy'){await atomicStorageJson(path,deck,root,onCommit);return deck;}
 const verified=snapshot?.root===root?snapshot.verified:undefined;
 const {record,media}=await prepareStoredDocument(deck,undefined,value=>verified?.get(value)?.id);
 await persistMedia(root,media,verified);
 await atomicStorageJson(path,record,root,onCommit);
 return record;
}
function storageFileSignature(s:BigIntStats) {
  return `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
}
export async function fileSignature(path:string){return storageFileSignature(await stat(path,{bigint:true}));}
