import type { Deck } from './model';
import {loadLibraryTypography} from './font-loading';
import {loadDeckOnlineFonts} from './online-fonts';
import {resolveDeckTextSizingAsync, clearTextSizeCache} from './text-layout';
import {withDocumentFonts} from './document-fonts';

export async function prepareTextSizing(deck: Deck, shouldContinue: () => boolean = () => true): Promise<Deck> {
  if (typeof document === 'undefined') return deck;
  const automatic = {...deck, slides: deck.slides.map(s => ({...s, elements: s.elements.filter(e => e.type === 'text' && e.textSizing && e.textSizing !== 'fixed')}))};
  if (!automatic.slides.some(s => s.elements.length)) return deck;
  return withDocumentFonts(deck.fonts,async()=>{
    await Promise.all([loadLibraryTypography(automatic.slides, deck.fonts,deck.onlineFonts), loadDeckOnlineFonts(automatic)]);
    await document.fonts.ready;
    if (!shouldContinue()) return deck;
    clearTextSizeCache();
    return resolveDeckTextSizingAsync(deck, {shouldContinue});
  });
}
