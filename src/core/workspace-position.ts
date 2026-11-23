/** Browser-only navigation metadata. Never part of a document or its history. */
export type WorkspacePosition={slideId:string;index:number;sourceMode:boolean};
type PositionStorage=Pick<Storage,'getItem'|'setItem'>;
export const WORKSPACE_POSITION_KEY='deck-studio-workspace-positions-v1';
const LEGACY_MODES='deck-studio-view-modes',MAX_RECORDS=100,MAX_TEXT=65536;
const id=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=200;
const position=(value:unknown):value is WorkspacePosition=>Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&id((value as WorkspacePosition).slideId)&&Number.isInteger((value as WorkspacePosition).index)&&(value as WorkspacePosition).index>=0&&(value as WorkspacePosition).index<500&&typeof (value as WorkspacePosition).sourceMode==='boolean');
function storage(value?:PositionStorage){try{return value??globalThis.localStorage;}catch{return undefined;}}
function records(value?:PositionStorage):Map<string,WorkspacePosition>{
 try{const raw=value?.getItem(WORKSPACE_POSITION_KEY);if(!raw||raw.length>MAX_TEXT)return new Map();const parsed=JSON.parse(raw);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return new Map();return new Map(Object.entries(parsed).filter((entry):entry is [string,WorkspacePosition]=>id(entry[0])&&position(entry[1])).slice(-MAX_RECORDS).map(([key,view])=>[key,{slideId:view.slideId,index:view.index,sourceMode:view.sourceMode}]));}catch{return new Map();}
}
export function readWorkspacePosition(documentId:string,value?:PositionStorage):WorkspacePosition|undefined{
 if(!id(documentId))return;const saved=records(storage(value)).get(documentId);return saved?{slideId:saved.slideId,index:saved.index,sourceMode:saved.sourceMode}:undefined;
}
/** Keep a stable page identity across reorder; a removed page falls back nearby. */
export function workspaceSlideId(slides:readonly {id:string}[],saved?:WorkspacePosition):string{
 return saved&&slides.some(s=>s.id===saved.slideId)?saved.slideId:slides[Math.min(saved?.index??0,Math.max(0,slides.length-1))]?.id??'';
}
export function writeWorkspacePosition(documentId:string,next:WorkspacePosition,value?:PositionStorage):boolean{
 if(!id(documentId)||!position(next))return false;const target=storage(value);if(!target)return false;let changed=false;
 try{const all=records(target),old=all.get(documentId);if(!old||old.slideId!==next.slideId||old.index!==next.index||old.sourceMode!==next.sourceMode){all.delete(documentId);all.set(documentId,{slideId:next.slideId,index:next.index,sourceMode:next.sourceMode});while(all.size>MAX_RECORDS)all.delete(all.keys().next().value!);target.setItem(WORKSPACE_POSITION_KEY,JSON.stringify(Object.fromEntries(all)));changed=true;}}catch{/* Optional UI storage must not prevent opening or editing. */}
 // Older open tabs still understand the existing per-document view flag.
 try{const raw=target.getItem(LEGACY_MODES);if(raw&&raw.length>MAX_TEXT)return changed;const modes=raw?JSON.parse(raw):{};if(modes&&typeof modes==='object'&&!Array.isArray(modes)&&modes[documentId]!==next.sourceMode){target.setItem(LEGACY_MODES,JSON.stringify(Object.fromEntries([...Object.entries(modes),[documentId,next.sourceMode]])));changed=true;}}catch{/* Keep existing preferences if legacy storage is unreadable. */}
 return changed;
}
