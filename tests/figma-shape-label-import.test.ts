import test from 'node:test';
import assert from 'node:assert/strict';
import {importFigma} from '../src/importers/figma';
import {element} from '../src/core/model';
import {shapeLabelData} from '../src/core/figma-shape-label';

const solid=(hex:string)=>({type:'SOLID',color:{r:parseInt(hex.slice(1,3),16)/255,g:parseInt(hex.slice(3,5),16)/255,b:parseInt(hex.slice(5,7),16)/255}});
const identity=[[1,0,0],[0,1,0]];
function fixture(){
 const source=element('rect',{id:'owned-shape',fontFamily:'Stale font',fontSize:12,fontWeight:400,lineHeight:1.25,shapeText:{color:'#999999',align:'center',verticalAlign:'top'}});
 const body:any={id:'body',type:'RECTANGLE',name:'Body',size:{x:320,y:120},relativeTransform:structuredClone(identity),absoluteBoundingBox:{x:100,y:200,width:320,height:120},fills:[solid('#123456')],strokes:[solid('#345678')],strokeWeight:3,strokeAlign:'INSIDE',cornerRadius:8,effects:[{type:'DROP_SHADOW',color:{r:0,g:0,b:0,a:.2},radius:6,offset:{x:2,y:4}}]};
 const text:any={id:'text',type:'TEXT',name:'Label',characters:'Live label',size:{x:280,y:72},relativeTransform:[[1,0,12],[0,1,16]],absoluteBoundingBox:{x:112,y:216,width:280,height:72},fills:[solid('#abcdef')],style:{fontFamily:'Inter',fontSize:18,fontWeight:500,italic:false,textDecoration:'UNDERLINE',textCase:'ORIGINAL',textAlignHorizontal:'RIGHT',textAlignVertical:'TOP',lineHeightPx:27,letterSpacing:1.5,paragraphSpacing:0,paragraphIndent:0,textAutoResize:'NONE'}};
 const label:any={id:'label',type:'FRAME',name:'Label box',size:{x:320,y:120},relativeTransform:structuredClone(identity),absoluteBoundingBox:{x:100,y:200,width:320,height:120},layoutMode:'VERTICAL',primaryAxisAlignItems:'CENTER',paddingLeft:12,paddingRight:28,paddingTop:16,paddingBottom:32,fills:[],children:[text]};
 const root:any={id:'compound',deckStudioId:'owned-shape',type:'FRAME',name:'Owned labelled shape',size:{x:320,y:120},relativeTransform:[[1,0,100],[0,1,200]],absoluteBoundingBox:{x:100,y:200,width:320,height:120},fills:[],children:[body,label],deckStudioShapeLabel:{version:1,data:shapeLabelData(source),bodyId:body.id,paintId:body.id,labelFrameId:label.id,textId:text.id}};
 const slide:any={id:'slide',type:'SLIDE',name:'Owned fixture',size:{x:1920,y:1080},absoluteBoundingBox:{x:0,y:0,width:1920,height:1080},fills:[],children:[root]};
 const bundle:any={slides:[slide],renders:{slide:'data:image/png;base64,AQID'},nodeRenders:{compound:'data:image/png;base64,AQID'},textSvgs:{text:'<svg><text>Flattened text must not win</text></svg>'},textOutlines:{text:'<svg><path d="M0 0"/></svg>'}};
 return {bundle,slide,root,body,label,text,read:()=>importFigma(bundle).slides[0]};
}

test('a controlled native shape and TEXT import as one editable shape ahead of available raster/glyph renders',()=>{
 const f=fixture(),slide=f.read(),shape=slide.elements[0];
 assert.equal(slide.elements.length,1);assert.equal(slide.groups,undefined);
 assert.equal(shape.id,'owned-shape');assert.equal(shape.sourceId,'compound');assert.equal(shape.type,'rect');assert.equal(shape.name,'Owned labelled shape');
 assert.deepEqual([shape.x,shape.y,shape.w,shape.h],[100,200,320,120]);
 assert.equal(shape.text,'Live label');assert.equal(shape.fontFamily,'Inter');assert.equal(shape.fontSize,18);assert.equal(shape.fontWeight,500);assert.equal(shape.underline,true);
 assert.equal(shape.lineHeight,1.5);assert.equal(shape.letterSpacing,1.5);assert.equal(shape.fill,'#123456');assert.equal(shape.stroke,'#345678');assert.equal(shape.strokeWidth,3);assert.equal(shape.radius,8);
 assert.deepEqual(shape.shapeText,{color:'#abcdef',align:'right',verticalAlign:'middle'});
 assert.deepEqual(shape.padding,{left:12,right:28,top:16,bottom:32});
 assert.deepEqual(shape.shadow,{color:'#000000',opacity:.2,blur:6,x:2,y:4});
 assert.equal(shape.nativeTextLayout,undefined);assert.equal(shape.src,undefined);assert.equal(shape.sourceRegion,undefined);
 assert(!slide.source?.warnings.some(w=>w.includes('could not be read safely')));
});

test('native label edits supply live rich runs, fonts, paragraphs and alignments instead of stale semantic metadata',()=>{
 const f=fixture();f.text.characters='Live\nlabel';f.text.style.paragraphSpacing=8;f.text.style.paragraphIndent=3;
 f.text.characterStyleOverrides=[1,1,1,1,1,2,2,2,2,2];
 f.text.styleOverrideTable={1:{fontFamily:'Inter',fontSize:18,fontWeight:600,fills:[solid('#ff0000')]},2:{fontFamily:'Georgia',fontSize:22,fontWeight:400,italic:true,textDecoration:'STRIKETHROUGH',fills:[solid('#0000ff')]}};
 f.text.paragraphStyles=[{textAlignHorizontal:'LEFT',paragraphSpacing:8,paragraphIndent:3,lineHeightPx:27},{textAlignHorizontal:'RIGHT',paragraphSpacing:12,paragraphIndent:5,lineHeightPx:33}];
 f.text.style.textAlignHorizontal='CENTER';f.label.primaryAxisAlignItems='MAX';
 const shape=f.read().elements[0];assert.equal(shape.text,'Live\nlabel');assert.equal(shape.runs?.map(run=>run.text).join(''),'Live\nlabel');
 assert.deepEqual(shape.runs?.map(run=>[run.text,run.fontFamily,run.fontSize,run.color]),[['Live\n','Inter',18,'#ff0000'],['label','Georgia',22,'#0000ff']]);
 assert.equal(shape.runs?.[1].italic,true);assert.equal(shape.runs?.[1].strikethrough,true);
 assert.deepEqual(shape.paragraphs?.map(p=>[p.runs.map(run=>run.text).join(''),p.align,p.spaceAfter,p.firstLineIndent,p.lineSpacing]),[['Live','left',8,3,27],['label','right',12,5,33]]);
 assert.deepEqual(shape.shapeText,{color:'#abcdef',align:'center',verticalAlign:'bottom'});
});

test('body paints and label padding remain live while body color stays separate from glyph color',()=>{
 const f=fixture();f.body.fills=[solid('#fedcba')];f.body.strokes=[];f.body.strokeWeight=0;f.body.effects=[];f.body.cornerRadius=19;
 f.text.fills=[solid('#112233')];f.text.style.textDecoration='NONE';f.label.paddingLeft=24;f.label.primaryAxisAlignItems='MIN';
 const shape=f.read().elements[0];assert.equal(shape.fill,'#fedcba');assert.equal(shape.stroke,'transparent');assert.equal(shape.strokeWidth,0);assert.equal(shape.shadow,undefined);assert.equal(shape.radius,19);
 assert.equal(shape.underline,false);assert.equal(shape.shapeText?.color,'#112233');assert.equal(shape.shapeText?.verticalAlign,'top');assert.equal(shape.padding?.left,24);
});

test('a semantic vector shape uses its nested live paint leaf without flattening native text or losing its variant',()=>{
 const f=fixture(),paint={...f.body,id:'paint',type:'VECTOR'};delete paint.cornerRadius;
 f.body.type='FRAME';f.body.fills=[];f.body.strokes=[];f.body.effects=[];f.body.children=[paint];delete f.body.cornerRadius;
 f.root.deckStudioShapeLabel.data={...f.root.deckStudioShapeLabel.data,type:'rect',shape:'star',radius:17};f.root.deckStudioShapeLabel.paintId='paint';
 f.body.effects=[{type:'DROP_SHADOW',color:{r:1,g:0,b:0,a:.3},radius:10,offset:{x:5,y:7}}];
 const shape=f.read().elements[0];assert.equal(shape.type,'rect');assert.equal(shape.shape,'star');assert.equal(shape.fill,'#123456');assert.equal(shape.stroke,'#345678');assert.equal(shape.radius,17);assert.equal(shape.text,'Live label');assert.equal(shape.sourceId,'compound');
 assert.deepEqual(shape.shadow,{color:'#ff0000',opacity:.3,blur:10,x:5,y:7});
});

test('native line bodies preserve semantic route and endpoint markers alongside one editable label',()=>{
 const f=fixture();f.body.type='LINE';f.body.fills=[];delete f.body.cornerRadius;
 const line={route:'curve',dash:'dash-dot',start:'circle',end:'arrow',cap:'round',markerSize:2,bend:.4,dashArray:[7,3]} as const;
 f.root.deckStudioShapeLabel.data=shapeLabelData(element('line',{line:{...line,dashArray:[...line.dashArray]},fontFamily:'Inter'}));
 f.label.size={x:180,y:64};f.label.relativeTransform=[[0,-1,84],[1,0,-30]];
 const shape=f.read().elements[0];assert.equal(shape.type,'line');assert.deepEqual(shape.line,line);assert.equal(shape.fill,'transparent');assert.equal(shape.text,'Live label');assert.equal(f.read().elements.length,1);
 assert(f.read().source?.warnings.some(w=>w.includes('Independent native label positioning is not retained')));
});

test('clearing native label text retains the editable compound and live empty-text font attributes',()=>{
 const f=fixture();f.text.characters='';f.text.style.fontFamily='Georgia';f.text.style.fontSize=24;f.text.style.textDecoration='NONE';
 const slide=f.read(),shape=slide.elements[0];assert.equal(slide.elements.length,1);assert.equal(shape.type,'rect');assert.equal(shape.text,'');assert.deepEqual(shape.runs,[]);assert.equal(shape.fontFamily,'Georgia');assert.equal(shape.fontSize,24);assert.equal(shape.underline,false);assert.equal(shape.fill,'#123456');
});

test('a rotated native parent remains one shape with its root rotation and unscaled editable label',()=>{
 const f=fixture(),angle=Math.PI/6;f.root.relativeTransform=[[Math.cos(angle),-Math.sin(angle),100],[Math.sin(angle),Math.cos(angle),200]];
 const shape=f.read().elements[0];assert.equal(shape.rotation,30);assert(Math.abs(shape.x-48.564064606)<.000001);assert(Math.abs(shape.y-271.961524227)<.000001);assert.equal(shape.fontSize,18);assert.equal(shape.text,'Live label');assert.equal(shape.w,320);assert.equal(shape.h,120);
});

test('the compound parent controls scaled geometry, inherited opacity and group membership while native padding/fonts scale once',()=>{
 const f=fixture();f.root.relativeTransform=[[2,0,40],[0,2,60]];f.root.opacity=.8;
 f.slide.children=[{id:'outer',type:'GROUP',name:'Outer',size:{x:1000,y:700},relativeTransform:structuredClone(identity),absoluteBoundingBox:{x:0,y:0,width:1000,height:700},opacity:.5,children:[f.root]}];
 const slide=f.read(),shape=slide.elements[0];assert.equal(slide.elements.length,1);assert.equal(slide.groups?.length,1);assert.equal(shape.group,slide.groups?.[0].id);
 assert.deepEqual([shape.x,shape.y,shape.w,shape.h],[40,60,640,240]);assert.equal(shape.opacity,.4);
 assert.equal(shape.fontSize,36);assert.equal(shape.runs?.[0].fontSize,36);assert.equal(shape.strokeWidth,6);assert.equal(shape.radius,16);
 assert.deepEqual(shape.padding,{left:24,right:56,top:32,bottom:64});
});

test('a native compound copy gets a distinct root identity while its TEXT/body children never become separate Deck objects',()=>{
 const f=fixture(),copy=structuredClone(f.root);copy.id='native-copy';delete copy.deckStudioId;
 const rename=(node:any)=>{node.id='copy-'+node.id;for(const child of node.children??[])rename(child);};for(const child of copy.children)rename(child);
 Object.assign(copy.deckStudioShapeLabel,{bodyId:'copy-body',paintId:'copy-body',labelFrameId:'copy-label',textId:'copy-text'});
 f.slide.children.push(copy);const shapes=f.read().elements;
 assert.equal(shapes.length,2);assert.equal(shapes[0].id,'owned-shape');assert.notEqual(shapes[1].id,'owned-shape');assert.equal(shapes[1].sourceId,'native-copy');assert.equal(shapes[1].text,'Live label');assert.equal(new Set(shapes.map(shape=>shape.id)).size,2);
});

test('malformed compound metadata or role structure warns and falls through instead of guessing a single editable shape',()=>{
 const cases:Array<(f:ReturnType<typeof fixture>)=>void>=[
  f=>{f.root.deckStudioShapeLabel.version=2;},
  f=>{f.root.deckStudioShapeLabel.data.text='Forged stale text';},
  f=>{f.root.deckStudioShapeLabel.data.x=999;},
  f=>{f.root.deckStudioShapeLabel.textId='missing';},
  f=>{f.root.deckStudioShapeLabel.paintId='text';},
  f=>{f.label.children=[];},
  f=>{f.label.layoutMode='HORIZONTAL';},
  f=>{f.label.primaryAxisAlignItems='SPACE_BETWEEN';},
  f=>{f.label.paddingLeft=Infinity;},
  f=>{f.label.relativeTransform[0][2]=10;},
  f=>{f.label.size.x=300;},
  f=>{f.body.fills=[{type:'GRADIENT_LINEAR'}];},
  f=>{f.root.children.push({...f.text,id:'extra-text'});},
  f=>{delete f.root.deckStudioShapeLabel;f.root.deckStudioShapeLabelWarning='The native label structure changed.';},
 ];
 for(const change of cases){const f=fixture();change(f);const slide=f.read();assert(!slide.elements.some(e=>e.id==='owned-shape'&&e.type==='rect'&&e.text==='Live label'));assert(slide.source?.warnings.some(w=>w.includes('editable shape label that could not be read safely')));}
});

test('ordinary untagged groups and native TEXT retain their existing independent import behavior',()=>{
 const f=fixture();delete f.root.deckStudioShapeLabel;f.text.textLink='mailto:hello@example.com';const slide=f.read();
 assert.equal(slide.elements.length,2);assert.equal(slide.elements.find(e=>e.sourceId==='body')?.type,'rect');
 const text=slide.elements.find(e=>e.sourceId==='text')!;assert.equal(text.type,'text');assert.equal(text.text,'Live label');assert.equal(text.fontFamily,'Inter');assert.equal(text.fontSize,18);assert.equal(text.align,'right');assert.equal(text.verticalAlign,'top');assert.equal(text.link,'mailto:hello@example.com');
 assert(!slide.source?.warnings.some(w=>w.includes('editable shape label')));
});
