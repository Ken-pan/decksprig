import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { blankSlide, element, newDeck, validateDeck } from '../src/core/model';
import { applyOperations } from '../src/core/operations';
import { matchSmartLayers, createSmartTransition } from '../src/core/smart-motion';
import { createNextMotionState, moveEntranceGroup } from '../src/core/motion-authoring';
import {resolvePageTransition} from '../src/core/transitions';
import { defaultAnimation, suggestEntrances } from '../src/core/motion';
import {resolveObjectMotion} from '../src/core/motion-sequence';
import { aiJsonSchema, omitNull } from '../server/ai-schema';

test('smart identity is explicit, unique and independent of element IDs; ambiguity never guesses',()=>{
  const a=blankSlide(),b=blankSlide();a.elements=[element('rect',{name:'Card',motionKey:'hero'})];b.elements=[element('rect',{name:'Different name',motionKey:'hero',x:500})];
  let p=matchSmartLayers(a,b);assert.equal(p.pairs.length,1);assert.equal(p.pairs[0].basis,'key');assert.notEqual(p.pairs[0].from.id,p.pairs[0].to.id);
  b.elements.push(element('rect',{name:'Other',motionKey:'hero'}));p=matchSmartLayers(a,b);assert.equal(p.pairs.length,0);assert.equal(p.issues.length,1);
  b.elements.pop();b.elements[0].motionMatch='off';assert.equal(matchSmartLayers(a,b).pairs.length,0);
  b.elements[0].motionMatch='auto';b.elements[0].type='ellipse';assert.equal(matchSmartLayers(a,b).pairs.length,0);assert.equal(matchSmartLayers(a,b).issues.length,1);
});
test('automatic matching respects flat-group context and omits hidden, source-region and future click objects',()=>{
  const a=blankSlide(),b=blankSlide();a.elements=[element('rect',{name:'Card',group:'one'}),element('text',{name:'Label',group:'one'})];b.elements=[element('rect',{name:'Card',group:'two'}),element('text',{name:'Label',group:'two'})];assert.equal(matchSmartLayers(a,b).pairs.length,2);
  b.elements[0].group=undefined;assert.equal(matchSmartLayers(a,b).pairs.length,0);
  b.elements=JSON.parse(JSON.stringify(a.elements));b.elements.forEach(e=>e.id+='-next');b.elements[0].hidden=true;assert.equal(matchSmartLayers(a,b).pairs.length,0);
  a.elements=[element('rect',{name:'Visible'})];b.elements=[element('rect',{name:'Visible',animation:{...defaultAnimation,effect:'fade',trigger:'click'}})];assert.equal(matchSmartLayers(a,b).pairs.length,0);assert.equal(matchSmartLayers(a,b,{toStep:1}).pairs.length,1);
  b.elements[0].animation=undefined;b.elements[0].opacity=0;assert.equal(matchSmartLayers(a,b).pairs.length,1);
  b.elements[0].sourceRegion={left:0,top:0,right:0,bottom:0};assert.equal(matchSmartLayers(a,b).pairs.length,0);
});
test('uniform typography can shrink continuously; changed wrapping, fonts, data and media use dissolve',()=>{
  const a=blankSlide(),b=blankSlide();a.elements=[element('text',{name:'Title',text:'A story',w:720,h:144,fontSize:96})];b.elements=[element('text',{name:'Title',text:'A story',w:360,h:72,fontSize:48})];assert.equal(matchSmartLayers(a,b).pairs[0].dissolve,false);
  b.elements[0].w=300;assert.equal(matchSmartLayers(a,b).pairs[0].dissolve,true);b.elements[0].w=360;b.elements[0].text='Another story';assert.equal(matchSmartLayers(a,b).pairs[0].dissolve,true);
  a.elements=[element('image',{name:'Photo',src:'data:image/png;base64,AA=='})];b.elements=[element('image',{name:'Photo',src:'data:image/png;base64,AB=='})];assert.equal(matchSmartLayers(a,b).pairs[0].dissolve,true);
  a.elements=[element('chart',{name:'Chart',values:[{label:'A',value:10}]})];b.elements=[element('chart',{name:'Chart',values:[{label:'A',value:20}]})];assert.equal(matchSmartLayers(a,b).pairs[0].dissolve,true);
});
test('table-only style changes crossfade in live and serialized Smart Animate without replacing nodes',()=>{
 const a=blankSlide(),b=blankSlide();a.elements=[element('table',{name:'Metrics',cells:[['A','B'],['1','2']],tableStyle:{cellStyles:[{row:1,column:1,fill:'#ffffff',strikethrough:false}],columnWidths:[1,1]}})];b.elements=[element('table',{...a.elements[0],id:'styled-table',x:a.elements[0].x+80,tableStyle:{cellStyles:[{row:1,column:1,fill:'#00ff00',strikethrough:true}],columnWidths:[1,2]}})];
 const before=JSON.stringify([a,b]),plan=matchSmartLayers(a,b);assert.equal(plan.pairs[0].dissolve,true);assert(plan.pairs[0].changed.includes('content'));
 const context={resolveObjectMotion,__name:(f:Function)=>f,getComputedStyle:()=>({visibility:'visible',opacity:'1'})},portableMatcher=runInNewContext(`(${matchSmartLayers.toString()})`,context),portableFactory=runInNewContext(`(${createSmartTransition.toString()})`,context);
 assert.equal(JSON.stringify(portableMatcher(a,b)),JSON.stringify(plan));
 for(const run of [createSmartTransition(matchSmartLayers),portableFactory(portableMatcher)]){
  const captured:any[]=[],node=(e:any)=>({dataset:{elementId:e.id},style:{visibility:''},querySelector:()=>null,animate:(frames:any,timing:any)=>{captured.push({id:e.id,frames,timing});return{};},cloneNode(){throw new Error('Keep original table nodes');}}),old=node(a.elements[0]),next=node(b.elements[0]),root=(n:any)=>({querySelectorAll:()=>[n],querySelector:()=>({style:{backgroundColor:'#ffffff'}})});
  const originalComputedStyle=globalThis.getComputedStyle;globalThis.getComputedStyle=context.getComputedStyle as unknown as typeof getComputedStyle;
  try{assert.equal(run(root(next),root(old),a,b,{duration:600,fill:'both'},[],[],{native:true}),true);}finally{globalThis.getComputedStyle=originalComputedStyle;}
  assert.equal(old.style.visibility,'');assert(captured.some(c=>c.id===a.elements[0].id&&c.frames[0].opacity===1&&c.frames[1].opacity===0));assert(captured.some(c=>c.id===b.elements[0].id&&c.frames[0].opacity===0&&c.frames[1].opacity===1));assert(captured.every(c=>c.timing.duration===600));
 }
 assert.equal(JSON.stringify([a,b]),before);
 b.elements[0]={...a.elements[0],id:'same-style',tableStyle:JSON.parse(JSON.stringify(a.elements[0].tableStyle))};assert.equal(matchSmartLayers(a,b).pairs[0].dissolve,false);assert.deepEqual(matchSmartLayers(a,b).pairs[0].changed,[]);
});
test('copying a motion state is one guarded transaction and protects source geometry, authored cues and references',()=>{
  const s=blankSlide('Evidence');s.source={provider:'PDF',render:'data:image/png;base64,AA==',warnings:[],fidelity:'source-render'};
  s.elements=[element('rect',{name:'Card',group:'g',animation:{...defaultAnimation,effect:'rise',duration:940,delay:280,trigger:'click',order:7}}),element('text',{name:'Caption',locked:true,group:'g'})];const deck=newDeck('States',[s]);const before=JSON.stringify(deck),candidate=createNextMotionState(deck,s),after=applyOperations(deck,candidate.operations);
  assert.equal(after.revision,1);assert.equal(after.slides.length,2);assert.equal(after.slides[1].transition?.effect,'smart');assert.equal(after.slides[0].elements[0].motionKey,after.slides[1].elements[0].motionKey);
  assert.deepEqual(after.slides[0].elements[0].animation,s.elements[0].animation);assert.equal(after.slides[1].elements[0].animation?.effect,'none');assert.equal(after.slides[1].elements[0].animation?.duration,940);assert.deepEqual(after.slides[1].source,s.source);
  assert.equal(after.slides[0].elements[1].motionKey,undefined);assert.equal(after.slides[1].elements[1].locked,true);assert.notEqual(after.slides[1].elements[0].group,s.elements[0].group);assert.equal(JSON.stringify(deck),before);
  assert.equal(matchSmartLayers(after.slides[0],after.slides[1]).pairs.length,2);assert.throws(()=>applyOperations(after,candidate.operations,0,'ai'));
  assert.throws(()=>applyOperations(deck,[{op:'rename_deck',title:'Invalid'},{op:'update_element',slideId:s.id,elementId:s.elements[0].id,patch:{motionKey:'x'.repeat(81)}}]));assert.equal(JSON.stringify(deck),before);
  assert.deepEqual(validateDeck(JSON.parse(before)),deck);
});
test('entrance reorder moves whole click groups, keeps automatic cues and preserves locked groups',()=>{
  const s=blankSlide();s.elements=[element('text',{animation:{...defaultAnimation,effect:'fade',trigger:'click',order:2,delay:240}}),element('rect',{animation:{...defaultAnimation,effect:'rise',trigger:'click',order:2}}),element('text',{animation:{...defaultAnimation,effect:'fade',trigger:'click',order:8}}),element('text',{animation:{...defaultAnimation,effect:'fade',order:2}})];const d=newDeck('Order',[s]),next=applyOperations(d,moveEntranceGroup(s,'click',2,1));assert.deepEqual(next.slides[0].elements.map(e=>e.animation?.order),[8,8,2,2]);assert.equal(next.slides[0].elements[0].animation?.delay,240);
  s.elements[1].locked=true;assert.deepEqual(moveEntranceGroup(s,'click',2,1),[]);assert.deepEqual(moveEntranceGroup(s,'click',2,-1),[]);
});
test('motion recipes prioritize readable content, limit noise and preserve manually configured/protected objects',()=>{
  const s=blankSlide();s.elements=[element('rect',{name:'Background',x:0,y:0,w:1440,h:810}),element('text',{name:'Body',fontSize:32,y:400}),element('text',{name:'Title',fontSize:96,y:250}),element('text',{name:'Authored',animation:{...defaultAnimation,effect:'slide',delay:400}}),...Array.from({length:12},(_,i)=>element('image',{name:'Photo '+i,src:'data:image/png;base64,AA==',y:500+i}))];
  const d=newDeck('Recipe',[s]),ops=suggestEntrances(d,s,'quiet');assert.equal(ops.length,8);assert.equal('elementId'in ops[0]&&ops[0].elementId,s.elements[2].id);const after=applyOperations(d,ops);assert.deepEqual(after.slides[0].elements[3].animation,s.elements[3].animation);assert.equal(after.slides[0].elements[0].animation,undefined);
  const shared=suggestEntrances(d,s,'story',[s.elements[2].id]);assert(shared.every(op=>!('elementId'in op)||op.elementId!==s.elements[2].id));
});
test('smart matching and DOM runtime serialize with no application globals and never clone a surface',()=>{
  const a=blankSlide(),b=blankSlide();a.elements=[element('rect',{name:'Card',x:40,y:80,w:200,h:100,fill:'#ff0000',rotation:350})];b.elements=[element('rect',{name:'Card',x:300,y:200,w:400,h:200,fill:'#00ff00',rotation:10})];
  const captured:any[]=[];const node=(e:any)=>{const shape={style:{},animate:(frames:any,timing:any)=>{captured.push({target:'shape',frames,timing});return{}}};return{dataset:{elementId:e.id},style:{visibility:'',contain:''},querySelector:(q:string)=>q==='.element-motion'?{inert:false,style:{visibility:''}}:q==='.element-visual'?{style:{},animate:shape.animate}:q.includes('shape-content')?shape:null,animate:(frames:any,timing:any)=>{captured.push({target:e.id,frames,timing});return{}},cloneNode(){throw new Error('No clones')}};};
  const old=node(a.elements[0]),next=node(b.elements[0]),oldPage={style:{backgroundColor:'#111111'}},newPage={style:{backgroundColor:'#eeeeee'}};
  const root=(n:any,page:any)=>({querySelectorAll:()=>[n],querySelector:()=>page});
  const context={resolveObjectMotion,__name:(f:Function)=>f,getComputedStyle:()=>({visibility:'visible',opacity:'1'})};const matcher=runInNewContext(`(${matchSmartLayers.toString()})`,context),factory=runInNewContext(`(${createSmartTransition.toString()})`,context),restore:Function[]=[],animations:any[]=[];
  const before=JSON.stringify([a,b]);assert.equal(factory(matcher)(root(next,newPage),root(old,oldPage),a,b,{duration:650,fill:'both'},animations,restore),true);assert.equal(old.style.visibility,'hidden');assert.equal(newPage.style.backgroundColor,'transparent');
  const geometry=captured.find(c=>c.target===b.elements[0].id);assert.match(geometry.frames[0].transform,/rotate\(-10deg\)/);assert.match(geometry.frames[1].transform,/rotate\(10deg\)/);assert.match(geometry.frames[0].transform,/scale\(0.5,0.5\)/);
  const paint=captured.find(c=>c.frames[0].backgroundColor);assert.equal(paint.frames[0].backgroundColor,'#ff0000');assert.equal(paint.frames[1].backgroundColor,'#00ff00');restore.forEach(fn=>fn());assert.equal(old.style.visibility,'');assert.equal(newPage.style.backgroundColor,'#eeeeee');assert.equal(JSON.stringify([a,b]),before);
});
test('AI structured edits expose smart identity, animation and opacity without bypassing canonical validation',()=>{
  const schema=JSON.stringify(aiJsonSchema);for(const word of ['motionKey','motionMatch','animation','opacity','smart'])assert(schema.includes('"'+word+'"'));
  const s=blankSlide();s.elements=[element('rect')];const d=newDeck('AI motion',[s]);const patch=omitNull({motionKey:'hero',motionMatch:'auto',opacity:.5,animation:{...defaultAnimation,effect:'fade'},fontSize:null});const result=applyOperations(d,[{op:'update_element',slideId:s.id,elementId:s.elements[0].id,patch}],0,'ai');assert.equal(result.slides[0].elements[0].motionKey,'hero');assert.equal(result.slides[0].elements[0].opacity,.5);
  assert.throws(()=>applyOperations(d,[{op:'update_element',slideId:s.id,elementId:s.elements[0].id,patch:{opacity:2}}],0,'ai'));d.slides[0].elements[0].locked=true;assert.throws(()=>applyOperations(d,[{op:'update_element',slideId:s.id,elementId:s.elements[0].id,patch}],0,'ai'));
});

test('a smart boundary reverses with its authored timing while ordinary destination presets and replay keep their settings',()=>{
  const a=blankSlide(),b=blankSlide();a.transition={effect:'none',duration:300,easing:'linear'};b.transition={effect:'smart',duration:920,easing:'cinematic'};
  assert.deepEqual(resolvePageTransition(a,b,1),b.transition);assert.deepEqual(resolvePageTransition(b,a,-1),b.transition);assert.deepEqual(resolvePageTransition(null,a,-1),a.transition);
  b.transition.effect='iris';assert.deepEqual(resolvePageTransition(b,a,-1),a.transition);
  const resolve=runInNewContext(`(${resolvePageTransition.toString()})`,{__name:(f:Function)=>f});b.transition.effect='smart';assert.equal(resolve(b,a,-1).effect,'smart');
});

test('native Smart Animate fades unmatched layers for the full timeline, including pages with no matches',()=>{
 const a=blankSlide(),b=blankSlide();a.elements=[element('rect',{name:'Outgoing',opacity:.4})];b.elements=[element('ellipse',{name:'Incoming',opacity:.6})];const captured:any[]=[];
 const node=(e:any)=>({dataset:{elementId:e.id},opacity:e.opacity,style:{visibility:''},querySelector:()=>null,animate:(frames:any,timing:any)=>{captured.push({id:e.id,frames,timing});return{};}}),root=(n:any)=>({querySelectorAll:()=>[n],querySelector:()=>({style:{backgroundColor:'#ffffff'}})}),old=node(a.elements[0]),next=node(b.elements[0]);
 const context={resolveObjectMotion,__name:(f:Function)=>f,getComputedStyle:(n:any)=>({visibility:'visible',opacity:String(n.opacity)})},matcher=runInNewContext(`(${matchSmartLayers.toString()})`,context),factory=runInNewContext(`(${createSmartTransition.toString()})`,context),run=factory(matcher),timing={duration:2000,easing:'linear',fill:'both'};
 assert.equal(run(root(next),root(old),a,b,timing,[],[],{native:true}),true);const outgoing=captured.find(c=>c.id===a.elements[0].id),incoming=captured.find(c=>c.id===b.elements[0].id);assert.deepEqual(JSON.parse(JSON.stringify(outgoing.frames)),[{opacity:.4},{opacity:0}]);assert.deepEqual(JSON.parse(JSON.stringify(incoming.frames)),[{opacity:0},{opacity:.6}]);assert.equal(outgoing.timing.duration,2000);captured.length=0;assert.equal(run(root(next),root(old),a,b,timing,[],[]),false);assert.equal(captured.length,0);
});
