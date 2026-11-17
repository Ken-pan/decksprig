import {BRAND_NAME} from '../brand-name.js';
import type {Deck} from './model';
import {download as downloadFile, deckFilename} from './download';
import {slideLabel} from './slide-label';
import {resourceCredits} from './resource-credits';

// Format dispatch belongs to the export flow, rather than the startup shell.
// Each converter retains its own deferred loading boundary.
export async function downloadDocument(deck: Deck, kind: string, original: boolean,signal?:AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const download=(...args:Parameters<typeof downloadFile>)=>{signal?.throwIfAborted();downloadFile(...args);};
  const name = deckFilename(deck);
  if (kind === 'json' || kind === 'json-legacy') {
    const [{portableDeck}, {jsonDataBlob}, {documentFile}] = await Promise.all([import('./portable-document'), import('./document-json'), import('./document-file')]);
    const portable=await portableDeck(deck);
    download(await jsonDataBlob(kind==='json-legacy'?portable:documentFile(portable), {space:2}), `${name}.deck.json`);
  } else if (kind === 'figma') {
    const {figmaTransfer}=await import('./figma-transfer');
    download(JSON.stringify(await figmaTransfer(deck)), `${name}.figma.deck.json`);
    return `Figma file prepared. Open it in the ${BRAND_NAME} Figma plugin.`;
  } else if (kind === 'markdown') {
    const credits = resourceCredits(deck);
    download(`# ${deck.title}\n\n${deck.slides.map((slide, index) => `## ${slideLabel(index)}\n\n${slide.elements.filter(element => element.type === 'text').map(element => element.text).join('\n\n')}\n\n### Notes\n\n${slide.notes}`).join('\n\n---\n\n')}${credits ? `\n\n## Sources and licenses\n\n${credits}` : ''}`, `${name}.md`, 'text/markdown');
  } else {
    const exporter = await import('./export');
    if (kind === 'pptx') await exporter.exportPptx(deck, original,false,signal);
    else if (kind === 'potx') await exporter.exportPptx(deck, false, true,signal);
    else if (kind === 'pptx-source') await exporter.exportPptx(deck, true,false,signal);
    else if (kind === 'keynote') return await exporter.exportKeynote(deck, original,signal) || 'Download started';
    else if (kind === 'html') await exporter.exportHtml(deck, original,signal);
    else if (kind === 'broadser') download(JSON.stringify(exporter.exportBroadser(deck), null, 2), `${name}.broadser.json`);
  }
  return 'Download started';
}
