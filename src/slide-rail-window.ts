type Settings = {
  enabled: boolean;
  horizontal: boolean;
  count: number;
  active: string;
  update: (size: number, start: number, end: number) => void;
};

/** Slide buttons have uniform geometry within a document. Measure one row and
 * let the real grid retain the complete scroll range. */
export function slideRailWindow(list: HTMLElement, initial: Settings) {
  let settings = initial;
  let sample: HTMLElement | null = null;
  let size = 0, stride = 0, padding = 0, viewport = 0, frame = 0;
  const overscan = 240;
  const observer = new ResizeObserver(measure);
  let observing = false;

  function scroll() {
    if (!settings.enabled || !stride) return;
    const offset = (settings.horizontal ? list.scrollLeft : list.scrollTop) - padding;
    const first = Math.max(0, Math.min(settings.count, Math.floor((offset - overscan) / stride)));
    const end = Math.max(first, Math.min(settings.count, Math.ceil((offset + viewport + overscan) / stride)));
    settings.update(size, first, end);
  }

  function measure() {
    if (!settings.enabled) return;
    const row = list.querySelector<HTMLElement>(`.slide-thumb[data-slide-id="${CSS.escape(settings.active)}"]`) ?? list.querySelector<HTMLElement>('.slide-thumb');
    if (row !== sample) {
      if (sample) observer.unobserve(sample);
      sample = row;
      if (sample) observer.observe(sample);
    }
    if (!sample) return;
    const box = sample.getBoundingClientRect(), horizontal = settings.horizontal;
    const next = horizontal ? box.width : box.height;
    if (next <= 0) return;
    const style = getComputedStyle(list);
    size = next;
    stride = size + (parseFloat(horizontal ? style.columnGap : style.rowGap) || 0);
    padding = parseFloat(horizontal ? style.paddingLeft : style.paddingTop) || 0;
    viewport = horizontal ? list.clientWidth : list.clientHeight;
    scroll();
  }

  function configure(next: Settings) {
    const changedAxis = next.horizontal !== settings.horizontal;
    settings = next;
    if (changedAxis) stride = 0;
    cancelAnimationFrame(frame);
    if (!next.enabled) {
      if (observing) observer.disconnect();
      sample = null; observing = false; stride = 0;
      return;
    }
    if (!observing) { observer.observe(list); observing = true; }
    // Active slides are pinned. Measure their real geometry after the keyed
    // list has settled, including when a new deck changes the aspect ratio.
    frame = requestAnimationFrame(measure);
  }

  list.addEventListener('scroll', scroll, {passive: true});
  configure(initial);
  return {
    update: configure,
    destroy() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      list.removeEventListener('scroll', scroll);
    },
  };
}
