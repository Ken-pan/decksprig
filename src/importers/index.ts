import {isBrowserEdition} from '../core/runtime';
import {decodeBase64} from '../core/base64';
import { uid, type Deck } from '../core/model';
import { importJson } from './structured';
import {importGoogleBundle} from './google-native';

export async function importFile(file: File, progress = (_s: string) => {}): Promise<Deck> {
  if (file.size > 100_000_000) throw new Error('Import files smaller than 100 MB.');
  let deck: Deck;
  if (/\.json$/i.test(file.name)) {const raw=JSON.parse(await file.text());
    if(raw.kind==='google-rest'&&!raw.googleSource){const response=await fetch('/api/import/google/source',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(raw)});const data=await response.json();if(!response.ok)throw new Error(data.error);raw.googleSource=data.googleSource;}
    deck=raw.kind==='google-rest'?await importGoogleBundle(raw):importJson(raw);}
  else if (/\.pdf$/i.test(file.name)) {
    const {importPdf} = await import('./pdf'); deck = await importPdf(await file.arrayBuffer(), file.name, progress);
  } else if (/\.pptx$/i.test(file.name)) {
    progress('Extracting PPTX objects…');
    const {readPptxFile} = await import('./pptx-file');
    const conversion = isBrowserEdition ? undefined : new AbortController();
    let references: ReturnType<typeof readPowerPointReferences> | undefined;
    const startReferences = conversion ? () => {
      references ??= readPowerPointReferences(file, progress, conversion.signal);
      return references;
    } : undefined;
    try { deck = await readPptxFile(file, startReferences); }
    catch (error) { conversion?.abort(); throw error; }
    if (startReferences) {
      const source = await startReferences();
      deck.slides.forEach((slide, index) => {
        if (!slide.source) return;
        if ('error' in source) slide.source.warnings.push(source.error);
        else if (source.pages[index]) {
          slide.source.render = source.pages[index];
          if (source.warning) slide.source.warnings.push(source.warning);
        }
      });
    }
    else deck.slides.forEach(s => s.source?.warnings.push('Browser import preserves editable PowerPoint objects. Desktop source rendering is available in the local edition.'));
  } else if (/\.key$/i.test(file.name)) {
    if(isBrowserEdition)throw new Error('Export the Keynote file as PowerPoint or PDF, then import it here. Native Keynote conversion requires the local Mac edition.');
    progress('Converting with Keynote…');
    const response = await fetch('/api/convert', {method: 'POST', headers: {'X-Filename': encodeURIComponent(file.name)}, body: file});
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    const {importPptx} = await import('./pptx');
    deck = await importPptx(decodeBase64(data.pptx), file.name);
    const {importPdf} = await import('./pdf');
    const pdf = await importPdf(decodeBase64(data.pdf), file.name, progress);
    deck.slides.forEach((s, i) => { s.source = {provider: 'Keynote', render: pdf.slides[i]?.source?.render, fidelity: 'source-render', warnings: [...(s.source?.warnings ?? []), data.warning]}; });
    deck.provenance = {...deck.provenance,provider: 'Keynote', filename: file.name, importedAt: new Date().toISOString()};
    deck.nativeSource = data.nativeSource;
  } else throw new Error('Import a PPTX, KEY, PDF, or Deck JSON file. For Figma .deck files, use a file link or the export plugin.');
  if(deck.provenance?.provider==='Figma')deck=await (await import('./figma-fonts')).prepareFigmaFonts(deck);
  deck.id = uid('deck'); deck.revision = 0; deck.updatedAt = new Date().toISOString(); return deck;
}


async function readPowerPointReferences(file: File, progress: (message:string) => void, signal: AbortSignal): Promise<{pages:string[]; warning:string|null} | {error:string}> {
  try {
    progress('Creating source references…');
    const [response, {importPdfReferences}] = await Promise.all([
      fetch('/api/convert', {method: 'POST', headers: {'X-Filename': encodeURIComponent(file.name), Accept: 'application/pdf'}, body: file, signal}),
      import('./pdf').then(async module => { await module.preparePdfRuntime(); return module; }),
    ]);
    let input: ArrayBuffer | Uint8Array, warning: string | null;
    if (response.ok && response.headers.get('Content-Type') === 'application/pdf') {
      input = await response.arrayBuffer();
      warning = response.headers.get('X-Source-Warning');
    } else {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      input = decodeBase64(data.pdf);
      warning = data.warning;
    }
    return {pages: await importPdfReferences(input, progress, signal), warning};
  } catch (error) {
    return {error: `Source reference unavailable: ${error instanceof Error ? error.message : String(error)}`};
  }
}
