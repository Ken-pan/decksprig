import test from 'node:test';
import assert from 'node:assert/strict';
import {uiChange, uiDisclosure, uiPresence, setUIMotion} from '../src/ui-motion';

class AnimationStub {
  playState = 'running';
  finished: Promise<void>;
  private resolve!: () => void;
  constructor(public frames: Keyframe[]) { this.finished = new Promise(resolve => this.resolve = resolve); }
  cancel() { this.playState = 'idle'; this.resolve(); }
  finish() { this.playState = 'finished'; this.resolve(); }
}
class ElementStub {
  dataset: Record<string, string> = {};
  style = {height: '', overflow: ''};
  attributes = new Map<string, string>();
  listeners = new Map<string, (event: any) => void>();
  children: ElementStub[] = [];
  animations: AnimationStub[] = [];
  inert = false; open = false; status = false;
  summary?: ElementStub;
  getAttribute(key: string) { return this.attributes.get(key) ?? null; }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  removeAttribute(key: string) { this.attributes.delete(key); }
  toggleAttribute(key: string, force = !this.attributes.has(key)) {
    if (force) this.setAttribute(key, '');
    else this.removeAttribute(key);
    return force;
  }
  querySelector() { return this.summary; }
  addEventListener(name: string, fn: (event: any) => void) { this.listeners.set(name, fn); }
  removeEventListener(name: string) { this.listeners.delete(name); }
  closest() { return null; }
  matches() { return this.status; }
  contains(node: ElementStub): boolean { return this === node || this.children.some(child => child.contains(node)); }
  focus() { (globalThis.document as any).activeElement = this; }
  getBoundingClientRect() { return {height: this.open ? 160 : 40}; }
  animate(frames: Keyframe[]) { const a = new AnimationStub(frames); this.animations.push(a); return a; }
}
function environment() {
  const root = new ElementStub(), originals = new Map<string, PropertyDescriptor | undefined>();
  const values: Record<string, unknown> = {
    window: {}, document: {documentElement: root, activeElement: null, querySelectorAll: () => []},
    HTMLElement: ElementStub, Element: ElementStub, Node: ElementStub,
    matchMedia: () => ({matches: false}),
    getComputedStyle: () => ({getPropertyValue: () => '', opacity: '.9'})
  };
  for (const [key, value] of Object.entries(values)) { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, {configurable: true, value}); }
  return {root, restore() { for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key]; } }};
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
function disclosure(open = false, onopenchange?: (open:boolean)=>void) {
  const node = new ElementStub(), summary = new ElementStub(), content = new ElementStub();
  node.open = open; node.summary = summary; node.children = [summary, content];
  const action = uiDisclosure(node as unknown as HTMLDetailsElement, onopenchange);
  const click = () => summary.listeners.get('click')!({target: summary, preventDefault() {}});
  return {node, summary, content, action, click};
}

test('live status updates remain readable without an extra animation', () => {
  const env = environment();
  try { const node = new ElementStub(); node.status = true; const action = uiChange(node as unknown as HTMLElement, 0); action.update(1); assert.equal(node.animations.length, 0); action.destroy(); }
  finally { env.restore(); }
});
test('containers with live feedback do not fade the status together with their content', () => {
  const env = environment();
  try { const node = new ElementStub(); node.summary = new ElementStub(); const action = uiChange(node as unknown as HTMLElement, 0); action.update(1); assert.equal(node.animations.length, 0); action.destroy(); }
  finally { env.restore(); }
});

test('content changes do not move controls and pointer input cancels their fade', async () => {
  const env = environment();
  try { const node = new ElementStub(), action = uiChange(node as unknown as HTMLElement, 0); action.update(1); assert.equal(node.animations.length, 1); assert.ok(node.animations[0].frames.every(frame => !('translate' in frame) && !('transform' in frame))); node.listeners.get('pointerdown')!({}); assert.equal(node.animations[0].playState, 'idle'); action.destroy(); await settle(); }
  finally { env.restore(); }
});

test('closing a disclosure makes content inert immediately and returns its focus', async () => {
  const env = environment();
  try { const d = disclosure(true); (document as any).activeElement = d.content; d.click(); assert.equal(d.node.open, true); assert.equal(d.content.inert, true); assert.equal(d.summary.getAttribute('aria-expanded'), 'false'); assert.equal(document.activeElement, d.summary); d.node.animations[0].finish(); await settle(); assert.equal(d.node.open, false); assert.equal(d.content.inert, false); d.action.destroy(); }
  finally { env.restore(); }
});

test('rapid disclosure reversal keeps the latest intent and restores existing inert state', async () => {
  const env = environment();
  try { const d = disclosure(true), protectedChild = new ElementStub(); protectedChild.inert = true; d.node.children.push(protectedChild); d.click(); d.click(); assert.equal(d.content.inert, false); assert.equal(protectedChild.inert, true); d.node.animations.at(-1)!.finish(); await settle(); assert.equal(d.node.open, true); assert.equal(d.summary.getAttribute('aria-expanded'), 'true'); d.action.destroy(); assert.equal(protectedChild.inert, true); assert.equal(d.summary.getAttribute('aria-expanded'), null); }
  finally { env.restore(); }
});

test('unmounting a panel during disclosure motion preserves the latest intent', async () => {
  const env = environment();
  try {
    const values:boolean[]=[], closing=disclosure(true, open=>values.push(open));
    closing.click(); assert.equal(closing.node.open,true); closing.action.destroy(); await settle();
    assert.deepEqual(values,[false]); assert.equal(closing.node.style.height,'');
    const opening=disclosure(false,open=>values.push(open)); opening.click(); opening.click(); opening.click();
    opening.action.destroy(); await settle(); assert.deepEqual(values,[false,true]);
  } finally { env.restore(); }
});

test('switching to reduced motion settles a closing disclosure without canceling document motion', async () => {
  const env = environment();
  try { const d = disclosure(true), documentAnimation = new AnimationStub([{opacity: 1}]); d.click(); setUIMotion('reduced'); await settle(); assert.equal(d.node.open, false); assert.equal(d.content.inert, false); assert.equal(d.node.style.overflow, ''); assert.equal(documentAnimation.playState, 'running'); d.action.destroy(); }
  finally { env.restore(); }
});

test('reduced UI presence has no duration and surfaces never scale their text', () => {
  const env = environment();
  try {
    const node = new ElementStub();
    const presence = () => uiPresence(node as unknown as HTMLElement, {surface: true}, {direction: 'in'}) as {duration: number; css: (t: number) => string};
    assert(presence().duration > 0);
    assert.equal(node.getAttribute('data-ui-transition'), '');
    env.root.dataset.uiMotion = 'reduced';
    const transition = presence();
    assert.equal(transition.duration, 0);
    assert.equal(node.getAttribute('data-ui-transition'), null);
    assert.ok(!transition.css(.5).includes('scale:'));
  }
  finally { env.restore(); }
});
