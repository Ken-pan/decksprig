import test from'node:test';import assert from'node:assert/strict';
import{tableHandlePoint}from'../src/core/table-handle-placement';
const overlaps=(a:{left:number;right:number;top:number;bottom:number},b:typeof a)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
const grip=(p:{x:number;y:number})=>({left:p.x-22,right:p.x+22,top:p.y-22,bottom:p.y+22});
test('tiny fitted table resize grips clear the entire paper, each other and the footer',()=>{
 const viewport={left:0,top:93,width:320,height:40},paper={left:124,right:196,top:93,bottom:133},table={left:162,right:190,top:116,bottom:125};
 const column=grip(tableHandlePoint({x:176,y:151},'column',table,viewport,paper)),row=grip(tableHandlePoint({x:216,y:121},'row',table,viewport,paper));
 assert(!overlaps(column,paper));assert(!overlaps(row,paper));assert(!overlaps(column,row));for(const r of[column,row]){assert(r.left>=12&&r.right<=308);assert(r.top>=91&&r.bottom<=135);assert(r.bottom<141);}
});
test('compact grips stay separated and accessible near either workspace edge',()=>{
 for(const x of[0,8,120,288])for(const height of[40,68,400]){const table={left:x,right:x+28,top:100,bottom:109},viewport={left:0,top:93,width:320,height},column=grip(tableHandlePoint({x:x+14,y:135},'column',table,viewport)),row=grip(tableHandlePoint({x:x+54,y:105},'row',table,viewport));
  assert(!overlaps(column,row));assert(!overlaps(column,table));assert(!overlaps(row,table));for(const r of[column,row])assert(r.left>=12&&r.right<=308);
 }
});
test('normal handles retain boundary alignment and move across the table at workspace edges',()=>{
 const table={left:80,right:280,top:80,bottom:280},viewport={left:0,top:0,width:320,height:320};
 assert.deepEqual(tableHandlePoint({x:180,y:306},'column',table,viewport),{x:180,y:54});
 assert.deepEqual(tableHandlePoint({x:306,y:180},'row',table,viewport),{x:54,y:180});
 assert.deepEqual(tableHandlePoint({x:180,y:306},'column',table,{...viewport,height:500}),{x:180,y:306});
});
