import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext,Script} from 'node:vm';
import {blankSlide,element,newDeck,validateDeck,type ElementAnimation} from '../src/core/model';
import {applyOperations} from '../src/core/operations';
import {defaultAnimation,EASINGS,entranceFrames,createElementPlayback,clickOrders} from '../src/core/motion';
import {resolveObjectMotion,objectMotionVisible,objectCueDuration} from '../src/core/motion-sequence';
import {objectMotionSequence,moveObjectMotionGroup} from '../src/core/motion-authoring';
import {motionPropertyState} from '../src/core/motion-properties';
import {matchSmartLayers} from '../src/core/smart-motion';
import {htmlPlayerScript} from '../src/core/html-player';
import {lazyElementPlayback} from '../src/core/lazy-motion-playback';

const motion=(patch:Partial<ElementAnimation>={})=>({...defaultAnimation,phase:'in' as const,effect:'fade' as const,trigger:'click' as const,...patch});
function sequence(){const slide=blankSlide();slide.elements=[element('rect',{id:'one',animation:motion({order:2,duration:500,delay:20})}),element('rect',{id:'two',animation:motion({order:3,trigger:'with-previous',duration:800,delay:50})}),element('rect',{id:'three',animation:motion({order:4,trigger:'after-previous',duration:300,delay:10,phase:'out'})}),element('rect',{id:'four',animation:motion({order:8,duration:400})})];return slide;}
function target(){
 const runs:any[]=[];let cancelled=0;
 const node={style:{visibility:'',transform:'rotate(25deg)'},inert:false,animate:(frames:Keyframe[],timing:KeyframeAnimationOptions)=>{const run={frames,timing,playState:'running',onfinish:undefined as undefined|(()=>void),pause(){this.playState='paused';},play(){this.playState='running';},cancel(){cancelled++;this.playState='idle';},finish(){this.playState='finished';this.onfinish?.();}};runs.push(run);return run;}}as unknown as HTMLElement;
 return {node,runs,cancelled:()=>cancelled};
}

test('object timeline resolves parallel and after-previous chains into one click block',()=>{
 const slide=sequence(),before=JSON.stringify(slide),plan=resolveObjectMotion(slide);
 assert.deepEqual(plan.orders,[2,8]);assert.deepEqual(plan.entries.map(e=>[e.id,e.cue,e.start,e.end]),[['one',1,20,520],['two',1,70,870],['three',1,880,1180],['four',2,0,400]]);
 assert.equal(objectCueDuration(slide,1),1180);assert.equal(JSON.stringify(slide),before);assert.deepEqual(clickOrders(slide),[2,8]);
 const portable=runInNewContext(`(${resolveObjectMotion.toString()})`,{__name:(fn:Function)=>fn});assert.equal(JSON.stringify(portable(slide)),JSON.stringify(plan));
});

test('legacy auto staggering and equal click groups remain unchanged alongside new relative timing',()=>{
 const slide=blankSlide();slide.elements=[element('rect',{id:'auto1',animation:{...defaultAnimation,effect:'fade',order:10,delay:20}}),element('rect',{id:'auto2',animation:{...defaultAnimation,effect:'fade',order:20,delay:30}}),element('rect',{id:'click1',animation:{...defaultAnimation,effect:'fade',trigger:'click',order:8}}),element('rect',{id:'click2',animation:{...defaultAnimation,effect:'rise',trigger:'click',order:8}})];
 const deck=newDeck('Legacy',[slide]),loaded=validateDeck(JSON.parse(JSON.stringify(deck)));assert.deepEqual(loaded,deck);
 const plan=resolveObjectMotion(slide);assert.deepEqual(plan.entries.filter(e=>e.cue===0).map(e=>e.start),[20,100]);assert.deepEqual(plan.orders,[8]);assert(plan.entries.every(e=>e.legacy));assert.equal(objectCueDuration(slide,0),0);
 assert.deepEqual(motionPropertyState([slide.elements[0],element('rect',{animation:motion()})],'phase'),{value:'in',mixed:false});
});

test('orphan relative timing is anchored to slide entry and hidden/disabled entries do not create clicks',()=>{
 const slide=blankSlide();slide.elements=[element('rect',{id:'relative',animation:motion({trigger:'after-previous',delay:40})}),element('rect',{hidden:true,animation:motion({order:4})}),element('rect',{animation:motion({order:6,effect:'none'})})];const plan=resolveObjectMotion(slide);assert.deepEqual(plan.orders,[]);assert.equal(plan.entries[0].cue,0);assert.equal(plan.entries[0].start,40);assert.equal(objectMotionVisible(plan.entries[0],0),true);
});

test('relative timing follows an automatic parent and With previous includes its actual delayed start',()=>{
 const slide=blankSlide();slide.elements=[element('rect',{id:'automatic',animation:motion({trigger:'auto',delay:100,duration:600,withTransition:true})}),element('rect',{id:'parallel',animation:motion({order:1,trigger:'with-previous',delay:50,duration:200})}),element('rect',{id:'after',animation:motion({order:2,trigger:'after-previous',delay:30,duration:100})})];const plan=resolveObjectMotion(slide);assert.deepEqual(plan.orders,[]);assert.deepEqual(plan.entries.map(e=>[e.id,e.cue,e.start,e.end,e.withTransition]),[['automatic',0,100,700,true],['parallel',0,150,350,true],['after',0,730,830,true]]);
});

test('same-order relative objects share their anchor and after waits for the parallel group',()=>{
 const slide=blankSlide();slide.elements=[element('rect',{id:'parent',animation:motion({duration:600,delay:100})}),element('rect',{id:'child1',animation:motion({order:1,trigger:'after-previous',duration:200,delay:10})}),element('rect',{id:'child2',animation:motion({order:1,trigger:'after-previous',duration:500,delay:30})}),element('rect',{id:'following',animation:motion({order:2,trigger:'after-previous',duration:100})})];assert.deepEqual(resolveObjectMotion(slide).entries.map(e=>[e.id,e.start,e.end]),[['parent',100,700],['child1',710,910],['child2',730,1230],['following',1230,1330]]);
});

test('In and Out preserve click visibility under reduced motion without WAAPI',()=>{
 for(const phase of ['in','out']as const){const {node,runs}=target(),a=motion({phase}),entry=resolveObjectMotion({...blankSlide(),elements:[element('rect',{id:'cue',animation:a})]}).entries[0],p={animation:a,entry,orders:[0],step:0,enabled:true,reduced:true,replay:0,offset:0};const action=createElementPlayback(EASINGS,entranceFrames)(node,p);assert.equal(node.style.visibility,phase==='in'?'hidden':'');action.update({...p,step:1});assert.equal(node.style.visibility,phase==='out'?'hidden':'');assert.equal(node.inert,phase==='out');assert.equal(runs.length,0);action.update({...p,step:0});assert.equal(node.style.visibility,phase==='in'?'hidden':'');action.destroy();}
});

test('Out uses the resolved delay, pauses, persists its final state, restores backwards and replays',()=>{
 const slide=sequence(),entry=resolveObjectMotion(slide).entries.find(e=>e.id==='three')!,a=slide.elements[2].animation!,{node,runs}=target(),p={animation:a,entry,orders:[2,8],step:0,enabled:true,reduced:false,replay:0,offset:0};const action=createElementPlayback(EASINGS,entranceFrames)(node,p);
 assert.equal(node.style.visibility,'');assert.equal(runs.length,0);action.update({...p,step:1,paused:true});assert.equal(runs[0].timing.delay,880);assert.equal(runs[0].playState,'paused');assert.equal(runs[0].frames[0].opacity,1);assert.equal(runs[0].frames[1].opacity,0);
 action.update({...p,step:1});assert.equal(runs[0].playState,'running');runs[0].finish();assert.equal(node.style.visibility,'hidden');assert.equal(node.inert,true);
 action.update({...p,step:2});assert.equal(node.style.visibility,'hidden');action.update({...p,step:1});assert.equal(node.style.visibility,'hidden');assert.equal(runs.length,1);
 action.update({...p,step:0});assert.equal(node.style.visibility,'');action.update({...p,step:1});assert.equal(runs.length,2);action.update({...p,step:0,replay:1});assert.equal(node.style.visibility,'');action.update({...p,step:1,replay:1});assert.equal(runs.length,3);assert.equal(node.style.transform,'rotate(25deg)');action.destroy();
});

test('replay from an advanced step restarts new automatic motion instead of restoring backwards',()=>{
 const {node,runs}=target(),a=motion({trigger:'auto'}),entry=resolveObjectMotion({...blankSlide(),elements:[element('rect',{id:'auto',animation:a})]}).entries[0],p={animation:a,entry,orders:[1],step:1,enabled:true,reduced:false,replay:0,offset:0};const action=createElementPlayback(EASINGS,entranceFrames)(node,p);assert.equal(runs.length,0);action.update({...p,step:0,replay:1});assert.equal(runs.length,1);assert.equal(runs[0].playState,'running');action.destroy();
});

test('new entrances hold their delay through handoff and matched objects still play later Out cues',()=>{
 const {node,runs}=target(),a=motion({delay:120}),entry=resolveObjectMotion({...blankSlide(),elements:[element('rect',{id:'cue',animation:a})]}).entries[0],p={animation:a,entry,orders:[0],step:1,enabled:true,reduced:false,entering:true,shared:true,replay:0,offset:0};const action=createElementPlayback(EASINGS,entranceFrames)(node,p);assert.equal(runs[0].playState,'paused');assert.equal(runs[0].timing.delay,120);action.update({...p,entering:false});assert.equal(runs[0].playState,'running');runs[0].finish();assert.equal(node.inert,false);action.destroy();
 const out=motion({phase:'out'}),next=target(),outEntry=resolveObjectMotion({...blankSlide(),elements:[element('rect',{id:'out',animation:out})]}).entries[0],control=createElementPlayback(EASINGS,entranceFrames)(next.node,{...p,animation:out,entry:outEntry,step:0,entering:false});control.update({...p,animation:out,entry:outEntry,entering:false});assert.equal(next.runs.length,1);control.destroy();
});

test('complete cue blocks reorder atomically with relative children and locked guards',()=>{
 const slide=sequence(),deck=newDeck('Order',[slide]),before=JSON.stringify(deck),groups=objectMotionSequence(slide);assert.deepEqual(groups.map(g=>[g.cue,g.elements.map(e=>e.id)]),[[1,['one','two','three']],[2,['four']]]);assert.equal(groups[0].canMoveEarlier,false);assert.equal(groups[0].canMoveLater,true);
 const moved=applyOperations(deck,moveObjectMotionGroup(slide,1,1)),plan=resolveObjectMotion(moved.slides[0]);assert.deepEqual(plan.entries.map(e=>[e.id,e.cue,e.trigger]),[['four',1,'click'],['one',2,'click'],['two',2,'with-previous'],['three',2,'after-previous']]);assert.equal(JSON.stringify(deck),before);
 slide.elements[3].locked=true;assert.deepEqual(moveObjectMotionGroup(slide,1,1),[]);assert.equal(objectMotionSequence(slide)[0].canMoveLater,false);assert.deepEqual(moveObjectMotionGroup(slide,1,0),[]);
});

test('Smart Animate excludes exited objects and pending In cues while retaining not-yet-exited objects',()=>{
 const from=blankSlide(),to=blankSlide();from.elements=[element('rect',{name:'Card',animation:motion({phase:'out'})})];to.elements=[element('rect',{name:'Card'})];assert.equal(matchSmartLayers(from,to,{fromStep:0}).pairs.length,1);assert.equal(matchSmartLayers(from,to,{fromStep:1}).pairs.length,0);
 from.elements[0].animation=motion();assert.equal(matchSmartLayers(from,to,{fromStep:0}).pairs.length,0);assert.equal(matchSmartLayers(from,to,{fromStep:1}).pairs.length,1);
});

test('portable factory uses the same Out/reduced cue contract and exported script has no missing serializer symbols',()=>{
 const player=runInNewContext(`(${createElementPlayback.toString()})`,{__name:(fn:Function)=>fn}),frames=runInNewContext(`(${entranceFrames.toString()})`,{__name:(fn:Function)=>fn}),{node,runs}=target(),a=motion({phase:'out'}),p={animation:a,entry:{cue:1,start:200,phase:'out'},step:0,orders:[0],enabled:true,reduced:true,replay:0,offset:0};const control=player(EASINGS,frames)(node,p);assert.equal(node.style.visibility,'');control.update({...p,step:1});assert.equal(node.style.visibility,'hidden');assert.equal(runs.length,0);
 const script=htmlPlayerScript();new Script(script);assert.match(script,/resolveMotion:/);assert.match(script,/cueDuration:/);assert(!script.includes('motion.orders('));assert(!script.includes('autoOrders:'));
});

test('canvas playback factory loads only for playback and ignores stale destroyed gates',async()=>{
 const slide=sequence(),a=slide.elements[0],first=target(),p={slide,elementId:a.id,animation:a.animation,step:1,enabled:false,reduced:false,replay:0},action=lazyElementPlayback(first.node,p);assert.equal(first.runs.length,0);assert.equal(first.node.style.visibility,'');action.update({...p,enabled:true});await import('../src/core/motion-runtime');assert.equal(first.runs.length,1);action.destroy();
 const stale=target(),control=lazyElementPlayback(stale.node,{...p,enabled:true});control.destroy();await import('../src/core/motion-runtime');assert.equal(stale.runs.length,0);
});
