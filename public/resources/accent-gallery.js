import { ACCENT_PRESETS, ORIGINAL_ACCENT, normalizeAccent, recolorAccentPixels } from './accent-engine.js';

const cards = [...document.querySelectorAll('.asset')];
const sources = new Map(cards.map(card => [card.dataset.id, new URL(card.querySelector('img').getAttribute('src'), location.href).href]));
let color = ORIGINAL_ACCENT, revision = 0, currentId, exporting = false;
try { color = normalizeAccent(localStorage.getItem('deck-studio-illustration-accent') || ORIGINAL_ACCENT); } catch {}
const toast = message => { document.querySelector('#toast').textContent = message; };
const bar = document.createElement('div'); bar.className = 'gallery-accent';
bar.innerHTML = `<span>Accent color</span><div class="gallery-swatches" role="group" aria-label="Illustration accent color"></div><label class="gallery-custom"><input type="color" aria-label="Custom accent color"><input aria-label="Accent HEX value" maxlength="7"></label><button class="secondary" id="color-zip">Download this color</button><a class="secondary gallery-editor" href="/?library=blue-black">Deck Studio</a><span class="gallery-color-status" role="status" aria-live="polite"></span>`;
document.querySelector('.viewbar').before(bar);
for (const preset of ACCENT_PRESETS) {
  const button = document.createElement('button'); button.type = 'button'; button.style.setProperty('--swatch', preset.color);
  button.setAttribute('aria-label', `Accent color: ${preset.label}`); button.title = preset.label;
  button.addEventListener('click', () => setColor(preset.color)); bar.querySelector('.gallery-swatches').append(button);
}
const custom = bar.querySelector('[type=color]'), hex = bar.querySelector('[aria-label="Accent HEX value"]'), status = bar.querySelector('[role=status]');
const inView = new Set(), objectUrls = new WeakMap();
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (entry.isIntersecting) { inView.add(entry.target); void renderCard(entry.target); } else inView.delete(entry.target);
  }
}, {rootMargin: '120px'});
cards.forEach(card => observer.observe(card));
async function renderedBlob(id, accent, maxSide = 0) {
  const response = await fetch(sources.get(id)); if (!response.ok) throw new Error('Could not read the original image. Try again.');
  const blob = await response.blob(); if (accent === ORIGINAL_ACCENT && !maxSide) return blob;
  const bitmap = await createImageBitmap(blob), canvas = document.createElement('canvas');
  const scale = maxSide ? Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height)) : 1;
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d', {willReadFrequently: true}); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const image = context.getImageData(0, 0, canvas.width, canvas.height); recolorAccentPixels(image.data, accent); context.putImageData(image, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not export the PNG. Try again.')), 'image/png'));
}
function replaceImage(image, blob) {
  const previous = objectUrls.get(image), next = URL.createObjectURL(blob); image.src = next; objectUrls.set(image, next);
  if (previous) URL.revokeObjectURL(previous);
}
async function renderCard(card) {
  const version = revision, image = card.querySelector('img');
  try {
    if (color === ORIGINAL_ACCENT) { const previous = objectUrls.get(image); image.src = sources.get(card.dataset.id); if (previous) URL.revokeObjectURL(previous); objectUrls.delete(image); }
    else { const blob = await renderedBlob(card.dataset.id, color, 480); if (version === revision) replaceImage(image, blob); }
  } catch (error) { status.textContent = error.message; }
}
async function renderDetail() {
  if (!currentId) return; const id = currentId, version = revision;
  try { const blob = await renderedBlob(id, color, 960); if (id === currentId && version === revision) replaceImage(document.querySelector('#detail-image'), blob); }
  catch (error) { status.textContent = error.message; }
}
function setColor(value) {
  try { color = normalizeAccent(value); hex.setAttribute('aria-invalid', 'false'); } catch (error) { hex.setAttribute('aria-invalid', 'true'); status.textContent = error.message; return; }
  revision++; custom.value = color; hex.value = color.toUpperCase(); status.textContent = '';
  bar.querySelectorAll('.gallery-swatches button').forEach((button, i) => button.setAttribute('aria-pressed', String(ACCENT_PRESETS[i].color === color)));
  try { localStorage.setItem('deck-studio-illustration-accent', color); } catch {}
  inView.forEach(card => void renderCard(card)); void renderDetail(); updateEditorLink();
}
custom.addEventListener('change', () => setColor(custom.value)); hex.addEventListener('change', () => setColor(hex.value));
const editorLink = document.createElement('a'); editorLink.className = 'secondary gallery-editor'; editorLink.textContent = 'Use in Deck Studio'; document.querySelector('#detail .actions').append(editorLink);
function updateEditorLink() { editorLink.href = `/?${new URLSearchParams({library: 'blue-black', asset: `blue-black:${currentId || ''}`, accent: color})}`; bar.querySelector('.gallery-editor').href = `/?${new URLSearchParams({library: 'blue-black', accent: color})}`; }
document.addEventListener('click', event => {
  const button = event.target.closest('[data-open]'); if (button) { currentId = button.dataset.open; updateEditorLink(); void renderDetail(); }
});
function download(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
document.addEventListener('click', async event => {
  const link = event.target.closest('.asset .download, #detail-download'); if (!link) return;
  event.preventDefault(); const id = link.closest('.asset')?.dataset.id || currentId, accent = color;
  try { download(await renderedBlob(id, accent), `${id}-${accent.slice(1)}.png`); } catch (error) { toast(error.message); }
}, true);
document.querySelector('#copy-image').addEventListener('click', async event => {
  event.stopImmediatePropagation(); const id = currentId, accent = color;
  try { await navigator.clipboard.write([new ClipboardItem({'image/png': renderedBlob(id, accent)})]); toast('Recolored PNG copied'); }
  catch { toast('Image copying is unavailable in this browser. Download the recolored PNG instead.'); }
}, true);
document.querySelector('#color-zip').addEventListener('click', async event => {
  if (exporting) return; exporting = true; const button = event.currentTarget, accent = color; button.disabled = true;
  const visible = cards.filter(card => !card.hidden);
  try {
    const zip = new window.JSZip(); let completed = 0;
    for (const card of visible) { zip.file(`${card.dataset.id}.png`, await renderedBlob(card.dataset.id, accent)); status.textContent = `${++completed} / ${visible.length}`; }
    zip.file('accent.json', JSON.stringify({schema: 'deck-studio/illustration-accent/1', accent, originalAccent: ORIGINAL_ACCENT, assets: visible.map(card => card.dataset.id)}, null, 2));
    download(await zip.generateAsync({type: 'blob', compression: 'STORE'}), `illustrations-${accent.slice(1)}.zip`); status.textContent = `Exported ${visible.length}  images`;
  } catch (error) { status.textContent = error.message; } finally { exporting = false; button.disabled = false; }
});
setColor(color);
