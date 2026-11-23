import type {Deck,SlideElement} from './model';
import type {Operation} from './operations';
import {selectionBounds,type Bounds} from './interactions';
import {selectionRoots,descendants,groupBox,arrangementParent} from './container-tree';
import {contentBounds} from './page-layout-geometry';
import {layoutArrangement,layoutArrangementOperations} from './arrangement-layout';

// Optional alignment controls produce the same atomic manual/AI operations.
export type AlignmentReference = 'auto' | 'selection' | 'page' | 'content' | 'group';
export type AlignmentDirection = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type ArrangementUnit = {elements: SlideElement[]; bounds: Bounds};
export function arrangementUnits(deck: Deck, slideId: string, ids: string[],context=''): ArrangementUnit[] {
  const slide=deck.slides.find(s=>s.id===slideId);if(!slide)return[];
  return selectionRoots(slide,ids,context).flatMap(id=>{
    const children=descendants(slide,id),elements=children.length?children:slide.elements.filter(e=>e.id===id);
    if(elements.some(e=>e.locked))return[];
    const visible=elements.filter(e=>!e.hidden),bounds=children.length?groupBox(slide,id):selectionBounds(visible);
    return visible.length&&bounds?[{elements,bounds}]:[];
  });
}
export function alignmentReference(reference: AlignmentReference, count: number, inGroup=false): Exclude<AlignmentReference,'auto'> {
  return reference === 'auto' ? inGroup?'group':count > 1 ? 'selection' : 'content' : reference === 'selection' && count < 2 || reference==='group'&&!inGroup ? inGroup?'group':'content' : reference;
}
function translateUnit(slideId: string, unit: ArrangementUnit, dx: number, dy: number): Operation[] {
  if (Math.abs(dx) + Math.abs(dy) < .0001) return [];
  return unit.elements.map(e => ({op: 'update_element', slideId, elementId: e.id, patch: {x: e.x + dx, y: e.y + dy}}));
}
export function alignElements(deck: Deck, slideId: string, ids: string[], direction: AlignmentDirection, reference: AlignmentReference = 'auto',context=''): Operation[] {
  const units = arrangementUnits(deck,slideId,ids,context), slide = deck.slides.find(s => s.id === slideId);
  if (!units.length || !slide) return [];
  const flow=layoutArrangement(slide,ids,context);if(flow)return layoutArrangementOperations(slideId,flow,direction);
  // Legacy callers retain page alignment for a single unit; UI passes an explicit reference.
  const target = reference === 'auto' ? units.length === 1 ? 'page' : 'selection' : reference;
  const parent=arrangementParent(slide,ids,context),group=parent&&groupBox(slide,parent);
  const box = target === 'group'&&group?group:target === 'page' ? {x: 0, y: 0, w: deck.width, h: deck.height} : target === 'content' ? contentBounds(deck,slide) : {x:Math.min(...units.map(u=>u.bounds.x)),y:Math.min(...units.map(u=>u.bounds.y)),w:Math.max(...units.map(u=>u.bounds.x+u.bounds.w))-Math.min(...units.map(u=>u.bounds.x)),h:Math.max(...units.map(u=>u.bounds.y+u.bounds.h))-Math.min(...units.map(u=>u.bounds.y))};
  return units.flatMap(unit => {
    const b = unit.bounds; let dx = 0, dy = 0;
    if (direction === 'left') dx = box.x - b.x;
    if (direction === 'center') dx = box.x + (box.w - b.w) / 2 - b.x;
    if (direction === 'right') dx = box.x + box.w - b.x - b.w;
    if (direction === 'top') dy = box.y - b.y;
    if (direction === 'middle') dy = box.y + (box.h - b.h) / 2 - b.y;
    if (direction === 'bottom') dy = box.y + box.h - b.y - b.h;
    return translateUnit(slideId,unit,dx,dy);
  });
}
export function distributionGap(units: ArrangementUnit[], axis: 'x' | 'y'): number | null {
  if (units.length < 3) return null;
  const dimension = axis === 'x' ? 'w' : 'h', sorted = [...units].sort((a,b) => a.bounds[axis] - b.bounds[axis]);
  const span = sorted.at(-1)!.bounds[axis] + sorted.at(-1)!.bounds[dimension] - sorted[0].bounds[axis];
  return (span - units.reduce((sum,u) => sum + u.bounds[dimension],0)) / (units.length - 1);
}
export function distributeElements(deck: Deck, slideId: string, ids: string[], axis: 'x' | 'y',context=''): Operation[] {
  const slide=deck.slides.find(s=>s.id===slideId),flow=slide&&layoutArrangement(slide,ids,context);if(flow)return layoutArrangementOperations(slideId,flow,axis);
  const units = arrangementUnits(deck,slideId,ids,context), gap = distributionGap(units,axis);
  if (gap === null) return [];
  if (gap < -.0001) throw new Error('There is not enough space to distribute these objects evenly. Move the outer objects farther apart first.');
  const dimension = axis === 'x' ? 'w' : 'h', sorted = [...units].sort((a,b) => a.bounds[axis] - b.bounds[axis]);
  let position = sorted[0].bounds[axis];
  return sorted.flatMap((unit,i) => {
    const delta = position - unit.bounds[axis]; position += unit.bounds[dimension] + Math.max(0,gap);
    return i === 0 || i === sorted.length - 1 ? [] : translateUnit(slideId,unit,axis === 'x' ? delta : 0,axis === 'y' ? delta : 0);
  });
}
