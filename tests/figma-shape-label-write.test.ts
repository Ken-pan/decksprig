import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shapeHost} from './helpers/figma-shape-host';
import {applyDeckToFigma} from '../plugins/figma-export/native';
import {captureFigma,serializeForDeck} from '../plugins/figma-export/capture';
import {readShapeLabel} from '../plugins/figma-export/shape-label';
import {SHAPE_LABEL_KEY,SHAPE_LABEL_PART_KEY} from '../src/core/figma-shape-label';
import {importFigma} from '../src/importers/figma';
import {element,type Deck} from '../src/core/model';
import {figmaTransfer} from '../src/core/figma-transfer';
import {nativeLink} from '../plugins/figma-export/identity';
import {DECK_OBJECT_MOTION_KEY,DECK_OBJECT_MOTION_NAMESPACE,encodeDeckObjectMotion} from '../src/core/figma-object-motion';
import {textRangeStylePatch} from '../src/core/text-range-format';
import {shapeTextElement} from '../src/core/shape-text';

const copy=<T>(value:T):T=>structuredClone(value);
const paint=(r:number,g:number,b:number)=>[{type:'SOLID',color:{r,g,b},opacity:1}];
const imported=(slide:any)=>importFigma({url:'https://www.figma.com/slides/file',fileKey:'file',slides:[serializeForDeck(slide)]});
function fixture(){
 const f=shapeHost(),body=f.node('RECTANGLE');Object.assign(body,{name:'Shape',fills:paint(.1,.2,.3),strokes:paint(.3,.4,.5),strokeWeight:2,strokeAlign:'INSIDE',cornerRadius:8});body.resize(320,160);body.x=120;body.y=180;f.slide.appendChild(body);
 const before=imported(f.slide);return {...f,body,before};
}
async function labeled(){
 const f=fixture(),after=copy(f.before);Object.assign(after.slides[0].elements[0],{text:'Editable label',fontFamily:'Inter',fontSize:24,fontWeight:400,shapeText:{color:'#ffffff',align:'center',verticalAlign:'middle'},padding:{left:16,right:20,top:10,bottom:14}});
 const result=await applyDeckToFigma(f.host,after,f.before);const root=f.slide.children[0],parts=readShapeLabel(root)!;assert(parts);return {...f,after,result,root,parts};
}
const ids=(parts:NonNullable<ReturnType<typeof readShapeLabel>>)=>[parts.node.id,parts.body.id,parts.label.id,parts.text.id];

test('promoting an existing native shape keeps its body ID and roundtrips one editable shape and real TEXT',async()=>{
 const f=await labeled(),e=f.after.slides[0].elements[0],read=imported(f.slide),shape=read.slides[0].elements[0];
 assert.equal(f.parts.body,f.body);assert.equal(f.parts.body.id,f.body.id);assert.equal(f.parts.text.type,'TEXT');assert.equal(f.parts.text.characters,'Editable label');
 assert.equal(f.slide.children.length,1);assert.equal(f.root.children.length,2);assert.equal(read.slides[0].elements.length,1);assert.equal(shape.id,e.id);assert.equal(shape.sourceId,f.root.id);assert.equal(nativeLink(f.body,'deck-studio-id'),'');
 assert.deepEqual([shape.x,shape.y,shape.w,shape.h],[120,180,320,160]);assert.equal(shape.fill,'#1a334d');assert.equal(shape.stroke,'#4d6680');assert.equal(shape.strokeWidth,2);assert.equal(shape.radius,8);assert.equal(shape.text,e.text);assert.deepEqual(shape.padding,e.padding);assert.deepEqual(shape.shapeText,e.shapeText);
 const captured=await captureFigma(f.host,[f.slide],false);assert.equal(captured.slides[0].children[0].deckStudioShapeLabel.textId,f.parts.text.id);assert.equal(importFigma(captured).slides[0].elements.length,1);
});

test('adding a label to an existing empty primitive initializes requested typography on a fresh default TEXT',async()=>{
 const f=fixture(),before=copy(f.before),plain=before.slides[0].elements[0];
 Object.assign(plain,{text:'',runs:undefined,paragraphs:undefined,fontFamily:'Manrope',fontSize:42.7,fontWeight:400,lineHeight:1.4,letterSpacing:1.25,shapeText:{color:'#ffffff',align:'right',verticalAlign:'middle'}});
 f.fonts.push({fontName:{family:'Manrope',style:'Regular'}});
 const create=f.host.createText;let fresh:any;
 f.host.createText=()=>{fresh=create();fresh.fontName={family:'Inter',style:'Regular'};fresh.fontSize=12;fresh.lineHeight={unit:'AUTO'};fresh.letterSpacing={unit:'PIXELS',value:0};fresh.textAlignHorizontal='LEFT';return fresh;};
 const after=copy(before);after.slides[0].elements[0].text='Requested label';
 await applyDeckToFigma(f.host,after,before);const parts=readShapeLabel(f.slide.children[0])!;assert(parts);assert.equal(parts.body,f.body);assert.equal(parts.text,fresh);assert.equal(parts.text.characters,'Requested label');
 assert.deepEqual(parts.text.fontName,{family:'Manrope',style:'Regular'});assert.equal(parts.text.fontSize,42.7);assert.deepEqual(parts.text.lineHeight,{unit:'PIXELS',value:42.7*1.4});assert.deepEqual(parts.text.letterSpacing,{unit:'PIXELS',value:1.25});assert.equal(parts.text.textAlignHorizontal,'RIGHT');assert.equal(f.slide.children.length,1);
 const read=imported(f.slide).slides[0].elements[0];assert.equal(read.fontFamily,'Manrope');assert.equal(read.fontSize,42.7);assert.equal(read.shapeText?.align,'right');assert.equal(read.text,'Requested label');
});

test('native label rich edits and body paint changes import live while metadata never supplies stale content',async()=>{
 const f=await labeled(),parts=f.parts;parts.text.characters='Native label';parts.text.setRangeFontName(0,6,{family:'Inter',style:'Bold Italic'});parts.text.setRangeFills(0,6,paint(1,0,0));parts.text.setRangeTextDecoration(7,12,'UNDERLINE');parts.body.fills=paint(0,.5,1);parts.label.primaryAxisAlignItems='MAX';
 const shape=imported(f.slide).slides[0].elements[0];assert.equal(shape.text,'Native label');assert.equal(shape.fill,'#0080ff');assert.equal(shape.runs?.[0].fontWeight,700);assert.equal(shape.runs?.[0].italic,true);assert.equal(shape.runs?.[0].color,'#ff0000');assert(shape.runs?.some(run=>run.underline));assert.equal(shape.shapeText?.verticalAlign,'bottom');
 const metadata=JSON.parse(parts.node.getPluginData(SHAPE_LABEL_KEY));assert.equal(metadata.data.text,undefined);assert.equal(metadata.textId,undefined);assert.equal(metadata.data.runs,undefined);
});

test('local label formatting, link and geometry updates keep all native part IDs and inverse restores the source',async()=>{
 const f=await labeled(),before=imported(f.slide),after=copy(before),e=after.slides[0].elements[0],oldIds=ids(f.parts);Object.assign(e,{text:'Changed label',runs:undefined,paragraphs:undefined,fontWeight:700,underline:true,x:200,y:240,w:400,h:180,rotation:30,fill:'#abcdef',link:'https://example.com/shape',shapeText:{color:'#112233',align:'right',verticalAlign:'bottom'},padding:{left:24,right:30,top:16,bottom:18}});
 await applyDeckToFigma(f.host,after,before);assert.deepEqual(ids(readShapeLabel(f.root)!),oldIds);const read=imported(f.slide).slides[0].elements[0];assert.equal(read.text,e.text);assert.equal(read.fontWeight,700);assert.equal(read.underline,true);assert.equal(read.fill,'#abcdef');assert.equal(read.link,e.link);assert.deepEqual(read.padding,e.padding);assert.equal(read.shapeText?.align,'right');assert(Math.abs(read.rotation-30)<1e-8);assert(Math.abs(read.w-400)<1e-8);
 await applyDeckToFigma(f.host,before,after);const restored=imported(f.slide).slides[0].elements[0];assert.deepEqual(ids(readShapeLabel(f.root)!),oldIds);assert.equal(restored.text,before.slides[0].elements[0].text);assert.equal(restored.link,undefined);assert.equal(restored.fill,before.slides[0].elements[0].fill);assert.equal(restored.fontWeight,400);assert.equal(restored.underline,false);assert.deepEqual(restored.padding,before.slides[0].elements[0].padding);
});

test('clearing a shape label retains one bound empty TEXT and inverse restores without creating a second object',async()=>{
 const f=await labeled(),before=imported(f.slide),empty=copy(before),e=empty.slides[0].elements[0],oldIds=ids(f.parts);Object.assign(e,{text:'',runs:[],paragraphs:undefined});
 await applyDeckToFigma(f.host,empty,before);let shape=imported(f.slide).slides[0].elements[0];assert.equal(shape.text,'');assert.equal(shape.type,'rect');assert.equal(shape.fontSize,24);assert.equal(f.slide.children.length,1);assert.deepEqual(ids(readShapeLabel(f.root)!),oldIds);
 f.parts.text.fontName={family:'Inter',style:'Medium Italic'};shape=imported(f.slide).slides[0].elements[0];assert.equal(shape.fontWeight,500);assert.equal(shape.italic,true);
 await applyDeckToFigma(f.host,before,empty);assert.equal(f.parts.text.characters,'Editable label');assert.deepEqual(ids(readShapeLabel(f.root)!),oldIds);assert.equal(imported(f.slide).slides[0].elements.length,1);
});

test('a local compound copy clones before the source edit and owns new root/text IDs with independent updates',async()=>{
 const f=await labeled(),before=imported(f.slide),after=copy(before),original=after.slides[0].elements[0],duplicate={...copy(original),id:'copied-shape',name:'Copy',x:600};after.slides[0].elements.push(duplicate);Object.assign(original,{text:'Original changed',runs:undefined,paragraphs:undefined});
 await applyDeckToFigma(f.host,after,before);assert.equal(f.slide.children.length,2);const originalParts=readShapeLabel(f.root)!,other=f.slide.children.find((n:any)=>n!==f.root),otherParts=readShapeLabel(other)!;assert(otherParts);assert.equal(originalParts.text.characters,'Original changed');assert.equal(otherParts.text.characters,'Editable label');assert.equal(nativeLink(other,'deck-studio-id'),'copied-shape');assert(ids(otherParts).every(id=>!ids(originalParts).includes(id)));
 const read=imported(f.slide).slides[0].elements;assert.equal(read.length,2);assert.equal(new Set(read.map(e=>e.id)).size,2);assert.equal(read.find(e=>e.id==='copied-shape')?.sourceId,other.id);
 await applyDeckToFigma(f.host,before,after);assert.equal(f.slide.children.length,1);assert.equal(f.parts.text.characters,'Editable label');assert.equal(f.root.removed,false);
});

test('native clone role metadata reconstructs a distinct one-object identity instead of retargeting its original',async()=>{
 const f=await labeled(),cloned=f.root.clone();f.slide.appendChild(cloned);cloned.x+=400;const other=readShapeLabel(cloned)!;assert(other);assert.notEqual(other.text.id,f.parts.text.id);assert.equal(nativeLink(cloned,'deck-studio-id'),'');
 const shapes=imported(f.slide).slides[0].elements;assert.equal(shapes.length,2);assert.equal(new Set(shapes.map(e=>e.id)).size,2);assert.equal(shapes.find(e=>e.sourceId===cloned.id)?.text,'Editable label');assert.equal(shapes.find(e=>e.sourceId===f.root.id)?.id,f.after.slides[0].elements[0].id);
});

test('new SVG-background shapes use native editable TEXT and text-only edits preserve background vector IDs',async()=>{
 const f=fixture(),after=copy(f.before),shape=element('diamond',{id:'diamond-label',name:'Decision',x:600,y:200,w:240,h:180,text:'Continue?',fontFamily:'Inter',fontSize:24,fill:'#2266aa',stroke:'#112233',strokeWidth:2});after.slides[0].elements.push(shape);const transfer=await figmaTransfer(after,f.before);await applyDeckToFigma(f.host,after,f.before,transfer.assets);
 const root=f.slide.children.find((n:any)=>nativeLink(n,'deck-studio-id')===shape.id),parts=readShapeLabel(root)!;assert(parts);assert.equal(parts.text.type,'TEXT');assert.equal(parts.text.characters,'Continue?');assert.equal(parts.body.getPluginData('deck-studio-visual'),'diamond');const bodyIds=parts.body.children.map((n:any)=>n.id),before=imported(f.slide),changed=copy(before),target=changed.slides[0].elements.find(e=>e.id===shape.id)!;Object.assign(target,{text:'Yes',runs:undefined,paragraphs:undefined});const next=await figmaTransfer(changed,before);await applyDeckToFigma(f.host,changed,before,next.assets);
 assert.deepEqual(parts.body.children.map((n:any)=>n.id),bodyIds);assert.equal(parts.text.characters,'Yes');const read=imported(f.slide).slides[0].elements.find(e=>e.id===shape.id)!;assert.equal(read.type,'diamond');assert.equal(read.text,'Yes');assert.equal(read.fill,'#2266aa');
});

test('missing label fonts and unsupported native part changes fail before any metadata or document write',async()=>{
 const f=await labeled(),before=imported(f.slide),after=copy(before),e=after.slides[0].elements[0];Object.assign(e,{fontFamily:'Missing Font',runs:undefined,paragraphs:undefined});after.title='Must stay unchanged';const state=JSON.stringify(serializeForDeck(f.slide)),title=f.host.root.name,writes=f.metadataWrites;
 await assert.rejects(()=>applyDeckToFigma(f.host,after,before),/Install Missing Font/);assert.equal(f.metadataWrites,writes);assert.equal(f.host.root.name,title);assert.equal(JSON.stringify(serializeForDeck(f.slide)),state);
 f.parts.label.appendChild(f.node('TEXT'));const good=copy(before);good.slides[0].elements[0].text='Would change';const malformedWrites=f.metadataWrites;
 await assert.rejects(()=>applyDeckToFigma(f.host,good,before),/changed native shape-label layers.*No content was changed/);assert.equal(f.metadataWrites,malformedWrites);assert.equal(f.parts.text.characters,'Editable label');assert.equal(serializeForDeck(f.root).deckStudioShapeLabel,undefined);assert.match(serializeForDeck(f.root).deckStudioShapeLabelWarning,/unsupported/);
});

test('mixed paragraph alignment and conflicting decorations reject new labels before native mutation',async()=>{
 const f=fixture(),before=copy(f.before),after=copy(before),e=after.slides[0].elements[0];Object.assign(e,{text:'One\nTwo',fontFamily:'Inter',paragraphs:[{runs:[{text:'One'}],align:'left',spaceAfter:0,firstLineIndent:0},{runs:[{text:'Two'}],align:'right',spaceAfter:0,firstLineIndent:0}]});const state=JSON.stringify(serializeForDeck(f.slide)),writes=f.metadataWrites;
 await assert.rejects(()=>applyDeckToFigma(f.host,after,before),/different paragraph alignments/);assert.equal(f.metadataWrites,writes);assert.equal(JSON.stringify(serializeForDeck(f.slide)),state);
 Object.assign(e,{paragraphs:undefined,underline:true,strikethrough:true});await assert.rejects(()=>applyDeckToFigma(f.host,after,before),/one decoration per character/);assert.equal(f.metadataWrites,writes);assert.equal(f.slide.children.length,1);
});

test('a native setter failure after compound creation uses the existing atomic rollback and does not report success',async()=>{
 const f=fixture(),before=copy(f.before),after=copy(before);Object.assign(after.slides[0].elements[0],{text:'Failure label',fontFamily:'Inter'});const create=f.host.createText;f.host.createText=()=>{const text=create();text.setRangeFills=()=>{throw Error('Injected native setter failure');};return text;};const state=JSON.stringify(serializeForDeck(f.slide)),body=f.body;
 await assert.rejects(()=>applyDeckToFigma(f.host,after,before),(error:any)=>error.nativeRollback===true&&/Injected native setter failure/.test(error.message));assert.equal(JSON.stringify(serializeForDeck(f.slide)),state);assert.equal(f.slide.children[0],body);assert.equal(f.slide.children.length,1);assert.equal(body.getPluginData(SHAPE_LABEL_PART_KEY),'');
});


test('promotion transfers portable motion metadata to the logical wrapper while preserving unrelated native siblings',async()=>{
 const f=fixture(),motion={motionKey:'owned-motion'};f.body.setSharedPluginData(DECK_OBJECT_MOTION_NAMESPACE,DECK_OBJECT_MOTION_KEY,encodeDeckObjectMotion(motion));const before=imported(f.slide),after=copy(before);Object.assign(after.slides[0].elements[0],{text:'Motion label',fontFamily:'Inter'});const sibling=f.node('RECTANGLE',{name:'Unrelated',fills:paint(1,0,1)});f.slide.appendChild(sibling);const siblingBefore=JSON.stringify(serializeForDeck(sibling));
 await applyDeckToFigma(f.host,after,before);const root=f.slide.children.find((n:any)=>n!==sibling),parts=readShapeLabel(root)!;assert(parts);assert.equal(imported(f.slide).slides[0].elements.find(e=>e.sourceId===root.id)?.motionKey,'owned-motion');assert.equal(JSON.stringify(serializeForDeck(sibling)),siblingBefore);assert.equal(f.body.id,parts.body.id);assert.equal(f.slide.children.length,2);
});

test('duplicating the linked slide binds cloned compound parts once and inverse removes only that slide',async()=>{
 const f=await labeled(),before=imported(f.slide),after=copy(before),duplicate=copy(after.slides[0]);duplicate.id='copied-slide';after.slides.push(duplicate);await applyDeckToFigma(f.host,after,before);const slides=f.host.getSlideGrid().flat();assert.equal(slides.length,2);const other=slides.find((slide:any)=>slide!==f.slide),parts=readShapeLabel(other.children[0])!;assert(parts);assert.equal(parts.text.characters,'Editable label');assert.notEqual(parts.text.id,f.parts.text.id);assert.equal(nativeLink(other,'deck-studio-id'),'copied-slide');
 const read=importFigma({url:'https://www.figma.com/slides/file',slides:slides.map(serializeForDeck)});assert.equal(read.slides.length,2);assert(read.slides.every(slide=>slide.elements.length===1));await applyDeckToFigma(f.host,before,after);assert.deepEqual(f.host.getSlideGrid().flat(),[f.slide]);assert.equal(f.parts.text.characters,'Editable label');
});

test('new ellipse and line labels both survive editable export/capture/import as one semantic object',async()=>{
 for(const type of ['ellipse','line'] as const){const f=fixture(),after=copy(f.before),shape=element(type,{id:`new-${type}`,name:type,text:'Label',x:600,y:300,w:280,h:120,fontFamily:'Inter',fontSize:20,fill:'#2266aa',stroke:'#112233',strokeWidth:2});after.slides[0].elements.push(shape);await applyDeckToFigma(f.host,after,f.before);const root=f.slide.children.find((n:any)=>nativeLink(n,'deck-studio-id')===shape.id),parts=readShapeLabel(root)!;assert(parts);assert.equal(parts.body.type,type==='ellipse'?'ELLIPSE':'LINE');assert.equal(parts.text.characters,'Label');const read=imported(f.slide).slides[0].elements.find(e=>e.id===shape.id)!;assert(read);assert.equal(read.type,type);assert.equal(read.text,'Label');assert.equal(read.sourceId,root.id);assert.equal(imported(f.slide).slides[0].elements.length,2);}
});

test('compound formatting preserves native AUTO leading and unreadable leading fails before identity writes',async()=>{
 const f=await labeled();f.parts.text.lineHeight={unit:'AUTO'};const before=imported(f.slide),after=copy(before);Object.assign(after.slides[0].elements[0],textRangeStylePatch(shapeTextElement(after.slides[0].elements[0]),{fontWeight:700},{start:0,end:8}));await applyDeckToFigma(f.host,after,before);assert.deepEqual(f.parts.text.lineHeight,{unit:'AUTO'});
 const baseline=imported(f.slide),next=copy(baseline);Object.assign(next.slides[0].elements[0],textRangeStylePatch(shapeTextElement(next.slides[0].elements[0]),{italic:true},{start:0,end:8}));Object.defineProperty(f.parts.text,'lineHeight',{configurable:true,get:()=>Symbol('mixed')});const get=f.parts.text.getStyledTextSegments;f.parts.text.getStyledTextSegments=(fields:string[])=>get(fields).map((segment:any)=>({...segment,...(fields.includes('lineHeight')?{lineHeight:{unit:'UNKNOWN'}}:{})}));const writes=f.metadataWrites,commits=f.commits;await assert.rejects(()=>applyDeckToFigma(f.host,next,baseline),/native line height.*could not be preserved/);assert.equal(f.metadataWrites,writes);assert.equal(f.commits,commits);
});


test('native immutable shape-kind changes reject before metadata can contradict the retained body',async()=>{
 const f=await labeled(),before=imported(f.slide),after=copy(before);after.slides[0].elements[0].type='ellipse';const state=JSON.stringify(serializeForDeck(f.slide)),writes=f.metadataWrites,commits=f.commits;await assert.rejects(()=>applyDeckToFigma(f.host,after,before),/changes its native shape kind.*No content was changed/);assert.equal(f.metadataWrites,writes);assert.equal(f.commits,commits);assert.equal(JSON.stringify(serializeForDeck(f.slide)),state);assert(readShapeLabel(f.root));
 const g=fixture(),next=copy(g.before),shape=element('rect',{id:'star',shape:'star',text:'Star',fontFamily:'Inter',x:600,y:200,w:200,h:160});next.slides[0].elements.push(shape);await applyDeckToFigma(g.host,next,g.before,(await figmaTransfer(next,g.before)).assets);const importedBefore=imported(g.slide),plain=copy(importedBefore),target=plain.slides[0].elements.find(e=>e.id==='star')!;delete target.shape;const snapshot=JSON.stringify(serializeForDeck(g.slide)),count=g.metadataWrites;await assert.rejects(()=>applyDeckToFigma(g.host,plain,importedBefore),/changes its native shape kind/);assert.equal(g.metadataWrites,count);assert.equal(JSON.stringify(serializeForDeck(g.slide)),snapshot);
});

test('nowrap compound label boxes use effective paragraph alignment instead of masked object alignment',async()=>{
 const f=await labeled(),before=imported(f.slide),after=copy(before),e=after.slides[0].elements[0];e.wrap=false;e.paragraphs=e.paragraphs!.map(paragraph=>({...paragraph,align:'right'}));assert.equal(e.shapeText?.align,'center');await applyDeckToFigma(f.host,after,before);assert.equal(f.parts.text.textAlignHorizontal,'RIGHT');assert.equal(f.parts.text.layoutSizingHorizontal,'HUG');assert.equal(f.parts.label.counterAxisAlignItems,'MAX');
});


test('wrapping an auto-layout child rejects before changing its native layout role or bindings',async()=>{
 const f=fixture(),parent=f.node('FRAME',{layoutMode:'HORIZONTAL',name:'Native auto layout'});f.slide.appendChild(parent);parent.appendChild(f.body);f.body.layoutPositioning='AUTO';f.body.layoutGrow=1;f.body.layoutSizingHorizontal='FILL';f.body.constraints={horizontal:'STRETCH',vertical:'CENTER'};const before=imported(f.slide),after=copy(before),e=after.slides[0].elements.find(e=>e.sourceId===f.body.id)!;assert(e);Object.assign(e,{text:'Must not wrap',fontFamily:'Inter'});const snapshot=JSON.stringify(serializeForDeck(f.slide)),writes=f.metadataWrites,commits=f.commits;
 await assert.rejects(()=>applyDeckToFigma(f.host,after,before),/belongs to native auto layout.*No content was changed/);assert.equal(f.metadataWrites,writes);assert.equal(f.commits,commits);assert.equal(JSON.stringify(serializeForDeck(f.slide)),snapshot);assert.equal(f.body.parent,parent);assert.equal(f.body.layoutGrow,1);assert.equal(f.body.layoutSizingHorizontal,'FILL');
 f.body.layoutPositioning='ABSOLUTE';const explicitBefore=imported(f.slide),explicit=copy(explicitBefore);Object.assign(explicit.slides[0].elements.find(e=>e.sourceId===f.body.id)!,{text:'Explicit absolute label',fontFamily:'Inter'});await applyDeckToFigma(f.host,explicit,explicitBefore);assert.equal(parent.children.length,1);assert(readShapeLabel(parent.children[0]));assert.equal(parent.children[0].layoutPositioning,'ABSOLUTE');assert.deepEqual(parent.children[0].constraints,{horizontal:'STRETCH',vertical:'CENTER'});
});


test('native preset path changes warn and reject before a later local edit can overwrite the native path',async()=>{
 const f=fixture(),after=copy(f.before),shape=element('rect',{id:'native-star',shape:'star',text:'Native path',fontFamily:'Inter',x:600,y:200,w:220,h:180});after.slides[0].elements.push(shape);await applyDeckToFigma(f.host,after,f.before,(await figmaTransfer(after,f.before)).assets);const root=f.slide.children.find((n:any)=>nativeLink(n,'deck-studio-id')===shape.id),parts=readShapeLabel(root)!;assert(parts);const baseline=imported(f.slide);parts.paint.vectorPaths=[{windingRule:'NONZERO',data:'M 0 0 L 70 170 L 210 20 Z'}];assert.equal(readShapeLabel(root),undefined);const raw=serializeForDeck(root);assert.equal(raw.deckStudioShapeLabel,undefined);assert.match(raw.deckStudioShapeLabelWarning,/unsupported native/);const incoming=imported(f.slide);assert(incoming.slides[0].source?.warnings.some(warning=>warning.includes('editable shape label that could not be read safely')));const changed=copy(baseline),target=changed.slides[0].elements.find(e=>e.id===shape.id)!;target.fill='#ff0000';const nativeBefore=JSON.stringify(serializeForDeck(f.slide)),writes=f.metadataWrites,commits=f.commits;await assert.rejects(()=>applyDeckToFigma(f.host,changed,baseline),/changed native shape-label layers.*No content was changed/);assert.equal(f.metadataWrites,writes);assert.equal(f.commits,commits);assert.equal(JSON.stringify(serializeForDeck(f.slide)),nativeBefore);
});
