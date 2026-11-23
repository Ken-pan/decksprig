import type {Slide,SlideElement} from './model';
/** The editor letterboxes mixed native page sizes into one shared canvas.
 * Convert back to each existing slide's own coordinates before native writes. */
export function nativeSlideSpace(slide:Slide,width:number,height:number,nativeWidth:number,nativeHeight:number):Slide{
 const scale=Math.min(width/nativeWidth,height/nativeHeight),ox=(width-nativeWidth*scale)/2,oy=(height-nativeHeight*scale)/2;if(Math.abs(scale-1)<1e-9&&Math.abs(ox)<1e-9&&Math.abs(oy)<1e-9)return slide;
 const run=(r:any)=>({...r,...(r.fontSize!==undefined?{fontSize:r.fontSize/scale}:{}),...(r.letterSpacing!==undefined?{letterSpacing:r.letterSpacing/scale}:{})});
 const elements=slide.elements.map((e):SlideElement=>({...e,x:(e.x-ox)/scale,y:(e.y-oy)/scale,w:e.w/scale,h:e.h/scale,fontSize:e.fontSize/scale,letterSpacing:e.letterSpacing/scale,strokeWidth:e.strokeWidth/scale,radius:e.radius/scale,
  ...(e.padding?{padding:{left:e.padding.left/scale,right:e.padding.right/scale,top:e.padding.top/scale,bottom:e.padding.bottom/scale}}:{}),
  ...(e.shadow?{shadow:{...e.shadow,x:e.shadow.x/scale,y:e.shadow.y/scale,blur:e.shadow.blur/scale}}:{}),
  ...(e.runs?{runs:e.runs.map(run)}:{}),...(e.paragraphs?{paragraphs:e.paragraphs.map(p=>({...p,runs:p.runs.map(run),spaceBefore:p.spaceBefore/scale,spaceAfter:p.spaceAfter/scale,indent:p.indent/scale,firstLineIndent:p.firstLineIndent/scale,...(p.lineSpacing!==undefined?{lineSpacing:p.lineSpacing/scale}:{}),...(p.endStyle?{endStyle:run(p.endStyle)}:{})}))}:{}),
  ...(e.line?.dashArray?{line:{...e.line,dashArray:e.line.dashArray.map(v=>v/scale)}}:{})}));
 return {...slide,elements};
}
