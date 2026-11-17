import {jsonRequest as direct} from './json-request';
import {DOCUMENT_FRAME_ACCEPT} from './document-frame-format.mjs';
/** Keep main-thread browser dispatch out of worker transports and native startup. */
const browserRequest:typeof direct=async(...args)=>(await import('./browser-client-read')).browserJsonRequest(...args);
export const jsonRequest:typeof direct=import.meta.env?.VITE_DECK_RUNTIME==='browser'?browserRequest:direct;

declare global {
  interface Window {
    decksprigDocumentEntry?: {path: string; claim: (signal?: AbortSignal | null) => Promise<Response | undefined>};
  }
}

const localDocument:typeof direct = async (url, method='GET', body, transport = fetch, options) => {
  const entry = typeof window !== 'undefined' ? window.decksprigDocumentEntry : undefined;
  const request:typeof fetch = entry?.path===url&&method==='GET'&&transport===fetch ? async (input, init) => {
    const response = await entry.claim(init?.signal);
    init?.signal?.throwIfAborted();
    return response ?? fetch(input, init);
  } : transport;

  if(method!=='GET'||!options?.documentRevision||typeof ReadableStream!=='function'
      ||typeof (Uint8Array.prototype as Uint8Array & {toBase64?:unknown}).toBase64!=='function'){
    return direct(url,method,body,request,options);
  }
  const [response,{readLocalDocumentResponse}]=await Promise.all([
    request(url,{method,signal:options.signal,headers:{Accept:DOCUMENT_FRAME_ACCEPT}}),
    import('./document-frame-reader'),
  ]);
  return readLocalDocumentResponse<any>(url,response,options);
};

export const workspaceDocumentRequest:typeof direct = import.meta.env?.VITE_DECK_RUNTIME === 'browser' ? browserRequest : localDocument;
