export {copyDeck} from './document-copy';
export function reorderedSlides(ids: string[], dragged: string, target: string, after = false): string[] {
  if (dragged === target || !ids.includes(dragged) || !ids.includes(target)) return ids;
  const next = ids.filter(id => id !== dragged), index = next.indexOf(target);
  next.splice(index + Number(after), 0, dragged); return next;
}
export function defaultPaneWidths(viewport: number) { return viewport < 1400 ? {left: 176, right: 264} : {left: 196, right: 280}; }
export function clampPaneWidth(side: 'left' | 'right', value: number) { return Math.round(Math.max(side === 'left' ? 140 : 260, Math.min(side === 'left' ? 320 : 440, value))); }
export function fitScale(width: number, height: number, availableWidth: number, availableHeight: number) { return Math.max(.05, Math.min(availableWidth / width, availableHeight / height)); }
