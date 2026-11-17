import {importGoogle} from './google';
import {validateDeck,type Deck} from '../core/model';
import {decodeBase64} from '../core/base64';

// Google page JSON omits text insets and some masks. The platform's own PPTX
// export supplies those properties; native page renders remain the reference.
export async function importGoogleBundle(bundle:any):Promise<Deck>{
  if(!bundle.nativePptx){const deck=importGoogle(bundle);if(bundle.googleSource)deck.googleSource=bundle.googleSource;return validateDeck(deck);}
  const bytes=decodeBase64(bundle.nativePptx);
  if(bytes.length>100_000_000)throw new Error('The Google PPTX export exceeds 100 MB. Import fewer slides at a time.');
  const {importPptx} = await import('./pptx');
  const native=await importPptx(bytes,'Google Slides.pptx');
  const deck=importGoogle(bundle);
  const pages=bundle.presentation?.slides ?? [];
  if(native.slides.length!==pages.length)throw new Error('The Google source and PPTX slide counts differ. Export them again.');
  deck.title=bundle.presentation.title || 'Google Slides';
  const normalize=(text:string)=>text.replace(/\s+/g,' ').trim();
  deck.slides.forEach((s,i)=>{
    let enriched=0;
    for(const e of s.elements.filter(e=>e.type==='text')){
      const matches=native.slides[i].elements.filter(v=>v.type==='text'&&normalize(v.text)===normalize(e.text));
      if(!matches.length)continue;
      const distance=(v:typeof e)=>Math.hypot(v.x+v.w/2-e.x-e.w/2,v.y+v.h/2-e.y-e.h/2);
      matches.sort((a,b)=>distance(a)-distance(b));
      if(matches.length>1&&distance(matches[0])>24)continue;
      const m=matches[0];e.padding=m.padding;e.wrap=m.wrap;e.clipText=m.clipText;
      if(e.paragraphs?.length===m.paragraphs?.length)e.paragraphs?.forEach((p,j)=>{if(m.paragraphs![j].endStyle)p.endStyle=m.paragraphs![j].endStyle;});enriched++;
    }
    for(const e of s.elements.filter(e=>e.type==='rect'&&e.radius>0)){
      const matches=native.slides[i].elements.filter(v=>v.type==='rect'&&Math.abs(v.x-e.x)<2&&Math.abs(v.y-e.y)<2&&Math.abs(v.w-e.w)<2&&Math.abs(v.h-e.h)<2);
      if(matches.length===1)e.radius=matches[0].radius;
    }
    s.notes=native.slides[i].notes;
    s.source={...s.source!,label:'Google API + Native PPTX layout',warnings:[...s.source!.warnings.filter(w=>!w.includes('Exact text box margins')),`Native PPTX completed ${enriched}  text box margins and overflow rules. Compare fonts and layout with the source reference.`]};
  });
  deck.provenance={...deck.provenance,provider:'Google Slides',url:bundle.url,importedAt:new Date().toISOString()};
  if(bundle.fonts)deck.fonts=bundle.fonts;
  if(bundle.googleSource)deck.googleSource=bundle.googleSource;
  return validateDeck(deck);
}
