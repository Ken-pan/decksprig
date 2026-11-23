import type {Deck} from './model';
import {mergeFigmaDeck,projectFigmaChanges} from './figma-sync';

export type FigmaCheckpoint={deck:Deck;native:Deck};
export type FigmaScope={fileKey:string;slideIds:string[]};
export function projectFigmaCheckpoint(checkpoint:FigmaCheckpoint,local:Deck,remote:Deck,unreadableObjectMotion?:ReadonlySet<string>){
  const projection=projectFigmaChanges(checkpoint.deck,checkpoint.native,remote,unreadableObjectMotion);
  return {projection,...mergeFigmaDeck(checkpoint.deck,local,projection)};
}
export function figmaReconnectScope(checkpoint:FigmaCheckpoint):FigmaScope{
  const fileKey=checkpoint.native.provenance?.url?.split('/')[4],slideIds=checkpoint.native.slides.map(s=>s.source?.nodeId);
  if(!fileKey||slideIds.some(id=>!id)||slideIds.length>100)throw new Error('Reconnect this document through its original Figma file. Both versions are preserved.');
  return {fileKey,slideIds:slideIds as string[]};
}
export function recoverFigmaDeck(checkpoint:FigmaCheckpoint,local:Deck,remote:Deck,confirmedScope:unknown,unreadableObjectMotion?:ReadonlySet<string>){
  const scope=figmaReconnectScope(checkpoint);
  if(local.id!==checkpoint.deck.id||remote.provenance?.url?.split('/')[4]!==scope.fileKey)throw new Error('Reconnect to the original Figma file. Both versions are preserved.');
  if(JSON.stringify(confirmedScope)!==JSON.stringify(scope.slideIds)||remote.slides.some(s=>!scope.slideIds.includes(s.source?.nodeId??'')))throw new Error('Update the Figma plugin and reconnect to the original slide scope. Both versions are preserved.');
  return projectFigmaCheckpoint(checkpoint,local,remote,unreadableObjectMotion);
}
export function figmaReadRetry(error:unknown){
  const e=error as {name?:string;status?:number};return error instanceof TypeError||e?.name==='AbortError'||e?.name==='TimeoutError'||e?.status===409||Number(e?.status)>=500;
}
/** Replay only the same sequence/payload; the bridge confirms its receipt
 * without enqueuing a second write. Unknown outcomes still require recovery. */
export async function retryFigmaWrite<T>(write:()=>Promise<T>,current:()=>boolean):Promise<T>{
  try{return await write();}catch(error){
    if(!current()||!figmaReadRetry(error)||(error as {status?:number})?.status===409)throw error;
    return write();
  }
}
