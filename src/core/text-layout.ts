import {sameFontFamily} from './font-stack';
import type { Deck, Slide, SlideElement } from './model';
import { resolveGroupLayouts } from './object-layout';
import { fontStack } from './font-stack';
import { createTypography } from './typography';
import {nativeTextSpans} from './native-text-render';

export type TextSize = {w: number; h: number};
export type TextSizeMeasure = (element: SlideElement, deck: Pick<Deck, 'onlineFonts'>) => TextSize | null;

// Old/imported objects retain their fixed geometry. Explicit manual geometry
// changes leave automatic mode so they cannot be overwritten by a later reflow.
export function manualTextSizing(e: SlideElement, patch: Partial<SlideElement>): Partial<SlideElement> {
  if (e.type !== 'text' || patch.textSizing !== undefined || e.textSizing === 'fixed') return patch;
  if (patch.h !== undefined) return {...patch, textSizing: 'fixed'};
  if (patch.w !== undefined && e.textSizing === 'auto-width') return {...patch, textSizing: 'auto-height'};
  return patch;
}

let host: HTMLDivElement | undefined;
const cache = new Map<string, TextSize>();
let cacheCharacters = 0;
const MAX_CACHE_ENTRIES = 10_000, MAX_CACHE_CHARACTERS = 4_000_000;
let sizeEpoch=0;
export const textSizeEpoch=()=>sizeEpoch;
export function clearTextSizeCache() { cache.clear(); cacheCharacters = 0; sizeEpoch++; }

/** Measure the canvas paragraph/run flow in document pixels, without scaling. */
export function browserTextSize(e:SlideElement,deck:Pick<Deck,'onlineFonts'>):TextSize|null {
  if (typeof document === 'undefined' || e.type !== 'text' || !e.textSizing || e.textSizing === 'fixed') return null;
  const stack = (family: string) => fontStack(family, deck.onlineFonts?.find(f => sameFontFamily(f.family,family))?.category);
  const typography=createTypography(stack),intrinsic=e.textSizing==='auto-width';
  const boxStyle = `position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;box-sizing:border-box;height:auto;width:${intrinsic ? 'max-content' : e.w + 'px'};${typography.textBoxStyle(e)}justify-content:flex-start;font-family:${stack(e.fontFamily)};font-size:${e.fontSize}px;font-weight:${e.fontWeight};font-style:${e.italic ? 'italic' : 'normal'};line-height:${e.lineHeight};letter-spacing:${e.letterSpacing}px;overflow-wrap:break-word;`;
  const flowStyle=typography.textFlowStyle(e)+(intrinsic?'width:max-content;':'');
  const key=JSON.stringify([boxStyle,flowStyle,e.text,e.runs,e.paragraphs,e.paragraphSpacingAtEdges,deck.onlineFonts?.map(font=>[font.family,font.category])]);
  const cached = cache.get(key); if (cached) { cache.delete(key); cache.set(key, cached); return cached; }
  if (!host) {
    host = document.createElement('div'); host.setAttribute('aria-hidden', 'true');
    document.fonts?.addEventListener('loadingdone', clearTextSizeCache);
  }
  if (!host.isConnected) document.body.append(host);
  const flow=browserTextSize.render(host,e,typography,boxStyle,flowStyle);
  const rect = host.getBoundingClientRect();
  const bound = (n: number) => Math.min(20000, Math.max(1, Math.ceil(n * 10) / 10));
  // CJK and display glyphs can extend below a short line box. Include their
  // scroll extent so fitted native text is not clipped after the font loads.
  const padding=e.padding?.top??0,bottom=e.padding?.bottom??0;
  const size = {w: intrinsic ? bound(rect.width) : e.w, h: bound(Math.max(rect.height,flow.scrollHeight+padding+bottom))};
  // Keep useful measurements instead of clearing the whole cache mid-document.
  // Bound both entry count and retained text/style key size.
  if (key.length <= MAX_CACHE_CHARACTERS) {
    cache.set(key, size); cacheCharacters += key.length;
    while (cache.size > MAX_CACHE_ENTRIES || cacheCharacters > MAX_CACHE_CHARACTERS) {
      const oldest = cache.keys().next().value!; cacheCharacters -= oldest.length; cache.delete(oldest);
    }
  }
  return size;
}

// A complete synchronous fallback also serves callers before the canvas loads.
browserTextSize.render=(host:HTMLDivElement,e:SlideElement,typography:ReturnType<typeof createTypography>,boxStyle:string,flowStyle:string)=>{
  host.style.cssText=boxStyle;const {runStyle,paragraphStyle}=typography;
  const flow = document.createElement('div'); flow.style.cssText = flowStyle;
  const span = (run: NonNullable<SlideElement['runs']>[number]) => {const node = document.createElement('span'); node.textContent = run.text; node.style.cssText = runStyle(run,e); return node;};
  if (e.paragraphs?.length) for (const p of e.paragraphs) {
    const paragraph = document.createElement('div'); paragraph.className='text-paragraph'; paragraph.style.cssText = paragraphStyle(p, e);
    if (p.bullet) {const bullet = document.createElement('span'); bullet.textContent = `${p.bullet} `; paragraph.append(bullet);}
    paragraph.append(...p.runs.map(span)); flow.append(paragraph);
  } else if (e.runs?.length) flow.append(...e.runs.map(span));
  else flow.textContent = e.text || '\u200b';
  host.replaceChildren(flow);
  return flow;
};

export function resolveTextElement(e: SlideElement, deck: Pick<Deck, 'onlineFonts'>, measure: TextSizeMeasure = browserTextSize): SlideElement {
  if (e.type !== 'text' || !e.textSizing || e.textSizing === 'fixed') return e;
  if(nativeTextSpans(e))return e;
  const size = measure(e, deck); if (!size) return e;
  const w = e.textSizing === 'auto-width' ? size.w : e.w, h = size.h;
  return e.w === w && e.h === h ? e : {...e, w, h};
}
export function resolveSlideTextSizing(slide: Slide, deck: Pick<Deck, 'onlineFonts'>, measure: TextSizeMeasure = browserTextSize): Slide {
  const elements = slide.elements.map(e => resolveTextElement(e, deck, measure));
  return resolveGroupLayouts(elements.every((e, i) => e === slide.elements[i]) ? slide : {...slide, elements}, false, e=>resolveTextElement(e,deck,measure));
}
export function resolveDeckTextSizing(deck: Deck, measure: TextSizeMeasure = browserTextSize): Deck {
  const slides = deck.slides.map(s => resolveSlideTextSizing(s, deck, measure));
  return slides.every((s, i) => s === deck.slides[i]) ? deck : {...deck, slides};
}

// Editing only needs the current page's measured geometry. Measuring hidden
// pages here can turn a single keystroke into thousands of forced layouts.
export function resolveActiveTextSizing(deck: Deck, activeId: string, measure: TextSizeMeasure = browserTextSize): Deck {
  const index = Math.max(0, deck.slides.findIndex(s => s.id === activeId));
  const slide = resolveSlideTextSizing(deck.slides[index], deck, measure);
  if (slide === deck.slides[index]) return deck;
  const slides = [...deck.slides]; slides[index] = slide;
  return {...deck, slides};
}

export function yieldForInput(): Promise<void> {
  const scheduler = (globalThis as typeof globalThis & {scheduler?: {yield?: () => Promise<void>}}).scheduler;
  return scheduler?.yield ? scheduler.yield() : new Promise(resolve => setTimeout(resolve, 0));
}

type TextSizingOptions = {
  measure?: TextSizeMeasure;
  shouldContinue?: () => boolean;
  yieldControl?: () => Promise<void>;
  now?: () => number;
  budgetMs?: number;
};
// Saving/export still resolve every automatic text object. Work on an immutable
// captured revision and yield between small batches so input can keep running.
export async function resolveDeckTextSizingAsync(deck: Deck, options: TextSizingOptions = {}): Promise<Deck> {
  const {measure = browserTextSize, shouldContinue = () => true, yieldControl = yieldForInput,
    now = () => performance.now(), budgetMs = 8} = options;
  const slides: Slide[] = []; let deadline = now() + budgetMs;
  for (const slide of deck.slides) {
    const elements: SlideElement[] = [];
    for (const element of slide.elements) {
      if (!shouldContinue()) return deck;
      elements.push(resolveTextElement(element, deck, measure));
      if (now() >= deadline) { await yieldControl(); deadline = now() + budgetMs; }
    }
    slides.push(resolveGroupLayouts(elements.every((e, i) => e === slide.elements[i]) ? slide : {...slide, elements}, false, e=>resolveTextElement(e,deck,measure)));
  }
  if (!shouldContinue()) return deck;
  return slides.every((s, i) => s === deck.slides[i]) ? deck : {...deck, slides};
}

