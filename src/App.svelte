<script lang="ts">
  import {isGraphicBackground,isThemedIllustration} from './core/resource-purpose';
  import {slideLabel} from './core/slide-label';
  import {presentationStartIndex, visibleDeliveryDeck} from './core/slide-visibility';
  import type {TextRole} from './core/design-system-schema';
  import {ancestorIds} from './core/container-tree';
  import {isBrowserEdition,readActiveDocument,rememberActiveDocument} from "./core/runtime";
  import { countLabel, workspaceOpenError } from "./core/ui-copy";
  import {copyDeck, reorderedSlides, defaultPaneWidths, clampPaneWidth, fitScale} from './core/workspace-view';
  import {canvasViewport} from './canvas-viewport';
  import {canvasOverlay} from './canvas-overlay';
  import { editorTask } from './editor-priority';
  import { editorToolbar } from './editor-toolbar';
  import { selectionToolbar } from './selection-toolbar';
  import { canvasTouch } from './canvas-touch';
  import type {TextFormatState,TextFormatPatch,TextRange} from './core/text-range-format';
  import type { DeckBlock, BlockId } from './core/deck-blocks';
  import { insertedElement, insertLabels, insertionSizeLabel, placementHistoryMatch, type CanvasTool, type InsertTool, type PrimitiveInsertTool, type InsertGeometry } from './core/insertion';
  import {availableFocus,restoreFocus} from './ui-focus';
  import { focusCanvasSelection, focusSlideSelection, containerAction, objectAction } from './editor-focus';
  import {editorCommands} from './core/clipboard-queue';
  import {stamp} from './clipboard-context';
  import {clipboardScope,copySelection,pasteEvent,pasteFromClipboard} from './editor-clipboard';
  import { holdPointerCursor } from './pointer-cursor';
  import { onMount, tick, setContext } from 'svelte';
  import { installVisualViewport } from './ui-viewport';
  import AsyncFeature from './components/LazyFeature.svelte';
  import SlideVisibilityNotice from './components/SlideVisibilityNotice.svelte';
  import { releaseLibraryPreviews, type LibraryDocument } from './core/document-library-view';
  import { initializeWorkspace,workspaceEntryId,workspaceDocumentURL,workspaceTemplateId } from './core/workspace-startup';
  import { flip } from 'svelte/animate';
  import { uiPresence, uiCollapse, uiChange, uiIndicator, uiCurrentSlide, uiFocus, reframeUI, reducedUI, setUIMotion, installUIMotion, type UIMotionPreference } from './ui-motion';
  import { ResourcesIcon, DocumentStylesIcon } from './components/icons/workspace-icons';
  import {elementLabel} from './components/element-labels';
  import {Unlock} from '@lucide/svelte';
  import { ArrowLeft, ArrowRight, ChevronDown, Plus, MousePointer2, Play, Upload, Download, Type, Image, Square, Shapes, Circle, Minus, Table2, ChartColumn, Settings2, PanelRight, Sparkles, LayoutTemplate, FileText, Search, Copy, Trash2, Maximize2, Minimize2, Scan, X, Check, AlertCircle, MoveUp, MoveDown, Layers, BookOpen, Monitor, Sun, Moon, Link2, Info, Ellipsis, History, AppWindow, SquareDashedMousePointer, ExternalLink, Eye, EyeOff } from '@lucide/svelte';
  let SlideRail=$state<typeof import('./SlideRail.svelte')['default']>();
  $effect(()=>{if(editor.deck&&!SlideRail)void import('./SlideRail.svelte').then(module=>SlideRail=module.default);});
  let SlideCanvas=$state<typeof import('./components/SlideCanvas.svelte')['default']>();
  $effect(()=>{if(editor.deck&&!SlideCanvas)void import('./components/SlideCanvas.svelte').then(m=>SlideCanvas=m.default);});
  import Dialog from './components/LazyDialog.svelte';
  import BrandLockup from './components/BrandLockup.svelte';
  import { BRAND, syncBrowserBrand, installBrowserBrand } from './branding';
  import Button from './components/ui/Button.svelte';
  import DialogFooter from './components/ui/DialogFooter.svelte';
  import SegmentedControl from './components/ui/SegmentedControl.svelte';
  import ActionMenu from './components/ui/ActionMenu.svelte';
  import PopoverPanel from './components/LazyPopoverPanel.svelte';
  import EmptyState from './components/ui/EmptyState.svelte';
  import CommandSearch from './components/LazyCommandSearch.svelte';
  import {publishEditorContext} from './core/editor-context-client';
  import type {WorkflowRequest,WorkflowOutcome,WorkflowReceipt} from './core/workflows';
  import {workflowLabel} from './core/workflow-label';
  import { editor, api } from './core/editor.svelte';
  import NotificationOutlet from './components/NotificationOutlet.svelte';
  import { notificationUI } from './notification-ui.svelte';
  import {newAICreationState,saveAICreationBrief,clearAICreationBrief} from './core/ai-creation-state';
  import type {Proposal} from './core/operations';
  import {canEditText} from './core/shapes';
  import { uid, blankSlide, newDeck, type Deck, type SlideElement, type Slide } from './core/model';
  import { applyOperations, moveElements, ProposalSchema } from './core/operations';
  import { download, deckFilename } from './core/download';
  import { cloneDocumentData } from './core/document-data';
  import type { ResourceItem } from './core/resources';
  import type { ResourceReplacementPreview, ResourceLibraryView, ResourceQuickView } from './components/resource-library-view';
  import {GraphicRecipeSchema,type GraphicRecipe} from './core/graphic-recipe';
  import type {SearchAction, SearchScope} from './search-actions';
  let searchProviders = $state<typeof import('./search-actions')>();
  let searchProviderRequest: Promise<void> | undefined;
  function prepareSearchActions() {
    return searchProviderRequest ??= import('./search-actions').then(module => {searchProviders = module;}).catch(error => {searchProviderRequest = undefined; throw error;});
  }
  import type { AISettings } from '../server/ai';

  type Modal = 'ai-create' | '' | 'library' | 'templates' | 'layout' | 'auto-layout' | 'import' | 'export' | 'google-export' | 'publish' | 'fidelity' | 'help' | 'settings' | 'resources' | 'search' | 'fonts' | 'prototype' | 'rename' | 'history' | 'deck-styles' | 'page-elements' | 'chart' | 'notifications' | 'illustration-colors' | 'blocks';
  let documentStyleRole=$state<TextRole|undefined>();
  let blockInitialId = $state<BlockId|undefined>();
  let insertBlock = $state<DeckBlock|null>(null);
  let blockPlacement: typeof import('./core/deck-blocks').placeDeckBlock | undefined;
  function openBlocks(id?:BlockId){if(!editor.deck||!editor.slide||proposalDeck||editor.sourceMode)return;finishInlineText();cancelInsertion();resourcePanel?.close();blockInitialId=id;modal='blocks';}
  async function prepareBlock(block:DeckBlock,origin:{deckId:string;slideId:string;revision:number}){
    const request=++imageRequest;
    const {placeDeckBlock}=await import('./core/deck-blocks');
    if(request!==imageRequest||modal!=='blocks')return;
    if(editor.deck?.id!==origin.deckId||editor.slide?.id!==origin.slideId||editor.deck.revision!==origin.revision){editor.notify('The slide changed. Choose the block again.','warning');return;}
    blockPlacement=placeDeckBlock;cancelInsertion();insertBlock=block;insertOrigin=origin;insertTool='block';editor.hovered='';editor.additiveSelection=false;modal='';
    void tick().then(()=>stage?.focus({preventScroll:true}));
  }
  function openPageElements(){finishInlineText();cancelInsertion();resourcePanel?.close();modal='page-elements';}
  let documentStyleOrigin:HTMLElement|null=null;
  function openDocumentStyles(role?:TextRole){documentStyleOrigin=document.activeElement instanceof HTMLElement?document.activeElement:null;if(editor.editingId||insertingText)finishInlineText();documentStyleRole=role;modal='deck-styles';}
  let modal = $state<Modal>('');
  let templateStart = $state<string | undefined>();
  $effect(() => { if (modal !== 'templates') templateStart = undefined; });
  let layoutTarget = $state<{deckId:string;slideId:string}>();
  let resourceReplaceId = $state<string | undefined>();
  let resourcePreview = $state<ResourceReplacementPreview>();
  let resourceContextAnchor = $state<HTMLElement | undefined>();
  let resourceInitialId = $state<string | undefined>(), resourceInitialColor = $state<string | undefined>();
  let resourceInitialBlueBlack = $state(false);
  let resourceInitialRecipe = $state<GraphicRecipe | undefined>();
  let resourceInitialKind = $state<'photo' | 'icon' | 'illustration' | 'used' | undefined>();
  let resourceLocalKeepOpen = false;
  let resourceView = $state<ResourceLibraryView>();
  let resourceQuickView = $state<ResourceQuickView>(), resourceActiveView = $state<ResourceQuickView>();
  let resourceTitle = $state('Resource library');
  function resourceViewChanged(view: ResourceQuickView, label: string) { resourceActiveView = view; resourceTitle = label; }
  let resourcePanel = $state<{show: () => void; close: () => void}>(), resourceTrigger = $state<HTMLButtonElement>(), resourceOpen = $state(false);
  let resourcePreviewSlide = $derived(resourcePreview && (resourceOpen || modal === 'resources') && editor.deck?.id === resourcePreview.deckId && editor.slide?.id === resourcePreview.slide.id && editor.deck.revision === resourcePreview.baseRevision && !editor.sourceMode ? resourcePreview.slide : undefined);
  let resourceExpandControl = $state<{run: () => void; disabled: boolean}>();
  function resourceExpandControlChanged(control?: {run: () => void; disabled: boolean}) { resourceExpandControl = control; }
  function configureResources(replaceId?: string, kind?: typeof resourceInitialKind) { cancelInsertion(); closeModal(); resourceQuickView=undefined; resourceActiveView=undefined; resourceTitle='Resource library'; resourceContextAnchor=undefined; resourceView = undefined; resourceReplaceId = replaceId; resourceInitialKind = kind; resourceInitialId = undefined; resourceInitialColor = undefined; resourceInitialBlueBlack = false; resourceInitialRecipe=undefined; resourcePreview=undefined; const source=editor.slide?.elements.find(e=>e.id===replaceId)?.resource; if(replaceId){resourceInitialKind=kind??source?.kind??'photo';resourceInitialId=source?.id;resourceInitialColor=source?.color;resourceInitialRecipe=source?.graphicRecipe;} if(source?.id.startsWith('deck-graphics:')){resourceInitialId=source.id;resourceInitialColor=source.color;resourceInitialRecipe=source.graphicRecipe;resourceInitialKind='illustration';} }
  async function openResources(replaceId?: string, kind?: typeof resourceInitialKind, anchor?:HTMLElement) { configureResources(replaceId, kind); resourceContextAnchor=anchor; await tick(); resourcePanel?.show(); }
  async function openResourceTool(view: ResourceQuickView, anchor: HTMLButtonElement) {
    if (resourceOpen && resourceExpandControl?.disabled) return;
    if (resourceOpen && resourceActiveView === view) { resourcePanel?.close(); return; }
    if (!resourceOpen) configureResources();
    resourceQuickView = view; resourceActiveView = view;
    resourceTitle = ({photo: 'Photos', icon: 'Icons', illustration: 'Illustrations', graphics: 'Patterns & textures', favorites: 'Favorites'})[view];
    resourceContextAnchor = anchor;
    await tick(); resourcePanel?.show();
  }
  function expandResources(view: ResourceLibraryView) { resourceView = view; resourcePanel?.close(); modal = 'resources'; }
  let panel = $state<'design' | 'ai' | 'motion'>('design');
  const panelTabs = [{id:'design',label:'Design'},{id:'motion',label:'Motion'},{id:'ai',label:'AI'}] as const;
  let inspectorView = $state<'properties'|'layers'>('properties');
  let visitedPanels = $state<Array<typeof panel>>(['design']);
  $effect(() => { if (!visitedPanels.includes(panel)) visitedPanels = [...visitedPanels, panel]; });
  $effect(() => {
    panel; rightOpen; canvasFocus;
    for (const popup of document.querySelectorAll<HTMLElement>('.property-panel [popover]:popover-open,.stage-footer [popover]:popover-open')) {
      if (popup.closest('[inert]')) popup.hidePopover();
    }
  });
  let prototypeTarget = $state<SlideElement | null>(null), prototypeUrl = $state(''), prototypeClientId = $state('');
  function openPrototype(target?: SlideElement) { prototypeTarget = target ?? null; prototypeUrl = ''; error = ''; modal = 'prototype'; }
  async function insertPrototype() { if (!editor.deck) return; const captured=editor.deck,url=prototypeUrl;try { const {prototypeElement}=await import('./core/prototype');if(editor.deck!==captured||modal!=='prototype')return;editor.add(prototypeElement(url, captured.width, captured.height)); editor.sourceMode = false; panel = 'design'; rightOpen = true; modal = ''; } catch (e: any) { error = e.message; } }
  let viewportWidth = $state(typeof window === 'undefined' ? 1440 : window.innerWidth), viewportHeight = $state(typeof window === 'undefined' ? 960 : window.innerHeight);
  let shortWorkspace = $derived(viewportWidth <= 1100 && (viewportHeight <= 520 || viewportWidth <= 760 && viewportHeight <= 640));
  let leftOpen = $state(true), rightOpen = $state(typeof window === 'undefined' || (window.innerWidth > 760 && (window.innerWidth > 1100 || window.innerHeight > 520))), notesOpen = $state(false);
  let shortSlidesOpen = $state(false);
  $effect(()=>{if(editor.croppingId&&viewportWidth<=760)rightOpen=false;});
  let slidesHidden = $derived(!leftOpen || (shortWorkspace && !shortSlidesOpen));
  function setPaneVisibility(side: 'left' | 'right', visible: boolean) {
    canvasFocus = false;
    if (side === 'left') { leftOpen = visible; shortSlidesOpen = visible && shortWorkspace; } else rightOpen = visible;
    localStorage.setItem('deck-studio-pane-visibility', JSON.stringify({left: leftOpen, right: rightOpen}));
  }
  let canvasFocus = $state(false);
  let PrintDocument = $state<typeof import('./components/PrintDocument.svelte').default>();
  function measureStage() {
    if (!stage) return;
    // Transient chrome must never reframe the artwork when focus moves into a picker.
    const style = getComputedStyle(stage);
    availableW = Math.round(stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    availableH = Math.round(stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
  }
  async function setCanvasFocus(value: boolean) {
    await reframeUI(stage?.querySelector<HTMLElement>('.stage-canvas'), async () => {
      canvasFocus = value;
      await tick();
      measureStage();
      await tick();
    });
    if (canvasFocus !== value) return;
    if (value) stage?.focus({preventScroll: true});
    else document.querySelector<HTMLButtonElement>('.focus-toggle')?.focus({preventScroll: true});
  }
  async function focusEditingPanel() { await tick(); if (rightOpen && !canvasFocus && !document.querySelector('dialog:modal,[popover]:popover-open:not([role="tooltip"])')) document.querySelector<HTMLElement>('.property-panel')?.focus({preventScroll:true}); }
  function showPanel(value: 'design' | 'ai' | 'motion', resetDesignView = true) { const enter = !document.activeElement?.closest('.property-panel'); canvasFocus = false; panel = value; if(value === 'design' && resetDesignView) inspectorView = 'properties'; rightOpen = true; if (enter) void focusEditingPanel(); }
  async function openSlidesPanel() {
    canvasFocus = false;
    leftOpen = true;
    shortSlidesOpen = shortWorkspace;
    if (viewportWidth <= 760) rightOpen = false;
    await tick();
    document.getElementById('slides-panel')?.querySelector<HTMLButtonElement>('.slide-thumb.current')?.focus({preventScroll: true});
  }
  async function openEditingPanel() {
    showPanel(panel, false);
    await tick();
    document.getElementById('editing-panel')?.querySelector<HTMLButtonElement>('.panel-tabs button[aria-selected="true"]')?.focus({preventScroll: true});
  }
  function closeEditingPanel() { rightOpen = false; void focusCanvasSelection(); }
  function choosePanelTab(value: typeof panel) {
    showPanel(value, false);
    if (value !== 'ai') previewProposal = false;
  }
  async function panelTabKey(event: KeyboardEvent) {
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const current = panelTabs.findIndex(tab => tab.id === panel);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? panelTabs.length - 1 : (current + (event.key === 'ArrowLeft' ? panelTabs.length - 1 : 1)) % panelTabs.length;
    choosePanelTab(panelTabs[index].id);
    await tick();
    document.getElementById(`editor-tab-${panelTabs[index].id}`)?.focus({preventScroll: true});
  }
  function nextSlide(direction: number) {
    if(proposalDeck){const index=proposalDeck.slides.findIndex(s=>s.id===previewActiveId);previewActiveId=proposalDeck.slides[Math.max(0,Math.min(proposalDeck.slides.length-1,index+direction))].id;return;}
    const slide = editor.deck?.slides[activeIndex + direction];
    if (slide) {editor.chooseSlide(slide.id);void focusCanvasSelection();}
  }
  let presenting = $state(false), printMode = $state(false);
  let presentationStartId = $state<string | undefined>();
  let presentationReturnTo = $state<HTMLElement | undefined>();
  function closePresentation() { presenting = false; presentationStartId = undefined; }
  function startPresentation(id = editor.activeId) {
    if (!editor.deck || proposalDeck) return false;
    const index=presentationStartIndex(editor.deck.slides, Math.max(0,editor.deck.slides.findIndex(s=>s.id===id)));
    if(index===null){editor.notify('Unhide a slide before presenting.', 'warning');return false;}
    presentationReturnTo = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    finishInlineText(); presentationStartId=editor.deck.slides[index].id; presenting=true; return true;
  }
  function toggleSlideHidden(id = editor.activeId) {
    const slide=editor.deck?.slides.find(s=>s.id===id);
    if(!slide || proposalDeck) return;
    finishInlineText();
    if(!editor.setSlidesHidden([id],!slide.hidden))return;
    const label=slideLabel(editor.deck!.slides.findIndex(s=>s.id===id));
    editor.notify(slide.hidden?`${label} included in presentation`:editor.deck?.slides.every(s=>s.hidden)?'All slides are hidden. Unhide a slide to present.':`${label} hidden from presentation`);
  }
  let selectedSlideIds=$derived(new Set(editor.selectedSlides));
  let selectedSlidePages=$derived(editor.deck?.slides.filter(slide=>selectedSlideIds.has(slide.id))??[]);
  let slideSelecting=$derived(editor.selectingSlides);
  function setSelectedSlidesHidden(hidden:boolean) {
    if(proposalDeck||!selectedSlidePages.length)return;
    finishInlineText();
    const count=editor.setSlidesHidden(editor.selectedSlides,hidden);
    if(!count)return;
    editor.notify(`${count} ${count===1?'slide':'slides'} ${hidden?'hidden from':'included in'} presentation${editor.deck?.slides.every(slide=>slide.hidden)?'. Unhide a slide to present.':''}`);
  }
  function toggleSelectedSlidesHidden(){if(slideSelecting)setSelectedSlidesHidden(!selectedSlidePages.every(slide=>slide.hidden));else toggleSlideHidden();}
  let zoomMode = $state<'fit'|'scale'>('fit');
  let zoom = $state(1), availableW = $state(900), availableH = $state(600);
  let stage = $state<HTMLDivElement>();
  const paneDefaults = defaultPaneWidths(typeof window === 'undefined' ? 1440 : innerWidth);
  let leftWidth = $state(paneDefaults.left), rightWidth = $state(paneDefaults.right), resizing = $state(false);
  let paneGesture = $state<{side:'left'|'right'; x:number; width:number; originalWidth:number; pointerId:number}|undefined>();
  let paneCapture: {target:HTMLElement;id:number}|undefined;
  function releasePanePointer(){const capture=paneCapture;paneCapture=undefined;if(capture?.target.hasPointerCapture(capture.id))capture.target.releasePointerCapture(capture.id);}
  $effect(() => { if (resizing) return holdPointerCursor('col-resize'); });
  let compactPanelOpen = $derived(Boolean(editor.deck) && rightOpen && !canvasFocus && viewportWidth <= 760);
  let compactCanvasWidth = $derived(viewportWidth - displayedRightWidth() - 16);
  let footerObscured = $derived(compactPanelOpen && compactCanvasWidth < 320);
  let workspaceFocus:HTMLElement|null=null;
  function rememberFocus(event:FocusEvent) { if(event.target instanceof HTMLElement)workspaceFocus=event.target; }
  $effect(()=>{
    panel;rightOpen;slidesHidden;canvasFocus;footerObscured;
    void tick().then(()=>{
      const active=document.activeElement;
      if(document.hasFocus() && !document.querySelector('dialog:modal,[popover]:popover-open:not([role="tooltip"])') && workspaceFocus?.closest('.slide-rail,.property-panel,.stage-column,.stage-footer') && !availableFocus(workspaceFocus) && (active===document.body || active?.closest('[inert],[hidden]'))) restoreFocus(document.querySelector<HTMLElement>('.property-panel'),stage);
    });
  });
  function displayedRightWidth(){return Math.min(rightWidth,viewportWidth<=760?Math.max(1,Math.min(304,viewportWidth-24)):viewportWidth<=1100?320:440);}
  function boundedPane(side:'left'|'right',value:number){const other=side==='left'?(rightOpen?displayedRightWidth():0):(leftOpen&&innerWidth>1100?leftWidth:0);return clampPaneWidth(side,Math.min(value,side==='right'&&innerWidth<=1100?320:440,Math.max(side==='left'?140:260,innerWidth-other-360)));}
  let paneCustomized=false;
  function viewportPanes(){viewportWidth=innerWidth;cancelPane();if(innerWidth<=760)return;if(!paneCustomized){const widths=defaultPaneWidths(innerWidth);leftWidth=widths.left;rightWidth=widths.right;}}
  function savePaneWidths(){paneCustomized=true;localStorage.setItem('deck-studio-pane-widths',JSON.stringify({left:leftWidth,right:rightWidth}));}
  function resizePane(event:PointerEvent,side:'left'|'right'){if(innerWidth<=760||side==='left'&&innerWidth<=1100||event.button!==0)return;cancelPane();paneGesture={side,x:event.clientX,width:side==='left'?leftWidth:displayedRightWidth(),originalWidth:side==='left'?leftWidth:rightWidth,pointerId:event.pointerId};resizing=true;if(event.currentTarget instanceof HTMLElement){event.currentTarget.setPointerCapture(event.pointerId);paneCapture={target:event.currentTarget,id:event.pointerId};}event.preventDefault();}
  function movePane(event:PointerEvent){if(!paneGesture||event.pointerId!==paneGesture.pointerId)return;const width=boundedPane(paneGesture.side,paneGesture.width+(event.clientX-paneGesture.x)*(paneGesture.side==='left'?1:-1));if(paneGesture.side==='left')leftWidth=width;else rightWidth=width;}
  function finishPane(event:PointerEvent){if(!paneGesture||event.pointerId!==paneGesture.pointerId)return;paneGesture=undefined;resizing=false;releasePanePointer();savePaneWidths();}
  function cancelPane(){if(!paneGesture)return;if(paneGesture.side==='left')leftWidth=paneGesture.originalWidth;else rightWidth=paneGesture.originalWidth;paneGesture=undefined;resizing=false;releasePanePointer();}
  function paneKey(event:KeyboardEvent,side:'left'|'right'){if(event.defaultPrevented||event.isComposing||event.keyCode===229||event.altKey||event.ctrlKey||event.metaKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();event.stopPropagation();const delta=(event.key==='ArrowRight'?1:-1)*(side==='left'?1:-1)*(event.shiftKey?20:8);if(side==='left')leftWidth=boundedPane(side,leftWidth+delta);else rightWidth=boundedPane(side,displayedRightWidth()+delta);savePaneWidths();}
  function setZoom(value:number|'fit'){zoomMode=value==='fit'?'fit':'scale';if(value!=='fit')zoom=Math.max(.1,Math.min(4,value));}
  function changeZoom(delta:number){setZoom(Math.round(Math.max(.1,Math.min(4,currentScale+delta))*100)/100);}

  let canvasHandle=$state<{beginMarquee(event:PointerEvent):void; cancelPointer():void; finishTextDraft(cancel?:boolean):void;finishTextEditing(cancel?:boolean):void;getTextFormatState():TextFormatState|null;formatText(patch:TextFormatPatch,range?:TextRange):Promise<void>}>();
  let insertTool = $state<CanvasTool | null>(null), insertingText = $state(false), canvasCellsSelected = $state(false);
  type QueuedImage = {image:SlideElement;item?:ResourceItem};
  let imageQueue = $state<QueuedImage[]>([]), imagePlaced = $state(0), imageTotal = $state(0);
  let imagePlacements: QueuedImage[] = [];
  let returnToResources = false, returnToResourceDialog = false, imageRequest = 0;
  let mediaPlacement: typeof import('./core/media-placement') | undefined;
  let insertImage = $derived(insertTool === 'image' ? imageQueue[0]?.image ?? null : null);
  let insertSize = $derived(insertTool && insertTool !== 'draw' && editor.deck ? insertionSizeLabel(insertTool, editor.deck, insertBlock ?? insertImage ?? undefined) : '');
  let insertOrigin: {deckId:string;slideId:string;revision:number}|undefined;
  let fileInput: HTMLInputElement, imageInput: HTMLInputElement, sourceInput: HTMLInputElement;
  let renameTarget = $state<{id:string;title:string}|null>(null), renameValue = $state('');
  let historyItems = $state<{revision:number;title:string;updatedAt:string;count:number}[]>([]), historyDeckId = $state('');
  let draggedSlide = $state(''), draggedSlides=$state<string[]>([]),dropSlide = $state(''), dropAfter = $state(false);
  let slideDragBase:{deckId:string;revision:number}|undefined;
  let fileDropActive = $state(false), fileDragDepth = 0;
  function clearDropFeedback(){fileDropActive=false;fileDragDepth=0;draggedSlide='';draggedSlides=[];slideDragBase=undefined;dropSlide='';}
  function enterFileDrop(event:DragEvent){if(!proposalDeck&&event.dataTransfer?.types.includes('Files')){fileDragDepth++;fileDropActive=true;editor.hovered='';}}
  function leaveFileDrop(){fileDragDepth=Math.max(0,fileDragDepth-1);if(!fileDragDepth)fileDropActive=false;}
  function resumeDropPointer(event:PointerEvent){if(!event.buttons&&!document.documentElement.hasAttribute('data-pointer-cursor'))clearDropFeedback();}
  let library = $state.raw<LibraryDocument[]>([]);
  let libraryRequest = 0;
  $effect(() => { if (modal !== 'library') library = releaseLibraryPreviews(library); });
  let exportView = $state<'editable'|'reference'>('editable'), printOriginal = $state(false);
  let referenceComplete = $derived(Boolean(editor.deck?.slides.every(s=>s.source?.render)));
  function openExport(){exportView=editor.sourceMode&&referenceComplete?'reference':'editable';modal='export';}
  let busy = $state(''), error = $state(''), cloudTab = $state('file'), cloudUrl = $state(''), cloudToken = $state('');
  let documentImportBusy = $state(false), exportKind = $state('');
  let exportFinished:Promise<void>|undefined;
  let documentFonts:Promise<typeof import('./core/document-fonts')>|undefined;
  let initializing = $state(true), workspaceError = $state('');
  let workspaceRetry: () => void = () => {};
  let searchRequest = 0;
  function closeModal() { libraryRequest++; searchRequest++; const returnToCreation=modal==='settings'&&aiCreationSettingsReturn;aiCreationSettingsReturn=false;modal=returnToCreation?'ai-create':''; layoutTarget = undefined; error = ''; cloudToken = ''; }
  $effect(() => { if (modal !== 'import') cloudToken = ''; if (modal) { resourcePanel?.close(); settingsMenu?.close(); commandSearch?.close(); focusCommandSearch?.close(); } });
  let commandSearch = $state<{toggle: () => void; close: () => void}>(), focusCommandSearch = $state<{toggle: () => void; close: () => void}>(), settingsMenu = $state<{toggle: () => void; show: () => void; close: () => void}>();
  let searchQuery = $state(''), searchScope = $state<SearchScope>('all');
  async function expandSearch(query: string) {
    const request = ++searchRequest;
    try { await prepareSearchActions(); }
    catch { editor.notify('Search could not load. Try again.', 'warning'); return; }
    if (request !== searchRequest) return;
    searchQuery = query; searchScope = query.trim() ? 'all' : 'command'; modal = 'search';
  }
  async function runSearchAction(action: SearchAction) {
    if (action.disabled || modal !== 'search') return;
    const frame = document.querySelector<HTMLDialogElement>('dialog:modal');
    const closed = frame?.open ? new Promise<void>(resolve => frame.addEventListener('close', () => resolve(), {once: true})) : Promise.resolve();
    closeModal(); const request = searchRequest;
    await closed; if (request === searchRequest && !modal) action.run();
  }
  function toggleCommandSearch() { closeModal(); (canvasFocus ? focusCommandSearch : commandSearch)?.toggle(); }
  async function toggleSettingsMenu() { closeModal(); if (canvasFocus) { await setCanvasFocus(false); await tick(); } settingsMenu?.toggle(); }
  async function openSettingsTab(tab: string) { const fromCreation=modal==='ai-create';settingsTab = tab; closeModal(); if (canvasFocus) { await setCanvasFocus(false); await tick(); } settingsMenu?.close(); modal = 'settings';aiCreationSettingsReturn=fromCreation; }
  let settingsTab = $state('appearance');
  let fontLibraryTab = $state<'browse'|'document'>('browse');
  function openFonts(tab:'browse'|'document'='browse'){fontLibraryTab=tab;modal='fonts';}
  let theme = $state('light'), palette = $state('forest');
  let uiMotion = $state<UIMotionPreference>('system');
  let aiCreation=$state(newAICreationState()),aiCreationSettingsReturn=$state(false),aiSessionVersion=$state(0);
  async function acceptAICreation(base:Deck,proposal:Proposal,request:string){base=$state.snapshot(base);proposal=$state.snapshot(proposal);
    const {creationPreview}=await import('./core/ai-story-builder');const preview=creationPreview(base,proposal,aiCreation.draftBrief??aiCreation);const {embedTemplateArtwork}=await import('./core/templates');const portable=await embedTemplateArtwork(preview);proposal={...proposal,operations:proposal.operations.map(op=>op.op==='add_slide'?{...op,slide:portable.slides.find(s=>s.id===op.slide.id)!}:op)};if(editor.deck?.id!==base.id)await editor.create(base);if(editor.deck!.revision===proposal.baseRevision){editor.pending=proposal;editor.pendingId='';await editor.acceptProposal();}else await editor.flush();if(editor.pending||editor.dirty)throw new Error(editor.error||'The document could not be saved. Keep this draft and try again.');rememberDocument(base.id);const {readAISession,saveAISession,appendAIHistory}=await import('./core/ai-session');const session=readAISession(base.id);saveAISession(base.id,{...session,scope:'deck',history:appendAIHistory(session.history,request,proposal.summary,'applied',editor.deck!.revision)});aiSessionVersion++;clearAICreationBrief();aiCreation=newAICreationState();modal='';showPanel('ai');editor.activeId=editor.deck!.slides[0].id;editor.notify('Document created');
  }
    $effect(()=>{saveAICreationBrief({brief:aiCreation.brief,audience:aiCreation.audience,goal:aiCreation.goal,delivery:aiCreation.delivery,slideCount:aiCreation.slideCount,collection:aiCreation.collection,templateMode:aiCreation.templateMode,materials:aiCreation.materials});});
  let aiSettings = $state<AISettings>({provider: 'compatible', baseUrl: 'http://127.0.0.1:11434/v1', model: '', apiKey: ''});
  let health = $state<any>(null);
  let aiModels = $state<string[]>([]), aiConnection = $state('');
  let modelsBusy = $state(false);
  let modelsFailed = $state(false);
  async function findAIModels() {
    if (modelsBusy) return;
    modelsBusy = true;
    modelsFailed = false;
    aiConnection = 'Finding models…';
    try { const data = await api('/api/ai/models', 'POST', aiSettings); aiModels = data.models; aiConnection = `${countLabel(aiModels.length, "model")} available. Choose one to start editing with AI.`;if(workflowRequest?.action.kind==='account'&&workflowRequest.action.provider==='ai')await workflowResult('completed',{message:'AI provider connection verified',provider:'ai',state:'connected'}); }
    catch (e: any) { aiConnection = e.message; modelsFailed = true; }
    finally { modelsBusy = false; }
  }
  let workflowRequest=$state.raw<WorkflowRequest|null>(null),workflowQueue:WorkflowRequest[]=[];
  let workflowBusy=$state(false),publishIncludeNotes=$state(false),hostingConnectOnly=$state(false);
  async function workflowResult(status:'completed'|'waiting_for_user'|'failed'|'dismissed',result?:WorkflowReceipt,request=workflowRequest){if(!request)return;const resolved=await (await import('./core/workflow-client')).resolveWorkflow(request,status,result);if(workflowRequest?.id===request.id)workflowRequest=resolved;return resolved;}
  function receiveWorkflow(outcome:WorkflowOutcome){if(outcome.failures?.length)editor.notify('Some actions could not be prepared: '+outcome.failures.map(item=>item.error).join(' '),'warning');workflowRequest=outcome.request;workflowQueue=outcome.additionalRequests??[];showPanel('ai');}
  async function dismissWorkflow(){if(!workflowRequest||workflowBusy)return;if(!['completed','dismissed'].includes(workflowRequest.status))await workflowResult('dismissed',{message:'Action dismissed'});workflowRequest=workflowQueue.shift()??null;}
  async function runWorkflow(){
    const request=workflowRequest;if(!request||workflowBusy||busy)return;
    workflowBusy=true;error='';
    try{
      if(!editor.deck||editor.deck.id!==request.deckId||editor.deck.revision!==request.baseRevision)throw new Error('The document changed. Request this action again.');
      if(proposalDeck||editor.pending)throw new Error('Apply or discard the document proposal before running this action.');
      workflowRequest=await (await import('./core/workflow-client')).claimWorkflow(request);const action=request.action;
      if(action.kind==='import'){cloudTab=action.source;cloudUrl=action.url??'';modal='import';await workflowResult('waiting_for_user',{message:action.source==='file'?'Choose a file to import.':'Complete source authorization and choose Import.',state:'awaiting_import'});}
      if(action.kind==='export'){
        exportView=action.version;const result=await exporting(action.format);
        if(!result)throw new Error(error||'The export did not finish.');
        await workflowResult(result.state==='awaiting_google_export'||result.state==='awaiting_print'?'waiting_for_user':'completed',result);
      }
      if(action.kind==='presentation'){
        if(action.command==='exit'){if(presenting)closePresentation();await workflowResult('completed',{message:'Presentation closed',state:'closed'});}
        else if(action.command==='start'){await (await import('./features')).loadFeature('presentation');editor.sourceMode=action.version==='reference';if(!startPresentation(action.slideId??editor.activeId))throw new Error('Unhide a slide before presenting.');await tick();await workflowResult('completed',{message:'Presentation started',slideId:presentationStartId,state:'presenting'});}
        else{if(!presenting)throw new Error('Start the presentation before controlling it.');const result=await (await import('./core/presentation-command')).presentationCommand(action);await workflowResult('completed',result);}
      }
      if(action.kind==='publish'){
        if(action.target==='web'){publishIncludeNotes=action.includeNotes;hostingConnectOnly=false;modal='publish';await workflowResult('waiting_for_user',{message:'Review the website package and choose Publish.',state:'awaiting_publish'});}
        if(action.target==='google'){modal='google-export';await workflowResult('waiting_for_user',{message:'Connect Google and choose Create copy.',state:'awaiting_google_export'});}
        if(action.target==='broadser'){const result=await exporting('broadser');if(!result)throw new Error(error||'The board export did not finish.');await workflowResult('completed',result);}
      }
      if(action.kind==='account'){
        if(action.provider==='netlify'){if(action.command==='disconnect'){const result=await api('/api/publishing/connection','PUT',{token:''});await workflowResult('completed',{message:result.source==='environment'?'Session key cleared. Hosting is still connected.':'Netlify session disconnected',provider:'netlify',state:result.connected?'server_configured':'disconnected'});}else{hostingConnectOnly=true;modal='publish';await workflowResult('waiting_for_user',{message:'Enter hosting authorization in the connection dialog.',provider:'netlify',state:'awaiting_sign_in'});}}
        if(action.provider==='google'){if(action.command==='disconnect'){await api('/api/google/oauth/disconnect','POST');await workflowResult('completed',{message:'Google session disconnected',provider:'google',state:'disconnected'});}else{if(!editor.deck.googleSource)throw new Error('Import the original Google Slides presentation first.');modal='google-export';await workflowResult('waiting_for_user',{message:'Choose Connect Google and authorize the source.',provider:'google',state:'awaiting_sign_in'});}}
        if(action.provider==='figma'){if(action.command==='disconnect'){cloudToken='';await workflowResult('completed',{message:'Figma import authorization cleared for this session',provider:'figma',state:'disconnected'});}else{cloudTab='figma';modal='import';await workflowResult('waiting_for_user',{message:'Enter source authorization in the Figma import dialog.',provider:'figma',state:'awaiting_authorization'});}}
        if(action.provider==='ai'&&action.command==='disconnect'){aiSettings.apiKey='';await workflowResult('completed',{message:'Session API key cleared',provider:'ai',state:'session_cleared'});}
        if(action.provider==='ai'&&action.command==='connect'){await openSettingsTab('ai');await workflowResult('waiting_for_user',{message:'Configure the provider, then choose Find models to verify it.',provider:'ai',state:'awaiting_configuration'});}
        if(action.provider==='photos'&&action.command==='disconnect'){const statuses=await api('/api/resources/providers','PUT',{provider:action.photoProvider??'unsplash',key:''});const source=statuses.find((item:any)=>item.id===(action.photoProvider??'unsplash'));await workflowResult('completed',{message:source?.configured?'Session key cleared. Photo search is still available.':'Photo provider disconnected',provider:action.photoProvider??'unsplash',state:source?.configured?'server_configured':'disconnected'});}
        if(action.provider==='photos'&&action.command==='connect'){openResources('photo');await workflowResult('waiting_for_user',{message:'Open the photo provider settings to update the connection.',provider:'photos',state:'awaiting_configuration'});}
      }
      if(action.kind==='workspace'){
        const name=action.command;
        if(name==='library')await openLibrary();if(name==='history')await openHistory();if(name==='styles')openDocumentStyles();if(name==='fonts')openFonts();if(name==='resources')openResources();if(name==='motion')showPanel('motion');if(name==='notes')notesOpen=!notesOpen;
        if(name==='reference'){if(!editor.slide?.source?.render)throw new Error('This slide has no source reference.');editor.sourceMode=true;modal='fidelity';}if(name==='undo'){if(!editor.past.length)throw new Error('There are no changes to undo.');historyAction('undo');await editor.flush();}if(name==='redo'){if(!editor.future.length)throw new Error('There are no changes to redo.');historyAction('redo');await editor.flush();}if(name==='focus')await setCanvasFocus(true);if(name==='exit_focus')await setCanvasFocus(false);if(name==='settings')await openSettingsTab('appearance');if(name==='templates')modal='templates';if(name==='slide_details')openPageElements();
        if(error)throw new Error(error);await workflowResult('completed',{message:workflowLabel(action),state:'completed'});
      }
    }catch(failure:any){error=failure.message;try{await workflowResult('failed',{message:failure.message,state:'failed'},request);}catch{} }
    finally{workflowBusy=false;}
  }
  $effect(()=>{if(workflowRequest&&workflowRequest.deckId!==editor.deck?.id&&workflowRequest.action.kind!=='import')workflowRequest=null;});
  function reportEditorContext(){if(typeof document==='undefined')return;publishEditorContext({deckId:editor.deck?.id??null,revision:editor.deck?.revision??0,activeSlideId:editor.activeId||undefined,selectedIds:[...editor.selected],focused:document.hasFocus(),visible:!document.hidden,dirty:editor.dirty,sourceMode:editor.sourceMode,presenting,pendingProposal:Boolean(editor.pending)});}
  $effect(()=>{reportEditorContext();});
  let previewProposal = $state(false);
  let previewActiveId=$state(''),previewRevision=0,previewDocumentId='';
  let proposalDeck = $derived.by(() => {
    if (!previewProposal || !editor.pending || !editor.deck || editor.pending.baseRevision !== editor.deck.revision) return null;
    try { return applyOperations(editor.operationDocument(), editor.pending.operations, editor.pending.baseRevision, 'ai'); } catch { return null; }
  });
  let task = $derived(editorTask({previewing: Boolean(proposalDeck), reference: editor.sourceMode, editing: Boolean(editor.editingId) || insertingText, selected: editor.selection.length, allLocked: editor.selection.every(element => element.locked)}));
  $effect(() => { if (insertTool && (modal || presenting || proposalDeck || editor.sourceMode || insertOrigin?.deckId !== editor.deck?.id || insertOrigin?.slideId !== editor.slide?.id || insertTool !== 'draw' && insertOrigin?.revision !== editor.deck?.revision)) cancelInsertion(); });
  $effect(() => { if (insertTool !== 'image' && imageQueue.length) imageQueue = []; });
  $effect(() => { if (previewProposal && (!editor.pending || editor.pending.baseRevision !== editor.deck?.revision || !proposalDeck)){if(editor.deck?.id===previewDocumentId&&editor.deck.revision>previewRevision&&editor.deck.slides.some(s=>s.id===previewActiveId))editor.chooseSlide(previewActiveId);previewProposal = false;} });
  $effect(()=>{if(proposalDeck&&!proposalDeck.slides.some(s=>s.id===previewActiveId)){const oldIndex=editor.deck?.slides.findIndex(s=>s.id===editor.activeId)??0;previewActiveId=proposalDeck.slides[Math.max(0,Math.min(proposalDeck.slides.length-1,oldIndex))].id;}});
  function enterEditable() { editor.sourceMode = false; if (innerWidth <= 760) rightOpen = false; void focusCanvasSelection(); }
  function returnCurrentVersion() { previewProposal = false; if (innerWidth > 760 || !rightOpen || canvasFocus) void focusCanvasSelection(); }
  function toggleProposalPreview() {
    if (proposalDeck) { returnCurrentVersion(); return; }
    if (!editor.pending || editor.pending.baseRevision !== editor.deck?.revision) return;
    editor.additiveSelection = false; editor.editingId = '';previewActiveId=editor.activeId;previewRevision=editor.deck?.revision??0;previewDocumentId=editor.deck?.id??''; previewProposal = true; if (innerWidth <= 760) { rightOpen = false; void focusCanvasSelection(); }
  }
  let source = $derived(editor.slide?.source);
  let displayedSlide = $derived(proposalDeck?(proposalDeck.slides.find(s=>s.id===previewActiveId)??proposalDeck.slides[0]):resourcePreviewSlide ?? editor.slide);
  let hiddenSlideCount = $derived(editor.deck?.slides.filter(s=>s.hidden).length ?? 0);
  let displayedDeck = $derived(proposalDeck ?? editor.deck);
  let hasImportReport = $derived(Boolean(editor.deck?.provenance || editor.deck?.slides.some(slide => slide.source)));
  let activeIndex = $derived(editor.deck?.slides.findIndex(s => s.id === editor.slide?.id) ?? 0);
  let fittedScale = $derived(editor.deck ? fitScale(editor.deck.width,editor.deck.height,availableW,availableH) : 1);
  let currentScale = $derived(zoomMode==='fit'?fittedScale:zoom);
  let stageWidth = $derived(editor.deck ? editor.deck.width*currentScale : 800);
  let warnings = $derived([...new Set(editor.deck?.slides.flatMap(s => s.source?.warnings ?? []) ?? [])]);
  $effect(()=>{if(!editor.deck)return;try{const modes=JSON.parse(localStorage.getItem('deck-studio-view-modes')||'{}');modes[editor.deck.id]=editor.sourceMode;localStorage.setItem('deck-studio-view-modes',JSON.stringify(modes));}catch{/* UI preference only */}});
  $effect(() => {
    document.title = editor.deck?.title ? `${editor.deck.title} · ${BRAND.name}` : `${BRAND.name} · ${BRAND.description}`;
  });
  $effect(() => { notificationUI.busy = busy; notificationUI.busyIndicator = !(modal === 'import' && documentImportBusy || modal === 'export' && Boolean(exportKind)); notificationUI.error = error; notificationUI.recoveryBusy = recoveringDraft; notificationUI.recover = recoverDraft; notificationUI.exportRecovery = exportRecoveryDraft; notificationUI.exportCopy = async () => {await exporting('json');}; notificationUI.dismissError = () => error = ''; });
  let recoveringDraft = $state(false);
  async function recoverDraft() {
    if (recoveringDraft) return;
    recoveringDraft = true;
    try { await editor.recoverAsCopy(); rememberDocument(editor.deck!.id); editor.notify('Recovery saved as a new document'); }
    catch (e: any) { error = e.message; }
    finally { recoveringDraft = false; }
  }
  $effect(() => {
    const fonts=editor.deck?.fonts,deferRelease=Boolean(busy);
    if(!fonts?.length&&!documentFonts)return;
    let cancelled=false;
    documentFonts??=import('./core/document-fonts').catch(e=>{documentFonts=undefined;throw e;});
    void documentFonts.then(({syncDocumentFonts})=>{if(!cancelled)return syncDocumentFonts(fonts,deferRelease);}).catch((e:Error)=>{if(!cancelled)error=e.message;});
    return ()=>{cancelled=true;};
  });

  $effect(() => {
    const deck = editor.deck;
    if (!deck?.onlineFonts?.length) return;
    let cancelled = false;
    void import('./core/online-fonts').then(({onlineFontUses,loadOnlineFont}) => {
      if (cancelled) return;
      return Promise.all(onlineFontUses(deck).map(use => loadOnlineFont(use.font, use.weight, use.sample, use.style)));
    }).catch((e: Error) => {
      if (!cancelled) error = `Online font unavailable: ${e.message}. Check your connection or choose a local font from the font library.`;
    });
    return () => { cancelled = true; };
  });
  function applyAppearance() {
    if (theme === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.palette = palette;
    setUIMotion(uiMotion);
    syncBrowserBrand();
    localStorage.setItem('deck-studio-settings', JSON.stringify({theme, palette, uiMotion, prototypeClientId, ai: {...aiSettings, apiKey: undefined}}));
  }
  let documentTitleDraft = $state('');
  $effect(() => { documentTitleDraft = editor.deck?.title || ''; });
  function renameCurrent(input:HTMLInputElement){if(!editor.deck||proposalDeck)return;const title=input.value.trim();if(!title){input.value=editor.deck.title;return;}if(title!==editor.deck.title)editor.commit([{op:'rename_deck',title}]);input.value=editor.deck.title;}
  function beginRename(id:string,title:string){renameTarget={id,title};renameValue=title;modal='rename';}
  async function applyRename(){if(!renameTarget||!renameValue.trim())return;try{if(editor.deck?.id===renameTarget.id)editor.commit([{op:'rename_deck',title:renameValue.trim()}]);else{const deck=await api(`/api/decks/${renameTarget.id}`);const next=applyOperations(deck,[{op:'rename_deck',title:renameValue.trim()}]);await api(`/api/decks/${deck.id}`,'PUT',{deck:next,expectedRevision:deck.revision});}await openLibrary();}catch(e:any){error=e.message;}}
  async function duplicateDocument(id?:string){if(proposalDeck||busy)return;busy='Duplicating…';try{const mode=editor.sourceMode;const deck=!id||id===editor.deck?.id?await editor.readDocument():await api(`/api/decks/${id}`);await editor.create(copyDeck(deck));rememberDocument(editor.deck!.id);modal='';editor.sourceMode=mode;editor.notify('Document duplicated');}catch(e:any){error=e.message;}finally{busy='';}}
  async function openHistory(){if(!editor.deck)return;try{await editor.flush();historyDeckId=editor.deck.id;historyItems=await api(`/api/decks/${historyDeckId}/history`);modal='history';}catch(e:any){error=e.message;}}
  async function restoreHistory(revision:number){try{const deck=await api(`/api/decks/${historyDeckId}/history/${revision}`);await editor.create(copyDeck(deck,`${deck.title} · Restored copy`));rememberDocument(editor.deck!.id);modal='';editor.notify('Version restored as a new document');}catch(e:any){error=e.message;}}
  function startSlideDrag(event:DragEvent,id:string){
    if(proposalDeck||!editor.deck){event.preventDefault();return;}
    if(!editor.selectedSlides.includes(id))editor.chooseSlide(id);
    draggedSlides=[...editor.selectedSlides];draggedSlide=id;slideDragBase={deckId:editor.deck.id,revision:editor.deck.revision};
    event.dataTransfer?.setData('application/x-deck-slide',id);if(event.dataTransfer)event.dataTransfer.effectAllowed='move';
  }
  function slideDragOver(event:DragEvent,target:string){
    event.preventDefault();const allowed=!proposalDeck&&Boolean(slideDragBase)&&event.dataTransfer?.types.includes('application/x-deck-slide')&&!draggedSlides.includes(target);
    if(event.dataTransfer)event.dataTransfer.dropEffect=allowed?'move':'none';if(!allowed){dropSlide='';return;}
    dropSlide=target;const r=event.currentTarget instanceof HTMLElement?event.currentTarget.getBoundingClientRect():null;
    if(r)dropAfter=innerWidth<=1100?event.clientX>r.x+r.width/2:event.clientY>r.y+r.height/2;
    const list=(event.currentTarget as HTMLElement).closest<HTMLElement>('.slide-list'),box=list?.getBoundingClientRect();
    if(list&&box){const horizontal=innerWidth<=1100,p=horizontal?event.clientX:event.clientY,min=horizontal?box.left:box.top,max=horizontal?box.right:box.bottom,delta=p<min+28?-16:p>max-28?16:0;if(delta)list.scrollBy(horizontal?{left:delta}:{top:delta});}
  }
  function canvasDragOver(event:DragEvent){event.preventDefault();dropSlide='';const allowed=!proposalDeck&&event.dataTransfer?.types.includes('Files');fileDropActive=Boolean(allowed);if(event.dataTransfer)event.dataTransfer.dropEffect=allowed?'copy':'none';}
  function slideDrop(event:DragEvent,target:string){
    event.preventDefault();if(proposalDeck||!editor.deck||!slideDragBase||slideDragBase.deckId!==editor.deck.id||!event.dataTransfer?.types.includes('application/x-deck-slide'))return;
    editor.dropSlides(draggedSlides,target,dropAfter,slideDragBase.revision);clearDropFeedback();
  }
  async function openLibrary() {
    const request = ++libraryRequest, from = modal;
    try {
      const entries = await api<LibraryDocument[]>('/api/decks?view=summary');
      if (request !== libraryRequest || modal !== from) return;
      library = entries; modal = 'library';
    } catch (e: any) { if (request === libraryRequest && modal === from) error = e.message; }
  }
  function rememberDocument(id:string){rememberActiveDocument(id);history.replaceState(null,'',workspaceDocumentURL(location.href,id));}
  async function openDeck(id: string, dismiss = true) { try { await exportFinished;await editor.open(id); rememberDocument(id); if (dismiss) modal = ''; } catch (e: any) { if (!dismiss) throw e; error = e.message; } }
  async function create(d: Deck) { try { await editor.create(d); rememberDocument(d.id); modal = ''; } catch (e: any) { error = e.message; } }
  function addSlideAfter(slideId:string) {
    if(!editor.deck?.slides.some(slide=>slide.id===slideId))return;
    finishInlineText();cancelInsertion();
    layoutTarget={deckId:editor.deck.id,slideId};modal='layout';
  }
  async function addLayout(input:Slide|Slide[],templateCollection?:Deck['templateCollection']) {
    if (!editor.deck || !editor.slide) return;
    const target=layoutTarget,afterId=target?.slideId??editor.slide.id;
    if(target&&(target.deckId!==editor.deck.id||!editor.deck.slides.some(slide=>slide.id===afterId))){closeModal();editor.notify('The target slide has changed. Choose it again.', 'warning');return;}
    let slides=Array.isArray(input)?input:[input];
    if (editor.deck.width !== 1440 || editor.deck.height !== 810){const captured=editor.deck;const {scaleTemplateSlide}=await import('./core/template-scaling');if(editor.deck!==captured||modal!=='layout'){editor.notify('The document has changed. Choose the slide again.', 'warning');return;}slides=slides.map(s=>scaleTemplateSlide(s,captured.width,captured.height));}
    editor.commit(slides.map((s,i)=>({op:'add_slide' as const,slide:s,afterId:i?slides[i-1].id:afterId,templateCollection}))); editor.chooseSlide(slides[0].id); layoutTarget=undefined;modal = '';
  }
  function cancelInsertion() { insertTool = null; insertBlock = null; imageQueue = []; imagePlacements = []; returnToResources = false; returnToResourceDialog = false; imageRequest++; }
  function continueImagePlacement() {
    if (imageQueue.length) { insertOrigin = {deckId:editor.deck!.id,slideId:editor.slide!.id,revision:editor.deck!.revision}; void tick().then(() => stage?.focus({preventScroll:true})); }
    else { const reopen=returnToResources, expanded=returnToResourceDialog; cancelInsertion(); if(reopen) { if(expanded)modal='resources';else openResources(undefined,resourceInitialKind); } else void focusCanvasSelection(); }
  }
  function historyAction(direction: 'undo' | 'redo', event?: MouseEvent, ordered=false) {
    if(!ordered&&editorCommands.busy){
      void editorCommands.run(stamp(),stamp,async()=>{
        if(!proposalDeck&&!presenting&&!modal)historyAction(direction,event,true);
        return stamp();
      }).catch(e=>editor.notify(e.message,'warning'));return;
    }
    const queued = insertTool === 'image' ? direction === 'undo' ? imagePlacements.at(-1) : imageQueue[0] : undefined;
    const next = direction === 'undo' ? editor.past.at(-1) : editor.future.at(-1);
    if (queued && editor.deck && editor.slide && placementHistoryMatch(editor.deck, next, editor.slide.id, queued.image.id, direction)) {
      if (direction === 'undo') { editor.undo(); imagePlacements = imagePlacements.slice(0,-1); imageQueue = [queued,...imageQueue]; imagePlaced--; }
      else { editor.redo(); imagePlacements = [...imagePlacements,queued]; imageQueue = imageQueue.slice(1); imagePlaced++; }
      continueImagePlacement();
      return;
    }
    if (insertTool === 'draw') {
      canvasHandle?.cancelPointer();
      direction === 'undo' ? editor.undo() : editor.redo();
      return;
    }
    cancelInsertion();
    const pageHistory=next&&editor.deck&&next.slides.map(slide=>slide.id).join(',')!==editor.deck.slides.map(slide=>slide.id).join(',');
    if(pageHistory||document.activeElement?.closest('.slide-rail,.focus-page-controls')){
      direction==='undo'?editor.undo():editor.redo();
      void focusSlideSelection();return;
    }
    if (!event && document.activeElement?.closest('.property-panel')) {
      const origin = document.activeElement;
      direction === 'undo' ? editor.undo() : editor.redo();
      void tick().then(() => { if (!availableFocus(document.activeElement)) restoreFocus(availableFocus(origin)?origin:null, document.querySelector<HTMLElement>('.panel-tabs [aria-selected="true"]'), stage); });
    } else void objectAction(() => direction === 'undo' ? editor.undo() : editor.redo(), event);
  }
  async function prepareImages(images: SlideElement[], returnAfter = false, items: ResourceItem[] = [], view?: ResourceLibraryView) {
    if (!editor.deck || !editor.slide || proposalDeck || !images.length) return;
    const fullLibrary = modal === 'resources';
    const request=++imageRequest, origin={deckId:editor.deck.id,slideId:editor.slide.id,revision:editor.deck.revision};
    mediaPlacement=await import('./core/media-placement');
    if(request!==imageRequest)return;
    if(editor.deck.id!==origin.deckId||editor.slide?.id!==origin.slideId||editor.deck.revision!==origin.revision)throw new Error('The document has changed. Choose the resources again.');
    mediaPlacement.validatePlacementImages(images);
    cancelInsertion();
    imageQueue = images.map((image, index) => ({image, item:items[index]})); imagePlaced = 0; imageTotal = images.length; returnToResources = returnAfter; returnToResourceDialog = returnAfter && fullLibrary;
    if (fullLibrary && view) resourceView = view;
    if (items[0]?.kind) resourceInitialKind = items[0].kind;
    insertOrigin = {deckId:editor.deck.id,slideId:editor.slide.id,revision:editor.deck.revision};
    editor.sourceMode = false; editor.hovered = ''; editor.additiveSelection = false; modal = ''; resourcePanel?.close(); insertTool = 'image';
    void tick().then(() => stage?.focus({preventScroll:true}));
  }
  function insert(type: PrimitiveInsertTool | 'draw', focus = true) {
    if (!editor.deck || !editor.slide || proposalDeck || editor.sourceMode) return;
    if (editor.editingId || insertingText) finishInlineText();
    resourcePanel?.close();
    if (insertTool === type) { cancelInsertion(); return; }
    cancelInsertion();
    insertOrigin = {deckId: editor.deck.id, slideId: editor.slide.id, revision: editor.deck.revision};
    insertTool = type; editor.hovered = ''; editor.additiveSelection = false;
    if (focus) void tick().then(() => stage?.focus({preventScroll:true}));
  }
  function placeElement(type: InsertTool, geometry: InsertGeometry, revision: number, slideId: string, text = '', textStyle:Partial<SlideElement>={}) {
    if (!editor.deck || editor.slide?.id !== slideId || proposalDeck || editor.sourceMode) return;
    if(type==='block'){
      if(!insertBlock||!blockPlacement||insertTool!=='block'||editor.deck.revision!==revision)return;
      const result=blockPlacement(insertBlock,geometry,slideId);
      editor.commit(result.operations,'','manual',revision);
      if(editor.slide.elements.some(e=>e.id===result.ids[0])){editor.selected=result.ids;editor.selectedGroup=result.groupId;panel='design';inspectorView='properties';cancelInsertion();void focusCanvasSelection();}
      return;
    }
    if (type === 'image') {
      const queued = imageQueue[0]; if (!queued || insertTool !== 'image') return;
      try {
        if (!mediaPlacement?.placeResourceImage(queued.image, geometry, revision, slideId, queued.item)) return;
        imagePlacements = [...imagePlacements,{...queued,image:{...queued.image,x:geometry.x,y:geometry.y,w:geometry.w,h:geometry.h}}];
        panel = 'design'; inspectorView = 'properties'; imageQueue = imageQueue.slice(1); imagePlaced++;
        continueImagePlacement();
      } catch(e:any) { error=e.message; }
      return;
    }
    cancelInsertion();
    const e = {...insertedElement(type, editor.deck, geometry, text, editor.slide),...textStyle};
    editor.add(e, revision);
    if (editor.slide.elements.some(item => item.id === e.id)) { editor.selected = [e.id]; panel = 'design'; inspectorView = 'properties'; void focusCanvasSelection(); }
  }
  async function imageFile(file: File) { return imageFiles([file]); }
  async function imageFiles(files: File[]) {
    if (!editor.deck || !editor.slide || !files.length) return;
    const request = ++imageRequest;
    const deckId = editor.deck.id, slideId = editor.slide.id, revision = editor.deck.revision;
    const replaceId = resourceOpen || modal === 'resources' ? resourceReplaceId : undefined;
    try {
      if (replaceId && files.length !== 1) throw new Error('Choose one image to replace the current image.');
      const {localImageElements} = await import('./core/local-images');
      const images = await localImageElements(files, editor.deck);
      if (editor.deck.id !== deckId || editor.slide?.id !== slideId || editor.deck.revision !== revision) throw new Error('The document has changed. Insert the images again.');
      if (request !== imageRequest) return;
      if (replaceId) {
        const {replaceLocalImage} = await import('./core/local-image-replacement');
        replaceLocalImage(images[0], replaceId, {deckId,slideId,revision}, resourceView?.replacement);
        resourcePreview = undefined; resourceLocalKeepOpen = false;
        resourcePanel?.close(); if (modal === 'resources') closeModal();
        void focusCanvasSelection(); return;
      }
      const returnAfter = (resourceOpen || modal === 'resources') && resourceLocalKeepOpen; resourceLocalKeepOpen = false;
      await prepareImages(images, returnAfter);
    } catch (e: any) { error = e.message; }
  }
  async function imported(files: FileList | File[]) {
    if (busy || !files.length) return;
    const actionRequest=workflowRequest?.action.kind==='import'&&workflowRequest.status==='waiting_for_user'?workflowRequest:undefined;
    busy = 'Importing…'; documentImportBusy = true; error = '';
    try {
      for (const f of Array.from(files)) {
        const { importFile } = await import('./importers');
        const d = await importFile(f, text => busy = text); await editor.create(d);
      }
      rememberDocument(editor.deck!.id); modal = 'fidelity';if(actionRequest)await workflowResult('completed',{message:'Imported as a new document',documentId:editor.deck!.id,state:'imported'},actionRequest);
    } catch (e: any) { error = e.message;if(actionRequest)await workflowResult('failed',{message:e.message,state:'failed'},actionRequest).catch(()=>{}); } finally { busy = ''; documentImportBusy = false; if (fileInput) fileInput.value = ''; }
  }
  let demoLoading = $state(false);
  async function openDemo() {
    if (demoLoading || busy) return;
    demoLoading = true; error = '';
    try {
      await (await import('./core/demo-file')).openSample(imported);
    } catch (failure) { error = (failure as Error).message; }
    finally { demoLoading = false; }
  }
  async function attachSource(file: File) {
    if (!editor.deck) return;
    busy = 'Attaching source reference…'; error = '';
    try {
      const {importPdf} = await import('./importers/pdf'); const pdf = await importPdf(await file.arrayBuffer(), file.name, text => busy = text);
      if (pdf.slides.length !== editor.deck.slides.length) throw new Error(`The PDF has ${countLabel(pdf.slides.length, "page")}; this document has ${countLabel(editor.deck.slides.length, "slide")}. Use a PDF of the same presentation.`);
      if (Math.abs(pdf.width/pdf.height - editor.deck.width/editor.deck.height) > .01) throw new Error('The PDF has a different aspect ratio. Export slides from the original app without print margins.');
      const next = editor.snapshot(); next.slides.forEach((s, i) => { s.source = {...(s.source ?? {provider: 'PDF', warnings: [], fidelity: 'source-render'}), render: pdf.slides[i].source!.render, label: file.name, fidelity: 'source-render'}; });
      editor.replace(next); editor.sourceMode = true; modal = 'fidelity';
    } catch (e: any) { error = e.message; } finally { busy = ''; sourceInput.value = ''; }
  }
  async function cloudImport() {
    if (busy) return;
    const actionRequest=workflowRequest?.status==='waiting_for_user'&&(workflowRequest.action.kind==='import'||workflowRequest.action.kind==='account'&&workflowRequest.action.provider==='figma'&&cloudTab==='figma')?workflowRequest:undefined;
    documentImportBusy = true;
    busy = `Importing from ${cloudTab === 'figma' ? 'Figma' : 'Google Slides'} …`; error = '';
    try {
      const bundle = await api(`/api/import/${cloudTab}`, 'POST', {url: cloudUrl, token: cloudToken});
      const d = cloudTab === 'figma' ? (await import('./importers/figma')).importFigma(bundle) : await (await import('./importers/google-native')).importGoogleBundle(bundle);
      await editor.create(d); rememberDocument(d.id); modal = 'fidelity'; cloudToken = ''; cloudUrl = '';if(actionRequest)await workflowResult('completed',{message:'Source imported as a new document',documentId:d.id,state:'imported'},actionRequest);
    } catch (e: any) { error = e.message;if(actionRequest)await workflowResult('failed',{message:e.message,state:'failed'},actionRequest).catch(()=>{}); } finally { busy = ''; documentImportBusy = false; }
  }
  function slideOrder(step: number, slideId=editor.activeId) {
    if (!editor.deck) return;
    const ids = editor.deck.slides.map(s => s.id), i = ids.indexOf(slideId), j = i + step;
    if (i < 0 || j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; editor.commit([{op: 'reorder_slides', ids}]);
  }
  function duplicateSlide() {
    if (editor.slide) duplicateSlideAt(editor.slide.id,true);
  }
  function duplicateSlideAt(slideId:string, activate=false) {
    const source=slideId===editor.activeId?editor.slide:editor.deck?.slides.find(slide=>slide.id===slideId);
    if(!source)return;
    const s = cloneDocumentData(source); s.id = uid('slide'); delete s.title;
    editor.commit([{op: 'add_slide', slide: s, afterId: slideId}]); if(activate)editor.chooseSlide(s.id);
  }
  async function exporting(kind: string):Promise<WorkflowReceipt|undefined> {
    if (!editor.deck || busy || proposalDeck) return;
    if(kind==='google'){modal='google-export';return {message:'Complete the Google export flow.',state:'awaiting_google_export'};}
    const original=exportView==='reference';
    if(original&&!referenceComplete&&['pptx','html','pdf','keynote'].includes(kind)){error='Attach a source reference to every slide first.';return;}
    busy = 'Exporting…'; exportKind = kind; error = ''; let exportMessage='Download started';
    let finishExport!:()=>void;exportFinished=new Promise(resolve=>finishExport=resolve);
    try {
      const d = await editor.readDocument();
      if (kind !== 'pdf') exportMessage = await (await import('./core/document-export-download')).downloadDocument(d, kind, original);
      if (kind === 'pdf') {
        const delivery=visibleDeliveryDeck(d);
        const print=await import('./components/PrintDocument.svelte');
        PrintDocument ??= print.default; await print.ready();
        if (!original && d.slides.some(s => s.elements.some(e => e.type === 'chart'))) await import('./core/chart-render');
        modal = ''; printOriginal=original; printMode = true;
        try {
          await tick(); await document.fonts.ready;
          const charts = original ? 0 : delivery.slides.reduce((n, s) => n + s.elements.filter(e => !e.hidden && e.type === 'chart').length, 0);
          const deadline = performance.now() + 5000;
          while (document.querySelectorAll('.print-pages [data-chart-rendered]').length < charts && performance.now() < deadline) await new Promise<void>(ok => requestAnimationFrame(() => ok()));
          if (document.querySelectorAll('.print-pages [data-chart-rendered]').length < charts) throw new Error('A chart could not render for printing. Close and try again.');
          await Promise.all([...document.querySelectorAll<HTMLImageElement>('.print-pages img')].map(image => image.decode().catch(() => {})));
          window.print();
        } finally {printMode=false;}
      }
      else { modal = ''; editor.notify(exportMessage); }
      return {message:kind==='pdf'?'Print dialog opened':'Export file prepared',state:kind==='pdf'?'awaiting_print':'download_started',fileName:`${deckFilename(d)}.${({json:'deck.json',potx:'potx',keynote:'key',pptx:'pptx',html:'html',broadser:'broadser.json',markdown:'md',pdf:'pdf'} as Record<string,string>)[kind]||kind}`};
    } catch (e: any) {
      error = /dynamically imported module|loading.*module|module script/i.test(e.message ?? '')
        ? 'The export tool could not load. Refresh the app and try again.'
        : e.message;
    } finally { busy = ''; exportKind = '';exportFinished=undefined;finishExport(); }
  }
  async function exportRecoveryDraft() {
    const draft = editor.recovery;
    if (!draft) return;
    try { download(await (await import('./core/document-json')).documentJsonBlob(draft, {space:2}), `${deckFilename(draft)}-recovery-draft.deck.json`); }
    catch (e: any) { error = e.message; }
  }
  const commands = [
    {label: 'Recent notifications', key: '', run: () => modal = 'notifications'},
    {label: 'Open document library', key: '', run: openLibrary}, {label: 'Create document from template', key: '', run: () => modal = 'templates'},
    {label: 'Import document', key: '', run: () => modal = 'import'}, {label: 'New slide', key: '', run: () => modal = 'layout'},
    {label: 'Import report', key: '', run: () => modal = 'fidelity'},
    {label: 'Layout suggestions', key: '', run: () => modal = 'auto-layout'},
    {label: 'Insert blocks', key: '', run: () => openBlocks()},
    {label: 'Slide details', key: '', run: openPageElements},
    {label: 'Document styles', key: '', run: () => openDocumentStyles()},
    {label: 'Insert text', key: 'T', run: () => insert('text')}, {label: 'Insert image', key: '', run: () => imageInput.click()},
    {label: 'Browse photos, icons, and illustrations', key: '', run: () => openResources()},
    {label: 'Embed interactive prototype', key: '', run: () => openPrototype()}, {label: 'Edit motion and transitions', key: '', run: () => showPanel('motion')},
    {label: 'Insert rectangle', key: 'R', run: () => insert('rect')}, {label: 'Insert ellipse', key: '', run: () => insert('ellipse')},
    {label: 'Insert table', key: '', run: () => insert('table')}, {label: 'Insert chart', key: '', run: () => { cancelInsertion(); modal = 'chart'; }},
    {label:'Hide current slide',key:'⇧⌘H',run:toggleSelectedSlidesHidden}, {label: 'Duplicate current slide', key: '', run: duplicateSlide}, {label: 'Undo', key: '⌘Z', run: () => historyAction('undo')},
    {label:'Create with AI',key:'',run:()=>modal='ai-create'},
    {label: 'Redo', key: '⇧⌘Z', run: () => historyAction('redo')}, {label: 'Open AI editor', key: '', run: () => showPanel('ai')},
    {label: 'Present document', key: '', run: () => startPresentation()}, {label: 'Export document', key: '', run: openExport},
    {label:'Publish presentation website',key:'',run:()=>{hostingConnectOnly=false;publishIncludeNotes=false;modal='publish';}},
    {label: 'Open font library', key: '', run: ()=>openFonts()},
    {label: 'Exit AI preview', key: '', run: returnCurrentVersion},
    {label: 'Open slides panel', key: '', run: () => void openSlidesPanel()}, {label: 'Open editing panel', key: '', run: () => void openEditingPanel()},
    {label: 'Toggle focus view', key: '⇧⌘\\', run: () => void setCanvasFocus(!canvasFocus)},
    {label: 'Settings', key: '⌘,', run: () => void toggleSettingsMenu()}, {label: 'Keyboard shortcuts', key: '?', run: () => modal = 'help'},
  ];
  const searchSuggestions = new Set(['Open document library','New slide','Insert text','Browse photos, icons, and illustrations']);
  let searchActions = $derived<SearchAction[]>([
    ...commands.filter(c => (c.label !== 'Exit AI preview' || Boolean(proposalDeck)) && (c.label !== 'Import report' || hasImportReport)).map(c => ({id:`command:${c.label}`, kind:'command' as const, label:c.label === 'Hide current slide' ? slideSelecting?(selectedSlidePages.every(slide=>slide.hidden)?'Unhide selected slides':'Hide selected slides'):editor.slide?.hidden?'Unhide current slide':'Hide current slide' : c.label === 'Browse photos, icons, and illustrations' ? 'Resource library' : c.label === 'Open document library' ? 'Document library' : c.label, searchText:c.label==='Hide current slide'?'Hide unhide skip unskip current slide 隐藏 跳过':c.label, key:c.key, suggested:searchSuggestions.has(c.label), disabled:commandBlocked(c), run:() => commandRun(c)})),
    ...(searchProviders?.blockSearchActions(openBlocks, !editor.deck || Boolean(proposalDeck) || editor.sourceMode) ?? []),
    ...(searchProviders?.documentSearchActions(editor.deck, jumpToSearchResult, Boolean(proposalDeck)) ?? []),
  ]);
  function jumpToSearchResult(slideId: string, objectId?: string) {
    const slide = editor.deck?.slides.find(slide => slide.id === slideId), object = objectId ? slide?.elements.find(object => object.id === objectId) : undefined;
    if (!slide || objectId && !object || proposalDeck) return;
    if (editor.editingId || insertingText) finishInlineText();
    cancelInsertion(); closeModal(); editor.chooseSlide(slideId);
    if (object) { editor.sourceMode = false; editor.selected = [object.id]; if (!canvasFocus && innerWidth > 760) showPanel('design'); inspectorView = object.hidden ? 'layers' : 'properties'; }
    if (innerWidth <= 760) rightOpen = false;
    void focusCanvasSelection();
  }
  const previewBlockedCommands = new Set(['Insert blocks', 'Import document', 'Create document from template', 'New slide', 'Layout suggestions', 'Document styles', 'Insert text', 'Insert image', 'Browse photos, icons, and illustrations', 'Embed interactive prototype', 'Edit motion and transitions', 'Insert rectangle', 'Insert ellipse', 'Insert table', 'Insert chart', 'Hide current slide', 'Duplicate current slide', 'Undo', 'Redo', 'Present document', 'Export document', 'Publish presentation website', 'Open font library']);
  function commandBlocked(c: typeof commands[number]) { return Boolean(proposalDeck) && previewBlockedCommands.has(c.label); }
  function commandRun(c: typeof commands[number]) { if (commandBlocked(c)) return; searchRequest++; modal = ''; c.run(); }
  function finishInlineText(cancel = false) {
    if (insertingText) { canvasHandle?.finishTextDraft(cancel); return; }
    canvasHandle?.finishTextEditing(cancel);
    if(!editor.editingId)void focusCanvasSelection();
  }
  const contextHost={
    get contextKey(){return `${editor.deck?.id}:${editor.deck?.revision}:${editor.activeId}:${editor.selected.join(',')}:${editor.selectedSlides.join(',')}:${editor.slideSelectionMode}:${editor.selectedContainer}:${modal}:${presenting}:${Boolean(proposalDeck)}:${editor.sourceMode}`;},
    get modal(){return modal;},get library(){return library;},get presenting(){return presenting;},get proposalDeck(){return Boolean(proposalDeck);},get insertTool(){return insertTool;},get canvasFocus(){return canvasFocus;},get busy(){return Boolean(busy);},
    openModal:(name:string)=>{layoutTarget=undefined;modal=name as Modal;},cancelPointer:()=>canvasHandle?.cancelPointer(),finishInlineText,cancelInsertion,openDeck,beginRename,duplicateDocument,returnCurrentVersion,showPanel,closePresentation,presentFrom:(id?:string)=>{startPresentation(id);},toggleSlideHidden,setSelectedSlidesHidden,addSlideAfter,duplicateSlide:(id:string)=>duplicateSlideAt(id),slideOrder:(id:string,step:number)=>slideOrder(step,id),enterEditable,setZoom,openResources,insert,historyAction,setCanvasFocus,showLayers:()=>{showPanel('design',false);inspectorView='layers';},openLibrary,openExport,
  };
  let EditorTooltip=$state<typeof import('./components/EditorTooltip.svelte').default>();
  let contextBoot:Promise<typeof import('./context-menu-bootstrap')>|undefined;
  let contextBridge:typeof import('./context-menu-bootstrap')|undefined;
  let contextRequest=0;
  setContext('numeric-editor',editor);
  onMount(()=>{
    let tooltipLoad:Promise<void>|undefined;
    const tooltip=(event:Event)=>{if(EditorTooltip||!(event.target instanceof Element)||!event.target.closest('button[title],button[aria-label]'))return;tooltipLoad??=import('./components/EditorTooltip.svelte').then(module=>{EditorTooltip=module.default;}).catch(()=>{tooltipLoad=undefined;});};
    const launch=async(event:MouseEvent|KeyboardEvent)=>{
      if(contextBridge?.ready()||!(event.target instanceof Element)||event.target.closest('.canvas-cell-grid'))return;
      const keyboard=event instanceof KeyboardEvent;
      if(keyboard&&(event.isComposing||!(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')))return;
      event.preventDefault();event.stopPropagation();
      const target=event.target instanceof HTMLElement?event.target:event.target.parentElement;if(!target)return;
      const request=++contextRequest,rect=target.getBoundingClientRect();
      const payload={target,keyboard,x:keyboard?rect.left+Math.min(rect.width/2,24):(event as MouseEvent).clientX,y:keyboard?rect.bottom:(event as MouseEvent).clientY};
      const released=event instanceof MouseEvent&&event.buttons?new Promise<void>(resolve=>{const release=()=>{clearTimeout(timer);document.removeEventListener('pointerup',release,true);resolve();};const timer=setTimeout(release,350);document.addEventListener('pointerup',release,true);}):Promise.resolve();
      contextBoot??=import('./context-menu-bootstrap');
      try{const bridge=await contextBoot;await released;if(request!==contextRequest)return;contextBridge=bridge;await bridge.openContext(payload,contextHost);}catch{contextBoot=undefined;editor.notify('The context menu could not load. Try again.', 'warning');}
    };
    document.addEventListener('contextmenu',launch,true);document.addEventListener('keydown',launch,true);
    document.addEventListener('pointerover',tooltip,true);document.addEventListener('focusin',tooltip,true);
    return()=>{contextRequest++;void contextBridge?.dispose();document.removeEventListener('contextmenu',launch,true);document.removeEventListener('keydown',launch,true);document.removeEventListener('pointerover',tooltip,true);document.removeEventListener('focusin',tooltip,true);};
  });
  function keyboard(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey) return;
    const target = event.target as HTMLElement;
    const typing = target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
    const cmd = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    const history = cmd && (key === 'z' || key === 'y' && !event.shiftKey);
    const historyDirection = key === 'y' || event.shiftKey ? 'redo' : 'undo';
    if (cmd && !event.shiftKey && key === 's') {
      event.preventDefault();
      if (presenting || modal || document.querySelector('dialog:modal,[popover]:popover-open:not([role="tooltip"])')) return;
      const field = typing instanceof HTMLElement ? typing : null;
      const caret = field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement ? {start:field.selectionStart,end:field.selectionEnd} : null;
      // Native change-on-blur commits only an edited field, preserving validation.
      field?.blur();
      void editor.flush();
      if (field?.isConnected) { field.focus({preventScroll:true}); if (caret?.start != null && caret.end != null && (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) field.setSelectionRange(caret.start,caret.end); }
      return;
    }
    if (presenting || modal || document.querySelector('dialog:modal')) return;
    if (cmd && !event.shiftKey && key === 'k') { event.preventDefault(); if (!event.repeat) toggleCommandSearch(); return; }
    if (cmd && !event.shiftKey && key === ',') { event.preventDefault(); if (!event.repeat) void toggleSettingsMenu(); return; }
    // A native popover owns dismissal and navigation before the editor does.
    if (document.querySelector('[popover]:popover-open:not([role="tooltip"])')) return;
    if (event.key === 'Escape' && proposalDeck && !typing) { event.preventDefault(); returnCurrentVersion(); return; }
    if (event.key === 'Escape' && compactPanelOpen && target.closest('.property-panel') && !typing) { event.preventDefault(); closeEditingPanel(); return; }
    if (event.key === 'Escape' && insertTool && !modal && !typing) { event.preventDefault(); cancelInsertion(); void focusCanvasSelection(); return; }
    if (event.key === 'Escape' && (editor.editingId || insertingText) && !modal && !typing) { event.preventDefault(); finishInlineText(true); return; }
    if (event.key === 'Escape') { if (modal || typing) return; if(editor.additiveSelection)editor.additiveSelection=false;else if(editor.exitGroup()){event.preventDefault();void focusCanvasSelection();}else if(editor.selectedContainer&&editor.slide&&ancestorIds(editor.slide,editor.selectedContainer)[0]){editor.chooseGroup(ancestorIds(editor.slide,editor.selectedContainer)[0]);event.preventDefault();}else if(!editor.selectedContainer&&editor.slide&&editor.selected.length===1&&ancestorIds(editor.slide,editor.selected[0])[0]){editor.chooseGroup(ancestorIds(editor.slide,editor.selected[0])[0]);event.preventDefault();}else if (editor.selected.length) { editor.selected = []; if(target.closest('.canvas-stage'))void focusCanvasSelection(); } else if (canvasFocus) { event.preventDefault(); void setCanvasFocus(false); } return; }
    // Clean property fields undo the committed document; unfinished drafts keep native text undo.
    const committedProperty = typing instanceof HTMLInputElement && typing.dataset.documentValue !== undefined && typing.value === typing.dataset.documentValue && typing.validity.valid && typing.getAttribute('aria-invalid') !== 'true';
    if (history && committedProperty && editor.deck && !proposalDeck) { event.preventDefault(); historyAction(historyDirection); return; }
    if (cmd && event.shiftKey && event.code === 'Backslash') { event.preventDefault(); finishInlineText(); void setCanvasFocus(!canvasFocus); return; }
    if (modal || typing || !editor.deck || !editor.slide) return;
    if (['Delete','Backspace'].includes(event.key) && (insertTool || event.repeat)) {
      event.preventDefault();
      if (insertTool) { cancelInsertion(); void focusCanvasSelection(); }
      return;
    }
    if (insertTool && ((cmd && !['z','meta','control','shift'].includes(event.key.toLowerCase())) || ['Delete','Backspace','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))) cancelInsertion();
    const canvas = Boolean(target.closest('.canvas-stage')) && !target.closest('button,a');
    const scope = clipboardScope(target), slides = scope === 'slide';
    // A dismissed or removed control can leave focus on body while objects stay selected.
    // Keep Delete attached to that selection, without taking keys from fields or other controls.
    const unfocusedDelete = ['delete','backspace'].includes(key) && (target === document.body || target === document.documentElement) && editor.selected.length > 0;
    const objects = !editor.sourceMode && (scope === 'objects' || unfocusedDelete);
    if (proposalDeck && (slides&&['backspace','delete'].includes(key)||(cmd && ['z', 'y', 'd', 'a', 'x', 'v', 'g'].includes(key)) || objects&&['backspace','delete'].includes(key) || (canvas && ((!cmd && event.shiftKey && key === 'a') || ['t', 'r', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key))))) { event.preventDefault(); return; }
    if(objects&&!cmd&&key==='enter'&&event.shiftKey){event.preventDefault();editor.selectParent();void focusCanvasSelection();}
    else if(canvas&&!cmd&&key==='enter'&&editor.selectedContainer){event.preventDefault();editor.enterGroup();editor.selectAll();void focusCanvasSelection();}
    else if (history) { event.preventDefault(); historyAction(historyDirection); }
    else if (cmd && !event.shiftKey && ['b','i','u'].includes(key) && objects) event.preventDefault();
    else if (cmd && key === 'g' && objects) { event.preventDefault(); if (!event.repeat && editor.selected.length) void containerAction(()=>editor.group(event.shiftKey),target); }
    else if (canvas && objects && !cmd && event.shiftKey && key === 'a' && editor.selected.length) { event.preventDefault(); editor.autoLayout(); }
    else if (cmd && event.shiftKey && key === 'h') { event.preventDefault(); if(!event.repeat)toggleSelectedSlidesHidden(); }
    else if (cmd && !event.shiftKey && key === 'd' && (objects || slides)) {event.preventDefault();if(!event.repeat){if(slides){editor.duplicateSlides();void focusSlideSelection();}else void objectAction(()=>editor.selected.length?editor.duplicateSelection():duplicateSlide());}}
    else if (!cmd&&slides&&(key==='delete'||key==='backspace')){event.preventDefault();if(!event.repeat){editor.deleteSlides();void focusSlideSelection();}}
    else if (cmd && !event.shiftKey && key === 'a' && objects) { event.preventDefault(); editor.selectAll(); }
    else if (cmd && event.shiftKey && key === 'v' && objects) { event.preventDefault(); if (!event.repeat) void pasteFromClipboard({inPlace:true}); }
    else if (objects && !cmd && (key === 'backspace' || key === 'delete') && editor.selected.length) { event.preventDefault(); void objectAction(() => editor.remove()); }
    else if (canvas && !cmd && !editor.sourceMode && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && editor.selected.length) { event.preventDefault(); const n = event.shiftKey ? 10 : 1; editor.commit(moveElements(editor.operationDocument(), editor.slide!.id, editor.selected, event.key === 'ArrowLeft' ? -n : event.key === 'ArrowRight' ? n : 0, event.key === 'ArrowUp' ? -n : event.key === 'ArrowDown' ? n : 0,editor.selectionScope), 'nudge'); }
    else if (canvas && !cmd && key === 't') { event.preventDefault(); if (!event.repeat) insert('text'); }
    else if (canvas && !cmd && key === 'r') { event.preventDefault(); if (!event.repeat) insert('rect'); }
    else if (canvas && !cmd && key === '?') modal = 'help';
  }
  function clipboard(event:ClipboardEvent){
    if(event.defaultPrevented||presenting||modal||document.querySelector('dialog:modal,[popover]:popover-open:not([role="tooltip"])'))return;
    const scope=clipboardScope(event.target);if(!scope||!editor.deck||!editor.slide)return;
    if(proposalDeck||editor.sourceMode&&scope==='objects'){event.preventDefault();return;}
    if(event.type==='paste'){cancelInsertion();pasteEvent(event,{slidesOnly:scope==='slide'});}
    else if(scope==='slide'||editor.selected.length)void copySelection({event,cut:event.type==='cut',...(scope==='slide'?{slideIds:editor.selectedSlides}:{} )});
  }
  onMount(() => {
    let disposed = false;
    try { const panes = JSON.parse(localStorage.getItem('deck-studio-pane-visibility') || '{}'); if (typeof panes.left === 'boolean') leftOpen = panes.left; if (typeof panes.right === 'boolean') rightOpen = panes.right; } catch { /* Keep responsive defaults. */ }
    try { const saved = JSON.parse(localStorage.getItem('deck-studio-settings') || '{}'); theme = saved.theme || theme; palette = saved.palette || palette; uiMotion = saved.uiMotion === 'reduced' ? 'reduced' : 'system'; prototypeClientId = saved.prototypeClientId || ''; aiSettings = {...aiSettings, ...saved.ai, apiKey: ''}; } catch { /* retain defaults */ }
    try{const panes=JSON.parse(localStorage.getItem('deck-studio-pane-widths')||'{}');if(Number.isFinite(panes.left))leftWidth=clampPaneWidth('left',panes.left);if(Number.isFinite(panes.right))rightWidth=clampPaneWidth('right',panes.right);paneCustomized=Number.isFinite(panes.left)||Number.isFinite(panes.right);}catch{/* use defaults */}
    viewportPanes();window.addEventListener('resize',viewportPanes);
    window.addEventListener('blur',cancelPane);
    window.addEventListener('blur',clearDropFeedback);window.addEventListener('dragend',clearDropFeedback);window.addEventListener('drop',clearDropFeedback);
    window.addEventListener('pointermove',resumeDropPointer);
    const cancelDropKey=(event:KeyboardEvent)=>{if((fileDropActive||draggedSlide||dropSlide)&&event.key==='Escape'&&!event.isComposing){event.preventDefault();event.stopPropagation();clearDropFeedback();}};
    window.addEventListener('keydown',cancelDropKey,true);
    const cancelPaneKey = (event:KeyboardEvent) => { if (paneGesture && event.key === 'Escape' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); cancelPane(); } };
    window.addEventListener('keydown',cancelPaneKey,true);
    applyAppearance();
    const disposeMotion = installUIMotion();
    const disposeViewport = installVisualViewport(size=>{viewportWidth=size.width;viewportHeight=size.height;});
    const disposeBrand = installBrowserBrand();
    const resourceLink = new URLSearchParams(location.search);
    const linkedLibrary = resourceLink.get('library');
    if(linkedLibrary==='deck-graphics'){resourceInitialKind='illustration';resourceInitialId=resourceLink.get('asset')||'deck-graphics:fine-dots';resourceInitialColor=resourceLink.get('accent')||undefined;try{const raw=resourceLink.get('recipe');if(raw)resourceInitialRecipe=GraphicRecipeSchema.parse(JSON.parse(raw));}catch{error='These graphic settings could not be loaded. The original material is available.';}}
    if (linkedLibrary === 'blue-black' || linkedLibrary === 'characters') {
      resourceInitialBlueBlack = true;
      if (linkedLibrary === 'blue-black') {
        resourceInitialId = resourceLink.get('asset') || undefined; resourceInitialColor = resourceLink.get('accent') || undefined;
      }
    }
    async function prepareWorkspace() {
      if (disposed) return;
      initializing = true; workspaceError = '';
      try {
        await initializeWorkspace({activeId:workspaceEntryId(location.search,readActiveDocument()),open:id=>openDeck(id,false)});
        // A deliberate sample link imports a fresh document through the normal
        // path. Consume it before opening so refresh never duplicates the sample.
        if (resourceLink.get('demo') === '1') {
          const cleanURL = new URL(location.href); cleanURL.searchParams.delete('demo');
          history.replaceState(null, '', cleanURL.pathname + cleanURL.search + cleanURL.hash);
          if (!editor.deck && !disposed && !resourceLink.has('document')) await openDemo();
        }
        // Website template links create one new document through the same path as Templates.
        if (resourceLink.has('template')) {
          const linkSearch = '?' + resourceLink.toString();
          const cleanURL = new URL(location.href); cleanURL.searchParams.delete('template');
          history.replaceState(null, '', cleanURL.pathname + cleanURL.search + cleanURL.hash);
          const {COLLECTIONS, templateDeck, embedTemplateArtwork} = await import('./core/templates');
          const templateId = workspaceTemplateId(linkSearch, COLLECTIONS.map(c => c.id));
          if (templateId && !editor.deck && !disposed) {
            busy = 'Opening template…';
            try { await create(await embedTemplateArtwork(templateDeck(templateId))); }
            catch { error = 'The template could not open. Choose it from Templates.'; }
            finally { busy = ''; }
          }
        }
        if (!editor.deck || disposed || !['blue-black','characters','deck-graphics'].includes(linkedLibrary || '')) return;
        void tick().then(()=>resourcePanel?.show());
        const cleanURL=new URL(location.href);for(const key of ['library','asset','accent','recipe'])cleanURL.searchParams.delete(key);
        history.replaceState(null,'',cleanURL.pathname+cleanURL.search+cleanURL.hash);
      } catch (failure: any) { if (!disposed) workspaceError = workspaceOpenError(failure); }
      finally { if (!disposed) initializing = false; }
    }
    workspaceRetry = () => { void prepareWorkspace(); };
    workspaceRetry();
    // Auxiliary services never hold up the current document.
    void api('/api/health').then(data => { health = data; if (!aiSettings.model && data.ai.model) aiSettings.model = data.ai.model; }).catch(() => {});
    let resizeFrame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(measureStage);
    });
    let workflowPolling=false;
    const workflowInterval=setInterval(()=>{reportEditorContext();if(document.hidden||!editor.deck||workflowPolling||workflowBusy||workflowRequest&&!(presenting&&workflowRequest.status==='completed'&&workflowRequest.action.kind==='presentation'))return;const deckId=editor.deck.id;workflowPolling=true;void api(`/api/workflows?deckId=${encodeURIComponent(deckId)}`).then(async(items:unknown[])=>{if(disposed||editor.deck?.id!==deckId||!items.length)return;const {WorkflowRequestSchema}=await import('./core/workflows');if(disposed||editor.deck?.id!==deckId)return;const next=items.map(item=>WorkflowRequestSchema.parse(item)).find(w=>['pending','waiting_for_user','failed'].includes(w.status)||w.status==='running'&&(w.leaseUntil??0)<Date.now());if(!next)return;workflowRequest=next;if(next.action.kind==='presentation')void runWorkflow();else showPanel('ai');}).catch(()=>{}).finally(()=>workflowPolling=false);},1000);
    let polling = false;
    const interval = setInterval(() => {
      if (document.hidden || !editor.deck || editor.pending || polling) return;
      const deckId = editor.deck.id; polling = true;
      void api(`/api/decks/${deckId}/proposals`).then((ps: any[]) => {
        if (disposed || editor.deck?.id !== deckId || editor.pending || !ps.length) return;
        editor.pending = ProposalSchema.parse(ps[0].proposal); editor.pendingId = ps[0].id; panel = 'ai'; rightOpen = true;
      }).catch(() => {}).finally(() => { polling = false; });
    }, 8000);
    if (stage) observer.observe(stage);
    const persist = () => { if (editor.dirty) { void editor.backup(); void editor.flush(); } };
    const visibility = () => { if (document.visibilityState === 'hidden') { cancelPane(); clearDropFeedback(); persist(); } };
    document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', persist);
    return () => { window.removeEventListener('resize',viewportPanes);window.removeEventListener('blur',cancelPane);window.removeEventListener('blur',clearDropFeedback);window.removeEventListener('dragend',clearDropFeedback);window.removeEventListener('drop',clearDropFeedback);window.removeEventListener('pointermove',resumeDropPointer);window.removeEventListener('keydown',cancelDropKey,true);window.removeEventListener('keydown',cancelPaneKey,true);cancelPane();disposed = true; disposeViewport(); disposeMotion(); disposeBrand(); observer.disconnect(); cancelAnimationFrame(resizeFrame); clearInterval(interval);clearInterval(workflowInterval); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', persist); };
  });
  $effect(() => {
    if (!editor.dirty) return;
    const unload = (event: BeforeUnloadEvent) => { if (editor.dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  });
</script>

{#snippet resourceContent(compact: boolean)}
  <AsyncFeature feature="resources" props={{initialConnectionProvider:!compact&&workflowRequest?.action.kind==='account'&&workflowRequest.action.provider==='photos'&&workflowRequest.status==='waiting_for_user'?workflowRequest.action.photoProvider??'unsplash':undefined,onconnection:(statuses:any[])=>{if(workflowRequest?.action.kind==='account'&&workflowRequest.action.provider==='photos'){const source=statuses.find(item=>item.id===(workflowRequest!.action.kind==='account'?workflowRequest!.action.photoProvider??'unsplash':''));if(source?.configured)void workflowResult('completed',{message:'Photo provider connection verified',provider:source.id,state:'connected'});}},replaceId: resourceReplaceId, initialKind: resourceInitialKind, initialResourceId: resourceInitialId, initialColor: resourceInitialColor, initialGraphicRecipe:resourceInitialRecipe, initialBlueBlack: resourceInitialBlueBlack, compact, quickView: compact ? resourceQuickView : undefined, onviewchange: compact ? resourceViewChanged : undefined, onpreview: (preview?: ResourceReplacementPreview) => { resourcePreview = preview; }, initialView: compact ? undefined : resourceView, onexpand: expandResources, onexpandcontrol: compact ? resourceExpandControlChanged : undefined, onclose: () => { if (compact) resourcePanel?.close(); else closeModal(); }, onplace: prepareImages, onlocal: (continueBrowsing?: boolean, view?: ResourceLibraryView) => { if (view) resourceView = view; resourceLocalKeepOpen = continueBrowsing === true; imageInput.click(); }}} />
{/snippet}

{#snippet settingsContent(compact: boolean)}
  <AsyncFeature feature="settings" props={{compact, onMoreSettings: () => void openSettingsTab('appearance'), settingsTab, onTab: (value: string) => settingsTab = value, theme, palette, uiMotion, leftOpen, rightOpen, setPaneVisibility,
          onTheme: (value: string) => { theme=value; applyAppearance(); }, onPalette: (value: string) => { palette=value; applyAppearance(); }, onMotion: (value: UIMotionPreference) => { uiMotion=value; applyAppearance(); },
          aiSettings, onAISettings: (patch: Partial<AISettings>) => { aiSettings = {...aiSettings, ...patch}; if (!('apiKey' in patch)) applyAppearance(); }, serverConfigured: Boolean(health?.ai?.configured), aiOpenLabel:aiCreationSettingsReturn?'Continue creation':'Open AI editor', aiModels, aiConnection, modelsBusy, modelsFailed, applyAppearance, findAIModels, onOpenAI: () => { applyAppearance();if(aiCreationSettingsReturn){aiCreationSettingsReturn=false;modal='ai-create';}else{closeModal();settingsMenu?.close();showPanel('ai');} },
          prototypeClientId, onPrototypeClientId: (value: string) => { prototypeClientId=value; applyAppearance(); }, onPrototype: () => openPrototype(), hasDocument: Boolean(editor.deck), previewing: Boolean(proposalDeck), onLibrary: openLibrary, onHelp: () => modal='help'}} />
{/snippet}



<svelte:document onfocusin={rememberFocus} />
<svelte:window onkeydown={keyboard} oncopy={clipboard} oncut={clipboard} onpaste={clipboard} />

{#if EditorTooltip}<EditorTooltip />{/if}
<input hidden type="file" accept=".pptx,.key,.pdf,.json" bind:this={fileInput} onchange={(e) => e.currentTarget.files && imported(e.currentTarget.files)} />
<input hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" multiple={!(resourceReplaceId && (resourceOpen || modal === 'resources'))} bind:this={imageInput} onchange={(e) => { const files = Array.from(e.currentTarget.files || []); if (files.length) void imageFiles(files); e.currentTarget.value = ''; }} />
<input hidden type="file" accept=".pdf" bind:this={sourceInput} onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void attachSource(f); }} />



{#if printMode && editor.deck && PrintDocument}
  <PrintDocument deck={editor.deck} original={printOriginal} />
{:else}
  <div class="editor-app" class:welcome-workspace={!editor.deck} class:is-presenting={presenting} class:canvas-focused={canvasFocus} class:short-workspace={shortWorkspace} class:inline-text-active={Boolean(editor.editingId||insertingText)} data-task={task}>
    <a class="skip-link" href="#workspace-canvas" onclick={event=>{event.preventDefault();if(footerObscured)rightOpen=false;void focusCanvasSelection();}}>Skip to canvas</a>
    {#if editor.deck}<a class="skip-link" href="#editing-panel" onclick={event=>{event.preventDefault();showPanel(panel,false);void focusEditingPanel();}}>Skip to editing panel</a>{/if}
    <header class="topbar" inert={canvasFocus}>
      <div class="topbar-left"><button class="icon-btn brand-button" onclick={openLibrary} aria-label="Decksprig · Open document library" data-tooltip="Open library"><BrandLockup /></button>{#if editor.deck}<div class="document-controls"><div class="document-title-field"><span class="document-title-size" aria-hidden="true">{documentTitleDraft || 'Document title'}</span><input class="document-name" aria-label="Document title" title={editor.deck?.title} bind:value={documentTitleDraft} placeholder="Document title" maxlength="300" disabled={!editor.deck||Boolean(proposalDeck)} onfocus={event=>event.currentTarget.select()} onchange={event=>{renameCurrent(event.currentTarget);documentTitleDraft=event.currentTarget.value;}} onkeydown={event=>{if(event.isComposing||event.keyCode===229)return;if(event.key==='Enter'||event.key==='Escape'){event.preventDefault();event.stopPropagation();if(event.key==='Escape'){documentTitleDraft=editor.deck?.title||'';event.currentTarget.value=documentTitleDraft;}event.currentTarget.blur();void focusCanvasSelection();}}}/></div><ActionMenu label="Document menu" disabled={!editor.deck||Boolean(proposalDeck)} items={[{label:'Open document library',icon:BookOpen,onselect:openLibrary},{label:'New document from template',icon:LayoutTemplate,onselect:()=>modal='templates'},{label:'Rename document',onselect:()=>document.querySelector<HTMLInputElement>('.document-name')?.focus()},{label:'Duplicate document',icon:Copy,onselect:()=>void duplicateDocument()},{label:'Import document',icon:Upload,divider:true,onselect:()=>modal='import'},{label:'Export document',icon:Download,onselect:openExport},{label:'Publish presentation website',icon:ExternalLink,onselect:()=>{hostingConnectOnly=false;publishIncludeNotes=false;modal='publish';}},...(hasImportReport?[{label:'Import report',icon:Info,onselect:()=>modal='fidelity'}]:[]),{label:'Undo',shortcut:'⌘Z',disabled:!editor.past.length,onselect:event=>historyAction('undo',event)},{label:'Redo',shortcut:'⇧⌘Z',disabled:!editor.future.length,onselect:event=>historyAction('redo',event)},{label:'Slide details',icon:FileText,divider:true,onselect:openPageElements},{label:'Document styles',icon:DocumentStylesIcon,onselect:()=>openDocumentStyles()},...(editor.deck?.slides.some(s=>s.elements.some(e=>isThemedIllustration(e.resource)))?[{label:'Illustration colors',onselect:()=>modal='illustration-colors'}]:[]),{label:'Document fonts',icon:Type,onselect:()=>{fontLibraryTab='document';modal='fonts';}},{label:'Version history',icon:History,onselect:()=>void openHistory()},{label:'Recent notifications',icon:History,onselect:()=>modal='notifications'},...(slidesHidden?[{label:'Open slides panel',icon:Layers,divider:true,onselect:()=>void openSlidesPanel()}]:[]),...(!rightOpen?[{label:'Open editing panel',icon:PanelRight,divider:!slidesHidden,onselect:()=>void openEditingPanel()}]:[]),{label:'Open AI editor',icon:Sparkles,divider:true,onselect:()=>showPanel('ai')}]} /></div>{/if}{#if editor.dirty}<span class="save-state" role="status" aria-atomic="true" data-saving={editor.dirty} data-save-error={editor.saveState.startsWith('Not saved')} use:uiChange={editor.saveState}>{editor.saveState}</span>{/if}</div>
      <div class="topbar-right">
        {#if source?.render && !proposalDeck}<div class="canvas-version"><ActionMenu label="Slide version" iconOnly={viewportWidth<=760} items={[{label:"Editable version",checked:!editor.sourceMode,onselect:()=>editor.sourceMode=false},{label:"Source reference",checked:editor.sourceMode,onselect:()=>{editor.sourceMode=true;editor.selected=[];editor.additiveSelection=false;editor.layerPickerId="";}}]}>{#if viewportWidth<=760}{#if editor.sourceMode}<BookOpen size={16}/>{:else}<MousePointer2 size={16}/>{/if}{:else}<span>{editor.sourceMode ? "Source" : "Editable"}</span>{/if}</ActionMenu></div>{/if}
        <div class="topbar-actions" role="group" aria-label="Workspace tools">
          <CommandSearch bind:this={commandSearch} actions={searchActions} onprepare={prepareSearchActions} onexpand={expandSearch} />
          <PopoverPanel onerror={message=>editor.notify(message,'warning')} bind:this={settingsMenu} title="Settings" iconOnly class="settings-popover" width={320} height={640} autoHeight>
            {#snippet trigger()}<Settings2 size={16} aria-hidden="true" />{/snippet}
            {@render settingsContent(true)}
          </PopoverPanel>
        </div>
        {#if editor.deck}<div class="topbar-actions" role="group" aria-label="Document actions">
          <Button variant="secondary" class="present-entry" aria-label="Present" onclick={() => startPresentation()} title={editor.deck?.slides.every(s=>s.hidden)?'Unhide a slide before presenting':'Present'} disabled={!editor.deck || Boolean(proposalDeck) || editor.deck.slides.every(s=>s.hidden)}><Play size={16} aria-hidden="true" /><span>Present</span></Button>
        </div>{/if}
      </div>
    </header>
    <span id="slide-rail-help" hidden>Arrows/Home/End navigate slides. Shift extends selection; Command or Control click toggles slides; Space toggles the focused slide; Command or Control A selects all. Command or Control D duplicates; Delete removes selected slides. Alt and arrows move the selection; Alt Home or End moves it to either end. On touch, use Slide actions or drag the selection grip. Hidden slides stay editable and are skipped in presentation.</span>
    <span id="editor-toolbar-help" hidden>Tab enters/leaves; arrows navigate buttons; Home/End jump to ends.</span>
    <div class="workspace" class:selecting-slides={slideSelecting} class:left-hidden={!editor.deck || slidesHidden || canvasFocus} class:right-hidden={!editor.deck || !rightOpen || canvasFocus} class:is-resizing={resizing} style:--ui-rail-width={`${leftWidth}px`} style:--ui-panel-width={`${displayedRightWidth()}px`}>
    <div class="workspace-feedback" class:feedback-in-dialog={Boolean(notificationUI.dialog)} inert={Boolean(notificationUI.dialog)} aria-hidden={Boolean(notificationUI.dialog)}><NotificationOutlet kind="feedback"/></div>
      <aside id="slides-panel" class="slide-rail" aria-label="Slides" inert={!editor.deck || slidesHidden || canvasFocus || footerObscured}><div class="rail-content">
        {#if SlideRail}<SlideRail proposalDeck={Boolean(proposalDeck)} previewDocument={proposalDeck} {previewActiveId} onPreviewSelect={id=>previewActiveId=id} {viewportWidth} {leftWidth} {draggedSlide} {draggedSlides} {dropSlide} {dropAfter} onDragStart={startSlideDrag} {slideDragOver} onDragLeave={event=>{if(!(event.relatedTarget instanceof Node)||!(event.currentTarget as HTMLElement).contains(event.relatedTarget))dropSlide='';}} {slideDrop} onDragEnd={clearDropFeedback} {toggleSlideHidden} {setSelectedSlidesHidden} onAdd={()=>modal='layout'} {duplicateSlide} slideOrder={step=>slideOrder(step)}/>{/if}
      </div><!-- Keyboard adjustable split-pane separator. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="pane-resizer left-resizer" class:gesture-pane={resizing&&paneGesture?.side==='left'} role="separator" tabindex="0" aria-label="Resize slides panel" aria-orientation="vertical" aria-valuemin="140" aria-valuemax="320" aria-valuenow={leftWidth} onpointerdown={event=>resizePane(event,'left')} onpointermove={movePane} onpointerup={finishPane} onpointercancel={cancelPane} onlostpointercapture={cancelPane} onkeydown={event=>paneKey(event,'left')}></div></aside>
      <main class="stage-column" inert={footerObscured}>
        <span id="canvas-keyboard-help" hidden>Canvas: T text, R rectangle. Tap/click places; drag sizes. Touch: pan empty space, pinch zooms. Ctrl/Command + plus/minus zooms; 0 fits. Scroll changes slides when the full page is visible; zoomed view scrolls within the slide. Shift + wheel pans horizontally. Ctrl/Command + wheel zooms at pointer. Arrows move preview. Enter previews, then places. Escape cancels.</span>
        <div class="canvas-viewport">
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div id="workspace-canvas" class="canvas-stage" data-clipboard-blocked={Boolean(proposalDeck||presenting||modal)} use:canvasViewport={{scale:currentScale,fit:zoomMode==='fit',key:editor.deck?.id??'',slideKey:editor.activeId,pageBlocked:Boolean(!editor.deck||editor.editingId||insertingText||insertTool||proposalDeck||presenting||modal),page:nextSlide,zoom:setZoom,cancel:()=>canvasHandle?.cancelPointer()}} use:canvasTouch={{scale:()=>currentScale,zoom:setZoom,cancel:()=>canvasHandle?.cancelPointer(),key:`${editor.deck?.id}:${editor.slide?.id}:${editor.sourceMode}:${Boolean(proposalDeck)}`,editing:Boolean(editor.editingId||insertingText)}} class:manual-zoom={zoomMode==='scale'} class:is-file-drop={fileDropActive} bind:this={stage} tabindex="0" onpointerdown={e => { if (e.target === e.currentTarget) { if(!insertTool&&!editor.sourceMode&&!proposalDeck&&canvasHandle)canvasHandle.beginMarquee(e);else if(!insertTool&&!proposalDeck)editor.selected=[];editor.hovered='';e.currentTarget.focus({preventScroll:true}); } }} ondragenter={enterFileDrop} ondragleave={leaveFileDrop} ondragover={canvasDragOver} ondrop={(e) => { e.preventDefault(); fileDropActive=false;fileDragDepth=0; if (proposalDeck || !e.dataTransfer?.files.length) return; insertTool=null; if (e.dataTransfer.files.length) { const f = e.dataTransfer.files[0]; f.type.startsWith('image/') ? void imageFiles(Array.from(e.dataTransfer.files)) : void imported(e.dataTransfer.files); } }} role="region" aria-label="Slide canvas" aria-describedby="canvas-keyboard-help">
          {#if editor.deck && editor.slide}
            <div class="stage-canvas" use:uiChange={`${editor.deck.id}:${editor.slide.id}:${editor.sourceMode}:${Boolean(proposalDeck)}`} style:width="{stageWidth}px" data-shadow-owner="slide-canvas">{#if SlideCanvas}<SlideCanvas bind:this={canvasHandle} deck={editor.deck} slide={displayedSlide!} interactive={!editor.sourceMode && !proposalDeck && !resourcePreviewSlide} original={editor.sourceMode && !proposalDeck} {insertTool} {insertImage} {insertBlock} onplace={placeElement} oninsertcancel={cancelInsertion} oncellselection={active=>canvasCellsSelected=active} ontextdraft={active => {insertingText=active; if(active)insertTool=null;}} onprototype={openPrototype} />{:else}<div role="status">Loading canvas…</div>{/if}</div>
          {:else if initializing}
            <EmptyState busy title="Opening workspace…" description="Preparing the editor and your document." />
          {:else if workspaceError}
            <EmptyState icon={AlertCircle} tone="error" role="alert" title="Workspace could not open" description={workspaceError}><Button variant="secondary" onclick={()=>workspaceRetry()}>Try again</Button><Button onclick={openLibrary}><BookOpen size={16}/>Open document library</Button></EmptyState>
          {:else}
            <AsyncFeature feature="welcome" props={{ontemplates:collection=>{templateStart=collection;modal='templates';},onblank:()=>create(newDeck('Untitled document',[blankSlide()])),onimport:()=>modal='import',onlibrary:openLibrary,onai:()=>modal='ai-create',ondemo:openDemo,demoLoading}} />
          {/if}
          {#if !editor.croppingId && !canvasCellsSelected && !editor.sourceMode && !proposalDeck && !insertTool && (insertingText || editor.selection.length || editor.additiveSelection)}
            <div class="selection-context ui-floating-toolbar" use:editorToolbar use:selectionToolbar={{ids: editor.selected, editingId: editor.editingId, revision: editor.deck?.revision, scale: currentScale, draft: insertingText, docked: shortWorkspace}} role="toolbar" aria-label="Selected object actions">
              {#if !(editor.selection.length===1&&editor.selection[0].type==='line'&&!editor.selection[0].locked)}<span title={editor.selection.length===1?editor.selection[0].name:undefined}>{insertingText ? 'Text' : editor.selection.length === 1 ? elementLabel(editor.selection[0]) : editor.selection.length ? countLabel(editor.selection.length, "object") : 'Select objects'}</span>{/if}
              {#if !editor.editingId && !insertingText && editor.selection.length>1}<AsyncFeature feature="selection-actions" props={{onproperties:()=>showPanel('design'),mode:'primary'}}/>{/if}
              {#if editor.editingId || insertingText || (editor.selection.length && editor.selection.every(e=>e.type==='text') && !editor.selection.every(e=>e.locked))}
                <AsyncFeature feature="text-formatting" props={{inline:Boolean(editor.editingId||insertingText),readInline:()=>canvasHandle?.getTextFormatState()??null,onformat:(patch,range)=>canvasHandle?.formatText(patch,range)}}/>
              {/if}
              {#if !editor.croppingId && !editor.editingId && !insertingText && editor.selection.some(e=>e.type!=='text'&&!e.locked)}
                {#key editor.selected.join(':')+editor.selection.map(e=>e.locked).join(':')}
                  <AsyncFeature feature="element-formatting" props={{ondraw:()=>insert('draw'),onresources:(id,anchor)=>openResources(id,undefined,anchor),onprototype:openPrototype}}/>
                {/key}
              {/if}
              {#if editor.editingId || insertingText}
                <div class="selection-completion-actions"><button class="text-btn" aria-label="Done editing text" title="Done editing text" onpointerdown={event => event.preventDefault()} onclick={() => finishInlineText()}><Check size={16} /><span class="selection-completion-label">Done</span></button><button class="text-btn" aria-label="Cancel text editing" title="Cancel text editing" onpointerdown={event => event.preventDefault()} onclick={() => finishInlineText(true)}><X size={16}/><span class="selection-completion-label">Cancel</span></button></div>
              {:else}
                {#if editor.selection.length === 1 && canEditText(editor.selection[0]) && !editor.selection[0].locked}<button class="text-btn" aria-label={editor.selection[0].type==='line'&&!editor.selection[0].text?'Add text':'Edit text'} onclick={() => {editor.additiveSelection=false;editor.editingId = editor.selection[0].id;}} title="Edit text · Enter"><Type size={16} /><span class="selection-secondary-label">{editor.selection[0].type==='line'&&!editor.selection[0].text?'Add text':'Edit text'}</span></button>{/if}
                {#if editor.selection.length && editor.selection.every(e => e.locked)}<button class="text-btn" aria-label="Unlock" title="Unlock selection" onclick={() => editor.patch({locked: false})}><Unlock size={16}/><span class="selection-secondary-label">Unlock</span></button>{/if}
                <AsyncFeature feature="selection-actions" props={{onproperties:()=>showPanel('design'),mode:editor.selection.length>1?'more':'all'}}/>
              {/if}
            </div>
          {/if}
        </div>
        <div class="canvas-overlay" use:canvasOverlay>
          <div class="canvas-overlay-top">
          <div class="canvas-meta" class:has-hidden-slide={displayedSlide?.hidden} hidden={!displayedSlide?.hidden && !canvasFocus}>{#if displayedSlide?.hidden}<SlideVisibilityNotice allHidden={Boolean(displayedDeck?.slides.every(s=>s.hidden))} preview={Boolean(proposalDeck)} onunhide={()=>toggleSlideHidden()}/>{/if}{#if canvasFocus}<span class="focus-document">{editor.deck?.title}<span class="focus-separator">/</span>{slideLabel(activeIndex)}</span>{/if}</div>
          {#if editor.editingGroup&&!editor.sourceMode&&!proposalDeck&&!insertTool}<div class="canvas-group-navigation"><AsyncFeature feature="group-navigation" props={{}}/></div>{/if}
          {#if fileDropActive}<div class="canvas-drop-feedback" aria-hidden="true"><span>Drop files here</span></div>{/if}
          </div>
          <div class="canvas-overlay-bottom">
          {#if proposalDeck}<div class="task-preview-caption" role="status"><Sparkles size={14} /><span>AI change preview · Not applied</span><Button variant="secondary" aria-label="Exit preview and return to the current version" onclick={returnCurrentVersion}>Exit preview</Button></div>{:else if !editor.sourceMode && insertTool && insertTool !== 'draw'}<div class="insertion-status" class:has-asset={Boolean(insertImage)} role="status"><span>{#if insertImage}<img class="insertion-thumbnail" src={insertImage.src} alt="" /><span class="insertion-asset-label"><b>{isGraphicBackground(insertImage.resource?.id) ? 'Area fill' : insertImage.resource?.kind === 'icon' ? 'Icon' : insertImage.resource?.kind === 'illustration' ? 'Illustration' : 'Image'} <span class="insertion-default-size" title="Default size in page pixels">{insertSize}</span></b><small title={insertImage.name}>{imageTotal > 1 ? `${imagePlaced + 1} of ${imageTotal} · ` : ''}{insertImage.name}</small></span>{:else}<span class="insertion-asset-label"><b>{insertBlock?.name ?? insertLabels[insertTool]}</b><small>{insertSize}</small></span>{/if}<span class="insertion-instructions" title="Arrow keys position the preview · Shift + Arrow moves 10 px · Enter places · Esc cancels">{insertImage && isGraphicBackground(insertImage.resource?.id) ? 'Drag to fill an area · Click for default size' : insertTool === 'text' ? 'Click to type · Drag a text box' : 'Click to place · Drag to size'}</span></span><button class="text-btn" onclick={() => {cancelInsertion();void focusCanvasSelection();}} aria-label="Cancel insertion"><X size={14} /><span>Cancel</span><kbd>Esc</kbd></button></div>{/if}
          </div>
        </div>
        </div>
        {#if editor.deck}
        <footer class="stage-footer" class:compact-panel-layout={compactPanelOpen && !footerObscured} class:panel-obscured={footerObscured} inert={footerObscured} style:--compact-canvas-width={`${Math.max(0,compactCanvasWidth)}px`} aria-label="Canvas view tools">
          <div class="canvas-utility-left">
            {#if !canvasFocus && !proposalDeck}<button class="text-btn" class:active={notesOpen} aria-label="Notes" title="Notes" aria-pressed={notesOpen} onclick={() => notesOpen = !notesOpen}><FileText size={14} /><span>Notes</span></button>{/if}
          {#if canvasFocus || slidesHidden}<div class="focus-page-controls" tabindex="-1" role="group" aria-label="Slide navigation"><button class="icon-btn small" aria-label="Previous slide" disabled={activeIndex <= 0} onclick={() => nextSlide(-1)}><ArrowLeft /></button><span class="slide-count">{activeIndex + 1} / {editor.deck?.slides.length ?? 0}</span><button class="icon-btn small" aria-label="Next slide" disabled={activeIndex >= (editor.deck?.slides.length ?? 1) - 1} onclick={() => nextSlide(1)}><ArrowRight /></button></div>{#if canvasFocus}<div class="divider"></div>{/if}{/if}

          </div>
          {#if editor.deck}
          <div class="canvas-dock-slot"><div class="canvas-insert-dock ui-floating-toolbar" class:unavailable={editor.sourceMode||Boolean(proposalDeck)} inert={editor.sourceMode||Boolean(proposalDeck)} use:editorToolbar role="toolbar" aria-label="Insert tools" aria-describedby="editor-toolbar-help">
      <AsyncFeature feature="insert-tools" props={{insertTool, compact:shortWorkspace, resourceOpen, resourceActiveView, resourceBusy: Boolean(resourceOpen && resourceExpandControl?.disabled), disabled: !editor.deck, onselect: () => { finishInlineText(); cancelInsertion(); resourcePanel?.close(); void focusCanvasSelection(); }, oninsert: insert, onresource: openResourceTool, onchart: () => { cancelInsertion(); modal = 'chart'; }, onprototype: () => openPrototype(), onblocks: () => openBlocks()}} />
          </div>
          </div>
          {/if}
          <div class="canvas-utility-right">
          <div class="zoom-controls"><ActionMenu label={`Canvas zoom · ${Math.round(currentScale*100)}%${zoomMode==='fit'?' · Fit to window':''}`} items={[
            {label:'Fit to window',icon:Scan,checked:zoomMode==='fit',onselect:()=>setZoom('fit')},
            ...[.25,.5,.75,1,1.25,1.5,2].map(value=>({label:`${Math.round(value*100)}%`,checked:zoomMode==='scale'&&Math.abs(zoom-value)<.001,onselect:()=>setZoom(value)})),
            {label:'Zoom out',icon:Minus,divider:true,disabled:currentScale<=.1,onselect:()=>changeZoom(-.1)},
            {label:'Zoom in',icon:Plus,disabled:currentScale>=4,onselect:()=>changeZoom(.1)}
          ]}><span class="zoom-value">{Math.round(currentScale*100)}%</span></ActionMenu></div>
          <button class="icon-btn focus-toggle" aria-label={canvasFocus ? 'Exit focus view' : 'Focus view'} aria-pressed={canvasFocus} title={canvasFocus ? 'Exit focus view · Esc' : 'Focus view'} disabled={!editor.deck} onclick={() => void setCanvasFocus(!canvasFocus)}>{#if canvasFocus}<Minimize2 />{:else}<Scan />{/if}</button>
          {#if canvasFocus}<CommandSearch bind:this={focusCommandSearch} class="focus-commands" actions={searchActions} onprepare={prepareSearchActions} onexpand={expandSearch} />{/if}
          {#if proposalDeck && (canvasFocus || !rightOpen)}<Button variant="primary" onclick={() => showPanel('ai')}>Review changes</Button>{/if}
          </div>
        </footer>
        {/if}
        {#if notesOpen && !canvasFocus && !proposalDeck && editor.slide}<div class="notes-panel" transition:uiCollapse><label for="slide-notes">Speaker notes</label><textarea id="slide-notes" aria-label="Speaker notes" value={editor.slide.notes} oninput={(e) => editor.commit([{op: 'update_slide', slideId: editor.slide!.id, patch: {notes: e.currentTarget.value}}], 'notes')} placeholder="Add talking points, sources, or questions to resolve…"></textarea></div>{/if}
      </main>
      <aside id="editing-panel" class="property-panel" tabindex="-1" data-panel={panel} aria-label="Editing panel" inert={!editor.deck || !rightOpen || canvasFocus}><div class="property-content"><div class="editing-panel-header"><div class="panel-tabs" role="tablist" tabindex="-1" aria-label="Editing panels" aria-orientation="horizontal">
        {#each panelTabs as tab}<button id="editor-tab-{tab.id}" role="tab" class:active={panel === tab.id} aria-selected={panel === tab.id} aria-controls="editor-panel-{tab.id}" aria-label={tab.id === 'ai' ? 'AI editor' : tab.label} tabindex={panel === tab.id ? 0 : -1} onkeydown={panelTabKey} onclick={() => choosePanelTab(tab.id)}>{tab.label}</button>{/each}
      </div>{#if viewportWidth<=760}<Button class="editing-panel-close" kind="icon" aria-label="Close editing panel" title="Return to canvas" onclick={closeEditingPanel}><X size={18}/></Button>{/if}</div>{#each panelTabs as tab (tab.id)}{@const panelView = tab.id}<div id="editor-panel-{panelView}" class="panel-swap" role="tabpanel" aria-labelledby="editor-tab-{panelView}" tabindex="0" hidden={panel !== panelView} inert={panel !== panelView} in:uiPresence={{x: 4, y: 0}}>{#if visitedPanels.includes(panelView)}{#if panelView === 'design'}<AsyncFeature feature="inspector" props={{ondraw:()=>{if(viewportWidth<=760)closeEditingPanel();if(insertTool!=='draw')insert('draw');},active:panel==='design'&&rightOpen&&!canvasFocus&&!presenting,view:inspectorView,onviewchange:(value:'properties'|'layers')=>inspectorView=value,ondeckstyles:openDocumentStyles,onpageelements:openPageElements,onreference:()=>modal='fidelity',onlayout:()=>modal='auto-layout',layoutDisabled:Boolean(proposalDeck),onresources:openResources,onfonts:()=>openFonts(),onprototype:openPrototype}} />{:else if panelView === 'motion'}<AsyncFeature feature="motion" props={{disabled:Boolean(proposalDeck),onexitpreview:returnCurrentVersion,active: panel === 'motion' && rightOpen && !canvasFocus && !presenting && !modal, onpreview: (fromId?: string) => { presentationStartId = fromId; editor.sourceMode = false; presenting = true; }}} />{:else}<AsyncFeature feature="ai" props={{workflow:workflowRequest,onworkflow:receiveWorkflow,onrunworkflow:()=>void runWorkflow(),ondismissworkflow:()=>void dismissWorkflow(),active:panel==='ai'&&rightOpen&&!canvasFocus&&!presenting&&!modal,settings: aiSettings, sessionVersion:aiSessionVersion, serverConfigured: Boolean(health?.ai?.configured), onpreview: toggleProposalPreview, preview: previewProposal, onsettings: () => void openSettingsTab('ai')}} />{/if}{/if}</div>{/each}</div><!-- Keyboard adjustable split-pane separator. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="pane-resizer right-resizer" class:gesture-pane={resizing&&paneGesture?.side==='right'} role="separator" tabindex="0" aria-label="Resize editing panel" aria-orientation="vertical" aria-valuemin="260" aria-valuemax={viewportWidth<=760?Math.min(304,Math.max(0,viewportWidth-24)):viewportWidth<=1100?320:440} aria-valuenow={displayedRightWidth()} onpointerdown={event=>resizePane(event,'right')} onpointermove={movePane} onpointerup={finishPane} onpointercancel={cancelPane} onlostpointercapture={cancelPane} onkeydown={event=>paneKey(event,'right')}></div></aside>
    </div>
    <NotificationOutlet kind="toast"/>
  </div>
{/if}

{#if presenting && editor.deck && editor.slide}
  <AsyncFeature feature="presentation" props={{deck: editor.deck, original: editor.sourceMode, clientId: prototypeClientId, startId: presentationStartId, returnTo: presentationReturnTo, onclose: closePresentation}} onclose={closePresentation} modalTitle="Present document" />
{/if}


{#if !printMode && !presenting}
  <PopoverPanel onerror={message=>editor.notify(message,'warning')} bind:this={resourcePanel} bind:open={resourceOpen} anchor={resourceContextAnchor??resourceTrigger} avoid={() => resourceReplaceId ? stage?.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(resourceReplaceId)}"]`) : undefined} returnFocus={() => resourceReplaceId ? document.querySelector<HTMLElement>('.selection-context [aria-label="Replace image"]') ?? stage : resourceContextAnchor ?? resourceTrigger} id="workspace-resource-popover" title={resourceReplaceId ? 'Replace image' : resourceTitle} class="resource-popover" width={400} height={800} minHeight={240} mobileSheet={Boolean(resourceReplaceId)} autoHeight>
    {#snippet headerActions()}<Button kind="icon" size="sm" aria-label="Full library" title="Open full resource library" disabled={!resourceExpandControl || resourceExpandControl.disabled} onclick={() => resourceExpandControl?.run()}><Maximize2 size={16} /></Button>{/snippet}
    {@render resourceContent(true)}
  </PopoverPanel>
{/if}

{#if modal === 'auto-layout' && editor.deck && editor.slide}
  <AsyncFeature feature="layout" props={{onclose: closeModal}} onclose={closeModal} modalTitle="Layout suggestions" />
{:else if modal === 'deck-styles' && editor.deck}
  <AsyncFeature feature="deck-styles" props={{onclose: closeModal,initialRole:documentStyleRole,returnFocus:()=>documentStyleOrigin??undefined}} onclose={closeModal} modalTitle="Document styles" />
{:else if modal === 'page-elements' && editor.deck && editor.slide}
  <AsyncFeature feature="page-elements" props={{onclose: closeModal}} onclose={closeModal} modalTitle="Slide details" />
{:else if modal === 'blocks' && editor.deck && editor.slide}
  <AsyncFeature feature="blocks" props={{onclose:closeModal,onplace:prepareBlock,initialId:blockInitialId}} onclose={closeModal} modalTitle="Blocks" />
{:else if modal === 'chart' && editor.deck && editor.slide}
  <AsyncFeature feature="chart" props={{onclose: closeModal}} onclose={closeModal} modalTitle="Insert chart" />
{:else if modal === 'publish'}
  <AsyncFeature feature="publish" props={{readDocument:async()=>{await editor.flush();if(editor.dirty)throw new Error('Save the document before publishing.');return editor.readDocument();},onclose:closeModal,includeNotes:publishIncludeNotes,connectOnly:hostingConnectOnly,onprepared:(result:WorkflowReceipt)=>{if(workflowRequest?.action.kind==='publish'&&workflowRequest.action.target==='web')void workflowResult('waiting_for_user',result);},oncomplete:(result:WorkflowReceipt)=>{if(workflowRequest?.action.kind==='publish'&&workflowRequest.action.target==='web'||workflowRequest?.action.kind==='account'&&workflowRequest.action.provider==='netlify')void workflowResult('completed',result);}}} onclose={closeModal} modalTitle={hostingConnectOnly?'Connect website hosting':'Publish presentation website'}/>
{:else if modal === 'google-export'}
  <AsyncFeature feature="google-export" props={{readDocument:()=>editor.readDocument(),onclose:closeModal,oncomplete:(result:{url:string})=>{if(workflowRequest?.action.kind==='export'&&workflowRequest.action.format==='google'||workflowRequest?.action.kind==='publish'&&workflowRequest.action.target==='google')void workflowResult('completed',{message:'Google Slides copy created',url:result.url,provider:'google',state:'created'});},onconnection:(connected:boolean)=>{if(workflowRequest?.action.kind==='account'&&workflowRequest.action.provider==='google')void workflowResult('completed',{message:connected?'Google connected':'Google disconnected',provider:'google',state:connected?'connected':'disconnected'});}}} onclose={closeModal} modalTitle="Export to Google Slides" />
{:else if modal && modal !== 'auto-layout' && modal !== 'deck-styles' && modal !== 'page-elements' && modal !== 'chart' && modal !== 'blocks'}
  <Dialog title={{library: 'Document library', templates: 'Start with a template', layout: 'Add slide', 'ai-create':'Create with AI', import: 'Import document', export: 'Export document', fidelity: 'Import report', help: 'Keyboard shortcuts', settings: 'Settings', resources: resourceReplaceId ? 'Replace image' : 'Resource library', search: 'Search and commands', prototype: prototypeTarget ? 'Prototype preview' : 'Embed interactive prototype', fonts: 'Font library', rename:'Rename document', history:'Version history', notifications:'Recent notifications', 'illustration-colors':'Illustration colors'}[modal]} wide={['library', 'templates', 'layout', 'fonts', 'prototype', 'fidelity','history','settings','search','ai-create'].includes(modal)} class={modal === 'library' ? 'document-library-dialog' : modal === 'fonts' ? 'font-library-dialog' : ''} review={modal === 'fidelity'} resource={modal === 'resources'} onclose={closeModal} returnFocus={() => insertTool ? stage : undefined}>
    {#if modal === 'ai-create'}
      <AsyncFeature feature="ai-create" props={{state:aiCreation,settings:aiSettings,serverConfigured:Boolean(health?.ai?.configured),onsettings:()=>{aiCreationSettingsReturn=true;void openSettingsTab('ai');},oncreate:acceptAICreation}} />
    {:else if modal === 'prototype'}
      {#if prototypeTarget?.prototype}<div class="prototype-focus"><AsyncFeature feature="prototype-embed" props={{prototype:prototypeTarget.prototype,label:prototypeTarget.name,live:true,clientId:prototypeClientId,onexit:()=>modal=''}} /></div>
      {:else}<p class="dialog-intro">Embed a Figma or web prototype in a slide. Interact with it during a presentation or open a larger preview.</p><label class="field-label">Prototype link or embed code<textarea aria-label="Prototype link or embed code" bind:value={prototypeUrl} rows="3" placeholder="https://www.figma.com/proto/…"></textarea></label><p class="hint">Use a prototype share link with viewing access enabled. Web prototypes must allow iframe embedding.</p>{/if}
    {:else if modal === 'resources'}
      {@render resourceContent(false)}
    {:else if modal === 'illustration-colors'}
      <AsyncFeature feature="illustration-colors" props={{}} />
    {:else if modal === 'search'}
      <AsyncFeature feature="search" props={{actions: searchActions, initialQuery: searchQuery, initialScope: searchScope, onselect: runSearchAction}} />
    {:else if modal === 'settings'}
      {@render settingsContent(false)}
    {:else if modal === 'fonts'}
      <AsyncFeature feature="fonts" props={{onclose: closeModal, initialTab: fontLibraryTab}} />
    {:else if modal === 'rename'}
      <label class="field-label">Document title<input aria-label="New document title" data-dialog-autofocus bind:value={renameValue} maxlength="300" onkeydown={event=>{if(event.key==='Enter'&&!event.isComposing&&event.keyCode!==229&&!event.repeat){event.preventDefault();void applyRename();}}} /></label><div class="button-row"><Button variant="secondary" onclick={()=>void openLibrary()}>Cancel</Button><Button variant="primary" disabled={!renameValue.trim()} onclick={applyRename}>Save title</Button></div>
    {:else if modal === 'history'}
      <p class="dialog-intro">Restore a version as a new document. Your current document is preserved.</p><div class="document-history">{#each historyItems as version}<div><span><strong>{version.title}</strong><small>Version {version.revision} · {new Date(version.updatedAt).toLocaleString('en-US')} · {countLabel(version.count, "slide")}</small></span><Button variant="secondary" onclick={()=>restoreHistory(version.revision)}>Restore copy</Button></div>{:else}<section><EmptyState icon={History} title="No previous versions yet" description="Earlier versions appear here after you edit and save this document."><Button variant="secondary" onclick={closeModal}>Back to editor</Button></EmptyState></section>{/each}</div>
    {:else if modal === 'library'}
      <AsyncFeature feature="document-library" props={{documents:library, currentId:editor.deck?.id, onopen:(id:string) => void openDeck(id), onrename:beginRename, onduplicate:(id:string) => void duplicateDocument(id), onimport:() => modal = 'import', oncreate:() => modal = 'templates'}} />
    {:else if modal === 'templates'||modal==='layout'}
      <AsyncFeature feature="templates" props={{mode:modal==='templates'?'document':'slide',deck:editor.deck,initialCollection:templateStart,oncreate:create,onlayout:addLayout,onlibrary:openLibrary}}/>
    {:else if modal === 'import'}
      <AsyncFeature feature="import-options" props={{cloudTab,cloudUrl,cloudToken,busy,documentImportBusy,onTab:(value:string)=>{cloudTab=value;error='';},onUrl:(value:string)=>cloudUrl=value,onToken:(value:string)=>cloudToken=value,onChooseFile:()=>fileInput.click(),onImport:cloudImport}} />
    {:else if modal === 'export'}
      <AsyncFeature feature="export-options" props={{exportView,referenceComplete,hiddenCount:hiddenSlideCount,slideCount:editor.deck?.slides.length??0,hasGoogleSource:Boolean(editor.deck?.googleSource),hasKeynote:Boolean(health?.converters?.keynote),hasNativeSource:Boolean(editor.deck?.nativeSource),busy,exportKind,onView:(value:'editable'|'reference')=>exportView=value,onExport:exporting}} />
    {:else if modal === 'fidelity'}
      {#if editor.deck}<AsyncFeature feature="fidelity" props={{deck: editor.deck, attach: () => sourceInput.click(), fonts: () => { fontLibraryTab='document'; modal='fonts'; }}} />{/if}
    {:else if modal === 'help'}
      <AsyncFeature feature="shortcuts" props={{}} />
    {/if}
    {#if modal === 'notifications'}<AsyncFeature feature="notification-history" props={{}}/>{/if}
    {#snippet footer()}{#if modal === 'prototype' && !prototypeTarget}<DialogFooter>
      {#snippet actions()}<Button variant="secondary" onclick={closeModal}>Cancel</Button><Button variant="primary" disabled={!prototypeUrl.trim() || !editor.deck} onclick={insertPrototype}><Plus />Insert prototype</Button>{/snippet}
    </DialogFooter>{/if}{/snippet}
  </Dialog>
{/if}
