import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {brotliDecompressSync} from 'node:zlib';

const load = createRequire(import.meta.url);
const maxInput = 1024 * 1024;
const maxEdge = 480;

export function createThumbnailDecoder(path) {
  // The ordinary PNG path never loads the optional codec or WASI.
  const {WASI} = load('node:wasi');
  const wasi = new WASI({version:'preview1',returnOnExit:true});
  const module = new WebAssembly.Module(brotliDecompressSync(readFileSync(path)));
  const instance = new WebAssembly.Instance(module,wasi.getImportObject());
  wasi.initialize(instance);
  const {memory,thumbnail_input,thumbnail_rgba,thumbnail_decode} = instance.exports;
  return bytes => {
    const invalid=()=>new Error('The packaged illustration thumbnail is invalid.');
    if(!bytes.length||bytes.length>maxInput)throw invalid();
    new Uint8Array(memory.buffer,thumbnail_input(),bytes.length).set(bytes);
    const size=thumbnail_decode(bytes.length),width=size>>>16,height=size&65535;
    if(!width||!height||width>maxEdge||height>maxEdge)throw invalid();
    // Own a copy before the next decode reuses the WASM output buffer.
    const data=Buffer.from(new Uint8Array(memory.buffer,thumbnail_rgba(),width*height*4));
    return {width,height,data};
  };
}
