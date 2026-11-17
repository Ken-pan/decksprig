import {element, PageElementsSchema, type Deck, type Slide, type SlideElement, type PageElements} from './model';
import {deckDesignSystem} from './deck-design-system';
import {isOwnedDocumentData} from './document-revision';

export const DEFAULT_PAGE_ELEMENTS: PageElements = {
  header: '', footer: '', date: '', pageNumbers: true,
  numberFormat: 'padded', startAt: 1, hideOnCover: true, hideOnBreaks: true, divider: false,
};
const BREAK_PAGES = new Set(['section', 'statement', 'close', 'q-and-a']);
export function hidePageElements(slide: Slide, index: number, settings: PageElements) {
  return settings.hideOnCover && (slide.template?.prototype === 'cover' || (!slide.template && index === 0)) ||
    settings.hideOnBreaks === true && BREAK_PAGES.has(slide.template?.prototype ?? '');
}
export function pageElementsSettings(deck: Deck, slide: Slide): PageElements {
  const adopted = adoptTemplate(slide, deck);
  const field = (kind: NonNullable<SlideElement['pageElement']>['kind']) => adopted.elements.find(e => e.pageElement?.kind === kind);
  const saved = slide.pageElements ?? deck.pageElements;
  return saved ? {...saved, header: field('header')?.pageElement?.value ?? saved.header,
    footer: field('footer')?.pageElement?.value ?? saved.footer, date: field('date')?.pageElement?.value ?? saved.date,
    logo: field('logo') ?? saved.logo} :
    {...DEFAULT_PAGE_ELEMENTS, header: field('header')?.pageElement?.value ?? '',
      footer: field('footer')?.pageElement?.value ?? '', date: field('date')?.pageElement?.value ?? '',
      pageNumbers: Boolean(field('page-number')), logo: field('logo')};
}
export function pageElementText(value: string, deck: Deck, slide: Slide, index: number, settings?: PageElements): string {
  const number = index + (settings?.startAt ?? 1);
  return value.replace(/\{(title|section|page|page:02|pages)\}/g, (_, key: string) => ({
    title: deck.title, section: slide.pageSection ?? slide.title ?? deck.title,
    page: String(number), 'page:02': String(number).padStart(2, '0'), pages: String(deck.slides.length),
  })[key]!);
}

/** Only explicit adoption recognizes legacy native template labels; imported objects remain independent. */
function adoptTemplate(slide: Slide, deck: Deck): Slide {
  if (slide.source || !slide.template || slide.elements.some(e => e.pageElement)) return slide;
  const top = slide.elements.find(e => e.type === 'text' && e.y <= deck.height * .09 && e.fontSize <= 24 * Math.min(deck.width / 1440, deck.height / 810));
  const number = slide.elements.find(e => e.type === 'text' && e.y >= deck.height * .9 && /^\d+$/.test(e.text.trim()));
  const footer = slide.elements.find(e => e.type === 'text' && e.y >= deck.height * .9 && ['RESEARCH / STRATEGY / DESIGN','DIRECTION / SCOPE / DELIVERY'].includes(e.text));
  return {...slide, pageSection: slide.pageSection ?? top?.text, elements: slide.elements.map(e => e === top ? {...e, pageElement: {kind: 'header' as const, value: '{section}'}} : e === number ? {...e, pageElement: {kind: 'page-number' as const, value: '{page:02}'}} : e === footer ? {...e, pageElement: {kind:'footer' as const,value:e.text}} : e)};
}

/** Materialized standard objects share the normal rendering, export, selection and undo paths. */
export function setSlidePageElements(deck: Deck, original: Slide, raw: PageElements, index: number): Slide {
  const settings = PageElementsSchema.parse(raw), slide = adoptTemplate(original, deck);
  if (slide.elements.some(e => e.pageElement && e.locked)) throw new Error('Unlock the page elements on this slide before changing them.');
  const system = deckDesignSystem(deck), sx = deck.width / 1440, sy = deck.height / 810, k = Math.min(sx, sy);
  const left = 84 * sx, right = 80 * sx, width = deck.width - left - right;
  const coverImages = slide.template?.prototype === 'cover' ? slide.elements.filter(e => !e.pageElement && e.type === 'image' && e.x > left + 400 * sx && e.w >= deck.width * .25) : [];
  const dark = slide.backgroundStyle === 'dark' || slide.background.toLowerCase() === system.colors.dark.toLowerCase();
  const color = dark ? 'onDark' : 'muted';
  const hidden = hidePageElements(slide, index, settings);
  const additions: SlideElement[] = [];
  function add(kind: NonNullable<SlideElement['pageElement']>['kind'], value: string, attrs: Partial<SlideElement> = {}) {
    const desired = element('text', {name: ({header: 'Slide label', footer: 'Note', 'page-number': 'Page number', date: 'Date', logo: 'Logo', divider: 'Divider'})[kind],
      x: left, y: 764 * sy, w: width, h: 30 * sy, ...system.typography.caption, fontSize: Math.max(4, 16 * k), lineHeight: 1.6, letterSpacing: 0, fontWeight: 400,
      text: pageElementText(value, deck, slide, index, settings), textSizing: 'fixed', wrap: false, clipText: true, hidden,
      fill: system.colors[color], design: {text: 'caption', textScale: 16 / system.typography.caption.fontSize, fill: color, overrides: ['lineHeight', 'letterSpacing', 'fontWeight']},
      ...attrs, pageElement: {kind, value, coverHidden: hidden}});
    const old = slide.elements.find(e => e.pageElement?.kind === kind);
    const e = old ? {...old, text: desired.text, hidden, pageElement: desired.pageElement} : desired;
    if (old && old.text !== desired.text) {delete e.runs; delete e.paragraphs; delete e.nativeTextLayout;}
    if (kind === 'logo') {
      e.src = desired.src; e.resource = desired.resource; e.fit = 'contain'; e.crop = undefined; e.sourceRegion = undefined;
    }
    if (e.type === 'text') {
      e.x = desired.x; e.y = desired.y; e.w = desired.w; e.h = desired.h;
      e.fontSize = desired.fontSize; e.fontFamily = desired.fontFamily; e.fontWeight = desired.fontWeight; e.letterSpacing = 0; e.fill = desired.fill; e.design = desired.design;
      e.lineHeight = 1.6; e.textSizing = 'fixed'; e.wrap = false; e.clipText = true; e.maxLines = 1;
      if (e.design) e.design = {...e.design, overrides: [...new Set([...(e.design.overrides ?? []), 'lineHeight' as const])]};
    }
    if (kind === 'logo' || kind === 'divider') {e.x = desired.x; e.y = desired.y; e.w = desired.w; e.h = desired.h;}
    additions.push(e);
  }
  // Full-height cover artwork owns its region. Keep page details on the paper
  // panel so they retain the template's contrast and do not cover the image.
  const mediaEdges = coverImages.filter(e => e.y <= 750 * sy && e.y + e.h >= 794 * sy).map(e => e.x - 24 * sx);
  const footerBand = Math.min(width, ...mediaEdges.map(edge => edge - left));
  const gap = 24 * sx, numberWidth = settings.pageNumbers ? Math.min(footerBand, (settings.numberFormat === 'total' ? 100 : 60) * sx) : 0;
  const dateWidth = settings.date.trim() ? Math.min(footerBand * .22, 200 * sx) : 0, logoWidth = settings.logo ? Math.min(footerBand * .16, 88 * sx) : 0;
  const textKinds = [settings.header.trim(), settings.footer.trim()].filter(Boolean).length;
  const free = Math.max(1, footerBand - numberWidth - dateWidth - logoWidth - gap * (textKinds + Number(!!numberWidth) + Number(!!dateWidth) + Number(!!logoWidth) - 1));
  const labelWidth = textKinds === 2 ? free * .52 : free, noteWidth = textKinds === 2 ? free * .48 : free;
  let cursor = left;
  if (settings.logo) {add('logo', '', {type: 'image', x: cursor, y: 766 * sy, w: logoWidth, h: 24 * sy, src: settings.logo.src, resource: settings.logo.resource, design: undefined}); cursor += logoWidth + gap;}
  if (settings.header.trim()) {add('header', settings.header, {x: cursor, w: labelWidth}); cursor += labelWidth + gap;}
  if (settings.footer.trim()) add('footer', settings.footer, {x: cursor, w: noteWidth, align: settings.header.trim() ? 'right' : 'left'});
  if (settings.date.trim()) add('date', settings.date, {x: left + footerBand - numberWidth - (numberWidth ? gap : 0) - dateWidth, w: dateWidth, align: 'right'});
  if (settings.pageNumbers) add('page-number', settings.numberFormat === 'total' ? '{page} / {pages}' : settings.numberFormat === 'padded' ? '{page:02}' : '{page}', {x: left + footerBand - numberWidth, w: numberWidth, align: 'right'});
  if (settings.divider) add('divider', '', {type: 'line', y: 752 * sy, w: footerBand, h: 1, fill: 'transparent', stroke: system.colors[dark ? 'onDark' : 'line'], strokeWidth: Math.max(.25, k), design: {stroke: dark ? 'onDark' : 'line'}});
  return {...slide, pageElements: settings, elements: [...slide.elements.filter(e => !e.pageElement), ...additions]};
}

/** Refresh fields after insert, delete, reorder, rename and table continuation without moving authored objects. */
const pageFieldIndices = new WeakMap<SlideElement[], number[]>();
function fieldIndices(elements: SlideElement[]): number[] {
  const cached = pageFieldIndices.get(elements);
  if (cached) return cached;
  const indices: number[] = [];
  for (let i = 0; i < elements.length; i++) if (elements[i].pageElement) indices.push(i);
  // A new revision replaces its element array. Mutable import/SDK input always
  // scans again; only canonical immutable arrays have stable field membership.
  if (isOwnedDocumentData(elements)) pageFieldIndices.set(elements, indices);
  return indices;
}
export function refreshPageElements(deck: Deck): Deck {
  let changed = false;
  const slides = deck.slides.map((slide, index) => {
    const settings = slide.pageElements ?? deck.pageElements;
    let elements: SlideElement[] | undefined;
    fieldIndices(slide.elements).forEach(i => {
      const e = slide.elements[i];
      if (!e.pageElement || e.locked) return;
      const text = pageElementText(e.pageElement.value ?? e.text, deck, slide, index, settings);
      const coverHidden = settings ? hidePageElements(slide, index, settings) : false;
      const hidden = (e.hidden && !e.pageElement.coverHidden) || coverHidden;
      if (e.text === text && e.hidden === hidden && e.pageElement.coverHidden === coverHidden) return;
      changed = true;
      elements ??= [...slide.elements];
      const next = {...e, text, hidden, pageElement: {...e.pageElement, coverHidden}};
      if (e.text !== text) {delete next.runs; delete next.paragraphs; delete next.nativeTextLayout;}
      elements[i] = next;
    });
    return elements ? {...slide, elements} : slide;
  });
  return changed ? {...deck, slides} : deck;
}
