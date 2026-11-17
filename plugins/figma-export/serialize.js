// Read-only fallback for environments that do not expose JSON_REST_V1.
function serializeForDeck(node) {
  const result = {id: node.id, name: node.name, type: node.type};
  for (const key of ['visible','opacity','absoluteBoundingBox','absoluteRenderBounds','fills','strokes','strokeWeight','cornerRadius','clipsContent','isMask','effects','interactiveSlideElementType']) {
    if (key in node && typeof node[key] !== 'symbol') result[key] = node[key];
  }
  if ('width' in node) result.size = {x: node.width, y: node.height};
  if ('relativeTransform' in node) result.relativeTransform = node.relativeTransform;
  if (node.type === 'TEXT') {
    result.characters = node.characters;
    const segments = node.getStyledTextSegments(['fontName','fontSize','fontWeight','fills','textDecoration','lineHeight','letterSpacing','hyperlink']);
    if (segments.some(segment => segment.hyperlink)) result.hasHyperlinks = true;
    const style = segment => ({fontFamily: segment.fontName.family,fontWeight: segment.fontWeight,fontSize: segment.fontSize,italic:/italic/i.test(segment.fontName.style),fills:segment.fills,textDecoration:segment.textDecoration,lineHeightPx:segment.lineHeight.unit==='PIXELS'?segment.lineHeight.value:segment.lineHeight.unit==='PERCENT'?segment.fontSize*segment.lineHeight.value/100:undefined,letterSpacing:segment.letterSpacing.unit==='PIXELS'?segment.letterSpacing.value:segment.fontSize*segment.letterSpacing.value/100,textAlignHorizontal:node.textAlignHorizontal,textAlignVertical:node.textAlignVertical,textTruncation:node.textTruncation,maxLines:node.maxLines});
    result.style = segments[0] ? style(segments[0]) : {};
    result.styleOverrideTable = {}; result.characterStyleOverrides = [];
    segments.forEach((segment, i) => {result.styleOverrideTable[i+1]=style(segment);for(let j=segment.start;j<segment.end;j++)result.characterStyleOverrides[j]=i+1;});
  }
  if ('children' in node) result.children = node.children.map(serializeForDeck);
  return result;
}
