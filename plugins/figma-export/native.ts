import {BRAND_NAME} from '../../src/brand-name.js';
import {tableLayoutFingerprint} from '../../src/core/native-table-layout';
import {textLinkUrl} from '../../src/core/text-link';
import type {Deck,SlideElement,TextRun} from '../../src/core/model';
import {figmaId} from '../../src/core/figma-identity';
import {stableValue,sameFigmaTextAppearance} from '../../src/core/figma-sync';
import {exportSlideTransition,nativeSlideTransition} from '../../src/core/figma-transitions';
import {editedTextStyle,textEditRanges} from '../../src/core/text-editing';
import {nativeSlideSpace} from '../../src/core/figma-native-space';
import {nativeLink,bindNative,cloneNativeSlide} from './identity';
import {figmaAsset,figmaAssetKey,figmaVisualChanged,type FigmaAssets} from '../../src/core/figma-assets';
import {svgForFigma} from './svg';
import {writeSlideNotes} from './notes';
import {prepareNativeTable,writeNativeTable,prepareTableDecorations,cloneNativeTable,prepareNativeTableVisual} from './table';
import {prepareLayerTable,readLayerTable,writeLayerTable,tableFontElements} from './layer-table';
import {prepareDeckObjectMotion,writeDeckObjectMotionBatch,type PreparedObjectMotion} from './object-motion';
import {snapshotNativeTransitions,applyNativeTransitions} from './slide-transitions';
import {isTextShape,shapeTextElement} from '../../src/core/shape-text';
import {SHAPE_LABEL_KEY} from '../../src/core/figma-shape-label';
import {hasShapeLabel,readShapeLabel,prepareShapeLabel,writeShapeLabel,updateShapeLabel,layoutShapeLabel,type ShapeLabelParts} from './shape-label';

const same=(a: unknown,b: unknown)=>stableValue(a)===stableValue(b);
const changed=(a: any,b: any,keys: string[])=>!b||keys.some(k=>!same(a[k],b[k]));
const mul=(p: number[][],t: number[][])=>[[p[0][0]*t[0][0]+p[0][1]*t[1][0],p[0][0]*t[0][1]+p[0][1]*t[1][1],p[0][0]*t[0][2]+p[0][1]*t[1][2]+p[0][2]],[p[1][0]*t[0][0]+p[1][1]*t[1][0],p[1][0]*t[0][1]+p[1][1]*t[1][1],p[1][0]*t[0][2]+p[1][1]*t[1][2]+p[1][2]]];
const inverse=(m: number[][])=>{const d=m[0][0]*m[1][1]-m[0][1]*m[1][0];if(Math.abs(d)<1e-9)throw new Error('A parent transform is singular.');return [[m[1][1]/d,-m[0][1]/d,(m[0][1]*m[1][2]-m[1][1]*m[0][2])/d],[-m[1][0]/d,m[0][0]/d,(m[1][0]*m[0][2]-m[0][0]*m[1][2])/d]];};
export function figmaPaint(value: string): any[] {
  if(value==='transparent')return [];
  let h=value.slice(1);if(h.length===3||h.length===4)h=h.split('').map(c=>c+c).join('');
  return [{type:'SOLID',color:{r:parseInt(h.slice(0,2),16)/255,g:parseInt(h.slice(2,4),16)/255,b:parseInt(h.slice(4,6),16)/255},opacity:h.length===8?parseInt(h.slice(6),16)/255:1}];
}
const geometryKeys=['x','y','w','h','rotation','flipX','flipY','padding','group'];
const visualBox=(e:SlideElement)=>{const a=e.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),x=e.flipX?-e.w:e.w,y=e.flipY?-e.h:e.h;return [[c*x,-s*y,e.x+e.w/2-c*x/2+s*y/2],[s*x,c*y,e.y+e.h/2-s*x/2-c*y/2]];};
export function positionNativeVisual(n:any,e:SlideElement,prior:SlideElement,slide:any){
  const sx=e.w/prior.w,sy=e.h/prior.h;
  if(Math.abs(sx-sy)>1e-5*Math.max(sx,sy))throw new Error(`Resize “${e.name}” proportionally to preserve its native mask and effects. No content was changed.`);
  const slideTransform=slide.absoluteTransform,absolute=mul(mul(mul(slideTransform,mul(visualBox(e),inverse(visualBox(prior)))),inverse(slideTransform)),n.absoluteTransform);
  if(Math.abs(sx-1)>1e-7)n.rescale(sx);
  // rescale bakes the size into native geometry. Figma discards matrix scale;
  // retain only its new orientation and explicitly restore the mapped origin.
  absolute[0][0]/=sx;absolute[0][1]/=sx;absolute[1][0]/=sx;absolute[1][1]/=sx;
  n.relativeTransform=mul(inverse(n.parent.absoluteTransform),absolute);
}
const textChanged=(e:SlideElement,prior?:SlideElement)=>!prior||!sameFigmaTextAppearance(e,prior);
export type NativeAssets=FigmaAssets;

export function setNativeVisualOpacity(node:any,opacity:number,priorOpacity:number){
  const key='deck-studio-opacity-ratio',raw=node.getPluginData?.(key),saved=raw?Number(raw):NaN;
  const ratio=priorOpacity>0?node.opacity/priorOpacity:Number.isFinite(saved)&&saved>=0?saved:node.opacity;
  node.setPluginData(key,String(ratio));node.opacity=Math.max(0,Math.min(1,ratio*opacity));
}

function effectiveRuns(e: SlideElement): TextRun[] {
  if(e.paragraphs?.length)return e.paragraphs.flatMap((p,i)=>[...(i?[{text:'\n'}]:[]),...p.runs]);
  return e.runs?.map(r=>r.text).join('')===e.text?e.runs:[{text:e.text}];
}
function nativeDecoration(e:SlideElement,r:Partial<TextRun>={}) {
  const underline=r.underline??e.underline,strike=r.strikethrough??e.strikethrough;
  if(underline&&strike)throw new Error(`“${e.name}” uses underline and strikethrough together. Figma supports one decoration per character. Choose one before syncing. No content was changed.`);
  return strike?'STRIKETHROUGH':underline?'UNDERLINE':'NONE';
}
function prepareTextDecorations(e:SlideElement){nativeDecoration(e);for(const r of effectiveRuns(e))nativeDecoration(e,r);}
function nativeTextAlignment(e:SlideElement){
  const alignments=e.paragraphs?.length?e.paragraphs.map(p=>p.align??e.align):[e.align],alignment=alignments[0];
  if(alignments.some(value=>value!==alignment))throw new Error(`“${e.name}” uses different paragraph alignments. Figma applies horizontal alignment to the whole text box. Use one alignment or separate text objects before syncing. No content was changed.`);
  return alignment==='justify'?'JUSTIFIED':alignment.toUpperCase();
}
type NativeTextLineHeight={unit:'AUTO'}|{unit:'PIXELS'|'PERCENT';value:number};
function copyNativeLineHeight(value:any):NativeTextLineHeight|undefined{
  if(value?.unit==='AUTO')return{unit:'AUTO'};
  if(['PIXELS','PERCENT'].includes(value?.unit)&&Number.isFinite(value.value)&&value.value>=0)return{unit:value.unit,value:value.value};
}
function preservedNativeTextLeading(n:any,e:SlideElement,prior?:SlideElement){
  const equalSpacing=(a:number,b:number)=>a===b||Math.abs(a-b)<.0001;
  if(!prior||e.text!==prior.text||e.lineHeight!==prior.lineHeight||e.text.split('\n').some((_,i)=>{
    const a=e.paragraphs?.[i],b=prior.paragraphs?.[i];return(a?.lineHeight??e.lineHeight)!==(b?.lineHeight??prior.lineHeight)||!equalSpacing(a?.lineSpacing??e.fontSize*(a?.lineHeight??e.lineHeight),b?.lineSpacing??prior.fontSize*(b?.lineHeight??prior.lineHeight));
  }))return;
  const fail=()=>{throw new Error(`The native line height of “${e.name}” could not be preserved. Read a fresh Figma version before formatting it. No content was changed.`);};
  if(n.characters!==e.text)fail();
  const uniform=copyNativeLineHeight(n.lineHeight);if(uniform)return{uniform,ranges:[]};
  let offset=0;const ranges:{start:number;end:number;value:NativeTextLineHeight}[]=[];
  for(const segment of n.getStyledTextSegments(['lineHeight'])){
    const value=copyNativeLineHeight(segment.lineHeight);
    if(!value||segment.start!==offset||!Number.isInteger(segment.end)||segment.end<=offset||segment.end>e.text.length)fail();
    ranges.push({start:offset,end:segment.end,value:value!});offset=segment.end;
  }
  if(offset!==e.text.length||!ranges.length)fail();return{uniform:undefined,ranges};
}
const nativeFontCatalog=new WeakMap<object,Promise<any[]>>();
function availableNativeFonts(figma:any,refresh=false){
  if(refresh||!nativeFontCatalog.has(figma)){const request=Promise.resolve().then(()=>figma.listAvailableFontsAsync()).catch(error=>{nativeFontCatalog.delete(figma);throw error;});nativeFontCatalog.set(figma,request);}
  return nativeFontCatalog.get(figma)!;
}
export async function prepareNativeFonts(figma: any,deck: Deck): Promise<Map<string,any>> {
  let available=await availableNativeFonts(figma),refreshed=false;const chosen=new Map<string,any>();
  const weights: Record<string,number>={thin:100,extralight:200,ultralight:200,light:300,regular:400,normal:400,book:400,medium:500,semibold:600,demibold:600,bold:700,extrabold:800,ultrabold:800,black:900,heavy:900};
  for(const e of deck.slides.flatMap(s=>s.elements).flatMap(e=>e.type==='text'?[e]:hasShapeLabel(e)?[shapeTextElement(e)]:e.type==='table'?tableFontElements(e,deck.designSystem):[])){
    for(const run of [{text:'',fontFamily:e.fontFamily,fontWeight:e.fontWeight,italic:e.italic},...effectiveRuns(e)]){
      const family=run.fontFamily??e.fontFamily,weight=run.fontWeight??(run.bold===undefined?e.fontWeight:run.bold?700:400),italic=run.italic??e.italic,key=JSON.stringify([family,weight,italic]);if(chosen.has(key))continue;
      const find=()=>available.map((f:any)=>f.fontName).find((f:any)=>f.family===family&&/italic|oblique/i.test(f.style)===italic&&(weights[f.style.toLowerCase().replace(/italic|oblique|[^a-z]/g,'')]??400)===weight);
      let font=find();if(!font&&!refreshed){available=await availableNativeFonts(figma,true);refreshed=true;font=find();}
      if(!font)throw new Error(`Install ${family} ${weight}${italic?' Italic':''} in Figma before syncing. No content was changed.`);
      try{await figma.loadFontAsync(font);}catch(error){nativeFontCatalog.delete(figma);throw error;}chosen.set(key,font);
    }
  }
  return chosen;
}

export function setNativeText(n: any,e: SlideElement,fonts: Map<string,any>,prior?:SlideElement) {
  prepareTextDecorations(e);
  const alignment=nativeTextAlignment(e);
  if(prior&&e.text!==prior.text&&typeof n.insertCharacters==='function'&&typeof n.deleteCharacters==='function'){
    const expected={...prior,...editedTextStyle(prior,e.text)},edits=textEditRanges(prior.text,e.text);
    if(!textChanged(e,expected)&&edits.every(edit=>!edit.text.includes('\n')&&!prior.text.slice(edit.start,edit.end).includes('\n'))){
      for(const edit of edits.reverse()){if(edit.text)n.insertCharacters(edit.start,edit.text,edit.useStyle);if(edit.end>edit.start)n.deleteCharacters(edit.start+edit.text.length,edit.end+edit.text.length);}return;
    }
  }
  const leading=preservedNativeTextLeading(n,e,prior);
  const font=(r: TextRun)=>fonts.get(JSON.stringify([r.fontFamily??e.fontFamily,r.fontWeight??(r.bold===undefined?e.fontWeight:r.bold?700:400),r.italic??e.italic]));
  n.textAutoResize='NONE';n.fontName=font({text:''});n.fontSize=e.fontSize;n.characters=e.text;
  n.textCase=({upper:'UPPER',lower:'LOWER',title:'TITLE','small-caps':'SMALL_CAPS',none:'ORIGINAL'} as const)[e.textCase??'none'];n.textAlignHorizontal=alignment;n.textAlignVertical=e.verticalAlign==='middle'?'CENTER':e.verticalAlign==='bottom'?'BOTTOM':'TOP';
  if(!leading)n.lineHeight={unit:'PIXELS',value:e.fontSize*e.lineHeight};n.letterSpacing={unit:'PIXELS',value:e.letterSpacing};n.fills=figmaPaint(e.fill);n.textDecoration=nativeDecoration(e);
  let offset=0;for(const r of effectiveRuns(e)){
    const end=offset+r.text.length;if(end>offset){n.setRangeFontName(offset,end,font(r));n.setRangeTextCase(offset,end,({upper:'UPPER',lower:'LOWER',title:'TITLE','small-caps':'SMALL_CAPS',none:'ORIGINAL'} as const)[r.textCase??e.textCase??'none']);n.setRangeFontSize(offset,end,r.fontSize??e.fontSize);n.setRangeFills(offset,end,figmaPaint(r.color??e.fill));n.setRangeTextDecoration(offset,end,nativeDecoration(e,r));n.setRangeLetterSpacing(offset,end,{unit:'PIXELS',value:r.letterSpacing??e.letterSpacing});}offset=end;
  }
  offset=0;for(const p of e.paragraphs??[]){const end=offset+p.runs.reduce((a,r)=>a+r.text.length,0);if(end>offset){n.setRangeParagraphSpacing(offset,end,p.spaceAfter);n.setRangeParagraphIndent(offset,end,p.firstLineIndent);if(!leading)n.setRangeLineHeight(offset,end,p.lineSpacing?{unit:'PIXELS',value:p.lineSpacing}:{unit:'PIXELS',value:e.fontSize*(p.lineHeight??e.lineHeight)});}offset=end+1;}
  if(leading){if(leading.uniform)n.lineHeight=leading.uniform;else for(const range of leading.ranges)n.setRangeLineHeight(range.start,range.end,range.value);}
  n.textTruncation=e.maxLines?'ENDING':'DISABLED';n.maxLines=e.maxLines??null;
}

function positionNode(n: any,e: SlideElement,slide: any) {
  const linePaintOffset=()=>{const r=n.absoluteRenderBounds,q=n.absoluteBoundingBox,t=n.absoluteTransform;
    if(r&&q&&t&&!n.effects?.some((v:any)=>v.visible!==false)){const length=Math.hypot(t[0][1],t[1][1]);return -((r.x+r.width/2-q.x-q.width/2)*t[0][1]+(r.y+r.height/2-q.y-q.height/2)*t[1][1])/length;}
    return (n.strokeWeight??0)/2*(n.strokeAlign==='INSIDE'?1:n.strokeAlign==='OUTSIDE'?-1:0);};
  const paintOffset=e.type==='line'?linePaintOffset():0;
  const p=e.type==='text'?e.padding:undefined,w=Math.max(.01,e.w-(p?.left??0)-(p?.right??0)),h=Math.max(.01,e.h-(p?.top??0)-(p?.bottom??0));
  if(n.type!=='TABLE')n.resize(w,e.type==='line'?0:h);
  const angle=e.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),fx=e.flipX?-1:1,fy=e.flipY?-1:1;
  const local=[[c*fx,-s*fy,e.x+e.w/2-c*fx*e.w/2+s*fy*e.h/2],[s*fx,c*fy,e.y+e.h/2-s*fx*e.w/2-c*fy*e.h/2]];
  if(e.type==='line'){local[0][2]-=s*fy*(e.h/2+paintOffset);local[1][2]+=c*fy*(e.h/2+paintOffset);}
  if(p){local[0][2]+=local[0][0]*p.left+local[0][1]*p.top;local[1][2]+=local[1][0]*p.left+local[1][1]*p.top;}
  const absolute=mul(slide.absoluteTransform??[[1,0,slide.x],[0,1,slide.y]],local),parent=n.parent?.absoluteTransform??[[1,0,0],[0,1,0]];
  n.relativeTransform=mul(inverse(parent),absolute);
  if(e.type==='text')n.textAutoResize=e.maxLines?'TRUNCATE':e.textSizing==='auto-width'?'WIDTH_AND_HEIGHT':e.textSizing==='auto-height'?'HEIGHT':'NONE';
}

/** Change existing native objects in place. Source-only effects and masks survive
 * when their editable projection did not change. All fonts/assets preflight first. */
export async function applyDeckToFigma(figma: any,deck: Deck,previous?: Deck,assets: NativeAssets={},stillCurrent=()=>true) {
  for(const slide of deck.slides)for(const e of slide.elements)if(e.type==='table')prepareTableDecorations(e);
  for(const slide of deck.slides)for(const e of slide.elements){
    if(e.type==='text'){prepareTextDecorations(e);nativeTextAlignment(e);}
  }
  for(const slide of deck.slides)for(const e of slide.elements)if(e.type==='text'&&e.link&&!textLinkUrl(e.link))throw new Error(`Use a web, email or phone link without credentials for “${e.name}”. No content was changed.`);
  for(const slide of deck.slides)for(const e of slide.elements)if(hasShapeLabel(e)){const label=shapeTextElement(e);prepareTextDecorations(label);nativeTextAlignment(label);if(label.link&&!textLinkUrl(label.link))throw new Error(`Use a web, email or phone link without credentials for “${e.name}”. No content was changed.`);}
  const fonts=await prepareNativeFonts(figma,deck),nativeIds: string[]=[],createdIds: string[]=[],warnings: string[]=[];
  if(!stillCurrent())throw new Error('Figma changed during preparation. Sync will retry from the new version.');
  const sameFile=deck.provenance?.provider==='Figma'&&Boolean(figma.fileKey)&&deck.provenance.url?.split('/')[4]===figma.fileKey;
  const originalGrid=figma.editorType==='slides'?figma.getSlideGrid().map((r:any[])=>[...r]):[];
  const structural=figma.editorType==='slides'&&(!previous||!same(previous.slides.map(s=>s.id),deck.slides.map(s=>s.id)));
  const transitionPlans=snapshotNativeTransitions(originalGrid.flat());
  const all:any[]=[],walk=(n:any)=>{all.push(n);for(const child of n.children??[])walk(child);};
  if(figma.editorType==='slides'){
    const sources=new Set([...deck.slides,...previous?.slides??[]].map(s=>s.source?.nodeId).filter(Boolean));
    for(const slide of originalGrid.flat())if(sameFile&&sources.has(slide.id)||nativeLink(slide,'deck-studio-document')===deck.id)walk(slide);
  }else walk(figma.currentPage);
  const linked=(key: string,id: string)=>all.find(n=>nativeLink(n,key)===id&&nativeLink(n,'deck-studio-document')===deck.id);
  const nodeById=(id?: string)=>id?all.find(n=>!n.removed&&n.id===id):undefined;
  // Resolve every source target before mutating. Foreign source IDs are never used.
  const targets=deck.slides.map(s=>({slide:s,node:linked('deck-studio-id',s.id)??(sameFile&&previous?.slides.some(p=>p.id===s.id)?nodeById(s.source?.nodeId):undefined),cloneSource:undefined as any}));
  const claimed=new Set(targets.map(t=>t.node).filter(Boolean));
  for(const t of targets)if(!t.node&&sameFile){const source=nodeById(t.slide.source?.nodeId);if(source){if(!claimed.has(source)){t.node=source;claimed.add(source);}else t.cloneSource=source;}}
  for(const t of targets){
    if(sameFile&&t.slide.source?.nodeId&&!t.node&&!t.cloneSource)throw new Error(`Restore the deleted native slide “${t.slide.title}” with Undo in Figma before syncing. No content was changed.`);
    if((t.node||t.cloneSource)&&figma.editorType==='slides'&&(t.node??t.cloneSource).type!=='SLIDE')throw new Error('The linked page is not a Figma slide.');
  }
  const removedTargets=(previous?.slides??[]).filter(s=>!deck.slides.some(v=>v.id===s.id)).map(s=>linked('deck-studio-id',s.id)??(sameFile?nodeById(s.source?.nodeId):undefined)).filter(Boolean);
  const ownedIds=new Set([...targets.map(t=>t.node),...removedTargets].filter(Boolean).map(n=>n.id));
  const priorFor=(t:typeof targets[number])=>previous?.slides.find(s=>s.id===t.slide.id)??(t.cloneSource?previous?.slides.find(s=>s.source?.nodeId===t.cloneSource.id||nativeLink(t.cloneSource,'deck-studio-id')===s.id):undefined);
  if(targets.some(t=>t.slide.elements.some(e=>{const prior=priorFor(t)?.elements.find(p=>p.id===e.id);return ['animation','motionKey','motionMatch'].some(key=>!same(e[key as keyof SlideElement],prior?.[key as keyof SlideElement]));})))warnings.push('Object motion settings stay in Deck Studio. Existing Figma object animations stay unchanged.');
  const within=(n:any,parent:any)=>{if(!parent||!n||n.removed)return false;for(let p=n;p;p=p.parent)if(p===parent)return true;return false;};
  const detachedTable=(t:typeof targets[number],e:SlideElement)=>e.type==='table'&&!t.cloneSource&&!priorFor(t)?.elements.some(p=>p.id===e.id)&&priorFor(t)?.elements.some(p=>p.type==='table'&&p.sourceId===e.sourceId);
  const detachedShape=(t:typeof targets[number],e:SlideElement)=>isTextShape(e)&&!t.cloneSource&&!priorFor(t)?.elements.some(p=>p.id===e.id)&&priorFor(t)?.elements.some(p=>isTextShape(p)&&p.sourceId===e.sourceId);
  const sourceElement=(t:typeof targets[number],e:SlideElement)=>{if(detachedTable(t,e)||detachedShape(t,e))return;const parent=t.node??t.cloneSource;return all.find(n=>within(n,parent)&&nativeLink(n,'deck-studio-id')===e.id&&nativeLink(n,'deck-studio-document')===deck.id)??(sameFile?[...all].find(n=>n.id===e.sourceId&&within(n,parent)):undefined);};
  const tableCopies=new Map<string,{source:any;prior:SlideElement}>();
  for(const t of targets)for(const e of t.slide.elements){if(!e.sourceId||!detachedTable(t,e))continue;const records=priorFor(t)!.elements.filter(p=>p.type==='table'&&p.sourceId===e.sourceId),native=records.map(prior=>({prior,source:sourceElement(t,prior)})).filter(v=>v.source?.type==='TABLE');if(!native.length)continue;if(records.length!==1||native.length!==1)throw new Error(`“${e.name}” has an ambiguous native table source. Duplicate that table in Figma, then sync again. No content was changed.`);const {source,prior}=native[0];if(!('clone'in source)||typeof source.clone!=='function')throw new Error(`This Figma host cannot duplicate the native table “${e.name}”. Duplicate it in Figma, then sync again. No content was changed.`);tableCopies.set(figmaAssetKey(t.slide.id,e.id),{source,prior});}
  if(tableCopies.size)warnings.push('Native table copies retain any Figma-only animation settings. Automatic native Animate translation is unavailable.');
  const shapeCopies=new Map<string,{source:any;prior:SlideElement}>();
  for(const t of targets)for(const e of t.slide.elements){if(!e.sourceId||!detachedShape(t,e))continue;const records=priorFor(t)!.elements.filter(p=>isTextShape(p)&&p.sourceId===e.sourceId),native=records.map(prior=>({prior,source:sourceElement(t,prior)})).filter(v=>v.source);if(!native.length)continue;if(records.length!==1||native.length!==1||typeof native[0].source.clone!=='function')throw new Error(`“${e.name}” has an ambiguous or unavailable native shape source. Duplicate it in Figma, then sync again. No content was changed.`);shapeCopies.set(figmaAssetKey(t.slide.id,e.id),native[0]);}
  for(const t of targets)for(const e of t.slide.elements){const n=sourceElement(t,e)??shapeCopies.get(figmaAssetKey(t.slide.id,e.id))?.source;prepareShapeLabel(figma,n,e);if(n?.getPluginData?.(SHAPE_LABEL_KEY)){const label=shapeTextElement(e);prepareTextDecorations(label);nativeTextAlignment(label);if(!hasShapeLabel(e)){for(const [key,font]of await prepareNativeFonts(figma,{...deck,slides:[{...t.slide,elements:[label]}]}))fonts.set(key,font);}const text=readShapeLabel(n)!.text,prior=priorFor(t)?.elements.find(v=>v.id===e.id)??shapeCopies.get(figmaAssetKey(t.slide.id,e.id))?.prior,before=prior?shapeTextElement(prior):undefined;if(textChanged(label,before))preservedNativeTextLeading(text,label,before);for(const segment of text.getStyledTextSegments(['fontName']))await figma.loadFontAsync(segment.fontName);}}
  const motionPlans=new Map<string,PreparedObjectMotion>(),motionWrites:{node:any;prepared:PreparedObjectMotion}[]=[];
  for(const target of targets)for(const e of target.slide.elements){const prepared=prepareDeckObjectMotion(sourceElement(target,e)??tableCopies.get(figmaAssetKey(target.slide.id,e.id))?.source??shapeCopies.get(figmaAssetKey(target.slide.id,e.id))?.source,e);if(hasShapeLabel(e)&&sourceElement(target,e)&&!readShapeLabel(sourceElement(target,e))&&prepared.warning&&prepared.before)throw new Error(`“${e.name}” has unreadable object motion metadata. Restore it before adding a shape label. No content was changed.`);motionPlans.set(figmaAssetKey(target.slide.id,e.id),prepared);if(prepared.warning&&!warnings.includes(prepared.warning))warnings.push(prepared.warning);}
  const counts=new Map<string,number>();for(const s of deck.slides)for(const e of s.elements)counts.set(e.id,(counts.get(e.id)??0)+1);
  for(const t of targets){const tables=new Set<any>();for(const e of t.slide.elements.filter(e=>e.type==='table')){const n=sourceElement(t,e);if(n?.type==='TABLE'){if(tables.has(n))throw new Error(`“${e.name}” links to the same native table more than once. Duplicate it in Figma, then sync again. No content was changed.`);tables.add(n);}}}
  for(const t of targets)if(t.cloneSource)for(const text of t.cloneSource.findAllWithCriteria?.({types:['TEXT']})??[])for(const segment of text.getStyledTextSegments(['fontName']))await figma.loadFontAsync(segment.fontName);
  for(const t of targets)for(const e of t.slide.elements){const visual=figmaAsset(assets,t.slide.id,e.id),copy=tableCopies.get(figmaAssetKey(t.slide.id,e.id)),n=sourceElement(t,e),prior=priorFor(t)?.elements.find(v=>v.id===e.id),managed=n&&(nativeLink(n,'deck-studio-visual')||readShapeLabel(n)?.body.getPluginData?.('deck-studio-visual'));if(counts.get(e.id)!>1&&assets[e.id]&&!assets[figmaAssetKey(t.slide.id,e.id)])throw new Error('This Deck file has ambiguous shared asset IDs. Export it again from Deck Studio. No content was changed.');if(n?.type==='TABLE'&&e.type!=='table')prepareNativeTableVisual(n,e,prior);if(e.type==='table'){if(copy)await prepareNativeTable(figma,copy.source,e,copy.prior);else if(n?.type==='TABLE')await prepareNativeTable(figma,n,e,prior);else{prepareLayerTable(e);if(n&&!readLayerTable(n))throw new Error(`“${e.name}” is not an editable table layer group. No content was changed.`);for(const text of n?.findAllWithCriteria?.({types:['TEXT']})??[])for(const segment of text.getStyledTextSegments(['fontName']))await figma.loadFontAsync(segment.fontName);}}if((e.shape||!['text','rect','ellipse','line','image','table'].includes(e.type))&&!visual&&(!n||figmaVisualChanged(e,prior)))throw new Error(`“${e.name}” needs a visual asset before syncing. No content was changed.`);if(e.type==='image'&&!e.sourceRegion&&!visual&&!n&&!(sameFile&&t.node&&e.sourceId===`figma-background:${t.slide.source?.nodeId}`))throw new Error(`“${e.name}” has no portable image. No content was changed.`);if(visual?.svg&&n&&!managed)throw new Error(`“${e.name}” is a native object. Keep its native layers or send a separate visual copy. No content was changed.`);}
  for(const t of targets)for(const e of t.slide.elements.filter(e=>e.type==='text')){const n=sourceElement(t,e);if(n?.type==='TEXT'){const prior=priorFor(t)?.elements.find(v=>v.id===e.id);if(textChanged(e,prior))preservedNativeTextLeading(n,e,prior);for(const segment of n.getStyledTextSegments(['fontName']))await figma.loadFontAsync(segment.fontName);}}
  if(sameFile)for(const target of targets)for(const e of target.slide.elements.filter(e=>e.type==='image')){
    const prior=priorFor(target)?.elements.find(x=>x.id===e.id),n=sourceElement(target,e);
    if(!n||!prior)continue;
    if(n.children&&!nativeLink(n,'deck-studio-visual')&&changed(e,prior,['src','fit','crop','imagePosition','imageZoom']))throw new Error(`“${e.name}” contains native layers. Edit its contents in Figma to preserve the mask; its updated appearance will sync back.`);
    if(changed(e,prior,geometryKeys)&&e.src===prior.src){
      if(Math.abs(e.w/prior.w-e.h/prior.h)>1e-5*Math.max(e.w/prior.w,e.h/prior.h))throw new Error(`Resize “${e.name}” proportionally to preserve its native mask and effects. No content was changed.`);
      for(const text of n.findAllWithCriteria?.({types:['TEXT']})??[])for(const segment of text.getStyledTextSegments(['fontName']))await figma.loadFontAsync(segment.fontName);
    }
  }
  // Validate every SVG and load its actual imported fonts before touching linked
  // content. Temporary nodes are removed before the concurrency check/Undo step.
  for(const t of targets)for(const e of t.slide.elements){const svg=figmaAsset(assets,t.slide.id,e.id)?.svg;if(!svg)continue;let temp:any;try{temp=figma.createNodeFromSvg(svgForFigma(svg,e));temp.visible=false;temp.name='Temporary visual preparation';for(const text of temp.findAllWithCriteria?.({types:['TEXT']})??[])for(const segment of text.getStyledTextSegments(['fontName']))await figma.loadFontAsync(segment.fontName);}catch(error){throw new Error(`Could not prepare “${e.name}”: ${(error as Error).message}. No content was changed.`);}finally{if(temp&&!temp.removed)temp.remove();}}
  if(!stillCurrent())throw new Error('Figma changed during preparation. Sync will retry from the new version.');
  const undoBoundary=typeof figma.commitUndo==='function';if(undoBoundary)figma.commitUndo();let mutated=false;
  try{
    const ordered: any[]=[];if(previous&&deck.title!==previous.title){mutated=true;figma.root.name=deck.title;}
    for(const target of targets){
      const source=target.slide,priorSlide=priorFor(target);let slide=target.node,cloneSources=new Map<string,any>();
      if(target.cloneSource){mutated=true;const cloned=cloneNativeSlide(target.cloneSource,deck.id);slide=cloned.node;cloneSources=cloned.sources;all.push(...cloneSources.values());createdIds.push(...[...cloneSources.values()].map(n=>n.id));mutated=true;}
      if(!slide){mutated=true;slide=figma.editorType==='slides'?figma.createSlide():figma.createFrame();createdIds.push(slide.id);if(figma.editorType!=='slides'){slide.resize(deck.width,deck.height);slide.x=Math.max(0,...figma.currentPage.children.filter((n: any)=>n!==slide).map((n: any)=>(n.x??0)+(n.width??0)))+100;slide.y=0;}}
      const s=nativeSlideSpace(source,deck.width,deck.height,slide.width,slide.height),old=priorSlide?nativeSlideSpace(priorSlide,previous!.width,previous!.height,slide.width,slide.height):undefined;
      // Native calls can write before throwing, including identity binding.
      ordered.push(slide);mutated=true;bindNative(slide,deck.id,'deck-studio-id',s.id);
      if(!old||s.background!==old.background){slide.fills=figmaPaint(s.background);mutated=true;}
      if(writeSlideNotes(slide,s.notes))mutated=true;
      if(s.notes.trim()&&!('speakerNotes'in slide)&&!warnings.includes('Native presenter notes are unavailable in this Figma environment. Deck Studio notes are preserved for round trips; copy them into Figma for native presenting.'))warnings.push('Native presenter notes are unavailable in this Figma environment. Deck Studio notes are preserved for round trips; copy them into Figma for native presenting.');
      if(!old||s.hidden!==old.hidden)if('isSkippedSlide'in slide){slide.isSkippedSlide=Boolean(s.hidden);mutated=true;}
      if(!transitionPlans.has(slide.id))for(const [id,plan]of snapshotNativeTransitions([slide]))transitionPlans.set(id,plan);
      if(!old||!same(s.transition,old.transition)){if(s.transition&&!nativeSlideTransition(s.transition)&&!['none','fade','push'].includes(s.transition.effect))warnings.push(`Slide ${ordered.length}: this transition stays in Deck Studio.`);else if(typeof slide.setSlideTransition==='function')transitionPlans.set(slide.id,{node:slide,transition:exportSlideTransition(s.transition??{effect:'fade',duration:480,easing:'smooth'}),authored:true});}
      const within=(n: any)=>{let p=n;while(p&&p!==slide)p=p.parent;return p===slide;};
      const linkedHere=(key:string,id:string)=>all.find(n=>!n.removed&&within(n)&&nativeLink(n,key)===id&&nativeLink(n,'deck-studio-document')===deck.id);
      const groups=new Map<string,any>(),members=new Map<string,any>();
      const descendants=(id:string)=>s.elements.filter(e=>{let g=e.group;while(g){if(g===id)return true;g=s.groups?.find(v=>v.id===g)?.parent;}return false;});
      const groupDepth=(g:any)=>{let d=0,parent=g.parent;while(parent){d++;parent=s.groups?.find(v=>v.id===parent)?.parent;}return d;};
      for(const g of [...s.groups??[]].sort((a,b)=>groupDepth(a)-groupDepth(b))){
        let frame=linkedHere('deck-studio-group',g.id)??[...cloneSources].find(([id,n])=>n.children&&figmaId('group',id)===g.id)?.[1]??(sameFile?all.find(n=>!n.removed&&within(n)&&n.children&&figmaId('group',n.id)===g.id):undefined);
        if(!frame){const es=descendants(g.id);if(!es.length)continue;frame=figma.createFrame();frame.fills=[];frame.clipsContent=false;frame.blendMode='PASS_THROUGH';frame.layoutMode='NONE';(groups.get(g.parent??'')??slide).appendChild(frame);const left=Math.min(...es.map(e=>e.x)),top=Math.min(...es.map(e=>e.y)),right=Math.max(...es.map(e=>e.x+e.w)),bottom=Math.max(...es.map(e=>e.y+e.h));positionNode(frame,{type:'rect',x:left,y:top,w:Math.max(1,right-left),h:Math.max(1,bottom-top),rotation:0,flipX:false,flipY:false}as SlideElement,slide);all.push(frame);createdIds.push(frame.id);mutated=true;}
        bindNative(frame,deck.id,'deck-studio-group',g.id);groups.set(g.id,frame);
        const prior=old?.groups?.find(v=>v.id===g.id);if(!prior||prior.name!==g.name)frame.name=g.name;
        if(prior&&prior.parent!==g.parent){const absolute=frame.absoluteTransform,parent=groups.get(g.parent??'')??slide;parent.appendChild(frame);frame.relativeTransform=mul(inverse(parent.absoluteTransform),absolute);mutated=true;}
      }

      // Clone before any source element changes in this batch. A duplicate
      // must not accidentally inherit a later edit to the original table.
      const tableClones=new Map<string,{node:any;prior:SlideElement}>();
      for(const e of s.elements){const copy=tableCopies.get(figmaAssetKey(s.id,e.id));if(!copy)continue;const baseline=old?.elements.find(v=>v.id===copy.prior.id);if(!baseline)throw new Error('The native table copy lost its preparation baseline.');mutated=true;const node=cloneNativeTable(copy.source);(groups.get(e.group??'')??slide).appendChild(node);let ancestorOpacity=1;for(let p=node.parent;p&&p!==slide;p=p.parent)ancestorOpacity*=p.opacity??1;const ratio=e.opacity/(ancestorOpacity||1);if(Math.abs(ratio-1)>1e-12)node.opacity=Math.max(0,Math.min(1,node.opacity*ratio));all.push(node);createdIds.push(node.id);tableClones.set(e.id,{node,prior:baseline});}
      const shapeClones=new Map<string,{node:any;prior:SlideElement}>();
      for(const e of s.elements){const copy=shapeCopies.get(figmaAssetKey(s.id,e.id));if(!copy)continue;mutated=true;const node=copy.source.clone();(groups.get(e.group??'')??slide).appendChild(node);all.push(node);createdIds.push(node.id);shapeClones.set(e.id,{node,prior:copy.prior});}
      for(const e of s.elements){
        const copy=tableClones.get(e.id)??shapeClones.get(e.id),prior=old?.elements.find(v=>v.id===e.id)??copy?.prior;if(e.sourceId===`figma-background:${s.source?.nodeId}`&&sameFile&&same(e,prior))continue;let n=copy?.node??linkedHere('deck-studio-id',e.id)??cloneSources.get(e.sourceId??'')??(sameFile?nodeById(e.sourceId):undefined);if(n&&!within(n)||!copy&&(detachedTable(target,e)||detachedShape(target,e)))n=undefined;
        const existing=Boolean(n),visual=figmaAsset(assets,s.id,e.id);
        let compound:ReturnType<typeof writeShapeLabel>|undefined;
        if(hasShapeLabel(e)||n?.getPluginData?.(SHAPE_LABEL_KEY)){mutated=true;compound=writeShapeLabel(figma,n,e,groups.get(e.group??'')??slide,()=>{if(visual?.svg){const body=figma.createNodeFromSvg(svgForFigma(visual.svg,e));body.setPluginData('deck-studio-visual',e.type);return body;}return e.type==='ellipse'?figma.createEllipse():e.type==='line'?figma.createLine():figma.createRectangle();});n=compound.node;all.push(...[n,compound.body,compound.label,compound.text].filter(node=>!all.includes(node)));createdIds.push(...compound.createdIds);}
        if(compound&&visual?.svg&&compound.body.getPluginData?.('deck-studio-visual')&&!compound.createdIds.includes(compound.body.id)&&changed(e,prior,['shape','fill','stroke','strokeWidth','radius','line','w','h'])){const fresh=figma.createNodeFromSvg(svgForFigma(visual.svg,e));fresh.visible=false;for(const child of [...compound.body.children])child.remove();for(const child of [...fresh.children])compound.body.appendChild(child);compound.body.fills=fresh.fills;compound.body.strokes=fresh.strokes;compound.body.clipsContent=fresh.clipsContent;fresh.remove();}
        if(e.type==='table'&&n?.type!=='TABLE'){if(!n||!prior||changed(e,prior,['cells','tableStyle','w','h','fontFamily','fontSize','fontWeight','italic','underline','strikethrough','align','lineHeight','letterSpacing','fill','stroke','strokeWidth'])){mutated=true;const layer=writeLayerTable(figma,n,e,fonts,prior,deck.designSystem);n=layer.node;if(!existing){(groups.get(e.group??'')??slide).appendChild(n);all.push(n);}createdIds.push(...layer.createdIds);mutated=true;}const note='New and merged tables use editable Figma layers in this host. Cell text, structure and formatting sync; the native table toolbar is not available for these groups.';if(!warnings.includes(note))warnings.push(note);}
        if(visual?.svg&&!compound){
          const fresh=figma.createNodeFromSvg(svgForFigma(visual.svg,e));mutated=true;fresh.visible=false;
          if(n){for(const child of [...n.children])child.remove();for(const child of [...fresh.children])n.appendChild(child);n.fills=fresh.fills;n.strokes=fresh.strokes;n.clipsContent=fresh.clipsContent;fresh.remove();}
          else{n=fresh;(groups.get(e.group??'')??slide).appendChild(n);all.push(n);createdIds.push(n.id);}
          n.setPluginData('deck-studio-visual',e.type);mutated=true;
        }
        if(!n){
          if(e.type==='text')n=figma.createText();else if(e.type==='ellipse')n=figma.createEllipse();else if(e.type==='line')n=figma.createLine();else n=figma.createRectangle();
          (groups.get(e.group??'')??slide).appendChild(n);all.push(n);createdIds.push(n.id);mutated=true;
        }
        bindNative(n,deck.id,'deck-studio-id',e.id);members.set(e.id,n);
        const preparedMotion=motionPlans.get(figmaAssetKey(s.id,e.id))!;motionWrites.push({node:n,prepared:compound?.createdIds.includes(n.id)?{...preparedMotion,before:'',storage:undefined}:preparedMotion});
        if(existing&&prior&&e.group!==prior.group){const absolute=n.absoluteTransform,parent=groups.get(e.group??'')??slide;parent.appendChild(n);n.relativeTransform=mul(inverse(parent.absoluteTransform),absolute);mutated=true;}
        const managed=nativeLink(n,'deck-studio-visual'),nativeVisual=existing&&sameFile&&prior&&e.type==='image'&&!changed(e,prior,['src','fit','crop','imagePosition','imageZoom'])&&!(managed&&(visual?.svg||visual?.image||visual?.bytes));
        if(!existing||changed(e,prior,['name','hidden','locked','opacity','blendMode'])){
          if(!existing||e.name!==prior?.name)n.name=e.name;
          if(!existing||e.hidden!==prior?.hidden)n.visible=!e.hidden;
          if(!existing||e.opacity!==prior?.opacity){mutated=true;let ancestorOpacity=1;for(let p=n.parent;p&&p!==slide;p=p.parent)ancestorOpacity*=p.opacity??1;if(sameFile&&existing&&prior&&e.type==='image')setNativeVisualOpacity(n,e.opacity,prior.opacity);else n.opacity=Math.max(0,Math.min(1,e.opacity/(ancestorOpacity||1)));}
          if(!existing||e.locked!==prior?.locked)n.locked=e.locked;
          if('blendMode'in n&&(!existing||e.blendMode!==prior?.blendMode))n.blendMode=(e.blendMode??'normal').toUpperCase().replaceAll('-','_');mutated=true;
        }
        if(e.type==='text'&&(!existing||textChanged(e,prior))){if(n.type!=='TEXT')throw new Error(`“${e.name}” is no longer a native text object.`);setNativeText(n,e,fonts,prior);mutated=true;}
        if(e.type==='table'&&n.type==='TABLE'&&(!prior||tableLayoutFingerprint(e)!==tableLayoutFingerprint(prior))){mutated=true;writeNativeTable(n,e,fonts,prior??copy?.prior);}
        if(e.type==='text'&&(e.link!==prior?.link||e.link&&(!existing||textChanged(e,prior)))){n.hyperlink=e.link?{type:'URL',value:e.link}:null;mutated=true;}
        if(managed&&!compound&&(!existing||changed(e,prior,['shadow']))){n.effects=e.shadow?[{type:'DROP_SHADOW',color:{...figmaPaint(e.shadow.color)[0].color,a:e.shadow.opacity},offset:{x:e.shadow.x,y:e.shadow.y},radius:e.shadow.blur,spread:0,visible:true,blendMode:'NORMAL'}]:[];mutated=true;}
        if((!visual?.svg||compound&&!compound.body.getPluginData?.('deck-studio-visual'))&&['rect','ellipse','line'].includes(e.type)&&(!existing||changed(e,prior,['fill','stroke','strokeWidth','radius','shadow','line']))){const paint=compound?.body??n;paint.fills=e.type==='line'?[]:figmaPaint(e.fill);paint.strokes=figmaPaint(e.stroke);paint.strokeWeight=e.strokeWidth;if(e.type==='line'){paint.dashPattern=e.line?.dashArray??[];paint.strokeCap=e.line?.cap==='round'?'ROUND':e.line?.cap==='square'?'SQUARE':'NONE';}if('strokeAlign'in paint&&e.type!=='line')paint.strokeAlign='INSIDE';if('cornerRadius'in paint)paint.cornerRadius=e.radius;if('effects'in paint)paint.effects=e.shadow?[{type:'DROP_SHADOW',color:{...figmaPaint(e.shadow.color)[0].color,a:e.shadow.opacity},offset:{x:e.shadow.x,y:e.shadow.y},radius:e.shadow.blur,spread:0,visible:true,blendMode:'NORMAL'}]:[];mutated=true;}
        if(!nativeVisual&&(e.type==='image'||visual?.bytes||visual?.image)&&(!existing||changed(e,prior,['src','fit','crop','imagePosition','imageZoom','w','h']))&&(visual?.bytes||visual?.image)){const hash=figma.createImage(visual.image?figma.base64Decode(visual.image.split(',')[1]):new Uint8Array(visual.bytes??[])).hash;if(managed)for(const child of [...n.children??[]])child.remove();n.fills=[{type:'IMAGE',imageHash:hash,scaleMode:'FILL'}];mutated=true;}
        if(existing&&prior&&changed(e,prior,geometryKeys)&&n.parent?.layoutMode&&n.parent.layoutMode!=='NONE'&&'layoutPositioning'in n){n.layoutPositioning='ABSOLUTE';warnings.push(`Review the auto layout around “${e.name}” after moving it here.`);}
        if(copy||!existing||visual?.svg||changed(e,prior,geometryKeys)||e.type==='text'&&textChanged(e,prior)||e.type==='line'&&changed(e,prior,['strokeWidth'])){mutated=true;if(nativeVisual)positionNativeVisual(n,e,prior,slide);else positionNode(n,compound?{...e,type:'rect',padding:undefined}:e,slide);}
        if(compound){if(!existing||changed(e,prior,['shadow']))compound.body.effects=e.shadow?[{type:'DROP_SHADOW',color:{...figmaPaint(e.shadow.color)[0].color,a:e.shadow.opacity},offset:{x:e.shadow.x,y:e.shadow.y},radius:e.shadow.blur,spread:0,visible:true,blendMode:'NORMAL'}]:[];layoutShapeLabel(compound,e,slide,positionNode);updateShapeLabel(compound,e,fonts,prior,compound.freshText,setNativeText);}
        nativeIds.push(n.id);
      }
      // Preserve unknown native siblings while applying the editable stacking order.
      if(!old||createdIds.length||!same(old.elements.map(e=>[e.id,e.group]),s.elements.map(e=>[e.id,e.group]))){
        const lists=new Map<any,any[]>();
        const add=(parent:any,n:any)=>{if(!n||n===parent)return;const list=lists.get(parent)??[];if(!list.includes(n))list.push(n);lists.set(parent,list);};
        for(const e of s.elements){let g=e.group;const chain:string[]=[];while(g){chain.unshift(g);g=s.groups?.find(v=>v.id===g)?.parent;}let parent=slide;for(const id of chain){const frame=groups.get(id);if(frame){add(parent,frame);parent=frame;}}add(parent,members.get(e.id));}
        for(const [parent,list]of lists){const set=new Set(list),current=[...parent.children],desired:any[]=[];let index=0;for(const n of current)desired.push(set.has(n)?list[index++]:n);while(index<list.length)desired.push(list[index++]);for(let i=0;i<desired.length;i++)if(parent.children[i]!==desired[i]){parent.insertChild(i,desired[i]);mutated=true;}}
      }
      // Only previously linked objects can be deleted; unrelated native content survives.
      for(const removed of old?.elements??[])if(!s.elements.some(e=>e.id===removed.id)){const n=linkedHere('deck-studio-id',removed.id)??(sameFile?nodeById(removed.sourceId):undefined);if(n&&within(n)){n.remove();mutated=true;}}
      nativeIds.push(slide.id);
    }
    for(const n of removedTargets){n.remove();mutated=true;}
    if(structural){
      const lastOwned=originalGrid.flat().filter((n:any)=>ownedIds.has(n.id)).at(-1);let index=0;const rows=originalGrid.map((row:any[])=>row.flatMap(n=>{if(ownedIds.has(n.id)){const replacement=index<ordered.length?[ordered[index++]]:[];if(n===lastOwned){replacement.push(...ordered.slice(index));index=ordered.length;}return replacement;}return n.removed?[]:[n];}));if(index<ordered.length)rows.push(ordered.slice(index));figma.setSlideGrid(rows.filter((row:any[])=>row.length));
    }
    applyNativeTransitions(transitionPlans.values(),structural,()=>{mutated=true;});
    if(motionWrites.some(item=>item.prepared.before!==item.prepared.after&&!item.prepared.warning)){mutated=true;writeDeckObjectMotionBatch(motionWrites);}
    if(mutated)figma.commitUndo?.();return {nativeIds,createdIds,warnings};
  }catch(error){
    if(mutated)try{if(!undoBoundary||typeof figma.triggerUndo!=='function')throw new Error('Native Undo is unavailable.');figma.commitUndo();figma.triggerUndo();}catch{
      throw Object.assign(new Error(`${(error as Error)?.message||String(error)} Figma could not confirm rollback. Reconnect from ${BRAND_NAME} to read the current version before syncing again.`,{cause:error}),{reconnect:true});
    }
    if(mutated)throw Object.assign(new Error((error as Error)?.message||String(error),{cause:error}),{nativeRollback:true});
    throw error;
  }
}
