import {open} from 'node:fs/promises';
import {inflateRawSync} from 'node:zlib';
import * as zlib from 'node:zlib';
import {decodeNativeDeckMotionCanvas,extractNativeDeckMotion,type NativeDeckCodecs} from '../src/core/native-deck-motion';

/** Node built-ins only; no Python, browser codec, keys, or plugin API required. */
export const nativeDeckCodecs:NativeDeckCodecs={
 deflateRaw:async(bytes,limit)=>inflateRawSync(bytes,{maxOutputLength:limit}),
 zstd:async(bytes,limit)=>{const decode=(zlib as unknown as {zstdDecompressSync?:(bytes:Uint8Array,options:{maxOutputLength:number})=>Uint8Array}).zstdDecompressSync;if(!decode)throw Error('This Node.js version cannot decode native .deck Zstandard data. Use Node22.15 or newer; existing motion is unchanged.');return decode(bytes,{maxOutputLength:limit});},
};

/** Accept only the small extracted canvas member, never a whole uploaded backup. */
export async function readNativeDeckMotionCanvas(bytes:Uint8Array,archiveBytes:number){return decodeNativeDeckMotionCanvas(bytes,archiveBytes,nativeDeckCodecs);}

/** Low-level user-selected-file adapter; no public filesystem endpoint is added. */
export async function readNativeDeckMotionFile(path:string){
 const file=await open(path,'r');try{const before=await file.stat();if(!before.isFile())throw Error('Select a regular native .deck file.');const capture=await extractNativeDeckMotion({size:before.size,read:async(offset,length)=>{const bytes=new Uint8Array(length),result=await file.read(bytes,0,length,offset);return bytes.subarray(0,result.bytesRead);}},nativeDeckCodecs);const after=await file.stat();if(after.size!==before.size||after.mtimeMs!==before.mtimeMs)throw Error('The native .deck file changed during import. Select the saved copy again; existing motion is unchanged.');return capture;}finally{await file.close();}
}
