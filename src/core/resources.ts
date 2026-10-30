import {z} from './schema';
import { element, uid, ResourceAttributionSchema, type ResourceAttribution, type SlideElement, type Deck } from './model';
import { applyOperations, type Operation } from './operations';
import { resourceReplacementPatch, type ResourceReplacementOptions } from './resource-replacement';
import type {IllustrationType} from './resource-taxonomy';
import {defaultIllustrationColor,isThemedIllustration} from './illustration-defaults';
import {deckDesignSystem} from './deck-design-system';
import {isGraphicBackground} from './resource-purpose';
export {isGraphicBackground} from './resource-purpose';

export type ResourceKind = 'photo' | 'icon' | 'illustration';
export type ResourceItem = ResourceAttribution & {previewUrl: string; width?: number; height?: number; colorable?: boolean; collection?: string; category?: string; illustrationType?: IllustrationType; tags?: string[]; family?:string; description?:string; useCases?:string[]; repeatable?:boolean};
export type ResourcePage = {items: ResourceItem[]; page: number; hasMore: boolean; total?: number; facets?:{families:{id:string;label:string;count:number}[]}};
export type EmbeddedResource = {src: string; resource: ResourceAttribution};
export const ICON_SETS = [{id: 'lucide', label: 'Lucide'}, {id: 'tabler', label: 'Tabler'}, {id: 'ph', label: 'Phosphor'}, {id: 'heroicons', label: 'Heroicons'}, {id: 'bi', label: 'Bootstrap'}, {id: 'material-symbols', label: 'Material Symbols'}, {id: 'ri', label: 'Remix'}, {id: 'carbon', label: 'Carbon'}, {id: 'radix-icons', label: 'Radix'}, {id: 'iconoir', label: 'Iconoir'}];
export const ILLUSTRATION_SETS = [{id: 'all', label: 'All collections'}, {id: 'deck-graphics', label: 'Decksprig · Recolorable'}, {id: 'blue-black', label: 'Duoquill · Recolorable'}, {id: 'doodles', label: 'Open Doodles · Hand-drawn'}, {id: 'illlustrations', label: 'illlustrations · Color'}];
export const GRAPHIC_CATEGORIES = [{id: '', label: 'All'}, {id: 'pattern', label: 'Patterns'}, {id: 'texture', label: 'Textures'}];
export const RESOURCE_CATEGORIES = [{id: '', label: 'All topics'}, {id: 'work', label: 'Work and collaboration'}, {id: 'technology', label: 'Technology and devices'}, {id: 'people', label: 'People and activities'}, {id: 'nature', label: 'Nature and animals'}, {id: 'lifestyle', label: 'Life and travel'}];
export const PHOTO_SOURCES = [{id: '', label: 'All sources'}, {id: 'unsplash', label: 'Unsplash'}, {id: 'pexels', label: 'Pexels'}, {id: 'flickr', label: 'Flickr'}, {id: 'wikimedia', label: 'Wikimedia Commons'}, {id: 'wordpress', label: 'WordPress Photos'}, {id: 'stocksnap', label: 'StockSnap'}, {id: 'nasa', label: 'NASA'}, {id: 'rawpixel', label: 'Rawpixel'}, {id: 'europeana', label: 'Europeana'}, {id: 'smithsonian_national_museum_of_natural_history', label: 'Smithsonian · Natural history'}, {id: 'smithsonian_air_and_space_museum', label: 'Smithsonian · Air and space'}];
export type StockPhotoProvider = 'unsplash' | 'pexels';
export type PhotoProviderStatus = {id: StockPhotoProvider; label: string; configured: boolean; configuration: 'session' | 'environment' | 'none'};
export const isStockPhotoSource = (source: string): source is StockPhotoProvider => source === 'unsplash' || source === 'pexels';
export function photoBrowseUrl(source: StockPhotoProvider, query: string) { const q = encodeURIComponent(resourceQuery(query) || 'nature'); return source === 'unsplash' ? `https://unsplash.com/s/photos/${q}?utm_source=deck_studio&utm_medium=referral` : `https://www.pexels.com/search/${q}/`; }
export function unsplashImageUrl(raw: string) { try { const url = new URL(raw); return url.protocol === 'https:' && url.hostname === 'images.unsplash.com' && !url.username && !url.password && !url.port && !['client_id','access_key','api_key'].some(key => url.searchParams.has(key)); } catch { return false; } }
export type ResourceCatalog = {iconCount: number; illustrationCount: number; collections: {id: string; label: string; count: number; license: string}[]};
export const MAX_RESOURCE_BATCH = 12;
export function resourceMetadata(item: ResourceAttribution): ResourceAttribution { return z.object(ResourceAttributionSchema.shape).parse(item); }
export const DOODLES = [
  ['running', 'Running', 'run running fitness 运动'], ['reading-side', 'Reading time', 'read reading book 学习 阅读'],
  ['jumping', 'Jumping', 'jump energy 跳跃 活力'], ['sitting-reading', 'Seated reading', 'reading book 学习 阅读'],
  ['groovy', 'Taking a walk', 'walk walking 散步'], ['reading', 'Deep reading', 'reading book 阅读 学习'],
  ['petting', 'Walking the dog', 'dog pet 狗 宠物 陪伴'], ['sleek', 'Light steps', 'walk walking 散步'],
  ['plant', 'Caring for plants', 'plant nature 植物 自然'], ['loving', 'Love and care', 'love heart 爱 心 关怀'],
  ['sitting', 'Taking a break', 'sit rest 休息'], ['moshing', 'Dancing freely', 'dance music 舞蹈 音乐'],
  ['bikini', 'Summer', 'summer beach 夏天 海滩'], ['ice-cream', 'Ice cream', 'ice cream food 食物 冰淇淋'],
  ['dog-jump', 'Playing with a dog', 'dog play 狗 宠物'], ['levitate', 'Imagination', 'float idea 创意 灵感'],
  ['ballet', 'Ballet', 'ballet dance 舞蹈'], ['rolling', 'A happy walk', 'walk happy 散步 快乐'],
  ['swinging', 'On a swing', 'swing play 玩耍'], ['float', 'Floating', 'float dream 梦想'],
  ['coffee', 'Coffee break', 'coffee work 咖啡 工作'], ['dancing', 'Dancing to music', 'music dance 音乐 舞蹈'],
  ['selfie', 'Taking a selfie', 'selfie photo camera 自拍 照片 相机'], ['clumsy', 'A busy day', 'work paper 工作'],
  ['strolling', 'Moving forward', 'walk happy 散步 快乐'], ['unboxing', 'Unboxing', 'box delivery 礼物 包裹'],
  ['Doggie', 'Dog companion', 'dog pet 狗 宠物'], ['sprinting', 'Sprinting', 'run sprint fitness 跑步 健身'],
  ['roller-skating', 'Skating', 'skating sport 运动'], ['zombieing', 'Playful steps', 'walk fun 散步'],
  ['meditating', 'Meditation', 'meditation calm focus 冥想 专注'], ['chilling', 'Relaxing', 'rest calm relax 休息 放松'],
  ['laying', 'Using a phone', 'phone rest 手机 休息'],
];
const translations: Record<string, string> = {'自然':'nature', '建筑':'architecture', '工作':'work', '团队':'team', '城市':'city', '海洋':'ocean', '山':'mountain', '植物':'plant', '科技':'technology', '人物':'people', '旅行':'travel', '食物':'food', '咖啡':'coffee', '家':'home', '首页':'home', '搜索':'search', '用户':'user', '设置':'settings', '相机':'camera', '心':'heart', '箭头':'arrow', '图表':'chart', '文件':'file', '图片':'image', '邮件':'mail', '日历':'calendar', '星星':'star', '下载':'download'};
Object.assign(translations, {'电脑':'computer', '手机':'phone', '设计':'design', '音乐':'music', '运动':'sport', '狗':'dog', '猫':'cat', '阅读':'reading', '书':'book', '机器人':'robot', '飞机':'airplane', '火箭':'rocket', '地图':'map', '位置':'location', '购物':'shopping', '安全':'shield', '锁':'lock', '上传':'upload', '太阳':'sun', '月亮':'moon', '播放':'play', '暂停':'pause', '删除':'trash', '编辑':'edit', '添加':'plus', '关闭':'close', '左':'left', '右':'right', '上':'up', '下':'down', '房子':'home', '文件夹':'folder', '勾选':'check', '完成':'check', '时间':'clock', '咖啡杯':'coffee', '钱':'money', '宠物':'pet'});
const graphicTranslations: Record<string,string> = {'网点':'halftone', '网格':'grid', '背景':'background', '纹理':'texture', '颗粒':'grain', '波纹':'ripple', '星芒':'starburst', '圈画':'annotation', '胶带':'tape', '涂鸦':'scribble', '下划线':'underline', '装饰':'accent'};
export function resourceQuery(query: string) { const value = query.trim().slice(0, 120); return graphicTranslations[value] ?? translations[value] ?? value.split(/\s+/).map(word => graphicTranslations[word] ?? translations[word] ?? word).join(' '); }
const synonyms: Record<string, string[]> = {home: ['house'], search: ['magnifying', 'magnifier'], user: ['person', 'people', 'account'], image: ['photo', 'picture'], trash: ['delete', 'bin'], close: ['x', 'cross'], camera: ['photo'], computer: ['desktop', 'laptop', 'mac', 'pc'], sport: ['fitness', 'gym', 'running'], work: ['office', 'freelance'], music: ['audio', 'headphones'], heart: ['love'], money: ['dollar', 'currency'], book: ['reading']};
export function resourceMatches(text: string, query: string) {
  const value = text.toLowerCase();
  return [query, resourceQuery(query)].some(q => q.toLowerCase().split(/[\s_-]+/).filter(Boolean).every(token => [token, ...(synonyms[token] || [])].some(word => value.includes(word))));
}

export function attributionText(resource: ResourceAttribution) {
  return `${resource.title} — ${resource.creator || resource.provider} · ${resource.license}\n${resource.sourceUrl}\nLicense: ${resource.licenseUrl}`;
}
export function resourceElement(src: string, resource: ResourceAttribution | undefined, width: number, height: number, deck: Deck): SlideElement {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('This image has invalid dimensions. Choose another image.');
  const unit = Math.min(deck.width / 1440, deck.height / 810);
  const bounds = resource?.kind === 'icon' ? {w: 64, h: 64} : resource?.kind === 'illustration' ? {w: 320, h: 320} : {w: 480, h: 360};
  // Vectors can scale freely. Small raster images retain their decoded resolution on click.
  const vector = /^data:image\/svg\+xml[;,]/i.test(src);
  const scale = Math.min(bounds.w * unit / width, bounds.h * unit / height, vector ? Infinity : 1);
  const w = Math.max(1, width * scale), h = Math.max(1, height * scale);
  const accent=defaultIllustrationColor(deck), linked=isThemedIllustration(resource)&&resource?.color?.toLowerCase()===accent&&accent===deckDesignSystem(deck).colors.accent.toLowerCase();
  return element('image', {src, resource, ...(linked?{fill:accent,design:{fill:'accent' as const}}:{}), name: (resource?.title ?? 'Image').slice(0, 200), w, h, x: (deck.width - w) / 2, y: (deck.height - h) / 2, fit: resource && isGraphicBackground(resource.id) ? 'fill' : 'contain', ...(resource && isGraphicBackground(resource.id) ? {aspectRatioLocked: false} : {})});
}
export function resourceOperation(deck: Deck, slideId: string, image: SlideElement, replaceId?: string, options?: ResourceReplacementOptions): Operation {
  const slide = deck.slides.find(s => s.id === slideId);
  if (!slide) throw new Error('The target slide is no longer open. Select it again.');
  if (!replaceId) return {op: 'add_element', slideId, element: image};
  const target = slide.elements.find(e => e.id === replaceId);
  if (!target || target.type !== 'image') throw new Error('The image to replace has changed. Select it again.');
  if (target.locked) throw new Error('Unlock the image first.');
  return {op: 'update_element', slideId, elementId: replaceId, patch: resourceReplacementPatch(image, {fit: options?.fit ?? target.fit}),unset:[...(target.crop?['crop' as const]:[]),...(!image.resource&&target.resource?['resource' as const]:[])]};
}
export function resourceBackgroundOperations(deck: Deck, slideId: string, image: SlideElement): Operation[] {
  const slide = deck.slides.find(s => s.id === slideId);
  if (!slide) throw new Error('The target slide is no longer open. Select it again.');
  if (!image.resource || !isGraphicBackground(image.resource.id)) throw new Error('Choose a pattern or texture to fill this slide.');
  const background = {...image, name: `${image.name} · Background`, x: 0, y: 0, w: deck.width, h: deck.height, fit: 'fill' as const, aspectRatioLocked: false, locked: true};
  return [{op: 'add_element', slideId, element: background}, {op: 'reorder_elements', slideId, ids: [image.id, ...slide.elements.map(e => e.id)]}];
}
export function resourceBatchOperations(deck: Deck, slideId: string, images: SlideElement[]): Operation[] {
  if (!images.length || images.length > MAX_RESOURCE_BATCH) throw new Error(`Select 1–${MAX_RESOURCE_BATCH}  resources to add.`);
  if (!deck.slides.some(s => s.id === slideId)) throw new Error('The target slide is no longer open.');
  if (images.length === 1) return [resourceOperation(deck, slideId, images[0])];
  const columns = Math.min(images.length, Math.ceil(Math.sqrt(images.length * deck.width / deck.height))), rows = Math.ceil(images.length / columns);
  const padding = Math.min(deck.width, deck.height) * .07, gap = padding * .5;
  const cellW = (deck.width - padding * 2 - (columns - 1) * gap) / columns;
  const cellH = (deck.height - padding * 2 - (rows - 1) * gap) / rows;
  const group = uid('resources');
  return images.map((image, i) => {
    const scale = Math.min(cellW / image.w, cellH / image.h, 1), w = Math.max(1, image.w * scale), h = Math.max(1, image.h * scale);
    const copy = {...image, group, w, h, x: padding + (i % columns) * (cellW + gap) + (cellW - w) / 2, y: padding + Math.floor(i / columns) * (cellH + gap) + (cellH - h) / 2};
    return {op: 'add_element', slideId, element: copy};
  });
}
export function validateResourceImport(deck: Deck, operations: Operation[], maxBytes = 100_000_000) {
  const candidate = applyOperations(deck, operations, deck.revision);
  if (new TextEncoder().encode(JSON.stringify(candidate)).byteLength > maxBytes) throw new Error('The document would exceed 100 MB. Add fewer resources or compress the original images.');
}
export {usedResourceCredits, resourceCredits} from './resource-credits';
