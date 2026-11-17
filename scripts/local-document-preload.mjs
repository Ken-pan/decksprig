import {DOCUMENT_FRAME_ACCEPT} from '../src/core/document-frame-format.mjs';

// Runs before the editor's module graph is ready, only in the local build.
function warmExplicitDocument(frameAccept) {
  const id = new URLSearchParams(location.search).get('document');
  if (!id || !/^[a-zA-Z0-9_.:-]{1,120}$/.test(id)) return;
  const path = '/api/decks/' + id;
  const controller = new AbortController();
  const request = fetch(path, {
    headers: {Accept: typeof Uint8Array.prototype.toBase64==='function'&&typeof ReadableStream==='function'
      ? frameAccept : 'application/vnd.deck-studio+json, application/json'},
    signal: controller.signal,
  }).catch(() => undefined);
  const timer = setTimeout(() => {
    delete window.decksprigDocumentEntry;
    controller.abort();
  }, 10_000);
  window.decksprigDocumentEntry = {
    path,
    claim(signal) {
      clearTimeout(timer);
      delete window.decksprigDocumentEntry;
      if (signal?.aborted) controller.abort(signal.reason);
      else signal?.addEventListener('abort', () => controller.abort(signal.reason), {once: true});
      return request;
    },
  };
}

export function localDocumentPreload() {
  return {
    name: 'local-document-preload',
    apply: 'build',
    transformIndexHtml(_html, context) {
      if (!context.filename.endsWith('/index.html')) return;
      return [{tag: 'script', children: `(${warmExplicitDocument.toString()})(${JSON.stringify(DOCUMENT_FRAME_ACCEPT)});`, injectTo: 'head-prepend'}];
    },
  };
}
