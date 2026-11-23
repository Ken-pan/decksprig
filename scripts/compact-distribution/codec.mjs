import {execFileSync} from 'node:child_process';
import {cp, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {brotliCompressSync, constants} from 'node:zlib';
import {writeNotices} from './notices.mjs';

export async function stageCodec(destination, targetDir, {thumbnail = false} = {}) {
  if (!process.env.WASI_SDK_PATH) throw new Error('Set WASI_SDK_PATH to build the artwork codec.');
  const sdk = resolve(process.env.WASI_SDK_PATH);
  const cargoManifest = join(import.meta.dirname, 'Cargo.toml');
  const binaryRoot = resolve(process.env.CARGO_TARGET_DIR || targetDir);
  const env = {
    ...process.env, CARGO_TARGET_DIR: binaryRoot,
    CC_wasm32_wasip1: join(sdk, 'bin/clang'), AR_wasm32_wasip1: join(sdk, 'bin/llvm-ar'),
    CC_SHELL_ESCAPED_FLAGS: '1',
    CFLAGS_wasm32_wasip1: `--sysroot="${join(sdk, 'share/wasi-sysroot')}"`,
  };
  const cargo = args => execFileSync('cargo', [...args, '--locked', '--manifest-path', cargoManifest], {env, stdio: 'inherit'});
  cargo(['build', '--release', '--bin', 'decksprig-archive']);
  cargo(['build', '--release', '--bin', 'decksprig-archive', '--target', 'wasm32-wasip1']);
  const wasmRoot = join(binaryRoot, 'wasm32-wasip1/release');
  const wasm = await readFile(join(wasmRoot, 'decksprig-archive.wasm'));
  await writeFile(join(destination, 'decoder.wasm.br'), brotliCompressSync(wasm, {params: {[constants.BROTLI_PARAM_QUALITY]: 9}}));
  await cp(join(import.meta.dirname, 'decode.mjs'), join(destination, 'decode.mjs'));
  let thumbnailDecoder;
  if (thumbnail) {
    cargo(['build', '--release', '--lib', '--target', 'wasm32-wasip1']);
    const reactor = await readFile(join(wasmRoot, 'decksprig_thumbnail.wasm'));
    thumbnailDecoder = join(destination, 'thumbnail-decoder.wasm.br');
    await writeFile(thumbnailDecoder, brotliCompressSync(reactor, {params: {[constants.BROTLI_PARAM_QUALITY]: 9}}));
  }
  await writeNotices(destination, cargoManifest, sdk, env);
  return {
    encode: join(binaryRoot, 'release', process.platform === 'win32' ? 'decksprig-archive.exe' : 'decksprig-archive'),
    decode: ['--disable-warning=ExperimentalWarning', join(destination, 'decode.mjs')],
    thumbnailDecoder,
  };
}
