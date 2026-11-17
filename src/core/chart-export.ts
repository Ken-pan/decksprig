import type {Deck, SlideElement} from './model';
import {renderChartSvg} from './chart-render';
import {embeddedLibraryFonts} from './fonts';
import {embeddedOnlineFonts} from './online-fonts';

/** A standalone SVG needs its own font faces; it cannot inherit the editor's fonts. */
export async function buildChartSvg(element: SlideElement, deck: Deck, background?: string): Promise<string> {
  const context = {...deck, slides: [{...deck.slides[0], elements: [element]}]};
  const [library, online] = await Promise.all([embeddedLibraryFonts(context), embeddedOnlineFonts(context)]);
  const css = [...library, ...online];
  for (const font of deck.fonts ?? []) if (font.family === element.fontFamily) css.push(`@font-face{font-family:"${font.family.replace(/[";{}<>\\]/g, '')}";src:url(${font.data});font-weight:${font.weight};font-style:${font.style};}`);
  const backdrop=background??deck.slides.find(slide=>slide.elements.some(e=>e.id===element.id))?.background??'#ffffff';
  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return renderChartSvg(element.chart?{...element,chart:{...element.chart,sourceDisplay:'chart'}}:element,false,undefined,backdrop).replace(/(<svg[^>]*>)/, `$1${background ? `<rect width="100%" height="100%" fill="${escape(background)}"/>` : ''}<style type="text/css">${escape(css.join('\n'))}</style>`);
}
