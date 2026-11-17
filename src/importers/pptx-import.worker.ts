import {importPptx} from './pptx';
import {packDocumentMedia, type PackedDocumentMedia} from '../core/document-media-transport';

export type PptxWorkerReply =
  | {type: 'source-ready'}
  | {type: 'document'; value: PackedDocumentMedia}
  | {type: 'error'; message: string};

const port = self as unknown as {
  onmessage: (event: MessageEvent<File>) => void;
  postMessage: (message: PptxWorkerReply) => void;
};

port.onmessage = async ({data: file}) => {
  try {
    const deck = await importPptx(await file.arrayBuffer(), file.name, () => port.postMessage({type: 'source-ready'}));
    port.postMessage({type: 'document', value: packDocumentMedia(deck)});
  } catch (error) {
    port.postMessage({type: 'error', message: error instanceof Error ? error.message : String(error)});
  }
};
