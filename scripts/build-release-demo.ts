import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createAIBase, prepareStory, creationPreview} from '../src/core/ai-story-builder';
import {validateDeck} from '../src/core/model';

// Authored demonstration content only; no AI call, client example or fake study.
const brief = {brief:'Introduce Deckleaf with real product behavior', audience:'People making presentations', slideCount:3, collection:'review' as const, materials:'No research claims or client content.'};
const story = {title:'Deckleaf · A short introduction', replaceBlank:true, slides:[
  {layout:'cover', heading:'Deckleaf', body:'Make room for your ideas.', notes:'A personal open-source slide editor by Ken Pan, built with Codex. This demonstration contains no customer or extracted portfolio material.'},
  {layout:'insights', heading:'Make changes with confidence', points:[
    {heading:'Edit',body:'Shape editable text, images, layouts and charts.'},
    {heading:'Review',body:'Preview AI suggestions before applying them.'},
    {heading:'Undo',body:'Keep changes reversible as your story evolves.'},
  ], notes:'Ordinary local editing needs no account or AI key. AI proposals are optional and use the same document operations as manual edits.'},
  {layout:'summary', heading:'Take your work with you', points:[
    {heading:'Keep a backup',body:'Deck JSON keeps editable objects and source information.'},
    {heading:'Choose a format',body:'Use supported presentation formats or a portable web page.'},
    {heading:'Check the result',body:'Review complex fonts and effects in the target app.'},
  ], notes:'Code is MIT licensed. Project-created decorative artwork uses CC0; third-party fonts and resources retain their own licenses. Review private notes and imported content before sharing.'},
]};
const base = await createAIBase('review');
const operations = await prepareStory(base,story);
const deck = creationPreview(base,{baseRevision:0,summary:'Authored Deckleaf introduction',operations},brief);
for(const slide of deck.slides) for(const element of slide.elements) {
  if(element.type !== 'image' || !element.src.startsWith('/')) continue;
  if(!/^\/(?:examples\/template-assets|resources\/blue-black-v1)\/[\w/.-]+\.(?:png|jpg|svg)$/.test(element.src)) throw new Error('Unexpected demo media source.');
  const bytes = await readFile(resolve('public', '.' + element.src));
  const mime = element.src.endsWith('.jpg')?'image/jpeg':element.src.endsWith('.svg')?'image/svg+xml':'image/png';
  element.src = `data:${mime};base64,${bytes.toString('base64')}`;
}
validateDeck(deck);
await writeFile('public/examples/deckleaf-demo.deck.json',JSON.stringify(deck));
console.log(`Authored Deckleaf demo: ${deck.slides.length} editable slides with embedded project artwork.`);
