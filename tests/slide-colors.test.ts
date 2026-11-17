import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankSlide,element,newDeck,validateDeck,type Deck} from '../src/core/model';
import {DEFAULT_DESIGN_SYSTEM} from '../src/core/design-system-schema';
import {applyOperations} from '../src/core/operations';
import {contrastRatio,DESIGN_PRESETS} from '../src/core/deck-design-system';
import {sampleChart,chartFromElement} from '../src/core/charts';
import {tablePresentation,tableCellStyle} from '../src/core/table-appearance';
import {insertedElement} from '../src/core/insertion';
import {createDeckBlock,defaultBlockOptions} from '../src/core/deck-blocks';
import {createLayout} from '../src/core/templates';
import {buildPptx} from '../src/core/pptx-export';
import JSZip from 'jszip';
import {adaptSlideColors} from '../src/core/slide-colors';
import {compositeColor} from '../src/core/color-contrast';
import {shapeTextElement} from '../src/core/shape-text';

const system=DEFAULT_DESIGN_SYSTEM;
function fixture():Deck{
  const slide=blankSlide();slide.backgroundStyle='background';
  slide.elements=[
    element('text',{id:'title',x:80,y:50,w:600,h:80,text:'Adaptive contrast',fill:system.colors.ink,design:{fill:'ink'},runs:[{text:'Adaptive',color:system.colors.ink},{text:' contrast',color:'#345678',bold:true}]}),
    element('text',{id:'custom',x:80,y:160,w:500,h:60,text:'A custom color',fill:'#123456'}),
    element('rect',{id:'panel',x:80,y:260,w:500,h:240,fill:system.colors.surface,design:{fill:'surface'}}),
    element('text',{id:'panel-text',x:110,y:300,w:400,h:80,text:'Inside a panel',fill:system.colors.ink,design:{fill:'ink'}}),
    element('rect',{id:'custom-panel',x:700,y:50,w:500,h:160,fill:'#ffffff'}),
    element('text',{id:'custom-panel-text',x:730,y:80,w:400,h:70,text:'Keep dark text on white',fill:'#111111'}),
    element('line',{id:'line',x:80,y:230,w:1100,h:1,stroke:system.colors.ink,strokeWidth:2,design:{stroke:'ink'}}),
    element('rect',{id:'label',x:700,y:260,w:400,h:80,fill:'#16251d',text:'Shape label',shapeText:{color:'#111111'}}),
    element('table',{id:'table',x:80,y:540,w:500,h:180,fill:system.colors.ink,cells:[['Item','Value'],['Test','42']],tableStyle:{preset:'banded',banded:true,cellStyles:[{row:1,column:0,fill:'#ffffff'}]}}),
    element('chart',{id:'chart',x:700,y:400,w:600,h:300,fill:'#123456',chart:sampleChart()}),
    element('chart',{id:'legacy-chart',x:700,y:740,w:300,h:60,fill:'#123456',values:[{label:'A',value:10}]}),
    element('text',{id:'locked',x:1300,y:60,w:100,h:50,text:'Locked',fill:'#123456',locked:true}),
    element('text',{id:'source',x:1300,y:120,w:100,h:50,text:'Source',fill:'#123456',sourceId:'source-object'}),
  ];
  return {...newDeck('Contrast QA',[slide]),designSystem:structuredClone(system)};
}
function mode(deck:Deck,backgroundStyle:'dark'|'background'){
  return applyOperations(deck,[{op:'update_slide',slideId:deck.slides[0].id,patch:{backgroundStyle}}]);
}
const find=(deck:Deck,id:string)=>deck.slides[0].elements.find(e=>e.id===id)!;

test('Contrast adapts text, custom colors, panels, labels and lines to their actual backing',()=>{
  const deck=fixture(),before=structuredClone(deck),dark=mode(deck,'dark'),bg=dark.slides[0].background;
  assert(contrastRatio(find(dark,'title').fill,bg)>=4.5);
  assert(contrastRatio(find(dark,'custom').fill,bg)>=4.5);
  assert(contrastRatio(find(dark,'panel-text').fill,find(dark,'panel').fill)>=4.5);
  assert.equal(find(dark,'custom-panel-text').fill,'#111111');
  assert(contrastRatio(find(dark,'label').shapeText!.color!,find(dark,'label').fill)>=4.5);
  assert(contrastRatio(find(dark,'line').stroke,bg)>=3);
  for(const run of find(dark,'title').runs!)assert(contrastRatio(run.color!,bg)>=4.5);
  assert.equal(find(dark,'title').runs![1].bold,true);
  assert.deepEqual(find(dark,'locked'),find(deck,'locked'));assert.deepEqual(find(dark,'source'),find(deck,'source'));
  assert.deepEqual(deck,before);
});
test('tables and both chart formats materialize legible colors without changing their data',()=>{
  const deck=fixture(),dark=mode(deck,'dark'),bg=dark.slides[0].background;
  const table=find(dark,'table'),presentation=tablePresentation(table,system);
  for(const [r,row] of table.cells!.entries())for(const [c] of row.entries()){
    const cell=tableCellStyle(presentation,r,c);assert(contrastRatio(cell.color,cell.background)>=4.5);
  }
  assert.deepEqual(table.cells,find(deck,'table').cells);
  for(const id of ['chart','legacy-chart']){
    const chart=chartFromElement(find(dark,id));assert(contrastRatio(chart.textColor,bg)>=4.5);
    for(const color of chart.colors)assert(contrastRatio(color,bg)>=3);
    assert.deepEqual(chart.series,chartFromElement(find(deck,id)).series);
  }
});
test('repeated Main/Contrast cycles and JSON persistence restore all authored color values',()=>{
  const deck=fixture();let next=deck;
  for(let i=0;i<3;i++){
    next=mode(validateDeck(JSON.parse(JSON.stringify(mode(next,'dark')))),'background');
    assert.deepEqual(next.slides[0].elements,deck.slides[0].elements);
  }
});
test('color edits in Contrast become the new original and new text adapts, then returns to Main',()=>{
  let deck=mode(fixture(),'dark');const id=deck.slides[0].id;
  const added=insertedElement('text',deck,{x:50,y:750,w:500,h:50},'New text',deck.slides[0]);
  deck=applyOperations(deck,[{op:'update_element',slideId:id,elementId:'custom',patch:{fill:'#654321'}},{op:'add_element',slideId:id,element:added}]);
  assert(contrastRatio(find(deck,'custom').fill,deck.slides[0].background)>=4.5);
  assert(contrastRatio(find(deck,added.id).fill,deck.slides[0].background)>=4.5);
  const main=mode(deck,'background');assert.equal(find(main,'custom').fill,'#654321');assert.equal(find(main,added.id).fill,system.colors.ink);
});
test('document theme changes rebase adaptive colors, and stale or invalid transactions remain atomic',()=>{
  const deck=mode(fixture(),'dark'),before=structuredClone(deck);
  const themed=applyOperations(deck,[{op:'set_design_system',system:DESIGN_PRESETS[1]}]);
  assert(contrastRatio(find(themed,'title').fill,themed.slides[0].background)>=4.5);
  assert.equal(find(mode(themed,'background'),'title').fill,DESIGN_PRESETS[1].colors.ink);
  assert.throws(()=>applyOperations(deck,[{op:'update_slide',slideId:deck.slides[0].id,patch:{backgroundStyle:'background'}},{op:'delete_element',slideId:deck.slides[0].id,elementId:'missing'}]));
  assert.throws(()=>applyOperations(deck,[{op:'update_slide',slideId:deck.slides[0].id,patch:{backgroundStyle:'background'}}],deck.revision-1,'ai'));
  assert.deepEqual(deck,before);
});
test('legacy documents resolve Contrast even without a stored document design system',()=>{
  const deck=fixture();delete deck.designSystem;const dark=mode(deck,'dark');
  assert.equal(dark.slides[0].background,system.colors.dark);assert(contrastRatio(find(dark,'title').fill,dark.slides[0].background)>=4.5);
});
test('new blocks keep semantic text readable when returning from Contrast to Main',()=>{
  const dark=mode(fixture(),'dark'),slide=dark.slides[0],block=createDeckBlock('agenda',defaultBlockOptions('agenda'),dark,slide);
  const added=applyOperations(dark,block.elements.map(element=>({op:'add_element' as const,slideId:slide.id,element}))),main=mode(added,'background');
  for(const e of main.slides[0].elements.filter(e=>block.elements.some(b=>b.id===e.id)&&e.design?.fill==='ink'))assert.equal(e.fill,system.colors.ink);
});
test('native PowerPoint templates retain adaptive text colors instead of rebinding to dark ink',async()=>{
  const slide=createLayout('statement');slide.backgroundStyle='background';slide.background=system.colors.background;for(const e of slide.elements)if(e.type==='text'){e.fill=system.colors.ink;e.design={...e.design,fill:'ink'};}const deck={...newDeck('Export',[slide]),designSystem:structuredClone(system)},dark=mode(deck,'dark');
  const zip=await JSZip.loadAsync(await buildPptx(dark,false,async()=>({w:1440,h:810})));
  const xml=await zip.file('ppt/slides/slide1.xml')!.async('string');
  const adapted=dark.slides[0].elements.filter(e=>e.type==='text'&&e.contrastColors?.fill);assert.ok(adapted.length);
  for(const e of adapted){
    const shape=(xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g)??[]).find(shape=>shape.includes(`name="${e.id}"`));
    assert.ok(shape,`Missing ${e.id}`);assert.match(shape!,new RegExp(`srgbClr val="${e.fill.slice(1)}"`,'i'));assert.doesNotMatch(shape!,/<a:schemeClr val="dk1"/);
  }
});
test('transparent and invisible objects retain their alpha and restore their exact authored colors',()=>{
  const deck=fixture();deck.slides[0].elements=[
    element('rect',{id:'invisible-fill',fill:'#0000',x:10,y:10,w:40,h:40}),
    element('text',{id:'invisible-object',text:'Hidden by opacity',opacity:0,fill:'#111111',x:100,y:10,w:500,h:50}),
    element('text',{id:'alpha-text',text:'Translucent text',fill:'#111111cc',x:100,y:100,w:500,h:50}),
  ];
  const dark=mode(deck,'dark');assert.equal(find(dark,'invisible-fill').fill,'#0000');assert.equal(find(dark,'invisible-object').fill,'#111111');
  assert.equal(find(dark,'alpha-text').fill.slice(7),'cc');assert.deepEqual(mode(dark,'background').slides[0].elements,deck.slides[0].elements);
});
test('partial photos and complex shape backings keep authored text instead of guessing a flat background',()=>{
  for(const surface of [element('image',{x:0,y:0,w:200,h:120,src:'data:image/png;base64,aA=='}),element('rect',{x:0,y:0,w:200,h:120,shape:'triangle',fill:'#ffffff'})]){
    const deck=fixture();deck.slides[0].elements=[surface,element('text',{id:'overlap',text:'Across a visual boundary',x:150,y:40,w:300,h:50,fill:'#111111'})];
    assert.equal(find(mode(deck,'dark'),'overlap').fill,'#111111');
  }
});
test('an opaque card over a photo restores a known backdrop for adaptive text',()=>{
  const deck=fixture();deck.slides[0].elements=[element('image',{x:0,y:0,w:1400,h:800,src:'data:image/png;base64,aA=='}),element('rect',{x:100,y:100,w:600,h:200,fill:'#ffffff'}),element('text',{id:'on-card',text:'Readable on a known card',x:120,y:120,w:500,h:70,fill:'#ffffff'})];
  assert.ok(contrastRatio(find(mode(deck,'dark'),'on-card').fill,'#ffffff')>=4.5);
});
test('local header formatting inherits its readable header text instead of the body text color',()=>{
  const deck=fixture(),table=find(deck,'table');table.fill='#ffffff';table.tableStyle={headerRow:true,headerFill:'#ffffff',headerText:'#111111',bodyFill:'#111111',cellStyles:[{row:0,column:0,fontWeight:700}]};
  const result=find(mode(deck,'dark'),'table');assert.equal(result.tableStyle!.cellStyles![0].color,undefined);assert.equal(tableCellStyle(tablePresentation(result,system),0,0).color,'#111111');
});
test('already readable objects are shared rather than rewritten by color adaptation',()=>{
  const slide=blankSlide();slide.background=system.colors.dark;slide.backgroundStyle='dark';slide.adaptiveColors=true;
  const text=element('text',{text:'Already readable',fill:'#ffffff'});slide.elements=[text];
  assert.equal(adaptSlideColors(slide,system).elements[0],text);
});
test('transparent table bodies produce valid colors and local header corrections share the same materialized style',()=>{
  for(const bodyFill of ['transparent','#ffffff']){
    const deck=fixture(),table=find(deck,'table');table.fill='#111111';table.tableStyle={bodyFill,headerFill:'#111111',headerText:'#111111',cellStyles:[{row:0,column:0,fontWeight:700}]};
    const result=find(mode(deck,'dark'),'table'),p=tablePresentation(result,system);
    for(const value of [p.header,p.headerText,p.stripe,p.line])assert.match(value,/^#[\da-f]{6}$/i);
    assert.equal(result.tableStyle!.cellStyles![0].color,undefined);assert.ok(contrastRatio(p.headerText,p.header)>=4.5);
    assert.deepEqual(mode(mode(deck,'dark'),'background').slides[0].elements,deck.slides[0].elements);
  }
});
test('alpha table inks and legacy chart labels materialize valid portable colors, then restore exactly',()=>{
  const deck=fixture(),table=find(deck,'table'),chart=find(deck,'legacy-chart');table.fill='#111c';table.stroke='#0008';chart.stroke='#111c';
  const dark=mode(deck,'dark'),p=tablePresentation(find(dark,'table'),system);
  for(const value of [p.headerText,p.line,...p.cellStyles.flatMap(cell=>cell.color?[cell.color]:[])])assert.match(value,/^#[\da-f]{6}$/i);
  assert.ok(contrastRatio(chartFromElement(find(dark,'legacy-chart')).textColor,dark.slides[0].background)>=4.5);
  assert.deepEqual(mode(dark,'background').slides[0].elements,deck.slides[0].elements);
});

test('automatic shape labels contrast against the composited surface and restore missing or empty style containers',()=>{
  for(const shape of ['rect','ellipse','diamond'] as const)for(const fill of ['transparent','#ffffff40','#060b0880','#ffffff'])for(const opacity of [1,.8])for(const shapeText of [undefined,{}]){
    const slide=blankSlide();slide.backgroundStyle='background';
    const original=element(shape,{id:'label',text:'Automatic label',fill,opacity,...(shapeText?{shapeText}:{}),x:100,y:100,w:400,h:120});slide.elements=[original];
    const deck={...newDeck('Automatic label',[slide]),designSystem:structuredClone(system)},before=structuredClone(deck),dark=mode(deck,'dark'),e=find(dark,'label');
    const inner=compositeColor(e.fill,dark.slides[0].background),back=compositeColor(inner,dark.slides[0].background,opacity);
    const visible=compositeColor(compositeColor(shapeTextElement(e).fill,inner),dark.slides[0].background,opacity);
    assert(contrastRatio(visible,back)>=4.5,JSON.stringify({shape,fill,opacity,color:shapeTextElement(e).fill,ratio:contrastRatio(visible,back)}));
    const persisted=validateDeck(JSON.parse(JSON.stringify(dark)));assert.deepEqual(mode(persisted,'background').slides[0].elements,deck.slides[0].elements);assert.deepEqual(deck,before);
  }
});
test('connector text uses its painted slide-background label rather than a card or the line contrast target',()=>{
  const slide=blankSlide();slide.backgroundStyle='background';slide.elements=[element('rect',{fill:'#ffffff',x:0,y:0,w:800,h:500,locked:true}),element('line',{id:'connector',text:'Connector label',x:50,y:150,w:600,h:1,stroke:'#111111',strokeWidth:2})];
  const deck={...newDeck('Connector label',[slide]),designSystem:structuredClone(system)},dark=mode(deck,'dark'),e=find(dark,'connector');
  assert.equal(e.stroke,'#111111');assert(contrastRatio(shapeTextElement(e).fill,dark.slides[0].background)>=4.5);assert.deepEqual(mode(dark,'background').slides[0].elements,deck.slides[0].elements);
});
test('manual label color and alignment edits survive reversible generated automatic colors',()=>{
  const slide=blankSlide();slide.backgroundStyle='background';slide.elements=[element('rect',{id:'label',fill:'transparent',text:'Editable label'})];
  const deck={...newDeck('Label edits',[slide]),designSystem:structuredClone(system)},dark=mode(deck,'dark');assert.ok(find(dark,'label').contrastColors?.['shapeText.color']?.created);
  const custom=applyOperations(dark,[{op:'update_element',slideId:slide.id,elementId:'label',patch:{shapeText:{color:'#654321',align:'right'}}}]);
  assert.equal(find(mode(custom,'background'),'label').shapeText?.color,'#654321');assert.equal(find(mode(custom,'background'),'label').shapeText?.align,'right');
  const aligned=applyOperations(dark,[{op:'update_element',slideId:slide.id,elementId:'label',patch:{shapeText:{...find(dark,'label').shapeText,align:'right'}}}]);
  assert.deepEqual(find(mode(aligned,'background'),'label').shapeText,{align:'right'});
});
test('automatic label fixes preserve invisible, protected and unknown photographic backings',()=>{
  const slide=blankSlide();slide.backgroundStyle='background';slide.elements=[element('rect',{id:'locked-label',fill:'transparent',text:'Locked',locked:true,x:10,y:10,w:200,h:100}),element('rect',{id:'source-label',fill:'transparent',text:'Source',sourceId:'source',x:400,y:10,w:200,h:100}),element('rect',{id:'invisible-label',fill:'transparent',text:'Invisible',opacity:0,x:10,y:150,w:200,h:100}),element('image',{x:400,y:150,w:200,h:100,src:'data:image/png;base64,aA=='}),element('rect',{id:'photo-label',fill:'transparent',text:'Unknown photo',x:400,y:150,w:200,h:100})];
  const deck={...newDeck('Protected label',[slide]),designSystem:structuredClone(system)},dark=mode(deck,'dark');for(const id of ['locked-label','source-label','invisible-label','photo-label'])assert.deepEqual(find(dark,id),find(deck,id));
});
