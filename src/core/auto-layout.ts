import {contentBounds,pageLayout} from './page-layout-geometry';
import type { Deck, Slide, SlideElement } from './model';
import { applyOperations, ProposalSchema, type Operation, type Proposal } from './operations';
import { scaledTextStyle } from './text-sizing';
import { assessLayout, layoutRegressions, equivalentComposition, tableHeight } from './layout-quality';
import { layoutObjectRole, layoutText, layoutContentSignature, isLayoutHeading } from './layout-content';
import {sameDocumentData} from './document-data';
import {ancestorIds,descendants} from './container-tree';

export const AUTO_LAYOUTS = [
  {id: 'story', name: 'Clear narrative', description: 'Lead with a title, then let the content flow'},
  {id: 'split', name: 'Side by side', description: 'Explain on the left and show evidence on the right'},
  {id: 'grid', name: 'Ordered grid', description: 'Divide space evenly for browsing and comparison'},
  {id: 'focus', name: 'Focused composition', description: 'Emphasize key content with generous space'},
] as const;
export type AutoLayoutId = typeof AUTO_LAYOUTS[number]['id'];
export type LayoutChoiceId = AutoLayoutId | 'original';
export type LayoutSuggestion = Omit<LayoutCandidate, 'id'> & {id: LayoutChoiceId; reasons?: string[]};
export const LAYOUT_STYLES = [
  {id: 'original', name: 'Current', detail: 'Existing fonts'},
  {id: 'modern', name: 'Modern', detail: 'Sans serif'},
  {id: 'editorial', name: 'Editorial', detail: 'Serif headings'},
] as const;
export type LayoutStyle = typeof LAYOUT_STYLES[number]['id'];
export type LayoutOptions = {spacing: 'compact' | 'balanced' | 'airy'; fitText: boolean; consistentType?: boolean; style?: LayoutStyle; emphasis?: 'balanced' | 'image' | 'text'};
export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {spacing: 'balanced', fitText: true, consistentType: true, style: 'original', emphasis: 'balanced'};
type Box = {x: number; y: number; w: number; h: number};
type Unit = Box & {elements: SlideElement[]; kind: 'text' | 'visual'};
export type TextMeasure = ((text: string, element: SlideElement, size: number) => number) & {height?: (element: SlideElement, size: number, width: number) => number; aspect?: (element: SlideElement) => number | undefined; imageStatus?: (element: SlideElement) => 'ready' | 'loading' | 'failed'};
export type LayoutIssue = {slideId: string; message: string};
export type LayoutCandidate = {
  id: AutoLayoutId; slide: Slide; operations: Operation[]; issues: LayoutIssue[];
  moved: number; fitted: number; preserved: number; units: number; recommended: boolean;
  imageShare?: number;
};
const round = (n: number) => Math.round(n * 100) / 100;
const box = (es: SlideElement[]): Box => {
  const x = Math.min(...es.map(e => e.x)), y = Math.min(...es.map(e => e.y));
  return {x, y, w: Math.max(...es.map(e => e.x + e.w)) - x, h: Math.max(...es.map(e => e.y + e.h)) - y};
};
const intersects = (a: Box, b: Box) => a.x < b.x + b.w - .5 && a.x + a.w > b.x + .5 && a.y < b.y + b.h - .5 && a.y + a.h > b.y + .5;
const contains = (a: Box, b: Box) => a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h;
function rotatedBounds(e: SlideElement): Box {
  const angle = e.rotation * Math.PI / 180, w = Math.abs(e.w * Math.cos(angle)) + Math.abs(e.h * Math.sin(angle)), h = Math.abs(e.w * Math.sin(angle)) + Math.abs(e.h * Math.cos(angle));
  return {x: e.x + (e.w - w) / 2, y: e.y + (e.h - h) / 2, w, h};
}
const surface = (e: SlideElement, deck: Pick<Deck, 'width' | 'height'>) => e.type === 'rect' && e.w * e.h >= deck.width * deck.height * .7;
const chrome = (e: SlideElement, deck: Pick<Deck, 'width' | 'height'>) => e.type === 'text' && e.fontSize <= 22 * Math.min(deck.width / 1440, deck.height / 810) && (e.y + e.h <= deck.height * .12 || e.y >= deck.height * .82);

/** Groups are indivisible. A locked, hidden or rotated member protects the whole group. */
function contentUnits(deck: Pick<Deck, 'width' | 'height'>, slide: Slide) {
  const roles = new Map(slide.elements.map(e => [e.id, layoutObjectRole(e, deck)]));
  const flowMembers=new Set((slide.autoLayouts??[]).flatMap(l=>descendants(slide,ancestorIds(slide,l.id).at(-1)??l.id).map(e=>e.id)));
  const protectedGroups = new Set(slide.elements.filter(e => e.locked || e.hidden || e.opacity === 0 || e.rotation !== 0 || roles.get(e.id) === 'source' || (roles.get(e.id) === 'empty' && e.type !== 'text')).map(e => e.group).filter(Boolean));
  const fixed: SlideElement[] = [], buckets = new Map<string, SlideElement[]>();
  for (const e of slide.elements) {
    const role = roles.get(e.id)!;
    if (e.pageElement || flowMembers.has(e.id) || e.locked || e.hidden || e.opacity === 0 || e.rotation !== 0 || role === 'source' || (e.group && protectedGroups.has(e.group)) || surface(e, deck) || (!e.group && (chrome(e, deck) || role === 'auxiliary' || role === 'empty'))) { fixed.push(e); continue; }
    const key = e.group || e.id;
    buckets.set(key, [...(buckets.get(key) ?? []), e]);
  }
  // Keep a visual frame and its existing contents together, without changing group IDs.
  const frames = [...buckets.entries()].filter(([, es]) => es.length === 1 && ['rect', 'ellipse'].includes(es[0].type));
  for (const [key, es] of frames.sort((a, b) => a[1][0].w * a[1][0].h - b[1][0].w * b[1][0].h)) {
    if (!buckets.has(key)) continue;
    for (const [other, members] of [...buckets]) {
      if (key === other || members.some(e => e.group) || !contains(es[0], box(members))) continue;
      buckets.set(key, [...buckets.get(key)!, ...members]); buckets.delete(other);
    }
  }
  // Preserve repeated caption/frame pairs and editorial columns as reading units.
  const scale = Math.min(deck.width / 1440, deck.height / 810);
  const visualBuckets = [...buckets.entries()].filter(([, es]) => es.some(e => ['image', 'prototype', 'rect', 'ellipse', 'chart', 'table'].includes(e.type)));
  for (const [key, es] of visualBuckets) {
    const frame = box(es);
    for (const [captionKey, captions] of [...buckets]) {
      const caption = captions[0];
      if (captions.length !== 1 || caption.group || caption.type !== 'text' || caption.fontSize > 28 * scale || layoutText(caption).length > 180) continue;
      const above = visualBuckets.length > 1 && caption.y + caption.h <= frame.y && frame.y - caption.y - caption.h < 64 * scale;
      const below = es.some(e => e.type === 'image') && caption.y >= frame.y + frame.h && caption.y - frame.y - frame.h < 40 * scale;
      if ((above || below) && Math.abs(caption.x - frame.x) <= 24 * scale && Math.abs(caption.w / frame.w - 1) < .3) {
        buckets.set(key, [...buckets.get(key)!, caption]); buckets.delete(captionKey);
      }
    }
  }
  // Bare shapes are ambiguous decoration or diagram parts, never standalone evidence.
  for (const [key, es] of buckets) if (es.every(e => roles.get(e.id) !== 'content')) {
    fixed.push(...es); buckets.delete(key);
  }
  const standalone = [...buckets.entries()].filter(([, es]) => es.length === 1 && es[0].type === 'text' && !es[0].group);
  const mainTitle = [...standalone].filter(([, es]) => isLayoutHeading(es[0], scale)).sort((a, b) => b[1][0].fontSize - a[1][0].fontSize)[0]?.[0];
  const columns: [string, SlideElement[]][][] = [];
  for (const entry of standalone.filter(([key]) => key !== mainTitle).sort((a, b) => a[1][0].y - b[1][0].y)) {
    const e = entry[1][0];
    const column = columns.find(items => {
      const last = items.at(-1)![1][0];
      return Math.abs(last.x - e.x) <= 24 * scale && Math.abs(e.w / last.w - 1) < .3 && e.y >= last.y + last.h && e.y - last.y - last.h < 96 * scale;
    });
    if (column) column.push(entry); else columns.push([entry]);
  }
  const repeated = columns.filter(items => items.length >= 2);
  if (repeated.length >= 2) for (const items of repeated) {
    const key = items[0][0]; buckets.set(key, items.flatMap(([, es]) => es));
    for (const [other] of items.slice(1)) buckets.delete(other);
  }
  const units: Unit[] = [...buckets.values()].map(elements => ({...box(elements), elements, kind: elements.some(e => roles.get(e.id) === 'content' && e.type !== 'text') || elements.some(e => roles.get(e.id) === 'frame') ? 'visual' : 'text'}));
  units.sort((a, b) => Math.abs(a.y - b.y) > 16 ? a.y - b.y : a.x - b.x);
  return {units, fixed};
}
function headingUnit(units: Unit[], deck: Pick<Deck, 'width' | 'height'>) {
  const scale = Math.min(deck.width / 1440, deck.height / 810);
  return units.filter(u => u.kind === 'text' && u.elements.length === 1 && isLayoutHeading(u.elements[0], scale))
    .sort((a, b) => b.elements[0].fontSize - a.elements[0].fontSize || a.y - b.y)[0];
}
export function analyzeLayout(deck: Pick<Deck, 'width' | 'height'>, slide: Slide) {
  const {units, fixed} = contentUnits(deck, slide);
  const text = units.filter(u => u.kind === 'text').length, visuals = units.length - text;
  const columns = units.filter(u => u.kind === 'text' && u.elements.length > 1).length;
  const recommended: AutoLayoutId = visuals >= 3 || (visuals >= 2 && text <= 1) || columns >= 2 ? 'grid' : visuals === 1 && text === 1 ? 'story' : visuals > 0 && text > 0 ? 'split' : units.length <= 2 ? 'focus' : 'story';
  return {text, visuals, units: units.length, preserved: fixed.length, recommended};
}

const approximate: TextMeasure = (text, e, size) => Array.from(text).reduce((sum, c) => sum + size * (/[^\u0000-\u00ff]/u.test(c) ? 1 : /[MW@]/.test(c) ? .88 : /[il.,' ]/.test(c) ? .3 : .58) + e.letterSpacing, 0);
function textHeight(e: SlideElement, size: number, width: number, measure: TextMeasure) {
  if (measure.height) return measure.height(e, size, width);
  let lines = 0;
  const ratio = size / e.fontSize;
  // Use the widest styled run as a conservative measurement for imported rich text.
  const rich = e.runs?.length ? {...e, fontWeight: e.runs.some(r => r.bold) ? 700 : e.fontWeight, fontFamily: e.runs.find(r => r.fontFamily)?.fontFamily ?? e.fontFamily} : e;
  const largest = Math.max(size, ...(e.runs ?? []).map(r => (r.fontSize ?? e.fontSize) * ratio));
  for (const paragraph of layoutText(e).split('\n')) {
    lines++; let used = 0;
    const tokens = paragraph.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[^\S\n]+|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu) ?? [];
    for (const token of tokens) {
      const tokenW = measure(token, rich, largest);
      if (used && used + tokenW > width) { lines++; used = 0; }
      if (tokenW <= width) used += tokenW;
      else for (const char of Array.from(token)) {
        const charW = measure(char, rich, largest);
        if (used && used + charW > width) { lines++; used = 0; }
        used += charW;
      }
    }
  }
  return lines * largest * e.lineHeight;
}
function fitFont(e: SlideElement, target: Box, desired: number, minimum: number, measure: TextMeasure) {
  const fits = (size: number) => textHeight(e, size, Math.max(1, target.w - 6), measure) <= target.h - 4;
  if (fits(desired)) return {size: desired, fits: true};
  if (!fits(minimum)) return {size: minimum, fits: false};
  let lo = minimum, hi = desired;
  for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
  return {size: Math.floor(lo * 10) / 10, fits: true};
}

/** Find a content rectangle that avoids fixed foreground objects. */
function safeArea(area: Box, fixed: SlideElement[], deck: Pick<Deck, 'width' | 'height'>, gap: number): Box {
  let choices = [area];
  for (const e of fixed.filter(e => layoutObjectRole(e, deck) !== 'empty' && !surface(e, deck) && !chrome(e, deck) && e.type !== 'line')) {
    const bounds = rotatedBounds(e);
    const obstacle = {x: bounds.x - gap / 2, y: bounds.y - gap / 2, w: bounds.w + gap, h: bounds.h + gap};
    choices = choices.flatMap(a => {
      if (!intersects(a, obstacle)) return [a];
      return [
        {...a, w: obstacle.x - a.x}, {...a, x: obstacle.x + obstacle.w, w: a.x + a.w - obstacle.x - obstacle.w},
        {...a, h: obstacle.y - a.y}, {...a, y: obstacle.y + obstacle.h, h: a.y + a.h - obstacle.y - obstacle.h},
      ].filter(b => b.w > 0 && b.h > 0 && contains(a, b));
    }).sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 64);
  }
  return choices[0] ?? {...area, w: 0, h: 0};
}
function grid(units: Unit[], area: Box, gap: number, columns: number): [Unit, Box][] {
  if (!units.length) return [];
  columns = Math.min(columns, units.length);
  const rows = Math.ceil(units.length / columns), w = (area.w - (columns - 1) * gap) / columns, h = (area.h - (rows - 1) * gap) / rows;
  return units.map((u, i) => [u, {x: area.x + i % columns * (w + gap), y: area.y + Math.floor(i / columns) * (h + gap), w, h}]);
}
function textSize(e: SlideElement, isTitle: boolean, scale: number, options: LayoutOptions) {
  if (options.consistentType !== false && (isTitle ? e.fontSize >= 30 * scale : e.fontSize >= 26 * scale)) return (isTitle ? options.style === 'modern' ? 60 : options.style === 'editorial' ? 64 : 56 : 28) * scale;
  return e.fontSize;
}
function requiredHeight(unit: Unit, width: number, scale: number, options: LayoutOptions, measure: TextMeasure, isTitle = false) {
  if (unit.elements.length === 1 && unit.kind === 'text') return textHeight(unit.elements[0], textSize(unit.elements[0], isTitle, scale, options), width - 6, measure) + 8 * scale;
  if (unit.kind === 'text' && unit.elements.every(e => e.sourceId?.startsWith('portfolio:'))) return unit.elements.reduce((h, e) => h + textHeight(e, Math.min(e.fontSize, (e.name.includes('Label') ? 18 : e.name.includes('Description') ? 22 : e.name === 'Section heading' ? 28 : 24) * scale), width - 6, measure) + 4 * scale, 0) + (unit.elements.length - 1) * 8 * scale;
  return unit.h * Math.min(1, width / unit.w);
}
function readingStack(units: Unit[], area: Box, gap: number, scale: number, options: LayoutOptions, measure: TextMeasure): [Unit, Box][] {
  if (!units.length) return [];
  const available = Math.max(1, area.h - gap * (units.length - 1));
  const needs = units.map(u => {
    const height = requiredHeight(u, area.w, scale, options, measure);
    return Math.max(20 * scale, Number.isFinite(height) ? height : available);
  });
  const total = needs.reduce((a, b) => a + b, 0);
  let y = area.y;
  return units.map((u, i) => {const h = total <= available ? needs[i] : available * needs[i] / total; const target = {...area, y, h}; y += h + gap; return [u, target];});
}
function contentPlan(units: Unit[], title: Unit | undefined, id: AutoLayoutId, area: Box, gap: number, scale: number, options: LayoutOptions, measure: TextMeasure): [Unit, Box][] {
  const rest = units.filter(u => u !== title), visuals = rest.filter(u => u.kind === 'visual'), texts = rest.filter(u => u.kind === 'text');
  const placements: [Unit, Box][] = [];
  let remaining = {...area};
  if (title) {
    const width = id === 'focus' ? area.w * .88 : area.w;
    const wanted = requiredHeight(title, width, scale, options, measure, true);
    const minimum = id === 'focus' && options.style !== 'modern' ? area.h * .35 : id === 'grid' ? 80 * scale : 96 * scale;
    const titleH = rest.length ? Math.min(area.h * .55, Math.max(minimum, wanted)) : area.h;
    placements.push([title, {...area, x: area.x + (area.w - width) / 2, w: width, h: titleH}]);
    remaining = {...area, y: area.y + titleH + gap, h: area.h - titleH - gap};
  }
  if (!rest.length) return placements;
  const lead = texts.find(u => u.elements.length === 1 && (u.elements[0].name === 'Body text' || u.elements[0].text.length > 65)) ?? (texts.length === 1 && texts[0].elements.length === 1 ? texts[0] : undefined);
  const columns = (n: number) => n <= 4 ? n : 3;
  const consumeLead = () => {
    if (!lead) return;
    const h = Math.min(remaining.h * (options.emphasis === 'image' ? .32 : options.emphasis === 'text' ? .46 : .38), Math.max(42 * scale, requiredHeight(lead, remaining.w, scale, options, measure)));
    placements.push([lead, {...remaining, h}]);
    remaining = {...remaining, y: remaining.y + h + gap, h: remaining.h - h - gap};
  };
  if (id === 'split' && visuals.length) {
    if (texts.length > 1) consumeLead();
    const columnText = texts.filter(u => !(texts.length > 1 && u === lead));
    if (!columnText.length) return [...placements, ...grid(visuals, remaining, gap, visuals.length > 2 ? 2 : 1)];
    const textLength = columnText.reduce((n, u) => n + u.elements.reduce((sum, e) => sum + e.text.length, 0), 0);
    const fraction = Math.max(.3, Math.min(.65, (textLength > 350 ? .52 : .39) + (options.emphasis === 'image' ? -.09 : options.emphasis === 'text' ? .12 : 0)));
    const left = {...remaining, w: (remaining.w - gap) * fraction};
    const right = {...remaining, x: left.x + left.w + gap, w: remaining.w - left.w - gap};
    placements.push(...readingStack(columnText, left, gap * .6, scale, options, measure), ...grid(visuals, right, gap, visuals.length > 2 ? 2 : 1));
  } else if (id === 'story' && visuals.length && texts.length <= 1) {
    consumeLead();
    placements.push(...grid(visuals, remaining, gap, visuals.length > 1 ? 2 : 1));
    placements.push(...grid(texts.filter(u => u !== lead), remaining, gap, 1));
  } else if (id === 'grid') {
    if (rest.length > 2 && lead) consumeLead();
    const cells = rest.filter(u => !(rest.length > 2 && u === lead));
    const longDescription = cells.find(u => u.kind === 'text' && u.elements.every(e => e.sourceId?.startsWith('portfolio:')) && u.elements.reduce((n, e) => n + e.text.length, 0) > 230);
    if (longDescription && cells.length >= 3 && cells.length <= 4) {
      const minimumH = longDescription.elements.reduce((n, e) => n + textHeight(e, Math.min(e.fontSize, (e.name.includes('Label') ? 16 : 20) * scale), remaining.w - 6, measure) + 4 * scale, 0) + Math.max(0, longDescription.elements.length - 1) * 8 * scale;
      const descriptionH = Math.max(70 * scale, minimumH + 4 * scale), rowGap = gap * .6;
      if (Number.isFinite(descriptionH) && descriptionH + rowGap + 100 * scale <= remaining.h) {
        const upper = {...remaining, h: remaining.h - descriptionH - rowGap};
        placements.push(...grid(cells.filter(u => u !== longDescription), upper, gap, cells.length - 1));
        placements.push([longDescription, {...remaining, y: remaining.y + upper.h + rowGap, h: descriptionH}]);
        return placements;
      }
    }
    const count = visuals.length >= 2 ? 2 : columns(cells.length);
    placements.push(...grid(cells, remaining, gap, count));
  } else if (id === 'split') {
    const left = {...remaining, w: (remaining.w - gap) * .46};
    placements.push(...grid(rest.slice(0, 1), left, gap, 1), ...grid(rest.slice(1), {...remaining, x: left.x + left.w + gap, w: remaining.w - left.w - gap}, gap, 1));
  } else {
    if (id === 'story' && rest.length > 2 && lead) consumeLead();
    const cells = rest.filter(u => !(id === 'story' && rest.length > 2 && u === lead));
    placements.push(...grid(cells, remaining, gap, id === 'focus' ? Math.min(2, cells.length) : columns(cells.length)));
  }
  return placements;
}
function semanticGeometry(unit: Unit, target: Box, scale: number, options: LayoutOptions, measure: TextMeasure): Map<string, {box: Box; size?: number}> | null {
  if (unit.elements.length < 2 || !unit.elements.every(e => e.sourceId?.startsWith('portfolio:'))) return null;
  const images = unit.elements.filter(e => e.type === 'image'), texts = unit.elements.filter(e => e.type === 'text');
  if (images.length > 1 || images.length + texts.length !== unit.elements.length) return null;
  const result = new Map<string, {box: Box; size?: number}>(), smallGap = 8 * scale;
  const sizes = texts.map(e => Math.min(e.fontSize, (e.name.includes('Label') || e.name === 'Evidence caption' ? 18 : e.name.includes('Description') ? 22 : e.name === 'Design title' ? 24 : 28) * scale));
  const minimum = texts.map((e, i) => Math.min(sizes[i], (e.name.includes('Label') || e.name === 'Evidence caption' ? 16 : 20) * scale));
  const textBudget = images.length ? Math.min(target.h * .36, Math.max(32 * scale, target.h - 80 * scale)) : target.h;
  const total = (factor: number) => texts.reduce((n, e, i) => n + textHeight(e, Math.max(minimum[i], sizes[i] * factor), target.w - 6, measure) + 4 * scale, 0) + Math.max(0, texts.length - 1) * smallGap;
  let factor = 1;
  if (options.fitText && total(1) > textBudget) {
    let low = 0, high = 1;
    for (let i = 0; i < 12; i++) {const mid = (low + high) / 2; if (total(mid) <= textBudget) low = mid; else high = mid;}
    factor = low;
  }
  const textH = Math.min(textBudget, total(factor));
  let y = target.y;
  if (images.length) {
    const image = images[0], area = {...target, h: Math.max(1, target.h - textH - smallGap)};
    const aspect = image.fit === 'contain' && !image.crop ? measure.aspect?.(image) ?? image.w / image.h : image.w / image.h;
    const w = Math.min(area.w, area.h * aspect), h = w / aspect;
    result.set(image.id, {box: {x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w, h}});
    y = target.y + area.h + smallGap;
  }
  texts.forEach((e, i) => {
    const size = Math.max(minimum[i], sizes[i] * factor), natural = textHeight(e, size, target.w - 6, measure) + 4 * scale;
    const h = Math.max(1, Math.min(natural, target.y + target.h - y));
    result.set(e.id, {box: {x: target.x, y: Math.min(y, target.y + target.h - 1), w: target.w, h}, size}); y += h + smallGap;
  });
  return result;
}

/** Visual direction is opt-in. Content, color and imported rich-text semantics remain intact. */
function directionPatch(e: SlideElement, heading: boolean, style: LayoutStyle): Partial<SlideElement> {
  const family = heading && style === 'editorial' ? 'Bodoni Moda' : 'Manrope';
  const withFamily = (r: NonNullable<SlideElement['runs']>[number]) => ({...r, fontFamily: family});
  return {fontFamily: family, fontWeight: heading ? style === 'modern' ? 600 : 400 : e.fontWeight,
    lineHeight: heading ? style === 'modern' ? 1.08 : 1.12 : Math.max(1.3, e.lineHeight),
    letterSpacing: heading ? -e.fontSize * (style === 'modern' ? .025 : .015) : e.letterSpacing,
    ...(e.runs ? {runs: e.runs.map(withFamily)} : {}),
    ...(e.paragraphs ? {paragraphs: e.paragraphs.map(p => ({...p, runs: p.runs.map(withFamily)}))} : {}),
  };
}

export function createLayoutCandidate(deck: Deck, slideId: string, id: AutoLayoutId, options = DEFAULT_LAYOUT_OPTIONS, measure: TextMeasure = approximate): LayoutCandidate {
  const original = deck.slides.find(s => s.id === slideId);
  if (!original) throw new Error('This slide no longer exists.');
  let slide = original;
  const direction = options.style ?? 'original', styled = new Map<string, Partial<SlideElement>>();
  if (direction !== 'original') {
    const {units} = contentUnits(deck, original);
    const headline = headingUnit(units, deck);
    for (const unit of units) for (const e of unit.elements) if (e.type === 'text') styled.set(e.id, directionPatch(e, unit === headline, direction));
    slide = {...original, elements: original.elements.map(e => styled.has(e.id) ? {...e, ...styled.get(e.id)} : e)};
  }
  const {units, fixed} = contentUnits(deck, slide), info = analyzeLayout(deck, slide);
  const result: LayoutCandidate = {id, slide: JSON.parse(JSON.stringify(slide)), operations: [], issues: [], moved: 0, fitted: 0, preserved: fixed.length, units: units.length, recommended: info.recommended === id};
  const issue = (message: string) => result.issues.push({slideId, message});
  if (!units.length) return result;
  if (units.length > 24) { issue('This slide has too much content. Group related objects or split it into multiple slides.'); return result; }
  const scale = Math.min(deck.width / 1440, deck.height / 810), spacing = {compact: .7, balanced: 1, airy: 1.4}[options.spacing];
  const reading=contentBounds(deck,slide),configured=pageLayout(deck,slide);
  const gap = slide.layout?configured.gutter:28 * scale * spacing;
  const chromeText = fixed.filter(e => layoutObjectRole(e, deck) !== 'empty' && chrome(e, deck));
  const top = Math.max(reading.y, ...chromeText.filter(e => e.y < deck.height / 2).map(e => e.y + e.h + gap / 2));
  const bottom = Math.max(deck.height-reading.y-reading.h, ...chromeText.filter(e => e.y >= deck.height / 2).map(e => deck.height - e.y + gap / 2));
  const area = safeArea({x:reading.x,y:top,w:reading.w,h:deck.height-top-bottom}, fixed, deck, gap);
  if (area.w < 160 * scale || area.h < 140 * scale) { issue('Locked objects occupy most of the space. Unlock the objects you want to include.'); return result; }
  const texts = units.filter(u => u.kind === 'text'), visuals = units.filter(u => u.kind === 'visual');
  const title = headingUnit(units, deck);
  const placements = contentPlan(units, title, id, area, gap, scale, options, measure);

  for (const [unit, target] of placements) {
    if (target.w < 20 * scale || target.h < 20 * scale) { issue('There is not enough space. Reduce the content or choose tighter spacing.'); continue; }
    const semantic = semanticGeometry(unit, target, scale, options, measure);
    const singleText = unit.elements.length === 1 && unit.kind === 'text';
    const supportingMark = unit.elements.some(e => e.type === 'image' && layoutObjectRole(e, deck) === 'auxiliary');
    const ratio = Math.min(target.w / unit.w, target.h / unit.h, supportingMark ? 1.25 : Infinity);
    const offsetX = unit.kind === 'visual' ? (target.w - unit.w * ratio) / 2 : 0;
    const offsetY = unit.kind === 'visual' ? (target.h - unit.h * ratio) / 2 : 0;
    for (const e of unit.elements) {
      let geometry: Box = semantic?.get(e.id)?.box ?? (singleText ? target : {x: target.x + offsetX + (e.x - unit.x) * ratio, y: target.y + offsetY + (e.y - unit.y) * ratio, w: e.w * ratio, h: e.h * ratio});
      if (e.type === 'image' && unit.elements.length === 1 && e.fit === 'contain' && !e.crop) {
        const aspect = measure.aspect?.(e) ?? e.w / e.h, w = Math.min(target.w, target.h * aspect), h = w / aspect;
        geometry = {x: target.x + (target.w - w) / 2, y: target.y + (target.h - h) / 2, w, h};
      }
      if(unit.elements.length===1&&['table','chart'].includes(e.type))geometry=target;
      if (geometry.w < 1 || geometry.h < 1) { issue('This group would become too small. Split the slide or reduce the content.'); continue; }
      const patch: Partial<SlideElement> = {...styled.get(e.id), x: round(geometry.x), y: round(geometry.y), w: round(geometry.w), h: round(geometry.h)};
      if (e.type === 'text') {
        patch.textSizing = e.textSizing;
        const minimum = Math.max(4, Math.min(e.fontSize, (unit === title ? 30 : e.name.includes('Label') || e.name === 'Evidence caption' ? 16 : 20) * scale));
        const desired = Math.max(minimum, Math.min(500, semantic?.get(e.id)?.size ?? (singleText ? textSize(e, unit === title, scale, options) : e.fontSize * ratio)));
        const fitted = options.fitText ? fitFont(e, geometry, desired, minimum, measure) : {size: desired, fits: textHeight(e, desired, geometry.w - 6, measure) <= geometry.h - 4};
        Object.assign(patch, scaledTextStyle(e, round(fitted.size)));
        if (!fitted.fits) issue(`“${e.name}” has too much text. Shorten it or split it across slides.`);
        if (patch.fontSize !== e.fontSize) result.fitted++;
      }
      if (e.type === 'table') {
        let low=Math.max(4,Math.min(e.fontSize,16*scale)),high=e.fontSize;
        for(let i=0;i<12;i++){const mid=(low+high)/2;if(tableHeight(e,mid,geometry.w,measure)<=geometry.h-2)low=mid;else high=mid;}
        patch.fontSize=options.fitText?round(low):e.fontSize;
        if(tableHeight(e,patch.fontSize,geometry.w,measure)>geometry.h+2)issue('This table has too much content. Reduce the rows or split it across slides.');
      }
      const previous = original.elements.find(previous => previous.id === e.id)!;
      if (Object.entries(patch).every(([key, value]) => JSON.stringify(previous[key as keyof SlideElement]) === JSON.stringify(value))) continue;
      result.operations.push({op: 'update_element', slideId, elementId: e.id, patch});
      result.moved++;
    }
  }
  if (result.operations.length) result.slide = applyOperations({...deck, slides: [original], fonts: undefined}, result.operations).slides[0];
  result.imageShare = result.slide.elements.filter(e => e.type === 'image' && !e.hidden).reduce((n, e) => n + e.w * e.h, 0) / (deck.width * deck.height);
  return result;
}
/** Prefer complete, readable compositions with enough space for the actual evidence. */
export function layoutCandidates(deck: Deck, slideId: string, options = DEFAULT_LAYOUT_OPTIONS, measure: TextMeasure = approximate): LayoutCandidate[] {
  const candidates = AUTO_LAYOUTS.map(l => createLayoutCandidate(deck, slideId, l.id, options, measure));
  const preferred = analyzeLayout(deck, deck.slides.find(s => s.id === slideId)!).recommended;
  const score = (c: LayoutCandidate) => c.issues.length * 10000 - (c.imageShare ?? 0) * 260 - (c.id === preferred ? 12 : 0);
  const winner = [...candidates].sort((a, b) => score(a) - score(b))[0];
  return candidates.map(c => ({...c, recommended: c.id === winner.id}));
}
function sourceCandidate(deck:Deck,slideId:string,options:LayoutOptions,measure:TextMeasure):LayoutSuggestion {
  const slide=deck.slides.find(s=>s.id===slideId)!;const {units,fixed}=contentUnits(deck,slide),operations:Operation[]=[];
  const heading=headingUnit(units,deck);
  if(options.style&&options.style!=='original')for(const unit of units)for(const e of unit.elements)if(e.type==='text'){
    const style=directionPatch(e,unit===heading,options.style),styled={...e,...style};
    const fitted=options.fitText&&e.clipText!==false?fitFont(styled,e,e.fontSize,Math.min(e.fontSize,20*Math.min(deck.width/1440,deck.height/810)),measure):{size:e.fontSize};
    const patch={...style,...scaledTextStyle(styled,fitted.size)};
    if(!Object.entries(patch).every(([key,value])=>JSON.stringify(e[key as keyof SlideElement])===JSON.stringify(value)))operations.push({op:'update_element',slideId,elementId:e.id,patch});
  }
  return{id:'original',slide:operations.length?applyOperations({...deck,slides:[slide],fonts:undefined},operations).slides[0]:structuredClone(slide),operations,issues:[],moved:0,fitted:0,preserved:fixed.length,units:units.length,recommended:false};
}
export function curatedLayouts(deck:Deck,slideId:string,options=DEFAULT_LAYOUT_OPTIONS,measure:TextMeasure=approximate){
  const slide=deck.slides.find(s=>s.id===slideId)!;const baseline=assessLayout(deck,slide,measure),scale=Math.min(deck.width/1440,deck.height/810);
  const unresolvedImages = slide.elements.filter(e => !e.hidden && e.opacity > 0 && e.type === 'image' && layoutObjectRole(e, deck) === 'content' && measure.imageStatus && measure.imageStatus(e) !== 'ready');
  let original=sourceCandidate(deck,slideId,options,measure);
  if(layoutRegressions(deck,baseline,assessLayout(deck,original.slide,measure)).length)original={...original,slide:structuredClone(slide),operations:[]};
  const rejected:LayoutSuggestion[]=[],accepted:LayoutSuggestion[]=[];
  for(const candidate of layoutCandidates(deck,slideId,options,measure)){
    const quality=assessLayout(deck,candidate.slide,measure),safety=[...candidate.issues.map(i=>i.message),...layoutRegressions(deck,baseline,quality)];
    if (unresolvedImages.length) safety.push('Image not ready. Keeping its current placement.');
    if(quality.score<baseline.score-.5)safety.push('Does not improve readability compared with the current layout');
    const reasons=[...safety];
    if(quality.score<=baseline.score+1)reasons.push('Does not offer enough improvement over the current layout');
    if((candidate.units<=1&&!baseline.overflow.length&&!baseline.outside.length)||equivalentComposition(original.slide,candidate.slide,measure,scale)||accepted.some(c=>equivalentComposition(c.slide,candidate.slide,measure,scale)))reasons.push('Too similar to the current layout or another suggestion');
    if(reasons.length)rejected.push({...candidate,recommended:false,reasons:[...new Set(reasons)],issues:[...new Set(safety)].map(message=>({slideId,message}))});
    else accepted.push({...candidate,recommended:false});
  }
  const sorted=accepted.sort((a,b)=>assessLayout(deck,b.slide,measure).score-assessLayout(deck,a.slide,measure).score);
  const winner=sorted[0];
  // Prefer source geometry unless a candidate offers a measurable improvement.
  const improved=winner&&assessLayout(deck,winner.slide,measure).score>assessLayout(deck,original.slide,measure).score+1;
  const suggestions=[{...original,recommended:!improved},...sorted.map(c=>({...c,recommended:!!improved&&c.id===winner!.id}))];
  return{suggestions,rejected,sourceIssues:baseline.overflow.length+baseline.outside.length,unresolvedImages:unresolvedImages.length};
}
export function layoutProposal(deck: Deck, candidates: (LayoutCandidate | LayoutSuggestion)[]): Proposal | null {
  if (candidates.some(c => c.issues.length)) throw new Error('Resolve the layout issues before applying changes.');
  const operations = candidates.flatMap(c => c.operations);
  if (!operations.length) return null;
  // Layout proposals may only restyle/reposition existing content; never fabricate objects.
  const allowed = new Set(['x','y','w','h','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','padding','runs','paragraphs','textSizing']);
  for (const op of operations) if (op.op !== 'update_element' || Object.keys(op.patch).some(key => !allowed.has(key))) throw new Error('Layout suggestions can only change existing object placement and text styles.');
  const after = applyOperations(deck, operations);
  for (const slide of deck.slides) {
    const {fixed} = contentUnits(deck, slide);
    const next = after.slides.find(s => s.id === slide.id)!;
    for (const e of slide.elements) {
      const changed = next.elements.find(n => n.id === e.id)!;
      if (layoutContentSignature(changed) !== layoutContentSignature(e) || (fixed.some(f => f.id === e.id) && !sameDocumentData(changed,e))) throw new Error('Layout suggestions cannot change content or locked objects.');
      if (e.type === 'image' && layoutObjectRole(e, deck) === 'auxiliary' && (changed.w > e.w * 1.35 || changed.h > e.h * 1.35)) throw new Error('Decorative elements cannot become the main content.');
    }
  }
  return ProposalSchema.parse({baseRevision: deck.revision, summary: `Auto layout · ${candidates.filter(c => c.operations.length).length}  pages`, operations});
}
