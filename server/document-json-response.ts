import type {IncomingMessage,ServerResponse} from 'node:http';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import type {Deck} from '../src/core/model';
import {boundedDocumentJsonParts} from '../src/core/document-json-parts';
import {documentFile,DOCUMENT_MEDIA_TYPE} from '../src/core/document-file';
import {DOCUMENT_FRAME_TYPE} from '../src/core/document-frame-format.mjs';
import {prepareDocumentFrames} from './document-frame-response';

function accepts(req:IncomingMessage|undefined,mime:string){
  return req?.headers.accept?.split(',').some(value=>{
    const [type,...parameters]=value.toLowerCase().split(';').map(part=>part.trim());
    const weight=parameters.find(part=>part.startsWith('q='));
    return type===mime&&(!weight||Number(weight.slice(2))>0&&Number(weight.slice(2))<=1);
  });
}
export function wantsDocumentFrames(req:IncomingMessage|undefined){
  return req?.method==='GET'&&Boolean(accepts(req,DOCUMENT_FRAME_TYPE));
}

// Document responses follow network backpressure, including when reading media
// from storage after the response has begun.
async function sendParts(res:ServerResponse,parts:Iterable<string|Buffer>|AsyncIterable<string|Buffer>,type:string,status:number){
  if(res.headersSent||res.destroyed||res.writableEnded)return;
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','Vary':'Accept'});
  try{await pipeline(Readable.from(parts,{objectMode:false,highWaterMark:262_144}),res);}
  catch{res.destroy();} // A disconnected client must stop producing more parts.
}
export function sendDocumentFrames(res:ServerResponse,parts:AsyncIterable<Buffer>,status=200){
  return sendParts(res,parts,DOCUMENT_FRAME_TYPE,status);
}
export function sendDocumentJson(res:ServerResponse,deck:Deck,status=200){
  if(res.headersSent||res.destroyed||res.writableEnded)return;
  const frames=wantsDocumentFrames(res.req)?prepareDocumentFrames(deck):undefined;
  if(frames)return sendDocumentFrames(res,frames,status);
  const compact=accepts(res.req,DOCUMENT_MEDIA_TYPE);
  return sendParts(res,boundedDocumentJsonParts(compact?documentFile(deck):deck),
    `${compact?DOCUMENT_MEDIA_TYPE:'application/json'}; charset=utf-8`,status);
}
