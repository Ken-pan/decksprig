import { jsonRequest } from './json-request';
import {restoreDocumentMedia} from './document-media-transport';

const channel = globalThis as unknown as {postMessage: (value: unknown) => void; onmessage: (event: MessageEvent) => void};
channel.onmessage = async event => {
  const {id, url, minimal = false, method = 'PUT'} = event.data;
  const {media} = event.data;
  let body=event.data.body;
  try {
    if(media){const deck=restoreDocumentMedia(media);body=body?.schema==='deck-studio/1'?deck:{...body,deck};}
    const value = await jsonRequest(url,method,body,fetch,{minimal,compact:true});
    channel.postMessage({type: 'result', id, value});
  } catch (error) {
    const failure = error as Error & {status?: number};
    channel.postMessage({type: 'result', id, error: failure.message, status: failure.status});
  }
};
channel.postMessage({type: 'ready'});
