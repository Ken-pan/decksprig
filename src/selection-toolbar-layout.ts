import { intersectRect, positionSelectionToolbar, unionRects, type ScreenRect } from './selection-toolbar-position';
import './selection-toolbar.css';
import {canvasOverlayBounds} from './canvas-overlay-layout';

export interface SelectionToolbarOptions { ids: string[]; editingId: string; revision?: number; scale: number; draft?: boolean; docked?: boolean }

/** Use only the footer row's real free space; its size never follows selection. */
export function selectionDockRow(slot:ScreenRect,footer:ScreenRect,utilities:ScreenRect[]):ScreenRect|null{
  const left=Math.max(slot.left,footer.left),right=Math.min(slot.right,footer.right);
  let top=footer.top,bottom=footer.bottom;
  for(const utility of utilities){
    if(utility.right<=utility.left||utility.bottom<=utility.top||utility.right<=left||utility.left>=right)continue;
    if(utility.bottom<=slot.top)top=Math.max(top,utility.bottom+4);
    else if(utility.top>=slot.bottom)bottom=Math.min(bottom,utility.top-4);
    else return null;
  }
  return right>left&&bottom>top?{left,right,top,bottom}:null;
}

export function positionDockedSelection(size:{width:number;height:number},boundary:ScreenRect){
  const width=boundary.right-boundary.left,height=boundary.bottom-boundary.top;
  return size.width<=width&&size.height<=height?{x:boundary.left+(width-size.width)/2,y:boundary.top+(height-size.height)/2,placement:'dock' as const}:null;
}

export function selectionToolbar(node: HTMLElement, initial: SelectionToolbarOptions) {
  const stage = node.closest<HTMLElement>('.canvas-stage');
  if (!stage) return;
  const footer = stage.closest('.stage-column')?.querySelector<HTMLElement>('.stage-footer');
  const slot = footer?.querySelector<HTMLElement>('.canvas-dock-slot');
  let options = initial, frame = 0;
  let lastTextRect: ScreenRect | null = null;
  let textId = initial.editingId;
  const hide = () => {
    if(node.contains(document.activeElement))stage!.focus({preventScroll:true});
    node.style.visibility = 'hidden';
  };

  function layout() {
    frame = 0;
    const render = stage!.querySelector<HTMLElement>('.slide-render.editable');
    if (!render || render.classList.contains('gesturing')) { hide(); return; }
    let boundary = canvasOverlayBounds(stage!);
    if (!boundary) { hide(); return; }
    const surface = stage!.parentElement!;
    const contextDock = options.docked && footer && slot;
    let dockBoundary: ScreenRect | null = null;
    if (contextDock) {
      const slotRect = slot.getBoundingClientRect(), footerRect = footer.getBoundingClientRect();
      const leftTools = footer.querySelector<HTMLElement>('.canvas-utility-left')?.getBoundingClientRect();
      const rightTools = footer.querySelector<HTMLElement>('.canvas-utility-right')?.getBoundingClientRect();
      // Phones give the dock a stable row; wide footers share a row with utilities.
      const area = slotRect.height ? selectionDockRow(slotRect,footerRect,[leftTools,rightTools].filter((rect):rect is DOMRect=>Boolean(rect))) : {
        left: Math.max(footerRect.left, leftTools?.right ?? footerRect.left) + 8,
        right: Math.min(footerRect.right, rightTools?.left ?? footerRect.right) - 8,
        top: footerRect.top, bottom: footerRect.bottom,
      };
      if(!area){hide();return;}
      const viewport = window.visualViewport;
      dockBoundary = intersectRect(area, {left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0,
        right: (viewport?.offsetLeft ?? 0) + (viewport?.width ?? innerWidth),
        bottom: (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight)});
      if(!dockBoundary){hide();return;}
    }
    const header = surface.querySelector<HTMLElement>('.canvas-overlay-top');
    if (header?.offsetHeight) boundary.top = Math.max(boundary.top, header.getBoundingClientRect().bottom + 8);
    if (options.docked) {
      const clearance = parseFloat(getComputedStyle(stage!).getPropertyValue('--canvas-group-clearance')) || 66;
      boundary.top = Math.max(boundary.top, stage!.getBoundingClientRect().top + clearance);
    }
    const status = surface.querySelector<HTMLElement>('.canvas-overlay-bottom');
    if (status?.offsetHeight) boundary.bottom = Math.min(boundary.bottom, status.getBoundingClientRect().top - 8);
    if (dockBoundary) boundary = dockBoundary;
    if (boundary.right - boundary.left < 120 || boundary.bottom - boundary.top < 40) { hide(); return; }
    const elements = Array.from(render.querySelectorAll<HTMLElement>('[data-element-id]')).filter(el => options.ids.includes(el.dataset.elementId!));
    const draft = options.draft ? render.querySelector<HTMLElement>('.insertion-text-draft') : null;
    let anchor = draft?.getBoundingClientRect() ?? unionRects(elements.map(el => el.getBoundingClientRect()));
    const currentTextId = options.draft ? 'insertion-text-draft' : options.editingId;
    if (textId !== currentTextId) { textId = currentTextId; lastTextRect = null; }
    if (options.editingId || options.draft) {
      const text = draft ?? elements.find(el => el.dataset.elementId === options.editingId)?.querySelector<HTMLElement>('[contenteditable="true"]');
      const selection = window.getSelection();
      if (text && selection?.rangeCount) {
        const range = selection.getRangeAt(0);
        if (text.contains(range.startContainer) && text.contains(range.endContainer)) {
          if(range.collapsed){lastTextRect=null;anchor=unionRects([text.getBoundingClientRect(),...(anchor?[anchor]:[])]);}
          else {const rects=Array.from(range.getClientRects()).filter(r=>r.height>0);lastTextRect=unionRects(rects)??lastTextRect;anchor=lastTextRect??anchor;}
        }
      }
    }
    if (!anchor) { hide(); return; }
    const rotationTargets=!options.editingId&&!options.draft?Array.from(stage!.querySelectorAll<HTMLElement>('.rotation-handle')).map(e=>e.getBoundingClientRect()).filter(r=>r.width&&r.height):[];
    if(rotationTargets.length)anchor=unionRects([anchor,...rotationTargets])!;
    const maxWidth = `${Math.floor(boundary.right - boundary.left - 16)}px`;
    if (node.style.maxWidth !== maxWidth) node.style.maxWidth = maxWidth;
    const rect = node.getBoundingClientRect();
    const position = dockBoundary
      ? positionDockedSelection(rect,boundary)
      : options.docked
      ? intersectRect(anchor, boundary) && rect.height + 16 <= boundary.bottom - boundary.top
        ? {x: boundary.left + (boundary.right - boundary.left - rect.width) / 2, y: boundary.top + 8, placement: 'dock'}
        : null
      : positionSelectionToolbar(anchor, rect, boundary, !rotationTargets.length&&matchMedia('(pointer:coarse)').matches&&!options.editingId&&!options.draft?40:10);
    if (!position) { hide(); return; }
    node.style.left = `${Math.round(position.x)}px`;
    node.style.top = `${Math.round(position.y)}px`;
    node.dataset.placement = position.placement;
    node.dataset.anchor = options.editingId || options.draft ? 'text' : 'object';
    node.style.visibility = 'visible';
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(layout); }
  hide();
  const resize = new ResizeObserver(schedule);
  resize.observe(stage); resize.observe(node);
  if (footer) resize.observe(footer);
  if (slot) resize.observe(slot);
  for (const region of stage.parentElement!.querySelectorAll('.canvas-overlay,.canvas-overlay-top,.canvas-overlay-bottom')) resize.observe(region);
  const canvas = stage.querySelector<HTMLElement>('.stage-canvas');
  if (canvas) resize.observe(canvas);
  const mutations = new MutationObserver(records => {
    if (records.some(record => !node.contains(record.target))) schedule();
  });
  mutations.observe(stage.parentElement!, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'contenteditable']});
  const workspace = stage.closest('.workspace');
  if (workspace) mutations.observe(workspace, {attributes: true, attributeFilter: ['class', 'style']});
  document.addEventListener('selectionchange', schedule);
  document.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  schedule();
  return {
    update(next: SelectionToolbarOptions) { options = next; schedule(); },
    destroy() {
      cancelAnimationFrame(frame); resize.disconnect(); mutations.disconnect();
      document.removeEventListener('selectionchange', schedule);
      document.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
    },
  };
}
