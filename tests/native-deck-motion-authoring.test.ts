import test from 'node:test';
import assert from 'node:assert/strict';
import {blankSlide,element,newDeck} from '../src/core/model';
import {applyOperations} from '../src/core/operations';
import {resolveObjectMotion} from '../src/core/motion';
import {planNativeDeckMotion} from '../src/core/native-deck-motion-authoring';
import {extractNativeDeckMotion} from '../src/core/native-deck-motion';
import {nativeDeckCodecs} from '../server/native-deck-motion';
import {memorySource,nativeArchive,nativeFixture} from './helpers/native-deck-motion';

const options={linkedFileKey:'native-file',archiveSourceConfirmed:true};
function linked(){const s=blankSlide();s.source={provider:'Figma',nodeId:'221:12',fidelity:'converted',warnings:[]};s.elements=[element('rect',{sourceId:'237:28'})];const deck=newDeck('Native supplement',[s]);deck.provenance={provider:'Figma',url:'https://www.figma.com/slides/native-file',importedAt:'2026-10-25T00:00:00Z'};return deck;}
async function captured(modify?:(fixture:ReturnType<typeof nativeFixture>)=>void){const f=nativeFixture();f.nodes[0].objectAnimations[0].actions[0].animationType='FADE';modify?.(f);return extractNativeDeckMotion(memorySource((await nativeArchive({fixture:f})).archive),nativeDeckCodecs);}

test('native Fade Out with custom cubic produces an atomic revision-bound supplement without changing geometry',async()=>{
 const deck=linked(),before=JSON.stringify(deck),capture=await captured(),plan=planNativeDeckMotion(deck,capture,options);
 assert.equal(plan.baseRevision,deck.revision);assert.equal(plan.liveSync,false);assert.deepEqual(plan.issues,[]);assert.equal(plan.operations.length,1);
 const next=applyOperations(deck,plan.operations,plan.baseRevision),old=deck.slides[0].elements[0],a=next.slides[0].elements[0].animation!;
 assert.deepEqual(a,{effect:'fade',phase:'out',duration:600,delay:0,trigger:'click',order:0,easing:'smooth',easingBezier:[0.17000000178813934,0,0.20000000298023224,1]});assert.equal(JSON.stringify(deck),before);assert.equal(next.slides[0].elements[0].id,old.id);assert.equal(next.slides[0].elements[0].x,old.x);assert.deepEqual(next.slides[0].source,deck.slides[0].source);
 assert.deepEqual(planNativeDeckMotion(next,capture,options).operations,[]);assert.throws(()=>applyOperations(next,plan.operations,plan.baseRevision),/changed/);
 const timeline=resolveObjectMotion(next.slides[0]).entries;assert.equal(timeline[0].cue,1);assert.equal(timeline[0].start,0);assert.equal(timeline[0].end,600);
});
test('native Fade In linear maps only the captured values with no easing approximation',async()=>{
 const result=await captured(f=>Object.assign(f.nodes[0].objectAnimations[0].actions[0],{animationPhase:'IN',easingType:'LINEAR',easingFunction:undefined})),plan=planNativeDeckMotion(linked(),result,options),op=plan.operations[0];assert.equal(plan.issues.length,0);assert.equal(op.op,'update_element');if(op.op==='update_element'){assert.equal(op.patch.animation?.phase,'in');assert.equal(op.patch.animation?.easing,'linear');assert.equal(op.patch.animation?.easingBezier,undefined);}
});
test('a native save cannot be silently bound by a filename or opaque local key',async()=>{
 const deck=linked(),capture=await captured();for(const config of [{...options,archiveSourceConfirmed:false},{...options,linkedFileKey:'other-file'}]){const plan=planNativeDeckMotion(deck,capture,config);assert.equal(plan.operations.length,0);assert.match(plan.issues[0].message,/Confirm/);}
 deck.provenance!.url='https://evil.example/slides/native-file';assert.equal(planNativeDeckMotion(deck,capture,options).operations.length,0);
});
test('actual native Slide control remains captured and reviewable rather than silently becoming a 48px slide',async()=>{
 const f=nativeFixture(),capture=await extractNativeDeckMotion(memorySource((await nativeArchive({fixture:f})).archive),nativeDeckCodecs),plan=planNativeDeckMotion(linked(),capture,options);assert.equal(plan.operations.length,0);assert.match(plan.issues[0].message,/SLIDE_FROM_LEFT.*trajectory/);assert.equal(capture.slides[0].cues[0].actions[0].phase,'OUT');
});
test('unknown phase, easing, timing fields, triggers and grouped actions preserve the whole slide sequence',async()=>{
 const variants=[(a:any,c:any)=>a.animationPhase=999,(a:any,c:any)=>a.easingType='SPRING',(a:any,c:any)=>a.transitionDuration=4,(a:any,c:any)=>a.transitionTimeout=.2,(a:any,c:any)=>c.event.interactionType='AFTER_TIMEOUT',(a:any,c:any)=>c.event.transitionTimeout=.2,(a:any,c:any)=>c.actions.push({...a}),(a:any,c:any)=>c.stateManagementVersion=2,(a:any,c:any)=>a.easingFunction=[-1,0,.2,1]];
 for(const mutate of variants){const capture=await captured(f=>{const cue=f.nodes[0].objectAnimations[0];mutate(cue.actions[0],cue);}),deck=linked(),before=JSON.stringify(deck),plan=planNativeDeckMotion(deck,capture,options);assert.equal(plan.operations.length,0);assert(plan.issues.length>0);assert.equal(JSON.stringify(deck),before);}
});
test('read failures block an otherwise representable cue instead of applying a partial native sequence',async()=>{
 const capture=await captured();capture.issues.push({slideId:'221:12',message:'A second native cue could not be read.'});const plan=planNativeDeckMotion(linked(),capture,options);assert.equal(plan.operations.length,0);assert.equal(plan.issues.length,1);
 const global=await captured();global.issues.push({message:'Incomplete snapshot.'});assert.equal(planNativeDeckMotion(linked(),global,options).operations.length,0);
});
test('unresolved, foreign, duplicated, or locked targets never overwrite another local object',async()=>{
 const capture=await captured();for(const mutate of [(d:ReturnType<typeof linked>)=>d.slides[0].elements[0].locked=true,(d:ReturnType<typeof linked>)=>d.slides[0].elements[0].sourceId='other',(d:ReturnType<typeof linked>)=>d.slides[0].elements.push(element('rect',{sourceId:'237:28'})),(d:ReturnType<typeof linked>)=>d.slides[0].source!.nodeId='other']){const deck=linked();mutate(deck);const plan=planNativeDeckMotion(deck,capture,options);assert.equal(plan.operations.length,0);assert(plan.issues.length>0);}
 const foreign=structuredClone(capture);foreign.slides[0].cues[0].actions[0].withinSlide=false;assert.equal(planNativeDeckMotion(linked(),foreign,options).operations.length,0);
});
test('additional native click cues keep order and a single unsupported cue blocks every edit on that slide',async()=>{
 const capture=await captured(),second=structuredClone(capture.slides[0].cues[0]);second.clickOrder=2;second.index=1;second.id='249:30';second.actions[0].targetId='237:29';capture.slides[0].cues.push(second);const deck=linked();deck.slides[0].elements.push(element('rect',{sourceId:'237:29'}));const plan=planNativeDeckMotion(deck,capture,options);assert.equal(plan.operations.length,2);const next=applyOperations(deck,plan.operations),timeline=resolveObjectMotion(next.slides[0]).entries;assert.deepEqual(timeline.map(c=>c.cue),[1,2]);second.actions[0].nativeType='UNKNOWN_ENUM_45';assert.equal(planNativeDeckMotion(deck,capture,options).operations.length,0);
});
test('unrepresented local cues are preserved and surfaced rather than mixed into a native sequence',async()=>{
 const deck=linked();deck.slides[0].elements.push(element('rect',{sourceId:'local',animation:{effect:'fade',duration:600,delay:0,trigger:'click',order:0,easing:'linear'}}));const plan=planNativeDeckMotion(deck,await captured(),options);assert.equal(plan.operations.length,0);assert.match(plan.issues[0].message,/Other local object cues/);
});
