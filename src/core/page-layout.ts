import { PageLayoutSchema, type Deck, type PageLayout } from './model';
import type { Operation } from './operations';

export {defaultPageLayout,pageLayout,contentBounds,columnBounds,type PageSize} from './page-layout-geometry';
export function pageLayoutOperations(deck: Deck, slideId: string, value: PageLayout, all = false): Operation[] {
  const parsed = PageLayoutSchema.safeParse(value);
  if (!parsed.success) { const field=parsed.error.issues[0]?.path[0]; throw new Error(field==='columns'?'Use a whole number from 1 to 12 for columns.':field==='gutter'?'Use a nonnegative number for the column gap.':'Margins must be nonnegative and fit within the slide dimensions.'); }
  const layout = parsed.data, m = layout.margins;
  if (deck.width - m.left - m.right < 1 || deck.height - m.top - m.bottom < 1) throw new Error('Margins must leave at least 1 px of usable slide space.');
  if (deck.width - m.left - m.right - (layout.columns - 1) * layout.gutter < layout.columns) throw new Error('The column gap is too large. Reduce the number of columns, the gap, or the side margins.');
  if (!deck.slides.some(s => s.id === slideId)) throw new Error('The slide has changed. Reopen layout settings.');
  return deck.slides.filter(s => (all || s.id === slideId) && JSON.stringify(s.layout) !== JSON.stringify(layout)).map(s => ({op: 'update_slide', slideId: s.id, patch: {layout}}));
}
