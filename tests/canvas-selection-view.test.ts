import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectionView} from '../src/canvas-selection-view';

test('desktop selection fitting preserves the center and reserves room for handles',()=>{
  assert.deepEqual(selectionView({x:800,y:500,w:200,h:100},900,600),{x:900,y:550,scale:3.7});
  const wide=selectionView({x:-100,y:40,w:1200,h:800},900,600)!;
  assert.equal(wide.x,500);assert.equal(wide.y,440);assert.equal(wide.scale,.55);
  assert(wide.scale*1200<=900-160+1e-8&&wide.scale*800<=600-160+1e-8);
});

test('selection navigation keeps existing zoom limits and rejects unavailable geometry',()=>{
  assert.equal(selectionView({x:0,y:0,w:1,h:1},900,600)!.scale,4);
  assert.equal(selectionView({x:0,y:0,w:20000,h:20000},900,600)!.scale,.1);
  for(const bounds of [{x:NaN,y:0,w:1,h:1},{x:0,y:Infinity,w:1,h:1},{x:0,y:0,w:0,h:1},{x:0,y:0,w:1,h:-1}])assert.equal(selectionView(bounds,900,600),null);
  assert.equal(selectionView({x:0,y:0,w:1,h:1},0,600),null);
});
