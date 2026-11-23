import {DECK_OBJECT_MOTION_KEY,DECK_OBJECT_MOTION_NAMESPACE,decodeDeckObjectMotion,encodeDeckObjectMotion,type DeckObjectMotion} from '../../src/core/figma-object-motion';

type MotionStorage='shared'|'private';
const storageFor=(node:any):MotionStorage|undefined=>typeof node.getSharedPluginData==='function'||typeof node.setSharedPluginData==='function'?'shared':typeof node.getPluginData==='function'||typeof node.setPluginData==='function'?'private':undefined;
const canRead=(node:any,storage:MotionStorage)=>typeof node[storage==='shared'?'getSharedPluginData':'getPluginData']==='function';
const canWrite=(node:any,storage:MotionStorage)=>typeof node[storage==='shared'?'setSharedPluginData':'setPluginData']==='function';
const read=(node:any,storage:MotionStorage):string=>storage==='shared'?node.getSharedPluginData(DECK_OBJECT_MOTION_NAMESPACE,DECK_OBJECT_MOTION_KEY):node.getPluginData(DECK_OBJECT_MOTION_KEY);
const write=(node:any,storage:MotionStorage,value:string)=>storage==='shared'?node.setSharedPluginData(DECK_OBJECT_MOTION_NAMESPACE,DECK_OBJECT_MOTION_KEY,value):node.setPluginData(DECK_OBJECT_MOTION_KEY,value);
const unreadableWarning='Deck Studio object motion metadata could not be read. Existing native Figma animations stay unchanged.';

export function readDeckObjectMotion(node:any):ReturnType<typeof decodeDeckObjectMotion>&{storage?:MotionStorage}{
 const storage=storageFor(node);if(!storage)return {warning:unreadableWarning};
 try{return {...decodeDeckObjectMotion(read(node,storage)),storage};}
 catch{return {warning:unreadableWarning};}
}

export interface PreparedObjectMotion {before:string;after:string;storage?:MotionStorage;warning?:string}
/** Pure preflight: only our namespaced, bounded plugin data is read. */
export function prepareDeckObjectMotion(node:any,element:DeckObjectMotion):PreparedObjectMotion{
 const after=encodeDeckObjectMotion(element);
 if(!node)return {before:'',after};
 const storage=storageFor(node);
 if(!storage||!canRead(node,storage)){
  if(after)throw Error('This Figma host cannot store Deck Studio object motion metadata. The local settings remain in Deck Studio.');
  return {before:'',after:''};
 }
 let before:string;try{before=read(node,storage);}catch{throw Error('Figma object motion metadata could not be read. Sync again before sending local motion settings.');}
 const decoded=decodeDeckObjectMotion(before);
 if(decoded.warning)return {before,after:before,storage,warning:decoded.warning};
 if(before!==after&&!canWrite(node,storage))throw Error('This Figma host cannot store Deck Studio object motion metadata. The local settings remain in Deck Studio.');
 return {before,after,storage};
}

/** Commit after visual writes succeed; a partial metadata batch restores itself. */
export function writeDeckObjectMotionBatch(items:{node:any;prepared:PreparedObjectMotion}[]):boolean{
 const pending=items.filter(item=>item.prepared.before!==item.prepared.after&&!item.prepared.warning).map(item=>({...item,storage:item.prepared.storage??storageFor(item.node)}));
 for(const {node,prepared,storage} of pending)if(!storage||storageFor(node)!==storage||!canRead(node,storage)||!canWrite(node,storage)||read(node,storage)!==prepared.before)throw Error('Figma changed during preparation. Sync again to keep both object motion configurations.');
 const written:typeof pending=[];
 try{
  for(const item of pending){if(read(item.node,item.storage!)!==item.prepared.before)throw Error('Figma changed during preparation. Sync again to keep both object motion configurations.');written.push(item);write(item.node,item.storage!,item.prepared.after);if(read(item.node,item.storage!)!==item.prepared.after)throw Error('Figma could not retain the Deck Studio object motion metadata. Native animation translation is unavailable.');}
 }catch(error){
  let restored=true;for(const {node,prepared,storage} of written.reverse())try{if(read(node,storage!)!==prepared.before)write(node,storage!,prepared.before);if(read(node,storage!)!==prepared.before)restored=false;}catch{restored=false;}
  if(!restored)throw Error('Object motion metadata could not be restored completely. Keep the local document and reconnect before retrying.');
  throw error;
 }
 return pending.length>0;
}
