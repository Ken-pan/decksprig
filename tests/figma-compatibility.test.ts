import test from 'node:test';import assert from 'node:assert/strict';
import {figmaFeatureNotes,figmaSyncNotes} from '../src/core/figma-compatibility';
import {serializeForDeck} from '../plugins/figma-export/capture';
import {importFigma} from '../src/importers/figma';
import {encodeDeckObjectMotion,unreadableDeckObjectMotionNodes} from '../src/core/figma-object-motion';
test('live native widgets, video, tables and text links are disclosed even inside flattened groups',()=>{
 const children=['POLL','FACEPILE','ALIGNMENT','EMBED','YOUTUBE'].map(interactiveSlideElementType=>({type:'INTERACTIVE_SLIDE_ELEMENT',interactiveSlideElementType}));children.push({type:'TABLE'} as any,{type:'TEXT',hasHyperlinks:true} as any,{type:'RECTANGLE',fills:[{type:'VIDEO'}]} as any);
 const notes=figmaFeatureNotes({type:'SLIDE',children:[{type:'GROUP',children:[...children,...children]}]});assert.equal(notes.length,8);assert(notes.some(n=>n.includes('Voting and responses')));assert(notes.some(n=>n.includes('part of a text object')));
 assert.deepEqual(figmaFeatureNotes({type:'SLIDE',children:[{type:'RECTANGLE',fills:[{type:'VIDEO',visible:false}]}]}),[]);
});
test('capture detects native link presence without storing the target or credentials',()=>{
 const node:any={id:'text',name:'Linked',type:'TEXT',characters:'Link',getStyledTextSegments:(fields:string[])=>{assert(fields.includes('hyperlink'));return [{start:0,end:4,fontName:{family:'Inter',style:'Regular'},fontSize:16,fontWeight:400,fills:[],lineHeight:{unit:'AUTO'},letterSpacing:{unit:'PIXELS',value:0},hyperlink:{type:'URL',value:'https://example.com/private?token=never-persist'}}];}};
 const serialized=serializeForDeck(node);assert.equal(serialized.hasHyperlinks,true);assert(!JSON.stringify(serialized).includes('never-persist'));assert(!JSON.stringify(serialized).includes('example.com'));
});
test('imported functional limitations reach sync notes without duplicates or requiring an outbound write',()=>{
 const deck=importFigma({slides:[{id:'slide',type:'SLIDE',name:'Widgets',absoluteBoundingBox:{x:0,y:0,width:1920,height:1080},children:[{id:'poll',type:'INTERACTIVE_SLIDE_ELEMENT',interactiveSlideElementType:'POLL',absoluteBoundingBox:{x:10,y:10,width:300,height:200}}]}]});
 const notes=figmaSyncNotes(['Native notes unavailable','Native notes unavailable'],deck.slides);assert.equal(notes.filter(n=>n==='Native notes unavailable').length,1);assert(notes.some(n=>n.includes('Voting and responses')));assert(deck.slides[0].source?.warnings.some(n=>n.includes('Voting and responses')));
});

test('a full Slides import reports the native Animate capture limitation once without inferring animation presence',()=>{
 const bundle={slides:Array.from({length:332},(_,index)=>({id:`slide-${index}`,type:'SLIDE',name:String(index+1),absoluteBoundingBox:{x:0,y:0,width:1920,height:1080},children:[]}))},deck=importFigma(bundle),warnings=deck.slides.flatMap(slide=>slide.source?.warnings??[]),capability=warnings.filter(w=>w.startsWith('Native Slides object animations'));
 assert.equal(capability.length,1);assert.match(capability[0],/cannot be inspected or translated automatically/);assert.match(capability[0],/presence is unknown/);
 const report=figmaSyncNotes([...capability,...capability],deck.slides);assert.equal(report.filter(w=>w.startsWith('Native Slides object animations')).length,1);assert.deepEqual(figmaSyncNotes(report,deck.slides),report);
 const design=importFigma({slides:[{...bundle.slides[0],type:'FRAME'}]});assert(!design.slides[0].source?.warnings.some(w=>w.startsWith('Native Slides object animations')));
});

test('native Animate capability disclosure preserves supported Deck motion metadata and unknown capture guards',()=>{
 const animation={phase:'out' as const,effect:'slide' as const,duration:600,delay:80,trigger:'after-previous' as const,order:1,easing:'smooth' as const},child={id:'object',type:'RECTANGLE',name:'Object',absoluteBoundingBox:{x:10,y:10,width:100,height:100},deckStudioMotion:JSON.parse(encodeDeckObjectMotion({animation,motionKey:'match-key',motionMatch:'off'}))},bundle={deckStudioMotionVersion:1,slides:[{id:'slide',type:'SLIDE',name:'Metadata',absoluteBoundingBox:{x:0,y:0,width:1920,height:1080},children:[child]}]};
 Object.defineProperty(child,'animations',{get(){throw Error('Do not probe generic Motion to infer native Animate');}});
 const deck=importFigma(bundle);assert.deepEqual(deck.slides[0].elements[0].animation,animation);assert.equal(deck.slides[0].elements[0].motionKey,'match-key');assert.equal(deck.slides[0].elements[0].motionMatch,'off');assert.equal(unreadableDeckObjectMotionNodes(bundle).size,0);assert(unreadableDeckObjectMotionNodes({...bundle,deckStudioMotionVersion:99}).has(child.id));
});
