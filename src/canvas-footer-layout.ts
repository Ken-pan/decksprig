// Desktop chrome uses its rendered widths, independently of authored slides.
export function canvasFooterLayout(footer: HTMLElement) {
  const desktop = matchMedia('(min-width:761px) and (hover:hover) and (pointer:fine)');
  let frame = 0, disposed = false;
  const observed = new Set<Element>();
  function measure() {
    frame = 0;
    if (disposed) return;
    const dock = footer.querySelector<HTMLElement>('.canvas-insert-dock');
    const left = footer.querySelector<HTMLElement>('.canvas-utility-left');
    const right = footer.querySelector<HTMLElement>('.canvas-utility-right');
    let stacked = false;
    if (desktop.matches && dock && left && right && getComputedStyle(dock).visibility !== 'hidden') {
      const style = getComputedStyle(footer);
      const width = (node: HTMLElement) => Math.max(node.getBoundingClientRect().width, node.scrollWidth);
      const available = footer.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      // A small release margin prevents fit-zoom digit changes from oscillating
      // between rows as the available canvas height changes.
      const margin = footer.hasAttribute('data-dock-stacked') ? 2 * parseFloat(style.fontSize) : 0;
      stacked = width(dock) + 2 * Math.max(width(left), width(right)) + 2 * parseFloat(style.columnGap) + margin > available;
    }
    footer.toggleAttribute('data-dock-stacked', stacked);
  }
  function schedule() { if (!disposed && !frame) frame = requestAnimationFrame(measure); }
  const resize = new ResizeObserver(schedule);
  function watch() {
    const next = new Set<Element>([footer, ...footer.querySelectorAll('.canvas-insert-dock,.canvas-utility-left,.canvas-utility-right')]);
    for (const node of observed) if (!next.has(node)) { resize.unobserve(node); observed.delete(node); }
    for (const node of next) if (!observed.has(node)) { resize.observe(node); observed.add(node); }
  }
  const mutation = new MutationObserver(() => { watch(); schedule(); });
  mutation.observe(footer, {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'inert']});
  desktop.addEventListener('change', schedule);
  watch(); measure();
  return {destroy() {
    disposed = true; cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect();
    desktop.removeEventListener('change', schedule); footer.removeAttribute('data-dock-stacked');
  }};
}
