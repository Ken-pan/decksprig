import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotNativeTransitions,applyNativeTransitions} from '../plugins/figma-export/slide-transitions';

const dissolve={style:'DISSOLVE',duration:2,curve:'LINEAR',timing:{type:'AFTER_DELAY',delay:2}};
const none={style:'NONE',duration:0,curve:'EASE_OUT',timing:{type:'ON_CLICK'}};
function slide(id:string,value:any){let transition=structuredClone(value),writes=0;return {id,removed:false,getSlideTransition:()=>structuredClone(transition),setSlideTransition(v:any){writes++;transition=structuredClone(v);},reset(){transition=structuredClone(none);},writes:()=>writes};}

test('structural finalization restores the predecessor reset observed after native final-row removal',()=>{
 const predecessor=slide('predecessor',dissolve),removed=slide('removed',dissolve),untouched=slide('none',none),plans=snapshotNativeTransitions([predecessor,removed,untouched]);
 predecessor.reset();removed.removed=true;assert.equal(applyNativeTransitions(plans.values(),true),true);
 assert.deepEqual(predecessor.getSlideTransition(),dissolve);assert.equal(predecessor.writes(),1);assert.equal(removed.writes(),0);assert.equal(untouched.writes(),0);
});

test('non-NONE structural plans are reapplied even when the transaction getter is cached',()=>{
 let actual:any=structuredClone(none),writes=0;const n={id:'cached',getSlideTransition:()=>structuredClone(dissolve),setSlideTransition(t:any){writes++;actual=t;}},plans=snapshotNativeTransitions([n]);
 assert.equal(applyNativeTransitions(plans.values(),true),true);assert.equal(writes,1);assert.deepEqual(actual,dissolve);
});

test('ordinary content changes do not rewrite unrelated transitions and authored NONE accepts native canonical duration',()=>{
 const n=slide('unchanged',dissolve);assert.equal(applyNativeTransitions(snapshotNativeTransitions([n]).values()),false);assert.equal(n.writes(),0);
 let calls=0;const canonical={id:'none',getSlideTransition:()=>none,setSlideTransition(t:any){calls++;assert.equal(t.duration,.01);}};
 assert.equal(applyNativeTransitions([{node:canonical,transition:none,authored:true}]),true);assert.equal(calls,1);
});

test('a rejected or clamped transition marks the transaction changed before a failed readback',()=>{
 const n=slide('blocked',dissolve),plans=snapshotNativeTransitions([n]);n.reset();n.setSlideTransition=()=>{};let started=0;
 assert.throws(()=>applyNativeTransitions(plans.values(),true,()=>started++),/could not retain/);assert.equal(started,1);
});
