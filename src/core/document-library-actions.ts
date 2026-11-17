import type {Editor} from './editor.svelte';
import type {Deck} from './model';
import {applyOperations} from './operations';
import {jsonRequest} from './client-json';
import {copyDeck} from './document-copy';
import {createDocumentInBackground} from './background-document-save';

export type CopyOrigin={deck:Deck|null;navigation:number;mode?:boolean};
/** Capture input before async loading. A completed copy must not displace a
 * newer document selection, pending open, edit, or dismissed dialog. */
export async function duplicateLibraryDocument(editor:Editor,source:Deck,origin:CopyOrigin,current=()=>true){
 const copy=copyDeck(source);await createDocumentInBackground('/api/decks',copy,true);
 const sameRevision=()=>editor.deck?.id===origin.deck?.id&&editor.deck?.revision===origin.deck?.revision;
 let opened=false;
 if(sameRevision()&&editor.navigationVersion===origin.navigation&&current()){
  try{opened=await editor.open(copy.id);}catch(error){
   if(sameRevision()&&editor.navigationVersion===origin.navigation+1)throw new Error(`The copy was saved in the document library. ${(error as Error).message}`);
  }
  if(opened&&origin.mode!==undefined)editor.sourceMode=origin.mode;
 }
 return {id:copy.id,opened};
}

/** Target and title are immutable inputs, independent of later rename dialogs. */
export async function renameLibraryDocument(editor:Editor,id:string,title:string){
 if(editor.deck?.id===id){editor.commit([{op:'rename_deck',title}]);await editor.flush();if(editor.deck?.id===id&&editor.dirty)throw new Error(editor.error||'The title has not been saved. Retry saving before leaving.');return;}
 const deck=await jsonRequest<Deck>(`/api/decks/${id}`,'GET',undefined,fetch),next=applyOperations(deck,[{op:'rename_deck',title}]);
 await jsonRequest(`/api/decks/${id}`,'PUT',{deck:next,expectedRevision:deck.revision},fetch);
}
