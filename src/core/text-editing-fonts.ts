import type {Deck, SlideElement} from './model';
import {blankSlide} from './model';
import {loadLibraryTypography} from './font-loading';
import {withDocumentFonts} from './document-fonts';
import {loadDeckOnlineFonts} from './online-fonts';
import {nativeTextSpans} from './native-text-render';
import {fontFamilyKey} from './font-stack';

/** Load the actual face and rich ranges before handing the text to the caret.
 * Limit the request to this object, even in a large imported presentation. */
export async function prepareTextEditingFonts(element: SlideElement, deck: Deck) {
  const slide = {...blankSlide(), elements: [{...element, type: 'text' as const}]};
  await withDocumentFonts(deck.fonts, async () => {
    await Promise.all([
      loadLibraryTypography([slide], deck.fonts,deck.onlineFonts),
      deck.onlineFonts?.length ? loadDeckOnlineFonts({...deck, slides: [slide]}) : Promise.resolve(),
    ]);
    if (nativeTextSpans(element)) {
      const runs=element.paragraphs?.flatMap(p=>p.runs)??element.runs??[{text:element.text}];
      const families=new Set(runs.filter(r=>r.text).map(r=>r.fontFamily||element.fontFamily));
      await Promise.all([...families].map(async family=>{
        if ([...document.fonts].some(face=>face.status==='loaded'&&fontFamilyKey(face.family.replaceAll('"',''))===fontFamilyKey(family))) return;
        // FontFaceSet.check also succeeds for missing families via fallback.
        // A local source probe proves an undeclared system face really exists.
        try {await new FontFace('Deck Studio font probe',`local(${JSON.stringify(family)})`).load();}
        catch {throw new Error(`Original font unavailable: ${family}`);}
      }));
    }
  });
}

export function prepareNativeTextFonts(elements: SlideElement[], deck: Deck, ready: (id: string, fingerprint: string) => void) {
  for (const element of elements) {
    const native=nativeTextSpans(element);
    if(native&&!element.locked&&!element.designPattern)void prepareTextEditingFonts(element,deck).then(()=>ready(element.id,native.fingerprint)).catch(()=>{});
  }
}
