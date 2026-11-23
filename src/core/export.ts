import {fontFamilyKey,sameFontFamily} from './font-stack';
import {createFontStack,fontCategories} from './font-stack';
import {abortable,requestSignal} from './async-abort';
import {createNativeTextRendering} from './native-text-render';
import {createShapeTextRendering,canEditText} from './shape-text';
import {automaticShapeTextColor} from './shape-label-color';
import {createLinePaths} from './line-path';
import {pageBackground} from './page-background';
import {createLineLabelRendering} from './line-label';
import {createLineGeometry} from './lines';
import {createShapeGeometry} from './shape-geometry';
import {textLinkUrl} from './text-link';
import {visibleDeliveryDeck} from './slide-visibility';
import {slideLabel} from './slide-label';
import {withoutSlideTitles} from './portable-document';
import {tableRendering} from './table-rendering';
import {nativeTableRendering} from './native-table-layout';
import {prepareThemeArtwork} from './theme-artwork';
import {prepareRegionFills} from './region-fill';
import { htmlPlayerScript, htmlPlayerStyles, htmlPlayerResponsiveStyles } from './html-player';
import type { Deck } from './model';
import { chartFromElement, chartDescription } from './charts';
import { prepareTextSizing } from './text-layout-fonts';
import { embeddedLibraryFonts } from './fonts';
import { createTypography } from './typography';
import {createImageRendering} from './image-style';
import { embeddedOnlineFonts } from './online-fonts';
import { usedResourceCredits, resourceCredits } from './resources';
export { resourceCredits } from './resources';
import { download, deckFilename } from './download';
import {documentJsonBlob,jsonDataBlob} from './document-json';
import {packDocumentMedia,restoreDocumentMedia} from './document-media-transport';
export { download, deckFilename } from './download';
import {buildPptx} from './pptx-export';
export {buildPptx} from './pptx-export';
import {buildPptxInBackground} from './background-pptx-export';
export async function exportPptx(deck: Deck, original = false,template=false,signal?:AbortSignal) {
  signal?.throwIfAborted();
  const measured = original ? deck : await abortable(prepareThemeArtwork(await abortable(prepareTextSizing(deck,()=>!signal?.aborted),signal)),signal);
  const dimensions: Record<string,{w:number;h:number}> = {}, images = new Map<string,Promise<{w:number;h:number}>>();
  for (const s of measured.slides) for (const e of original && s.source?.render ? [] : s.elements) {
    if (e.hidden || e.type !== 'image' || e.fit !== 'contain' || e.crop || e.sourceRegion || !e.src) continue;
    // Raster dimensions are decoded one at a time in the export worker and its
    // ImageBitmap is explicitly closed. SVG keeps the browser Image fallback.
    if (!e.src.startsWith('data:image/svg') && !/\.svg(?:[?#]|$)/i.test(e.src)) continue;
    if (!images.has(e.src)) images.set(e.src, new Promise((ok,no)=>{const image=new Image();image.onload=()=>ok({w:image.naturalWidth,h:image.naturalHeight});image.onerror=()=>no(new Error(`Cannot read image: ${e.name}`));image.src=e.src!;}));
    dimensions[`${s.id}:${e.id}`] = await abortable(images.get(e.src)!,signal);
  }
  const output = await buildPptxInBackground({deck:measured,original,template,dimensions}, () => buildPptx(measured,original,undefined,template),undefined,signal);
  signal?.throwIfAborted();
  download(new Blob([output as Uint8Array<ArrayBuffer>], {type:template?'application/vnd.openxmlformats-officedocument.presentationml.template':'application/vnd.openxmlformats-officedocument.presentationml.presentation'}), `${deckFilename(deck)}${original ? '-source-reference' : ''}.${template?'potx':'pptx'}`);
}
export async function exportKeynote(deck: Deck, original = false,signal?:AbortSignal) {
  const bytes=await buildPptx(original?deck:await prepareThemeArtwork(deck),original);
  let body:BodyInit=new Uint8Array(bytes),type='application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if(!original&&deck.nativeSource){const {keynoteState}=await import('./keynote-source');let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));body=JSON.stringify({pptx:btoa(binary),nativeSource:deck.nativeSource,state:await keynoteState(deck)});type='application/json';}
  const response=await fetch('/api/export/keynote',{method:'POST',headers:{'Content-Type':type},body,signal:requestSignal(signal,120000)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not export to Keynote.');
  const key=Uint8Array.from(atob(result.key),(c:string)=>c.charCodeAt(0));
  signal?.throwIfAborted();
  download(new Blob([key]),`${deckFilename(deck)}${original?'-source-reference':''}.key`,'application/vnd.apple.keynote');
  return result.warning as string|undefined;
}
export function exportBroadser(deck: Deck, htmlUrl = '') {
  const cards = deck.slides.map((s, i) => ({id: `deck-${s.id}`, type: 'note', title: slideLabel(i), text: [...s.elements.filter(e => canEditText(e) && !e.hidden).map(e => e.text), s.notes, ...s.elements.filter(e => e.type === 'prototype').map(e => e.prototype?.url), resourceCredits({...deck, slides: [s]})].filter(Boolean).join('\n\n'), x: (i % 3) * 520, y: Math.floor(i / 3) * 350, w: 460, h: 290, z: i + 1, color: 'slate', ...(htmlUrl ? {url: htmlUrl} : {})}));
  return {board: {name: deck.title, zoom: 1, panX: 0, panY: 0}, cards, links: [], zCounter: cards.length + 20};
}
export async function buildHtml(deck: Deck, original = false,signal?:AbortSignal): Promise<Blob> {
  signal?.throwIfAborted();
  deck=withoutSlideTitles(visibleDeliveryDeck(deck));
  if (!original) deck = prepareRegionFills(await abortable(prepareThemeArtwork(await abortable(prepareTextSizing(deck,()=>!signal?.aborted),signal)),signal));
  if(deck.slides.some(s=>s.elements.some(e=>e.sourceRegion&&!s.source?.render&&!e.src)))throw new Error('Attach a source PDF to complete complex shape references before exporting.');
  const [localFonts, onlineFonts] = await Promise.all([embeddedLibraryFonts(deck,signal), embeddedOnlineFonts(deck,signal)]);
  const fonts = [...localFonts, ...onlineFonts];
  for (const font of deck.fonts ?? []) fonts.push(`@font-face{font-family:"${font.family.replace(/[";{}<>]/g, '')}";src:url(${font.data});font-weight:${font.weight};font-style:${font.style};}`);
  // Carry local evidence and prototype posters into the file as well as slide images.
  async function localImage(src?: string) {
    if (!src?.startsWith('/examples/')) return src;
    const r = await fetch(src,{signal:requestSignal(signal)}); if (!r.ok) throw new Error('Could not export the local image.');
    const blob = await r.blob(); return await new Promise<string>((ok, no) => { const f = new FileReader(); f.onload = () => ok(String(f.result)); f.onerror = () => no(f.error); f.readAsDataURL(blob); });
  }
  const images = new Map<string, Promise<string | undefined>>();
  const embed = (src?: string) => {
    if (!src?.startsWith('/examples/')) return Promise.resolve(src);
    if (!images.has(src)) images.set(src, localImage(src));
    return images.get(src)!;
  };
  const slides: Deck['slides'] = [];
  for (const s of deck.slides) {
    const render = await embed(s.source?.render);
    const elements: Deck['slides'][number]['elements'] = [];
    for (const e of s.elements) {
      const src = await embed(e.src), poster = await embed(e.prototype?.poster);
      elements.push(src === e.src && poster === e.prototype?.poster ? e : {...e, ...(e.src ? {src} : {}), ...(e.prototype ? {prototype:{...e.prototype,poster}} : {})});
    }
    slides.push(render === s.source?.render && elements.every((e,i)=>e===s.elements[i]) ? s : {...s,elements,...(s.source ? {source:{...s.source,render}} : {})});
  }
  const d = slides.every((s,i)=>s===deck.slides[i]) ? deck : {...deck,slides};
  const chartImages: Record<string, {svg: string; description: string}> = {};
  if (!original && d.slides.some(s => s.elements.some(e => e.type === 'chart' && !e.hidden))) {
    const {renderChartSvg} = await import('./chart-render');
    for (const slide of d.slides) for (const e of slide.elements) if (e.type === 'chart' && !e.hidden) chartImages[`${slide.id}:${e.id}`] = {svg: renderChartSvg(e,false,d.onlineFonts?.find(font=>sameFontFamily(font.family,e.fontFamily))?.category,slide.background), description: chartDescription(chartFromElement(e))};
  }
  // HTML is a standalone transport, not the canonical document file. Store large
  // repeated images once, restoring their original strings before the player runs.
  const packed = packDocumentMedia(d);
  const json = await documentJsonBlob(packed.deck, {escapeHtml:true});
  const media = packed.assets.length ? await jsonDataBlob({assets:packed.assets,references:packed.references},{escapeHtml:true}) : undefined;
  const credits = JSON.stringify(original ? [] : usedResourceCredits(d)).replace(/</g, '\\u003c');
  const prefix = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Deckleaf</title><style>${fonts.join('')}*{box-sizing:border-box}body{margin:0;background:#181c19;color:#eceee4;font-family:Inter,sans-serif}#wrap{width:100vw;height:calc(100dvh - 48px);display:grid;place-items:center;overflow:hidden}.slide{isolation:isolate;position:relative;flex:none;transform-origin:top left;overflow:hidden;color:#26362c;color-scheme:light}.e{position:absolute;white-space:pre-wrap;overflow-wrap:break-word;overflow:hidden}.e img,.e svg{width:100%;height:100%;display:block}nav{height:48px;display:flex;justify-content:center;align-items:center;gap:24px}button{background:none;border:0;color:inherit;cursor:pointer;font:inherit;padding:10px}#notes{display:none}table{border-collapse:collapse;width:100%;height:100%;color:#26362c;background:transparent}td{padding:12px;border:1px solid #c6cdc3}tr:first-child{background:transparent}@media print{@page{size:${deck.width / 96}in ${deck.height / 96}in;margin:0}body{background:white}nav{display:none}#wrap{display:block;width:auto;height:auto}#wrap>div{width:${deck.width}px!important;height:${deck.height}px!important;break-after:page}.slide{transform:none!important}}#credits{position:fixed;inset:64px max(24px,12vw) 64px;background:#f4f3ee;color:#26362c;padding:24px;overflow:auto;z-index:5;border-radius:8px}#credits[hidden]{display:none}#credits a{color:#365440}#credits p,#credits pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}#credits section{margin-bottom:24px}#credits-close{color:#26362c;float:right}@media print{#credits{display:none}}.text-paragraph::after{content:var(--deck-end-content,none);font-size:var(--deck-end-size,inherit);font-family:var(--deck-end-font,inherit);pointer-events:none}${htmlPlayerStyles}${htmlPlayerResponsiveStyles}</style><div id="wrap"></div><nav><button id="prev" aria-label="Previous slide">←</button><span id="count"></span><button id="next" aria-label="Next slide">→</button><button id="credits-toggle">Resource source</button></nav><dialog id="credits" aria-label="Sources and licenses"><button id="credits-close">Close</button><h2>Sources and licenses</h2></dialog><script type="application/json" id="deck">`;
  const suffix = `</script><script>
const charts=${JSON.stringify(chartImages).replace(/</g, '\\u003c')};\nconst deck=JSON.parse(document.getElementById('deck').textContent);${media ? `(${restoreDocumentMedia.toString()})({...JSON.parse(document.getElementById('deck-media').textContent),deck});` : ''}const original=${original},wrap=document.getElementById('wrap');let index=0;
const {fontStack,fontFamilyKey}=(${createFontStack.toString()})(${JSON.stringify({...fontCategories,...Object.fromEntries((deck.onlineFonts??[]).map(font=>[font.family,font.category]))}).replace(/</g,'\\u003c')});
const {renderedNativeText,nativeTextSpans}=(${createNativeTextRendering.toString()})();
const {runStyle,paragraphStyle,textBoxStyle,textFlowStyle}=(${createTypography.toString()})(fontStack);
const linePaths=(${createLinePaths.toString()})();
const pageBackground=(${pageBackground.toString()});
const {lineLabelElement,lineLabelStyle}=(${createLineLabelRendering.toString()})(linePaths);
const {isTextShape,shapeTextElement}=(${createShapeTextRendering.toString()})(lineLabelElement,(${automaticShapeTextColor.toString()}));
const {imageStyle}=(${createImageRendering.toString()})();
const textLinkUrl=(${textLinkUrl.toString()});
function node(tag,text){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el}
const credits=${credits},creditPanel=document.getElementById('credits');for(const r of credits){const section=node('section');section.append(node('h3',r.title),node('p',r.attribution));for(const [label,url]of [['Photographer',r.creatorUrl],['Original source',r.sourceUrl],['License',r.licenseUrl]].filter(([label,url])=>url)){const a=node('a',label+' ');a.href=url;a.target='_blank';a.rel='noopener noreferrer';section.append(a)}if(r.licenseNotice)section.append(node('pre',r.licenseNotice));creditPanel.append(section)}document.getElementById('credits-toggle').hidden=!credits.length;document.getElementById('credits-toggle').onclick=()=>creditPanel.showModal();document.getElementById('credits-close').onclick=()=>creditPanel.close();creditPanel.onclose=()=>document.getElementById('credits-toggle').focus();
const photoCaption=node('div');photoCaption.className='stock-photo-caption';Object.assign(photoCaption.style,{position:'fixed',bottom:'64px',left:'50%',transform:'translateX(-50%)',fontSize:'11px',lineHeight:'1.6',color:'#64736a',background:'#fffffff2',padding:'5px 10px',borderRadius:'4px',zIndex:8,maxWidth:'90vw',maxHeight:'64px',overflow:'auto'});document.body.append(photoCaption);
function photoCredits(s){photoCaption.replaceChildren();const seen=new Set();for(const e of original?[]:s.elements){const r=e.resource;if(e.hidden||!r?.id.startsWith('unsplash:')||seen.has(r.id))continue;seen.add(r.id);const line=node('span','Photo by '),author=node('a',r.creator),provider=node('a','Unsplash');author.href=r.creatorUrl||r.sourceUrl;provider.href='https://unsplash.com/?utm_source=deck_studio&utm_medium=referral';for(const a of [author,provider]){a.target='_blank';a.rel='noopener noreferrer';a.style.color='inherit';}line.append(author,document.createTextNode(' on '),provider,document.createTextNode('  '));photoCaption.append(line)}photoCaption.hidden=!seen.size}
const {tablePresentation,tableCellStyle,tableCellSpan,tableCellRuns,tableRunStyle}=(${tableRendering.toString()})();
const {nativeTableImage}=(${nativeTableRendering.toString()})();
const {lineMarkup}=(${createLineGeometry.toString()})(linePaths);
const {shapePath,shadowFilter}=(${createShapeGeometry.toString()})();
function slide(s){photoCredits(s);const page=node('div');page.className='slide';Object.assign(page.style,{width:deck.width+'px',height:deck.height+'px',background:pageBackground(s.background)});if(original&&s.source?.render){const image=node('img');image.src=s.source.render;Object.assign(image.style,{width:'100%',height:'100%',objectFit:'contain'});page.append(image);return page}
for(const authored of s.elements){const native=nativeTextSpans(authored);const e=authored.type==='text'?renderedNativeText(authored):authored;if(e.hidden)continue;const el=node('div');el.className='e';el.dataset.id=e.id;Object.assign(el.style,{left:e.x+'px',top:e.y+'px',width:e.w+'px',height:e.h+'px',transform:'rotate('+e.rotation+'deg) scale('+(e.flipX?-1:1)+','+(e.flipY?-1:1)+')',opacity:e.opacity,mixBlendMode:e.blendMode??'normal',fontFamily:fontStack(e.fontFamily),fontSize:e.fontSize+'px',fontWeight:e.fontWeight,fontStyle:e.italic?'italic':'normal',textDecoration:e.type==='text'||e.type==='table'?'none':e.underline?'underline':'none',textAlign:e.align,lineHeight:e.lineHeight,letterSpacing:e.letterSpacing+'px',color:e.fill,filter:shadowFilter(e)});if(e.shadow)el.style.overflow='visible';
if(e.type==='prototype'){}else if(e.type==='text'){el.style.cssText+=textBoxStyle(e);if(native){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 '+e.w+' '+e.h);svg.setAttribute('width',e.w);svg.setAttribute('height',e.h);svg.style.cssText='position:absolute;inset:0;overflow:visible';if(native.outline){const v=native.outline,image=document.createElementNS(svg.namespaceURI,'image');for(const [k,value]of Object.entries({href:v.src,x:v.x,y:v.y,width:v.w,height:v.h,...(v.transform?{transform:'matrix('+v.transform.join(' ')+')'}:{})}))image.setAttribute(k,value);svg.append(image);}else for(const r of native.spans??[]){const text=document.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('x',r.x);text.setAttribute('y',r.y);text.setAttribute('fill',r.color||e.fill);text.style.cssText=runStyle(r,e)+'white-space:pre;';text.textContent=r.text;svg.append(text);}el.append(svg);}else{const flow=node('div');flow.style.cssText=textFlowStyle(e);const appendRun=(host,r)=>{const t=node('span',r.text);t.style.cssText=runStyle(r,e);host.append(t)};if(e.paragraphs?.length){for(const p of e.paragraphs){const line=node('div');line.className='text-paragraph';line.style.cssText=paragraphStyle(p,e);if(p.bullet)line.append(node('span',p.bullet+' '));for(const r of p.runs)appendRun(line,r);flow.append(line)}}else if(e.runs?.length){for(const r of e.runs)appendRun(flow,r)}else appendRun(flow,{text:e.text});el.append(flow)}const href=textLinkUrl(e.link);if(href){const a=node('a');a.href=href;a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label',e.text||e.name);a.style.cssText='position:absolute;inset:0;display:block';el.append(a)}}
else if(e.type==='image'){const image=node('img');image.src=e.sourceRegion&&s.source?.render?s.source.render:e.src;image.alt=e.name;image.style.cssText=imageStyle(e.sourceRegion&&s.source?.render?{...e,crop:e.sourceRegion}:e);el.style.borderRadius=e.radius+'px';el.append(image)}
else if(e.type==='table'&&nativeTableImage(e)){const image=node('img');image.src=nativeTableImage(e);image.alt=(e.cells||[]).map(row=>row.join(' · ')).join('; ');el.append(image)}
else if(e.type==='table'){const p=tablePresentation(e,deck.designSystem),table=node('table');Object.assign(table.style,{color:p.text,background:'transparent',tableLayout:'fixed',whiteSpace:'pre-wrap',fontVariantNumeric:'tabular-nums'});const cols=node('colgroup');for(const width of p.widths){const col=node('col');col.style.width=width*100+'%';cols.append(col);}table.append(cols);for(const [i,row] of (e.cells||[]).entries()){const tr=node('tr');if(p.heights)tr.style.height=p.heights[i]*100+'%';for(let j=0;j<p.widths.length;j++){const span=tableCellSpan(p,i,j);if(span.covered)continue;const header=p.headerRow&&i===0,td=node(header?'th':'td'),cellStyle=tableCellStyle(p,i,j),rich=p.cellStyleIndex.get(i+':'+j)?.runs;if(rich){for(const run of tableCellRuns(p,i,j,row[j]||'')){const part=node('span',run.text);Object.assign(part.style,tableRunStyle(run,cellStyle,fontStack));td.append(part);}}else td.textContent=row[j]||'';td.rowSpan=span.rowSpan;td.colSpan=span.columnSpan;if(header)td.setAttribute('scope','col');Object.assign(td.style,cellStyle,{fontFamily:fontStack(cellStyle.fontFamily),textDecoration:rich?'none':cellStyle.textDecoration,overflowWrap:'anywhere'});tr.append(td);}table.append(tr)}el.append(table)}
else if(e.type==='chart'){const chart=charts[s.id+':'+e.id];if(chart){el.innerHTML=chart.svg;el.setAttribute('role','img');el.setAttribute('aria-label',chart.description)}}
else if(e.type==='diamond'||e.type==='rect'&&e.shape){el.style.overflow='visible';const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS(svg.namespaceURI,'path');svg.setAttribute('viewBox','0 0 '+e.w+' '+e.h);svg.style.overflow='visible';path.setAttribute('d',shapePath(e));path.setAttribute('fill',e.fill);path.setAttribute('stroke',e.stroke);path.setAttribute('stroke-width',e.strokeWidth);svg.append(path);el.append(svg)}\nelse if(e.type==='line'){el.style.overflow='visible';const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 '+e.w+' '+e.h);svg.style.overflow='visible';svg.innerHTML=lineMarkup(e);el.append(svg)}
else Object.assign(el.style,{background:e.fill,border:e.strokeWidth+'px solid '+e.stroke,borderRadius:e.type==='ellipse'?'50%':e.radius+'px'});if(isTextShape(e)&&e.text){const t=shapeTextElement(e),label=node('div'),flow=node('div');label.className='shape-text';label.style.cssText='position:absolute;inset:0;width:100%;height:100%;overflow-wrap:break-word;'+textBoxStyle(t)+(e.type==='line'?lineLabelStyle(e,t)+'background:'+pageBackground(s.background)+';':'');Object.assign(label.style,{fontFamily:fontStack(t.fontFamily),fontSize:t.fontSize+'px',fontWeight:t.fontWeight,fontStyle:t.italic?'italic':'normal',textDecoration:'none',lineHeight:t.lineHeight,letterSpacing:t.letterSpacing+'px',textAlign:t.align,color:t.fill});flow.style.cssText=textFlowStyle(t);const appendRun=(host,r)=>{const span=node('span',r.text);span.style.cssText=runStyle(r,t);host.append(span)};if(t.paragraphs?.length){for(const p of t.paragraphs){const line=node('div');line.className='text-paragraph';line.style.cssText=paragraphStyle(p,t);if(p.bullet)line.append(node('span',p.bullet+' '));for(const r of p.runs)appendRun(line,r);flow.append(line)}}else if(t.runs?.length){for(const r of t.runs)appendRun(flow,r)}else appendRun(flow,{text:t.text});label.append(flow);el.append(label);if(e.type==='line')document.fonts?.ready.then(()=>{if(label.isConnected){const measured=lineLabelElement(e);label.style.cssText+=lineLabelStyle(e,measured);label.style.whiteSpace=measured.wrap?'pre-wrap':'pre';}})}page.append(el)}return page}
${htmlPlayerScript()}
</script></html>`;
  return new Blob([prefix, json, ...(media ? ['</script><script type="application/json" id="deck-media">',media] : []), suffix], {type:'text/html'});
}
export async function exportHtml(deck: Deck, original = false,signal?:AbortSignal) {
  const blob=await abortable(buildHtml(deck,original,signal),signal);signal?.throwIfAborted();
  download(blob, `${deckFilename(deck)}.html`, 'text/html');
}
