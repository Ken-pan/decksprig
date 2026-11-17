import type {SlideElement} from './model';

export type FigmaAsset={svg?:string;bytes?:number[];image?:string};
export type FigmaAssets=Record<string,FigmaAsset>;
export const figmaAssetKey=(slideId:string,elementId:string)=>JSON.stringify([slideId,elementId]);
export const figmaAsset=(assets:FigmaAssets,slideId:string,elementId:string)=>assets[figmaAssetKey(slideId,elementId)]??assets[elementId];
const wrapperFields=new Set(['id','sourceId','name','x','y','rotation','flipX','flipY','hidden','locked','opacity','blendMode','group','nativeTextLayout','shadow','animation','motionKey','motionMatch']);
/** Body data is separate from the native wrapper's position and appearance. */
export function figmaVisualChanged(e:SlideElement,prior?:SlideElement){
  return !prior||[...new Set([...Object.keys(e),...Object.keys(prior)])].some(key=>!wrapperFields.has(key)&&JSON.stringify(e[key as keyof SlideElement])!==JSON.stringify(prior[key as keyof SlideElement]));
}
