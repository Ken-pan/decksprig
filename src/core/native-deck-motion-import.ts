import type {Deck} from './model';
import type {Operation} from './operations';
import type {NativeDeckMotionCapture} from './native-deck-motion';
import {planNativeDeckMotion} from './native-deck-motion-authoring';

export function nativeMotionLinkedSource(deck:Deck){
 if(deck.provenance?.provider!=='Figma')return;
 try{const url=new URL(deck.provenance.url??''),fileKey=url.pathname.match(/^\/(?:slides|deck|design)\/([\w-]+)(?:\/|$)/)?.[1];if(url.protocol==='https:'&&['figma.com','www.figma.com'].includes(url.hostname)&&fileKey)return {fileKey,url:url.href};}catch{}
}
export type NativeMotionSourceChoice={linkedFileKey:string;archiveSourceConfirmed:boolean};
export interface NativeMotionReview {documentId:string;baseRevision:number;linkedFileKey:string;operations:Operation[];issues:{slideId?:string;targetId?:string;message:string}[];slides:{id:string;label:string;matchingObjects:number;changes:number;blocked:boolean}[];identityVerified:false;liveSync:false}
export function reviewNativeMotionImport(deck:Deck,capture:NativeDeckMotionCapture,choice:NativeMotionSourceChoice):NativeMotionReview{
 if(capture.kind!=='figma-native-deck-motion'||capture.archiveIdentityVerified!==false||!Array.isArray(capture.slides)||!Array.isArray(capture.issues))throw Error('The native motion response is invalid. Existing motion is unchanged.');
 const plan=planNativeDeckMotion(deck,capture,choice);
 return {documentId:deck.id,baseRevision:plan.baseRevision,linkedFileKey:choice.linkedFileKey,operations:plan.operations,issues:plan.issues,identityVerified:false,liveSync:false,slides:capture.slides.map(native=>{const matches=deck.slides.filter(s=>s.source?.provider==='Figma'&&s.source.nodeId===native.id),slide=matches.length===1?matches[0]:undefined,targets=new Set(native.cues.flatMap(c=>c.actions.filter(a=>a.targetId&&a.withinSlide&&slide?.elements.filter(e=>e.sourceId===a.targetId).length===1).map(a=>a.targetId)));return{id:native.id,label:slide?`Slide ${deck.slides.indexOf(slide)+1}${slide.title?` · ${slide.title}`:''}`:'Unmatched source slide',matchingObjects:targets.size,changes:slide?plan.operations.filter(op=>'slideId'in op&&op.slideId===slide.id).length:0,blocked:plan.issues.some(issue=>!issue.slideId||issue.slideId===native.id)};})};
}
interface MotionCommitTarget {deck:Deck|null|undefined;error:string;pending?:unknown;editingId?:string;croppingId?:string;commit:(operations:Operation[],mergeKey?:string,actor?:'manual'|'ai',revision?:number)=>void}
/** Uses the editor's existing atomic operation/history entry, not a second stack. */
export function applyNativeMotionReview(target:MotionCommitTarget,review:NativeMotionReview,choice:NativeMotionSourceChoice){
 const deck=target.deck,source=deck&&nativeMotionLinkedSource(deck);
 if(!deck||deck.id!==review.documentId||deck.revision!==review.baseRevision)throw Error('The document changed. Review this backup again before applying motion.');
 if(!choice.archiveSourceConfirmed||!source||source.fileKey!==choice.linkedFileKey||choice.linkedFileKey!==review.linkedFileKey)throw Error('Confirm that this backup belongs to the selected linked Figma file.');
 if(target.pending||target.editingId||target.croppingId)throw Error('Finish the current edit or proposal before applying motion.');
 if(!review.operations.length)throw Error('No supported motion changes are ready. Existing motion is unchanged.');
 target.commit(review.operations,'','manual',review.baseRevision);
 if(target.deck?.id!==review.documentId||target.deck.revision!==review.baseRevision+1)throw Error(target.error||'Motion could not be applied. Review the document and try again.');
 return {changes:review.operations.length,revision:target.deck.revision};
}

/** Streaming browser codec, invoked only for a deflated canvas ZIP member. */
export async function inflateNativeMotionCanvas(bytes:Uint8Array,limit:number){
 if(!Number.isSafeInteger(limit)||limit<1)throw Error('The native motion size limit is invalid.');
 let stream:DecompressionStream;try{if(typeof DecompressionStream==='undefined')throw Error();stream=new DecompressionStream('deflate-raw');}catch{throw Error('This browser cannot read compressed native backups. Use a current browser or choose an uncompressed saved copy. Existing motion is unchanged.');}
 const owned=new Uint8Array(bytes.length);owned.set(bytes);const reader=new Blob([owned.buffer]).stream().pipeThrough(stream).getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const value=await reader.read();if(value.done)break;size+=value.value.length;if(size>limit){await reader.cancel();throw Error('The extracted native motion exceeds its safe size limit. Existing motion is unchanged.');}chunks.push(value.value);}const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;}finally{reader.releaseLock();}
}
