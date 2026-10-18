import type { Deck, OnlineFont } from './model';
import type { Operation } from './operations';
import { fontOperations, fontStack, type FontChoice } from './fonts';
import { loadOnlineFont, onlineReference } from './online-fonts';
import {documentFontRole} from './document-style-choices';
import {canEditText} from './shapes';

// Both the quick picker and the full library prepare one undoable transaction.
// Callers check the captured document revision again before committing it.
export async function fontSelectionOperations(deck: Deck, slideId: string, ids: string[], font: FontChoice, weight?: number, reference?: OnlineFont | null): Promise<Operation[]> {
  const elements = deck.slides.find(s => s.id === slideId)?.elements.filter(e => ids.includes(e.id) && canEditText(e) && !e.locked) ?? [];
  if (!elements.length) return [];
  const stored = deck.onlineFonts?.find(f => f.family === font.family);
  const ref = font.online ? reference ?? stored ?? await onlineReference(font) : null;
  for (const element of elements) {
    const load = async (text: string, requestedWeight: number, italic: boolean) => {
      if (ref) await loadOnlineFont(ref, weight ?? requestedWeight, text || 'Aa', italic ? 'italic' : 'normal');
      else await document.fonts.load(`${italic ? 'italic ' : ''}${weight ?? requestedWeight} 32px ${fontStack(font.family, font.category)}`, text || 'Aa');
    };
    await load(element.text, element.fontWeight, element.italic);
    for (const run of element.paragraphs?.flatMap(p => p.runs) ?? element.runs ?? []) {
      await load(run.text, run.fontWeight ?? (run.bold === true ? 700 : run.bold === false ? 400 : element.fontWeight), run.italic ?? element.italic);
    }
  }
  const view = ref ? {...deck, onlineFonts: [...(deck.onlineFonts ?? []).filter(f => f.family !== font.family), ref]} : deck;
  const operations = fontOperations(view, slideId, ids, font.family);
  if (weight !== undefined) for (const op of operations) if (op.op === 'update_element') {
    op.patch.fontWeight = weight;
    if (op.patch.runs) op.patch.runs = op.patch.runs.map(r => ({...r, bold: undefined, fontWeight: undefined}));
    if (op.patch.paragraphs) op.patch.paragraphs = op.patch.paragraphs.map(p => ({...p, runs: p.runs.map(r => ({...r, bold: undefined, fontWeight: undefined}))}));
  }
  if (ref) operations.unshift({op: 'register_online_font', font: ref});
  return operations;
}

// A document font links only its family; the text role, size and spacing remain independent.
export async function documentFontSelectionOperations(deck:Deck,slideId:string,ids:string[],font:FontChoice):Promise<Operation[]>{
  const elements=deck.slides.find(s=>s.id===slideId)?.elements.filter(e=>ids.includes(e.id)&&canEditText(e)&&!e.locked&&!e.resource&&!e.sourceRegion)??[];
  const operations=await fontSelectionOperations(deck,slideId,elements.map(e=>e.id),font);
  return operations.map(op=>{
    if(op.op!=='update_element')return op;
    const e=elements.find(e=>e.id===op.elementId)!,role=documentFontRole(deck,font.family,e);
    if(!role)return op;
    const design={...e.design,font:role===e.design?.text?undefined:role,overrides:(e.design?.overrides??[]).filter(key=>key!=='fontFamily')};
    if(op.patch.fontWeight!==e.fontWeight&&!design.overrides.includes('fontWeight'))design.overrides.push('fontWeight');
    return {...op,patch:{...op.patch,design}};
  });
}
