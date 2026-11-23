// All mounted previews share the browser's post-layout width delivery.
const listeners = new Map<Element, (width: number) => void>();
let observer: ResizeObserver | undefined;

export function observeCanvasWidth(host: Element, update: (width: number) => void) {
  observer ??= new ResizeObserver(entries => {
    for (const entry of entries) listeners.get(entry.target)?.(entry.contentRect.width);
  });
  listeners.set(host, update);
  observer.observe(host);
  return () => {
    listeners.delete(host);
    observer?.unobserve(host);
    if (!listeners.size) {
      observer?.disconnect();
      observer = undefined;
    }
  };
}
