import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDeck, blankSlide } from '../src/core/model';
import { draftRecord } from '../src/core/drafts';
import {resolveDraft} from '../src/core/draft-resolution';

test('unsaved recovery requires the exact base revision, even when the draft revision is higher', () => {
  const disk = newDeck('Other window', [blankSlide()]); disk.revision = 2;
  const draft = structuredClone(disk); draft.title = 'My unsaved branch'; draft.revision = 8;
  assert.deepEqual(resolveDraft(draftRecord(draft, 2), disk).restore, draft);
  assert.deepEqual(resolveDraft(draftRecord(draft, 0), disk).conflicts, [draft]);
  assert.deepEqual(resolveDraft(draft, disk).conflicts, [draft]);
  draft.revision = 1;
  assert.deepEqual(resolveDraft(draftRecord(draft, 0), disk).conflicts, [draft]);
  draft.revision = 2;
  assert.deepEqual(resolveDraft(draftRecord(draft, 0), disk).conflicts, [draft]);
});
test('synced drafts do not replay and divergent recovery survives later edits and saves', () => {
  const disk = newDeck('Saved', [blankSlide()]); disk.revision = 2;
  assert.equal(resolveDraft(disk, disk).restore, undefined);
  const old = structuredClone(disk); old.title = 'Legacy unsaved branch';
  const newer = structuredClone(disk); newer.revision = 3; newer.title = 'New local edit';
  const record = draftRecord(newer, 2, [old]);
  assert.deepEqual(resolveDraft(record, disk), {restore: newer, conflicts: [old]});
  assert.deepEqual(resolveDraft(record, newer), {conflicts: [old]});
  assert.equal(resolveDraft(draftRecord(old, 0, [old]), disk).conflicts?.length, 1);
});
test('corrupt or mismatched backups cannot enter the editor', () => {
  const disk = newDeck('Saved', [blankSlide()]);
  assert.throws(() => resolveDraft({schema: 'deck-studio-draft/1', deck: {id: disk.id}}, disk));
  assert.throws(() => resolveDraft(newDeck('Different document', [blankSlide()]), disk));
  assert.deepEqual(resolveDraft(undefined, disk), {});
});
