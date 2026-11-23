import { slide } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';

// Editor chrome only. Document animation, presentation and exports own their timing.
export type UIMotionPreference = 'system' | 'reduced';
const animations = new Set<Animation>();
const scrollAreas = new Set<HTMLElement>();
export const reducedUI = () => typeof window === 'undefined' || document.documentElement.dataset.uiMotion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches;
const timing = (name: string, fallback: number) => {
  if (typeof window === 'undefined') return fallback;
  const token = getComputedStyle(document.documentElement).getPropertyValue(`--ui-motion-${name}`).trim();
  const value = parseFloat(token), duration = token.endsWith('s') && !token.endsWith('ms') ? value * 1000 : value;
  return Number.isFinite(duration) ? Math.max(0, duration) : fallback;
};
const ease = 'cubic-bezier(.22, 1, .36, 1)';

function animate(node: HTMLElement, frames: Keyframe[], duration: number) {
  if (reducedUI()) return;
  const animation = node.animate(frames, { duration, easing: ease });
  animations.add(animation);
  void animation.finished.catch(() => {}).finally(() => animations.delete(animation));
  return animation;
}

/** Editor-only geometry settling; authored transforms and playback stay independent. */
export function uiLayoutGeometry(node: HTMLElement, from: Keyframe, to: Keyframe) {
  return animate(node, [from, to], timing('reveal', 180));
}

export function setUIMotion(preference: UIMotionPreference) {
  document.documentElement.dataset.uiMotion = preference;
  if (reducedUI()) stopUIMotion();
}

function stopUIMotion() {
  for (const animation of animations) animation.cancel();
  for (const area of scrollAreas) area.scrollTo({ left: area.scrollLeft, top: area.scrollTop, behavior: 'instant' });
  // Svelte owns these animations and their completion callbacks. Finish them so
  // disclosures and modal outros settle without leaving a retained focus trap.
  for (const node of document.querySelectorAll<HTMLElement>('[data-ui-transition]')) finishTransition(node);
}

function finishTransition(node: HTMLElement) {
  for (const animation of node.getAnimations()) {
    if (animation.playState === 'running' || animation.playState === 'paused') {
      try { animation.finish(); } catch { /* Only finite UI transitions are owned here. */ }
    }
  }
}

export function installUIMotion() {
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const change = () => { if (reducedUI()) stopUIMotion(); };
  const start = (event: Event) => {
    const node = event.target;
    if (node instanceof HTMLElement && node.hasAttribute('data-ui-transition') && reducedUI()) {
      // Svelte creates its main animation just after the start event.
      queueMicrotask(() => { if (node.isConnected && reducedUI()) finishTransition(node); });
    }
  };
  media.addEventListener('change', change);
  document.addEventListener('introstart', start, true);
  document.addEventListener('outrostart', start, true);
  return () => {
    media.removeEventListener('change', change);
    document.removeEventListener('introstart', start, true); document.removeEventListener('outrostart', start, true);
    for (const animation of animations) animation.cancel();
  };
}

export function uiPresence(node: HTMLElement, { x = 0, y = 6, surface = false }: { x?: number; y?: number; surface?: boolean } = {}, { direction }: { direction: 'in' | 'out' | 'both' }) {
  const configure = (phase: 'in' | 'out') => {
    const duration = reducedUI() ? 0 : timing(phase === 'out' ? 'exit' : surface ? 'surface' : 'reveal', surface ? 240 : 180);
    // A zero-duration transition has no animation to query or finish.
    node.toggleAttribute('data-ui-transition', duration > 0);
    if (surface) node.dataset.uiLeaving = String(phase === 'out');
    return { duration, easing: cubicOut,
      css: (t: number) => `opacity:${t};translate:${(1 - t) * x}px ${(1 - t) * y}px;${surface ? `--ui-surface-progress:${t};` : ''}` };
  };
  // Deferred options provide different entry/exit timing within one reversible
  // transition. Svelte preserves the current progress when the direction changes.
  return direction === 'both' ? ({direction: phase = 'in'}: {direction?: 'in' | 'out'} = {}) => configure(phase) : configure(direction);
}

export function uiCollapse(node: HTMLElement) {
  node.dataset.uiTransition = '';
  return slide(node, { duration: reducedUI() || node.closest('[data-ui-reframing]') ? 0 : timing('layout', 260), easing: cubicOut });
}

const reframes = new WeakMap<HTMLElement, { version: number; animation?: Animation }>();
// Change layout once, then interpolate the live canvas from its visible bounds.
// Input cancels the wrapper transform before the editor reads pointer coordinates.
export async function reframeUI(node: HTMLElement | null | undefined, change: () => Promise<void>) {
  if (!node) { await change(); return; }
  const previous = reframes.get(node), before = node.getBoundingClientRect();
  previous?.animation?.cancel();
  const state = { version: (previous?.version ?? 0) + 1, animation: undefined as Animation | undefined };
  reframes.set(node, state);
  const scope = node.closest<HTMLElement>('.editor-app');
  if (scope) scope.dataset.uiReframing = '';
  try {
    await change();
    if (reframes.get(node) !== state || !node.isConnected) return;
    const after = node.getBoundingClientRect();
    if (!before.width || !before.height || !after.width || !after.height) return;
    state.animation = animate(node, [
      { transformOrigin: '0 0', transform: `translate(${before.x - after.x}px, ${before.y - after.y}px) scale(${before.width / after.width}, ${before.height / after.height})` },
      { transformOrigin: '0 0', transform: 'none' }
    ], timing('layout', 260));
    const input = node.closest<HTMLElement>('.canvas-stage') ?? node;
    const cancel = (event?: Event) => {
      // Mode navigation captures the current frame for its own reversal.
      if (event instanceof KeyboardEvent && (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'Backslash'))) return;
      state.animation?.cancel();
    };
    if (state.animation) {
      input.addEventListener('pointerdown', cancel, true); input.addEventListener('keydown', cancel, true);
      window.addEventListener('resize', cancel);
      void state.animation.finished.catch(() => {}).finally(() => {
        input.removeEventListener('pointerdown', cancel, true); input.removeEventListener('keydown', cancel, true);
        window.removeEventListener('resize', cancel);
        if (reframes.get(node) === state) reframes.delete(node);
      });
    } else reframes.delete(node);
  } finally {
    if (reframes.get(node) === state || !reframes.has(node)) scope?.removeAttribute('data-ui-reframing');
  }
}

// Keep the live canvas/preview mounted. Cancelling on input makes geometry immediate.
export function uiChange(node: HTMLElement, key: unknown) {
  let current = key, animation: Animation | undefined;
  const cancel = () => { animation?.cancel(); animation = undefined; };
  node.addEventListener('pointerdown', cancel, true);
  node.addEventListener('keydown', cancel, true);
  return {
    update(next: unknown) {
      if (next === current) return;
      current = next;
      // Live status stays readable and still; the surrounding surface owns entry.
      if (node.matches('[role="status"],[role="alert"],[aria-live],.save-state') || node.querySelector('[role="status"],[role="alert"],[aria-live]')) { cancel(); return; }
      const previous = animation?.playState === 'running' ? getComputedStyle(node) : null;
      const opacity = previous?.opacity ?? '.85';
      cancel();
      animation = animate(node, [{ opacity }, { opacity: 1 }], timing('reveal', 180));
    },
    destroy() { cancel(); node.removeEventListener('pointerdown', cancel, true); node.removeEventListener('keydown', cancel, true); }
  };
}

// A single marker moves between tabs instead of each tab flashing independently.
export function uiIndicator(node: HTMLElement) {
  node.dataset.uiIndicator = '';
  let frame = 0;
  const observed = new Set<Element>();
  const write = (name: string, value: string) => { if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value); };
  const update = () => {
    const selected = node.querySelector<HTMLElement>('button.active,button[aria-pressed="true"],button[aria-selected="true"]');
    if (!selected) { write('--ui-marker-opacity', '0'); return; }
    const x = selected.offsetLeft, y = selected.offsetTop, width = selected.offsetWidth, height = selected.offsetHeight;
    write('--ui-marker-x', `${x}px`); write('--ui-marker-y', `${y}px`);
    write('--ui-marker-w', `${width}px`); write('--ui-marker-h', `${height}px`); write('--ui-marker-opacity', '1');
  };
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
  const resize = new ResizeObserver(schedule);
  const observeButtons = () => {
    const buttons = new Set(node.querySelectorAll('button'));
    for (const button of observed) if (!buttons.has(button as HTMLButtonElement)) { resize.unobserve(button); observed.delete(button); }
    for (const button of buttons) if (!observed.has(button)) { resize.observe(button, {box: 'border-box'}); observed.add(button); }
  };
  const observer = new MutationObserver(() => { observeButtons(); schedule(); });
  observer.observe(node, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-pressed', 'aria-selected'] });
  resize.observe(node, {box: 'border-box'}); observeButtons();
  update();
  return { destroy() {
    cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect(); delete node.dataset.uiIndicator;
    for (const suffix of ['x', 'y', 'w', 'h', 'opacity']) node.style.removeProperty(`--ui-marker-${suffix}`);
  } };
}

export function uiCurrentSlide(node: HTMLElement, _id: string | undefined) {
  scrollAreas.add(node);
  let active:ReturnType<typeof import('./slide-rail-scroll-controller')['slideRailScroll']>|undefined,disposed=false;
  const frame=requestAnimationFrame(()=>{void import('./slide-rail-scroll-controller').then(module=>{if(!disposed)active=module.slideRailScroll(node,reducedUI);});});
  return {update(){active?.update();},destroy(){disposed=true;cancelAnimationFrame(frame);active?.destroy();scrollAreas.delete(node);}};
}

export function uiFocus(node: HTMLElement) {
  const frame = requestAnimationFrame(() => { if (node.isConnected) node.focus({preventScroll: true}); });
  return { destroy() { cancelAnimationFrame(frame); } };
}

// Native details retain their keyboard semantics, including during a reversal.
export function uiDisclosure(node: HTMLDetailsElement, onopenchange?: (open: boolean) => void) {
  const summary = node.querySelector('summary');
  let animation: Animation | undefined, expanded = node.open, epoch = 0;
  const previousExpanded = summary?.getAttribute('aria-expanded') ?? null;
  const inertContent = new Map<HTMLElement, boolean>();
  function contentAvailable(available: boolean) {
    if (available) { for (const [child, inert] of inertContent) child.inert = inert; inertContent.clear(); return; }
    for (const child of node.children) {
      if (!(child instanceof HTMLElement) || child === summary) continue;
      if (!inertContent.has(child)) inertContent.set(child, child.inert);
      child.inert = true;
    }
    if (document.activeElement instanceof Node && node.contains(document.activeElement) && !summary?.contains(document.activeElement)) summary?.focus({preventScroll: true});
  }
  function reset() { node.style.height = ''; node.style.overflow = ''; }
  async function click(event: MouseEvent) {
    if (event.target instanceof Element && event.target.closest('a,button,input')) return;
    event.preventDefault();
    const version = ++epoch, height = node.getBoundingClientRect().height;
    if (!animation) expanded = node.open;
    animation?.cancel(); expanded = !expanded;
    summary?.setAttribute('aria-expanded', String(expanded));
    contentAvailable(expanded);
    if (reducedUI()) { node.open = expanded; onopenchange?.(expanded); contentAvailable(true); reset(); return; }
    node.open = true;
    reset();
    let target = node.getBoundingClientRect().height;
    if (!expanded) { node.open = false; target = node.getBoundingClientRect().height; node.open = true; }
    node.style.overflow = 'hidden';
    animation = animate(node, [{ height: `${height}px` }, { height: `${target}px` }], timing('layout', 260));
    await animation?.finished.catch(() => {});
    if (version === epoch) { node.open = expanded; onopenchange?.(expanded); contentAvailable(true); reset(); animation = undefined; }
  }
  summary?.addEventListener('click', click);
  return { update(next: typeof onopenchange) { onopenchange = next; }, destroy() {
    // A panel may unmount mid-animation, before native toggle/bind:open settles.
    const finalOpen = animation ? expanded : node.open;
    epoch++; animation?.cancel(); contentAvailable(true); reset(); summary?.removeEventListener('click', click);
    onopenchange?.(finalOpen);
    if (previousExpanded === null) summary?.removeAttribute('aria-expanded'); else summary?.setAttribute('aria-expanded', previousExpanded);
  } };
}
