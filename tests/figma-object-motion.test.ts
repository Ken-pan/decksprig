import test from 'node:test';
import assert from 'node:assert/strict';
import {DECK_OBJECT_MOTION_KEY,DECK_OBJECT_MOTION_NAMESPACE,decodeDeckObjectMotion,encodeDeckObjectMotion,restoredObjectMotionWarning,unreadableDeckObjectMotionNodes} from '../src/core/figma-object-motion';
import {prepareDeckObjectMotion,writeDeckObjectMotionBatch,readDeckObjectMotion} from '../plugins/figma-export/object-motion';
import {captureFigma,serializeForDeck} from '../plugins/figma-export/capture';
import {applyDeckToFigma} from '../plugins/figma-export/native';
import {importFigma} from '../src/importers/figma';
import {projectFigmaChanges} from '../src/core/figma-sync';
import {projectFigmaCheckpoint,recoverFigmaDeck} from '../src/core/figma-sync-recovery';

function metadataNode(id='node'){
 const data=new Map<string,string>();let writes=0,motionWrites=0;
 const node:any={id,type:'RECTANGLE',name:id,removed:false,getPluginData:(key:string)=>data.get(key)??'',setPluginData:(key:string,value:string)=>{writes++;if(key===DECK_OBJECT_MOTION_KEY)motionWrites++;data.set(key,value);}};
 return {node,data,writes:()=>writes,motionWrites:()=>motionWrites};
}
function fixture(suffix=''){
 const f=metadataNode('native-object'+suffix),s=metadataNode('native-slide'+suffix);let exports=0;
 Object.assign(f.node,{width:400,height:180,relativeTransform:[[1,0,120],[0,1,90]],absoluteTransform:[[1,0,120],[0,1,90]],absoluteBoundingBox:{x:120,y:90,width:400,height:180},fills:[{type:'SOLID',color:{r:.3,g:.4,b:.5}}],strokes:[],effects:[],opacity:1,visible:true,locked:false,resize(w:number,h:number){this.width=w;this.height=h;}});
 Object.assign(s.node,{type:'SLIDE',width:1920,height:1080,relativeTransform:[[1,0,0],[0,1,0]],absoluteTransform:[[1,0,0],[0,1,0]],absoluteBoundingBox:{x:0,y:0,width:1920,height:1080},fills:[],children:[f.node],getSlideTransition:()=>({style:'NONE',duration:0,curve:'EASE_OUT',timing:{type:'ON_CLICK'}}),exportAsync:async()=>{exports++;return new Uint8Array([1,2,3]);}});f.node.parent=s.node;
 const figma:any={editorType:'slides',fileKey:'motion-file',root:{name:'Motion fixture'},currentPage:{children:[s.node]},getSlideGrid:()=>[[s.node]],base64Encode:(bytes:Uint8Array)=>Buffer.from(bytes).toString('base64'),listAvailableFontsAsync:async()=>[],commitUndo(){}};
 const imported=importFigma({slides:[serializeForDeck(s.node)],url:'https://www.figma.com/slides/motion-file'});
 for(const [node,id,data]of [[f.node,imported.slides[0].elements[0].id,f.data],[s.node,imported.slides[0].id,s.data]]as const){data.set('deck-studio-id',id);data.set('deck-studio-document',imported.id);data.set('deck-studio-native-id',node.id);}
 return {...f,slide:s.node,figma,deck:imported,exports:()=>exports};
}
function sharedStorage(node:any){
 const data=new Map<string,string>();let writes=0;
 node.getSharedPluginData=(namespace:string,key:string)=>{assert.equal(namespace,DECK_OBJECT_MOTION_NAMESPACE);return data.get(key)??'';};
 node.setSharedPluginData=(namespace:string,key:string,value:string)=>{assert.equal(namespace,DECK_OBJECT_MOTION_NAMESPACE);writes++;data.set(key,value);};
 return {data,writes:()=>writes};
}
const authored={animation:{phase:'out' as const,effect:'slide' as const,duration:900,delay:130,trigger:'after-previous' as const,order:37,easing:'linear' as const,easingBezier:[.17,0,.2,1] as [number,number,number,number],withTransition:true},motionKey:'同步对象',motionMatch:'off' as const};

test('versioned Deck motion metadata accepts only its bounded, explicit source contract',()=>{
 const raw=encodeDeckObjectMotion(authored),decoded=decodeDeckObjectMotion(raw);assert.deepEqual(decoded.data,authored);assert.equal(decoded.warning,undefined);assert.equal(encodeDeckObjectMotion({}),'');assert.deepEqual(decodeDeckObjectMotion(''),{});
 for(const value of ['not JSON',JSON.stringify({source:'deck-studio',version:2,...authored}),JSON.stringify({source:'figma-native',version:1,...authored}),JSON.stringify({source:'deck-studio',version:1,...authored,animations:{TRANSLATION_X:[]}}),JSON.stringify({source:'deck-studio',version:1,animation:{...authored.animation,duration:9000}}),JSON.stringify({source:'deck-studio',version:1,motionKey:'中'.repeat(1500)})]){const result=decodeDeckObjectMotion(value);assert.equal(result.data,undefined);assert.match(result.warning!,/ignored/);}
 const {phase:_phase,...rest}=authored.animation,legacyAnimation={...rest,trigger:'auto' as const};const legacy=decodeDeckObjectMotion(encodeDeckObjectMotion({animation:legacyAnimation}));assert.deepEqual(legacy.data?.animation,legacyAnimation);assert(!Object.hasOwn(legacy.data!.animation!,'phase'));
});

test('motion preflight is read-only and unsupported data is preserved without probing native motion APIs',()=>{
 const f=metadataNode();f.data.set(DECK_OBJECT_MOTION_KEY,JSON.stringify({source:'other-motion-provider',version:2,private:'preserve me'}));
 for(const key of ['animations','animationStyles','manualKeyframeTracks','timelines'])Object.defineProperty(f.node,key,{get(){throw Error('Do not probe generic Motion or private animation properties');}});
 const prepared=prepareDeckObjectMotion(f.node,authored);assert.equal(prepared.before,prepared.after);assert.match(prepared.warning!,/Unsupported/);assert.equal(f.writes(),0);assert.equal(writeDeckObjectMotionBatch([{node:f.node,prepared}]),false);assert.equal(f.writes(),0);
 assert.throws(()=>prepareDeckObjectMotion(f.node,{animation:{...authored.animation,duration:99999}}),/2000/);assert.equal(f.writes(),0);
});

test('apply, capture, reconnect import and clear preserve complete local motion and native node identity',async()=>{
 const f=fixture(),cache=new Map();await captureFigma(f.figma,[f.slide],true,cache);const count=f.exports(),after=structuredClone(f.deck),nativeAnimation={style:'SLIDE_RIGHT',animate:'OUT',duration:.6,group:{native:true}},root=f.node;
 f.node.nativeAnimation=nativeAnimation;for(const key of ['animations','animationStyles','manualKeyframeTracks','timelines'])Object.defineProperty(f.node,key,{get(){throw Error('Native object animation API is unavailable');}});
 Object.assign(after.slides[0].elements[0],authored);const applied=await applyDeckToFigma(f.figma,after,f.deck);assert(applied.warnings.some(w=>w.includes('Existing Figma object animations stay unchanged')));assert.equal(f.slide.children[0],root);assert.equal(f.node.nativeAnimation,nativeAnimation);assert.deepEqual(decodeDeckObjectMotion(f.data.get(DECK_OBJECT_MOTION_KEY)).data,authored);
 const bundle=await captureFigma(f.figma,[f.slide],true,cache);assert.equal(f.exports(),count);const restored=importFigma(JSON.parse(JSON.stringify(bundle))),e=restored.slides[0].elements[0];assert.deepEqual({animation:e.animation,motionKey:e.motionKey,motionMatch:e.motionMatch},authored);assert(restored.slides[0].source?.warnings.includes(restoredObjectMotionWarning));
 const unchangedWrites=f.motionWrites();await applyDeckToFigma(f.figma,after,after);assert.equal(f.motionWrites(),unchangedWrites);
 const cleared=structuredClone(after);Object.assign(cleared.slides[0].elements[0],{animation:undefined,motionKey:undefined,motionMatch:undefined});await applyDeckToFigma(f.figma,cleared,after);assert.equal(f.data.get(DECK_OBJECT_MOTION_KEY),'');const noMotion=importFigma(await captureFigma(f.figma,[f.slide],true,cache));assert.equal(noMotion.slides[0].elements[0].animation,undefined);assert.equal(f.node.nativeAnimation,nativeAnimation);assert.equal(f.exports(),count);
});

test('malformed metadata is ignored with a capture warning and does not invalidate native pixels',async()=>{
 const f=fixture(),cache=new Map();await captureFigma(f.figma,[f.slide],true,cache);const count=f.exports();f.data.set(DECK_OBJECT_MOTION_KEY,'{broken');const bundle=await captureFigma(f.figma,[f.slide],true,cache),node=bundle.slides[0].children[0];assert.equal(node.deckStudioMotion,undefined);assert.match(node.deckStudioMotionWarning,/Invalid/);assert.equal(f.exports(),count);const imported=importFigma(bundle);assert.equal(imported.slides[0].elements[0].animation,undefined);assert(imported.slides[0].source?.warnings.some(w=>w.includes('Invalid Deck Studio object motion metadata')));
 const after=structuredClone(f.deck);Object.assign(after.slides[0].elements[0],authored);const result=await applyDeckToFigma(f.figma,after,f.deck);assert(result.warnings.some(w=>w.includes('Invalid Deck Studio object motion metadata')));assert.equal(f.data.get(DECK_OBJECT_MOTION_KEY),'{broken');
});

test('metadata commit detects concurrent changes before writing and rolls back a partial batch',()=>{
 const a=metadataNode('a'),b=metadataNode('b'),first=prepareDeckObjectMotion(a.node,authored),second=prepareDeckObjectMotion(b.node,authored);a.data.set(DECK_OBJECT_MOTION_KEY,'concurrent edit');assert.throws(()=>writeDeckObjectMotionBatch([{node:a.node,prepared:first}]),/Figma changed during preparation/);assert.equal(a.data.get(DECK_OBJECT_MOTION_KEY),'concurrent edit');a.data.delete(DECK_OBJECT_MOTION_KEY);
 let fail=true;const original=b.node.setPluginData;b.node.setPluginData=(key:string,value:string)=>{original(key,value);if(value&&fail){fail=false;throw Error('Injected native metadata write failure');}};
 assert.throws(()=>writeDeckObjectMotionBatch([{node:a.node,prepared:first},{node:b.node,prepared:second}]),/Injected native metadata write failure/);assert.equal(a.node.getPluginData(DECK_OBJECT_MOTION_KEY),'');assert.equal(b.node.getPluginData(DECK_OBJECT_MOTION_KEY),'');
});

test('unreadable metadata and older plugins cannot erase prior local motion during live projection or reconnect',async()=>{
 const f=fixture(),sent=structuredClone(f.deck);Object.assign(sent.slides[0].elements[0],authored);await applyDeckToFigma(f.figma,sent,f.deck);const before=importFigma(await captureFigma(f.figma,[f.slide],false));
 f.data.set(DECK_OBJECT_MOTION_KEY,'{broken');const bundle=await captureFigma(f.figma,[f.slide],false),remote=importFigma(bundle),unreadable=unreadableDeckObjectMotionNodes(bundle);assert(unreadable.has(f.node.id));
 const projected=projectFigmaChanges(sent,before,remote,unreadable),checkpoint={deck:sent,native:before};assert.deepEqual(projected.slides[0].elements[0].animation,authored.animation);assert.equal(projected.slides[0].elements[0].motionKey,authored.motionKey);
 assert.deepEqual(projectFigmaCheckpoint(checkpoint,sent,remote,unreadable).deck?.slides[0].elements[0].animation,authored.animation);assert.deepEqual(recoverFigmaDeck(checkpoint,sent,remote,[f.slide.id],unreadable).deck?.slides[0].elements[0].animation,authored.animation);
 const legacy=structuredClone(bundle);delete legacy.deckStudioMotionVersion;delete legacy.slides[0].children[0].deckStudioMotionWarning;assert.deepEqual(projectFigmaChanges(sent,before,importFigma(legacy),unreadableDeckObjectMotionNodes(legacy)).slides[0].elements[0].animation,authored.animation);
 f.data.set(DECK_OBJECT_MOTION_KEY,'');const clearedBundle=await captureFigma(f.figma,[f.slide],false);assert.equal(unreadableDeckObjectMotionNodes(clearedBundle).size,0);assert.equal(projectFigmaChanges(sent,before,importFigma(clearedBundle),unreadableDeckObjectMotionNodes(clearedBundle)).slides[0].elements[0].animation,undefined);
});

test('identical local object IDs on different native slides keep independent motion payloads',async()=>{
 const a=fixture('-a'),b=fixture('-b'),before=structuredClone(a.deck);before.slides.push(structuredClone(b.deck.slides[0]));for(const [i,f]of [a,b].entries()){before.slides[i].elements[0].id='shared';f.data.set('deck-studio-id','shared');f.data.set('deck-studio-document',before.id);}a.figma.currentPage.children=[a.slide,b.slide];a.figma.getSlideGrid=()=>[[a.slide,b.slide]];
 const after=structuredClone(before),second={animation:{...authored.animation,phase:'in' as const,duration:250,trigger:'click' as const,order:5},motionKey:'second-object',motionMatch:'auto' as const};Object.assign(after.slides[0].elements[0],authored);Object.assign(after.slides[1].elements[0],second);await applyDeckToFigma(a.figma,after,before);assert.deepEqual(decodeDeckObjectMotion(a.data.get(DECK_OBJECT_MOTION_KEY)).data,authored);assert.deepEqual(decodeDeckObjectMotion(b.data.get(DECK_OBJECT_MOTION_KEY)).data,second);
});

test('shared storage interoperates when MCP private pluginData methods are present but throw',()=>{
 const f=metadataNode(),shared=sharedStorage(f.node);let privateCalls=0;
 f.node.getPluginData=f.node.setPluginData=()=>{privateCalls++;throw Error('private pluginData is not supported in this host runtime');};
 const before=readDeckObjectMotion(f.node);assert.equal(before.storage,'shared');assert.equal(before.data,undefined);const prepared=prepareDeckObjectMotion(f.node,authored);assert.equal(shared.writes(),0);assert.equal(prepared.storage,'shared');assert.equal(writeDeckObjectMotionBatch([{node:f.node,prepared}]),true);assert.deepEqual(readDeckObjectMotion(f.node).data,authored);assert.deepEqual(decodeDeckObjectMotion(shared.data.get(DECK_OBJECT_MOTION_KEY)).data,authored);
 assert.equal(writeDeckObjectMotionBatch([{node:f.node,prepared:prepareDeckObjectMotion(f.node,{})}]),true);assert.equal(shared.data.get(DECK_OBJECT_MOTION_KEY),'');assert.equal(readDeckObjectMotion(f.node).data,undefined);assert.equal(privateCalls,0);
});

test('shared empty values and shared read/write failures never silently downgrade to private data',()=>{
 const f=metadataNode(),shared=sharedStorage(f.node);f.data.set(DECK_OBJECT_MOTION_KEY,encodeDeckObjectMotion(authored));let privateCalls=0;f.node.getPluginData=f.node.setPluginData=()=>{privateCalls++;throw Error('must not call private fallback');};
 assert.equal(readDeckObjectMotion(f.node).data,undefined);const originalRead=f.node.getSharedPluginData;f.node.getSharedPluginData=()=>{throw Error('shared read denied');};assert.match(readDeckObjectMotion(f.node).warning!,/could not be read/);assert.throws(()=>prepareDeckObjectMotion(f.node,authored),/could not be read/);assert.equal(shared.writes(),0);assert.equal(privateCalls,0);
 f.node.getSharedPluginData=originalRead;const prepared=prepareDeckObjectMotion(f.node,authored);let attempts=0;f.node.setSharedPluginData=()=>{attempts++;throw Error('shared write denied');};assert.throws(()=>writeDeckObjectMotionBatch([{node:f.node,prepared}]),/shared write denied/);assert.equal(attempts,1);assert.equal(privateCalls,0);assert.equal(f.data.get(DECK_OBJECT_MOTION_KEY),encodeDeckObjectMotion(authored));
});

test('an incomplete shared API cannot fall back and shared batches restore partial writes',()=>{
 const a=metadataNode('shared-a'),b=metadataNode('shared-b'),sharedA=sharedStorage(a.node),sharedB=sharedStorage(b.node);delete a.node.setSharedPluginData;assert.throws(()=>prepareDeckObjectMotion(a.node,authored),/cannot store/);assert.equal(a.writes(),0);sharedStorage(a.node);
 const first=prepareDeckObjectMotion(a.node,authored),second=prepareDeckObjectMotion(b.node,authored);let fail=true;const set=b.node.setSharedPluginData;b.node.setSharedPluginData=(...args:any[])=>{set(...args);if(args[2]&&fail){fail=false;throw Error('partial shared failure');}};assert.throws(()=>writeDeckObjectMotionBatch([{node:a.node,prepared:first},{node:b.node,prepared:second}]),/partial shared failure/);assert.equal(readDeckObjectMotion(a.node).data,undefined);assert.equal(sharedB.data.get(DECK_OBJECT_MOTION_KEY),'');assert.equal(sharedA.writes(),0);assert.equal(a.writes(),0);assert.equal(b.writes(),0);
});

test('production capture/import reads shared motion without invalidating its image cache',async()=>{
 const f=fixture(),shared=sharedStorage(f.node),cache=new Map();await captureFigma(f.figma,[f.slide],true,cache);const count=f.exports();writeDeckObjectMotionBatch([{node:f.node,prepared:prepareDeckObjectMotion(f.node,authored)}]);const bundle=await captureFigma(f.figma,[f.slide],true,cache);assert.equal(f.exports(),count);assert.deepEqual(importFigma(bundle).slides[0].elements[0].animation,authored.animation);assert.equal(f.data.has(DECK_OBJECT_MOTION_KEY),false);assert(shared.data.has(DECK_OBJECT_MOTION_KEY));
 delete f.node.getPluginData;delete f.node.setPluginData;assert.deepEqual(serializeForDeck(f.node).deckStudioMotion,{version:1,source:'deck-studio',...authored});
});

test('reconnect preserves acknowledged motion when a host loses all metadata reader capabilities',async()=>{
 const f=fixture();sharedStorage(f.node);const sent=structuredClone(f.deck);Object.assign(sent.slides[0].elements[0],authored);await applyDeckToFigma(f.figma,sent,f.deck);const before=importFigma(await captureFigma(f.figma,[f.slide],false)),checkpoint={deck:sent,native:before},saved=JSON.stringify(checkpoint);
 for(const key of ['getSharedPluginData','setSharedPluginData','getPluginData','setPluginData'])delete f.node[key];
 f.node.relativeTransform[0][2]=145;f.node.absoluteTransform[0][2]=145;f.node.absoluteBoundingBox.x=145;
 const bundle=await captureFigma(f.figma,[f.slide],false),remote=importFigma(bundle),unreadable=unreadableDeckObjectMotionNodes(bundle),recovered=recoverFigmaDeck(checkpoint,sent,remote,[f.slide.id],unreadable);
 assert.deepEqual(recovered.conflicts,[]);assert.deepEqual(recovered.deck?.slides[0].elements[0].animation,authored.animation);assert.equal(recovered.deck?.slides[0].elements[0].motionKey,authored.motionKey);assert.equal(recovered.deck?.slides[0].elements[0].motionMatch,authored.motionMatch);assert.equal(recovered.deck?.slides[0].elements[0].x,145);assert(unreadable.has(f.node.id));assert.match(bundle.slides[0].children[0].deckStudioMotionWarning,/could not be read/);assert.equal(JSON.stringify(checkpoint),saved);
});
