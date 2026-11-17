import type {SlideElement} from '../../src/core/model';
import {imageLayout} from '../../src/core/image-style';

/** Keep SVG content in the same element viewport as the browser, including
 * letterboxing, cover positioning and the native slide coordinate scale. */
export function svgForFigma(svg:string,e:SlideElement){
  const root=/<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i.exec(svg.trim());
  if(!root)throw new Error('The SVG visual is invalid. No content was changed.');
  const attribute=(name:string)=>new RegExp('(?:^|\\s)'+name+'\\s*=\\s*(["\'])((?:.|\\n)*?)\\1','i').exec(root[1])?.[2];
  const viewBox=attribute('viewBox')?.trim().split(/[\s,]+/).map(Number),validView=viewBox?.length===4&&viewBox.every(Number.isFinite)&&viewBox[2]>0&&viewBox[3]>0;
  const length=(value?:string)=>{const m=value?.trim().match(/^([\d.+eE-]+)(px|pt|pc|in|cm|mm)?$/);return m?Number(m[1])*({px:1,pt:4/3,pc:16,in:96,cm:96/2.54,mm:96/25.4}[m[2] as 'px']??1):undefined;};
  const w=length(attribute('width'))??(validView?viewBox![2]:undefined),h=length(attribute('height'))??(validView?viewBox![3]:undefined);
  if(!w||!h||!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)throw new Error('The SVG visual needs a valid size or viewBox. No content was changed.');
  const r=e.type==='image'?imageLayout(e,{w,h}):{x:0,y:0,w:e.w,h:e.h,visible:{x:0,y:0,w:e.w,h:e.h}};
  const attrs=root[1].replace(/(?:^|\s)(?:x|y|width|height|viewBox|preserveAspectRatio)\s*=\s*(["'])[\s\S]*?\1/gi,''),preserve=(attribute('preserveAspectRatio')??'xMidYMid meet').replaceAll('&','&amp;').replaceAll('"','&quot;');
  let clip='deck-native-viewport';while(svg.includes(clip))clip+='_';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${e.w}" height="${e.h}" viewBox="0 0 ${e.w} ${e.h}"><defs><clipPath id="${clip}"><rect x="${r.visible.x}" y="${r.visible.y}" width="${r.visible.w}" height="${r.visible.h}"/></clipPath></defs><g clip-path="url(#${clip})"><g transform="translate(${r.x} ${r.y}) scale(${r.w/w} ${r.h/h})"><svg ${attrs} width="${w}" height="${h}" viewBox="${validView?viewBox!.join(' '):`0 0 ${w} ${h}`}" preserveAspectRatio="${preserve}">${root[2]}</svg></g></g></svg>`;
}
