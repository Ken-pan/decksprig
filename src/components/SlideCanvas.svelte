<script lang="ts">
  import '../text-measurement-flow';
  import {fontFamilyKey,sameFontFamily} from '../core/font-stack';
  import type {TableCellTextPatch} from '../core/table-cell-text';
  import {isBlockSizingFrame} from '../core/block-frame';
  import {observeFontLoading} from '../core/font-events';
  import {hitElements} from '../core/hit-testing';
  import CanvasLineHandles from './CanvasLineHandles.svelte';
  import {lineGeometry} from '../core/line-path';
  import {lineLabelElement,lineLabelStyle,lineLabelTransform} from '../core/line-label';
  import {lineMarkup} from '../core/lines';
  import {lineState} from '../line-state.svelte';
  import {isDrawingElement} from '../core/drawing-identity';
  import {shapePath,shapePreview,shadowFilter} from '../core/shape-geometry';
  import {canEditText, isTextShape, shapeTextElement, shapeTextPatch} from '../core/shape-text';
  import {isShapeTool} from '../core/shapes';
  import type { DeckBlock } from '../core/deck-blocks';
  import DeckBlockPreview from './DeckBlockPreview.svelte';
  import type {BodyTextEditor} from '../body-text-editor';
  let RichTextEditor=$state<typeof import('./CanvasRichText.svelte').default>(),bodyEditor=$state<BodyTextEditor|null>(null);
  let richTextRequest:Promise<void>|undefined;
  function loadRichText(){return richTextRequest??=import('./CanvasRichText.svelte').then(module=>{RichTextEditor=module.default;}).catch(()=>{throw Error('Text editing tools could not load. Refresh the app to retry.');});}
  function setBodyEditor(value:BodyTextEditor|null){if(value||!bodyEditor?.dom.isConnected)bodyEditor=value;}
  function bodyChanged(next:SlideElement){if(textDraft?.element.id===next.id){textDraft={...textDraft,element:next};updateDraftLayout();return;}const base=sourceSlide.elements.find(e=>e.id===next.id);if(!base||editing!==next.id)return;formattedText=isTextShape(base)?{...base,...shapeTextPatch(base,next)}:next;updateLiveTextLayout(next);}
  let MobileTextEditor=$state<typeof import('./CanvasMobileTextEditor.svelte').default>();
  let mobileTextEditing=$state(false);
  $effect(()=>{mobileTextEditing=Boolean(interactive&&!original&&sourceSlide.elements.some(e=>e.id===editing&&canEditText(e))&&matchMedia('(max-width:760px), (pointer:coarse)').matches);});
  $effect(()=>{if(mobileTextEditing&&!MobileTextEditor)void import('./CanvasMobileTextEditor.svelte').then(module=>MobileTextEditor=module.default).catch(()=>{mobileTextEditing=false;editor.notify('The text editor could not open. Continue editing on the canvas.','warning');});});
  import type CanvasDrawingComponent from './CanvasDrawing.svelte';
  let CanvasDrawing = $state<typeof import('./CanvasDrawing.svelte').default>();
  $effect(() => {if (insertTool === 'draw' && !CanvasDrawing) void import('./CanvasDrawing.svelte').then(module => CanvasDrawing = module.default).catch(() => {editor.notify('Drawing tools could not load. Try again.', 'warning'); oninsertcancel?.();});});
  import {drawingState} from '../drawing-state.svelte';
  import type {CanvasTool} from '../core/insertion';
  import {themedImagePreview} from '../core/theme-artwork';
  import {isRegionFill} from '../core/resource-purpose';
  import ResourceImage from './ResourceImage.svelte';
  import {descendants,treeSelection,ancestorIds,groupBox,groupMarquee,selectionRoots,editingSelectionScope,individualSelectionScope} from '../core/container-tree';
  import { onMount, tick, untrack } from 'svelte';
  import {observeCanvasWidth} from '../core/canvas-width';
  import type { Deck, Slide, SlideElement } from '../core/model';
  import { focusCanvasSelection } from '../editor-focus';
  import {popoverFocus,restoreFocus} from '../ui-focus';
  import {positionFloating} from '../ui-viewport';
  import { holdPointerCursor, isPointerGestureActive } from '../pointer-cursor';
  import {canvasMovableIds,canvasHoverTarget} from '../core/canvas-pointer';
  import { editor } from '../core/editor.svelte';
  import { textDraftPatch, type TextFormatPatch, type TextFormatState, type TextRange } from '../core/text-range-format';
  import { insertedElement, insertionGeometry, fitTextInsertion, repeatedPlacementClick, type PlacementClick, type InsertTool, type InsertGeometry } from '../core/insertion';
  import { loadLibraryFont, slideFontFamilies } from '../core/font-loading';
  import { fontStack } from '../core/font-stack';
  import {textLinkUrl} from '../core/text-link';
  import {renderedNativeText,nativeTextSpans} from '../core/native-text-render';
  import {createTypography} from '../core/typography';
  const {runStyle,paragraphStyle,textBoxStyle,textFlowStyle}=createTypography(family=>fontStack(family,deck.onlineFonts?.find(font=>sameFontFamily(font.family,family))?.category));
  import {type Operation} from '../core/operations';
  import { selectedLayout } from '../core/object-layout';
  import { passedDragThreshold, boxResizeHandles, resizeCursor, resizeHandlePoint, resizeFromCorner, keepsAspectRatio, marqueeSelection, selectionBounds, selectionUnit, type ResizeHandle, type Point } from '../core/interactions';
  import {selectionMembers,selectionFrame,selectionKeepsRatio,resizeSelectionFrame,selectionScalePreview,scaleSelection} from '../core/selection-transform';
  import {layoutResizeAxes,layoutHandleAxes,resizedLayoutFrame,resizeLayout,layoutResizePreview} from '../core/layout-resize';
  import { createSnapScene, snapMove, snapResize, type SnapScene, type SnapGuide, type Axis } from '../core/snapping';
  import { elementLabel } from './element-labels';
  import AsyncFeature from './AsyncFeature.svelte';
  import type {Chart} from '../core/chart-schema';
  import {pageBackground} from '../core/page-background';
  import ChartVisual from './ChartVisual.svelte';
  import type {ChartTextTarget} from '../core/chart-text';
  import type {CellRange} from '../core/table-grid';
  import type {TableStyle} from '../core/table-schema';
  import {lazyElementPlayback} from '../core/lazy-motion-playback';
  import { resolveSlideTextSizing, resolveTextElement, browserTextSize, manualTextSizing } from '../core/text-layout';
  import {resolveGroupLayouts,manualLayoutSizing} from '../core/object-layout';
  import {createCanvasMoveScene,type CanvasMoveScene,type CanvasDrop} from '../core/canvas-container-move';
  import {selectMovedLayers} from '../core/moved-layer-selection';
  import {captureCanvasLayout,cancelCanvasLayoutMotion} from '../canvas-layout-motion';
  import type {RotationGesture} from '../core/rotation';
  let RotationHandles=$state<typeof import('./CanvasRotationHandles.svelte').default>();
  let RotationGuides=$state<typeof import('./CanvasRotationGuides.svelte').default>();
  let rotationTools=$state<typeof import('../core/rotation').rotationTools>();
  $effect(()=>{if(interactive&&!original&&editor.selected.length&&!RotationHandles)void import('./CanvasRotationHandles.svelte').then(m=>{RotationHandles=m.default;RotationGuides=m.RotationGuides;rotationTools=m.rotationTools;});});
  let CanvasLayoutGuides=$state<typeof import('./CanvasLayoutGuides.svelte').default>();
  let CanvasContainerDrop=$state<typeof import('./CanvasContainerDrop.svelte').default>();
  let guideRequest:Promise<void>|undefined;
  function loadCanvasGuides(){
    guideRequest??=Promise.all([import('./CanvasLayoutGuides.svelte'),import('./CanvasContainerDrop.svelte')]).then(([guides,drop])=>{CanvasLayoutGuides=guides.default;CanvasContainerDrop=drop.default;}).catch(()=>{guideRequest=undefined;});
  }
  // Selection preloads both visual aids before a drag crosses its threshold.
  // Saved layout-guide preferences also load them when the canvas opens.
  $effect(()=>{if(interactive&&(editor.selected.length||editor.layoutGuides))loadCanvasGuides();});
  import { mobileTextPresentation } from '../core/text-editing';
  let {deck, slide: sourceSlide, interactive = false, original = false, thumbnail = false, layoutWidth, playback = false, step = 0, replay = 0, reduced = false, paused = false, entering = false, restored = false, sharedIds = [], clientId = '', insertTool = null, insertImage = null, insertBlock = null, onplace, oninsertcancel, ontextdraft, oncellselection, onprototype, onprototypeinteraction}: {deck: Pick<Deck, 'width' | 'height'> & Partial<Pick<Deck, 'fonts' | 'onlineFonts' | 'designSystem'>>; slide: Slide; interactive?: boolean; original?: boolean; thumbnail?: boolean; layoutWidth?: number; playback?: boolean; step?: number; replay?: number; reduced?: boolean; paused?: boolean; entering?: boolean; restored?: boolean; sharedIds?: string[]; clientId?: string; insertTool?: CanvasTool|null; insertImage?: SlideElement|null; insertBlock?: DeckBlock|null; onplace?: (type:InsertTool, geometry:InsertGeometry, revision:number, slideId:string, text?:string, style?:Partial<SlideElement>) => void; oninsertcancel?: () => void; ontextdraft?: (active:boolean) => void; oncellselection?: (active:boolean) => void; onprototype?: (element: SlideElement) => void; onprototypeinteraction?: (id: string, active: boolean) => void} = $props();
  let fontEpoch = $state(0), dataEditorId = $state('');
  const dataElement = $derived(sourceSlide.elements.find(e=>e.id===dataEditorId));
  let chartTextEditor=$state<{id:string;target:ChartTextTarget}|null>(null);
  let chartValueId=$state(''),chartValuePreview=$state<{id:string;chart:Chart}|null>(null);
  $effect(()=>{if(chartTextEditor&&(!interactive||original||!editor.selected.includes(chartTextEditor.id))){chartTextEditor=null;chartValuePreview=null;}});
  let chartValueSequence=$state(0),chartInitialPoint=$state<{series:number;category:number}|null>(null),chartActivePoint=$state<{id:string;series:number;category:number}|null>(null);
  let TableColumnHandles=$state<typeof import('./CanvasTableColumnHandles.svelte').default>();
  let TableGrid=$state<typeof import('./CanvasTableGrid.svelte').default>(),ChartPointInteraction=$state<typeof import('./CanvasChartPointInteraction.svelte').default>();
  let columnHandlesRequest:Promise<void>|undefined;
  $effect(()=>{if(interactive&&!original&&editor.selection.length===1&&editor.selection[0]?.type==='table'&&!TableColumnHandles&&!columnHandlesRequest)columnHandlesRequest=Promise.all([import('./CanvasTableColumnHandles.svelte'),import('./CanvasTableGrid.svelte')]).then(([handles,grid])=>{TableColumnHandles=handles.default;TableGrid=grid.default;}).catch(()=>{columnHandlesRequest=undefined;});});
  $effect(()=>{if(interactive&&!original&&editor.selection.length===1&&editor.selection[0]?.type==='chart'&&!ChartPointInteraction)void import('./CanvasChartPointInteraction.svelte').then(m=>ChartPointInteraction=m.default);});
  function openChartPoint(id:string,series?:number,category?:number){const target=sourceSlide.elements.find(e=>e.id===id);if(!interactive||original||!target||target.locked||target.designPattern)return;chartTextEditor=null;editor.choose(id,false,true);chartInitialPoint=series===undefined?null:{series,category:category??0};chartActivePoint=chartInitialPoint?{id,...chartInitialPoint}:null;chartValueSequence++;chartValueId=id;}
  function openChartText(id:string,target:ChartTextTarget){const e=sourceSlide.elements.find(e=>e.id===id);if(!interactive||original||!e||e.locked||e.designPattern)return;editor.choose(id,false,true);chartValueId='';chartActivePoint=null;chartValuePreview=null;chartTextEditor={id,target};}
  function chartTextNode(id:string,target:ChartTextTarget){return host?.querySelector<HTMLElement>(`[data-element-id="${id}"] [data-chart-text="${target.kind}"][data-chart-text-index="${target.index??''}"]`)??host?.querySelector<HTMLElement>(`[data-element-id="${id}"]`)??undefined;}
  function chartPointNode(id:string,series:number,category:number){return host?.querySelector<HTMLElement>(`[data-element-id="${id}"] [data-chart-point][data-chart-series="${series}"][data-chart-category="${category}"]`)??host?.querySelector<HTMLElement>(`[data-element-id="${id}"]`)??undefined;}
  function chartDraft(e:SlideElement){return chartValuePreview?.id===e.id?{...e,chart:chartValuePreview.chart}:e;}
  let tablePointerCell:{id:string;row:number;column:number}|null=null;
  let cellEditor=$state<{id:string;row:number;column:number;initialValue?:string}|null>(null),cellPreview=$state<{id:string;row:number;column:number;patch:TableCellTextPatch}|null>(null);
  let tableInteraction=$state<{id:string;range?:CellRange;moving:boolean;resizing:boolean}>();
  let columnPreview=$state<{id:string;style:TableStyle}|null>(null);
  function cellNode(id:string,row:number,column:number){return host?.querySelector<HTMLElement>(`[data-element-id="${id}"] [data-table-row="${row}"][data-table-column="${column}"]`)??undefined;}
  function openCell(id:string,row:number,column:number,initialValue?:string){if(!interactive||original||sourceSlide.elements.find(e=>e.id===id)?.locked)return;editor.choose(id,false,true);cellEditor={id,row,column,initialValue};}
  function tableDraft(e:SlideElement){const styled=columnPreview?.id===e.id?{...e,tableStyle:columnPreview.style}:e;return cellPreview?.id===e.id?{...styled,...cellPreview.patch}:styled;}
  let lineEditPreview=$state<{id:string;patch:Partial<SlideElement>}|null>(null);
  let lineLabelSize=$state<{id:string;w:number;h:number}|null>(null);
  // Editor transactions replace this complete draft; nested reactive proxies
  // would retraverse thousands of unchanged run styles on every keystroke.
  let formattedText = $state.raw<SlideElement | null>(null);
  let slide = $derived.by(() => {
    fontEpoch;
    const lineSource=lineEditPreview?{...sourceSlide,elements:sourceSlide.elements.map(e=>e.id===lineEditPreview!.id?{...e,...lineEditPreview!.patch}:e)}:sourceSlide;
    const source = formattedText && formattedText.id === editor.editingId ? {...sourceSlide, elements: lineSource.elements.map(e => e.id === formattedText!.id ? formattedText! : e)} : lineSource;
    if(gesture?.mode==='rotate'&&gesture.active&&gesture.rotation&&rotationTools)return resolveSlideTextSizing(rotationTools.preview(source,gesture.rotation),deck);
    if(gesture?.mode==='scale'&&gesture.active&&gesture.members){
      const to=resizeSelectionFrame(gesture.base,gesture.members,gesture.dx,gesture.dy,gesture.corner,gesture.proportional);
      return resolveSlideTextSizing(selectionScalePreview(source,gesture.members,gesture.base,to),deck);
    }
    if(gesture?.mode==='layout-resize'&&gesture.active&&gesture.layoutId){
      const g=gesture,to=resizedLayoutFrame(g.base,g.dx,g.dy,g.corner,g.proportional);
      return resolveSlideTextSizing(layoutResizePreview(source,g.layoutId!,to,layoutHandleAxes(g.corner,g.proportional)),deck);
    }
    if(gesture?.mode==='resize'&&gesture.active){
      const g=gesture,patch=manualTextSizing(g.base,manualLayoutSizing(g.base,resizeFromCorner(g.base,g.dx,g.dy,g.corner,g.proportional)));
      return resolveSlideTextSizing({...source,elements:source.elements.map(e=>e.id===g.id?{...e,...patch}:e)},deck);
    }
    const measured=resolveSlideTextSizing(source,deck),live=liveTextSize;
    if(live&&live.id===editor.editingId)return resolveGroupLayouts({...measured,elements:measured.elements.map(e=>e.id===live.id?{...e,...live}:e)},false,e=>e.id===live.id?{...e,...live}:resolveTextElement(e,deck));
    return measured;
  });
  $effect(() => {
    if (original && slide.source?.render) return;
    for (const family of slideFontFamilies(slide,deck.onlineFonts)) void loadLibraryFont(family, deck.fonts).catch(() => {});
  });
  let host: HTMLDivElement;
  let measuredWidth = $state<number>();
  let scale = $derived((layoutWidth ?? measuredWidth ?? deck.width) / deck.width);
  let lastScale: number | undefined;
  $effect.pre(() => {
    const next = scale;
    if (lastScale !== undefined && Math.abs(next - lastScale) > .00001) {
      untrack(() => { if (gesture || marquee || insertion) cancelPointer(); });
    }
    lastScale = next;
  });
  let editing = $derived(interactive && !original ? editor.editingId : '');
  const sizingFrames=$derived(new Set(sourceSlide.elements.filter(e=>e.group&&sourceSlide.groups?.some(g=>g.id===e.group&&g.block)&&isBlockSizingFrame(e)).map(e=>e.id)));
  let individualPointer=$state(false);
  let hoveredObject='',hoverKey='',hoverTarget='';
  function previewHover(id:string){
    const key=`${id}:${editor.editingGroup}:${individualPointer}:${editor.deck?.revision}`;
    if(key===hoverKey&&editor.hovered===hoverTarget)return;
    hoverKey=key;hoverTarget=canvasHoverTarget(slide,id,editor.editingGroup,individualPointer);editor.hovered=hoverTarget;
  }
  function hoverCanvas(event:PointerEvent,id:string){
    if(!interactive||original||event.pointerType==='touch'||event.buttons||isPointerGestureActive()||gesture||editing||insertTool)return;
    individualPointer=event.metaKey||event.ctrlKey;hoveredObject=id;
    previewHover(id);
  }
  function leaveCanvas(id=hoveredObject){if(hoveredObject===id){hoveredObject='';editor.hovered='';}}
  let movableIds=$derived(interactive?canvasMovableIds(sourceSlide,editor.selected,editor.selectionScope,editor.editingGroup,individualPointer):new Set<string>());
  let liveTextSize = $state<{id: string; w: number; h: number; x?: number; y?: number; textSizing?: SlideElement['textSizing']} | null>(null);
  $effect(() => { if (liveTextSize && liveTextSize.id !== editing) liveTextSize = null; });
  $effect(() => { if (formattedText && formattedText.id !== editing) { formattedText = null; } });
  let insertPoint = $state<Point|null>(null);
  let insertion = $state<{type:InsertTool;start:Point;end:Point;client:Point;pointerId:number;revision:number;slideId:string;active:boolean;constrained:boolean}|null>(null);
  let drawing = $state<CanvasDrawingComponent>();
  let erasingIds = $state<string[]>([]);
  let insertPreview = $derived(insertTool && insertTool !== 'draw' && insertPoint ? insertionGeometry(insertTool, deck, insertion?.start ?? insertPoint, insertion?.active ? insertion.end : undefined, insertion?.constrained, insertBlock ?? insertImage ?? undefined,lineState.style) : null);
  let regionRenderer = $state<typeof import('../core/region-fill').regionFillSource>();
  let regionRequest: Promise<void> | undefined;
  $effect(() => {
    if (!regionRenderer && (slide.elements.some(isRegionFill) || isRegionFill(insertImage))) {
      regionRequest ??= import('../core/region-fill').then(module => {regionRenderer = module.regionFillSource;}).catch(() => {regionRequest = undefined;});
    }
  });
  function renderedImage(e: SlideElement) {return regionRenderer && isRegionFill(e) ? regionRenderer(e) : themedImagePreview(e);}
  let adjustedClick = $derived(Boolean(insertPreview && insertPoint && !insertion?.active && (Math.abs(insertPreview.x - (insertion?.start ?? insertPoint).x) > .01 || Math.abs(insertPreview.y - (insertion?.start ?? insertPoint).y) > .01)));
  let previewLabelHeight = $derived(adjustedClick ? 48 : 28);
  let textDraft = $state<{element:SlideElement;revision:number;slideId:string;deckId:string}|null>(null);
  let draftLayout = $state<InsertGeometry|null>(null);
  let draftBounds = $derived(draftLayout ?? textDraft?.element);
  let draftInput = $state<HTMLDivElement>();
  let lastImageClick: PlacementClick|null = null;
  function updateDraftLayout() {
    if (!textDraft || !draftInput) return;
    const text = bodyEditor?.element().text??textDraft.element.text;
    let current = text?textDraft.element:{...textDraft.element,text:'Type here…',runs:undefined,paragraphs:undefined};
    let size = browserTextSize(current, deck);
    if (!size) return;
    if (current.textSizing === 'auto-width' && size.w > deck.width) {
      current = {...current, w: deck.width, textSizing: 'auto-height'};
      size = browserTextSize(current, deck) ?? size;
    }
    draftLayout = fitTextInsertion(deck, {...textDraft.element, textSizing: current.textSizing}, size);
    // A caret outside an overflow-hidden surface can make the browser scroll the artwork itself.
    keepArtworkStill();
  }
  let pointerCapture: {target: HTMLElement; id: number} | null = null;
  const pointerViewport=()=>[innerWidth,innerHeight,window.visualViewport?.width,window.visualViewport?.height].join(':');
  let capturedViewport='';
  function capturePointer(event: PointerEvent,override?:HTMLElement) {
    const current=event.currentTarget as HTMLElement,target=override??(current.matches('.resize-handle,.rotation-handle')?current.closest<HTMLElement>('.interaction-overlay')??current:current);
    target.setPointerCapture(event.pointerId); pointerCapture = {target, id: event.pointerId};capturedViewport=pointerViewport();
  }
  function releasePointer() {
    const capture = pointerCapture; pointerCapture = null;
    if (capture?.target.hasPointerCapture(capture.id)) capture.target.releasePointerCapture(capture.id);
  }
  function beginInsertion(event:PointerEvent) {
    if (!insertTool || insertTool === 'draw' || !interactive || original || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); cancelPointer();
    const point=canvasPoint(event.clientX,event.clientY); insertPoint=point;
    insertion={type:insertTool,start:point,end:point,client:{x:event.clientX,y:event.clientY},pointerId:event.pointerId,revision:editor.deck!.revision,slideId:slide.id,active:false,constrained:event.shiftKey};
    capturePointer(event);
  }
  function moveInsertion(event:PointerEvent) {
    if(!insertTool || insertTool === 'draw')return;
    if(insertion && event.pointerId!==insertion.pointerId)return;
    if(event.pointerType==='touch'&&!insertion)return;
    insertPoint=canvasPoint(event.clientX,event.clientY);
    if(insertion)insertion={...insertion,end:insertPoint,active:insertion.active||passedDragThreshold(event.clientX-insertion.client.x,event.clientY-insertion.client.y,event.pointerType),constrained:event.shiftKey};
  }
  let textInsertionRequest=0;
  async function completeInsertion(type:InsertTool,geometry:InsertGeometry,revision:number,slideId:string) {
    if(!interactive||original||editor.deck?.revision!==revision||slide.id!==slideId)return;
    if(type==='text'){
      const request=++textInsertionRequest,document=editor.deck!,deckId=document.id,element=insertedElement('text',deck,geometry,'',sourceSlide);
      try{await Promise.all([loadRichText(),import('../core/text-editing-fonts').then(module=>module.prepareTextEditingFonts(element,document))]);}catch(error){if(request===textInsertionRequest&&editor.deck?.id===deckId){editor.notify((error as Error).message.startsWith('Text editing tools')?(error as Error).message:'The font is unavailable. Choose a font from the font library and retry.','warning');oninsertcancel?.();}return;}if(!interactive||original||insertTool!=='text'||request!==textInsertionRequest||editor.deck?.id!==deckId||editor.deck?.revision!==revision||slide.id!==slideId)return;
      draftLayout=null;textDraft={element,revision,slideId,deckId};ontextdraft?.(true);
      void tick().then(updateDraftLayout);
    }else onplace?.(type,geometry,revision,slideId,'',type==='line'?{line:{...lineState.style}}:{});
    insertPoint=null;
  }
  function finishInsertion(event:PointerEvent) {
    if(!insertion||event.pointerId!==insertion.pointerId)return;
    moveInsertion(event);
    const g=insertion; insertion=null;
    releasePointer();
    const click:PlacementClick={client:{x:event.clientX,y:event.clientY},time:event.timeStamp,slideId:g.slideId,revision:g.revision};
    if (g.type === 'image' && !g.active && repeatedPlacementClick(lastImageClick, click)) { insertPoint=null; return; }
    completeInsertion(g.type,insertionGeometry(g.type,deck,g.start,g.active?g.end:undefined,g.constrained,insertBlock ?? insertImage ?? undefined,lineState.style),g.revision,g.slideId);
    if (g.type === 'image' && editor.deck?.revision !== g.revision) lastImageClick = g.active ? null : {...click,revision:editor.deck!.revision};
  }
  export function finishTextDraft(cancel=false) {
    if(!textDraft)return;
    if(!cancel&&bodyEditor?.composing()){editor.notify('Finish composing text before saving.','warning');return;}
    if(!cancel&&bodyEditor&&!bodyEditor.current()){editor.notify('The document changed. Copy this text, then reopen it before saving.','warning');return;}
    updateDraftLayout();
    const draft=textDraft,current=bodyEditor?.element()??draft.element,text=current.text,geometry=draftLayout??draft.element;
    textDraft=null;draftLayout=null;ontextdraft?.(false);
    if(!cancel&&text.trim())onplace?.('text',{...geometry,h:Math.min(20000,geometry.h)},draft.revision,draft.slideId,text,textDraftPatch(current));
    else void focusCanvasSelection();
  }
  function textKey(event:KeyboardEvent, draft=false) {
    if(!event.isComposing&&event.keyCode!==229&&!event.altKey&&(event.metaKey||event.ctrlKey)&&(!event.shiftKey&&['k',','].includes(event.key.toLowerCase())||event.shiftKey&&event.code==='Backslash'))return;
    event.stopPropagation();if(event.isComposing||event.keyCode===229)return;
    if(event.key==='Escape'&&document.querySelector('[popover]:popover-open:not([role=tooltip])'))return;
    if(event.key==='Escape'){event.preventDefault();if(draft)finishTextDraft(true);else{finishTextEditing(true);void focusCanvasSelection();}}
    else if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();if(draft)finishTextDraft();else{finishTextEditing();void focusCanvasSelection();}}
    else if((event.metaKey||event.ctrlKey)&&!event.shiftKey&&event.key.toLowerCase()==='s'){event.preventDefault();if(draft)finishTextDraft();else{finishTextEditing();void focusCanvasSelection();}void editor.flush();}
    // Formatting is owned by the same lazy tools as pointer actions. Never let
    // the browser create unmanaged markup while those tools are opening.
    else if((event.metaKey||event.ctrlKey)&&!event.shiftKey&&!event.altKey&&['b','i','u'].includes(event.key.toLowerCase()))event.preventDefault();
  }
  $effect(()=>{
    if(!insertTool) {insertion=null;insertPoint=null;lastImageClick=null;}
    else {editor.hovered='';cancelPointer();}
  });
  $effect(()=>{
    if(textDraft&&(!interactive||original||textDraft.deckId!==editor.deck?.id||textDraft.slideId!==slide.id||textDraft.revision!==editor.deck?.revision)){textDraft=null;draftLayout=null;ontextdraft?.(false);}
  });
  let gesture = $state<{id: string; targetId?:string; tapTarget?:string; layoutId?:string; ids: string[]; x: number; y: number; dx: number; dy: number; mode: 'move' | 'resize' | 'scale' | 'layout-resize' | 'rotate'; rotation?:RotationGesture; members?:SlideElement[]; context?:string; corner: ResizeHandle; base: SlideElement; pointerId: number; pointerType: string; active: boolean; proportional: boolean; revision:number; slideId:string;deckId:string;altPick:boolean;toggleSelection:boolean;axis?:Axis;clientX:number;clientY:number;startPoint:Point;shift:boolean;alt:boolean} | null>(null);
  let canvasScene:CanvasMoveScene|null=null;
  let canvasDrop=$state.raw<CanvasDrop|null>(null);
  let shownDrop=$derived(canvasDrop&&(canvasDrop.flow||canvasDrop.reparent||canvasDrop.reason)?canvasDrop:null);
  let marquee=$state<{pointerId:number;client:Point;start:Point;end:Point;base:string[];baseGroup:string;baseScope:string;baseIndividual:boolean;scope:string;individual:boolean;mode:'intersect'|'contain';additive:boolean;active:boolean;external:boolean;revision:number;slideId:string;deckId:string;clickId?:string}|null>(null);
  const selectedIds = $derived(new Set(editor.selected));
  const gestureIds = $derived(new Set(gesture?.ids ?? []));
  let gestureCursor = $derived(gesture?.active ? gesture.mode === 'rotate' ? rotationTools?.cursor ?? 'crosshair' : gesture.mode !== 'move' ? resizeCursor(gesture.base, gesture.corner) : 'grabbing' : marquee?.active ? 'crosshair' : insertion?.active ? insertion.type === 'text' ? 'text' : 'crosshair' : null);
  $effect(() => { if (gestureCursor) return holdPointerCursor(gestureCursor); });
  let picker=$state<HTMLDivElement>();
  let stack=$state<SlideElement[]>([]),pickerX=$state(0),pickerY=$state(0);
  let pickerOrigin:HTMLElement|null=null;
  let pickerAnchor:Point={x:0,y:0};
  let pendingPicker:Point|null=null,pickerTimer:ReturnType<typeof setTimeout>|undefined;
  let holdTimer:ReturnType<typeof setTimeout>|undefined,holdPoint:Point|null=null;
  function clearHold(){clearTimeout(holdTimer);holdPoint=null;}
  function holdToPick(event:PointerEvent){
    clearHold();if(event.pointerType!=='touch')return;
    const point={x:event.clientX,y:event.clientY};holdPoint=point;
    holdTimer=setTimeout(()=>{cancelPointer();pendingPicker=point;},550);
  }
  let marqueeBox=$derived(marquee?{x:Math.min(marquee.start.x,marquee.end.x),y:Math.min(marquee.start.y,marquee.end.y),w:Math.abs(marquee.end.x-marquee.start.x),h:Math.abs(marquee.end.y-marquee.start.y)}:null);
  let selectionUnits=$derived(interactive?selectionRoots(slide,editor.selected,editor.selectionScope):[]);
  let layoutSelection=$derived(interactive?selectedLayout(slide,editor.selected,editor.selectedContainer):undefined);
  let resizingLayout=$derived(selectionUnits.length===1?sourceSlide.autoLayouts?.find(l=>l.id===selectionUnits[0]):undefined);
  let resizingGroup=$derived(!resizingLayout&&selectionUnits.length===1&&descendants(sourceSlide,selectionUnits[0]).length>0);
  let layoutAxes=$derived(resizingLayout?layoutResizeAxes(sourceSlide,resizingLayout.id):null);
  let selectionHandles=$derived(layoutAxes&&!layoutAxes.h?['w','e'] as ResizeHandle[]:boxResizeHandles);
  let wholeLayout=$derived(resizingLayout);
  let bounds=$derived(interactive&&!editing?(gesture?.mode==='rotate'&&gesture.active&&!gesture.rotation?.single?gesture.base:gesture?.mode==='scale'&&gesture.active&&gesture.members?resizeSelectionFrame(gesture.base,gesture.members,gesture.dx,gesture.dy,gesture.corner,gesture.proportional):wholeLayout?(()=>{const b=groupBox(slide,wholeLayout.id)!;return {...b,x:b.x+(gesture?.mode==='move'?gesture.dx:0),y:b.y+(gesture?.mode==='move'?gesture.dy:0)};})():editor.selectedContainer||editor.selection.length>1?previewSelectionFrame():null):null);
  let scaleFrame=$derived(interactive&&editor.slide?selectionFrame(editor.slide,editor.selected,editor.selectionScope):null);
  let scaleMembers=$derived(interactive&&editor.slide?selectionMembers(editor.slide,editor.selected,false,editor.selectionScope):[]);
  let selectedLeaves=$derived(new Set(selectionUnits.filter(id=>slide.elements.some(e=>e.id===id))));
  const containersView=$derived(interactive&&!original&&(sourceSlide.groups?.length||sourceSlide.autoLayouts?.length||sourceSlide.elements.some(e=>e.group))?import('./CanvasContainers.svelte'):null);
  function startContainer(event:PointerEvent,id:string){
    const members=descendants(slide,id),individual=event.metaKey||event.ctrlKey;
    const e=individual?hitElements(members,canvasPoint(event.clientX,event.clientY))[0]:members.find(e=>!e.hidden&&!e.designPattern);
    if(e)start(event,e,'move','se',individual?'':id);
    else{event.stopPropagation();beginMarquee(event);}
  }
  function previewSelectionFrame(){const frame=editor.selectedContainer?groupBox(slide,editor.selectedContainer):selectionFrame(slide,editor.selected,editor.selectionScope);return frame&&gesture?.mode==='move'?{...frame,x:frame.x+gesture.dx,y:frame.y+gesture.dy}:frame;}
  let panFrame=0;
  let pendingDrag: {x:number;y:number;shift:boolean;alt:boolean} | undefined;
  let snapScene: SnapScene | null = null;
  let snapGuides = $state<SnapGuide[]>([]);
  let displayGuides=$derived(canvasDrop?.flow?[]:snapGuides);
  const transformReadout=$derived.by(()=>{
    if(!gesture?.active||!bounds||!['layout-resize','scale'].includes(gesture.mode))return'';
    const w=Math.round(bounds.w),h=Math.round(bounds.h),sx=Math.round(bounds.w/gesture.base.w*100),sy=Math.round(bounds.h/gesture.base.h*100);
    return`${gesture.mode==='layout-resize'?'Layout':'Scale'} · ${w} × ${h}${gesture.mode==='scale'?` · ${sx}%${gesture.proportional?'':` × ${sy}%`}`:''}`;
  });
  let previewBounds = $derived.by(()=>{
    if(!gesture?.active)return null;
    if(gesture.mode==='scale')return resizeSelectionFrame(gesture.base,gesture.members!,gesture.dx,gesture.dy,gesture.corner,gesture.proportional);
    if(gesture.mode==='layout-resize')return groupBox(slide,gesture.layoutId!)??null;
    if(gesture.mode==='move'&&snapScene)return{...snapScene.moving,x:snapScene.moving.x+gesture.dx,y:snapScene.moving.y+gesture.dy};
    return selectionBounds(slide.elements.filter(e=>gestureIds.has(e.id)&&!e.hidden).map(e=>({...e,...previewPosition(e)})));
  });
  const fmt = (n: number) => `${n}px`;
  function previewPosition(e: SlideElement) {
    let x = e.x, y = e.y, w = e.w, h = e.h;
    if (editing === e.id && liveTextSize?.id === e.id) { w = liveTextSize.w; h = liveTextSize.h; x = liveTextSize.x ?? x; y = liveTextSize.y ?? y; }
    if (gesture && gestureIds.has(e.id)) {
      if (gesture.mode === 'move') { x += gesture.dx; y += gesture.dy; }
    }
    return {x,y,w,h};
  }
  function position(e:SlideElement){const {x,y,w,h}=previewPosition(e);return `left:${fmt(x)};top:${fmt(y)};width:${fmt(w)};height:${fmt(h)};transform:rotate(${e.rotation}deg) scale(${e.flipX?-1:1},${e.flipY?-1:1});`;}
  function visual(e: SlideElement) {
    return `font-family:${fontStack(e.fontFamily, editor.deck?.onlineFonts?.find(f => sameFontFamily(f.family,e.fontFamily))?.category)};font-size:${e.fontSize}px;font-weight:${e.fontWeight};font-style:${e.italic ? 'italic' : 'normal'};text-decoration:${e.type==='text'||e.type==='table'?'none':e.underline?'underline':'none'};line-height:${e.lineHeight};letter-spacing:${e.letterSpacing}px;text-align:${e.align};color:${e.fill};`;
  }
  function canvasLineLabel(e:SlideElement){void fontEpoch;return lineLabelElement(e);}
  function touchHandleTarget(event:PointerEvent,e:SlideElement,corner:ResizeHandle):SlideElement|undefined {
    if(event.pointerType!=='touch')return;
    const p=canvasPoint(event.clientX,event.clientY),hit=hitElements(slide.elements.filter(e=>!sizingFrames.has(e.id)),p)[0];if(!hit||selectedIds.has(hit.id))return;
    const anchor=resizeHandlePoint(e,corner);
    return Math.hypot(p.x-anchor.x,p.y-anchor.y)*scale>10?hit:undefined;
  }
  function handleMarquee(event:PointerEvent,e?:SlideElement,corner?:ResizeHandle):boolean {
    if(event.pointerType==='touch'||event.button!==0)return false;
    const p=canvasPoint(event.clientX,event.clientY),anchor=e&&corner?resizeHandlePoint(e,corner):null;
    if(!(event.metaKey||event.ctrlKey||event.altKey&&(!anchor||Math.hypot(p.x-anchor.x,p.y-anchor.y)*scale>10)))return false;
    event.stopPropagation();beginMarquee(event);return true;
  }
  function start(event: PointerEvent, e: SlideElement, mode: 'move' | 'resize' = 'move', corner: ResizeHandle = 'se', containerId='',captureTarget?:HTMLElement) {
    if (!interactive || original || e.designPattern || editor.croppingId || event.button !== 0) return;
    const control=(event.target as Element).closest('button,a,input,textarea,select,[contenteditable="true"]');
    if(mode==='move'&&control&&control!==event.currentTarget&&(event.currentTarget as Element).contains(control))return;
    if(mode==='resize'&&handleMarquee(event,e,corner))return;
    const tapTarget=mode==='resize'?touchHandleTarget(event,e,corner)?.id:undefined;
    if (editing) {
      if (editing === e.id && (event.target as Element).closest('.text-content')) return;
      finishTextEditing();
    }
    if(mode==='move'&&e.locked&&!event.altKey&&event.pointerType!=='touch'){event.stopPropagation();beginMarquee(event);if(marquee)marquee={...marquee,clickId:containerId||e.id};return;}
    event.stopPropagation();
    const altPick=mode==='move'&&event.altKey;
    if(altPick)pendingPicker={x:event.clientX,y:event.clientY};
    const targetId=containerId||e.id,alreadySelected=containerId?descendants(slide,containerId).filter(e=>!e.hidden).every(e=>selectedIds.has(e.id)):selectedIds.has(e.id);
    const toggleSelection = mode === 'move' && !altPick && (event.shiftKey || editor.additiveSelection) && alreadySelected;
    if (mode === 'move' && !altPick && !toggleSelection && (!alreadySelected || containerId&&!selectionUnits.includes(containerId)&&!event.shiftKey&&!editor.additiveSelection || event.shiftKey || editor.additiveSelection || event.metaKey || event.ctrlKey)) editor.choose(targetId, event.shiftKey || editor.additiveSelection, !containerId&&(event.metaKey||event.ctrlKey));
    (captureTarget??event.currentTarget as HTMLElement).focus({preventScroll: true});
    const current=slide.elements.find(item=>item.id===e.id);if(!current){cancelPointer();return;}e=current;
    if(mode==='move')holdToPick(event);
    if(editor.selectedContainer&&descendants(slide,editor.selectedContainer).some(e=>e.locked))return;
    if (e.locked || (!altPick&&!selectedIds.has(e.id))) return;
    const targetIds=altPick&&!selectedIds.has(e.id)?treeSelection(slide,e.id):editor.selected;
    const context=editor.selectionScope,ids = mode === 'resize' ? [e.id] : selectionMembers(slide,targetIds,false,context).map(e=>e.id);
    if(!ids.includes(e.id))return;
    canvasScene=null;canvasDrop=null;
    gesture = {id: e.id, targetId, tapTarget, ids, x: event.clientX, y: event.clientY, dx: 0, dy: 0, mode,context, corner, base: {...e}, pointerId: event.pointerId, pointerType: event.pointerType, active: false, proportional: keepsAspectRatio(e, event.shiftKey),revision:editor.deck!.revision,slideId:slide.id,deckId:editor.deck!.id,altPick,toggleSelection,clientX:event.clientX,clientY:event.clientY,startPoint:canvasPoint(event.clientX,event.clientY),shift:event.shiftKey,alt:event.altKey};
    snapGuides=[];snapScene=createSnapScene(deck,slide,ids,editor.selected,context);
    capturePointer(event,captureTarget);
  }
  function startScale(event:PointerEvent,corner:ResizeHandle){
    if(!interactive||original||editing||insertTool||event.button!==0||!scaleFrame||!scaleMembers.length||scaleMembers.length<2&&!editor.selectedContainer)return;
    if(handleMarquee(event,{...scaleMembers[0],...scaleFrame,rotation:0,flipX:false,flipY:false},corner))return;
    const tapTarget=touchHandleTarget(event,{...scaleMembers[0],...scaleFrame,rotation:0,flipX:false,flipY:false},corner)?.id;
    event.preventDefault();event.stopPropagation();cancelPointer();(event.currentTarget as HTMLElement).focus({preventScroll:true});
    if(!scaleFrame||!scaleMembers.length)return;
    const frame=scaleFrame,members=[...scaleMembers],ids=members.map(e=>e.id),layoutId=resizingLayout?.id,base={...members[0],...frame,id:'selection-resize',type:'rect' as const,rotation:0,flipX:false,flipY:false,aspectRatioLocked:!layoutId};
    gesture={id:base.id,tapTarget,layoutId,ids,x:event.clientX,y:event.clientY,dx:0,dy:0,mode:layoutId?'layout-resize':'scale',members,context:editor.selectionScope,corner,base,pointerId:event.pointerId,pointerType:event.pointerType,active:false,proportional:layoutId?event.shiftKey&&Boolean(layoutAxes?.h):resizingGroup||selectionKeepsRatio(members,event.shiftKey,Boolean(layoutSelection)),revision:editor.deck!.revision,slideId:slide.id,deckId:editor.deck!.id,altPick:false,toggleSelection:false,clientX:event.clientX,clientY:event.clientY,startPoint:canvasPoint(event.clientX,event.clientY),shift:event.shiftKey,alt:event.altKey};
    snapGuides=[];snapScene=createSnapScene(deck,sourceSlide,ids,ids,editor.selectionScope);if(snapScene)snapScene={...snapScene,moving:frame};capturePointer(event);
  }
  function startRotate(event:PointerEvent,e?:SlideElement) {
    const single=Boolean(e),members=e?[e]:scaleMembers,frame=e??scaleFrame;
    if(!interactive||original||editing||insertTool||event.button!==0||!frame||!rotationTools?.allowed(sourceSlide,members,single))return;
    if(handleMarquee(event))return;
    event.preventDefault();event.stopPropagation();cancelPointer();
    const point=canvasPoint(event.clientX,event.clientY),base=e??{...members[0],...frame,rotation:0,flipX:false,flipY:false};
    gesture={id:base.id,ids:members.map(e=>e.id),x:event.clientX,y:event.clientY,dx:0,dy:0,mode:'rotate',context:editor.selectionScope,rotation:rotationTools.begin(frame,members,point,single,rotationTools.scene(sourceSlide,members,frame,deck)),corner:'se',base,pointerId:event.pointerId,pointerType:event.pointerType,active:false,proportional:false,revision:editor.deck!.revision,slideId:slide.id,deckId:editor.deck!.id,altPick:false,toggleSelection:false,clientX:event.clientX,clientY:event.clientY,startPoint:point,shift:event.shiftKey,alt:event.altKey};
    capturePointer(event);
  }
  function move(event: PointerEvent) {
    if(pointerCapture&&capturedViewport!==pointerViewport()){cancelPointer();return;}
    if(holdPoint&&passedDragThreshold(event.clientX-holdPoint.x,event.clientY-holdPoint.y,event.pointerType))clearHold();
    if(insertTool){moveInsertion(event);return;}
    if(marquee&&event.pointerId===marquee.pointerId){
      if(!marquee.active&&!passedDragThreshold(event.clientX-marquee.client.x,event.clientY-marquee.client.y,event.pointerType))return;
      marquee={...marquee,end:canvasPoint(event.clientX,event.clientY),active:true,mode:event.altKey?'contain':'intersect',individual:event.metaKey||event.ctrlKey,additive:event.shiftKey||editor.additiveSelection};
      applyMarquee();return;
    }
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (!gesture.active && !passedDragThreshold(event.clientX - gesture.x, event.clientY - gesture.y, gesture.pointerType)) return;
    if(gesture.altPick&&!gesture.active){pendingPicker=null;if(!editor.selected.includes(gesture.id))editor.choose(gesture.id,event.shiftKey||editor.additiveSelection);if(!editor.selected.includes(gesture.id)){cancelPointer();return;}gesture={...gesture,context:editor.selectionScope,ids:selectionMembers(slide,editor.selected,false,editor.selectionScope).map(e=>e.id)};snapScene=createSnapScene(deck,slide,gesture.ids,editor.selected,gesture.context);}
    // Start the gesture and latch modifier changes synchronously. A burst of
    // steady movement needs only its newest position for the next paint.
    if(!gesture.active||gesture.shift!==event.shiftKey||gesture.alt!==event.altKey){
      pendingDrag=undefined;
      updatePreview(event.clientX,event.clientY,event.shiftKey,event.altKey);
    }else{
      pendingDrag={x:event.clientX,y:event.clientY,shift:event.shiftKey,alt:event.altKey};
    }
    if(!panFrame)panFrame=requestAnimationFrame(renderDragFrame);
  }
  function applyMarquee(){
    if(!marquee?.active||!marqueeBox)return;
    editor.selected=groupMarquee(slide,marquee.scope,marqueeBox,marquee.additive?marquee.base:[],{mode:marquee.mode,individual:marquee.individual});
    editor.individualSelection=marquee.individual||marquee.additive&&marquee.baseIndividual;
    const roots=selectionRoots(slide,editor.selected,editor.individualSelection?individualSelectionScope:marquee.scope?editingSelectionScope(marquee.scope):'');
    editor.selectedGroup=roots.length===1&&descendants(slide,roots[0]).length?roots[0]:'';
  }
  function updatePreview(clientX:number,clientY:number,shift:boolean,alt:boolean) {
    if(!gesture)return;
    editor.hovered='';
    if(gesture.mode==='rotate'&&gesture.rotation&&rotationTools){gesture={...gesture,rotation:rotationTools.update(gesture.rotation,canvasPoint(clientX,clientY),shift,{enabled:editor.snapping,alt,scale,pointerType:gesture.pointerType}),clientX,clientY,shift,alt,active:true};return;}
    const current=canvasPoint(clientX,clientY),rawX=current.x-gesture.startPoint.x,rawY=current.y-gesture.startPoint.y;
    const axis=gesture.mode==='move'&&shift?(gesture.axis??(Math.abs(rawX)>=Math.abs(rawY)?'x':'y')):undefined;
    const proportional = gesture.mode==='layout-resize'?shift&&Boolean(layoutAxes?.h):gesture.mode==='scale'?resizingGroup||selectionKeepsRatio(gesture.members!,shift,Boolean(layoutSelection)):keepsAspectRatio(gesture.base, shift);
    const g=gesture;
    const resize=g.mode==='scale'?((dx:number,dy:number)=>resizeSelectionFrame(g.base,g.members!,dx,dy,g.corner,proportional)):g.mode==='layout-resize'?((dx:number,dy:number)=>{
      const frame=resizedLayoutFrame(g.base,dx,dy,g.corner,proportional);
      const preview=resolveSlideTextSizing(layoutResizePreview(sourceSlide,g.layoutId!,frame,layoutHandleAxes(g.corner,proportional)),deck);
      return groupBox(preview,g.layoutId!)??frame;
    }):undefined;
    if(g.mode==='move'){
      canvasScene??=createCanvasMoveScene(slide,g.ids,g.context);
      // Hit testing follows the pointer, never a snapping correction or animated box.
      const dx=axis==='y'?0:rawX,dy=axis==='x'?0:rawY;
      canvasDrop=canvasScene.target({x:g.startPoint.x+dx,y:g.startPoint.y+dy},dx,dy,(g.pointerType==='touch'?10:6)/scale);
    }
    const options={scale,pointerType:g.pointerType,enabled:editor.snapping&&!alt&&!(g.mode==='move'&&canvasScene?.flowInteraction),grid:editor.snapToIncrement,constraint:axis,previous:snapGuides,resize};
    const result=snapScene ? gesture.mode==='move'?snapMove(snapScene,rawX,rawY,options):snapResize(snapScene,gesture.base,rawX,rawY,gesture.corner,proportional,options) : {dx:rawX,dy:rawY,guides:[]};
    snapGuides=result.guides;
    gesture={...gesture,dx:result.dx,dy:result.dy,axis,clientX,clientY,shift,alt,active:true,proportional};
  }

  function renderDragFrame() {
    panFrame=0;if(!gesture?.active)return;
    const sample=pendingDrag;
    pendingDrag=undefined;
    const {x,y,shift,alt}=sample??{x:gesture.clientX,y:gesture.clientY,shift:gesture.shift,alt:gesture.alt};
    const panned=panCanvas(x,y);
    if(sample||panned)updatePreview(x,y,shift,alt);
    if(panned)panFrame=requestAnimationFrame(renderDragFrame);
  }
  function panCanvas(x:number,y:number) {
    const stage=host.closest<HTMLElement>('.canvas-stage');
    if(!stage||!gesture)return false;
    const horizontal=gesture.axis!=='y'&&stage.scrollWidth-stage.clientWidth>=3;
    const vertical=gesture.axis!=='x'&&stage.scrollHeight-stage.clientHeight>=3;
    if(!horizontal&&!vertical)return false;
    const r=stage.getBoundingClientRect();
    if(x<r.left-32||x>r.right+32||y<r.top-32||y>r.bottom+32)return false;
    const velocity=(p:number,start:number,end:number)=>p<start+24?-Math.min(16,(start+24-p)*.6):p>end-24?Math.min(16,(p-end+24)*.6):0;
    const sx=horizontal?velocity(x,r.left,r.right):0,sy=vertical?velocity(y,r.top,r.bottom):0;
    if(!sx&&!sy)return false;
    const beforeX=stage.scrollLeft,beforeY=stage.scrollTop;
    if(sx)stage.scrollLeft+=sx;
    if(sy)stage.scrollTop+=sy;
    return stage.scrollLeft!==beforeX||stage.scrollTop!==beforeY;
  }
  function finish(event: PointerEvent) {
    if(pointerCapture&&capturedViewport!==pointerViewport()){cancelPointer();return;}
    clearHold();
    if(insertion){finishInsertion(event);return;}
    if(marquee&&event.pointerId===marquee.pointerId){move(event);const g=marquee;marquee=null;releasePointer();if(g&&!g.active&&g.clickId)editor.choose(g.clickId,event.shiftKey||editor.additiveSelection,event.metaKey||event.ctrlKey);return;}
    if (gesture && event.pointerId !== gesture.pointerId) return;
    if (!gesture) return;
    if(gesture.active)updatePreview(event.clientX,event.clientY,event.shiftKey,event.altKey);
    const g = gesture,scene=canvasScene,drop=canvasDrop;
    const settle=g.active&&g.mode==='move'&&scene?.flowInteraction?captureCanvasLayout(host):undefined;
    pendingDrag=undefined;gesture = null;canvasScene=null;canvasDrop=null; snapGuides=[];snapScene=null;cancelAnimationFrame(panFrame);panFrame=0;
    releasePointer();
    if (!g.active) { if(g.tapTarget){editor.choose(g.tapTarget);return;}if (g.toggleSelection) editor.choose(g.targetId??g.id, true);else if(g.mode==='move'&&g.ids.length>1&&!g.shift&&!g.altPick&&!editor.additiveSelection&&!editor.selectedContainer)editor.choose(g.targetId??g.id);return; }
    if(editor.deck?.id!==g.deckId||editor.deck.revision!==g.revision||slide.id!==g.slideId){cancelCanvasLayoutMotion(host);return;}
    if(drop?.reason){void settle?.();editor.notify(drop.reason, 'warning');return;}
    if(g.mode==='move'&&scene&&drop){const ops=scene.operations(drop,g.dx,g.dy);if(ops.length){editor.commit(ops,'','manual',g.revision);if(editor.deck.revision!==g.revision)selectMovedLayers(editor,scene.roots,drop.parent);}void settle?.();return;}
    if(g.mode==='rotate'&&g.rotation&&rotationTools){const ops=rotationTools.operations(sourceSlide,g.rotation);if(ops.length)editor.commit(ops,'','manual',g.revision);void focusCanvasSelection();return;}
    if (Math.abs(g.dx) + Math.abs(g.dy) < .001) return;
    const frame=g.mode==='layout-resize'?resizedLayoutFrame(g.base,g.dx,g.dy,g.corner,g.proportional):g.mode==='scale'?resizeSelectionFrame(g.base,g.members!,g.dx,g.dy,g.corner,g.proportional):resizeFromCorner(g.base,g.dx,g.dy,g.corner,g.proportional);
    if((['x','y','w','h'] as const).every(key=>Math.abs(frame[key]-g.base[key])<.001))return;
    const ops: Operation[] = g.mode==='layout-resize'?resizeLayout(sourceSlide,g.layoutId!,frame,layoutHandleAxes(g.corner,g.proportional)):g.mode==='scale'?scaleSelection(editor.operationDocument(),slide.id,g.ids,g.base,frame,g.context):[{op: 'update_element', slideId: slide.id, elementId: g.id, patch: frame}];
    editor.commit(ops,'','manual',g.revision);
    if (g.mode !== 'move') void focusCanvasSelection();
  }
  function saveText(event: FocusEvent, e: SlideElement) {
    if(mobileTextEditing)return;
    if (editing !== e.id) return;
    if (event.relatedTarget instanceof Element && event.relatedTarget.closest('[data-text-formatting],.selection-context,.ui-context-menu')) return;
    finishTextEditing();
    if (!event.relatedTarget) void tick().then(() => { if (document.hasFocus() && document.activeElement === document.body) void focusCanvasSelection(); });
  }
  let textFontRequest = 0;
  let loadingTextId = $state('');
  let preparedText:{deck:string;revision:number;id:string}|undefined;
  $effect(()=>{const id=editing;if(!id||bodyEditor?.dom.isConnected&&bodyEditor.element().id===id||preparedText&&preparedText.deck===editor.deck?.id&&preparedText.revision===editor.deck?.revision&&preparedText.id===id)return;const target=sourceSlide.elements.find(e=>e.id===id);if(target)untrack(()=>{editor.editingId='';void edit(target);});});
  let readyTextFonts = $state(new Map<string,string>());
  $effect(() => {
    if (!interactive || original || !editor.deck) return;
    const document=editor.deck,elements=sourceSlide.elements;
    let active=true;
    void import('../core/text-editing-fonts').then(({prepareNativeTextFonts})=>prepareNativeTextFonts(elements,document,(id,fingerprint)=>{if(active)readyTextFonts=new Map(readyTextFonts).set(id,fingerprint);})).catch(()=>{});
    return ()=>{active=false;};
  });
  $effect(() => {
    if (loadingTextId && (editor.selected.length !== 1 || editor.selected[0] !== loadingTextId)) {textFontRequest++; loadingTextId = '';}
  });
  async function edit(e: SlideElement) {
    if (!interactive || original || e.locked || !canEditText(e)) return;
    const document = editor.deck!, slideId = sourceSlide.id, request = ++textFontRequest;
    editor.choose(e.id,false,true); editor.additiveSelection=false;
    loadingTextId = e.id;
    try {
      const {prepareTextEditingFonts} = await import('../core/text-editing-fonts');
      await Promise.all([prepareTextEditingFonts(isTextShape(e) ? shapeTextElement(e) : e, document),loadRichText()]);
      if (request !== textFontRequest || editor.deck?.id !== document.id || editor.deck.revision !== document.revision || sourceSlide.id !== slideId || editor.selected.length !== 1 || editor.selected[0] !== e.id || !interactive || original) return;
      const native=nativeTextSpans(e);if(native)readyTextFonts=new Map(readyTextFonts).set(e.id,native.fingerprint);
      mobileTextEditing=canEditText(e)&&matchMedia('(max-width:760px), (pointer:coarse)').matches;
      preparedText={deck:document.id,revision:document.revision,id:e.id};editor.editingId=e.id;
    } catch(error) {
      if (request === textFontRequest && editor.deck?.id === document.id && editor.deck.revision === document.revision && editor.selected[0] === e.id) editor.notify((error as Error).message.startsWith('Text editing tools')?(error as Error).message:'The original font is unavailable. Import the font file or choose a font from the font library.', 'warning');
    } finally {
      if (request === textFontRequest) loadingTextId = '';
    }
  }
  function editableText() { return host?.querySelector<HTMLElement>('[contenteditable="true"]'); }
  export function getTextFormatState(): TextFormatState | null {return bodyEditor?.formatState()??null;}
  export async function formatText(patch:TextFormatPatch,range?:TextRange){await bodyEditor?.format(patch,range);}
  function keepArtworkStill() {
    void tick().then(() => {
      if (!host) return;
      host.scrollLeft = 0; host.scrollTop = 0;
      const render = host.querySelector<HTMLElement>('.slide-render');
      if (render) { render.scrollLeft = 0; render.scrollTop = 0; }
    });
  }
  function updateLiveTextLayout(current: SlideElement) {
    const owner=sourceSlide.elements.find(e=>e.id===current.id);
    if(owner?.type==='line'){const label=lineLabelElement({...owner,...shapeTextPatch(owner,current)});lineLabelSize={id:owner.id,w:label.w,h:label.h};return;}
    if (isTextShape(sourceSlide.elements.find(e => e.id === current.id))) return;
    let size = browserTextSize(current, deck); if (!size) return;
    const base = sourceSlide.elements.find(e => e.id === current.id) ?? current;
    // Keep automatically sized text that was inside the page visible while editing.
    // Deliberately off-page and fixed-size authored boxes retain their geometry.
    const inside = base.x >= 0 && base.y >= 0 && base.x + base.w <= deck.width + .01 && base.y + base.h <= deck.height + .01;
    if (inside && base.textSizing !== 'fixed'&&!ancestorIds(sourceSlide,base.id).some(id=>sourceSlide.autoLayouts?.some(l=>l.id===id))) {
      if (current.textSizing === 'auto-width' && size.w > deck.width) {
        current = {...current, w: deck.width, textSizing: 'auto-height'};
        size = browserTextSize(current, deck) ?? size;
      }
      liveTextSize = {id: current.id, ...fitTextInsertion(deck, {...base, textSizing: current.textSizing}, size)};
    } else liveTextSize = {id: current.id, ...size};
    keepArtworkStill();
  }
  function clearTextEditing(){editor.editingId='';mobileTextEditing=false;liveTextSize=null;lineLabelSize=null;formattedText=null;}
  export function finishTextEditing(cancel = false) {
    if (!editing) return;
    if(cancel){clearTextEditing();return;}
    if(!cancel&&bodyEditor?.composing()){editor.notify('Finish composing text before saving.','warning');return;}
    if(!cancel&&bodyEditor&&!bodyEditor.current()){editor.notify('The document changed. Copy this text, then reopen it before saving.','warning');return;}
    const base=sourceSlide.elements.find(e=>e.id===editing);if(!base||!bodyEditor)return;
    updateLiveTextLayout(bodyEditor.element());const patch=bodyEditor.patch(base,liveTextSize);
    if(patch){const revision=editor.deck!.revision;editor.commit([{op:'update_element',slideId:sourceSlide.id,elementId:base.id,patch}]);if(editor.deck!.revision===revision){bodyEditor.focus();return;}}
    clearTextEditing();
  }
  function elementKey(event: KeyboardEvent, e: SlideElement) {
    if (!interactive || event.target !== event.currentTarget || editing || event.isComposing || event.keyCode===229) return;
    if (event.altKey || event.metaKey || event.ctrlKey || event.repeat) return;
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'F2') {
      event.preventDefault(); event.stopPropagation();
      if(event.key==='Enter'&&event.shiftKey){editor.selectParent();void focusCanvasSelection();return;}
      if(event.key==='Enter'&&editor.selectedContainer){editor.enterGroup();editor.selectAll();void focusCanvasSelection();return;}
      if((event.key==='F2'||event.key==='Enter')&&!e.locked&&e.type==='table'){openCell(e.id,0,0);return;}
      if((event.key==='F2'||event.key==='Enter')&&!e.locked&&e.type==='chart'){openChartPoint(e.id);return;}
      if (event.key === 'F2' || (event.key === 'Enter' && !event.shiftKey && editor.selected.length === 1 && editor.selected[0] === e.id)) edit(e);
      else editor.choose(e.id, event.shiftKey||editor.additiveSelection);
    }
  }
  $effect(() => {
    const id = editing;
    MobileTextEditor;
    if(mobileTextEditing&&!MobileTextEditor)return;
    if (!id || !host) return;
    void tick().then(() => {
      if (editing !== id) return;
      const target = editableText();
      if (target) { target.focus({preventScroll: true}); const range = document.createRange(); range.selectNodeContents(target); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); }
    });
  });
  function canvasPoint(x:number,y:number):Point{const r=host.getBoundingClientRect();return {x:(x-r.left)/scale,y:(y-r.top)/scale};}
  function startMarquee(event:PointerEvent){
    if(!interactive||original||event.button!==0||event.target!==event.currentTarget)return;
    beginMarquee(event);
  }
  export function beginMarquee(event:PointerEvent){
    if(!interactive||original||event.button!==0)return;
    if(editing)finishTextEditing();else if(textDraft)finishTextDraft();
    const base=[...editor.selected],baseGroup=editor.selectedGroup,baseScope=editor.editingGroup,baseIndividual=editor.individualSelection,additive=event.shiftKey||editor.additiveSelection;
    const point=canvasPoint(event.clientX,event.clientY),b=baseScope?groupBox(slide,baseScope):null;
    if(b&&(point.x<b.x||point.y<b.y||point.x>b.x+b.w||point.y>b.y+b.h))editor.editingGroupId='';
    if(!additive){editor.selected=[];editor.selectedGroup='';editor.individualSelection=false;}
    editor.hovered='';host.closest<HTMLElement>('.canvas-stage')?.focus({preventScroll:true});
    if(event.pointerType==='touch')return;
    event.preventDefault();
    marquee={pointerId:event.pointerId,client:{x:event.clientX,y:event.clientY},start:point,end:point,base,baseGroup,baseScope,baseIndividual,scope:editor.editingGroup,individual:event.metaKey||event.ctrlKey,mode:event.altKey?'contain':'intersect',additive,active:false,external:!host.contains(event.currentTarget as Node),revision:editor.deck!.revision,slideId:slide.id,deckId:editor.deck!.id};
    capturePointer(event);
  }
  export function cancelPointer(event?:Event){
    drawing?.cancel();
    const heldPoint=event instanceof PointerEvent&&event.type==='pointercancel'&&event.pointerType==='touch'?pendingPicker:null;
    clearHold();
    if(interactive&&!original)editor.hovered='';
    insertion=null;
    if(marquee&&editor.deck?.id===marquee.deckId&&editor.deck.revision===marquee.revision&&editor.activeId===marquee.slideId&&editor.editingGroup===marquee.scope){editor.selected=marquee.base;editor.selectedGroup=marquee.baseGroup;editor.editingGroupId=marquee.baseScope;editor.individualSelection=marquee.baseIndividual;}
    pendingDrag=undefined;gesture=null;canvasScene=null;canvasDrop=null;marquee=null;snapGuides=[];snapScene=null;cancelAnimationFrame(panFrame);panFrame=0;
    releasePointer();
    pendingPicker=null;clearTimeout(pickerTimer);
    if(heldPoint){pendingPicker=heldPoint;deferredPicker();}
  }
  function deferredPicker(){
    clearHold();
    if(!pendingPicker)return;
    const point=pendingPicker;pendingPicker=null;
    pickerTimer=setTimeout(()=>void openPicker(point.x,point.y),0);
  }
  async function openPicker(x:number,y:number){
    if(!interactive||original)return;
    cancelPointer();stack=hitElements(slide.elements,canvasPoint(x,y),6/scale);if(!stack.length)return;
    pickerOrigin=document.activeElement as HTMLElement|null;
    pickerAnchor={x,y};pickerX=x;pickerY=y;
    await tick();if(!picker?.isConnected)return;picker.showPopover();await tick();
    positionPicker();
    picker.querySelector<HTMLElement>('button')?.focus({preventScroll:true});
  }
  function positionPicker(){if(picker?.matches(':popover-open'))positionFloating(picker,new DOMRect(pickerAnchor.x,pickerAnchor.y,0,0));}
  async function pickerForElement(e:SlideElement){const r=host.getBoundingClientRect();await openPicker(r.left+(e.x+e.w/2)*scale,r.top+(e.y+e.h/2)*scale);}
  async function pickLayer(e:SlideElement){picker?.hidePopover();editor.choose(e.id,editor.additiveSelection,true);await tick();host.querySelector<HTMLElement>(`[data-element-id="${e.id}"]`)?.focus({preventScroll:true});}
  function pickerKey(event:KeyboardEvent){
    if(!picker||event.defaultPrevented||event.isComposing||event.keyCode===229||event.altKey||event.metaKey||event.ctrlKey)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();picker.hidePopover();restoreFocus(pickerOrigin);return;}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();event.stopPropagation();const buttons=[...picker.querySelectorAll<HTMLButtonElement>('button')];const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();
    }
  }
  $effect(()=>{const id=editor.layerPickerId;if(interactive&&id){editor.layerPickerId='';const e=slide.elements.find(e=>e.id===id);if(e)void pickerForElement(e);}});
  $effect(() => { if (!interactive || original || gesture&&(gesture.deckId!==editor.deck?.id||gesture.context!==editor.selectionScope) || marquee&&(marquee.deckId!==editor.deck?.id||marquee.scope!==editor.editingGroup) || [gesture, marquee, insertion].some(g => g && (g.slideId !== slide.id || g.revision !== editor.deck?.revision))) { cancelPointer(); } });
  function cancelGesture(event: KeyboardEvent) {
    if (!interactive || original || event.isComposing || event.keyCode === 229 || event.defaultPrevented) return;
    if (loadingTextId && event.key === 'Escape') {textFontRequest++; loadingTextId = '';}
    individualPointer=event.metaKey||event.ctrlKey;
    if(hoveredObject&&!gesture&&!marquee&&!editing&&!insertTool)previewHover(hoveredObject);
    if(insertTool){
      const target=event.target as HTMLElement;
      if (target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])') || document.querySelector('dialog:modal,[popover]:popover-open:not([role="tooltip"])')) return;
      if(event.key==='Escape'&&event.type==='keydown'){event.preventDefault();event.stopPropagation();cancelPointer();oninsertcancel?.();void focusCanvasSelection();return;}
      if (insertTool === 'draw') return;
      if (insertion && event.key === 'Shift') insertion = {...insertion, constrained: event.shiftKey};
      if(target.closest('.canvas-stage')&&!target.closest('button,a')&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&event.type==='keydown'){
        if(event.key==='Enter') {event.preventDefault();event.stopPropagation();if(event.repeat)return;if(!insertPoint){insertPoint={x:96*deck.width/1440,y:96*deck.height/810};return;}completeInsertion(insertTool,insertionGeometry(insertTool,deck,insertPoint,undefined,false,insertBlock ?? insertImage ?? undefined,lineState.style),editor.deck!.revision,slide.id);return;}
        if(event.key.startsWith('Arrow')){event.preventDefault();event.stopPropagation();const p=insertPoint??{x:96*deck.width/1440,y:96*deck.height/810},step=event.shiftKey?10:1;insertPoint={x:Math.max(0,Math.min(deck.width-1,p.x+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0))),y:Math.max(0,Math.min(deck.height-1,p.y+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0)))};return;}
      }
    }
    if((gesture||marquee)&&!event.isComposing){
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancelPointer();}
      else if(marquee&&['Alt','Shift','Meta','Control'].includes(event.key)){marquee={...marquee,mode:event.altKey?'contain':'intersect',individual:event.metaKey||event.ctrlKey,additive:event.shiftKey||editor.additiveSelection};applyMarquee();}
      else if(event.metaKey||event.ctrlKey)cancelPointer();
      else if(gesture?.active&&(event.key==='Alt'||event.key==='Shift')){
        const point=pendingDrag;
        pendingDrag=undefined;
        updatePreview(point?.x??gesture.clientX,point?.y??gesture.clientY,event.shiftKey,event.altKey);
      }
      else if(event.key.startsWith('Arrow')){event.preventDefault();event.stopPropagation();}
    }
  }
  onMount(() => {
    // text-layout owns cache invalidation; canvases only repaint after fonts load.
    const releaseFonts = observeFontLoading(document.fonts, () => {fontEpoch++; if(textDraft)void tick().then(updateDraftLayout);});
    // The workspace owns its fitted width. Thumbnails can wait for the
    // observer before painting. Modal, playback and print callers keep their
    // first synchronous measurement.
    if (layoutWidth !== undefined) return releaseFonts;
    if (!thumbnail) measuredWidth = host.getBoundingClientRect().width;
    const releaseWidth = observeCanvasWidth(host, width => { if (width > 0) measuredWidth = width; });
    return () => { releaseFonts(); releaseWidth(); };
  });
  // Preview canvases own rendering, not global editor interaction listeners.
  $effect(() => {
    if (!interactive || original) return;
    return untrack(installInteractionListeners);
  });
  function installInteractionListeners() {
    const stopLayoutMotion=()=>cancelCanvasLayoutMotion(host);
    host.addEventListener('pointerdown',stopLayoutMotion,true);
    window.addEventListener('keydown',stopLayoutMotion,true);
    window.addEventListener('resize',stopLayoutMotion);
    window.addEventListener('keydown', cancelGesture, true);
    window.addEventListener('keyup', cancelGesture, true);
    window.addEventListener('resize', cancelPointer);
    window.addEventListener('blur',cancelPointer);
    const additionalPointer=(event:PointerEvent)=>{if(pointerCapture&&event.pointerId!==pointerCapture.id){event.preventDefault();event.stopPropagation();cancelPointer();}};
    document.addEventListener('pointerdown',additionalPointer,true);window.visualViewport?.addEventListener('resize',cancelPointer);
    const resetIndividual=()=>{individualPointer=false;leaveCanvas();};window.addEventListener('blur',resetIndividual);
    window.addEventListener('resize',positionPicker);window.visualViewport?.addEventListener('resize',positionPicker);window.visualViewport?.addEventListener('scroll',positionPicker);
    window.addEventListener('pointerup',deferredPicker,true);
    const outsideMove=(event:PointerEvent)=>{if(marquee?.external)move(event);};
    const outsideFinish=(event:PointerEvent)=>{if(marquee?.external)finish(event);};
    const outsideLoss=(event:PointerEvent)=>{if(marquee?.external&&marquee.pointerId===event.pointerId)cancelPointer();};
    window.addEventListener('pointermove',outsideMove,true);window.addEventListener('pointerup',outsideFinish,true);window.addEventListener('lostpointercapture',outsideLoss,true);
    const visibility=()=>{if(document.visibilityState==='hidden')cancelPointer();};document.addEventListener('visibilitychange',visibility);
    const scrollHost=host.closest<HTMLElement>('.canvas-stage');
    const scrollDrag=()=>{
      if(gesture?.active){
        pendingDrag??={x:gesture.clientX,y:gesture.clientY,shift:gesture.shift,alt:gesture.alt};
        if(!panFrame)panFrame=requestAnimationFrame(renderDragFrame);
      }
    };
    scrollHost?.addEventListener('scroll',scrollDrag);
    return () => { document.removeEventListener('pointerdown',additionalPointer,true);window.visualViewport?.removeEventListener('resize',cancelPointer);stopLayoutMotion();host.removeEventListener('pointerdown',stopLayoutMotion,true);window.removeEventListener('keydown',stopLayoutMotion,true);window.removeEventListener('resize',stopLayoutMotion);scrollHost?.removeEventListener('scroll',scrollDrag); cancelAnimationFrame(panFrame);clearTimeout(pickerTimer);clearHold(); window.removeEventListener('keydown', cancelGesture, true);
      window.removeEventListener('keyup', cancelGesture, true);
      window.removeEventListener('resize', cancelPointer);window.removeEventListener('blur',cancelPointer);window.removeEventListener('blur',resetIndividual);window.removeEventListener('resize',positionPicker);window.visualViewport?.removeEventListener('resize',positionPicker);window.visualViewport?.removeEventListener('scroll',positionPicker);window.removeEventListener('pointerup',deferredPicker,true);window.removeEventListener('pointermove',outsideMove,true);window.removeEventListener('pointerup',outsideFinish,true);window.removeEventListener('lostpointercapture',outsideLoss,true);document.removeEventListener('visibilitychange',visibility); };
  }
  $effect(() => {
    if (!interactive || original) return;
    const leave = (event: FocusEvent) => {
      if (!interactive || original || mobileTextEditing || !(event.target instanceof Element)) return;
      const root = editableText();
      if (!root || root.contains(event.target) || event.target.closest('[data-text-formatting],.selection-context,.ui-context-menu')) return;
      if (editing) finishTextEditing(); else if (textDraft) finishTextDraft();
    };
    document.addEventListener('focusin', leave);
    return () => document.removeEventListener('focusin', leave);
  });
</script>
{#snippet elementText(e: SlideElement, shape = false, mobile = false)}
            <!-- The editable canvas uses the same font/run flow before, during
                 and after editing. Source glyphs remain in previews/exports. -->
            {@const sourceText=nativeTextSpans(e)}
            {@const editableFlow=interactive&&!original&&!e.locked&&canEditText(e)&&(!sourceText||readyTextFonts.get(e.id)===sourceText.fingerprint)}
            {@const rendered=mobile?mobileTextPresentation(e):editableFlow?e:renderedNativeText(e)}
            {@const native=editableFlow?undefined:nativeTextSpans(e)}
            {#key editing === e.id}
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_no_noninteractive_tabindex -->
            <div class="text-content" class:shape-text={shape} style={visual(rendered) + textBoxStyle(liveTextSize?.id === e.id && liveTextSize.textSizing ? {...rendered, textSizing: liveTextSize.textSizing} : rendered)+(editing===e.id?'overflow:auto;justify-content:safe '+(rendered.verticalAlign==='middle'?'center':rendered.verticalAlign==='bottom'?'flex-end':'flex-start')+';':'')} onkeydown={event => { if (editing) textKey(event); }}>
              {#if editing===e.id&&RichTextEditor&&(mobile===mobileTextEditing)}
                <RichTextEditor element={e} scale={mobile?rendered.fontSize/e.fontSize:1} {mobile} current={()=>editing===e.id} onchange={bodyChanged} onready={setBodyEditor} onblur={event=>saveText(event,e)} onerror={()=>{finishTextEditing(true);void focusCanvasSelection();}}/>
              {:else}
              {#if native}<svg class="native-text-spans" width={e.w} height={e.h} viewBox={`0 0 ${e.w} ${e.h}`} aria-hidden="true" style={`position:absolute;inset:0;width:${e.w}px;height:${e.h}px;overflow:visible`}>{#if native.outline}<image href={native.outline.src} x={native.outline.x} y={native.outline.y} width={native.outline.w} height={native.outline.h} transform={native.outline.transform?`matrix(${native.outline.transform.join(" ")})`:undefined}/>{:else}{#each native.spans??[] as span}<text x={span.x} y={span.y} fill={span.color??e.fill} style={`${runStyle(span,e)}white-space:pre;`}>{span.text}</text>{/each}{/if}</svg><span class="sr-only">{e.text}</span>{:else}<div class="text-flow" style={textFlowStyle(editing===e.id?{...rendered,maxLines:undefined}:rendered)}>{#if rendered.paragraphs?.length}{#each rendered.paragraphs as p}<div class="text-paragraph" data-bullet={p.bullet || undefined} style={paragraphStyle(p, rendered)}>{#each p.runs as run}<span style={runStyle(run,rendered)}>{run.text}</span>{/each}</div>{/each}{:else if rendered.runs?.length}{#each rendered.runs as run}<span style={runStyle(run,rendered)}>{run.text}</span>{/each}{:else}<span style={runStyle({text:rendered.text},rendered)}>{rendered.text}</span>{/if}</div>{/if}
              {/if}
            </div>
            {/key}
{/snippet}


<div class="canvas-wrap" class:editable-wrap={interactive&&!original} bind:this={host} style:aspect-ratio="{deck.width} / {deck.height}" style:visibility={thumbnail && measuredWidth === undefined ? 'hidden' : undefined}>
  {#if mobileTextEditing&&editing&&MobileTextEditor}{@const raw=slide.elements.find(e=>e.id===editing)}{#if raw}{@const text=isTextShape(raw)?shapeTextElement(raw):raw}<MobileTextEditor fontSize={text.fontSize} readInline={getTextFormatState} onformat={formatText} oncommit={()=>{finishTextEditing();void focusCanvasSelection();}} onclose={()=>{finishTextEditing(true);void focusCanvasSelection();}}>{@render elementText(text,isTextShape(raw),true)}</MobileTextEditor>{/if}{/if}
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_no_noninteractive_tabindex -->
  <div class="slide-render" class:editable={interactive && !original} class:gesturing={gesture?.active||marquee?.active} style:--canvas-scale={scale} style:width={fmt(deck.width)} style:height={fmt(deck.height)} style:transform="scale({scale})" style:background={pageBackground(slide.background)} role={interactive?'group':undefined} aria-label={interactive?'Editable slide':undefined}
    onpointerdown={startMarquee} onpointermove={move} onpointerup={finish} onpointercancel={cancelPointer} onlostpointercapture={event=>{if(pointerCapture?.target===event.target&&pointerCapture.id===event.pointerId)cancelPointer();}}
    data-slide-id={slide.id} data-view={original ? 'source' : 'editable'}>
    {#if original && slide.source?.render}
      <ResourceImage class="source-render" src={slide.source.render} {thumbnail} alt="Slide source reference" draggable="false" />
    {:else}
      {#if interactive&&!original&&!editing&&!insertTool}
        {#await containersView then Containers}{#if Containers}<Containers.default mode="hit" {slide} page={deck} selected={selectionUnits} onhover={hoverCanvas} onleave={leaveCanvas} onstart={startContainer}/>{/if}{/await}
      {/if}
      {#each slide.elements.filter(e => !e.hidden) as e (e.id)}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_static_element_interactions -->
        <div class="slide-element" class:is-erasing={erasingIds.includes(e.id)} class:decorative-pattern={e.designPattern} class:block-sizing-frame={sizingFrames.has(e.id)} class:shape-frame={interactive&&!original&&(['line','ellipse','diamond'].includes(e.type)||Boolean(e.shape))} class:is-selected={interactive && selectedIds.has(e.id)} class:is-hovered={interactive && editor.hovered === e.id} class:is-locked={e.locked} class:is-movable={movableIds.has(e.id)} class:is-dragging={gesture?.active && gestureIds.has(e.id)} class:text-element={e.type === 'text'} class:editing={editing === e.id}
          style={position(e)} style:mix-blend-mode={e.blendMode??'normal'} data-element-id={e.id} data-element-type={e.type} aria-busy={loadingTextId===e.id?true:undefined} aria-hidden={e.designPattern||sizingFrames.has(e.id)?true:undefined} tabindex={interactive&&!e.designPattern&&!sizingFrames.has(e.id) ? 0 : undefined}
          role={interactive&&!e.designPattern&&!sizingFrames.has(e.id) ? editing===e.id?'group':'button' : undefined} aria-label={interactive&&!e.designPattern ? `${e.name}${e.locked ? ' · Locked' : ''}` : undefined} aria-pressed={interactive&&!e.designPattern&&editing!==e.id ? selectedIds.has(e.id) : undefined}
          onkeydown={(ev) => elementKey(ev, e)}
          onpointerenter={ev=>hoverCanvas(ev,e.id)} onpointermove={ev=>hoverCanvas(ev,e.id)} onpointerleave={()=>leaveCanvas(e.id)}
          onfocus={(ev) => { if (interactive && ev.target === ev.currentTarget && !editing && ev.currentTarget.matches(':focus-visible')) editor.hovered = ''; }} onblur={(ev) => { if (interactive && ev.target === ev.currentTarget && editor.hovered === e.id) editor.hovered = ''; }}
          onpointerdown={(event) => {const cell=e.type==='table'?(event.target as Element).closest<HTMLElement>('[data-table-row]'):null;tablePointerCell=cell?{id:e.id,row:Number(cell.dataset.tableRow),column:Number(cell.dataset.tableColumn)}:null;start(event,e);}}
          ondblclick={(event) => { if(!interactive||original||e.designPattern)return;event.stopPropagation();if(editor.drillInto(e.id))return;if(canEditText(e))edit(e);else {editor.choose(e.id,false,true);if(!e.locked&&e.type==='table'){const cell=(event.target as Element).closest<HTMLElement>('[data-table-row]');const hit=tablePointerCell?.id===e.id?tablePointerCell:null;openCell(e.id,Number(cell?.dataset.tableRow??hit?.row??0),Number(cell?.dataset.tableColumn??hit?.column??0));}else if(!e.locked&&e.type==='chart')openChartPoint(e.id);else if(!e.locked&&e.type==='image'&&!e.sourceRegion&&!isDrawingElement(e))editor.croppingId=e.id;} }}>
          <div class="element-motion" use:lazyElementPlayback={{slide,elementId:e.id,animation:e.animation,enabled:playback,step,replay,reduced,paused,entering,restored,shared:sharedIds.includes(e.id)}}>
          <div class="element-visual" style:visibility={interactive&&editor.croppingId===e.id?'hidden':undefined} style:opacity={e.opacity} style:filter={shadowFilter(e)}>
          {#if e.type === 'prototype' && e.prototype}
            <AsyncFeature feature="prototype-embed" props={{prototype:e.prototype,label:e.name,live:playback,focusable:playback,clientId,oninteractionchange:onprototypeinteraction?(active:boolean)=>onprototypeinteraction(`${sourceSlide.id}:${e.id}`,active):undefined,onfocus:onprototype&&!playback?()=>onprototype(e):undefined}} />
          {:else if e.type === 'text'}
            {@render elementText(e)}
            {#if playback&&textLinkUrl(e.link)}<a href={textLinkUrl(e.link)} target="_blank" rel="noopener noreferrer" aria-label={e.text||e.name} style="position:absolute;inset:0;display:block"></a>{/if}
          {:else if e.type === 'image'}
            <div class="image-clip" style:border-radius={fmt(e.radius)}>{#if e.sourceRegion && !slide.source?.render && !e.src}<div class="source-object-placeholder">Attach a source PDF to display this shape</div>{:else}<AsyncFeature feature="framed-image" props={{thumbnail,image:e.sourceRegion&&slide.source?.render?{...e,crop:e.sourceRegion}:e,src:e.sourceRegion&&slide.source?.render?slide.source.render:renderedImage(e)}}/>{/if}</div>
          {:else if e.type === 'diamond' || e.type === 'rect' && e.shape}
            <svg class="shape-svg" viewBox="0 0 {e.w} {e.h}" aria-hidden="true"><path style:pointer-events={e.designPattern?'none':'auto'} d={shapePath(e)} fill={e.fill} stroke={e.stroke} stroke-width={e.strokeWidth} /></svg>
          {:else if e.type === 'line'}
            <svg class="shape-svg" viewBox="0 0 {e.w} {e.h}" aria-hidden="true">{@html lineMarkup(e)}</svg>
          {:else if e.type === 'rect' || e.type === 'ellipse'}
            <div class="shape-content" style:pointer-events={e.designPattern||sizingFrames.has(e.id)?'none':'auto'} style:background={e.fill} style:border="{e.strokeWidth}px solid {e.stroke}" style:border-radius={e.type === 'ellipse' ? '50%' : fmt(e.radius)}></div>
          {:else if e.type === 'table'}
            {#if TableGrid&&interactive&&!original&&!e.locked&&!e.designPattern&&selectedLeaves.has(e.id)&&editor.selected.length===1&&!editor.selectedContainer&&!gesture}
              <TableGrid element={tableDraft(e)} system={deck.designSystem} {scale} style={visual(e)} activeCell={cellEditor?.id===e.id?{row:cellPreview?.row??cellEditor.row,column:cellPreview?.column??cellEditor.column}:undefined} oncell={(row,column,initialValue)=>openCell(e.id,row,column,initialValue)} onselection={oncellselection} onrange={(range,moving,resizing)=>tableInteraction={id:e.id,range,moving,resizing}} onmove={event=>start(event,e,'move','se','',host?.querySelector<HTMLElement>(`[data-element-id="${e.id}"]`)??undefined)}/>
            {:else}<AsyncFeature feature="table-visual" props={{onlineFonts:deck.onlineFonts,element:tableDraft(e),system:deck.designSystem,style:visual(e),editable:interactive&&!original&&!e.locked&&selectedIds.has(e.id),activeCell:cellEditor?.id===e.id?{row:cellPreview?.row??cellEditor.row,column:cellPreview?.column??cellEditor.column}:undefined,oncell:(row:number,column:number)=>openCell(e.id,row,column)}}/>{/if}
          {:else if e.type === 'chart'}
            <ChartVisual background={slide.background} onlineFonts={deck.onlineFonts} element={chartDraft(e)} fonts={deck.fonts} editable={interactive&&!original&&!e.locked&&!e.designPattern&&selectedLeaves.has(e.id)&&editor.selected.length===1&&!editor.selectedContainer&&!gesture} activePoint={chartActivePoint?.id===e.id?chartActivePoint:undefined} onpoint={(series,category)=>openChartPoint(e.id,series,category)} ontext={target=>openChartText(e.id,target)}/>
          {/if}
          {#if e.type==='line' && (e.text || editing===e.id)}
            {@const label=canvasLineLabel(e)}
            <div class="line-label" style={lineLabelStyle(e,lineLabelSize?.id===e.id?{...label,...lineLabelSize}:label)} style:background={pageBackground(slide.background)}>{@render elementText(label)}</div>
          {:else if isTextShape(e) && (e.text || editing === e.id)}{@render elementText(shapeTextElement(e), true)}{/if}
          </div>
          </div>
          {#if ChartPointInteraction&&interactive&&!original&&!e.locked&&!e.designPattern&&e.type==='chart'&&selectedLeaves.has(e.id)&&editor.selected.length===1&&!editor.selectedContainer&&!gesture&&!editing}<ChartPointInteraction element={e} {scale} onselection={oncellselection} disabled={Boolean(chartValueId||chartTextEditor)} onpreview={chart=>chartValuePreview=chart?{id:e.id,chart}:null}/>{/if}
          {#if TableColumnHandles&&interactive&&!original&&!e.locked&&!e.designPattern&&e.type==='table'&&selectedLeaves.has(e.id)&&editor.selected.length===1&&!editor.selectedContainer&&!cellEditor&&!gesture&&!editing&&!(tableInteraction?.id===e.id&&(tableInteraction.moving||tableInteraction.resizing))}<TableColumnHandles range={tableInteraction?.id===e.id?tableInteraction.range:undefined} element={e} {scale} system={deck.designSystem} onpreview={style=>columnPreview=style?{id:e.id,style}:null}/>{/if}
          {#if interactive&&!e.designPattern&&e.type==='line'}<svg class="line-hit" viewBox="0 0 {e.w} {e.h}" aria-hidden="true"><path d={lineGeometry(e).path} fill="none" stroke="transparent" stroke-width={Math.max(e.strokeWidth||2,16/scale)} style:pointer-events="stroke" /></svg>{/if}
        </div>
      {/each}
      {#if marquee?.active&&marqueeBox}<div class="marquee" style:left={fmt(marqueeBox.x)} style:top={fmt(marqueeBox.y)} style:width={fmt(marqueeBox.w)} style:height={fmt(marqueeBox.h)}></div>{/if}
      {#if CanvasLayoutGuides&&interactive&&!original&&!editing}<CanvasLayoutGuides page={deck} {slide} {scale} guides={displayGuides} moving={previewBounds} showLayout={editor.layoutGuides} readout={transformReadout} />{/if}
      {#if RotationGuides&&gesture?.active&&gesture.mode==='rotate'&&gesture.rotation}<RotationGuides page={deck} {slide} {scale} gesture={gesture.rotation} moving={previewBounds} free={gesture.alt}/>{/if}
      {#if interactive&&!original&&insertTool}

  <!-- svelte-ignore a11y_no_static_element_interactions -->
        {#if insertTool === 'draw'}
          {#if CanvasDrawing}<CanvasDrawing bind:this={drawing} width={deck.width} height={deck.height} revision={editor.deck?.revision ?? 0} slideId={slide.id} elements={slide.elements} settings={drawingState.settings} onerasepreview={ids => erasingIds=ids} onerase={(ids,revision,slideId)=>{if(interactive && !original && insertTool === 'draw' && editor.deck?.revision === revision && editor.activeId === slideId)editor.commit(ids.map(elementId=>({op:'delete_element' as const,slideId,elementId})), '', 'manual', revision);}} oncomplete={(element, revision, slideId) => {if(interactive && !original && insertTool === 'draw' && editor.deck?.revision === revision && editor.activeId === slideId){editor.add(element, revision);editor.selected=[];}}}/>{/if}
        {:else}
        <div class="insertion-surface" class:inserting-text={insertTool==='text'} aria-hidden="true" onpointerdown={beginInsertion} onpointerleave={()=>{if(!insertion)insertPoint=null;}}></div>
        {/if}
        {#if insertPreview}
          <div class="insertion-preview" class:ellipse-preview={insertTool==='ellipse'} class:line-preview={insertTool==='line'} class:shape-preview={isShapeTool(insertTool)&&!['rect','ellipse','line'].includes(insertTool)} class:image-preview={insertTool==='image'||insertTool==='block'} class:region-preview={isRegionFill(insertImage)} class:text-preview={insertTool==='text'&&!insertion?.active} style:left={fmt(insertPreview.x)} style:top={fmt(insertPreview.y)} style:width={fmt(insertPreview.w)} style:height={fmt(insertPreview.h)}>
            {#if insertTool==='block' && insertBlock}<DeckBlockPreview block={insertBlock}/>{/if}
            {#if insertTool==='image' && insertImage}<img src={renderedImage({...insertImage,...insertPreview})} alt="" draggable="false" />{/if}
            {#if insertTool==='line'}<svg viewBox="0 0 {insertPreview.w} {insertPreview.h}" preserveAspectRatio="none" style:transform={`scale(${insertPreview.flipX?-1:1},${insertPreview.flipY?-1:1})`} aria-hidden="true">{@html lineMarkup({...insertPreview,line:lineState.style,strokeWidth:3},'currentColor')}</svg>{/if}
            {#if isShapeTool(insertTool)&&!['rect','ellipse','line'].includes(insertTool)}<svg viewBox="0 0 {insertPreview.w} {insertPreview.h}" aria-hidden="true"><path d={shapePreview(insertTool,insertPreview,Math.min(deck.width/1440,deck.height/810))}/></svg>{/if}
          </div>
          <div class="insertion-size" style:left={fmt(Math.max(0, Math.min(insertPreview.x, deck.width - 150 / scale)))} style:top={fmt(insertPreview.y + insertPreview.h + previewLabelHeight / scale <= deck.height ? insertPreview.y + insertPreview.h + 6 / scale : Math.max(0, insertPreview.y - previewLabelHeight / scale))} aria-hidden="true">
            <span>{insertTool === 'text' && !insertion?.active ? 'Auto width' : insertTool === 'line' ? `${Math.round(Math.hypot(insertPreview.w, insertPreview.h))} px long` : `${Math.round(insertPreview.w)} × ${Math.round(insertPreview.h)} px`}</span>
            {#if adjustedClick}<small>Kept inside page</small>{/if}
          </div>
        {/if}
      {/if}
      {#if textDraft}
        {#key textDraft.element.id}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div bind:this={draftInput} class="insertion-text-draft" style="left:{fmt(draftBounds!.x)};top:{fmt(draftBounds!.y)};width:{draftBounds!.textSizing === 'auto-width' ? 'max-content' : fmt(draftBounds!.w)};min-height:{fmt(draftBounds!.h)};{visual(textDraft.element)};white-space:{draftBounds!.textSizing === 'auto-width' ? 'pre' : 'pre-wrap'}" onkeydown={event=>textKey(event,true)}>
          {#if RichTextEditor}<RichTextEditor element={textDraft.element} label="New text" placeholder="Type here…" current={()=>Boolean(textDraft)} onchange={bodyChanged} onready={value=>{setBodyEditor(value);value?.focus();}} onblur={event=>{if(!(event.relatedTarget instanceof Element&&event.relatedTarget.closest('[data-text-formatting],.selection-context,.ui-context-menu')))finishTextDraft();}} onerror={()=>finishTextDraft(true)}/>{/if}
        </div>
        {/key}
      {/if}
    {/if}
  </div>
  {#if interactive&&!original}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="interaction-overlay" class:manipulating={Boolean(gesture?.active)} class:gesturing={gesture?.active||marquee?.active} style:width={fmt(deck.width)} style:height={fmt(deck.height)} style:transform="scale({scale})" style:--canvas-scale={scale}
      onpointermove={move} onpointerup={finish} onpointercancel={cancelPointer} onlostpointercapture={event=>{if(pointerCapture?.target===event.target&&pointerCapture.id===event.pointerId)cancelPointer();}}>
      {#if editor.croppingId&&selectedIds.has(editor.croppingId)}{#each sourceSlide.elements.filter(e=>e.id===editor.croppingId&&!e.locked&&!e.sourceRegion&&e.type==='image') as e(e.id)}<div style={position(e)} class="element-chrome"><AsyncFeature feature="canvas-image-crop" props={{element:e,slideId:sourceSlide.id,scale}}/></div>{/each}{/if}
      {#if CanvasContainerDrop&&shownDrop}<CanvasContainerDrop drop={shownDrop} {scale} page={deck}/>{/if}
      {#if interactive&&!original&&!editing&&!insertTool&&!textDraft&&!editor.croppingId}
        <div class="selection-layer">
          {#await containersView then Containers}{#if Containers}<Containers.default mode="feedback" {slide} page={deck} selected={selectionUnits} {scale} frame={bounds??scaleFrame} movement={gesture?.active&&gesture.mode==='move'?gesture:null} onhover={hoverCanvas} onleave={leaveCanvas} onstart={startContainer}/>{/if}{/await}
          {#each slide.elements.filter(e=>!e.hidden&&(selectedLeaves.has(e.id)||editor.hovered===e.id||displayGuides.some(g=>g.ids.includes(e.id)))) as e(e.id)}
          <div class="element-chrome" style={position(e)} data-chrome-id={e.id}>
            {#if e.type==='line'}
              {@const label=e.text?canvasLineLabel(e):null}
              <svg class="line-selection-path" viewBox="0 0 {e.w} {e.h}" aria-hidden="true" class:hover-line={!selectedLeaves.has(e.id)} class:locked-line={e.locked}>
                {#if label}<defs><mask id={`line-label-selection-${e.id}`} maskUnits="userSpaceOnUse" x={-8/scale} y={-8/scale} width={e.w+16/scale} height={e.h+16/scale}><rect x={-8/scale} y={-8/scale} width={e.w+16/scale} height={e.h+16/scale} fill="white"/><rect x={-label.w/2} y={-label.h/2} width={label.w} height={label.h} transform={lineLabelTransform(e)} fill="black"/></mask></defs>{/if}
                <path d={lineGeometry(e).path} stroke-width={(selectedLeaves.has(e.id)?1.5:1)/scale} mask={label?`url(#line-label-selection-${e.id})`:undefined}/>
              </svg>
              {#if editor.selected.length===1&&!editor.selectedContainer&&!editor.additiveSelection&&!e.locked&&selectedIds.has(e.id)}<CanvasLineHandles element={e} {scale} {canvasPoint} page={deck} onpreview={preview=>lineEditPreview=preview}/>{/if}
            {:else}
            <div class="selection-outline" class:gesture-outline={gesture?.active&&gestureIds.has(e.id)} class:hover-outline={!selectedLeaves.has(e.id)&&!displayGuides.some(g=>g.ids.includes(e.id))} class:locked-outline={e.locked} class:snap-target-outline={!selectedLeaves.has(e.id)&&displayGuides.some(g=>g.ids.includes(e.id))} style:border-width="{(gesture?.active&&gestureIds.has(e.id) ? 2.5 : selectedLeaves.has(e.id) ? 1.5 : 1) / scale}px" style:inset="{-1 / scale}px"></div>
            {#if editor.selected.length === 1 && !editor.selectedContainer && !editor.additiveSelection && !e.locked}
              {#if selectedIds.has(e.id)}{#each boxResizeHandles as corner}
                <button class="resize-handle {corner}" class:table-resize={e.type==='table'&&tableInteraction?.id===e.id&&tableInteraction.resizing} class:resize-edge={corner.length===1} class:gesture-handle={gesture?.active&&gesture.mode==='resize'&&gesture.id===e.id&&gesture.corner===corner} tabindex="-1" aria-label="Resize object · {corner}" style:cursor={resizeCursor(e, corner as ResizeHandle)} style:--handle-unit="{1 / scale}px" onpointerdown={(event) => start(event, e, 'resize', corner as ResizeHandle)}></button>
              {/each}
              {#if RotationHandles&&rotationTools?.allowed(sourceSlide,[e],true)}<RotationHandles {scale} onstart={event=>startRotate(event,e)}/>{/if}
              {/if}
            {/if}
            {/if}
          </div>
          {/each}
          {#if bounds||editor.selectedContainer&&scaleFrame}{@const outline=bounds??scaleFrame!}<div class="multi-selection-outline" class:container-frame={Boolean(editor.selectedContainer)} data-selected-container={editor.selectedContainer||undefined} data-resize-kind={resizingLayout?'layout':resizingGroup?'group':'selection'} style:transform={gesture?.mode==='rotate'&&gesture.active?`rotate(${gesture.rotation?.angle??0}deg)`:undefined} style:left={fmt(outline.x - 1 / scale)} style:top={fmt(outline.y - 1 / scale)} style:width={fmt(outline.w + 2 / scale)} style:height={fmt(outline.h + 2 / scale)}>{#if (scaleMembers.length>1||editor.selectedContainer&&scaleMembers.length)&&!editor.additiveSelection&&!editor.selection.some(e=>e.locked)}{#each selectionHandles as corner}<button class="resize-handle {corner}" class:resize-edge={corner.length===1} class:gesture-handle={gesture?.active&&(gesture.mode==='scale'||gesture.mode==='layout-resize')&&gesture.corner===corner} tabindex="-1" aria-label="{resizingLayout?'Resize layout':resizingGroup?'Scale group':'Scale selection'} · {corner}" title={resizingLayout?'Resize layout frame; contents follow layout rules':'Scale contents together'} style:cursor={resizeCursor({...scaleMembers[0],rotation:0,flipX:false,flipY:false,type:'rect'},corner)} style:--handle-unit="{1 / scale}px" onpointerdown={event=>startScale(event,corner as ResizeHandle)}></button>{/each}{#if RotationHandles&&rotationTools?.allowed(sourceSlide,scaleMembers,false)}<RotationHandles {scale} label="selection" onstart={event=>startRotate(event)}/>{/if}{/if}</div>{/if}
        </div>
      {/if}
      {#if transformReadout&&!displayGuides.length&&bounds}<div class="marquee-readout" style:left={fmt(Math.max(0,Math.min(deck.width-220/scale,bounds.x)))} style:top={fmt(Math.max(0,Math.min(deck.height-28/scale,bounds.y+bounds.h+34/scale)))}>{transformReadout}</div>{/if}
    </div>
  {/if}
  {#if interactive}<p class="sr-only" role="status">{canvasDrop?.reason??canvasDrop?.label??''}</p>{/if}
  {#if interactive}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div bind:this={picker} use:popoverFocus={{close:()=>picker?.hidePopover(),origin:()=>pickerOrigin}} popover="auto" class="canvas-layer-picker" role="dialog" tabindex="-1" aria-label="Select an object here" style:left="{pickerX}px" style:top="{pickerY}px" onkeydown={pickerKey}>
      <p>Objects at this position <small>Front to back</small></p>
      {#each stack as e(e.id)}<button aria-pressed={selectedIds.has(e.id)} onclick={()=>pickLayer(e)}><span>{e.name}</span><small>{e.locked?'Locked':elementLabel(e)}</small></button>{/each}
    </div>
  {/if}
</div>

{#if interactive && dataElement && !dataElement.locked && (dataElement.type==='table'||dataElement.type==='chart')}
  <AsyncFeature feature={dataElement.type} props={{elementId:dataElement.id,onclose:()=>dataEditorId=''}} modalTitle={dataElement.type==='table'?'Edit table':'Edit chart'} onclose={()=>dataEditorId=''}/>
{/if}

{#if interactive&&cellEditor}
  {#key cellEditor.id}{@const target=cellEditor}<AsyncFeature feature="table-cell" props={{elementId:cellEditor.id,initialRow:cellEditor.row,initialColumn:cellEditor.column,initialValue:cellEditor.initialValue,anchor:(row,column)=>cellNode(target.id,row,column),onpreview:(row:number,column:number,patch:TableCellTextPatch|null)=>cellPreview=patch===null?null:{id:target.id,row,column,patch},onclose:()=>{cellPreview=null;cellEditor=null;},onfull:()=>dataEditorId=editor.selected[0]}}/>{/key}
{/if}

{#if interactive&&chartValueId}{#key chartValueSequence}{@const id=chartValueId}{@const sequence=chartValueSequence}{@const initial=chartInitialPoint}
  <AsyncFeature feature="chart-values" props={{elementId:id,initialSeries:initial?.series??0,initialCategory:initial?.category??0,pointMode:Boolean(initial),anchor:(series:number,category:number)=>chartPointNode(id,series,category),onlocation:(series:number,category:number)=>{if(sequence===chartValueSequence)chartActivePoint={id,series,category};},onpreview:chart=>{if(sequence===chartValueSequence)chartValuePreview=chart?{id,chart}:null;},onclose:()=>{if(sequence===chartValueSequence){chartValuePreview=null;chartValueId='';chartActivePoint=null;}},onfull:()=>dataEditorId=id}}/>
{/key}
{/if}

<style>
  .insertion-preview.region-preview img{object-fit:fill}
  .text-paragraph[data-bullet]::before{content:attr(data-bullet) " ";}

  .canvas-wrap{position:relative;width:100%;overflow:hidden;isolation:isolate}
  .canvas-wrap.editable-wrap{overflow:visible}
  .interaction-overlay{position:absolute;inset:0 auto auto 0;transform-origin:top left;pointer-events:none;z-index:50}
  .interaction-overlay.manipulating :global(.container-label){visibility:hidden}
  .insertion-surface{position:absolute;inset:0;z-index:60;cursor:crosshair;touch-action:none}
  .insertion-surface.inserting-text{cursor:text}
  .insertion-preview{position:absolute;z-index:61;pointer-events:none;border:calc(1.5px / var(--canvas-scale)) dashed var(--canvas-selection);background:color-mix(in srgb,var(--canvas-selection) 8%,transparent)}
  .insertion-preview.text-preview{border:0;border-left:calc(2px / var(--canvas-scale)) solid var(--canvas-selection);background:none}
  .insertion-preview.ellipse-preview{border-radius:50%}
  .insertion-preview.image-preview{background:none;border-style:solid}
  .insertion-preview.image-preview img{display:block;width:100%;height:100%;object-fit:contain;opacity:.65;pointer-events:none}
  .insertion-size{position:absolute;z-index:61;display:flex;flex-direction:column;gap:calc(2px / var(--canvas-scale));padding:calc(3px / var(--canvas-scale)) calc(6px / var(--canvas-scale));pointer-events:none;background:var(--surface-overlay);color:var(--text-primary);font-family:var(--font-ui);font-size:calc(var(--ui-meta) / var(--canvas-scale));line-height:1.4;white-space:nowrap}
  .insertion-size small{color:var(--text-secondary);font-size:inherit}
  .insertion-preview.line-preview{border:0;background:none}
  .insertion-preview.shape-preview{border:0;background:none}
  .insertion-preview.shape-preview path{fill:color-mix(in srgb,var(--canvas-selection) 9%,transparent);stroke:var(--canvas-selection);stroke-width:calc(2px / var(--canvas-scale))}
  .insertion-preview svg{width:100%;height:100%;overflow:visible}
  .insertion-text-draft{position:absolute;z-index:62;white-space:pre-wrap;overflow-wrap:break-word;outline:calc(1.5px / var(--canvas-scale)) solid var(--canvas-selection);outline-offset:calc(2px / var(--canvas-scale));cursor:text;user-select:text}
  .insertion-text-draft:empty::before{content:attr(data-placeholder);opacity:.45;pointer-events:none}
  .slide-render{isolation:isolate;position:absolute;inset:0 auto auto 0;transform-origin:top left;color-scheme:light;overflow:hidden;letter-spacing:0}
  .slide-element.decorative-pattern,.slide-element.block-sizing-frame{pointer-events:none}
  .slide-element{position:absolute;transform-origin:center;outline:none;}
  .slide-element.is-erasing{visibility:hidden;}
  .selection-outline.snap-target-outline{border-color:var(--canvas-snap);border-style:dashed;opacity:.55}
  .line-hit{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
  .shape-frame{pointer-events:none}
  .selection-layer{position:absolute;inset:0;z-index:30;pointer-events:none}
  .element-chrome{position:absolute;transform-origin:center}
  .multi-selection-outline{position:absolute;border:calc(1px / var(--canvas-scale)) dashed var(--canvas-selection);pointer-events:none}
  .container-frame{border-style:solid}
  .marquee{position:absolute;z-index:40;border:calc(1px / var(--canvas-scale)) solid var(--canvas-selection);background:color-mix(in srgb,var(--canvas-selection) 9%,transparent);pointer-events:none}
  .marquee-readout{position:absolute;z-index:42;padding:calc(4px / var(--canvas-scale)) calc(8px / var(--canvas-scale));background:var(--surface-overlay);color:var(--text-primary);border-radius:calc(4px / var(--canvas-scale));font:calc(var(--ui-meta) / var(--canvas-scale))/1.4 var(--font-ui);white-space:nowrap;pointer-events:none}
  .canvas-layer-picker{position:fixed;margin:0;width:min(248px,calc(100vw - 24px));max-height:min(360px,calc(100dvh - 24px));overflow:auto;border:1px solid var(--overlay-border);border-radius:var(--r-popover);padding:8px;background:var(--surface-overlay);color:var(--text-primary);box-shadow:var(--shadow-popover);font:var(--ui-label)/var(--ui-line-body) var(--font-ui)}
  .canvas-layer-picker p{padding:5px 8px 8px;display:flex;justify-content:space-between;color:var(--text-secondary)}
  .canvas-layer-picker button{display:flex;justify-content:space-between;width:100%;gap:12px;min-height:36px;padding:7px 8px;border-radius:var(--r-sm);text-align:left}
  .canvas-layer-picker button span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
  .canvas-layer-picker button[aria-pressed=true]{background:var(--state-selected)}
  @media(hover:hover) and (pointer:fine){.canvas-layer-picker button:not([aria-pressed=true]):hover{background:var(--state-hover)}}
  .canvas-layer-picker button:focus-visible{outline:2px solid var(--accent-line);outline-offset:-2px}
  .element-motion,.element-visual{width:100%;height:100%;transform-origin:center}
  .slide-render{cursor:default}
  .editable .slide-element{cursor:default;touch-action:none}
  .editable .slide-element.is-movable:not(.editing){cursor:grab}
  .editable .slide-element.is-dragging{cursor:inherit}
  .editable .slide-element.editing{cursor:text;touch-action:pan-x pan-y pinch-zoom}
  /* Selected objects already have a focus indicator in the selection layer. */
  .editable .slide-element:focus-visible:not(.is-selected):not(.editing){outline:calc(2px / var(--canvas-scale)) solid var(--canvas-selection);outline-offset:calc(3px / var(--canvas-scale))}
  .slide-element :global(img),.shape-content,.text-content,.shape-svg{width:100%;height:100%;display:block}
  .slide-render :global(.source-render){width:100%;height:100%;object-fit:contain;display:block}
  .shape-svg{overflow:visible}
  .shape-text{position:absolute;inset:0;pointer-events:none;box-sizing:border-box}
  .line-label{pointer-events:auto;z-index:2;border-radius:2px;}
  .line-label .text-content{box-sizing:border-box;}
  .editing .shape-text{pointer-events:auto}
  .element-visual{position:relative}
  .text-content{white-space:pre-wrap;overflow-wrap:break-word;overflow:hidden;outline:none}
  .text-flow{width:100%;flex-shrink:0}.image-clip{position:relative;overflow:hidden;width:100%;height:100%}
  .editing .text-content{cursor:text;user-select:text;overflow:visible;outline:calc(1.5px / var(--canvas-scale)) solid var(--canvas-selection);outline-offset:calc(2px / var(--canvas-scale))}
  .editable .slide-element:not(.editing){user-select:none}
  .line-selection-path{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
  .line-selection-path path{fill:none;stroke:var(--canvas-selection)}
  .line-selection-path.hover-line{opacity:.55}
  .line-selection-path.locked-line path{stroke:var(--text-secondary)}
  .selection-outline{position:absolute;border-style:solid;border-color:var(--canvas-selection);pointer-events:none}
  .hover-outline{border-color:color-mix(in srgb,var(--canvas-selection) 65%,transparent)}
  .locked-outline{border-style:dashed}
  .resize-handle{position:absolute;width:calc(24 * var(--handle-unit));height:calc(24 * var(--handle-unit));z-index:5;touch-action:none;border:0;background:transparent;border-radius:0;pointer-events:auto}
  /* Keep feedback on the visible handle rather than its larger hit target. */
  .resize-handle:focus-visible{outline:none}
  .resize-handle::after{content:'';position:absolute;inset:calc(8 * var(--handle-unit));border:calc(1.5 * var(--handle-unit)) solid var(--canvas-selection);background:var(--surface-raised);box-sizing:border-box}
  .resize-handle:focus-visible::after{outline:calc(1.5 * var(--handle-unit)) solid var(--canvas-selection);outline-offset:calc(2 * var(--handle-unit))}
  .resize-handle.gesture-handle::after{background:var(--canvas-selection)}
  .resize-handle.nw,.resize-handle.sw{left:calc(-12 * var(--handle-unit))}.resize-handle.ne,.resize-handle.se{right:calc(-12 * var(--handle-unit))}
  .resize-handle.nw,.resize-handle.ne{top:calc(-12 * var(--handle-unit))}.resize-handle.sw,.resize-handle.se{bottom:calc(-12 * var(--handle-unit))}
  /* Side hit areas keep the frame quiet and leave the corner targets on top. */
  .resize-edge{z-index:4;padding:0}
  .resize-edge::after{display:none}
  .resize-edge.n,.resize-edge.s{left:calc(12 * var(--handle-unit));right:calc(12 * var(--handle-unit));width:auto;height:calc(12 * var(--handle-unit))}
  .resize-edge.n{top:calc(-6 * var(--handle-unit))}.resize-edge.s{bottom:calc(-6 * var(--handle-unit))}
  .resize-edge.w,.resize-edge.e{top:calc(12 * var(--handle-unit));bottom:calc(12 * var(--handle-unit));height:auto;width:calc(12 * var(--handle-unit))}
  .resize-edge.w{left:calc(-6 * var(--handle-unit))}.resize-edge.e{right:calc(-6 * var(--handle-unit))}
  @media(pointer:coarse){.resize-edge{display:none}}
  @media(hover:hover){.resize-handle:hover::after{background:var(--canvas-selection)}}
  /* Place touch targets outward so small frames still have a clear area to drag. */
  @media(pointer:coarse){.resize-handle{width:calc(44 * var(--handle-unit));height:calc(44 * var(--handle-unit))}.resize-handle::after{inset:auto;width:calc(10 * var(--handle-unit));height:calc(10 * var(--handle-unit))}.resize-handle.nw,.resize-handle.sw{left:calc(-38 * var(--handle-unit))}.resize-handle.ne,.resize-handle.se{right:calc(-38 * var(--handle-unit))}.resize-handle.nw,.resize-handle.ne{top:calc(-38 * var(--handle-unit))}.resize-handle.sw,.resize-handle.se{bottom:calc(-38 * var(--handle-unit))}.resize-handle.nw::after,.resize-handle.sw::after{left:calc(33 * var(--handle-unit))}.resize-handle.ne::after,.resize-handle.se::after{right:calc(33 * var(--handle-unit))}.resize-handle.nw::after,.resize-handle.ne::after{top:calc(33 * var(--handle-unit))}.resize-handle.sw::after,.resize-handle.se::after{bottom:calc(33 * var(--handle-unit))}}

@media(pointer:coarse){.resize-handle.table-resize.nw,.resize-handle.table-resize.sw{left:0}.resize-handle.table-resize.ne,.resize-handle.table-resize.se{right:0}.resize-handle.table-resize.nw,.resize-handle.table-resize.ne{top:0}.resize-handle.table-resize.sw,.resize-handle.table-resize.se{bottom:0}.resize-handle.table-resize.nw::after,.resize-handle.table-resize.sw::after{left:calc(-5 * var(--handle-unit))}.resize-handle.table-resize.ne::after,.resize-handle.table-resize.se::after{right:calc(-5 * var(--handle-unit))}.resize-handle.table-resize.nw::after,.resize-handle.table-resize.ne::after{top:calc(-5 * var(--handle-unit))}.resize-handle.table-resize.sw::after,.resize-handle.table-resize.se::after{bottom:calc(-5 * var(--handle-unit))}}
</style>

{#if interactive&&chartTextEditor}{#key chartTextEditor}{@const target=chartTextEditor}<AsyncFeature feature="chart-text" props={{elementId:target.id,target:target.target,anchor:location=>chartTextNode(target.id,location),onpreview:chart=>chartValuePreview=chart?{id:target.id,chart}:null,onclose:()=>{chartValuePreview=null;chartTextEditor=null;}}}/>{/key}{/if}
