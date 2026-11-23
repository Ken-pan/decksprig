import test from 'node:test';
import assert from 'node:assert/strict';
import {applyDeckToFigma} from '../plugins/figma-export/native';
import {blankSlide,newDeck} from '../src/core/model';

function nativeFixture(){
 let next=10;let rows:any[][]=[];const page:any={children:[],selection:[]};
 function node(id:string,type='SLIDE',name=id,data:Record<string,string>={}){const n:any={id,type,name,width:1920,height:1080,absoluteBoundingBox:{x:0,y:0,width:1920,height:1080},x:0,y:0,children:[],fills:[],opacity:1,visible:true,removed:false,parent:page,relativeTransform:[[1,0,0],[0,1,0]],absoluteTransform:[[1,0,0],[0,1,0]],getPluginData(key:string){if(this.removed)throw Error('Cannot read a removed node');return data[key]??'';},setPluginData(key:string,value:string){data[key]=value;},setSlideTransition(){},appendChild(c:any){this.children.push(c);c.parent=this;},remove(){this.removed=true;rows=rows.map(r=>r.filter(c=>c!==this)).filter(r=>r.length);page.children=page.children.filter((c:any)=>c!==this);},clone(){const c=node('2:'+next++,this.type,this.name,{...data});c.fills=structuredClone(this.fills);for(const child of this.children)c.appendChild(child.clone());if(this.type==='SLIDE'){rows.at(-1)!.push(c);page.children.push(c);}return c;}};return n;}
 const outside=node('2:0'),a=node('2:1','SLIDE','A',{'deck-studio-id':'slide-a','deck-studio-document':'document'}),b=node('2:2','SLIDE','B',{'deck-studio-id':'slide-b','deck-studio-document':'document'}),tail=node('2:3');rows=[[outside,a,b,tail]];page.children=rows.flat();
 const unknown=node('2:4','FRAME','Native mask');unknown.fills=[{type:'GRADIENT_LINEAR',gradientStops:[{position:0,color:{r:1,g:0,b:0,a:1}}]}];a.appendChild(unknown);
 const figma:any={editorType:'slides',fileKey:'original',currentPage:page,root:{name:'Original'},listAvailableFontsAsync:async()=>[],getSlideGrid:()=>rows.map(r=>[...r]),createSlide:()=>{const n=node('2:'+next++);page.children.push(n);rows.at(-1)!.push(n);return n;},setSlideGrid(value:any[][]){const all=value.flat();assert.equal(new Set(all).size,all.length,'native slide grid cannot contain one page twice');assert(!all.some(n=>n.removed));rows=value.map(r=>[...r]);page.children=rows.flat();},commitUndo(){}};
 const s=blankSlide();s.id='slide-a';s.source={provider:'Figma',nodeId:a.id,fidelity:'converted',warnings:[]};const t={...structuredClone(s),id:'slide-b',source:{...s.source,nodeId:b.id}};const deck=newDeck('Original',[s,t]);deck.id='document';deck.provenance={provider:'Figma',url:'https://www.figma.com/slides/original',importedAt:'2026-10-24T00:00:00.000Z'};
 return {figma,deck,a,b,tail,outside,node};
}

test('duplicating an imported slide before its source creates a separate native copy and preserves native layers and unrelated slots',async()=>{
 const f=nativeFixture(),copy={...structuredClone(f.deck.slides[0]),id:'copied-slide'};const edited={...f.deck,slides:[copy,...f.deck.slides]};
 await applyDeckToFigma(f.figma,edited,f.deck);const grid=f.figma.getSlideGrid().flat(),copied=grid.find((n:any)=>n.getPluginData('deck-studio-id')==='copied-slide');
 assert(copied);assert.notEqual(copied,f.a);assert.equal(f.a.getPluginData('deck-studio-id'),'slide-a');assert.deepEqual(grid.map((n:any)=>n.getPluginData('deck-studio-id')||n.id),['2:0','copied-slide','slide-a','slide-b','2:3']);assert.equal(copied.children.length,1);assert.notEqual(copied.children[0].id,f.a.children[0].id);assert.deepEqual(copied.children[0].fills,f.a.children[0].fills);
});

test('deleting a linked native slide never reads removed plugin data and preserves unselected native slides',async()=>{
 const f=nativeFixture();await applyDeckToFigma(f.figma,{...f.deck,slides:[f.deck.slides[1]]},f.deck);
 assert.equal(f.a.removed,true);assert.deepEqual(f.figma.getSlideGrid().flat().map((n:any)=>n.id),['2:0','2:2','2:3']);assert.equal(f.b.removed,false);
});

test('Figma native copies carry new page and object identities instead of copied Deck bindings',async()=>{
 const {serializeForDeck}=await import('../plugins/figma-export/capture'),{importFigma}=await import('../src/importers/figma');const f=nativeFixture();await applyDeckToFigma(f.figma,f.deck,f.deck);const n=f.node('2:9','RECTANGLE');n.setPluginData('deck-studio-id','bound-rectangle');n.setPluginData('deck-studio-document','document');n.setPluginData('deck-studio-native-id',n.id);f.a.appendChild(n);
 const copied=f.a.clone(),object=n.clone();f.a.appendChild(object);const native=serializeForDeck(f.a),copy=serializeForDeck(copied);assert.equal(native.deckStudioId,'slide-a');assert.equal(copy.deckStudioId,undefined);assert.equal(native.children.at(-1).deckStudioId,undefined);assert.equal(copy.children.at(-1).deckStudioId,undefined);
 const imported=importFigma({slides:[copy,native]});assert.equal(imported.slides[1].id,'slide-a');assert.notEqual(imported.slides[0].id,'slide-a');assert.equal(new Set(imported.slides.map(s=>s.id)).size,2);
});

test('restoring a missing native source stops before replacing its layers with a flattened page',async()=>{
 const f=nativeFixture();f.a.remove();const current={...f.deck,slides:[f.deck.slides[1]]},before=f.figma.getSlideGrid().flat().map((n:any)=>n.id);
 await assert.rejects(()=>applyDeckToFigma(f.figma,f.deck,current),/Undo in Figma/);assert.deepEqual(f.figma.getSlideGrid().flat().map((n:any)=>n.id),before);
});

test('native page renumbering is metadata while authored content, order and Design frame names remain Undoable changes',async()=>{
 const {isFigmaNumberingRefresh}=await import('../src/core/figma-sync');const f=nativeFixture(),before=f.deck;before.slides[0].title='337';const after=structuredClone(before);after.slides[0].title='336';assert.equal(isFigmaNumberingRefresh(before,after),true);after.slides[0].notes='New speaker notes';assert.equal(isFigmaNumberingRefresh(before,after),false);after.slides[0].notes=before.slides[0].notes;after.slides.reverse();assert.equal(isFigmaNumberingRefresh(before,after),false);after.slides.reverse();before.provenance!.url='https://www.figma.com/design/original';assert.equal(isFigmaNumberingRefresh(before,after),false);
});

test('equivalent imported text segmentation never rewrites a native gradient or automatic leading',async()=>{
 const {element}=await import('../src/core/model');const f=nativeFixture();f.figma.listAvailableFontsAsync=async()=>[{fontName:{family:'Inter',style:'Regular'}}];f.figma.loadFontAsync=async()=>{};const text=f.node('2:6','TEXT');text.getStyledTextSegments=()=>[{fontName:{family:'Inter',style:'Regular'}}];text.fills=[{type:'GRADIENT_LINEAR'}];text.lineHeight={unit:'AUTO'};Object.defineProperty(text,'characters',{set(){throw Error('Equivalent native text was rewritten');}});f.a.appendChild(text);
 const e=element('text',{id:'text',sourceId:'2:6',text:'Same text',fontFamily:'Inter',runs:[{text:'Same text',fontFamily:'Inter',fontWeight:400}]});f.deck.slides[0].elements=[e];const edited=structuredClone(f.deck);edited.slides[0].elements[0].runs=[{text:'Same ',fontFamily:'Inter',fontWeight:400},{text:'text',fontFamily:'Inter',fontWeight:400}];
 await applyDeckToFigma(f.figma,edited,f.deck);assert.equal(text.fills[0].type,'GRADIENT_LINEAR');assert.deepEqual(text.lineHeight,{unit:'AUTO'});
});

test('whole-text link update and removal preserve native text identity, gradient paint and automatic leading',async()=>{
 const {element}=await import('../src/core/model');const f=nativeFixture();f.figma.listAvailableFontsAsync=async()=>[{fontName:{family:'Inter',style:'Regular'}}];f.figma.loadFontAsync=async()=>{};const text=f.node('2:6','TEXT');text.getStyledTextSegments=()=>[{fontName:{family:'Inter',style:'Regular'}}];text.fills=[{type:'GRADIENT_LINEAR'}];text.lineHeight={unit:'AUTO'};Object.defineProperty(text,'characters',{set(){throw Error('Link edit rewrote native glyphs');}});f.a.appendChild(text);
 const e=element('text',{id:'text',sourceId:'2:6',text:'Same text',fontFamily:'Inter',link:'https://example.com/'});f.deck.slides[0].elements=[e];const edited=structuredClone(f.deck);edited.slides[0].elements[0].link='mailto:hello@example.com';await applyDeckToFigma(f.figma,edited,f.deck);assert.deepEqual(text.hyperlink,{type:'URL',value:'mailto:hello@example.com'});assert.equal(text.id,'2:6');assert.equal(text.fills[0].type,'GRADIENT_LINEAR');assert.equal(text.lineHeight.unit,'AUTO');const removed=structuredClone(edited);delete removed.slides[0].elements[0].link;await applyDeckToFigma(f.figma,removed,edited);assert.equal(text.hyperlink,null);assert.equal(text.fills[0].type,'GRADIENT_LINEAR');
});

test('native font catalog is reused across updates and refreshed for installed fonts or load failures',async()=>{
 const {prepareNativeFonts}=await import('../plugins/figma-export/native'),{element}=await import('../src/core/model');let calls=0,fail=false;const available=[{fontName:{family:'Inter',style:'Regular'}}],figma={listAvailableFontsAsync:async()=>{calls++;return structuredClone(available);},loadFontAsync:async()=>{if(fail)throw Error('Font changed');}},deck=newDeck('Fonts',[{...blankSlide(),elements:[element('text',{fontFamily:'Inter'})]}]);await prepareNativeFonts(figma,deck);await prepareNativeFonts(figma,deck);assert.equal(calls,1);available.push({fontName:{family:'New font',style:'Regular'}});deck.slides[0].elements[0].fontFamily='New font';await prepareNativeFonts(figma,deck);assert.equal(calls,2);fail=true;await assert.rejects(()=>prepareNativeFonts(figma,deck),/Font changed/);fail=false;await prepareNativeFonts(figma,deck);assert.equal(calls,3);
});

test('scoped slide updates never descend into unrelated native template pages and preserve every grid slot',async()=>{
 const f=nativeFixture();for(const n of [f.outside,f.tail])Object.defineProperty(n,'children',{get(){throw Error('Traversed unrelated page '+n.id);}});const before=f.figma.getSlideGrid().flat().map((n:any)=>n.id);await applyDeckToFigma(f.figma,f.deck,f.deck);assert.deepEqual(f.figma.getSlideGrid().flat().map((n:any)=>n.id),before);assert.equal(f.a.children[0].id,'2:4');
});

test('native grid finalization repairs unchanged and out-of-scope transitions after structural host resets',async()=>{
 const f=nativeFixture(),values=new Map<any,any>(),writes:string[]=[],none={style:'NONE',duration:0,curve:'EASE_OUT',timing:{type:'ON_CLICK'}},native={style:'DISSOLVE',duration:2,curve:'LINEAR',timing:{type:'AFTER_DELAY',delay:2}};
 for(const n of [f.outside,f.a,f.b,f.tail]){values.set(n,structuredClone(n===f.tail?none:native));n.getSlideTransition=()=>structuredClone(values.get(n));n.setSlideTransition=(t:any)=>{writes.push(n.id);values.set(n,structuredClone(t));};}
 const setGrid=f.figma.setSlideGrid.bind(f.figma);f.figma.setSlideGrid=(grid:any[][])=>{writes.push('grid');setGrid(grid);values.set(f.outside,structuredClone(none));values.set(f.b,structuredClone(none));};
 await applyDeckToFigma(f.figma,{...f.deck,slides:[f.deck.slides[1]]},f.deck);
 assert.deepEqual(f.outside.getSlideTransition(),native);assert.deepEqual(f.b.getSlideTransition(),native);assert.equal(writes[0],'grid');assert(!writes.includes(f.a.id));assert(!writes.includes(f.tail.id));
});

test('transition-only failed native readback rolls back instead of returning an applied acknowledgement',async()=>{
 const {importSlideTransition}=await import('../src/core/figma-transitions');const f=nativeFixture(),native={style:'NONE',duration:0,curve:'EASE_OUT',timing:{type:'ON_CLICK'}};let undone=0;
 f.b.getSlideTransition=()=>native;f.b.setSlideTransition=()=>{};f.figma.triggerUndo=()=>undone++;
 const edited=structuredClone(f.deck);edited.slides[1].transition=importSlideTransition({style:'DISSOLVE',duration:2,curve:'LINEAR',timing:{type:'AFTER_DELAY',delay:2}});
 await assert.rejects(()=>applyDeckToFigma(f.figma,edited,f.deck),/could not retain/);assert.equal(undone,1);
});
