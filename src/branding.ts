import {BRAND_NAME} from './brand-name.js';
import { version } from '../package.json';
import { BRAND_ASSETS } from './brand-assets';

export const BRAND = { name: BRAND_NAME, description: 'Portfolios and presentations', version } as const;

let geometry: Promise<string> | undefined;
let appearanceSignature = '', revision = 0;
const entities: Record<string, string> = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'};
const escapeAttribute = (value: string) => value.replace(/[&<>"]/g, character => entities[character]);

function logoGeometry() {
  return geometry ??= fetch(BRAND_ASSETS.logo).then(async response => {
    if (!response.ok) throw new Error('Brand mark unavailable');
    const source = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
    const paths = [...source.querySelectorAll('path')].map(path => `<path d="${escapeAttribute(path.getAttribute('d') || '')}" fill-rule="${path.getAttribute('fill-rule') === 'evenodd' ? 'evenodd' : 'nonzero'}"/>`).join('');
    if (!paths) throw new Error('Brand mark has no paths');
    return paths;
  }).catch(error => { geometry = undefined; throw error; });
}

function resolvedColor(role: string) {
  const probe = document.createElement('span');
  probe.style.cssText = `all:initial;position:fixed;visibility:hidden;pointer-events:none;color:var(${role})`;
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d');
  if (!context) return color;
  context.fillStyle = color; context.fillRect(0, 0, 1, 1);
  return '#' + [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(value => value.toString(16).padStart(2, '0')).join('');
}

/** Browser chrome follows the same semantic roles as the application's controls. */
export function syncBrowserBrand() {
  const background = resolvedColor('--accent'), foreground = resolvedColor('--text-on-accent');
  const chrome = resolvedColor('--surface-chrome');
  const palette = document.documentElement.dataset.palette || 'indigo';
  const signature = `${palette}:${background}:${foreground}:${chrome}`;
  if (signature === appearanceSignature) return;
  appearanceSignature = signature;
  const current = ++revision;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', chrome);
  void logoGeometry().then(paths => {
    if (current !== revision) return;
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) return;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${background}"/><g transform="translate(1.5 1.5) scale(.29)" fill="${foreground}">${paths}</g></svg>`;
    icon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    icon.dataset.palette = palette;
    icon.dataset.brandRevision = BRAND_ASSETS.revision;
  }).catch(() => { if (current === revision) appearanceSignature = ''; });
}

export function installBrowserBrand() {
  const media = matchMedia('(prefers-color-scheme: dark)');
  let frame = 0;
  const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(syncBrowserBrand); };
  media.addEventListener('change', update);
  return () => { cancelAnimationFrame(frame); media.removeEventListener('change', update); };
}

/** Standalone library pages read the editor preference without changing it. */
export function installSavedBrand() {
  const restore = () => {
    let saved: { theme?: string; palette?: string } = {};
    try { const value = JSON.parse(localStorage.getItem('deck-studio-settings') || '{}'); if (value && typeof value === 'object') saved = value; } catch { /* retain defaults */ }
    if (saved.theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = saved.theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.palette = ['forest', 'graphite', 'paper', 'indigo', 'ocean', 'violet', 'rose'].includes(saved.palette || '') ? saved.palette : 'indigo';
    syncBrowserBrand();
  };
  restore();
  const dispose = installBrowserBrand();
  const storage = (event: StorageEvent) => { if (!event.key || event.key === 'deck-studio-settings') restore(); };
  window.addEventListener('storage', storage);
  return () => { dispose(); window.removeEventListener('storage', storage); };
}
