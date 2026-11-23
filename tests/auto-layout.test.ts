import {authoredTemplateDeck} from './helpers/authored-template';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankSlide, element, newDeck, type Deck } from '../src/core/model';
import { applyOperations } from '../src/core/operations';
import { templateDeck, COLLECTIONS, scaleTemplateSlide } from '../src/core/templates';
import { AUTO_LAYOUTS, analyzeLayout, createLayoutCandidate, layoutProposal } from '../src/core/auto-layout';

function fixture() {
  const s = blankSlide('Research evidence');
  s.notes = 'Original narration and source';
  s.source = {provider: 'Fixture', fidelity: 'converted', render: 'data:image/png;base64,aA==', warnings: ['Keep source']};
  s.elements = [
    element('text', {name: 'Title', text: 'Make decisions clearer', x: 140, y: 180, w: 720, h: 100, fontSize: 68}),
    element('text', {name: 'Finding', text: 'Compare the evidence before making a decision.\n保留真实材料和完整内容。', x: 190, y: 300, w: 500, h: 180, fontSize: 30, runs: [{text: 'Compare the evidence before making a decision.\n', bold: true, color: '#26362c', fontSize: 30}, {text: '保留真实材料和完整内容。', italic: true}]}),
    element('image', {name: 'Evidence', src: 'data:image/png;base64,aA==', x: 800, y: 250, w: 450, h: 330, fit: 'cover'}),
  ];
  return newDeck('Layout QA', [s]);
}
function checkBounds(deck: Deck) {
  for (const s of deck.slides) for (const e of s.elements) assert(e.x >= -.02 && e.y >= -.02 && e.x + e.w <= deck.width + .02 && e.y + e.h <= deck.height + .02, `${s.title}/${e.name}`);
}
test('layout previews preserve complete content, source evidence, rich text, image crops and document identity', () => {
  const deck = fixture(), original = JSON.stringify(deck);
  for (const {id} of AUTO_LAYOUTS) {
    const c = createLayoutCandidate(deck, deck.slides[0].id, id);
    assert.equal(c.issues.length, 0);
    assert(c.operations.length);
    const proposal = layoutProposal(deck, [c])!;
    const after = applyOperations(deck, proposal.operations, proposal.baseRevision);
    assert.equal(after.id, deck.id); assert.equal(after.revision, deck.revision + 1);
    assert.deepEqual(after.slides[0].source, deck.slides[0].source); assert.equal(after.slides[0].notes, deck.slides[0].notes);
    after.slides[0].elements.forEach((e, i) => {
      const before = deck.slides[0].elements[i];
      for (const key of ['id', 'type', 'text', 'src', 'fit', 'fill', 'fontFamily', 'group'] as const) assert.equal(e[key], before[key]);
      assert.deepEqual(e.runs?.map(({fontSize, ...rest}) => rest), before.runs?.map(({fontSize, ...rest}) => rest));
    });
    checkBounds(after);
  }
  assert.equal(JSON.stringify(deck), original);
});
test('recommendations follow content types and all strategies produce distinct arrangements', () => {
  const deck = fixture(), s = deck.slides[0];
  assert.equal(analyzeLayout(deck, s).recommended, 'split');
  const arrangements = AUTO_LAYOUTS.map(l => JSON.stringify(createLayoutCandidate(deck, s.id, l.id).operations));
  assert.equal(new Set(arrangements).size, 4);
  s.elements = s.elements.slice(0, 1); assert.equal(analyzeLayout(deck, s).recommended, 'focus');
  s.elements = Array.from({length: 4}, () => element('image', {src: 'data:image/png;base64,aA=='}));
  assert.equal(analyzeLayout(deck, s).recommended, 'grid');
});
test('a title and one image use narrative layout while an independent explanation uses side by side', () => {
  const deck = fixture(), slide = deck.slides[0];
  const explanation = slide.elements[1];
  slide.elements = [slide.elements[0], slide.elements[2]];
  const narrative = analyzeLayout(deck, slide);
  assert.equal(narrative.text, 1);
  assert.equal(narrative.visuals, 1);
  assert.equal(narrative.recommended, 'story');
  slide.elements.splice(1, 0, explanation);
  const explained = analyzeLayout(deck, slide);
  assert.equal(explained.text, 2);
  assert.equal(explained.visuals, 1);
  assert.equal(explained.recommended, 'split');
});
test('locked members protect their entire group and all candidates avoid the fixed foreground', () => {
  const deck = fixture(), s = deck.slides[0];
  const fixed = element('rect', {x: 960, y: 100, w: 380, h: 500, locked: true, group: 'fixed-group'});
  const companion = element('text', {x: 980, y: 200, w: 300, h: 100, text: 'Protected', group: 'fixed-group'});
  s.elements.push(fixed, companion);
  for (const {id} of AUTO_LAYOUTS) {
    const c = createLayoutCandidate(deck, s.id, id);
    assert(!c.operations.some(op => 'elementId' in op && [fixed.id, companion.id].includes(op.elementId)));
    assert.deepEqual(c.slide.elements.slice(-2), [fixed, companion]);
    for (const op of c.operations) if (op.op === 'update_element') {
      const e = c.slide.elements.find(e => e.id === op.elementId)!;
      assert(e.x + e.w <= fixed.x || e.x >= fixed.x + fixed.w || e.y + e.h <= fixed.y || e.y >= fixed.y + fixed.h);
    }
  }
});
test('groups resize proportionally, while hidden and rotated objects remain unchanged', () => {
  const deck = fixture(), s = deck.slides[0];
  s.elements[1].group = 'visual'; s.elements[2].group = 'visual';
  const hidden = element('text', {text: 'Hidden evidence', hidden: true, group: 'hidden'});
  const hiddenCompanion = element('text', {text: 'Group companion', group: 'hidden'});
  const rotated = element('text', {text: 'Rotated', x: 1300, y: 20, w: 100, h: 35, rotation: 10});
  s.elements.push(hidden, hiddenCompanion, rotated);
  const c = createLayoutCandidate(deck, s.id, 'grid');
  assert.deepEqual(c.slide.elements.slice(-3), [hidden, hiddenCompanion, rotated]);
  const a = c.slide.elements[1], b = c.slide.elements[2], ratio = a.w / s.elements[1].w;
  assert(Math.abs(b.w / s.elements[2].w - ratio) < .001);
  assert(Math.abs((b.x - a.x) / (s.elements[2].x - s.elements[1].x) - ratio) < .001);
  assert.equal(a.group, 'visual'); assert.equal(b.group, 'visual');
});
test('background frames and their text stay together without adding or rewriting group IDs', () => {
  const deck = fixture(), s = deck.slides[0];
  s.elements = [s.elements[0], element('rect', {x: 600, y: 320, w: 700, h: 300}), element('text', {text: 'Original label', x: 700, y: 400, w: 400, h: 60})];
  assert.equal(analyzeLayout(deck, s).visuals, 1);
  const c = createLayoutCandidate(deck, s.id, 'split');
  const frame = c.slide.elements[1], text = c.slide.elements[2];
  assert(text.x >= frame.x && text.y >= frame.y && text.x + text.w <= frame.x + frame.w && text.y + text.h <= frame.y + frame.h);
  assert(c.slide.elements.every(e => !e.group));
});
test('content that cannot fit is reported and cannot be applied or silently truncated', () => {
  const deck = fixture(), s = deck.slides[0];
  s.elements[1].text = 'Long original content 中文 '.repeat(1500);
  // The rendered rich text must be long too; the plain text field is only its fallback.
  s.elements[1].runs = [{...s.elements[1].runs![0], text: s.elements[1].text}];
  const c = createLayoutCandidate(deck, s.id, 'split');
  assert(c.issues.length); assert.equal(c.slide.elements[1].text, s.elements[1].text);
  assert.throws(() => layoutProposal(deck, [c]));
});
test('empty slides and fully protected pages make no changes', () => {
  const deck = newDeck('Empty', [blankSlide()]);
  let c = createLayoutCandidate(deck, deck.slides[0].id, 'story');
  assert.equal(layoutProposal(deck, [c]), null);
  deck.slides[0].elements.push(element('text', {text: 'Protected', locked: true}));
  c = createLayoutCandidate(deck, deck.slides[0].id, 'story');
  assert.equal(c.operations.length, 0); assert.equal(c.preserved, 1);
});
test('comparison, staggered process and editorial evidence preserve their content and source captions', () => {
  const deck = authoredTemplateDeck('portfolio');
  const story=COLLECTIONS.find(c=>c.id==='portfolio')!.legacyLayouts!;
  const comparison = deck.slides[story.indexOf('before-after')], process = deck.slides[story.indexOf('process')], evidence = deck.slides[story.indexOf('evidence')];
  assert.equal(comparison.elements.filter(e=>e.name.endsWith('sample interface')).length,2);
  assert.equal(new Set(comparison.elements.filter(e=>e.name.endsWith('sample interface')).map(e=>e.y)).size,1);
  const stages=process.elements.filter(e=>['Define','Explore','Validate'].includes(e.text));
  assert.equal(stages.length,3);assert.ok(stages[0].y<stages[1].y&&stages[1].y<stages[2].y);
  const analysis = analyzeLayout(deck, evidence);
  const flow=evidence.autoLayouts!.find(l=>l.name==='Project showcase introduction')!;
  assert.equal(flow.order.length,2,'The showcase title and explanation share an editable native flow.');
  assert.equal(analysis.text, 0, 'Saved native flows are protected from flattening by page layout suggestions.');
  assert.equal(evidence.elements.filter(e=>e.name==='Updated sample interface').length,1,'The full native sample interface remains one grouped evidence object.');
  const c = createLayoutCandidate(deck, evidence.id, analysis.recommended);
  assert.equal(c.issues.length, 0);
  const source = evidence.elements.find(e => e.text.startsWith('Illustrative product state'))!;
  assert.deepEqual(c.slide.elements.find(e => e.id === source.id), source);
  assert.deepEqual(c.slide.autoLayouts,evidence.autoLayouts);
  assert.ok(!c.operations.some(op=>op.op==='update_element'&&flow.order.includes(op.elementId)));
  const labels=['MY ROLE','TIMELINE','DELIVERABLES'];
  const context=deck.slides[story.indexOf('facts')];
  const fields=context.elements.filter(e=>labels.includes(e.text));
  assert.equal(fields.length,3);assert.equal(new Set(fields.map(e=>e.x)).size,1);
  const facts=createLayoutCandidate(deck,context.id,'grid');
  assert.deepEqual(facts.slide.elements.filter(e=>labels.includes(e.text)).map(e=>e.text),fields.map(e=>e.text));
});
test('whole-deck proposals apply atomically and reject stale revisions', () => {
  const deck = fixture(); const second = structuredClone(deck.slides[0]); second.id = 'second'; deck.slides.push(second);
  const candidates = deck.slides.map(s => createLayoutCandidate(deck, s.id, analyzeLayout(deck, s).recommended));
  const proposal = layoutProposal(deck, candidates)!;
  const after = applyOperations(deck, proposal.operations, proposal.baseRevision);
  assert(after.slides.every((s, i) => JSON.stringify(s) !== JSON.stringify(deck.slides[i])));
  assert.equal(after.revision, 1);
  assert.throws(() => applyOperations(after, proposal.operations, proposal.baseRevision));
});
test('all existing template collections and non-widescreen canvases remain inside the page', () => {
  for (const collection of COLLECTIONS) for (const [width, height] of [[1440, 810], [1024, 768], [720, 1280], [320, 180]]) {
    const deck = templateDeck(collection.id), sx = width / deck.width, sy = height / deck.height;
    deck.width = width; deck.height = height;
    deck.slides = deck.slides.map(s => scaleTemplateSlide(s,width,height));
    for (const s of deck.slides) for (const {id} of AUTO_LAYOUTS) {
      const c = createLayoutCandidate(deck, s.id, id);
      if (c.operations.length) checkBounds(applyOperations(deck, c.operations));
    }
  }
});

test('layout proposals preserve protected content independently of JSON field order',()=>{
 const d=fixture(),s=d.slides[0];s.elements.push(element('rect',{id:'fixed-order',locked:true,x:0,y:0,w:60,h:40}));s.elements=s.elements.map(e=>Object.fromEntries(Object.entries(e).reverse()) as typeof e);const c=createLayoutCandidate(d,s.id,'grid');assert.equal(c.issues.length,0);const proposal=layoutProposal(d,[c])!;const after=applyOperations(d,proposal.operations);assert.deepEqual(after.slides[0].elements.at(-1),s.elements.at(-1));
});
test('page layout suggestions retain nested responsive groups and their rules while arranging independent content',()=>{
 const d=fixture(),s=d.slides[0];s.groups=[{id:'outer-flow',name:'Outer'},{id:'nested-flow',name:'Inner',parent:'outer-flow'}];s.elements[0].group='outer-flow';s.elements[1].group='nested-flow';s.autoLayouts=[{id:'nested-flow',name:'Inner',direction:'vertical',gap:16,padding:{top:0,right:0,bottom:0,left:0},align:'start',justify:'start',columns:2,x:s.elements[1].x,y:s.elements[1].y,w:s.elements[1].w,h:s.elements[1].h,widthMode:'fixed',heightMode:'fixed',order:[s.elements[1].id]}];const before=structuredClone(s);
 for(const {id} of AUTO_LAYOUTS){const c=createLayoutCandidate(d,s.id,id);assert(!c.operations.some(op=>op.op==='update_element'&&before.elements.slice(0,2).some(e=>e.id===op.elementId)));assert.deepEqual(c.slide.groups,before.groups);assert.deepEqual(c.slide.autoLayouts,before.autoLayouts);assert.deepEqual(c.slide.elements.slice(0,2),before.elements.slice(0,2));}
});
