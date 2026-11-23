import test from 'node:test';
import assert from 'node:assert/strict';
import {blankSlide,element,newDeck,validateDeck} from '../src/core/model';
import {applyOperations} from '../src/core/operations';
import {tableLayoutFingerprint} from '../src/core/native-table-layout';
import {mergeTableRange} from '../src/core/table-structure';
import {tablePresentation,tableCellStyle,tableCellSpan} from '../src/core/table-appearance';
import {prepareMergedTableCopy,mergedTableCopyOperations,confirmMergedTableCopy} from '../src/core/table-merge-copy';
import type {Editor} from '../src/core/editor.svelte';

const range=(top:number,left:number,bottom=top,right=left)=>({anchor:{row:top,column:left},head:{row:bottom,column:right}});
function fixture(){
 const source=element('table',{id:'native-source',sourceId:'218:34',name:'Native reference',x:100,y:120,w:384,h:128,fontFamily:'Inter',fontSize:16,fontWeight:500,cells:[['Header 中文🙂','Covered title'],['Metric','123.45']],tableStyle:{headerRow:false,columnWidths:[144,240],rowHeights:[64,64],bodyFill:'#ffffff',cellStyles:[{row:0,column:1,underline:true,color:'#123456'},{row:1,column:1,strikethrough:true,fill:'#b3f5eb'}]},link:'https://example.com',animation:{phase:'out',effect:'slide',duration:600,delay:0,order:0,trigger:'click',easing:'smooth'},motionKey:'source-motion',motionMatch:'auto'});
 source.nativeTableLayout={fingerprint:tableLayoutFingerprint(source),src:'data:image/png;base64,AQ=='};const slide=blankSlide();slide.elements=[source];return {source,slide,deck:newDeck('Merge review',[slide])};
}

test('preparing or cancelling a merge review changes neither source nor document and accurately describes covered content',()=>{
 const {deck,source,slide}=fixture(),before=structuredClone(deck),review=prepareMergedTableCopy(deck,slide.id,source.id,range(0,1,0,0));assert.deepEqual(deck,before);assert.equal(review.baseRevision,deck.revision);assert.equal(review.documentId,deck.id);assert.equal(review.sourceId,source.id);assert.equal(review.rangeLabel,'A1:B1');assert.equal(review.coveredCellCount,1);assert.equal(review.hiddenValueCount,1);assert.equal(review.anchorText,'Header 中文🙂');assert.deepEqual(review.range,range(0,0,0,1));assert.notEqual(review.preview.id,source.id);assert.deepEqual(review.preview.cells,source.cells);assert.deepEqual(review.preview.tableStyle?.merges,[{row:0,column:0,rowSpan:1,columnSpan:2}]);
 for(const key of ['sourceId','nativeTableLayout','group','layoutItem','blockItem','link','animation','motionKey','motionMatch','pageElement']as const)assert.equal(review.preview[key],undefined,key);assert.equal(deck.revision,before.revision);assert.equal(deck.slides[0].elements.length,1);
});

test('the reviewed copy is one validated add transaction whose inverse restores the exact original document content',()=>{
 const {deck,source,slide}=fixture(),review=prepareMergedTableCopy(deck,slide.id,source.id,range(0,0,1,1)),operations=mergedTableCopyOperations(deck,review);assert.equal(operations.length,1);assert.equal(operations[0].op,'add_element');const after=applyOperations(deck,operations,review.baseRevision),copy=after.slides[0].elements[1];validateDeck(after);assert.equal(after.revision,deck.revision+1);assert.deepEqual(after.slides[0].elements[0],source);assert.deepEqual(copy.cells,source.cells);assert.equal(tableCellSpan(tablePresentation(copy),1,1).covered,true);assert.equal(tableCellStyle(tablePresentation(copy),1,1).textDecoration,'line-through');
 const split={...copy,...mergeTableRange(copy,range(0,0),true)};assert.deepEqual(split.cells,source.cells);assert.equal(tableCellSpan(tablePresentation(split),1,1).covered,false);assert.equal(tableCellStyle(tablePresentation(split),0,1).textDecoration,'underline');
 const restored=applyOperations(after,[{op:'delete_element',slideId:slide.id,elementId:copy.id}],after.revision);assert.deepEqual(restored.slides,deck.slides);assert.deepEqual(deck.slides[0].elements[0],source);
});

test('merge-copy review rejects stale documents, changed or locked sources, wrong scopes and altered previews without applying',()=>{
 const {deck,source,slide}=fixture(),review=prepareMergedTableCopy(deck,slide.id,source.id,range(0,0,0,1));const changed=applyOperations(deck,[{op:'update_element',slideId:slide.id,elementId:source.id,patch:{name:'Changed'}}]);assert.throws(()=>mergedTableCopyOperations(changed,review),/document changed/);assert.throws(()=>mergedTableCopyOperations({...deck,id:'other-document'},review),/document changed/);
 const direct=structuredClone(deck);direct.slides[0].elements[0].cells![0][1]='Unversioned change';assert.throws(()=>mergedTableCopyOperations(direct,review),/source table changed/);const locked=structuredClone(deck);locked.slides[0].elements[0].locked=true;assert.throws(()=>mergedTableCopyOperations(locked,review),/Unlock/);assert.throws(()=>mergedTableCopyOperations({...deck,slides:[]},review),/no longer available/);
 const tampered=structuredClone(review);tampered.preview.sourceId=source.sourceId;assert.throws(()=>mergedTableCopyOperations(deck,tampered),/reviewed copy changed/);const content=structuredClone(review);content.preview.cells![0][0]='Unreviewed content';assert.throws(()=>mergedTableCopyOperations(deck,content),/reviewed copy changed/);assert.equal(deck.slides[0].elements.length,1);
});

test('confirm uses the reviewed revision once, selects its new object and leaves failed commits untouched',()=>{
 const {deck,source,slide}=fixture(),review=prepareMergedTableCopy(deck,slide.id,source.id,range(0,0,0,1));let commits=0,chosen='',notice='';const state={deck,slide,commit(ops:Parameters<typeof applyOperations>[1],_merge:string,_actor:string,revision:number){commits++;state.deck=applyOperations(state.deck,ops,revision);state.slide=state.deck.slides[0];},choose(id:string){chosen=id;},notify(value:string){notice=value;}};
 assert.equal(confirmMergedTableCopy(state as unknown as Editor,review),review.preview.id);assert.equal(commits,1);assert.equal(chosen,review.preview.id);assert.match(notice,/Undo available/);assert.deepEqual(state.deck.slides[0].elements[0],source);assert.throws(()=>confirmMergedTableCopy(state as unknown as Editor,review),/document changed/);assert.equal(commits,1);
 const failed={deck,slide,commit(){},choose(){throw Error('Selection should not change');},notify(){throw Error('No success notice');}};assert.equal(confirmMergedTableCopy(failed as unknown as Editor,review),undefined);assert.equal(failed.deck,deck);
});

test('review guards invalid or already merged selections and unsupported editable-layer geometry before creation',()=>{
 const {deck,source,slide}=fixture();for(const selected of [range(0,0),range(-1,0,0,1),range(0,0,0,3),range(.5,0,1,1)])assert.throws(()=>prepareMergedTableCopy(deck,slide.id,source.id,selected),/Select/);
 const merged=structuredClone(deck);Object.assign(merged.slides[0].elements[0],mergeTableRange(source,range(0,0,0,1)));assert.throws(()=>prepareMergedTableCopy(merged,slide.id,source.id,range(0,0)),/already merged/);
 for(const patch of [{rotation:20},{opacity:.5},{flipX:true},{shadow:{color:'#000000',opacity:.5,blur:8,x:2,y:2}}]){const changed=structuredClone(deck);Object.assign(changed.slides[0].elements[0],patch);assert.throws(()=>prepareMergedTableCopy(changed,slide.id,source.id,range(0,0,0,1)),/unrotated, fully opaque/);}
});
