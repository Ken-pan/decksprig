import {BRAND_NAME} from '../../src/brand-name.js';
import {importFigma} from '../../src/importers/figma';
import {buildPptx} from '../../src/core/pptx-export';
import {figmaTransfer} from '../../src/core/figma-transfer';
import {readDocumentFile,DOCUMENT_FILE_SCHEMA} from '../../src/core/document-file';
import {z} from '../../src/core/schema';
import {validateDeck} from '../../src/core/model';

// Figma's sandbox exposes secure random bytes without the UUID convenience API.
function ensureSandboxCrypto(){
  if(typeof crypto.randomUUID==='function')return;
  crypto.randomUUID=()=>{
    const bytes=crypto.getRandomValues(new Uint8Array(16));
    bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const hex=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  };
}
/** Runs inside the offline Figma plugin UI. Native text properties are the
 * authority; Figma's built-in PPTX conversion is not involved. */
export async function fromBundle(bundle:unknown){
  ensureSandboxCrypto();
  // The sandbox has no app font routes. Retain Figma's measured text geometry
  // and font names; font embedding is only available in the local editor.
  return buildPptx(importFigma(bundle),false,undefined,false,async()=>new TextEncoder().encode('[]'),{nativeTextGeometry:true});
}

/** New compact Deck files and existing native handoffs share the same import UI. */
export async function prepareFile(raw:any){
  ensureSandboxCrypto();
  try{
    if(raw?.kind==='figma-rest')return figmaTransfer(importFigma(raw));
    if(raw?.schema===DOCUMENT_FILE_SCHEMA)return figmaTransfer(readDocumentFile(raw));
    const deck=raw.deck??raw;validateDeck(deck);
    return {deck,assets:raw.assets??(await figmaTransfer(deck)).assets};
  }catch(error){
    if(error instanceof z.core.$ZodError)throw new Error(`This file could not be opened. Choose a Deck file exported by ${BRAND_NAME}.`);
    throw error;
  }
}

export {imageLayout} from '../../src/core/image-style';
export {shapePath} from '../../src/core/shape-geometry';
export {readDocumentFile} from '../../src/core/document-file';
export {importFigma};
export {createSyncMedia} from '../../src/core/figma-sync-media';
