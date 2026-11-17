// A rectangular clip with no overflow can keep its children independently editable.
export function needsRasterGroup(n: any) {
  if (!n.children?.length) return false;
  if (n.type === 'BOOLEAN_OPERATION' || n.children.some((c: any)=>c.isMask)) return true;
  if ((n.effects ?? []).some((e: any) => e.visible !== false) || n.blendMode && !['NORMAL','PASS_THROUGH'].includes(n.blendMode)) return true;
  if ((n.opacity ?? 1) < 1) {
    const boxes=n.children.filter((c: any)=>c.visible!==false).map((c: any)=>c.absoluteRenderBounds??c.absoluteBoundingBox);
    if(boxes.some((a: any,i: number)=>!a||boxes.slice(i+1).some((b: any)=>!b||a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y)))return true;
  }
  if (!n.clipsContent) return false;
  if (n.cornerRadius || n.rectangleCornerRadii?.some((v: number)=>v>0)) return true;
  const b=n.absoluteBoundingBox;
  return !b || n.children.filter((c: any)=>c.visible!==false).some((c: any)=>{
    const q=c.absoluteBoundingBox; return !q || q.x < b.x-.5 || q.y < b.y-.5 || q.x+q.width > b.x+b.width+.5 || q.y+q.height > b.y+b.height+.5;
  });
}

/** Keep representable primitives editable even when a source PNG is available. */
export function needsRasterNode(n: any) {
  if(n.type==='TABLE'||n.deckStudioTable)return true;
  if(n.deckStudioVisual)return true;
  if (needsRasterGroup(n)) return true;
  if (n.children?.length) return false;
  if (n.type === 'TEXT') return false;
  if (!['RECTANGLE', 'ELLIPSE', 'LINE'].includes(n.type)) return true;
  if(n.type==='LINE'&&n.strokeCap&&!['NONE','ROUND','SQUARE'].includes(n.strokeCap))return true;
  const fills = (n.fills ?? []).filter((p: any) => p.visible !== false);
  const strokes = (n.strokes ?? []).filter((p: any) => p.visible !== false);
  const effects = (n.effects ?? []).filter((e: any) => e.visible !== false);
  return fills.length > 1 || fills.some((p: any) => p.type !== 'SOLID' && p.type !== 'IMAGE') ||
    n.type === 'ELLIPSE' && fills.some((p: any) => p.type === 'IMAGE') ||
    n.type !== 'LINE' && n.strokeWeight > 0 && ['CENTER','OUTSIDE'].includes(n.strokeAlign) ||
    fills.some((p: any) => p.type === 'IMAGE' && (p.imageTransform || !['FILL', 'FIT', undefined].includes(p.scaleMode))) ||
    strokes.length > 1 || strokes.some((p: any) => p.type !== 'SOLID') ||
    effects.length > 1 || effects.some((e: any) => e.type !== 'DROP_SHADOW') ||
    n.rectangleCornerRadii?.some((r: number) => r !== n.rectangleCornerRadii[0]);
}
