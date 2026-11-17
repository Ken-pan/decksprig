import {typographyUses} from './font-usage';
import {fontStack,fontFamilyKey,sameFontFamily} from './font-stack';
import type {TableStyle} from './table-schema';
import type { Deck, Slide } from './model';

const stylesheets = new Map<string, Promise<void>>();

export async function loadLibraryFont(family: string, imported: Deck['fonts'] = []): Promise<void> {
  if (imported?.some(font => sameFontFamily(font.family,family))) return Promise.resolve();
  if(typeof document==='undefined')return;
  const {findFont}=await import('./fonts');
  const font=findFont(family);
  if(!font)return;
  let request = stylesheets.get(font.css);
  if (!request) {
    request = new Promise<void>((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = font.css;
      link.onload = () => resolve();
      link.onerror = () => {
        link.remove(); stylesheets.delete(font.css);
        reject(new Error(`Cannot load font: ${family}`));
      };
      document.head.append(link);
    });
    stylesheets.set(font.css, request);
  }
  return request;
}

// Read typography only: selecting or moving an image must not copy its bytes.
const emptyOnline:NonNullable<Deck['onlineFonts']>=[];
type FontDiscovery={family:string;cells:Slide['elements'][number]['cells'];cellStyles:TableStyle['cellStyles'];merges:TableStyle['merges'];runs:Slide['elements'][number]['runs'];paragraphs:Slide['elements'][number]['paragraphs'];text:string;type:string;online:Deck['onlineFonts'];result:string[]};
const discovery=new WeakMap<object,FontDiscovery[]>();
/** Frame-only immutable previews reuse text references; they must not rescan a large table. */
function elementFontFamilies(e:Slide['elements'][number],online:Deck['onlineFonts']):string[]{
  const anchor=e.type==='table'?e.cells??e:e.type==='chart'?e.chart??e.values??e:e.paragraphs??e.runs??e,entries=discovery.get(anchor)??[];
  const cached=entries.find(entry=>entry.family===e.fontFamily&&entry.cells===e.cells&&entry.cellStyles===e.tableStyle?.cellStyles&&entry.merges===e.tableStyle?.merges&&entry.runs===e.runs&&entry.paragraphs===e.paragraphs&&entry.text===e.text&&entry.type===e.type&&entry.online===online);if(cached)return cached.result;
  const families=new Set<string>([e.fontFamily]);
  for(const cell of e.tableStyle?.cellStyles??[]){if(cell.fontFamily)families.add(cell.fontFamily);for(const run of cell.runs??[])if(run.fontFamily)families.add(run.fontFamily);}
  for(const run of e.paragraphs?.flatMap(p=>[...p.runs,...(p.endStyle?[p.endStyle]:[])])??e.runs??[])if(run.fontFamily)families.add(run.fontFamily);
  for(const use of typographyUses([{elements:[e]}],online))families.add(use.family);
  const result=[...families];discovery.set(anchor,[{family:e.fontFamily,cells:e.cells,cellStyles:e.tableStyle?.cellStyles,merges:e.tableStyle?.merges,runs:e.runs,paragraphs:e.paragraphs,text:e.text,type:e.type,online,result},...entries].slice(0,4));return result;
}
export function slideFontFamilies(slide:Slide,online?:Deck['onlineFonts']):string[]{
  const families=new Set<string>();
  for(const e of slide.elements){
    if(e.hidden||!(['text','table','chart'].includes(e.type)||e.text&&['rect','ellipse','diamond','line'].includes(e.type)&&!e.sourceRegion&&!e.designPattern))continue;
    for(const family of elementFontFamilies(e,online??emptyOnline))families.add(family);
  }
  return [...families];
}

// Measurement waits for imported/system primary faces and the same CJK fallbacks as rendering.
export async function loadLibraryTypography(slides:Pick<Slide,'elements'>[],imported:Deck['fonts']=[],online:Deck['onlineFonts']=[]){
  if(typeof document==='undefined')return;
  const categories=new Map(online?.map(font=>[fontFamilyKey(font.family),font.category]));
  await Promise.all(typographyUses(slides,online).map(async use=>{
    await loadLibraryFont(use.family,imported);
    await document.fonts.load(`${use.italic?'italic ':''}${use.weight} 32px ${fontStack(use.family,categories.get(fontFamilyKey(use.family)))}`,use.text||'Aa');
  }));
}
