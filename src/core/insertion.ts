import type {LineStyle} from './line-schema';
import {tablePresetStyle} from './table-rendering';
import { element, type Deck, type Slide, type SlideElement } from './model';
import type { Bounds, Point } from './interactions';
import { deckDesignSystem, styledElement } from './deck-design-system';
import {isGraphicBackground} from './resource-purpose';
import {SHAPE_LABELS, isShapeTool, shapePreset, type ShapeInsertTool} from './shapes';

export type PrimitiveInsertTool = 'text' | ShapeInsertTool | 'table' | 'chart';
export type InsertTool = PrimitiveInsertTool | 'image' | 'block';
export type CanvasTool = InsertTool | 'draw';
export type InsertGeometry = Bounds & {flipX?: boolean; flipY?: boolean; textSizing?: SlideElement['textSizing']};
type Page = Pick<Deck, 'width' | 'height'> & Partial<Pick<Deck,'designSystem'>>;
type ImagePlacement = Pick<SlideElement, 'w' | 'h'> & Partial<Pick<SlideElement, 'resource'>>;
export type PlacementClick = {client: Point; time: number; slideId: string; revision: number};

/** A double click or double tap must not consume the next queued asset. Dragging stays available. */
export function repeatedPlacementClick(previous: PlacementClick | null, next: PlacementClick): boolean {
  return Boolean(previous && previous.slideId === next.slideId && previous.revision === next.revision && next.time >= previous.time && next.time - previous.time < 350 && Math.hypot(next.client.x - previous.client.x, next.client.y - previous.client.y) <= 6);
}

/** Continue a queue only when history changes exactly its own last or next image. */
export function placementHistoryMatch(current: Deck, next: Deck | undefined, slideId: string, imageId: string, direction: 'undo' | 'redo'): boolean {
  if (!next || next.id !== current.id) return false;
  const before = current.slides.find(s => s.id === slideId), after = next.slides.find(s => s.id === slideId);
  if (!before || !after) return false;
  const delta = direction === 'undo' ? -1 : 1;
  return after.elements.length === before.elements.length + delta && before.elements.some(e => e.id === imageId) === (direction === 'undo') && after.elements.some(e => e.id === imageId) === (direction === 'redo') && before.elements.every(e => e.id === imageId || after.elements.some(other => other.id === e.id));
}

/** Only newly authored text is fitted; imported and existing text keeps its authored position. */
export function fitTextInsertion(page: Page, anchor: InsertGeometry, size: Pick<Bounds, 'w' | 'h'>): InsertGeometry {
  const w = Math.min(page.width, Math.max(1, size.w)), h = Math.max(1, size.h);
  return {x: Math.max(0, Math.min(anchor.x, page.width - w)), y: Math.max(0, Math.min(anchor.y, page.height - h)), w, h, textSizing: anchor.textSizing === 'auto-width' && size.w > page.width ? 'auto-height' : anchor.textSizing};
}
export const insertLabels: Record<InsertTool, string> = {...SHAPE_LABELS, text: 'Text', table: 'Table', chart: 'Chart', image: 'Image', block: 'Block'};
const defaults = {
  text: {w: 360, h: 40, fontSize: 32},
  rect: {w: 300, h: 200, fill: '#dce5d5'},
  roundrect: {w: 300, h: 200, fill: '#dce5d5'},
  diamond: {w: 180, h: 180, fill: '#dce5d5'},
  triangle: {w: 220, h: 200, fill: '#dce5d5'},
  pentagon: {w: 200, h: 200, fill: '#dce5d5'},
  hexagon: {w: 220, h: 190, fill: '#dce5d5'},
  star: {w: 200, h: 200, fill: '#dce5d5'},
  arrow: {w: 300, h: 160, fill: '#dce5d5'},
  chevron: {w: 220, h: 180, fill: '#dce5d5'},
  ellipse: {w: 160, h: 160, fill: '#dce5d5'},
  line: {w: 320, h: 1, stroke: '#26362c', strokeWidth: 3},
  table: {w: 720, h: 240, tableStyle:tablePresetStyle('editorial'), cells: [['Item', 'Description', 'Status'], ['Add content', 'Add a description', 'To confirm'], ['Add content', 'Add a description', 'To confirm']], fontSize: 24},
  chart: {w: 600, h: 320, values: [{label: 'A', value: 30}, {label: 'B', value: 55}, {label: 'C', value: 42}], fontSize: 24, fill: '#73856e', name: 'Sample data · Replace with your own'},
};
const unit = (page: Page) => Math.min(page.width / 1440, page.height / 810);
const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));

/** Page pixels, independent of the workspace's display zoom. Text has no fixed width. */
export function insertionSizeLabel(type: InsertTool, page: Page, imageSize?: ImagePlacement): string {
  if (type === 'text') return `Auto width · ${Math.round(Math.max(4, (page.designSystem?.typography.body.fontSize ?? defaults.text.fontSize) * unit(page)))} px type`;
  if (type === 'line') return `${Math.round(defaults.line.w * unit(page))} px long · ${Math.round(Math.max(.5, defaults.line.strokeWidth * unit(page)) * 10) / 10} px stroke`;
  const size = insertionGeometry(type, page, {x: 0, y: 0}, undefined, false, imageSize);
  return `${Math.round(size.w)} × ${Math.round(size.h)} px`;
}

/** Screen-pixel drag thresholds are handled by the caller; this only uses page coordinates. */
export function insertionGeometry(type: InsertTool, page: Page, start: Point, end?: Point, constrained = false, imageSize?: ImagePlacement, lineStyle?: LineStyle): InsertGeometry {
  if (type === 'image' || type === 'block') return type === 'image' && imageSize && isGraphicBackground(imageSize.resource?.id) && end ? insertionGeometry('rect', page, start, end, constrained) : imageInsertionGeometry(page, imageSize ?? {w: 480 * unit(page), h: 270 * unit(page)}, start, end);
  const a = {x: clamp(start.x, page.width - 1), y: clamp(start.y, page.height - 1)};
  if (!end) {
    const size = defaults[type], scale = unit(page);
    const w = Math.min(page.width, Math.max(1, size.w * scale));
    const h = Math.min(page.height, Math.max(1, (type==='line'&&lineStyle&&lineStyle.route!=='straight'?140:size.h) * scale));
    // A click starts text at the caret. Its live content determines the eventual width.
    if (type === 'text') return {x: a.x, y: Math.min(a.y, page.height - h), w: 1, h, textSizing: 'auto-width'};
    // Keep a click placement fully visible, including along the bottom/right edge.
    return {x: Math.min(a.x, page.width - w), y: Math.min(a.y, page.height - h), w, h};
  }
  let dx = clamp(end.x, page.width) - a.x, dy = clamp(end.y, page.height) - a.y;
  if (constrained && isShapeTool(type) && type !== 'line') {
    const size = Math.min(Math.max(Math.abs(dx), Math.abs(dy)), dx < 0 ? a.x : page.width - a.x, dy < 0 ? a.y : page.height - a.y);
    dx = (dx < 0 ? -1 : 1) * size; dy = (dy < 0 ? -1 : 1) * size;
  }
  if (constrained && type === 'line') {
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4, length = Math.hypot(dx, dy);
    dx = Math.cos(angle) * length; dy = Math.sin(angle) * length;
    const fit = Math.min(1, Math.abs(dx) < 1e-8 ? 1 : (dx < 0 ? a.x : page.width - a.x) / Math.abs(dx), Math.abs(dy) < 1e-8 ? 1 : (dy < 0 ? a.y : page.height - a.y) / Math.abs(dy));
    dx *= fit; dy *= fit;
  }
  const minWidth = type === 'line' ? 1 : Math.min(24 * unit(page), page.width);
  const minHeight = type === 'line' ? 1 : type === 'text' ? Math.min(50 * unit(page), page.height) : Math.min(24 * unit(page), page.height);
  const w = Math.max(1, minWidth, Math.abs(dx)), h = Math.max(1, minHeight, Math.abs(dy));
  return {x: Math.min(Math.max(0, a.x + Math.min(0, dx)), page.width - w), y: Math.min(Math.max(0, a.y + Math.min(0, dy)), page.height - h), w, h, ...(type === 'line' ? lineStyle ? {flipX:dx<0,flipY:dy<0} : {flipY: dx * dy < 0} : {}), ...(type === 'text' ? {textSizing: 'auto-height' as const} : {})};
}

/** Assets keep their original proportions in every drag direction and at page edges. */
export function imageInsertionGeometry(page: Page, image: Pick<SlideElement, 'w' | 'h'>, start: Point, end?: Point): InsertGeometry {
  const ratio = image.w / image.h;
  if (!Number.isFinite(ratio) || ratio <= 0) throw new Error('This image has invalid dimensions. Choose another image.');
  const a = {x: clamp(start.x, page.width - 1), y: clamp(start.y, page.height - 1)};
  if (!end) {
    const scale = Math.min(1, page.width / image.w, page.height / image.h);
    const w = Math.max(1, image.w * scale), h = Math.max(1, image.h * scale);
    return {x: Math.min(a.x, page.width - w), y: Math.min(a.y, page.height - h), w, h};
  }
  const dx = clamp(end.x, page.width) - a.x, dy = clamp(end.y, page.height) - a.y;
  const maxW = dx < 0 ? Math.max(1, a.x) : page.width - a.x, maxH = dy < 0 ? Math.max(1, a.y) : page.height - a.y;
  const w = Math.max(1, Math.min(Math.max(Math.abs(dx), Math.abs(dy) * ratio, 12 * unit(page)), maxW, maxH * ratio));
  const h = Math.max(1, w / ratio);
  return {x: Math.max(0, Math.min(a.x - (dx < 0 ? w : 0), page.width - w)), y: Math.max(0, Math.min(a.y - (dy < 0 ? h : 0), page.height - h)), w, h};
}

export function insertedElement(type: PrimitiveInsertTool, page: Page, geometry: InsertGeometry, text = '', slide?: Pick<Slide,'backgroundStyle'|'adaptiveColors'>): SlideElement {
  const attrs = defaults[type];
  const ink=slide?.backgroundStyle==='dark'&&!slide.adaptiveColors?'onDark' as const:'ink' as const;
  const design=type==='text'?{text:'body' as const,fill:ink}:type==='line'?{stroke:ink}:type==='chart'?{text:'body' as const,textScale:.75,fill:'accent' as const}:type==='table'?{text:'body' as const,textScale:.75,fill:ink}:{fill:'surface' as const};
  const preset = isShapeTool(type) ? shapePreset(type) : {type};
  return styledElement(element(preset.type, {...attrs, ...geometry, design, ...preset, name: insertLabels[type], ...(type === 'roundrect' ? {radius: 24 * unit(page)} : {}), ...(type === 'text' ? {text} : {}), ...('strokeWidth' in attrs ? {strokeWidth: Math.max(.5, attrs.strokeWidth * unit(page))} : {}), fontSize: Math.max(4, ('fontSize' in attrs ? attrs.fontSize : 32) * unit(page))}),deckDesignSystem(page),page);
}
