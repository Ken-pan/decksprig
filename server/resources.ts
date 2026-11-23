import {themedIllustrationSvg,standaloneIllustrationSvg} from '../public/resources/illustration-engine.js';
import {assetPath,readAsset,readAssetText} from './runtime-assets';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { getIconData, iconToSVG } from '@iconify/utils';
import { ResourceAttributionSchema, type ResourceAttribution } from '../src/core/model';
import { DOODLES, ICON_SETS, PHOTO_SOURCES, isStockPhotoSource, resourceQuery, resourceMatches, resourceMetadata, attributionText, type ResourceItem, type ResourcePage } from '../src/core/resources';
import { photoProviders } from './photo-providers';
import { matchesIllustrationView } from '../src/core/resource-taxonomy';

import { iconLibrary, localIcon, findIcons, illustrationLibrary, illustrationCategory, resourceCatalog } from './resource-catalog';
import { blueBlackLibrary, blueBlackItem, blueBlackImage } from './blue-black';
import { ORIGINAL_ACCENT } from '../public/resources/accent-engine.js';
import { characterResource } from './characters';
import {graphicLibrary, graphicItem, graphicImage} from './deck-graphics';
import {graphicSearchScore,graphicFacets,graphicInfo,normalizeGraphicRecipe} from '../public/resources/graphic-engine.js';
import {GraphicRecipeSchema,type GraphicRecipe} from '../src/core/graphic-recipe';
export { resourceCatalog } from './resource-catalog';

let iconLicenses: Promise<Record<string, {url: string}>> | undefined;
function iconLicenseIndex() {
  return iconLicenses ??= readAssetText(assetPath('resources/licenses/index.json')).then(raw => JSON.parse(raw) as Record<string, {url: string}>).catch(error => {iconLicenses = undefined; throw error;});
}
const imageLimit = 12_000_000;
const cache = new Map<string, {expires: number; page: ResourcePage}>();
const photos = new Map<string, ResourceItem & {downloadUrl: string; thumbnailUrl: string}>();
const iconBodies = new Map<string, NonNullable<ReturnType<typeof getIconData>>>();
function remember<T>(map: Map<string, T>, key: string, value: T, max = 300) { map.delete(key); map.set(key, value); if (map.size > max) map.delete(map.keys().next().value!); }
export {publicAddress,publicImageUrl} from './public-resource-fetch';
import {fetchPublicResource as remote} from './public-resource-fetch';
async function remoteJson(url: string) { const data = await remote(url, 3_000_000); return JSON.parse(data.bytes.toString('utf8')); }
export function iconSvg(icon: NonNullable<ReturnType<typeof getIconData>>, color: string) {
  if (!/^#[\da-fA-F]{6}$/.test(color)) throw new Error('Invalid color format.');
  const built = iconToSVG(icon, {width: icon.width || 24, height: icon.height || 24});
  const attrs = Object.entries(built.attributes).map(([key, value]) => `${key}="${String(value).replaceAll('"', '&quot;')}"`).join(' ');
  return sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" ${attrs} color="${color}">${built.body.replaceAll('currentColor', color)}</svg>`);
}
export function sanitizeSvg(svg: string): string {
  if (/<!DOCTYPE|<!ENTITY/i.test(svg) || XMLValidator.validate(svg) !== true) throw new Error('Unsupported SVG format.');
  const tree = new XMLParser({ignoreAttributes: false, processEntities: true}).parse(svg);
  const tags = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'use', 'title', 'desc', 'symbol', 'pattern', 'filter', 'feColorMatrix', 'text', 'tspan', 'image']);
  function inspect(node: any, tag = '') {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === '?xml' || key === '#text') continue;
      if (key.startsWith('@_')) {
        const attr = key.slice(2).toLowerCase(), text = String(value);
        const embedded = tag === 'image' && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(text);
        if (embedded && (text.length > imageLimit || !imageMime(Buffer.from(text.split(',')[1], 'base64')))) throw new Error('Invalid embedded image format in SVG.');
        if (attr.startsWith('on') || (attr.endsWith('href') && !/^#[\w:.-]+$/.test(text) && !embedded) || /url\(\s*(?!['"]?#)/i.test(text) || /javascript:|@import|expression\(/i.test(text)) throw new Error('The SVG contains external or dynamic content.');
      } else { if (!tags.has(key)) throw new Error('The SVG contains unsupported content.'); for (const child of Array.isArray(value) ? value : [value]) inspect(child, key); }
    }
  }
  if (!tree.svg) throw new Error('The SVG is empty.');
  inspect(tree);
  return svg;
}
const photoLicense: Record<string, string> = {cc0: 'CC0 1.0', pdm: 'Public Domain', by: 'CC BY'};
export function normalizePhoto(raw: any): (ResourceItem & {downloadUrl: string; thumbnailUrl: string}) | null {
  if (!photoLicense[raw.license] || raw.mature || !/^[\da-f-]{36}$/.test(raw.id ?? '') || !/^https:\/\//.test(raw.url ?? '') || !/^https:\/\//.test(raw.foreign_landing_url ?? '')) return null;
  const license = raw.license === 'by' ? `CC BY ${raw.license_version}` : photoLicense[raw.license];
  if (raw.license === 'by' && !/^\d+\.\d+$/.test(raw.license_version || '')) return null;
  const parsed = ResourceAttributionSchema.safeParse({id: `openverse:${raw.id}`, kind: 'photo', provider: `Openverse · ${raw.provider || raw.source || 'Source'}`, title: String(raw.title || 'Untitled photo').slice(0, 1000), creator: String(raw.creator || 'Source website').slice(0, 500), sourceUrl: raw.foreign_landing_url, license, licenseUrl: raw.license_url, attributionRequired: raw.license === 'by', attribution: ''});
  if (!parsed.success) return null;
  const resource = parsed.data;
  resource.attribution = attributionText(resource);
  return {...resource, downloadUrl: raw.url, thumbnailUrl: /^https:\/\//.test(raw.thumbnail ?? '') ? raw.thumbnail : raw.url, previewUrl: `/api/resources/preview?id=${encodeURIComponent(resource.id)}`, width: raw.width || undefined, height: raw.height || undefined};
}
export function openverseSearchParams(params: URLSearchParams) {
  const source = params.get('source') || '';
  if (!PHOTO_SOURCES.some(s => s.id === source) || isStockPhotoSource(source)) throw new Error('Unsupported open collection source.');
  const archive = ['nasa','rawpixel','europeana','smithsonian_national_museum_of_natural_history','smithsonian_air_and_space_museum'].includes(source);
  const query = resourceQuery(params.get('q') || '');
  const page = Math.min(50, Math.max(1, Math.floor(Number(params.get('page')) || 1)));
  const args = new URLSearchParams({license: params.get('license') === 'by' ? 'by' : 'cc0,pdm', page: String(page), page_size: '20', mature: 'false'});
  if (query || !archive) args.set('q', query || 'architecture');
  // Museum/archival records frequently have no Openverse category; filtering by
  // photograph would silently hide their licensed collection images.
  if (!archive) args.set('category', 'photograph');
  const aspect = params.get('aspect'); if (aspect && ['wide','tall','square'].includes(aspect)) args.set('aspect_ratio', aspect);
  if (source) args.set('source', source);
  return args;
}
function doodleItem(id: string, title: string): ResourceItem {
  const resource: ResourceAttribution = {id: `doodles:${id}`, kind: 'illustration', provider: 'Open Doodles', title, creator: 'Pablo Stanley', sourceUrl: 'https://www.opendoodles.com/', license: 'CC0 1.0', licenseUrl: 'https://www.opendoodles.com/about', attributionRequired: false, attribution: ''};
  return {...resource, attribution: attributionText(resource), previewUrl: `/api/resources/preview?id=${encodeURIComponent(resource.id)}`, colorable: true, width: 1024, height: 768};
}
async function iconItem(id: string): Promise<ResourceItem> {
  const [prefix, name] = id.split(':');
  const set = ICON_SETS.find(s => s.id === prefix);
  if (!set || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name ?? '')) throw new Error('Unsupported icon collection.');
  const library = await iconLibrary(prefix), info = library.info;
  const index = await iconLicenseIndex();
  const resource: ResourceAttribution = {id: `iconify:${id}`, kind: 'icon', provider: set.label, title: name.replaceAll('-', ' '), creator: info.author.name, sourceUrl: `https://icon-sets.iconify.design/${prefix}/${name}/`, license: prefix === 'lucide' ? 'ISC / MIT (Feather)' : info.license.title, licenseUrl: index[prefix].url, attributionRequired: false, attribution: ''};
  return {...resource, attribution: attributionText(resource), previewUrl: `/api/resources/preview?id=${encodeURIComponent(resource.id)}`, width: library.data.width || 24, height: library.data.height || 24, colorable: true, collection: prefix};
}
function illustrationItem(item: {id: string; title: string; sourceUrl: string}): ResourceItem {
  const resource: ResourceAttribution = {id: `illlustrations:${item.id}`, kind: 'illustration', title: item.title, provider: 'illlustrations', creator: 'Vijay Verma', sourceUrl: item.sourceUrl, license: 'CC0 1.0', licenseUrl: 'https://illlustrations.co/license', attributionRequired: false, attribution: ''};
  return {...resource, attribution: attributionText(resource), previewUrl: `/api/resources/preview?id=${encodeURIComponent(resource.id)}`, colorable: true, collection: 'illlustrations', category: illustrationCategory(item.title), tags: item.title.split(' ')};
}
export async function searchResources(params: URLSearchParams): Promise<ResourcePage> {
  const kind = params.get('kind') || 'photo', query = resourceQuery(params.get('q') || ''), page = Math.min(1000, Math.max(1, Math.floor(Number(params.get('page')) || 1)));
  const stockSource = params.get('source') || '';
  if (kind === 'photo' && isStockPhotoSource(stockSource)) return photoProviders.search(stockSource, params);
  const key = params.toString(), cached = cache.get(key);
  if (kind !== 'illustration' && cached && cached.expires > Date.now()) return cached.page;
  let result: ResourcePage;
  if (kind === 'illustration') {
    const collection = params.get('collection') || 'all', category = params.get('category') || '';
    const view = params.get('view') || '', illustrationType = params.get('illustrationType') || '';
    const doodles = DOODLES.map(([id, title, tags]) => ({...doodleItem(id, title), collection: 'doodles', category: illustrationCategory(tags), tags: tags.split(' ')}));
    const graphics=(await graphicLibrary()).map(graphicItem),family=params.get('family')||'',graphicQuery=(params.get('q')||'').trim().slice(0,120);
    const all = [...(await blueBlackLibrary()).map(blueBlackItem), ...graphics, ...doodles, ...(await illustrationLibrary()).map(illustrationItem)].filter(item =>
      matchesIllustrationView(item, view, illustrationType) &&
      (collection === 'all' || item.collection === collection) && (!category || item.category === category) &&
      (!family || (item.collection==='deck-graphics' && graphicInfo(item).family===family)) &&
      (item.collection==='deck-graphics'?Number.isFinite(graphicSearchScore(item,graphicQuery)):resourceMatches(`${item.title} ${item.tags?.join(' ')} ${item.id}`, query)));
    if(collection==='deck-graphics')all.sort((a,b)=>graphicSearchScore(a,graphicQuery)-graphicSearchScore(b,graphicQuery));
    const size = 48;
    result = {items: all.slice((page - 1) * size, page * size), page, hasMore: page * size < all.length, total: all.length,...(collection==='deck-graphics'?{facets:{families:graphicFacets(graphics.filter(item => matchesIllustrationView(item, view, illustrationType)),graphicQuery,category)}}:{})};
  } else if (kind === 'icon') {
    const set = params.get('set') || 'lucide', ids = await findIcons(set, query, params.get('style') || 'all');
    const size = 64;
    result = {items: await Promise.all(ids.slice((page - 1) * size, page * size).map(iconItem)), page, hasMore: page * size < ids.length, total: ids.length};
  } else if (kind === 'photo') {
    const args = openverseSearchParams(params);
    const data = await remoteJson(`https://api.openverse.org/v1/images/?${args}`);
    const items = (data.results ?? []).map(normalizePhoto).filter(Boolean) as (ResourceItem & {downloadUrl: string; thumbnailUrl: string})[];
    for (const item of items) remember(photos, item.id, item);
    result = {items: items.map(({downloadUrl, thumbnailUrl, ...item}) => item), page, hasMore: page < Math.min(50, data.page_count || 1), total: data.result_count};
  } else throw new Error('Unsupported resource type.');
  remember(cache, key, {expires: Date.now() + 300_000, page: result}, 80);
  return result;
}
async function downloadResource(id: string, color = '#26362c', preview = false, recipe?:GraphicRecipe, detail=false): Promise<{bytes: Buffer; type: string; resource: ResourceAttribution}> {
  if(id.startsWith('character:')||id.startsWith('character-saved:'))return characterResource(id);
  if (!/^#[\da-fA-F]{6}$/.test(color)) throw new Error('Invalid color format.');
  let item: ResourceItem, bytes: Buffer, type: string;
  if (id.startsWith('deck-graphics:')) {
    const graphic = await graphicImage(id, color,recipe,detail); item = graphic.item; bytes = Buffer.from(sanitizeSvg(graphic.svg)); type = 'image/svg+xml';
  } else if (id.startsWith('blue-black:')) {
    const image = await blueBlackImage(id, color, preview); item = image.item; bytes = image.bytes; type = 'image/png';
  } else if (id.startsWith('doodles:')) {
    const name = id.slice(8), found = DOODLES.find(([key]) => key === name);
    if (!found) throw new Error('This illustration does not exist.');
    item = doodleItem(...found.slice(0, 2) as [string, string]);
    bytes = await readAsset(assetPath('resources/doodles', `${name}.svg`)); type = 'image/svg+xml';
    bytes = Buffer.from(sanitizeSvg(bytes.toString('utf8')).replace(/#FF5678/gi, color));
  } else if (id.startsWith('illlustrations:')) {
    const name = id.slice('illlustrations:'.length), found = (await illustrationLibrary()).find(item => item.id === name);
    if (!found) throw new Error('This illustration does not exist.');
    item = illustrationItem(found);
    const file=id==='illlustrations:day34-ticket'?'day34-ticket.svg':found.file;
    bytes = await readAsset(assetPath('resources/illlustrations', file));
    if (file.endsWith('.svg')) { type = 'image/svg+xml'; bytes = Buffer.from(themedIllustrationSvg(sanitizeSvg(standaloneIllustrationSvg(bytes.toString('utf8'),id)), color, id)); }
    else { const detected = imageMime(bytes); if (!detected) throw new Error('Unsupported illustration format.'); type = detected; }
  } else if (id.startsWith('iconify:')) {
    item = await iconItem(id.slice(8));
    const [prefix, name] = id.slice(8).split(':');
    const icon = await localIcon(prefix, name);
    if (!icon) throw new Error('This icon does not exist.');
    type = 'image/svg+xml'; bytes = Buffer.from(iconSvg(icon, color));
    item.licenseNotice = await readAssetText(assetPath('resources/licenses', `${prefix}.txt`));
  } else if (/^pexels:[1-9]\d{0,15}$/.test(id)) {
    const photo = await photoProviders.photo(id); item = photo;
    const data = await remote(preview ? photo.thumbnailUrl : photo.imageUrl); bytes = data.bytes;
    const detectedType = imageMime(bytes); if (!detectedType) throw new Error('Unsupported photo format.'); type = detectedType;
  } else if (/^openverse:[\da-f-]{36}$/.test(id)) {
    let photo = photos.get(id);
    if (!photo) { photo = normalizePhoto(await remoteJson(`https://api.openverse.org/v1/images/${id.slice(10)}/`)) ?? undefined; if (!photo) throw new Error('This photo’s license does not meet the library’s requirements.'); remember(photos, id, photo); }
    item = photo;
    const data = await remote(preview ? photo.thumbnailUrl : photo.downloadUrl);
    bytes = data.bytes;
    const detectedType = imageMime(bytes);
    if (!detectedType) throw new Error('Choose a JPEG, PNG, WebP, or GIF photo.');
    type = detectedType;
  } else throw new Error('This resource does not exist.');
  const {previewUrl, width, height, colorable, ...meta} = item;
  // Explicit schema parsing removes transient URLs and provider response fields.
  const resource = resourceMetadata({...meta, ...(colorable ? {color} : {})});
  if (type === 'image/svg+xml' && resource.licenseNotice) {
    const notice = resource.licenseNotice.replaceAll('--', '—');
    bytes = Buffer.from(bytes.toString('utf8').replace(/<svg\b/, `<!-- ${notice} -->\n<svg`));
  }
  return {bytes, type, resource};
}
export function imageMime(bytes: Buffer): string | null {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (/^GIF8[79]a/.test(bytes.subarray(0, 6).toString())) return 'image/gif';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

const previewCache = new Map<string, {expires: number; data: Awaited<ReturnType<typeof downloadResource>>}>();
export async function loadResource(id: string, color = id.startsWith('blue-black:') ? ORIGINAL_ACCENT : '#26362c', preview = false, raw?:unknown, detail=false) {
  if(raw!==undefined&&!id.startsWith('deck-graphics:'))throw new Error('Graphic settings apply to graphics only.');
  const recipe=raw===undefined?undefined:normalizeGraphicRecipe(GraphicRecipeSchema.parse(raw));
  const key = `${id}:${color}:${preview ? 'thumbnail' : 'original'}:${JSON.stringify(recipe)}:${detail}`;
  const cached = previewCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;
  const data = await downloadResource(id, color, preview,recipe,detail);
  // Keep small previews and vectors; original photos are embedded without a server cache.
  if (data.bytes.length < 500_000) remember(previewCache, key, {expires: Date.now() + 600_000, data}, 60);
  return data;
}
