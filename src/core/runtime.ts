import {abortable} from './async-abort';
export const isBrowserEdition = import.meta.env?.VITE_DECK_RUNTIME === 'browser';
export const activeDocumentKey = isBrowserEdition ? 'deck-studio-web-active' : 'deck-studio-active';
export const savedDocumentLabel = isBrowserEdition ? 'Saved in browser' : 'Saved locally';

export async function installBrowserTransport() {
  if (!isBrowserEdition) return;
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return nativeFetch(input, init);
    const signal = init?.signal !== undefined ? init.signal ?? undefined : input instanceof Request ? input.signal : undefined;
    signal?.throwIfAborted();
    const method = init?.method || (input instanceof Request ? input.method : 'GET');
    let body: unknown;
    if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch {} }
    else if (input instanceof Request && /json/.test(input.headers.get('content-type') || '')) body = await abortable(input.clone().json(),signal);
    const {browserResponse} = await abortable(import('./web/api'),signal);
    return browserResponse(url, method, body,signal);
  };
}

export function readActiveDocument(){try{return localStorage.getItem(activeDocumentKey);}catch{return null;}}
export function rememberActiveDocument(id:string){try{localStorage.setItem(activeDocumentKey,id);}catch{/* The document remains in IndexedDB when this optional preference is unavailable. */}}
