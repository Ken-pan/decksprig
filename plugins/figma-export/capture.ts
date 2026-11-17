import {captureAlignedVisual} from './pixel-capture';
import {wholeTextLink} from '../../src/core/text-link';
import {stableValue} from '../../src/core/figma-sync';
import {needsRasterNode} from '../../src/importers/figma-raster';
import {nativeLink} from './identity';
import {readSlideNotes} from './notes';
import {serializeNativeTable} from './table';
import {readLayerTable} from './layer-table';
import {readDeckObjectMotion} from './object-motion';
import {captureShapeLabel,readShapeLabel} from './shape-label';
import {SHAPE_LABEL_KEY,SHAPE_LABEL_PART_KEY} from '../../src/core/figma-shape-label';

// Link targets change interaction metadata, never painted glyphs. Keep snapshots
// current while reusing their native visual bytes for this common edit.
function visualCaptureNode(node:any):any {
 const {textLink:_link,hasHyperlinks:_partial,deckStudioMotion:_motion,deckStudioMotionWarning:_motionWarning,...visual}=node;
 if(node.children)visual.children=node.children.map(visualCaptureNode);return visual;
}

export async function captureTextGlyphs(figma:any,node:any){
  let copy:any;const separate=(node.opacity??1)!==1;
  try{
    if(separate){
      for(const s of node.getStyledTextSegments(['fontName']))await figma.loadFontAsync(s.fontName);
      const t=node.absoluteTransform.map((row:number[])=>[...row]);
      copy=node.clone();figma.currentPage.appendChild(copy);copy.name='Temporary glyph capture';
      t[0][2]+=100000;copy.relativeTransform=t;copy.opacity=1;
    }
    const target=copy??node,[text,outline]=await Promise.all([target.exportAsync({format:'SVG_STRING',svgOutlineText:false}),target.exportAsync({format:'SVG_STRING',svgOutlineText:true})]);
    return {text,outline,separate};
  }finally{copy?.remove();}
}

export function serializeForDeck(node: any): any {
  const result: any={id:node.id,name:node.name,type:node.type};
  if(node.type==='SLIDE'){const notes=readSlideNotes(node);if(notes!==undefined)result.speakerNotes=notes;}
  for(const key of ['visible','locked','blendMode','opacity','absoluteBoundingBox','absoluteRenderBounds','fills','strokes','strokeWeight','strokeAlign','dashPattern','strokeCap','cornerRadius','rectangleCornerRadii','clipsContent','isMask','maskType','effects','speakerNotes','isSkippedSlide','interactiveSlideElementType']){
    if(key in node&&typeof node[key]!=='symbol')result[key]=node[key];
  }
  if('width'in node)result.size={x:node.width,y:node.height};
  if('relativeTransform'in node)result.relativeTransform=node.relativeTransform;
  if(typeof node.getPluginData==='function'){
    result.deckStudioId=nativeLink(node,'deck-studio-id')||undefined;
    result.deckStudioGroupId=nativeLink(node,'deck-studio-group')||undefined;result.deckStudioVisual=node.getPluginData('deck-studio-visual')||undefined;
    result.deckStudioTable=readLayerTable(node);
    const shape=captureShapeLabel(node);if(shape)result.deckStudioShapeLabel=shape;else if(node.getPluginData(SHAPE_LABEL_KEY))result.deckStudioShapeLabelWarning='This shape label has unsupported native layer or paint changes. Its native layers remain separate for review.';
    if(node.getPluginData(SHAPE_LABEL_PART_KEY)==='label')for(const key of ['layoutMode','primaryAxisAlignItems','paddingLeft','paddingRight','paddingTop','paddingBottom'])if(key in node)result[key]=node[key];
  }
  const motion=readDeckObjectMotion(node);if(motion.data)result.deckStudioMotion={version:1,source:'deck-studio',...motion.data};if(motion.warning)result.deckStudioMotionWarning=motion.warning;
  if(node.type==='SLIDE'&&node.parent?.type==='SLIDE_ROW')result.pageSection=node.parent.name;
  if(node.type==='SLIDE'&&typeof node.getSlideTransition==='function')result.slideTransition=node.getSlideTransition();
  if(node.type==='TEXT'){
    result.characters=node.characters;
    const segments=node.getStyledTextSegments(['fontName','fontSize','fontWeight','fills','textDecoration','lineHeight','letterSpacing','paragraphSpacing','paragraphIndent','textCase','hyperlink']);
    const link=wholeTextLink(segments);if(link)result.textLink=link;
    if(segments.some((segment:any)=>segment.hyperlink)&&!link)result.hasHyperlinks=true;
    const style=(s: any)=>({fontFamily:s.fontName.family,fontWeight:s.fontWeight,fontSize:s.fontSize,italic:/italic/i.test(s.fontName.style),fills:s.fills,textDecoration:s.textDecoration,textCase:s.textCase,lineHeightPx:s.lineHeight.unit==='PIXELS'?s.lineHeight.value:s.lineHeight.unit==='PERCENT'?s.fontSize*s.lineHeight.value/100:undefined,lineHeightPercent:s.lineHeight.unit==='PERCENT'?s.lineHeight.value:undefined,letterSpacing:s.letterSpacing.unit==='PIXELS'?s.letterSpacing.value:s.fontSize*s.letterSpacing.value/100,paragraphSpacing:typeof s.paragraphSpacing==='number'?s.paragraphSpacing:undefined,paragraphIndent:typeof s.paragraphIndent==='number'?s.paragraphIndent:undefined,textAlignHorizontal:node.textAlignHorizontal,textAlignVertical:node.textAlignVertical,textTruncation:node.textTruncation,textAutoResize:node.textAutoResize,maxLines:node.maxLines});
    const shape=node.getPluginData?.(SHAPE_LABEL_PART_KEY)==='text'?readShapeLabel(node.parent?.parent):undefined;
    const fallback=shape?{fontName:node.fontName,fontSize:node.fontSize,fontWeight:typeof node.fontWeight==='number'?node.fontWeight:({thin:100,extralight:200,ultralight:200,light:300,regular:400,normal:400,book:400,medium:500,semibold:600,demibold:600,bold:700,extrabold:800,ultrabold:800,black:900,heavy:900} as Record<string,number>)[String(node.fontName?.style??'').toLowerCase().replace(/italic|oblique|[^a-z]/g,'')]??shape.data.fontWeight,fills:node.fills,textDecoration:node.textDecoration,textCase:node.textCase,lineHeight:node.lineHeight,letterSpacing:node.letterSpacing}:undefined;
    result.style=segments[0]?style(segments[0]):fallback?style(fallback):{};result.styleOverrideTable={};result.characterStyleOverrides=[];
    segments.forEach((s: any,i: number)=>{result.styleOverrideTable[i+1]=style(s);for(let j=s.start;j<s.end;j++)result.characterStyleOverrides[j]=i+1;});
    let offset=0;result.paragraphStyles=node.characters.split('\n').map((line: string)=>{const segment=segments.find((s: any)=>s.start<=offset&&s.end>offset)??segments.at(-1);offset+=line.length+1;return segment?style(segment):{};});
  }
  if(node.type==='TABLE')result.table=serializeNativeTable(node);
  else if('children'in node)result.children=node.children.map(serializeForDeck);
  return result;
}

export function collectSlides(figma: any, selected = true): any[] {
  const slides: any[]=[],seen=new Set<string>();
  const collect=(node: any)=>{if(node.type==='SLIDE'||(figma.editorType==='figma'&&['FRAME','INSTANCE','COMPONENT'].includes(node.type))){if(!seen.has(node.id)){slides.push(node);seen.add(node.id);}return;}for(const c of node.children??[])collect(c);};
  const selection=selected?figma.currentPage.selection:[];
  if(selection.length)for(const n of selection){let p=n;while(p&&p.type!=='SLIDE'&&p.parent?.type!=='PAGE')p=p.parent;collect(p?.type==='SLIDE'?p:n);}
  else if(figma.editorType==='slides'&&typeof figma.getSlideGrid==='function')figma.getSlideGrid().flat().forEach(collect);
  else figma.currentPage.children.forEach(collect);
  if(figma.editorType==='figma')slides.sort((a,b)=>a.y-b.y||a.x-b.x);
  return slides;
}

export async function captureFigma(figma: any, slides=collectSlides(figma), renders=true,cache?:Map<string,any>): Promise<any> {
  if(!slides.length)throw new Error('Select slides or top-level frames.');
  if(slides.length>100)throw new Error('Export up to 100 slides at a time.');
  const bundle: any={kind:'figma-rest',deckStudioMotionVersion:1,title:figma.root.name,slides:[],renders:{},backgroundRenders:{},nodeRenders:{},nodeBackdropRenders:{},nodeRenderBounds:{},nodeGeometry:{},textSvgs:{},textOutlines:{},textOpacitySeparated:{},assets:{},url:figma.fileKey?`https://www.figma.com/${figma.editorType==='slides'?'slides':'design'}/${figma.fileKey}`:undefined};
  for(const slide of slides){
    const root=serializeForDeck(slide);bundle.slides.push(root);
    const fingerprint=stableValue(visualCaptureNode(root)),cached=cache?.get(slide.id);
    const geometry=(n: any)=>{if('absoluteTransform'in n&&'width'in n)bundle.nodeGeometry[n.id]={transform:n.absoluteTransform,size:{x:n.width,y:n.height}};for(const c of n.children??[])geometry(c);};geometry(slide);
    if(!renders)continue;
    if(cached?.fingerprint===fingerprint){for(const key of ['renders','backgroundRenders','nodeRenders','nodeBackdropRenders','nodeRenderBounds','textSvgs','textOutlines','textOpacitySeparated','assets'])Object.assign(bundle[key],cached[key]);continue;}
    figma.ui?.postMessage({type:'status',text:`Reading ${bundle.slides.length} / ${slides.length} · ${slide.name}`});
    bundle.renders[slide.id]='data:image/png;base64,'+figma.base64Encode(await slide.exportAsync({format:'PNG',constraint:{type:'SCALE',value:1}}));
    // Figma's image filters and paint blending differ from browser SVG filters.
    // Render only the background paints natively; foreground objects stay editable.
    const backgroundFingerprint=stableValue({fills:root.fills,size:root.size});
    if(cached?.backgroundFingerprint===backgroundFingerprint&&cached.backgroundRenders?.[slide.id])bundle.backgroundRenders[slide.id]=cached.backgroundRenders[slide.id];
    else if(Array.isArray(slide.fills)&&slide.fills.some((p:any)=>p.visible!==false&&p.type!=='SOLID')){
      const background=figma.createRectangle();
      try{slide.insertChild(0,background);background.name='Temporary background capture';background.resize(slide.width,slide.height);background.x=0;background.y=0;background.fills=slide.fills;background.strokes=[];bundle.backgroundRenders[slide.id]='data:image/png;base64,'+figma.base64Encode(await background.exportAsync({format:'PNG',constraint:{type:'SCALE',value:1}}));}
      finally{background.remove();}
    }
    // Only uncaptured image paints need original bytes. Native visual layers
    // already contain their masks/filters; duplicating those originals bloats
    // large template imports without making their projection more editable.
    const serialized=new Map<string,any>();const indexNode=(n:any)=>{serialized.set(n.id,n);for(const c of n.children??[])indexNode(c);};indexNode(root);
    const tasks:Array<()=>Promise<void>>=[],textFingerprints:Record<string,string>={};
    const first=slide.children.find((n:any)=>n.visible!==false);
    const walk=(n: any)=>{
      if(n.type==='TEXT'){
        textFingerprints[n.id]=stableValue(visualCaptureNode(serialized.get(n.id)));
        if(cached?.textFingerprints?.[n.id]===textFingerprints[n.id]&&cached.textSvgs?.[n.id]&&cached.textOutlines?.[n.id]){for(const key of ['textSvgs','textOutlines','textOpacitySeparated'])if(cached[key]?.[n.id]!==undefined)bundle[key][n.id]=cached[key][n.id];return;}
        tasks.push(async()=>{try{const {text,outline,separate}=await captureTextGlyphs(figma,n);bundle.textSvgs[n.id]=text;bundle.textOutlines[n.id]=outline;if(separate)bundle.textOpacitySeparated[n.id]=true;}catch{/* Complete editable text remains in the tree. */}});return;
      }
      if(needsRasterNode(serialized.get(n.id))){if(n.visible!==false)tasks.push(async()=>{
        const paints=Array.isArray(n.fills)?n.fills.filter((p:any)=>p.visible!==false):[],blended=first===n&&n.type==='RECTANGLE'&&n.opacity===1&&paints.length===1&&paints[0].blendMode&&!['NORMAL','PASS_THROUGH'].includes(paints[0].blendMode)&&!n.strokes?.some((p:any)=>p.visible!==false)&&!n.effects?.some((p:any)=>p.visible!==false)&&Math.abs(n.x)<.01&&Math.abs(n.y)<.01&&Math.abs(n.rotation)<.01&&Math.abs(n.width-slide.width)<.01&&Math.abs(n.height-slide.height)<.01;
        let aligned:Awaited<ReturnType<typeof captureAlignedVisual>>;try{aligned=await captureAlignedVisual(figma,n,slide);}catch{/* Keep the existing export path when native cloning or fonts are unavailable. */}
        if(aligned){bundle.nodeRenders[n.id]='data:image/png;base64,'+figma.base64Encode(aligned.bytes);bundle.nodeRenderBounds[n.id]=aligned.bounds;}
        else if(blended){const backdrop=figma.createFrame();try{slide.appendChild(backdrop);backdrop.name='Temporary background capture';backdrop.resize(slide.width,slide.height);backdrop.x=0;backdrop.y=0;backdrop.fills=slide.fills;backdrop.strokes=[];const copy=n.clone();backdrop.appendChild(copy);copy.relativeTransform=n.relativeTransform;bundle.nodeRenders[n.id]='data:image/png;base64,'+figma.base64Encode(await backdrop.exportAsync({format:'PNG',constraint:{type:'SCALE',value:2}}));bundle.nodeBackdropRenders[n.id]=true;}finally{backdrop.remove();}}
        // Native table text and one-pixel rules match the slide's 1x capture.
        // Downsampling a 2x table introduces different glyph/border coverage.
        else bundle.nodeRenders[n.id]='data:image/png;base64,'+figma.base64Encode(await n.exportAsync({format:'PNG',constraint:{type:'SCALE',value:n.type==='TABLE'||serialized.get(n.id)?.deckStudioTable?1:2}}));
        if(!aligned)bundle.nodeRenderBounds[n.id]=('absoluteRenderBounds'in n?n.absoluteRenderBounds:undefined)??n.absoluteBoundingBox;
      });return;}
      for(const p of Array.isArray(n.fills)?n.fills:[])if(p.type==='IMAGE'&&p.imageHash&&!bundle.assets[p.imageHash])tasks.push(async()=>{const image=figma.getImageByHash(p.imageHash);if(image){const bytes=await image.getBytesAsync(),mime=bytes[0]===255&&bytes[1]===216?'image/jpeg':'image/png';bundle.assets[p.imageHash]=`data:${mime};base64,`+figma.base64Encode(bytes);}});
      for(const child of n.children??[])walk(child);
    };
    for(const child of slide.children??[])walk(child);
    let next=0;await Promise.all(Array.from({length:Math.min(4,tasks.length)},async()=>{while(next<tasks.length)await tasks[next++]();}));
    if(cache){const ids=new Set<string>(),refs=new Set<string>();const index=(n:any)=>{ids.add(n.id);for(const p of Array.isArray(n.fills)?n.fills:[])if(p.imageHash)refs.add(p.imageHash);for(const c of n.children??[])index(c);};index(slide);const entry:any={fingerprint,backgroundFingerprint,textFingerprints};for(const key of ['renders','backgroundRenders','nodeRenders','nodeBackdropRenders','nodeRenderBounds','textSvgs','textOutlines','textOpacitySeparated'])entry[key]=Object.fromEntries(Object.entries(bundle[key]).filter(([id])=>ids.has(id)));entry.assets=Object.fromEntries([...refs].filter(id=>bundle.assets[id]).map(id=>[id,bundle.assets[id]]));cache.set(slide.id,entry);while(cache.size>24)cache.delete(cache.keys().next().value!);}
  }
  return bundle;
}
