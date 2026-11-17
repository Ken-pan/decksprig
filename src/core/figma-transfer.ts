import {fontFamilyKey,sameFontFamily} from './font-stack';
import type {Deck} from './model';
import type {NativeAssets} from '../../plugins/figma-export/native';
import {imageLayout} from './image-style';
import {loadPptxImage} from './pptx-image';
import {figmaAssetKey,figmaVisualChanged} from './figma-assets';

/** Portable, credential-free handoff. Raster crops use the editor's geometry. */
export async function figmaTransfer(deck: Deck,previous?:Deck): Promise<{kind:'deck-studio-figma/1';deck:Deck;assets:NativeAssets}> {
  const assets: NativeAssets={};
  const counts=new Map<string,number>();for(const s of deck.slides)for(const e of s.elements)counts.set(e.id,(counts.get(e.id)??0)+1);
  for(const slide of deck.slides)for(const e of slide.elements){
    const prior=previous?.slides.find(s=>s.id===slide.id)?.elements.find(v=>v.id===e.id);
    const key=counts.get(e.id)!>1?figmaAssetKey(slide.id,e.id):e.id;
    if(previous?.width===deck.width&&previous.height===deck.height&&!figmaVisualChanged(e,prior)&&(!e.sourceRegion||previous.slides.find(s=>s.id===slide.id)?.source?.render===slide.source?.render))continue;
    if(e.type==='image'||e.type==='prototype'){
      const src=e.sourceRegion&&slide.source?.render?slide.source.render:e.src??e.prototype?.poster;if(!src)continue;
      const blob=await loadPptxImage(src,e.name);
      if(blob.type.includes('svg')&&!e.crop&&!e.sourceRegion){assets[key]={svg:await blob.text()};continue;}
      const bitmap=await createImageBitmap(blob);
      try{
        const canvas=document.createElement('canvas'),scale=Math.min(2,4096/Math.max(e.w,e.h));canvas.width=Math.max(1,Math.round(e.w*scale));canvas.height=Math.max(1,Math.round(e.h*scale));const ctx=canvas.getContext('2d')!;ctx.scale(scale,scale);
        const image=e.sourceRegion?{...e,crop:e.sourceRegion,fit:'fill' as const,imageSize:undefined}:e,r=imageLayout(image,{w:bitmap.width,h:bitmap.height});
        ctx.save();ctx.beginPath();ctx.rect(r.visible.x,r.visible.y,r.visible.w,r.visible.h);ctx.clip();ctx.drawImage(bitmap,r.x,r.y,r.w,r.h);ctx.restore();
        assets[key]={image:canvas.toDataURL('image/png')};
      }finally{bitmap.close();}
    }else if(e.type==='chart'){
      const {renderChartSvg}=await import('./chart-render');assets[key]={svg:renderChartSvg(e,false,deck.onlineFonts?.find(font=>sameFontFamily(font.family,e.fontFamily))?.category)};
    }else if(e.type==='diamond'||e.shape){
      const {shapePath}=await import('./shape-geometry');assets[key]={svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${e.w}" height="${e.h}" viewBox="0 0 ${e.w} ${e.h}"><path d="${shapePath(e)}" fill="${e.fill}" stroke="${e.stroke}" stroke-width="${e.strokeWidth}"/></svg>`};
    }
  }
  return {kind:'deck-studio-figma/1',deck,assets};
}
