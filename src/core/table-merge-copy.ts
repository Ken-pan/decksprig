import {ElementSchema,uid,type Deck,type SlideElement} from './model';
import {cloneDocumentData} from './document-data';
import {pasteOffset} from './clipboard';
import {cellBounds,type CellRange} from './table-grid';
import {expandMergedRange,mergeTableRange,tableColumns} from './table-structure';
import type {Operation} from './operations';
import type {Editor} from './editor.svelte';

export interface TableMergeCopyReview {
 baseRevision:number;
 documentId:string;
 slideId:string;
 sourceId:string;
 sourceName:string;
 sourceFingerprint:string;
 range:CellRange;
 rangeLabel:string;
 coveredCellCount:number;
 hiddenValueCount:number;
 anchorText:string;
 preview:SlideElement;
}

function sourceTable(deck:Deck,slideId:string,sourceId:string){
 const slide=deck.slides.find(s=>s.id===slideId),source=slide?.elements.find(e=>e.id===sourceId);
 if(!slide||!source||source.type!=='table'||!source.cells?.length)throw new Error('The source table is no longer available. Close this review and select a table again.');
 if(source.locked)throw new Error('Unlock the source table before creating a merged copy.');
 return {slide,source};
}

function selection(source:SlideElement,range:CellRange){
 const rows=source.cells!.length,columns=tableColumns(source.cells!);
 for(const cell of [range.anchor,range.head])if(!Number.isInteger(cell.row)||!Number.isInteger(cell.column)||cell.row<0||cell.column<0||cell.row>=rows||cell.column>=columns)throw new Error('Select an existing rectangular cell range.');
 const expanded=expandMergedRange(source.tableStyle,range),bounds=cellBounds(expanded);
 if(bounds.top===bounds.bottom&&bounds.left===bounds.right)throw new Error('Select at least two cells to merge.');
 if(source.tableStyle?.merges?.some(m=>m.row===bounds.top&&m.column===bounds.left&&m.rowSpan===bounds.bottom-bounds.top+1&&m.columnSpan===bounds.right-bounds.left+1))throw new Error('These cells are already merged. Select a different range.');
 return {range:{anchor:{row:bounds.top,column:bounds.left},head:{row:bounds.bottom,column:bounds.right}},bounds};
}

function mergedCopy(deck:Deck,source:SlideElement,range:CellRange,id:string){
 if(source.rotation||source.flipX||source.flipY||source.opacity!==1||source.shadow)throw new Error('Use an unrotated, fully opaque source without an outer shadow for an editable merged copy.');
 const copy=cloneDocumentData(source),offset=pasteOffset([source],[],deck,1),columns=tableColumns(source.cells!);
 copy.id=id;copy.name='Merged table copy';copy.x+=offset.x;copy.y+=offset.y;copy.locked=false;copy.hidden=false;
 copy.cells=source.cells!.map(row=>Array.from({length:columns},(_,column)=>row[column]??''));
 // This explicit projection must create editable layers, never mutate or
 // clone the source TABLE while pretending its API can merge native cells.
 for(const key of ['sourceId','nativeTableLayout','group','layoutItem','blockItem','link','animation','motionKey','motionMatch','pageElement'] as const)delete copy[key];
 Object.assign(copy,mergeTableRange(copy,range,false,deck.designSystem));
 return ElementSchema.parse(copy);
}

/** Prepare only. The caller presents the preview and conversion consequences. */
export function prepareMergedTableCopy(deck:Deck,slideId:string,sourceId:string,range:CellRange):TableMergeCopyReview{
 const {source}=sourceTable(deck,slideId,sourceId),selected=selection(source,range),{bounds}=selected;
 const cellLabel=(row:number,column:number)=>`${String.fromCharCode(65+column)}${row+1}`;
 let hiddenValueCount=0;for(let row=bounds.top;row<=bounds.bottom;row++)for(let column=bounds.left;column<=bounds.right;column++)if((row!==bounds.top||column!==bounds.left)&&(source.cells![row][column]??'').length)hiddenValueCount++;
 return {baseRevision:deck.revision,documentId:deck.id,slideId,sourceId,sourceName:source.name,sourceFingerprint:JSON.stringify(source),range:selected.range,rangeLabel:`${cellLabel(bounds.top,bounds.left)}:${cellLabel(bounds.bottom,bounds.right)}`,coveredCellCount:(bounds.bottom-bounds.top+1)*(bounds.right-bounds.left+1)-1,hiddenValueCount,anchorText:source.cells![bounds.top][bounds.left]??'',preview:mergedCopy(deck,source,selected.range,uid())};
}

/** Revalidate the reviewed projection; never accept arbitrary preview edits. */
export function mergedTableCopyOperations(deck:Deck,review:TableMergeCopyReview):Operation[]{
 if(deck.id!==review.documentId||deck.revision!==review.baseRevision)throw new Error('The document changed. Close this review and prepare the merged copy again.');
 const {slide,source}=sourceTable(deck,review.slideId,review.sourceId);
 if(JSON.stringify(source)!==review.sourceFingerprint)throw new Error('The source table changed. Close this review and prepare the merged copy again.');
 if(slide.elements.some(e=>e.id===review.preview.id))throw new Error('The reviewed copy already exists. Prepare a new review.');
 const selected=selection(source,review.range),expected=mergedCopy(deck,source,selected.range,review.preview.id);
 if(JSON.stringify(expected)!==JSON.stringify(review.preview))throw new Error('The reviewed copy changed. Prepare a new review before creating it.');
 return [{op:'add_element',slideId:review.slideId,element:expected}];
}

export function confirmMergedTableCopy(editor:Editor,review:TableMergeCopyReview):string|undefined{
 if(!editor.deck||editor.slide?.id!==review.slideId)throw new Error('Return to the reviewed slide before creating its merged copy.');
 const operations=mergedTableCopyOperations(editor.deck,review),revision=editor.deck.revision;
 editor.commit(operations,'','manual',review.baseRevision);
 if(editor.deck?.revision===revision)return;
 editor.choose(review.preview.id,false,true);editor.notify('Merged copy created · Undo available');return review.preview.id;
}
