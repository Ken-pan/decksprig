import {fontFamilyKey,sameFontFamily} from './font-stack';
import {typographyUses} from './font-usage';
import {SharedRequest,requestSignal} from './async-abort';
import {canEditText} from './shapes';
import { OnlineFontSchema, type OnlineFont, type Deck } from './model';
import { FONT_LIBRARY, findFont, nearestWeight, type LibraryFont } from './fonts';

const API = 'https://api.fontsource.org/v1';
const CDN = 'https://cdn.jsdelivr.net/npm/@fontsource';
const categoryMap: Record<string, OnlineFont['category']> = {'sans-serif': 'sans', serif: 'serif', display: 'display', monospace: 'mono', handwriting: 'handwriting'};
const requests = new Map<string, SharedRequest<ArrayBuffer>>();
const faces = new Map<string, Promise<void>>();
const references = new Map<string, SharedRequest<OnlineFont>>();
const styles = new Map<string, SharedRequest<OnlineFace[]>>();
const aliases: Record<string, string> = {'lxgw-wenkai': 'LXGW WenKai', 'lxgw-wenkai-tc': 'LXGW WenKai TC', 'zcool-kuaile': 'ZCOOL KuaiLe', 'zcool-xiaowei': 'ZCOOL XiaoWei', 'zcool-qingke-huangyou': 'ZCOOL QingKe HuangYou', 'long-cang': 'Long Cang', 'liu-jian-mao-cao': 'Liu Jian Mao Cao', 'zhi-mang-xing': 'Zhi Mang Xing'};
const popular = ['figtree', 'roboto', 'open-sans', 'outfit', 'sora', 'urbanist', 'rubik', 'merriweather', 'ibm-plex-sans', 'fraunces', 'bitter', 'anton', 'roboto-condensed', 'lxgw-wenkai', 'zcool-kuaile'];
// Fontsource labels the original WenKai package's full glyph file as "latin".
// Its upstream project documents Chinese support: https://github.com/lxgw/LxgwWenKai
const supportsChinese = (id: string, subsets: string[]) => id === 'lxgw-wenkai' || id === 'lxgw-wenkai-mono' || subsets.some(s => s.includes('chinese'));
function validId(id: string) { if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 100) throw new Error('Invalid online font ID.'); }
function packageUrl(id: string, version: string, file: string) {
  validId(id); if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid font version.');
  if (!/^(metadata\.json|LICENSE|NOTICE|\d{3}(?:-italic)?\.css|files\/[a-z0-9-]+\.woff2)$/.test(file)) throw new Error('Invalid font resource.');
  return `${CDN}/${id}@${version}/${file}`;
}
// Cache bytes explicitly so FontFace loading also works when the browser is offline.
async function remote(url: string, refresh = false,signal?:AbortSignal): Promise<ArrayBuffer> {
  signal?.throwIfAborted();
  let request=!refresh?requests.get(url):undefined;
  if(!request){
    request=new SharedRequest(async loadSignal=>{
      let cache:Cache|undefined;
      try{cache=await caches.open('deck-studio-online-fonts-v1');}catch{/* Optional offline cache. */}
      const cached=await cache?.match(url);loadSignal.throwIfAborted();
      if(cached&&!refresh)return cached.arrayBuffer();
      try{
        const response=await fetch(url,{signal:requestSignal(loadSignal,20000),credentials:'omit',referrerPolicy:'no-referrer'});
        if(!response.ok)throw new Error(`Font service unavailable (${response.status})`);
        if(Number(response.headers.get('content-length'))>12_000_000)throw new Error('This font exceeds 12 MB.');
        const bytes=await response.arrayBuffer();if(bytes.byteLength>12_000_000)throw new Error('This font exceeds 12 MB.');
        loadSignal.throwIfAborted();
        try{await cache?.put(url,new Response(bytes,{headers:{'Content-Type':response.headers.get('content-type')||'application/octet-stream'}}));}catch{/* Keep the downloaded font usable. */}
        return bytes;
      }catch(error){if(loadSignal.aborted)throw loadSignal.reason;if(cached)return cached.arrayBuffer();throw error;}
    },false);
    requests.set(url,request);
  }
  return request.get(signal);
}
const text = async (url:string,signal?:AbortSignal)=>new TextDecoder().decode(await remote(url,false,signal));
const json = async (url:string,signal?:AbortSignal)=>JSON.parse(await text(url,signal));

export function onlineFontItem(font: OnlineFont): LibraryFont {
  return {id: font.id, family: font.family, category: font.category, chinese: font.chinese, weights: font.weights, styles: font.styles,
    label: aliases[font.id], tags: `${aliases[font.id] || ''} ${font.chinese ? 'CJK' : 'Latin'}`, version: font.version,
    css: packageUrl(font.id, font.version, '400.css'), license: packageUrl(font.id, font.version, 'LICENSE'),
    source: font.provider === 'google' ? `https://fonts.google.com/specimen/${encodeURIComponent(font.family).replaceAll('%20', '+')}` : `https://fontsource.org/fonts/${font.id}`,
    provider: font.provider, licenseId: font.license, online: true};
}
export function normalizeOnlineCatalog(raw: unknown, includeBundled = false): LibraryFont[] {
  if (!Array.isArray(raw)) throw new Error('The online font catalog has an invalid format.');
  const bundled = new Set(FONT_LIBRARY.map(f => fontFamilyKey(f.family)));
  return raw.flatMap<LibraryFont>((f: any) => {
    if (!f || !['OFL-1.1', 'Apache-2.0'].includes(f.license) || !categoryMap[f.category] || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(f.id) || typeof f.family !== 'string' || f.family.length > 100 || /[";{}<>\\]/.test(f.family) || (!includeBundled && bundled.has(fontFamilyKey(f.family)))) return [];
    const weights = Array.isArray(f.weights) ? [...new Set<number>(f.weights.filter((w: unknown) => typeof w === 'number' && Number.isInteger(w) && w >= 100 && w <= 900))] : [];
    const fontStyles = Array.isArray(f.styles) ? f.styles.filter((s: string) => s === 'normal' || s === 'italic') : [];
    if (!weights.length || !fontStyles.includes('normal')) return [];
    const local = includeBundled ? findFont(f.family) : undefined;
    const provider = f.type === 'google' ? 'google' as const : 'fontsource' as const;
    if (local) return [{...local, provider, licenseId: 'OFL-1.1' as const, tags: `${local.tags} Google Fonts`}];
    return [{id: f.id, family: f.family, category: categoryMap[f.category], weights, styles: fontStyles, label: aliases[f.id],
      chinese: Array.isArray(f.subsets) && supportsChinese(f.id, f.subsets), tags: `${aliases[f.id] || ''} ${f.subsets?.join(' ') || ''} ${provider === 'google' ? 'Google Fonts' : 'Fontsource'}`,
      css: '', license: `https://fontsource.org/fonts/${f.id}`,
      source: provider === 'google' ? `https://fonts.google.com/specimen/${encodeURIComponent(f.family).replaceAll('%20', '+')}` : `https://fontsource.org/fonts/${f.id}`,
      provider, licenseId: f.license as OnlineFont['license'], version: 'latest', online: true}];
  }).sort((a, b) => {
    const rank = (id: string) => popular.includes(id) ? popular.indexOf(id) : popular.length;
    return rank(a.id) - rank(b.id) || a.family.localeCompare(b.family);
  });
}
export async function onlineCatalog(refresh = false) {
  return normalizeOnlineCatalog(JSON.parse(new TextDecoder().decode(await remote(`${API}/fonts`, refresh))), true);
}
export async function onlineReference(item: LibraryFont,signal?:AbortSignal): Promise<OnlineFont> {
  const key = `${item.id}@${item.version}`;
  signal?.throwIfAborted();
  let request=references.get(key);
  if(!request){request=new SharedRequest(async loadSignal => {
    validId(item.id);
    const version = item.version === 'latest' ? (await json(`${API}/version/${item.id}`,loadSignal)).latest : item.version;
    const metadata = await json(packageUrl(item.id, version, 'metadata.json'),loadSignal);
    const license = metadata.license?.type;
    if (!['OFL-1.1', 'Apache-2.0'].includes(license) || (item.licenseId && item.licenseId !== license) || typeof metadata.family !== 'string' || fontFamilyKey(metadata.family) !== fontFamilyKey(item.family)) throw new Error('The font name or open-source license could not be verified.');
    const notice = await text(packageUrl(item.id, version, 'LICENSE'),loadSignal);
    if (!(license === 'OFL-1.1' ? /SIL OPEN FONT LICENSE/i : /Apache License\s+Version 2\.0/i).test(notice)) throw new Error('Could not retrieve the complete font license.');
    const attribution = metadata.license.attribution;
    let licenseNotice = typeof attribution === 'string' && attribution && !notice.includes(attribution) ? `${attribution}\n\n${notice}` : notice;
    if (license === 'Apache-2.0') {
      try { const additional = await text(packageUrl(item.id, version, 'NOTICE'),loadSignal); if (additional.trim()) licenseNotice += `\n\nNOTICE\n${additional}`; }
      catch (error: any) { if (!String(error.message).includes('(404)')) throw error; }
    }
    return OnlineFontSchema.parse({id: item.id, family: metadata.family, version, category: categoryMap[metadata.category],
      chinese: supportsChinese(item.id, metadata.subsets), weights: metadata.weights.filter((w: number) => w >= 100 && w <= 900),
      styles: metadata.styles.filter((s: string) => s === 'normal' || s === 'italic'), license, licenseNotice,
      ...(metadata.type === 'google' || item.provider === 'google' ? {provider: 'google'} : {})});
  });references.set(key,request);}
  return request.get(signal);
}

export interface OnlineFace {url: string; range: string; weight: number; style: 'normal' | 'italic'}
export function parseOnlineCss(css: string, font: OnlineFont, weight: number, style: 'normal' | 'italic'): OnlineFace[] {
  const result: OnlineFace[] = [];
  for (const block of css.match(/@font-face\s*\{[^}]+\}/g) ?? []) {
    const filename = block.match(/url\(\.\/files\/([a-z0-9-]+\.woff2)\)/)?.[1];
    const range = block.match(/unicode-range:\s*([^;]+);/)?.[1].trim() || 'U+0-10FFFF';
    if (!filename?.startsWith(`${font.id}-`) || !/^U\+[0-9A-F?-]+(?:\s*,\s*U\+[0-9A-F?-]+)*$/i.test(range)) throw new Error('The online font file declaration is invalid.');
    result.push({url: packageUrl(font.id, font.version, `files/${filename}`), range, weight, style});
  }
  if (!result.length) throw new Error('No compatible WOFF2 file is available for this font.');
  return result;
}
export function rangeContains(range: string, sample: string) {
  const points = [...sample].map(c => c.codePointAt(0)!);
  return range.split(',').some(part => {
    const spec = part.trim().slice(2), [lo, hi = lo] = spec.split('-');
    const min = parseInt(lo.replaceAll('?', '0'), 16), max = parseInt(hi.replaceAll('?', 'F'), 16);
    return points.some(p => p >= min && p <= max);
  });
}
async function fontFaces(font: OnlineFont, requestedWeight: number, requestedStyle: 'normal' | 'italic', sample: string,signal?:AbortSignal) {
  font = await onlineReference(onlineFontItem(font),signal);
  const weight = nearestWeight(font.weights, requestedWeight), style = font.styles.includes(requestedStyle) ? requestedStyle : 'normal';
  const url = packageUrl(font.id, font.version, `${weight}${style === 'italic' ? '-italic' : ''}.css`);
  if (!styles.has(url)) styles.set(url,new SharedRequest(loadSignal=>text(url,loadSignal).then(css=>parseOnlineCss(css,font,weight,style))));
  return (await styles.get(url)!.get(signal)).filter(face=>rangeContains(face.range,sample||'Aa'));
}
async function fontBytes(url: string,signal?:AbortSignal) {
  const bytes = await remote(url,false,signal);
  if (new TextDecoder().decode(bytes.slice(0, 4)) !== 'wOF2') throw new Error('The download is not a valid WOFF2 font.');
  return bytes;
}
export async function loadOnlineFont(font: OnlineFont, weight: number, sample: string, style: 'normal' | 'italic' = 'normal') {
  const list = await fontFaces(font, weight, style, `${sample} Aa`);
  if (!list.length) throw new Error('This font does not include the preview characters. Use the sample text.');
  await Promise.all(list.map(face => {
    const key = `${fontFamilyKey(font.family)}:${face.url}`;
    if (!faces.has(key)) faces.set(key, (async () => {
      const loaded = await new FontFace(font.family, await fontBytes(face.url), {weight: String(face.weight), style: face.style, unicodeRange: face.range}).load();
      document.fonts.add(loaded);
    })().catch(e => { faces.delete(key); throw e; }));
    return faces.get(key)!;
  }));
}
export function onlineFontUses(deck: Deck) {
  const imported = new Set(deck.fonts?.map(f=>fontFamilyKey(f.family)));
  const registered = new Map(deck.onlineFonts?.map(f=>[fontFamilyKey(f.family),f]));
  return typographyUses(deck.slides,deck.onlineFonts,false).flatMap(use=>{
    const key=fontFamilyKey(use.family),font=registered.get(key);
    return font&&!imported.has(key)?[{font,weight:use.weight,style:use.italic?'italic' as const:'normal' as const,sample:use.text}]:[];
  });
}

export async function loadDeckOnlineFonts(deck: Deck) {
  await Promise.all(onlineFontUses(deck).map(use => loadOnlineFont(use.font, use.weight, use.sample, use.style)));
}
export async function embeddedOnlineFonts(deck: Deck,signal?:AbortSignal) {
  const definitions = new Map<string, string>();
  const verified = new Map<string, OnlineFont>();
  for (const use of onlineFontUses(deck)) {
    const font = await onlineReference(onlineFontItem(use.font),signal); verified.set(font.id, font);
    for (const face of await fontFaces(use.font, use.weight, use.style, use.sample,signal)) {
      if (definitions.has(face.url)) continue;
      const bytes = new Uint8Array(await fontBytes(face.url,signal)); let str = '';
      for (let i = 0; i < bytes.length; i += 32768) str += String.fromCharCode(...bytes.slice(i, i + 32768));
      definitions.set(face.url, `@font-face{font-family:${JSON.stringify(use.font.family)};src:url(data:font/woff2;base64,${btoa(str)});font-weight:${face.weight};font-style:${face.style};unicode-range:${face.range};}`);
    }
  }
  const licenses = [...verified.values()].map(f => `/* ${f.family} · Fontsource ${f.version}\n${f.licenseNotice.replaceAll('*/', '* /').replace(/[<>]/g, '')}\n*/`);
  return [...licenses, ...definitions.values()];
}
