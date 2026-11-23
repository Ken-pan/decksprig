import {assetPath,readAssetText} from './runtime-assets';
import {attributionText, type ResourceItem} from '../src/core/resources';
import {customizeGraphic,graphicInfo,graphicDetailSvg,normalizeGraphicRecipe} from '../public/resources/graphic-engine.js';
import {GraphicRecipeSchema,type GraphicRecipe} from '../src/core/graphic-recipe';

export type GraphicRecord = Omit<ResourceItem, 'kind' | 'previewUrl' | 'attribution' | 'collection'> & {file: string; sha256: string; background: boolean};
let library: Promise<GraphicRecord[]> | undefined;
export function graphicLibrary(): Promise<GraphicRecord[]> {
  return library ??= readAssetText(assetPath('resources/deck-graphics-v1/manifest.json')).then(raw => JSON.parse(raw).items);
}
export function graphicItem(record: GraphicRecord): ResourceItem {
  const id = `deck-graphics:${record.category === 'accent' ? 'accent-' : ''}${record.id}`;
  const resource = {...record, ...graphicInfo(record), id, kind: 'illustration' as const, attribution: ''};
  return {...resource, collection: 'deck-graphics', attribution: attributionText(resource), previewUrl: `/api/resources/preview?id=${encodeURIComponent(id)}`};
}
export async function graphicImage(id: string, color: string, raw?:GraphicRecipe, detail=false) {
  const record = (await graphicLibrary()).find(item => graphicItem(item).id === id);
  if (!record) throw new Error('This graphic does not exist.');
  const recipe=normalizeGraphicRecipe(GraphicRecipeSchema.parse(raw===undefined?{}:raw)),info=graphicInfo(record);
  const svg=customizeGraphic(await readAssetText(assetPath('resources/deck-graphics-v1',record.file)),color,recipe,info.repeatable);
  return {item:{...graphicItem(record),...(raw?{graphicRecipe:recipe}:{})},svg:detail?graphicDetailSvg(svg,info,record.width,record.height):svg};
}
