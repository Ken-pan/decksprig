import {open, readFile} from 'node:fs/promises';
import {brotliDecompressSync} from 'node:zlib';
import {WASI} from 'node:wasi';

const input = process.argv[2] ? await open(process.argv[2], 'r') : undefined;
try {
  const wasi = new WASI({version: 'preview1', args: ['decksprig-archive', 'unpack'], stdin: input?.fd ?? 0, returnOnExit: true});
  const decoder = brotliDecompressSync(await readFile(new URL('decoder.wasm.br', import.meta.url)));
  const {instance} = await WebAssembly.instantiate(decoder, wasi.getImportObject());
  process.exitCode = wasi.start(instance);
} finally { await input?.close(); }
