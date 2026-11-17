type PreviewNavigation = {page: number; onselect: (page: number) => void};

/** Keep the filmstrip in view without scrolling the dialog or moving toolbar focus. */
export function templatePreviewNavigation(node: HTMLElement, options: PreviewNavigation) {
  let frame = 0;
  const buttons = () => [...node.querySelectorAll<HTMLButtonElement>('[data-preview-page]')];
  function reveal() {
    const target = buttons()[options.page];
    if (!target) return;
    const bounds = node.getBoundingClientRect(), item = target.getBoundingClientRect();
    const left = bounds.left + node.clientLeft + 4, right = left + node.clientWidth - 8;
    if (item.left < left) node.scrollLeft += item.left - left;
    else if (item.right > right) node.scrollLeft += item.right - right;
  }
  function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(reveal); }
  function key(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const items = buttons(), current = items.indexOf(event.target as HTMLButtonElement);
    if (current < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const rtl = getComputedStyle(node).direction === 'rtl';
    const delta = (event.key === 'ArrowRight' ? 1 : -1) * (rtl ? -1 : 1);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, current + delta));
    items[next]?.focus({preventScroll: true});
    options.onselect(next);
    schedule();
  }
  node.addEventListener('keydown', key);
  const resize = new ResizeObserver(schedule);
  resize.observe(node); schedule();
  return {
    update(next: PreviewNavigation) { options = next; schedule(); },
    destroy() { cancelAnimationFrame(frame); resize.disconnect(); node.removeEventListener('keydown', key); },
  };
}
