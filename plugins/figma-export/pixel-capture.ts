/** A node PNG exported at fractional bounds is resampled when recomposed. For
 * isolated top-level LIGHTEN frames, capture on the slide's integer pixel grid
 * while keeping the parent blend operation outside the transparent image. */
export async function captureAlignedVisual(figma:any,node:any,slide:any):Promise<{bytes:Uint8Array;bounds:{x:number;y:number;width:number;height:number}}|undefined>{
 if(node.type!=='FRAME'||node.parent!==slide||node.blendMode!=='LIGHTEN'||node.opacity!==1||node.isMask||!Array.isArray(node.fills)||node.fills.length||node.effects?.some((e:any)=>e.visible!==false)||node.strokes?.some((p:any)=>p.visible!==false))return;
 const b=slide.absoluteBoundingBox,r=node.absoluteRenderBounds??node.absoluteBoundingBox,a=node.absoluteTransform;if(!b||!r||!a)return;
 const left=Math.floor(Math.max(0,r.x-b.x)),top=Math.floor(Math.max(0,r.y-b.y)),right=Math.ceil(Math.min(b.width,r.x+r.width-b.x)),bottom=Math.ceil(Math.min(b.height,r.y+r.height-b.y));
 if(right<=left||bottom<=top||right-left>4096||bottom-top>4096)return;
 const bounds={x:b.x+left,y:b.y+top,width:right-left,height:bottom-top},fonts=new Map<string,any>();
 for(const text of node.findAllWithCriteria?.({types:['TEXT']})??[])for(const s of text.getStyledTextSegments(['fontName']))fonts.set(JSON.stringify(s.fontName),s.fontName);
 for(const font of fonts.values())await figma.loadFontAsync(font);
 let frame:any,copy:any;
 try{frame=figma.createFrame();slide.appendChild(frame);frame.name='Temporary pixel-grid capture';frame.fills=[];frame.strokes=[];frame.clipsContent=true;frame.resize(bounds.width,bounds.height);frame.x=left;frame.y=top;copy=node.clone();frame.appendChild(copy);copy.relativeTransform=[[a[0][0],a[0][1],a[0][2]-bounds.x],[a[1][0],a[1][1],a[1][2]-bounds.y]];
  return {bytes:await frame.exportAsync({format:'PNG',constraint:{type:'SCALE',value:1}}),bounds};
 }finally{if(copy&&!copy.removed)copy.remove();if(frame&&!frame.removed)frame.remove();}
}
