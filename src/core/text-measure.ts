import type { SlideElement } from './model';
import { fontStack } from './font-stack';
import { createTypography } from './typography';
import { scaledTextStyle } from './text-sizing';
import type { TextMeasure } from './auto-layout';

/** Mirrors SlideCanvas text-flow: paragraphs, padding, bullets, rich runs and wrapping. */
export function createTextMeasurer(stack: (family: string) => string = fontStack): TextMeasure & {clear: () => void; destroy: () => void} {
  const {runStyle, paragraphStyle, textBoxStyle} = createTypography(stack);
  const host = document.createElement('div'), flow = document.createElement('div');
  host.setAttribute('aria-hidden', 'true'); host.append(flow);
  const context = document.createElement('canvas').getContext('2d');
  const cache = new Map<string, number>(), descriptors = new WeakMap<SlideElement, string>();
  const measure: TextMeasure & {clear: () => void; destroy: () => void} = Object.assign(
    (text: string, e: SlideElement, size: number) => {
      if (!context) return Array.from(text).length * size;
      context.font = `${e.italic ? 'italic ' : ''}${e.fontWeight} ${size}px ${stack(e.fontFamily)}`;
      return context.measureText(text).width + Math.max(0, Array.from(text).length - 1) * e.letterSpacing;
    }, {clear: () => cache.clear(), destroy: () => {host.remove(); cache.clear();}},
  );
  measure.height = (original, size, width) => {
    let descriptor = descriptors.get(original);
    if (!descriptor) {descriptor = JSON.stringify([original.text, original.fontFamily, original.fontSize, original.fontWeight, original.italic, original.lineHeight, original.letterSpacing, original.padding, original.runs, original.paragraphs, original.wrap, stack(original.fontFamily)]); descriptors.set(original, descriptor);}
    const key = `${size}:${width}:${descriptor}`;
    const cached = cache.get(key); if (cached !== undefined) return cached;
    if (!host.isConnected) document.body.append(host);
    const e = {...original, ...scaledTextStyle(original, size)};
    host.style.cssText = `position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;box-sizing:border-box;overflow:hidden;height:0;width:${Math.max(1, width)}px;${textBoxStyle(e)}justify-content:flex-start;overflow-wrap:break-word;font-family:${stack(e.fontFamily)};font-size:${size}px;font-weight:${e.fontWeight};font-style:${e.italic ? 'italic' : 'normal'};line-height:${e.lineHeight};letter-spacing:${e.letterSpacing}px;`;
    flow.style.cssText = 'width:100%;flex-shrink:0;'; flow.replaceChildren();
    const span = (run: NonNullable<SlideElement['runs']>[number]) => {const node = document.createElement('span'); node.textContent = run.text; node.style.cssText = runStyle(run,e); return node;};
    if (e.paragraphs?.length) for (const p of e.paragraphs) {
      const paragraph = document.createElement('div'); paragraph.style.cssText = paragraphStyle(p, e);
      if (p.bullet) {const bullet = document.createElement('span'); bullet.textContent = `${p.bullet} `; paragraph.append(bullet);}
      paragraph.append(...p.runs.map(span)); flow.append(paragraph);
    } else if (e.runs?.length) flow.append(...e.runs.map(span));
    else flow.textContent = e.text;
    const height = flow.scrollWidth > flow.clientWidth + 1 ? Infinity : flow.scrollHeight + (e.padding?.top ?? 0) + (e.padding?.bottom ?? 0);
    if (cache.size > 8000) cache.clear(); cache.set(key, height);
    return height;
  };
  return measure;
}
