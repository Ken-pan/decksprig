import type {Deck, Slide, PageLayout} from './model';
import type {Bounds} from './interactions';

export type PageSize = Pick<Deck, 'width' | 'height'>;
export function defaultPageLayout(page: PageSize): PageLayout {
  const margin = Math.round(Math.min(page.width, page.height) * .08);
  return {margins: {top: margin, right: margin, bottom: margin, left: margin}, columns: 1, gutter: Math.round(Math.min(page.width, page.height) * .03)};
}
export function pageLayout(page: PageSize, slide: Pick<Slide, 'layout'>): PageLayout { return slide.layout ?? defaultPageLayout(page); }
export function contentBounds(page: PageSize, slide: Pick<Slide, 'layout'>): Bounds {
  const {margins: m} = pageLayout(page, slide);
  return {x: m.left, y: m.top, w: page.width - m.left - m.right, h: page.height - m.top - m.bottom};
}
export function columnBounds(page: PageSize, slide: Pick<Slide, 'layout'>): Bounds[] {
  const box = contentBounds(page, slide), {columns, gutter} = pageLayout(page, slide);
  const width = (box.w - (columns - 1) * gutter) / columns;
  return Array.from({length: columns}, (_, i) => ({...box, x: box.x + i * (width + gutter), w: width}));
}
