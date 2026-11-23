import {TEMPLATE_PAGES} from '../src/core/template-blueprints';
import {hitElements} from '../src/core/hit-testing';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {COLLECTIONS,templateDeck,deckTemplateCollection} from '../src/core/templates';
import {applyDeckDesignSystem,deckDesignSystem} from '../src/core/deck-design-system';
import {DOCUMENT_STYLE_PRESETS,isPresetSelected,customizeStyleName} from '../src/core/deck-style-library';
import {applyOperations} from '../src/core/operations';
import {objectColorStyleOperations,objectTextStyleOperations} from '../src/core/object-style-operations';
import {styleTemplate} from '../src/core/template-styles';
import {element,validateDeck,type Deck} from '../src/core/model';

test('template and document-style choices share the same rules without replacing legacy stored styles',()=>{
 for(const c of COLLECTIONS){const d=templateDeck(c.id),preset=DOCUMENT_STYLE_PRESETS.find(s=>s.name===c.name)!;assert(isPresetSelected(d.designSystem!,preset,'all'));assert.equal(customizeStyleName(c.name),'Custom');}
 const legacy=templateDeck('portfolio');legacy.designSystem!.typography.title.fontSize=96;assert.equal(deckDesignSystem(legacy).typography.title.fontSize,96);
});
test('brand reuse keeps template geometry, content and media, carrying only the fonts referenced by the brand',()=>{
 const template=templateDeck('review'),before=structuredClone(template),brand=structuredClone(COLLECTIONS[0].system);brand.name='Acme';brand.pattern.kind='dots';brand.typography.body.fontFamily='Brand Sans';
 const fontSource={fonts:[{family:'Brand Sans',data:'font bytes'},{family:'Unused',data:'unused bytes'}]} as unknown as Pick<Deck,'fonts'>;
 const created=styleTemplate(template,brand,fontSource);assert.deepEqual(template,before);assert.equal(created.designSystem!.name,'Acme');assert.deepEqual(created.fonts,fontSource.fonts!.slice(0,1));assert.notEqual(created.fonts![0],fontSource.fonts![0]);
 for(const [i,s] of created.slides.entries()){assert.equal(s.elements.filter(e=>e.designPattern).length,1);for(const e of s.elements.filter(e=>!e.designPattern)){const old=before.slides[i].elements.find(o=>o.id===e.id)!;assert.deepEqual([e.text,e.x,e.y,e.w,e.h,e.src],[old.text,old.x,old.y,old.w,old.h,old.src]);}}
});
test('a slide can omit its pattern while colors remain linked across theme changes and JSON storage',()=>{
 const system=structuredClone(COLLECTIONS[1].system);system.pattern.kind='grid';let d=applyDeckDesignSystem(templateDeck('portfolio'),system);const id=d.slides[0].id;
 d=applyOperations(d,[{op:'update_slide',slideId:id,patch:{patternStyle:'none'}}]);assert.equal(d.slides[0].backgroundStyle,'background');assert(!d.slides[0].elements.some(e=>e.designPattern));assert(d.slides[1].elements.some(e=>e.designPattern));
 const next={...system,colors:{...system.colors,background:'#fff1e0'},pattern:{...system.pattern,kind:'dots' as const}};d=applyOperations(validateDeck(JSON.parse(JSON.stringify(d))),[{op:'set_design_system',system:next}]);assert.equal(d.slides[0].background,'#fff1e0');assert(!d.slides[0].elements.some(e=>e.designPattern));
 d=applyOperations(d,[{op:'update_slide',slideId:id,patch:{patternStyle:'document'}}]);assert.equal(d.slides[0].elements.filter(e=>e.designPattern).length,1);
});
test('fill and stroke links change only the chosen property, preserving local type, rich accents and locked objects',()=>{
 const d=templateDeck('portfolio'),s=d.slides[0],text=s.elements.find(e=>e.type==='text')!;text.runs=[{text:'Theme',color:text.fill},{text:'Custom',color:'#ff0088'}];text.fontSize=43;text.design!.overrides=['fontSize'];const rect=element('rect',{fill:'#ffcc00',stroke:'#123456',strokeWidth:2}),locked=element('rect',{locked:true});s.elements.push(rect,locked);
 let next=applyOperations(d,objectColorStyleOperations(d,s.id,[text.id,rect.id,locked.id],'stroke','accent'));const updated=next.slides[0].elements.find(e=>e.id===rect.id)!;assert.equal(updated.fill,'#ffcc00');assert.equal(updated.stroke,next.designSystem!.colors.accent);assert.equal(next.slides[0].elements.find(e=>e.id===text.id)!.fontSize,43);assert.deepEqual(next.slides[0].elements.find(e=>e.id===locked.id),locked);
 next=applyOperations(next,objectColorStyleOperations(next,s.id,[text.id],'fill','accent'));const linked=next.slides[0].elements.find(e=>e.id===text.id)!;assert.equal(linked.runs![0].color,next.designSystem!.colors.accent);assert.equal(linked.runs![1].color,'#ff0088');assert.equal(linked.fontSize,43);
 const detached=applyOperations(next,objectColorStyleOperations(next,s.id,[text.id],'fill'));assert.equal(detached.slides[0].elements.find(e=>e.id===text.id)!.fill,linked.fill);assert.equal(detached.slides[0].elements.find(e=>e.id===text.id)!.design?.fill,undefined);
});
test('contextual text-style reset keeps each object role and scale, while custom format retains appearance',()=>{
 const d=templateDeck('portfolio'),s=d.slides[0],items=s.elements.filter(e=>e.type==='text').slice(0,2);for(const e of items){e.fontSize+=10;e.design!.overrides=['fontSize'];}
 const reset=applyOperations(d,objectTextStyleOperations(d,s.id,items.map(e=>e.id),undefined,true));for(const e of items){const after=reset.slides[0].elements.find(o=>o.id===e.id)!;assert.equal(after.design!.textScale,e.design!.textScale);assert.equal(after.design!.text,e.design!.text);assert.deepEqual(after.design!.overrides,[]);}
 const detached=applyOperations(reset,objectTextStyleOperations(reset,s.id,[items[0].id]));assert.equal(detached.slides[0].elements.find(e=>e.id===items[0].id)!.fontSize,reset.slides[0].elements.find(e=>e.id===items[0].id)!.fontSize);
});
test('linked chart colors follow the document while custom series colors and values stay intact',()=>{
 const d=templateDeck('review'),chart=d.slides.flatMap(s=>s.elements).find(e=>e.type==='chart')!;chart.chart!.colors.push('#ff0088');const data=structuredClone(chart.chart!.series),system=structuredClone(d.designSystem!);system.colors.accent='#ab572b';system.colors.ink='#20354b';const next=applyDeckDesignSystem(d,system),updated=next.slides.flatMap(s=>s.elements).find(e=>e.id===chart.id)!;
 assert.deepEqual(updated.chart!.colors,[system.colors.line,'#ab572b',system.colors.background,'#ff0088']);assert.equal(updated.chart!.textColor,'#20354b');assert.deepEqual(updated.chart!.series,data);
});


test('generated patterns do not intercept authored-object selection, while ordinary locked objects remain selectable',()=>{
 const d=templateDeck('portfolio'),system=structuredClone(d.designSystem!);system.pattern.kind='grid';const styled=applyDeckDesignSystem(d,system),s=styled.slides[0],locked=element('rect',{x:0,y:0,w:50,h:50,locked:true});
 assert.equal(hitElements(s.elements,{x:12,y:12}).length,0);assert.deepEqual(hitElements([...s.elements,locked],{x:12,y:12}).map(e=>e.id),[locked.id]);assert.equal(s.elements.filter(e=>e.designPattern).length,1);
});

test('choosing a linked stroke makes an empty stroke visible and keeps authored line widths',()=>{
 const d=templateDeck('portfolio'),s=d.slides[0],empty=element('rect',{stroke:'transparent',strokeWidth:0}),wide=element('ellipse',{stroke:'#112233',strokeWidth:4});s.elements.push(empty,wide);
 const linked=applyOperations(d,objectColorStyleOperations(d,s.id,[empty.id,wide.id],'stroke','accent'));
 const after=linked.slides[0].elements.filter(e=>[empty.id,wide.id].includes(e.id));assert.deepEqual(after.map(e=>e.strokeWidth),[1,4]);assert.ok(after.every(e=>e.stroke===d.designSystem!.colors.accent));
 const detached=applyOperations(linked,objectColorStyleOperations(linked,s.id,[empty.id],'stroke'));assert.equal(detached.slides[0].elements.find(e=>e.id===empty.id)!.strokeWidth,1);
});

test('template intent survives brand changes and JSON while legacy stories remain recognizable',()=>{
 for(const c of COLLECTIONS){
  const deck=templateDeck(c.id),brand=structuredClone(COLLECTIONS[3].system);brand.name='Atlas';const next=styleTemplate(deck,brand);
  assert.equal(validateDeck(JSON.parse(JSON.stringify(next))).templateCollection,c.id);assert.equal(deckTemplateCollection(next),c.id);
  const legacy=structuredClone(next);legacy.slides.forEach((s,i)=>s.title=TEMPLATE_PAGES[c.id][c.layouts[i]].name);delete legacy.templateCollection;assert.equal(deckTemplateCollection(legacy),c.id);
 }
 const d=templateDeck('review'),theme=applyDeckDesignSystem(d,COLLECTIONS[3].system);assert.equal(deckTemplateCollection(theme),'review');
});

test('inserting a template persists legacy collection intent in the same atomic addition',()=>{
 const d=templateDeck('review');d.slides.forEach((s,i)=>s.title=TEMPLATE_PAGES.review[COLLECTIONS.find(c=>c.id==='review')!.layouts[i]].name);delete d.templateCollection;d.designSystem!.name='Atlas';const before=JSON.stringify(d),s=templateDeck('review').slides[1];
 const next=applyOperations(d,[{op:'add_slide',slide:s,templateCollection:deckTemplateCollection(d)}]);assert.equal(next.slides.length,d.slides.length+1);assert.equal(deckTemplateCollection(next),'review');assert.equal(JSON.stringify(d),before);
 assert.throws(()=>applyOperations(d,[{op:'add_slide',slide:d.slides[0],templateCollection:'review'}]),/already exists/);assert.equal(d.templateCollection,undefined);
});
