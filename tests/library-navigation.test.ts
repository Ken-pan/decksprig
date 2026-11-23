import test from 'node:test';
import assert from 'node:assert/strict';
import {libraryNavigationIndex as next} from '../src/core/library-navigation';

test('library keyboard navigation reaches every edge and the partial final row',()=>{
  assert.equal(next('ArrowRight',0,2000,3,2),1);assert.equal(next('ArrowDown',1,2000,3,2),4);
  assert.equal(next('ArrowDown',1998,2000,3,2),1999);assert.equal(next('ArrowUp',1999,2000,3,2),1996);
  assert.equal(next('End',0,2000,3,2),1999);assert.equal(next('Home',1999,2000,3,2),0);
  assert.equal(next('ArrowLeft',0,2000,3,2),0);assert.equal(next('ArrowRight',1999,2000,3,2),1999);
});
test('library page movement follows the current view and leaves unrelated keys alone',()=>{
  assert.equal(next('PageDown',0,2000,3,2),6);assert.equal(next('PageUp',6,2000,3,2),0);
  assert.equal(next('ArrowDown',20,2000,1,5),21);assert.equal(next('PageDown',20,2000,1,5),25);
  assert.equal(next('PageDown',1998,2000,1,5),1999);assert.equal(next('Enter',0,2000,3,2),undefined);
  assert.equal(next('End',0,0,3,2),undefined);
});
