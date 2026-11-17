import {BRAND_NAME} from '../brand-name.js';
import { element, newDeck, blankSlide, validateDeck, type Deck, type Slide } from '../core/model';
import { importFigma } from './figma';
import { importGoogle } from './google';
import { importPortfolioDeck } from './portfolio';
import {readDocumentFile,DOCUMENT_FILE_SCHEMA} from '../core/document-file';

export { importFigma } from './figma';
export { importGoogle } from './google';
export { importPortfolioDeck as importLegacySlides } from './portfolio';
export function importBroadser(raw: any): Deck {
  const data = raw.broadser === 'boards' ? raw.boards?.[0]?.data : raw;
  if (!data?.cards) throw new Error('This is not a Broadser board file.');
  const slides: Slide[] = [];
  const visit = (cards: any[]) => {
    for (const c of cards) {
      if (c.type === 'board' && c.board?.cards) { visit(c.board.cards); continue; }
      if (['comment', 'sticker', 'frame'].includes(c.type)) continue;
      const heading=c.title || c.text?.slice(0, 50) || `Material ${slides.length + 1}`,s = blankSlide();
      const text = String(c.text || c.body || c.content || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      s.elements.push(element('text', {x: 96, y: 110, w: 1240, h: 130, fontSize: 56, fontWeight: 600, text: heading}));
      if (c.type === 'image' && typeof (c.src || c.url) === 'string') s.elements.push(element('image', {x: 96, y: 280, w: 1248, h: 410, src: c.src || c.url, fit: 'contain'}));
      else s.elements.push(element('text', {x: 96, y: 300, w: 1180, h: 380, fontSize: 32, text: text || c.url || 'Add content'}));
      s.notes = c.url ? `Source: ${c.url}` : '';
      s.source = {provider: 'Broadser', fidelity: 'converted', warnings: ['Board content is converted into slides. The original Broadser canvas layout is not reproduced.']};
      slides.push(s);
    }
  };
  visit(data.cards);
  if (!slides.length) throw new Error('This board has no content to convert.');
  const d = newDeck(data.board?.name || raw.name || 'Broadser material', slides); d.provenance = {provider: 'Broadser', importedAt: new Date().toISOString()}; return d;
}
export function importJson(raw: any): Deck {
  if(raw?.schema===DOCUMENT_FILE_SCHEMA)return readDocumentFile(raw);
  if(typeof raw?.schema==='string'&&raw.schema.startsWith('deck-studio/file-'))throw new Error(`This Deck file uses a newer format. Update ${BRAND_NAME} to open it.`);
  if (raw.schema === 'deck-studio/1') return validateDeck(raw);
  if (raw.kind === 'figma-rest') return importFigma(raw);
  if (raw.kind === 'google-rest') return importGoogle(raw);
  if (raw.cards || raw.broadser === 'boards') return importBroadser(raw);
  if (Array.isArray(raw) || raw.slides) return importPortfolioDeck(raw);
  throw new Error('Unsupported JSON file.');
}
