import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentSearchActions, blockSearchActions, findSearchActions, type SearchAction } from '../src/search-actions';
import { templateDeck } from '../src/core/templates';
const action = (id: string, label: string, extra: Partial<SearchAction> = {}): SearchAction => ({id, label, kind: 'command', disabled: false, run() {}, ...extra});

test('search accepts Unicode and spaced queries and prioritizes exact labels over content matches', () => {
  const actions = [action('content', 'Other', {searchText: 'budget 图表'}), action('prefix', 'Budget review'), action('exact', 'Budget')];
  assert.deepEqual(findSearchActions(actions, '  ＢＵＤＧＥＴ ').map(a => a.id), ['exact','prefix','content']);
  assert.deepEqual(findSearchActions(actions, 'budget   图表').map(a => a.id), ['content']);
});
test('quick suggestions do not restrict typed queries or the full command browser', () => {
  const actions = [action('common','Insert text',{suggested:true}),action('more','Insert table'),action('blocked','Export',{disabled:true})];
  assert.deepEqual(findSearchActions(actions,'','all',true).map(a=>a.id),['common']);
  assert.deepEqual(findSearchActions(actions,'insert','all',true).map(a=>a.id),['common','more']);
  assert.equal(findSearchActions(actions,'').length,3);
  assert.equal(findSearchActions(actions,'export')[0].disabled,true);
});
test('duplicate object labels retain distinct slide destinations and navigation does not change documents', () => {
  const deck=templateDeck('portfolio'), calls: string[][]=[];
  deck.slides=deck.slides.slice(0,2);
  deck.slides[0].title='First evidence';deck.slides[1].title='Second evidence';
  deck.slides.forEach(slide=>{slide.elements=slide.elements.filter(e=>e.type==='text').slice(0,1);slide.elements[0].name='Evidence';slide.elements[0].text='Find this evidence';slide.elements[0].hidden=true;});
  deck.slides[0].id='source:slide';deck.slides[1].id='source';
  deck.slides[0].elements[0].id='object';deck.slides[1].elements[0].id='slide:object';
  const before=JSON.stringify(deck), actions=documentSearchActions(deck,(slide,id)=>calls.push([slide,id??'']));
  const objects=findSearchActions(actions,'find this','object');assert.equal(objects.length,2);assert.notEqual(objects[0].id,objects[1].id);
  objects[1].run();assert.deepEqual(calls,[[deck.slides[1].id,deck.slides[1].elements[0].id]]);
  assert.match(objects[1].detail!,/Slide 2 · Hidden/);assert.equal(JSON.stringify(deck),before);
  assert.equal(documentSearchActions(deck,()=>{},true).every(a=>a.disabled),true);
  assert.equal(findSearchActions(actions,'Second evidence').length,0);
  assert.equal(actions.find(a=>a.kind==='slide')!.label,'Slide 1');
});

test('deferred block search preserves aliases, availability and the selected destination', () => {
  const opened: string[] = [], actions = blockSearchActions(id => opened.push(id));
  assert.equal(actions.length, 12);
  const [architecture] = findSearchActions(actions, '架构', 'command');
  assert.equal(architecture.id, 'block:architecture');
  architecture.run();
  assert.deepEqual(opened, ['architecture']);
  assert.equal(findSearchActions(actions, 'Gantt plan')[0].id, 'block:gantt');
  assert.equal(blockSearchActions(() => {}, true).every(action => action.disabled), true);
});

test('reused search actions reflect edited text, scope, suggestions and availability', () => {
  const item = action('mutable', 'Original', {detail: 'First detail', searchText: 'Old alias', suggested: true});
  const actions = [item];
  assert.equal(findSearchActions(actions, 'old alias')[0], item);
  item.label = 'Updated'; item.detail = 'New detail'; item.searchText = '新别名'; item.kind = 'object';
  item.suggested = false; item.disabled = true;
  for (const old of ['Original', 'First detail', 'Old alias']) assert.equal(findSearchActions(actions, old).length, 0);
  for (const text of ['updated', 'new detail', '新别名']) assert.equal(findSearchActions(actions, text, 'object')[0], item);
  assert.equal(findSearchActions(actions, 'updated', 'command').length, 0);
  assert.equal(findSearchActions(actions, '', 'all', true).length, 0);
  assert.equal(findSearchActions(actions, 'updated')[0].disabled, true);
});

test('slide results show a visible heading and hidden status without changing page identity', () => {
  const deck = templateDeck('portfolio');
  deck.slides = deck.slides.slice(0, 1);
  const slide = deck.slides[0];
  const text = slide.elements.find(object => object.type === 'text')!;
  slide.elements = [{...text, id:'hidden', text:'Private heading', fontSize:200, hidden:true},
    {...text, id:'caption', text:'Small caption', fontSize:12, hidden:false},
    {...text, id:'heading', text:'Quarterly\n  results', fontSize:48, hidden:false}];
  slide.hidden = true;
  const before = JSON.stringify(deck), actions = documentSearchActions(deck, () => {});
  const [result] = findSearchActions(actions, 'quarterly', 'slide');
  assert.equal(result.label, 'Slide 1');
  assert.equal(result.detail, 'Quarterly results · Hidden from presentation');
  assert.equal(JSON.stringify(deck), before);
  assert.equal(findSearchActions(actions, 'Private heading', 'slide').length, 1);
  assert.equal(result.detail?.includes('Private'), false);
});
