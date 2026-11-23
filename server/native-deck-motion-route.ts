import type {IncomingMessage} from 'node:http';
import {requestBytes} from './request-body';
import {NATIVE_DECK_LIMITS,type NativeDeckMotionCapture} from '../src/core/native-deck-motion';
import {readNativeDeckMotionCanvas} from './native-deck-motion';

const failure=(message:string,status:number)=>Object.assign(new Error(message),{status});
/** Same-origin, canvas-only upload. A native archive's source identity stays unverified. */
export async function nativeDeckMotionCanvasRoute(req:IncomingMessage,port:number,readBody=requestBytes,decode:(bytes:Uint8Array,archiveBytes:number)=>Promise<NativeDeckMotionCapture>=readNativeDeckMotionCanvas){
 const origin=req.headers.origin;if(origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(origin))throw failure('Same-origin requests only',403);
 if(req.method!=='POST')throw failure('Choose a native backup before reading its motion.',405);
 if(req.headers['content-type']!=='application/octet-stream')throw failure('Send only the extracted native canvas as binary data.',415);
 const raw=req.headers['x-native-deck-archive-bytes'];if(typeof raw!=='string'||!/^[1-9]\d{0,10}$/.test(raw))throw failure('The native backup size is missing or invalid.',400);
 const archiveBytes=Number(raw);if(!Number.isSafeInteger(archiveBytes)||archiveBytes<22)throw failure('The native backup size is invalid.',400);if(archiveBytes>NATIVE_DECK_LIMITS.archive)throw failure('The native backup exceeds the supported size.',413);
 let canvas:Uint8Array;try{canvas=await readBody(req,NATIVE_DECK_LIMITS.canvas);}catch(error){if((error as {status?:number}).status===413)throw failure('The extracted native motion exceeds 2 MB. Existing motion is unchanged.',413);throw error;}
 if(!canvas.length||canvas.length>NATIVE_DECK_LIMITS.canvas)throw failure('The extracted native canvas size is invalid. Existing motion is unchanged.',400);
 try{return await decode(canvas,archiveBytes);}catch(error){throw failure(error instanceof Error?error.message:'The native motion could not be read. Existing motion is unchanged.',400);}
}
