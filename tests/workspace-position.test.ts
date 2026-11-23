import test from 'node:test';import assert from 'node:assert/strict';
import {WORKSPACE_POSITION_KEY,readWorkspacePosition,writeWorkspacePosition,workspaceSlideId}from'../src/core/workspace-position';
function memory(){const values=new Map<string,string>(),writes:string[]=[];return{values,writes,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);writes.push(key);}};}
const view={slideId:'third',index:2,sourceMode:true};

test('workspace positions are document-specific bounded navigation metadata and preserve legacy/other preferences',()=>{
 const s=memory();s.values.set('deck-studio-view-modes',JSON.stringify({older:false}));s.values.set('deck-studio-settings','keep-settings');s.values.set('deck-studio-pane-visibility','keep-panes');
 assert(writeWorkspacePosition('a',view,s));assert(writeWorkspacePosition('b',{slideId:'other',index:1,sourceMode:false},s));assert.deepEqual(readWorkspacePosition('a',s),view);assert.equal(readWorkspacePosition('b',s)?.sourceMode,false);assert.equal(readWorkspacePosition('fresh',s),undefined);assert.deepEqual(JSON.parse(s.values.get('deck-studio-view-modes')!),{older:false,a:true,b:false});assert.equal(s.getItem('deck-studio-settings'),'keep-settings');assert.equal(s.getItem('deck-studio-pane-visibility'),'keep-panes');
 const writes=s.writes.length;assert.equal(writeWorkspacePosition('a',view,s),false);assert.equal(s.writes.length,writes,'Unchanged positions perform no synchronous writes');
 for(let i=0;i<105;i++)writeWorkspacePosition('doc'+i,{slideId:'page'+i,index:i%4,sourceMode:!!(i%2)},s);assert.equal(Object.keys(JSON.parse(s.getItem(WORKSPACE_POSITION_KEY)!)).length,100);assert.equal(readWorkspacePosition('a',s),undefined);assert.equal(readWorkspacePosition('doc104',s)?.slideId,'page104');
});

test('position identity survives reorder and deletion falls back to a valid nearby slide',()=>{
 const slides=[{id:'first'},{id:'second'},{id:'third'}];assert.equal(workspaceSlideId(slides,view),'third');assert.equal(workspaceSlideId([slides[2],slides[0],slides[1]],view),'third');assert.equal(workspaceSlideId(slides.slice(0,2),view),'second');assert.equal(workspaceSlideId(slides,{...view,slideId:'removed',index:1}),'second');assert.equal(workspaceSlideId(slides),'first');assert.equal(workspaceSlideId([]),'');
});

test('malformed, oversized or denied UI storage cannot break navigation, and extra fields never propagate',()=>{
 const s=memory();for(const raw of ['{broken','null','[]','false','"text"','x'.repeat(65537),JSON.stringify({a:{slideId:'x',index:-1,sourceMode:true}}),JSON.stringify({a:{slideId:'x',index:0,sourceMode:'false'}})]){s.values.set(WORKSPACE_POSITION_KEY,raw);assert.equal(readWorkspacePosition('a',s),undefined);}
 s.values.set(WORKSPACE_POSITION_KEY,JSON.stringify({a:{...view,content:'must-not-copy'}}));assert(writeWorkspacePosition('b',view,s));assert.deepEqual(JSON.parse(s.getItem(WORKSPACE_POSITION_KEY)!),{a:view,b:view});assert.equal(writeWorkspacePosition('',view,s),false);assert.equal(writeWorkspacePosition('a',{...view,index:500},s),false);
 const denied={getItem(){throw new Error('Denied');},setItem(){throw new Error('Quota');}};assert.equal(readWorkspacePosition('a',denied),undefined);assert.equal(writeWorkspacePosition('a',view,denied),false);s.values.set('deck-studio-view-modes','broken-legacy');assert(writeWorkspacePosition('c',view,s));assert.equal(s.getItem('deck-studio-view-modes'),'broken-legacy');
 const proto=JSON.parse('{"__proto__":{"slideId":"safe","index":0,"sourceMode":false}}');s.values.set(WORKSPACE_POSITION_KEY,JSON.stringify(proto));writeWorkspacePosition('normal',view,s);assert.equal(readWorkspacePosition('__proto__',s)?.slideId,'safe');assert.equal(({}as{slideId?:string}).slideId,undefined);
});
