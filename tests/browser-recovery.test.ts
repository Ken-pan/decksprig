import test from 'node:test';
import assert from 'node:assert/strict';
import {draftRecord} from '../src/core/drafts';
import {resolveDraft} from '../src/core/draft-resolution';
import {newDeck,blankSlide} from '../src/core/model';
const saved=()=>newDeck('Saved',[blankSlide()]);
test('browser branches retain conflicting tab edits alongside a newer saved document',()=>{
 const disk=saved(),losing={...disk,title:'Unsaved tab',revision:1},winner={...disk,title:'Saved tab',revision:1};
 const result=resolveDraft({schema:'deck-studio-drafts/1',records:[draftRecord(losing,0),draftRecord(winner,1)]},winner);
 assert.equal(result.restore,undefined);assert.equal(result.conflicts?.length,1);assert.equal(result.conflicts![0].title,'Unsaved tab');
});
test('ambiguous browser drafts remain reviewable instead of silently selecting a tab',()=>{
 const disk=saved(),a={...disk,title:'Tab A',revision:1},b={...disk,title:'Tab B',revision:1};
 const result=resolveDraft({schema:'deck-studio-drafts/1',records:[draftRecord(a,0),draftRecord(b,0)]},disk);
 assert.equal(result.restore,undefined);assert.deepEqual(result.conflicts?.map(d=>d.title),['Tab A','Tab B']);
});
