import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureViewAnchor,scrollForAnchor,type ViewGeometry} from '../src/canvas-viewport-anchor';

const fitted:ViewGeometry={width:1000,height:600,left:0,top:0,scrollX:0,scrollY:0,artX:100,artY:100,scale:.5};
test('introducing native scrollbars preserves the fitted screen point before the first pan',()=>{
  const anchor=captureViewAnchor(fitted),manual={...fitted,width:980,height:580,left:10,artX:510,artY:310};
  assert.deepEqual(scrollForAnchor(anchor,manual,true),{left:410,top:210});
  // A deliberate viewport resize instead keeps the document at its relative center.
  assert.deepEqual(scrollForAnchor(anchor,manual),{left:410,top:220});
});
test('pointer zoom accounts for the left scrollbar gutter at both scales',()=>{
  const view={...fitted,width:980,height:580,left:10,scrollX:410,scrollY:210,artX:510,artY:310};
  const anchor=captureViewAnchor(view,(150-view.left)/view.width,120/view.height);
  assert.equal(anchor.x,100);assert.equal(anchor.y,40);
  assert.deepEqual(scrollForAnchor(anchor,{...view,scale:1},true),{left:460,top:230});
});
