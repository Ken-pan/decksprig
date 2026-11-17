import { element, blankSlide, newDeck, type Deck } from '../core/model';
import type {PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, Util} from 'pdfjs-dist';

type PdfTask = Pick<PDFDocumentLoadingTask, 'promise' | 'destroy'>;
type Progress = (message:string)=>void;

export async function preparePdfRuntime() {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

async function loadPdf(data: ArrayBuffer | Uint8Array) {
  const pdfjs = await preparePdfRuntime();
  const task = pdfjs.getDocument({data: new Uint8Array(data)});
  return {task, transform: pdfjs.Util.transform};
}

export async function importPdf(data: ArrayBuffer | Uint8Array, name: string, progress:Progress = () => {}): Promise<Deck> {
  const {task, transform} = await loadPdf(data);
  return readPdfPages(task, name, progress, transform);
}

export async function importPdfReferences(data: ArrayBuffer | Uint8Array, progress: Progress, signal?: AbortSignal): Promise<string[]> {
  signal?.throwIfAborted();
  const {task} = await loadPdf(data);
  return readPdfReferences(task, progress, signal);
}

async function withPdf<T>(task: PdfTask, use: (pdf: PDFDocumentProxy) => Promise<T>) {
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 500) throw new Error('This PDF exceeds 500 pages. Import it in smaller batches.');
    return await use(pdf);
  } finally { await task.destroy(); }
}

async function renderPdfPages<T>(pdf: PDFDocumentProxy, progress:Progress,
  visit:(canvas:HTMLCanvasElement, page:PDFPageProxy, base: ReturnType<PDFPageProxy['getViewport']>) => T | Promise<T>,
  concurrency = 1, signal?: AbortSignal, opaque = false): Promise<T[]> {
  const pages = new Array<T>(pdf.numPages);
  let next = 1, failed = false;
  async function renderNext() {
    try {
      while (!failed && next <= pdf.numPages) {
        signal?.throwIfAborted();
        const i = next++;
        progress(`Reading PDF · ${i} / ${pdf.numPages}`);
        const page = await pdf.getPage(i);
        let canvas: HTMLCanvasElement | undefined;
        try {
          signal?.throwIfAborted();
          const base = page.getViewport({scale: 1});
          const viewport = page.getViewport({scale: Math.min(2, 1920 / base.width)});
          canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext('2d', opaque ? {alpha:false} : undefined)!;
          const rendering = page.render({canvasContext: context, viewport, canvas, ...(opaque ? {background:'#ffffff'} : {})});
          const abort = () => rendering.cancel();
          signal?.addEventListener('abort', abort, {once:true});
          try { await rendering.promise; }
          finally { signal?.removeEventListener('abort', abort); }
          signal?.throwIfAborted();
          pages[i-1] = await visit(canvas, page, base);
        } finally {
          if (canvas) { canvas.width = 0; canvas.height = 0; }
          page.cleanup();
        }
      }
    } catch (error) { failed = true; throw error; }
  }
  // PDF.js owns shared document buffers until both page slots have settled.
  const completed = await Promise.allSettled(Array.from({length: Math.min(concurrency, pdf.numPages)}, renderNext));
  const failure = completed.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  signal?.throwIfAborted();
  return pages;
}

async function encodeReference(canvas: HTMLCanvasElement) {
  if (typeof canvas.toBlob !== 'function' || typeof FileReader !== 'function') return canvas.toDataURL('image/png');
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return canvas.toDataURL('image/png');
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

let rgbPngSupport: Promise<boolean> | undefined;
async function probeRgbPng() {
  if (typeof HTMLCanvasElement !== 'function' || typeof FileReader !== 'function') return false;
  const probe = document.createElement('canvas');
  probe.width = 1;
  probe.height = 1;
  try {
    const context = probe.getContext('2d', {alpha:false});
    if (!context || typeof probe.toBlob !== 'function') return false;
    context.fillRect(0, 0, 1, 1);
    const blob = await new Promise<Blob | null>(resolve => probe.toBlob(resolve, 'image/png'));
    // PNG's IHDR color type is byte 25. Some browsers retain an alpha
    // channel when encoding an opaque canvas, so keep their existing path.
    return Boolean(blob?.type === 'image/png' && new Uint8Array(await blob.slice(25, 26).arrayBuffer())[0] === 2);
  } catch { return false; }
  finally { probe.width = 0; probe.height = 0; }
}

/** A converted source needs only the raster, since the editable objects are already imported. */
export function readPdfReferences(task: PdfTask, progress:Progress, signal?: AbortSignal) {
  return withPdf(task, async pdf=>renderPdfPages(pdf, progress, encodeReference, 2, signal, await (rgbPngSupport ??= probeRgbPng())));
}

/** Own the PDF task and each page's native buffers, including early failures. */
export function readPdfPages(task: PdfTask, name:string, progress:Progress, transform:typeof Util.transform):Promise<Deck> {
  return withPdf(task, async pdf=>{
    const first = await pdf.getPage(1);
    let v;
    try { v = first.getViewport({scale: 1}); } finally { first.cleanup(); }
    const width = 1440, height = Math.round(width * v.height / v.width);
    const slides = await renderPdfPages(pdf, progress, async (canvas, page, base)=>{
      const render = canvas.toDataURL('image/png');
      const s = blankSlide(); s.background = '#ffffff';
      s.source = {provider: 'PDF', render, fidelity: 'source-render', warnings: ['The source reference keeps static pages. The editable version extracts text only; fonts, images, and layout need rebuilding. PDF does not include animations or native objects.'], label: name};
      const text = await page.getTextContent();
      const factor = width / base.width;
      for (const item of text.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const t = transform(base.transform, item.transform), size = Math.hypot(t[2], t[3]) * factor;
        s.elements.push(element('text', {text: item.str, x: t[4] * factor, y: t[5] * factor - size, w: Math.max(4, item.width * factor), h: size * 1.4, fontSize: Math.max(4, size), name: 'PDF text'}));
      }
      if (base.width / base.height !== v.width / v.height) s.source.warnings.push('This file contains different page sizes. Source references are scaled proportionally to the current canvas.');
      return s;
    });
    const d = newDeck(name.replace(/\.pdf$/i, ''), slides, width, height);
    d.provenance = {provider: 'PDF', filename: name, importedAt: new Date().toISOString()}; return d;
  });
}
