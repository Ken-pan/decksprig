import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createBrotliDecompress, createGzip } from 'node:zlib';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { packedImage, restoreImage, packagedExample, restoreExample } from './runtime-assets';

const mime: Record<string, string> = {'.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.txt': 'text/plain'};
const compressible = new Set(['.js', '.mjs', '.css', '.html', '.json', '.svg', '.txt', '.ttf', '.otf']);
const compactTypes = new Set([...compressible, '.fntdata', '.wasm', '.png']);

export function preferredEncodings(header = ''): ('br' | 'gzip')[] {
  const weights = new Map(header.toLowerCase().split(',').map(part => {
    const [name, ...parameters] = part.trim().split(';');
    const q = parameters.find(parameter => parameter.trim().startsWith('q='));
    const weight = q ? Number(q.trim().slice(2)) : 1;
    return [name, Number.isFinite(weight) && weight >= 0 && weight <= 1 ? weight : 0];
  }));
  return (['br', 'gzip'] as const).filter(name => (weights.get(name) ?? weights.get('*') ?? 0) > 0)
    .sort((a, b) => (weights.get(b) ?? weights.get('*') ?? 0) - (weights.get(a) ?? weights.get('*') ?? 0));
}

export async function serveStatic(req: IncomingMessage, res: ServerResponse, file: string) {
  const extension = extname(file);
  const original = await stat(file).catch(error => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  const artwork = original ? undefined : await packedImage(file);
  const example = original || artwork ? undefined : await packagedExample(file);
  const reconstructed = artwork ?? example;
  const packed = !original && !reconstructed && compactTypes.has(extension);
  let selected = reconstructed?.file ?? (packed ? file + '.stored.br' : file);
  const source = original ?? await stat(selected);
  if (!source.isFile()) throw Object.assign(new Error('File not found.'), {status: 404});
  let info = source, encoding: 'br' | 'gzip' | undefined;
  if (packed) {
    encoding = preferredEncodings(req.headers['accept-encoding'])[0];
  } else if (!reconstructed && compressible.has(extension)) {
    for (const candidate of preferredEncodings(req.headers['accept-encoding'])) {
      const path = file + (candidate === 'br' ? '.br' : '.gz');
      const compressed = await stat(path).catch(() => null);
      if (compressed?.isFile() && compressed.mtimeMs >= source.mtimeMs && compressed.size < source.size) {
        selected = path; info = compressed; encoding = candidate; break;
      }
    }
  }
  const etag = reconstructed ? `"${reconstructed.sha256}"` : `W/"${info.size.toString(16)}-${info.mtimeMs.toString(16)}-${packed?'stored-':''}${encoding || 'identity'}"`;
  res.setHeader('Content-Type', mime[extension] || 'application/octet-stream');
  res.setHeader('Cache-Control', /\/assets\/[^/]+-[\w-]{8,}\.(js|css)$/.test(file)
    ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.setHeader('ETag', etag);
  res.setHeader('Last-Modified', source.mtime.toUTCString());
  if (packed || compressible.has(extension)) res.setHeader('Vary', 'Accept-Encoding');
  if (encoding) res.setHeader('Content-Encoding', encoding);
  const noneMatch = req.headers['if-none-match'];
  const modifiedSince = req.headers['if-modified-since'];
  const unchanged = noneMatch ? noneMatch.split(',').map(tag => tag.trim()).some(tag => tag === '*' || tag.replace(/^W\//, '') === etag.replace(/^W\//, ''))
    : modifiedSince && Math.floor(source.mtimeMs / 1000) * 1000 <= Date.parse(modifiedSince);
  if (unchanged) { res.writeHead(304); res.end(); return; }
  if (artwork || example) {
    const bytes = req.method === 'HEAD' ? undefined : artwork ? await restoreImage(artwork) : await restoreExample(example!);
    res.setHeader('Content-Length', reconstructed!.bytes);
    res.writeHead(200);
    res.end(bytes);
    return;
  }
  if (!packed || encoding === 'br') res.setHeader('Content-Length', info.size);
  res.writeHead(200);
  if (req.method === 'HEAD') { res.end(); return; }
  if (!packed || encoding === 'br') await pipeline(createReadStream(selected), res);
  else if (encoding === 'gzip') await pipeline(createReadStream(selected), createBrotliDecompress(), createGzip(), res);
  else await pipeline(createReadStream(selected), createBrotliDecompress(), res);
}
