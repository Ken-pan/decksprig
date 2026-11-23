import {abortable} from './async-abort';
import {MEDIA_REVISION_HEADER} from './document-media-update';
// Keep this build-time branch beside the import so local builds omit the browser backend.
export async function jsonRequest<T = any>(url: string, method = 'GET', body?: unknown, transport: typeof fetch = fetch, options:{minimal?:boolean|'receipt';signal?:AbortSignal;compact?:boolean;documentRevision?:boolean;onMediaToken?:(token:string|null)=>void} = {}): Promise<T> {
  if (import.meta.env?.VITE_DECK_RUNTIME === 'browser') { options.signal?.throwIfAborted();const {browserJson}=await abortable(import('./web/api'),options.signal);const value=await abortable(browserJson(url,method,body,{},options.signal),options.signal);return options.minimal?undefined as T:value; }
  let payload=body;
  if(options.compact&&body){
    const value=body as {schema?:string;deck?:import('./model').Deck};
    if(value.schema==='deck-studio/1'||value.deck?.schema==='deck-studio/1'){
      const {documentFile}=await import('./document-file');
      payload=value.schema==='deck-studio/1'?documentFile(body as import('./model').Deck):{...value,deck:documentFile(value.deck!)};
    }
  }
  const headers: Record<string, string> = {Accept:'application/vnd.deck-studio+json, application/json'};
  if (body) headers['Content-Type'] = 'application/json';
  if (options.minimal) headers.Prefer = 'return=minimal';
  if (method === 'PUT' && options.minimal === 'receipt') headers[MEDIA_REVISION_HEADER] = 'request';
  const response = await transport(url, {method, headers, body: body ? JSON.stringify(payload) : undefined, ...(options.signal?{signal:options.signal}:{})});
  if (response.ok && options.onMediaToken) options.onMediaToken(response.headers.get(MEDIA_REVISION_HEADER));
  if(response.ok&&options.minimal&&(options.minimal!=='receipt'||response.headers.get('Preference-Applied')!=='return=minimal')){await response.body?.cancel();return undefined as T;}
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'Could not complete the action. Try again.'), {status: response.status});
  if(data?.schema==='deck-studio/file-1'){
    if(options.documentRevision)return await (await import('./document-revision')).adoptDocumentFileRevision(data) as T;
    return (await import('./document-file')).readDocumentFile(data) as T;
  }
  return data;
}
