import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchResources, loadResource} from '../server/resources';
import {illustrationTypeOf, matchesIllustrationView} from '../src/core/resource-taxonomy';
import {blueBlackLibrary} from '../server/blue-black';
import {ICON_SETS,type ResourceItem} from '../src/core/resources';

async function browse(extra: Record<string, string> = {}): Promise<ResourceItem[]> {
  const params = new URLSearchParams({kind: 'illustration', ...extra});
  const result: ResourceItem[] = [];
  for (let page = 1; ; page++) {
    params.set('page', String(page));
    const response = await searchResources(params);
    result.push(...response.items);
    if (!response.hasMore) return result;
  }
}

test('art and backgrounds partition the complete catalog without moving or duplicating source assets', async () => {
  const legacy = await browse(), art = await browse({view: 'illustrations'}), graphics = await browse({view: 'graphics'});
  assert.equal(legacy.length, art.length + graphics.length);
  assert.equal(new Set([...art, ...graphics].map(i => i.id)).size, legacy.length);
  assert.equal(graphics.length, 36);
  assert(graphics.every(i => ['pattern', 'texture'].includes(i.category!)));
  assert(art.every(i => illustrationTypeOf(i)));
  for (const type of ['spot', 'scene', 'accent']) {
    const subset = await browse({view: 'illustrations', illustrationType: type});
    assert(subset.length > 0);
    assert(subset.every(i => illustrationTypeOf(i) === type));
  }
  const accents = await browse({view: 'illustrations', illustrationType: 'accent'});
  assert.equal(accents.length, 24);
  assert(accents.every(i => i.id.startsWith('deck-graphics:accent-')));
});

test('spot and scene queries respect original blue-black types and curated third-party compositions', async () => {
  const originals = await blueBlackLibrary();
  for (const asset of originals) assert.equal(illustrationTypeOf({id: `blue-black:${asset.id}`, kind: 'illustration'}), asset.type === 'scene' ? 'scene' : 'spot');
  const scenes = await browse({view: 'illustrations', illustrationType: 'scene', collection: 'blue-black'});
  const spots = await browse({view: 'illustrations', illustrationType: 'spot', collection: 'blue-black'});
  assert.deepEqual(new Set(scenes.map(i => i.id)), new Set(originals.filter(i => i.type === 'scene').map(i => `blue-black:${i.id}`)));
  assert.deepEqual(new Set(spots.map(i => i.id)), new Set(originals.filter(i => i.type === 'spot' || i.type === 'character').map(i => `blue-black:${i.id}`)));
  const room = await browse({view: 'illustrations', illustrationType: 'scene', collection: 'illlustrations', q: 'living room'});
  assert(room.some(i => i.id === 'illlustrations:day55-living-room-interior'));
  assert(!(await browse({view: 'illustrations', illustrationType: 'spot', q: 'living room'})).some(i => i.id === 'illlustrations:day55-living-room-interior'));
  const camera = await browse({view: 'illustrations', illustrationType: 'spot', q: 'vintage camera'});
  assert(camera.some(i => i.id === 'illlustrations:day7-vintage-camera'));
});

test('accent browsing preserves legacy imports and limits graphic family facets to the selected view', async () => {
  const accents = await browse({view: 'illustrations', illustrationType: 'accent', q: 'starburst'});
  assert.equal(accents[0].id, 'deck-graphics:accent-starburst');
  const imported = await loadResource(accents[0].id);
  assert.equal(imported.resource.id, accents[0].id);
  assert.equal(imported.resource.sourceUrl, accents[0].sourceUrl);
  assert.equal(imported.resource.license, accents[0].license);
  const graphics = await searchResources(new URLSearchParams({kind: 'illustration', collection: 'deck-graphics', view: 'graphics'}));
  const allGraphics = await browse({collection: 'deck-graphics', view: 'graphics'});
  for (const facet of graphics.facets!.families) assert.equal(facet.count, allGraphics.filter(i => i.family === facet.id).length);
  assert.equal((await browse({collection: 'deck-graphics'})).length, 60);
});

test('browser and local searches share category boundaries, pagination and source intersections', async () => {
  const items = await browse(), nativeFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => String(input) === '/resources/catalog.json' ? Response.json({items:items.map((item,index)=>({...item,file:`/resources/qa-taxonomy/${index}.svg`})), catalog:{iconCount:0,illustrationCount:items.length,collections:[]},icons:Object.fromEntries(ICON_SETS.map(({id})=>[id,{author:'QA fixture',license:'MIT',licenseUrl:'https://example.invalid/license',notice:'Synthetic taxonomy fixture notice'}]))}) : nativeFetch(input, init);
  try {
    const {browserResourceJson} = await import('../src/core/web/resources');
    const cases: Record<string, string>[] = [
      {view: 'illustrations'}, {view: 'graphics'},
      {view: 'illustrations', illustrationType: 'spot'},
      {view: 'illustrations', illustrationType: 'scene', page: '2'},
      {view: 'illustrations', illustrationType: 'accent', q: 'arrow'},
      {view: 'illustrations', illustrationType: 'scene', collection: 'blue-black'},
      {view: 'graphics', collection: 'deck-graphics', category: 'texture'},
    ];
    for (const filters of cases) {
      const params = new URLSearchParams(Object.fromEntries(Object.entries({kind: 'illustration', ...filters}).filter((entry): entry is [string, string] => typeof entry[1] === 'string')));
      const local = await searchResources(params), browser = await browserResourceJson('/api/resources/search', params, 'GET', undefined);
      assert.equal(browser.total, local.total);
      assert.equal(browser.hasMore, local.hasMore);
      assert.deepEqual(browser.items.map((i: ResourceItem) => i.id), local.items.map(i => i.id));
      assert(browser.items.every((i: ResourceItem) => matchesIllustrationView(i, filters.view, filters.illustrationType)));
    }
  } finally { globalThis.fetch = nativeFetch; }
});
