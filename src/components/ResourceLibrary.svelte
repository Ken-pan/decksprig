<script lang="ts">
  import ColorField from './ui/ColorField.svelte';
  import ColorSwatch from './ui/ColorSwatch.svelte';
  import {canRecolorResource} from '../core/resource-purpose';
  import {swatchInk} from '../selection-color';
  import {contrastRatio} from '../core/deck-design-system';
  import {defaultIllustrationColor,isThemedIllustration} from '../core/illustration-defaults';
  import FeedbackState from './FeedbackState.svelte';
  import Notice from './ui/Notice.svelte';
  import {resourceReplacementContext} from '../core/resource-replacement-context';
  import {resourceReplacementPatch, resourceReplacementFit} from '../core/resource-replacement';
  import { contextActions } from '../context-menu';
  import ResourceImage from "./ResourceImage.svelte";
  import ResourceReplacementFrame from "./ResourceReplacementFrame.svelte";
  import GraphicControls from './GraphicControls.svelte';
  import GraphicPreview from './GraphicPreview.svelte';
  import {DEFAULT_GRAPHIC_RECIPE, GRAPHIC_FAMILIES, graphicInfo, graphicSearchScore, normalizeGraphicRecipe} from '../../public/resources/graphic-engine.js';
  import type {GraphicRecipe} from '../core/graphic-recipe';
  import { countLabel } from "../core/ui-copy";
  import '../resources.css';
  import { onMount, untrack, tick } from 'svelte';
  import { uiPresence, uiCollapse, uiChange, uiIndicator, uiDisclosure } from '../ui-motion';
  import { resourceIcons } from './icons';
  import { Search, Eye, Image, Upload, ArrowLeft, ArrowRight, ExternalLink, RefreshCw, Check, Copy, Plus, Star, History, X, CheckSquare, SlidersHorizontal, Undo2, Palette, Download, Replace } from '@lucide/svelte';
  import { editor, api } from '../core/editor.svelte';
  import { ICON_SETS, ILLUSTRATION_SETS, PHOTO_SOURCES, RESOURCE_CATEGORIES, GRAPHIC_CATEGORIES, MAX_RESOURCE_BATCH, isGraphicBackground, resourceBackgroundOperations, isStockPhotoSource, photoBrowseUrl, resourceMatches, resourceMetadata, resourceElement, resourceOperation, validateResourceImport, type ResourceKind, type ResourceItem, type ResourcePage, type ResourceCatalog, type EmbeddedResource, type PhotoProviderStatus } from '../core/resources';
  import PhotoConnection from './PhotoConnection.svelte';
  import { shelfEntry, shelfItem, shelfKey, readShelf, rememberResource, type ShelfEntry } from '../core/resource-shelf';
  import type { ResourceAttribution, SlideElement } from '../core/model';
  import AccentPicker from './AccentPicker.svelte';
  import { Button, DialogFooter, PopoverPanel , EmptyState} from './ui';
  import { ORIGINAL_ACCENT } from '../../public/resources/accent-engine.js';
  import type { ResourceLibraryView, ResourceReplacementPreview, ResourceQuickView } from './resource-library-view';
  import { ILLUSTRATION_TYPES, type IllustrationType, type IllustrationView } from '../core/resource-taxonomy';

  let {initialConnectionProvider,onconnection,onclose, onlocal, onplace, onexpand, onexpandcontrol, onpreview, onviewchange, quickView, initialView, compact = false, replaceId, initialKind, initialResourceId, initialColor, initialGraphicRecipe, initialBlueBlack = false}: {initialConnectionProvider?:'unsplash'|'pexels';onconnection?:(statuses:PhotoProviderStatus[])=>void;onclose: () => void; onlocal: (continueBrowsing?: boolean, view?: ResourceLibraryView) => void; onplace: (images: SlideElement[], returnToLibrary: boolean, items: ResourceItem[], view?: ResourceLibraryView) => void | Promise<void>; onexpand?: (view: ResourceLibraryView) => void; onexpandcontrol?: (control?: {run: () => void; disabled: boolean}) => void; onpreview?: (preview?: ResourceReplacementPreview) => void; onviewchange?: (view: ResourceQuickView, label: string) => void; quickView?: ResourceQuickView; initialView?: ResourceLibraryView; compact?: boolean; replaceId?: string; initialKind?: ResourceKind | 'used'; initialResourceId?: string; initialColor?: string; initialGraphicRecipe?: GraphicRecipe; initialBlueBlack?: boolean} = $props();
  type Kind = ResourceKind | 'used'; type Scope = 'browse' | 'favorites' | 'recent';
  let mounted = $state(false);
  let kind = $state<Kind>('illustration'), scope = $state<Scope>('browse');
  let favoriteView = $state(false);
  let queries = $state<Record<Kind | 'favorites', string>>({photo: '', icon: '', illustration: '', used: '', favorites: ''});
  let queryKey: Kind | 'favorites' = $derived(favoriteView && scope === 'favorites' ? 'favorites' : kind);
  let query = $derived(queries[queryKey]);
  let iconSet = $state('lucide'), iconStyle = $state('all'), license = $state('cc0'), aspect = $state(''), photoSource = $state('');
  let collection = $state('all'), category = $state(''), family = $state('');
  let illustrationView = $state<IllustrationView>('illustrations'), illustrationType = $state<IllustrationType | ''>('');
  let illustrationCollections = $derived(ILLUSTRATION_SETS.filter(set => illustrationType === 'accent' ? set.id === 'all' || set.id === 'deck-graphics' : !illustrationType || set.id !== 'deck-graphics'));
  let families = $state<{id:string;label:string;count:number}[]>([]);
  let recipe = $state<GraphicRecipe>({...DEFAULT_GRAPHIC_RECIPE}), renderedRecipe = $state<GraphicRecipe>({...DEFAULT_GRAPHIC_RECIPE});
  const graphicDrafts = new Map<string,{color:string;recipe:GraphicRecipe}>();
  $effect(() => { const value={...recipe}; const timer=setTimeout(()=>renderedRecipe=value,120); return ()=>clearTimeout(timer); });
  let graphicsBrowse = $derived(kind === 'illustration' && illustrationView === 'graphics' && scope === 'browse');
  let items = $state<ResourceItem[]>([]), selected = $state<ResourceItem | null>(null), picked = $state<ResourceItem[]>([]);
  let favorites = $state<ShelfEntry[]>([]), recent = $state<ShelfEntry[]>([]), catalog = $state<ResourceCatalog | null>(null);
  let loading = $state(false), importing = $state(false), batchMode = $state(false), error = $state(''), success = $state(''), copied = $state(false);
  let page = $state(1), hasMore = $state(false), total = $state(0), color = $state(untrack(() => editor.deck ? defaultIllustrationColor(editor.deck) : ORIGINAL_ACCENT)), keepOpen = $state(false);
  let backgroundChoice = $state<string>();
  let background = $derived(backgroundChoice ?? (selected ? resourcePreviewBackground(selected, color) : 'checker'));
  let iconColor = $state('#26362c'), illustrationColor = $state(untrack(() => editor.deck ? defaultIllustrationColor(editor.deck) : ORIGINAL_ACCENT));
  let graphicColor = $state('#26362c'), graphicPreviewMode=$state<'slide'|'material'|'detail'>('slide');
  let completed = $state(0), importCount = $state(0), previewAttempt = $state(0), previewState = $state<'loading' | 'ready' | 'error'>('loading');
  let resultsNode = $state<HTMLDivElement>(), resultScroll = 0;
  const searchId = $props.id();
  let searchInput = $state<HTMLInputElement>(), libraryNode = $state<HTMLDivElement>(), searchOpen = $state(false), filtersOpen = $state(false), paletteOpen = $state(false);
  let errorRecovery = $state<'search' | 'import' | 'none'>('none'), lastImportRevision = $state<number>();
  let lastImport: {items: ResourceItem[]; replace: boolean; fillSlide: boolean} | undefined;
  let failedSearch = {page: 1, append: false};
  let photoProviders = $state<PhotoProviderStatus[]>([]), connectionOpen = $state(false);
  let stockSource = $derived(isStockPhotoSource(photoSource) ? photoSource : undefined);
  let sourceStatus = $derived(photoProviders.find(provider => provider.id === photoSource));
  let needsConnection = $derived(kind === 'photo' && scope === 'browse' && stockSource && !sourceStatus?.configured);
  let controller: AbortController | undefined, importController: AbortController | undefined, searchTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false, request = 0;
  const responseCache = new Map<string, ResourcePage>();
  const deckId = editor.deck?.id, slideId = editor.slide?.id;
  const originalReplaceId = untrack(() => replaceId || (editor.selection.length === 1 && editor.selection[0].type === 'image' ? editor.selection[0].id : undefined));
  let target = $derived(editor.deck?.id === deckId && editor.slide?.id === slideId ? editor.slide?.elements.find(e => e.id === originalReplaceId) : undefined);
  let replacementDetails = $state(false);
  let replacementFit = $state(untrack(() => resourceReplacementFit(target?.fit)));
  let replacementOptions = $derived({fit: replacementFit});
  const replacementViews = [{id:'photo',label:'Photos',title:'Photos',icon:resourceIcons.photo},{id:'icon',label:'Icons',title:'Icons',icon:resourceIcons.icon},{id:'illustration',label:'Art',title:'Illustrations',icon:resourceIcons.illustration},{id:'graphics',label:'Graphics',title:'Patterns & textures',icon:resourceIcons.graphics},{id:'favorites',label:'Saved',title:'Favorites',icon:Star}] as const;
  let replacing = $derived(Boolean(replaceId));
  let selectCurrentOnOpen = $state(untrack(() => Boolean(replaceId) && !initialView));
  let initialReplacementColor = '';
  let currentChoice = $derived(Boolean(replacing && selected && target?.resource?.id === selected.id && (!selected.colorable || color.toLowerCase() === (target.resource.color || initialReplacementColor).toLowerCase()) && (!isGraphic(selected) || JSON.stringify(normalizeGraphicRecipe(target.resource.graphicRecipe || {})) === JSON.stringify(recipe)) && replacementFit === resourceReplacementFit(target.fit)));

  let replaceDisabled = $derived(!target || target.type !== 'image' || target.locked);
  let showDetail = $derived(Boolean(selected) && (!compact || !replacing || replacementDetails));
  let activeViewLabel = $derived(favoriteView ? 'Favorites' : graphicsBrowse ? 'Patterns & textures' : kind === 'photo' ? 'Photos' : kind === 'icon' ? 'Icons' : kind === 'used' ? 'In document' : 'Illustrations');
  let activeQuickView = $derived<ResourceQuickView>(favoriteView ? 'favorites' : graphicsBrowse ? 'graphics' : kind === 'used' ? 'illustration' : kind);
  $effect(() => { if (compact && mounted) onviewchange?.(activeQuickView, activeViewLabel); });
  $effect(() => {
    const requested = quickView;
    if (compact && mounted && requested) untrack(() => { if (requested !== activeQuickView) chooseQuickView(requested); });
  });
  let used = $derived.by(() => {
    const seen = new Set<string>();
    return (editor.deck?.slides.flatMap(s => s.elements.filter(e => e.type === 'image' && e.resource && e.src)) ?? []).filter(e => {
      if (seen.has(e.src!)) return false; seen.add(e.src!); return true;
    }).map(e => ({...e.resource!, previewUrl: e.src!, width: e.w, height: e.h, colorable: canRecolorResource(e.resource)}));
  });
  let suggestions = $derived(graphicsBrowse ? ['Dots', 'Grid', 'Grain', 'Arrows', 'Cover', 'Research'] : kind === 'photo' ? ['Architecture', 'Nature', 'Work', 'City', 'Coffee'] : kind === 'icon' ? ['Arrow', 'User', 'Chart', 'Search', 'Camera'] : ['Work', 'Computer', 'People', 'Nature', 'Coffee']);
  let previewUrl = $derived(selected ? imageUrl(selected,false,true) : '');
  let detailUrl = $derived(selected ? imageUrl(selected,true,true) : '');
  let replacementImage = $derived(target && selected ? {...target, ...resourceReplacementPatch({src: previewUrl, resource: resourceMetadata(styledItem(selected)), name: selected.title}, replacementOptions)} : undefined);
  let selectedIndex = $derived(selected ? items.findIndex(i => scope==='browse' && kind!=='used' ? i.id===selected?.id : viewKey(i)===viewKey(selected!)) : -1);
  let favoriteCount = $derived(favorites.filter(e => favoriteView || kind === 'used' || e.resource.kind === kind).length);
  let previewReady=$derived(previewState==='ready' && (!selected?.id.startsWith('deck-graphics:') || JSON.stringify(recipe)===JSON.stringify(renderedRecipe)));
  $effect(() => {
    const candidate = replacing && selected && previewReady && !replaceDisabled && !currentChoice ? selected : undefined;
    const patch = candidate ? resourceReplacementPatch({src: previewUrl, resource: resourceMetadata(styledItem(candidate)), name: candidate.title}, replacementOptions) : undefined;
    onpreview?.(patch && editor.deck && editor.slide ? {deckId: deckId!, baseRevision: editor.deck.revision, slide: {...editor.slide, elements: editor.slide.elements.map(e => e.id === originalReplaceId ? {...e, ...patch} : e)}} : undefined);
  });
  let activeFilters = $derived.by(() => {
    if (scope !== 'browse' || kind === 'used') return [];
    const filters: {key: string; label: string}[] = [];
    if (kind === 'photo') {
      if (!isStockPhotoSource(photoSource) && license === 'by') filters.push({key: 'license', label: 'Attribution required'});
      if (aspect) filters.push({key: 'aspect', label: ({wide: 'Landscape', tall: 'Portrait', square: 'Square'} as Record<string, string>)[aspect]});
      if (photoSource) filters.push({key: 'photoSource', label: PHOTO_SOURCES.find(s => s.id === photoSource)?.label || photoSource});
    } else if (kind === 'icon') {
      if (iconSet !== 'all') filters.push({key: 'iconSet', label: ICON_SETS.find(s => s.id === iconSet)?.label || iconSet});
      if (iconStyle !== 'all') filters.push({key: 'iconStyle', label: ({outline: 'Outline', solid: 'Filled', duotone: 'Duotone'} as Record<string, string>)[iconStyle]});
    } else {
      if (!graphicsBrowse && collection !== 'all') filters.push({key: 'collection', label: ILLUSTRATION_SETS.find(s => s.id === collection)?.label || collection});
      if (category) filters.push({key: 'category', label: (graphicsBrowse ? GRAPHIC_CATEGORIES : RESOURCE_CATEGORIES).find(s => s.id === category)?.label || category});
      if (family && collection==='deck-graphics') filters.push({key:'family',label:GRAPHIC_FAMILIES.find(f=>f.id===family)?.label||family});
    }
    return filters;
  });
  $effect(() => { previewUrl; previewState = 'loading'; copied = false; });
  function persist(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { errorRecovery = 'none'; error = 'Could not save favorites locally. Resources in your document will still be saved.'; } }
  function savePreferences() { persist('deck-studio-resource-preferences', {kind, queries, iconSet, iconStyle, license, aspect, photoSource, collection, category, family, illustrationView, illustrationType, keepOpen, iconColor, illustrationColor, graphicColor}); }
  function viewState(): ResourceLibraryView { return {kind, scope, favoriteView, collection, category, family, illustrationView, illustrationType, selected: selected ? styledItem(selected) : undefined, replacement: replacing ? replacementOptions : undefined, connectionOpen,illustrationColor,graphicColor,iconColor}; }
  function expand() { if (importing) return; savePreferences(); onexpand?.(viewState()); }
  $effect(() => {
    if (!compact || !onexpandcontrol) return;
    onexpandcontrol({run: expand, disabled: importing});
    return () => onexpandcontrol?.();
  });
  function recipeSummary(item:ResourceItem) { const settings=normalizeGraphicRecipe(item.graphicRecipe||{});return `Ink ${Math.round(settings.strength*100)}% · Size ${settings.scale}× · Angle ${settings.rotation}° · ${item.color||'#26362c'}`; }
  function isGraphic(item: ResourceAttribution) { return item.id.startsWith('deck-graphics:'); }
  function viewKey(item: ResourceAttribution) { return isGraphic(item) ? shelfKey(item) : item.id; }
  function styledItem(item: ResourceItem): ResourceItem {
    if (!isGraphic(item)) return item.colorable ? {...item,color:itemColor(item)} : item;
    const draft = selected && viewKey(selected)===viewKey(item) ? {color,recipe} : graphicDrafts.get(viewKey(item));
    return {...item,color:draft?.color || itemColor(item),graphicRecipe:normalizeGraphicRecipe(draft?.recipe || item.graphicRecipe || {})};
  }
  function imageUrl(item:ResourceItem,detail=false,live=false) {
    if (isGraphic(item)) {
      const variant=live?{...item,color,graphicRecipe:renderedRecipe}:styledItem(item);
      return `/api/resources/preview?${new URLSearchParams({id:item.id,color:variant.color!,recipe:JSON.stringify(variant.graphicRecipe),...(detail?{detail:'1'}:{}),...(live?{attempt:String(previewAttempt)}:{})})}`;
    }
    return item.previewUrl + (item.previewUrl.startsWith('/api/') ? `${item.colorable?`&color=${encodeURIComponent(live?color:itemColor(item))}`:''}${live?`&attempt=${previewAttempt}`:''}`:'');
  }
  function rememberDraft() { if(selected && isGraphic(selected))graphicDrafts.set(viewKey(selected),{color,recipe:{...recipe}}); }
  function changeRecipe(value:GraphicRecipe) { recipe=normalizeGraphicRecipe(value); rememberDraft(); }
  function isFavorite(item: ResourceItem) { const variant=styledItem(item); return favorites.some(e => viewKey(e.resource)===viewKey(variant)); }
  function favorite(item: ResourceItem) {
    const variant=styledItem(item),key=viewKey(variant);
    if (isFavorite(item)) favorites=favorites.filter(e=>viewKey(e.resource)!==key);
    else { if (favorites.length>=200) { error='You have reached the 200-favorite limit. Remove unused favorites first.';return; } favorites=[...favorites,shelfEntry(variant)]; }
    persist('deck-studio-resource-favorites',favorites);
    if(scope==='favorites')void search();
  }
  function localItems() {
    const list=kind==='used'&&!favoriteView?used:(scope==='favorites'?favorites:recent).filter(e=>favoriteView||e.resource.kind===kind).map(shelfItem);
    return list.filter((i,index)=>list.findIndex(other=>viewKey(other)===viewKey(i))===index && (isGraphic(i)?(Number.isFinite(graphicSearchScore(i,query))||resourceMatches(recipeSummary(i),query)):resourceMatches(`${i.title} ${i.provider} ${i.id}`,query)));
  }
  function includeCurrentResource() {
    if (!replacing || !target?.resource || !target.src || query.trim() || scope !== 'browse' || favoriteView || category || family) return;
    const context = resourceReplacementContext(target.resource);
    if (kind !== context.kind || (kind === 'illustration' && collection !== context.collection) || (kind === 'icon' && iconSet !== context.iconSet)) return;
    const listed = items.find(item => item.id === target!.resource!.id);
    const colorable = target.resource.kind === 'icon' || target.resource.id.startsWith('blue-black:') || isGraphic(target.resource);
    const current = {...listed, ...target.resource, previewUrl: listed?.previewUrl || (colorable ? `/api/resources/preview?id=${encodeURIComponent(target.resource.id)}` : target.src), colorable};
    if (listed) items = items.map(item => item.id === current.id ? current : item);
    else { items = [current, ...items]; total++; }
    if (selectCurrentOnOpen) {
      pick(current, true);
      void tick().then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
        const button = Array.from(resultsNode?.querySelectorAll<HTMLButtonElement>('[data-resource-card]') ?? []).find(button => button.dataset.resourceId === current.id);
        if (!button || !resultsNode) return;
        const itemBounds = button.getBoundingClientRect(), bounds = resultsNode.getBoundingClientRect();
        // Scroll only the results; scrollIntoView also scrolls the clipped panel body.
        if (itemBounds.top < bounds.top) resultsNode.scrollTop += itemBounds.top - bounds.top;
        else if (itemBounds.bottom > bounds.bottom) resultsNode.scrollTop += itemBounds.bottom - bounds.bottom;
      })));
    }
  }
  async function search(nextPage = 1, append = false) {
    clearTimeout(searchTimer); controller?.abort(); controller = new AbortController(); const current = ++request;
    loading = true; if (errorRecovery === 'search') error = ''; if (!append && !importing) selected = null;
    savePreferences();
    try {
      if (kind === 'used' || scope !== 'browse') { items = localItems(); page = 1; total = items.length; hasMore = false; return; }
      if (needsConnection) { items = []; total = 0; page = 1; hasMore = false; return; }
      const args = new URLSearchParams({kind, q: query, set: iconSet, style: iconStyle, license, aspect, source: photoSource, collection, category, family:collection==='deck-graphics'?family:'', view: kind === 'illustration' ? illustrationView : '', illustrationType: kind === 'illustration' && !graphicsBrowse ? illustrationType : '', page: String(nextPage)});
      const key = args.toString(); let data = responseCache.get(key);
      if (!data) {
        const r = await fetch(`/api/resources/search?${args}`, {signal: controller.signal}); const value = await r.json();
        if (!r.ok) throw new Error(value.error || 'Resources could not load'); data = value as ResourcePage;
        responseCache.set(key, data); if (responseCache.size > 32) responseCache.delete(responseCache.keys().next().value!);
      }
      if (current !== request || disposed) return;
      const incoming = append ? [...items, ...data.items] : data.items;
      items = incoming.filter((item, index, list) => list.findIndex(other => other.id === item.id) === index);
      families=data.facets?.families || []; page = nextPage; hasMore = data.hasMore; total = data.total ?? items.length;
      if (!append && resultsNode) resultsNode.scrollTop = 0;
    } catch (e: any) {
      if (current === request && e.name !== 'AbortError') { errorRecovery = 'search'; failedSearch = {page: nextPage, append}; error = e.message === 'Failed to fetch' ? 'Could not connect to the local resource service. Try again.' : e.message; if (!append) { items = []; total = 0; } hasMore = false; }
    } finally { if (current === request) { loading = false; includeCurrentResource(); } }
  }
  function queryInput(value: string) { selectCurrentOnOpen = false; queries[queryKey] = value.slice(0, 120); loading = true; clearTimeout(searchTimer); searchTimer = setTimeout(() => void search(), kind === 'photo' && scope === 'browse' ? 650 : 180); }
  async function toggleSearch() {
    if (importing) return;
    searchOpen = !searchOpen;
    await tick();
    if (searchOpen) searchInput?.focus({preventScroll: true});
  }
  function searchKey(event: KeyboardEvent) {
    if (!compact || replacing || event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.key !== 'Escape') return;
    event.preventDefault(); event.stopPropagation(); searchOpen = false;
    libraryNode?.querySelector<HTMLButtonElement>('.resource-search-toggle')?.focus({preventScroll: true});
  }
  function switchKind(value: Kind) { if (importing) return; favoriteView = false; items = []; kind = value; filtersOpen = false; paletteOpen = false; if(value!=='illustration')family=''; else if (illustrationView === 'graphics') { illustrationView = 'illustrations'; collection = 'all'; category = ''; family = ''; } color = value === 'icon' ? iconColor : illustrationColor; void search(); }
  function switchScope(value: Scope) { if (importing) return; favoriteView = false; items = []; scope = value; filtersOpen = false; void search(); }
  function setQuickView(value: ResourceQuickView) {
    favoriteView = value === 'favorites'; scope = favoriteView ? 'favorites' : 'browse';
    filtersOpen = false; paletteOpen = false; selected = null; replacementDetails = false; items = [];
    if (value === 'favorites') return;
    kind = value === 'graphics' ? 'illustration' : value;
    if (value === 'graphics') { illustrationView = 'graphics'; illustrationType = ''; collection = 'deck-graphics'; category = ''; family = ''; queries.illustration = ''; }
    else if (value === 'illustration') { if (illustrationView === 'graphics') { collection = 'all'; category = ''; family = ''; queries.illustration = ''; } illustrationView = 'illustrations'; }
    if (value !== 'graphics') family = '';
    color = value === 'icon' ? iconColor : illustrationColor;
  }
  function chooseQuickView(value: ResourceQuickView) {
    if (importing) return;
    selectCurrentOnOpen = false; setQuickView(value); searchOpen = replacing || (!favoriteView && (kind === 'icon' || kind === 'photo')) || Boolean(query); void search();
  }
  function choosePhotoSource(value: string) { photoSource = value; connectionOpen = isStockPhotoSource(value) && !photoProviders.find(p => p.id === value)?.configured; void search(); }
  function chooseGraphicCategory(value: string) { category = value; family=''; void search(); }
  function chooseIllustrationType(value: IllustrationType | '') {
    if (importing) return;
    illustrationType = value; category = ''; family = '';
    if (value === 'accent' || value && collection === 'deck-graphics') collection = 'all';
    void search();
  }
  function photoConfigured(statuses: PhotoProviderStatus[]) { if (disposed) return; photoProviders = statuses; onconnection?.(statuses); connectionOpen = false; responseCache.clear(); void search(); }
  function clearFilter(key?: string) {
    if (kind === 'photo') { if (!key || key === 'license') license = 'cc0'; if (!key || key === 'aspect') aspect = ''; if (!key || key === 'photoSource') photoSource = ''; }
    if (kind === 'icon') { if (!key || key === 'iconSet') iconSet = 'all'; if (!key || key === 'iconStyle') iconStyle = 'all'; }
    if (kind === 'illustration') { if (!key || key === 'collection') collection = graphicsBrowse ? 'deck-graphics' : 'all'; if (!key || key === 'category') category = ''; if(!key || key==='family' || key==='collection')family=''; }
    void search();
  }
  function resetSearch() { queries[queryKey]=''; category=''; family=''; if(graphicsBrowse)void search();else clearFilter(); }
  async function toggleBatch() { batchMode = !batchMode; if (!batchMode) picked = []; await back(); }
  function undoImport() { if (editor.deck?.revision !== lastImportRevision) return; editor.undo(); success = replacing ? 'Original image restored' : 'Change undone. The resource was removed from this slide.'; lastImportRevision = undefined; }
  function retryError() { if (errorRecovery === 'import' && lastImport) void importItems(lastImport.items, lastImport.replace, lastImport.fillSlide); else if (errorRecovery === 'search') { responseCache.clear(); void search(failedSearch.page, failedSearch.append); } }
  function tabKey(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey) return;
    const order = ['photo', 'icon', 'illustration', 'graphics', 'used'] as const;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const current = graphicsBrowse ? 'graphics' : kind;
    event.preventDefault(); const index = event.key === 'Home' ? 0 : event.key === 'End' ? order.length - 1 : (order.indexOf(current) + (event.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length;
    if (order[index] === 'graphics') chooseQuickView('graphics'); else switchKind(order[index] as Kind);
    document.getElementById(`resource-tab-${order[index]}`)?.focus();
  }
  function pick(item: ResourceItem, currentOnOpen = false) {
    if (!currentOnOpen) selectCurrentOnOpen = false;
    rememberDraft(); resultScroll = resultsNode?.scrollTop ?? 0; selected = item; previewAttempt = 0;
    if(isGraphic(item)){const draft=graphicDrafts.get(viewKey(item));recipe=normalizeGraphicRecipe(draft?.recipe||item.graphicRecipe||{});renderedRecipe={...recipe};}
    const themed = isThemedIllustration(item);
    const remembered = (isGraphic(item)?graphicDrafts.get(viewKey(item))?.color: picked.find(p => p.id === item.id)?.color) || (themed && scope === 'browse' && !currentOnOpen ? undefined : item.color);
    color = remembered || (themed ? illustrationColor : item.id.startsWith('deck-graphics:') ? graphicColor : item.kind === 'icon' ? iconColor : '#73856e');
    void tick().then(() => {
      const detail = libraryNode?.querySelector<HTMLElement>('.resource-detail'); if (detail) detail.scrollTop = 0;
      if ((!compact || !replacing || replacementDetails) && window.matchMedia('(max-width: 600px)').matches) detail?.querySelector<HTMLButtonElement>('.resource-back')?.focus({preventScroll: true});
    });
  }
  function itemColor(item: ResourceItem) {
    if (selected && viewKey(selected)===viewKey(item)) return color;
    const remembered = isGraphic(item)?graphicDrafts.get(viewKey(item))?.color:picked.find(p => p.id === item.id)?.color; if (remembered) return remembered;
    if (isThemedIllustration(item) && scope === 'browse') return illustrationColor;
    return item.color || (isThemedIllustration(item) ? illustrationColor : item.id.startsWith('deck-graphics:') ? graphicColor : item.kind === 'icon' ? iconColor : '#73856e');
  }
  // Preview backing follows the ink, independently of the editor's appearance.
  function iconPreviewBackground(ink: string) { return swatchInk(ink) === '#ffffff' ? 'paper' : 'dark'; }
  function resourcePreviewBackground(item: ResourceItem, ink: string) {
    if (item.kind === 'icon' || isGraphic(item) && !isGraphicBackground(item.id)) return iconPreviewBackground(ink);
    return item.kind === 'illustration' && !isGraphicBackground(item.id) ? 'paper' : 'checker';
  }
  function canSoftenPreview(item: ResourceItem, ink: string) {
    if (item.kind === 'photo' || isGraphicBackground(item.id)) return false;
    // Multicolor art retains its original outlines; single-color assets need ink contrast.
    return item.kind === 'illustration' && !isGraphic(item) || contrastRatio(ink, '#b4b4b4') >= 4.5;
  }
  function changeColor(value: string) {
    color = value;
    if (selected && isThemedIllustration(selected) || !selected && kind === 'illustration' && !graphicsBrowse) { illustrationColor = value; rememberDraft(); }
    else if (selected?.id.startsWith('deck-graphics:') || !selected && graphicsBrowse) { graphicColor = value; rememberDraft(); }
    else if (selected?.kind === 'icon' || kind === 'icon') iconColor = value;
    else if (!selected || selected.id.startsWith('blue-black:')) illustrationColor = value;
    if(!selected || !isGraphic(selected)) picked = picked.map(item => selected ? item.id === selected.id ? {...item, color: value} : item : isThemedIllustration(item) ? {...item, color: value} : item);
    savePreferences();
  }
  async function back() { rememberDraft(); const id = selected?.id; selected = null; replacementDetails = false; await tick(); if (resultsNode) { resultsNode.scrollTop = resultScroll; if (id) Array.from(resultsNode.querySelectorAll<HTMLButtonElement>('[data-resource-card]')).find(button => button.dataset.resourceId === id)?.focus({preventScroll: true}); } }
  function isPicked(item:ResourceItem) { return picked.some(p=>viewKey(p)===viewKey(styledItem(item))); }
  function togglePick(item: ResourceItem) {
    const existing=picked.find(p=>p===item),variant=existing||styledItem(item),key=viewKey(variant);
    if(picked.some(p=>viewKey(p)===key))picked=picked.filter(p=>viewKey(p)!==key);
    else if(picked.length>=MAX_RESOURCE_BATCH){errorRecovery='none';error=`Select up to ${MAX_RESOURCE_BATCH} resources at a time.`;}
    else picked=[...picked,variant];
  }
  async function downloadGraphic() {
    if(!selected || !isGraphic(selected) || importing)return;
    importing=true;error='';
    try {
      const item=styledItem(selected),response=await fetch('/api/resources/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:item.id,color:item.color,graphicRecipe:item.graphicRecipe})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Download failed');
      const blob=await fetch(data.src).then(r=>r.blob()),url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=item.id.replace('deck-graphics:','')+'.svg';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e:any){errorRecovery='none';error=e.message;}finally{importing=false;}
  }
  function tileClick(item: ResourceItem, event: MouseEvent) { if (!compact && !replacing && (batchMode || event.shiftKey)) { batchMode = true; togglePick(item); } else pick(item); }
  function gridKey(event: KeyboardEvent, index: number) {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const grid = (event.currentTarget as HTMLElement).closest('.resource-grid'); if (!grid) return;
    const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const offset = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -columns : columns;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, index + offset));
    (grid.querySelectorAll('[data-resource-card]')[next] as HTMLElement)?.focus();
  }
  async function copyCredit(resource: ResourceAttribution) { try { await navigator.clipboard.writeText(resource.attribution + (resource.licenseNotice ? `\n\n${resource.licenseNotice}` : '')); copied = true; } catch { errorRecovery = 'none'; error = 'Clipboard unavailable. Select and copy the source information below.'; } }
  async function imageSize(src: string, signal: AbortSignal): Promise<{w: number; h: number}> {
    return new Promise((ok, no) => {
      const image = new window.Image(), abort = () => { image.src = ''; finish(new DOMException('Canceled', 'AbortError')); };
      const timeout = setTimeout(() => finish(new Error('The resource request timed out. Try again.')), 15000);
      function finish(error?: Error) { clearTimeout(timeout); signal.removeEventListener('abort', abort); image.onload = null; image.onerror = null; error ? no(error) : ok({w: image.naturalWidth || 1, h: image.naturalHeight || 1}); }
      image.onload = () => finish(); image.onerror = () => finish(new Error('The original resource could not be read. Choose another resource.')); signal.addEventListener('abort', abort, {once: true}); if (signal.aborted) abort(); else image.src = src;
    });
  }
  async function importItems(chosen: ResourceItem[], replace = false, fillSlide = false) {
    if (!chosen.length || importing || !editor.deck || !slideId) return;
    chosen=chosen.map(item=>picked.includes(item)?item:styledItem(item));
    const revision = editor.deck.revision; importing = true; error = ''; success = ''; completed = 0; importCount = chosen.length; lastImport = {items: [...chosen], replace, fillSlide};
    importController = new AbortController(); const signal = importController.signal;
    try {
      const decoded: {item: ResourceItem; data: EmbeddedResource; w: number; h: number}[] = Array(chosen.length); let cursor = 0;
      await Promise.all(Array.from({length: Math.min(3, chosen.length)}, async () => {
        while (cursor < chosen.length) {
          const index = cursor++, item = chosen[index]; if (signal.aborted) throw new DOMException('Canceled', 'AbortError');
          const cached = isGraphic(item)?used.find(e=>shelfKey(e)===shelfKey(item)):used.find(e => e.id === item.id && (!item.colorable || e.color === itemColor(item)));
          let data: EmbeddedResource;
          if (((item.previewUrl.startsWith('data:') && !isGraphic(item)) || cached) && !item.id.startsWith('unsplash:')) data = {src: cached?.previewUrl || item.previewUrl, resource: resourceMetadata(cached || item)};
          else {
            const selectedColor = isGraphic(item)?item.color:itemColor(item);
            const r = await fetch('/api/resources/import', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id: item.id, color: selectedColor,...(item.graphicRecipe?{graphicRecipe:item.graphicRecipe}:{}),...(item.characterRecipe?{characterRecipe:item.characterRecipe}:{})}), signal});
            data = await r.json(); if (!r.ok) throw new Error((data as any).error || 'Resource import failed');
          }
          const size = await imageSize(data.src, signal); decoded[index] = {item, data, ...size}; completed++;
        }
      }));
      if (disposed || signal.aborted) return;
      if (editor.deck.id !== deckId || editor.slide?.id !== slideId || editor.deck.revision !== revision) throw new Error('The document has changed. Resources were not added. Try importing again.');
      const images = decoded.map(({data, w, h}) => resourceElement(data.src, resourceMetadata(data.resource), w, h, editor.deck!));
      if (!replace && !fillSlide) {
        // Loading is reversible UI state. The canvas owns the insertion transaction.
        await onplace(images, keepOpen, decoded.map(({item, data}) => ({...item, ...data.resource})), {...viewState(), selected: undefined});
        return;
      }
      const operations = fillSlide ? resourceBackgroundOperations(editor.deck, slideId, images[0]) : [resourceOperation(editor.deck, slideId, images[0], originalReplaceId, replace ? replacementOptions : undefined)];
      validateResourceImport(editor.deck, operations);
      editor.commit(operations, '', 'manual', revision);
      if (editor.deck.revision === revision) throw new Error(editor.error || (replace ? 'The image could not be replaced. Try again.' : 'Resources were not added. Try again.'));
      editor.selected = replace ? [originalReplaceId!] : images.map(e => e.id);
      for (const {item, data} of decoded) recent = rememberResource(recent, {...item, ...data.resource});
      persist('deck-studio-resource-recent', recent); picked = []; lastImportRevision = editor.deck.revision; success = fillSlide ? 'Background added to this slide' : replace ? 'Image replaced' : `Added ${countLabel(images.length, "resource")} to this slide`;
      editor.notify(success); if (!keepOpen) onclose(); else if (replace) { selected = null; replacementDetails = false; }
    } catch (e: any) { importController.abort(); if (!disposed) { errorRecovery = e.name === 'AbortError' ? 'none' : 'import'; error = e.name === 'AbortError' ? replace ? 'Canceled. The image is unchanged.' : 'Canceled. No resources were added.' : e.message === 'Failed to fetch' ? 'Could not connect to the resource service. Try again.' : e.message; } }
    finally { importing = false; }
  }
  onMount(() => {
    try { favorites = readShelf(localStorage.getItem('deck-studio-resource-favorites')); recent = readShelf(localStorage.getItem('deck-studio-resource-recent'), 40); } catch { /* storage restrictions do not affect browsing */ }
    try { const p = JSON.parse(localStorage.getItem('deck-studio-resource-preferences') || '{}'); if (['photo', 'icon', 'illustration', 'used'].includes(p.kind)) kind = p.kind; for (const k of Object.keys(queries) as (Kind | 'favorites')[]) if (typeof p.queries?.[k] === 'string') queries[k] = p.queries[k].slice(0, 120); if (ICON_SETS.some(s => s.id === p.iconSet) || p.iconSet === 'all') iconSet = p.iconSet; if (['all','outline','solid','duotone'].includes(p.iconStyle)) iconStyle = p.iconStyle; if (p.license === 'by') license = 'by'; if (['wide','tall','square'].includes(p.aspect)) aspect = p.aspect; if (PHOTO_SOURCES.some(s => s.id === p.photoSource)) photoSource = p.photoSource; if (ILLUSTRATION_SETS.some(s => s.id === p.collection)) collection = p.collection; if (RESOURCE_CATEGORIES.some(c => c.id === p.category)) category = p.category; if(GRAPHIC_FAMILIES.some(f=>f.id===p.family))family=p.family; keepOpen = !replaceId && p.keepOpen === true; if (/^#[\da-f]{6}$/i.test(p.iconColor)) iconColor = p.iconColor; color = kind === 'icon' ? iconColor : illustrationColor; } catch { /* invalid preferences do not affect documents */ }
    try {
      const p = JSON.parse(localStorage.getItem('deck-studio-resource-preferences') || '{}');
      illustrationView = p.illustrationView === 'graphics' || !p.illustrationView && p.collection === 'deck-graphics' && p.category !== 'accent' ? 'graphics' : 'illustrations';
      if (ILLUSTRATION_TYPES.some(t => t.id === p.illustrationType)) illustrationType = p.illustrationType;
      if (p.category === 'accent') { illustrationView = 'illustrations'; illustrationType = 'accent'; category = ''; }
      else if (illustrationView === 'graphics' && GRAPHIC_CATEGORIES.some(t => t.id === p.category)) category = p.category;
    } catch { /* old preferences use the default browse view */ }
    if(initialConnectionProvider){photoSource=initialConnectionProvider;connectionOpen=true;}
    if (initialKind) { kind = initialKind; color = kind === 'icon' ? iconColor : illustrationColor; }
    if (!replaceId && !initialView && (initialBlueBlack || initialResourceId?.startsWith('blue-black:'))) { kind = 'illustration'; illustrationView = 'illustrations'; illustrationType = ''; collection = 'blue-black'; category = ''; scope = 'browse'; queries.illustration = initialResourceId?.slice(11) || ''; }
    if(!replaceId && !initialView && initialResourceId?.startsWith('deck-graphics:')){const accent=initialResourceId.startsWith('deck-graphics:accent-');kind='illustration';illustrationView=accent?'illustrations':'graphics';illustrationType=accent?'accent':'';collection=accent?'all':'deck-graphics';category='';family='';scope='browse';queries.illustration=initialResourceId.replace(/^deck-graphics:/,'').replace(/^accent-/,'').replaceAll('-',' ');}
    if (initialColor && /^#[\da-f]{6}$/i.test(initialColor)) color = illustrationColor = initialColor.toLowerCase();
    try { const p = JSON.parse(localStorage.getItem('deck-studio-resource-preferences') || '{}'); if (/^#[\da-f]{6}$/i.test(p.graphicColor)) graphicColor = p.graphicColor; } catch { /* use the default ink */ }
    if(initialResourceId?.startsWith('deck-graphics:')&&initialColor&&/^#[\da-f]{6}$/i.test(initialColor))graphicColor=initialColor.toLowerCase();
    if(initialView){for(const [key,value] of Object.entries(initialView)){if(typeof value!=='string'||!/^#[\da-f]{6}$/i.test(value))continue;if(key==='illustrationColor')illustrationColor=value;if(key==='graphicColor')graphicColor=value;if(key==='iconColor')iconColor=value;}color=kind==='icon'?iconColor:illustrationColor;}
    if (initialView?.replacement) replacementFit = resourceReplacementFit(initialView.replacement.fit);
    if (initialView) { family=initialView.family||''; kind = initialView.kind; scope = initialView.scope; favoriteView = Boolean(initialView.favoriteView); connectionOpen = Boolean(initialView.connectionOpen); if (initialView.collection && ILLUSTRATION_SETS.some(s => s.id === initialView.collection)) collection = initialView.collection; if (initialView.category !== undefined && [...RESOURCE_CATEGORIES, ...GRAPHIC_CATEGORIES].some(s => s.id === initialView.category)) category = initialView.category; }
    if (initialView) {
      illustrationView = initialView.illustrationView ?? (initialView.collection === 'deck-graphics' && initialView.category !== 'accent' ? 'graphics' : 'illustrations');
      illustrationType = initialView.illustrationType ?? (initialView.category === 'accent' ? 'accent' : '');
      if (initialView.category === 'accent') category = '';
    }
    if (replacing && !initialView) {
      const context = resourceReplacementContext(target?.resource);
      kind = context.kind; collection = context.collection; iconSet = context.iconSet; iconStyle = 'all'; photoSource = context.photoSource;
      const accent = target?.resource?.id.startsWith('deck-graphics:accent-');
      illustrationView = collection === 'deck-graphics' && !accent ? 'graphics' : 'illustrations'; illustrationType = accent ? 'accent' : '';
      queries[kind] = ''; category = ''; family = ''; aspect = ''; scope = 'browse'; favoriteView = false;
      color = target?.resource?.color || (kind === 'icon' || collection === 'deck-graphics' ? '#26362c' : editor.deck ? defaultIllustrationColor(editor.deck) : ORIGINAL_ACCENT);
      if (kind === 'icon') iconColor = color; else if (collection === 'deck-graphics') graphicColor = color; else illustrationColor = color;
      if (target?.resource?.graphicRecipe) recipe = renderedRecipe = normalizeGraphicRecipe(target.resource.graphicRecipe);
    }
    initialReplacementColor = color;
    if (compact && kind === 'used') kind = 'illustration';
    if (compact && quickView) setQuickView(quickView);
    if (compact) searchOpen = replacing || (!favoriteView && (kind === 'icon' || kind === 'photo')) || Boolean(query);
    mounted = true;
    void api<ResourceCatalog>('/api/resources/catalog').then(value => catalog = value).catch(() => {});
    void api<PhotoProviderStatus[]>('/api/resources/providers').then(value => { if (disposed) return; photoProviders = value; if (kind === 'photo' && stockSource) void search(); }).catch(() => {});
    void search().then(() => { if (initialView?.selected) pick(initialView.selected,true); else if (!replacing && initialResourceId) { const item = items.find(i => i.id === initialResourceId); if (item) pick({...item,...(initialColor?{color:initialColor}:{}),...(initialGraphicRecipe?{graphicRecipe:initialGraphicRecipe}:{})},true); } });
    const focusTimer = setTimeout(() => { if (window.matchMedia('(min-width: 601px)').matches) searchInput?.focus({preventScroll: true}); }, 0);
    const escape = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || compact || event.key !== 'Escape' || !libraryNode?.contains(event.target as Node)) return;
      if (libraryNode.querySelector('[popover]:popover-open')) return;
      if (!selected && !filtersOpen && !paletteOpen && !batchMode) return;
      event.preventDefault(); event.stopPropagation();
      if (importing) return;
      if (paletteOpen) paletteOpen = false;
      else if (selected) void back();
      else if (filtersOpen) { filtersOpen = false; libraryNode.querySelector<HTMLButtonElement>('.resource-filter-toggle')?.focus({preventScroll:true}); }
      else void toggleBatch();
    };
    window.addEventListener('keydown', escape, true);
    return () => { onpreview?.(); disposed = true; clearTimeout(focusTimer); window.removeEventListener('keydown', escape, true); clearTimeout(searchTimer); controller?.abort(); importController?.abort(); request++; };
  });
</script>

{#snippet filterToggle()}
  <Button kind={compact || graphicsBrowse ? 'icon' : 'text'} class="resource-filter-toggle" aria-label={`Filters${activeFilters.length ? ` (${activeFilters.length} active)` : ''}`} title="Filters" aria-expanded={filtersOpen} aria-controls="resource-filters" disabled={importing} onclick={() => filtersOpen = !filtersOpen}><SlidersHorizontal size={16} />{#if !compact && !graphicsBrowse}<span>Filters</span>{/if}{#if activeFilters.length && !graphicsBrowse}<span class="resource-filter-count" aria-hidden="true">{activeFilters.length}</span>{/if}</Button>
{/snippet}

<div class="resource-library ui-control-surface ui-property-surface" class:compact class:replacing class:replacement-browsing={compact && replacing && !replacementDetails} class:graphics-browsing={graphicsBrowse} bind:this={libraryNode} class:detail-open={showDetail}>
  <div class="resource-content">
  {#if replacing}<div class="resource-replacement-target">
    {#if target?.src}<ResourceImage src={target.src} alt="Current image" />{/if}
    <div><span>Replacing</span><strong title={target?.name}>{target?.name || 'Image'}</strong><small>{replaceDisabled ? target?.locked ? 'Unlock this image to replace it' : 'Select the image again' : 'Frame stays · Original proportions'}</small></div>
    {#if compact}<Button variant="quiet" class="resource-replacement-upload" aria-label="Upload replacement image" disabled={importing || replaceDisabled} onclick={() => onlocal(false, {...viewState(), selected: undefined})}><Upload size={16} /><span>Upload</span></Button>{/if}
  </div>{/if}
  {#if compact}
  <div class="resource-quick-controls">
    <span class="resource-quick-count" role="status">{loading ? 'Searching…' : countLabel(total, 'resource')}</span>
    {#if replacing}<div class="resource-replacement-views" role="group" aria-label="Replacement source">{#each replacementViews as view}<Button aria-label={`${view.label} · ${view.title}`} title={view.title} aria-pressed={activeQuickView === view.id} disabled={importing} onclick={() => chooseQuickView(view.id)}><view.icon size={16}/><span>{view.label}</span></Button>{/each}</div>{/if}
    <div class="resource-quick-actions">
      {#if !replacing && scope === 'browse' && (kind === 'icon' || graphicsBrowse || kind === 'illustration' && illustrationType === 'accent')}<ColorSwatch framed label="Color for new resources" value={kind === 'icon' ? iconColor : graphicsBrowse ? graphicColor : illustrationColor} disabled={importing} onchange={changeColor}/>{/if}
      {#if !replacing}<Button kind="icon" class="resource-search-toggle" aria-label="Search resources" title="Search resources" aria-expanded={searchOpen} aria-controls={searchId} data-active={Boolean(query)} disabled={importing} onclick={toggleSearch}><Search size={16} /></Button>{/if}
      {#if scope === 'browse' && kind !== 'used'}{@render filterToggle()}{/if}
    </div>
  </div>
  {:else}
  <div class="resource-nav">
    <div class="resource-tabs" use:uiIndicator role="tablist" aria-label="Resource type">
      {#each [{id: 'photo', label: 'Photos', icon: resourceIcons.photo}, {id: 'icon', label: 'Icons', icon: resourceIcons.icon}, {id: 'illustration', label: 'Illustrations', icon: resourceIcons.illustration}, {id: 'graphics', label: 'Graphics', icon: resourceIcons.graphics}, {id: 'used', label: 'In document', icon: resourceIcons.used}] as tab}
        {@const tabActive = !favoriteView && (tab.id === 'graphics' ? graphicsBrowse : kind === tab.id && !(tab.id === 'illustration' && graphicsBrowse))}
        <button role="tab" id="resource-tab-{tab.id}" aria-controls="resource-results" aria-selected={tabActive} tabindex={tabActive ? 0 : -1} class:active={tabActive} disabled={importing} onkeydown={tabKey} onclick={() => tab.id === 'graphics' ? chooseQuickView('graphics') : switchKind(tab.id as Kind)}><tab.icon size={16} />{tab.label}</button>
      {/each}
    </div>
    <button class="text-btn ghost resource-upload" aria-label="Upload images" onclick={() => onlocal(keepOpen, {...viewState(), selected: undefined})} disabled={importing}><Upload size={16} /><span>Upload images</span></button>
  </div>
  {/if}
  {#if !compact && kind === 'photo' && scope === 'browse'}<div class="resource-photo-providers" role="group" aria-label="Photo provider">
    <button class:active={!stockSource} aria-pressed={!stockSource} disabled={importing} onclick={() => choosePhotoSource('')}>Open collections</button>
    {#each ['unsplash', 'pexels'] as source}<button class:active={photoSource === source} aria-pressed={photoSource === source} disabled={importing} onclick={() => choosePhotoSource(source)}>{source === 'unsplash' ? 'Unsplash' : 'Pexels'}{#if !photoProviders.find(p => p.id === source)?.configured}<small>Not connected</small>{/if}</button>{/each}
  </div>{/if}
  {#if !compact || searchOpen}
  <form id={searchId} class="resource-search" transition:uiCollapse onsubmit={(e) => { e.preventDefault(); void search(); }}>
    <div class="resource-query"><Search size={16} /><input bind:this={searchInput} data-dialog-autofocus={!compact && typeof window !== 'undefined' && window.innerWidth > 600 ? true : undefined} aria-label="Search resources" value={query} oninput={e => queryInput(e.currentTarget.value)} onkeydown={searchKey} placeholder={graphicsBrowse?"Dots, grain, arrows…":"Search…"} disabled={importing} />{#if query}<button class="icon-btn" type="button" aria-label="Clear resource search" disabled={importing} onclick={() => { queries[queryKey] = ''; void search(); searchInput?.focus({preventScroll: true}); }}><X size={16} /></button>{/if}{#if !compact}<button class="text-btn resource-search-submit" disabled={importing} type="submit">Search</button>{/if}</div>
    {#if (!compact || replacing) && scope === 'browse' && kind !== 'used'}{@render filterToggle()}{/if}
  </form>
  {/if}
  {#if kind === 'illustration' && scope === 'browse' && !favoriteView && !selected}
    {#if graphicsBrowse}
      <div class="resource-graphics-categories" role="group" aria-label="Graphic type">{#each GRAPHIC_CATEGORIES as c}<button class="text-btn" aria-pressed={category === c.id} disabled={importing} onclick={() => chooseGraphicCategory(c.id)}>{c.label}</button>{/each}</div>
    {:else}
      <div class="resource-graphics-categories" role="group" aria-label="Illustration type">{#each ILLUSTRATION_TYPES as c}<button class="text-btn" aria-label={`${c.label} · ${c.title}`} title={c.title} aria-pressed={illustrationType === c.id} disabled={importing} onclick={() => chooseIllustrationType(c.id)}>{c.label}</button>{/each}</div>
    {/if}
  {/if}
  {#if kind === 'photo' && scope === 'browse' && stockSource}<div class="resource-photo-notice"><span>{stockSource === 'unsplash' ? 'Unsplash License · Images require an internet connection' : 'Pexels License · Available offline after import'}</span><button class="text-btn" disabled={importing} onclick={() => { connectionOpen = !connectionOpen; if (compact) expand(); }}>{sourceStatus?.configured ? 'Provider details' : 'Photo options'}</button>{#if !compact}<a href={photoBrowseUrl(stockSource, query)} target="_blank" rel="noopener noreferrer">Browse provider website<ExternalLink size={12} /></a>{/if}</div>{/if}
  {#if kind === 'photo' && scope === 'browse' && ['nasa','rawpixel','europeana','smithsonian_national_museum_of_natural_history','smithsonian_air_and_space_museum'].includes(photoSource)}<p class="resource-archive-note">Search photography, museum collections, and archive images by license.</p>{/if}
  {#if !compact && connectionOpen && kind === 'photo' && stockSource}{#key stockSource}<PhotoConnection provider={stockSource} status={sourceStatus} onconfigured={photoConfigured} onclose={() => connectionOpen = false} />{/key}{/if}

  {#if filtersOpen && scope === 'browse' && kind !== 'used'}<div class="resource-filters" transition:uiCollapse id="resource-filters" inert={!filtersOpen}>
    {#if kind === 'photo'}
      {#if !stockSource}<label>License<select class="ui-property-input" aria-label="Photo license" bind:value={license} disabled={importing} onchange={() => search()}><option value="cc0">No attribution required · CC0 / Public domain</option><option value="by">Attribution required · CC BY</option></select></label>{/if}
      <label>Orientation<select class="ui-property-input" aria-label="Photo orientation" bind:value={aspect} disabled={importing} onchange={() => search()}><option value="">All orientations</option><option value="wide">Landscape</option><option value="tall">Portrait</option><option value="square">Square</option></select></label>
      <label>Resource source<select class="ui-property-input" aria-label="Photo source" value={photoSource} disabled={importing} onchange={event => choosePhotoSource(event.currentTarget.value)}>{#each PHOTO_SOURCES as source}<option value={source.id}>{source.label}</option>{/each}</select></label>
    {:else if kind === 'icon'}
      <label>Icon collection<select class="ui-property-input" aria-label="Icon collection" bind:value={iconSet} disabled={importing} onchange={() => search()}><option value="all">All 10 collections</option>{#each ICON_SETS as set}<option value={set.id}>{set.label}</option>{/each}</select></label>
      <label>Icon style<select class="ui-property-input" aria-label="Icon style" bind:value={iconStyle} disabled={importing} onchange={() => search()}><option value="all">All styles</option><option value="outline">Outline</option><option value="solid">Filled</option><option value="duotone">Duotone</option></select></label>
    {:else}
      {#if !graphicsBrowse}<label>Collection<select class="ui-property-input" aria-label="Illustration collection" bind:value={collection} disabled={importing} onchange={() => { category = ''; family = ''; void search(); }}>{#each illustrationCollections as set}<option value={set.id}>{set.label}</option>{/each}</select></label>{/if}
      {#if collection==='deck-graphics'}<label>Family<select class="ui-property-input" aria-label="Graphic family" bind:value={family} disabled={importing} onchange={()=>search()}><option value="">All families</option>{#each families as f}<option value={f.id} disabled={!f.count && f.id!==family}>{f.label} ({f.count})</option>{/each}</select></label>{/if}
      {#if graphicsBrowse}<label>Type<select class="ui-property-input" aria-label="Graphic type" bind:value={category} disabled={importing} onchange={() => { family = ''; void search(); }}>{#each GRAPHIC_CATEGORIES as c}<option value={c.id}>{c.label}</option>{/each}</select></label>
      {:else if illustrationType !== 'accent' && collection !== 'deck-graphics'}<label>Topic<select class="ui-property-input" aria-label="Illustration topic" bind:value={category} disabled={importing} onchange={() => search()}>{#each RESOURCE_CATEGORIES as c}<option value={c.id}>{c.label}</option>{/each}</select></label>{/if}
    {/if}
    <button class="text-btn" disabled={importing} onclick={() => clearFilter()}>Reset filters</button>
    {#if !compact}<div class="resource-suggestions" aria-label="Suggested searches">{#each suggestions as value}<button disabled={importing} onclick={() => { queries[kind] = value; void search(); }}>{value}</button>{/each}</div>{/if}
  </div>{/if}
  {#if !compact && !graphicsBrowse && activeFilters.length}<div class="resource-active-filters" aria-label="Active filters">{#each activeFilters as filter}<button disabled={importing} aria-label="Remove filter: {filter.label}" onclick={() => clearFilter(filter.key)}>{filter.label}<X size={12} /></button>{/each}</div>{/if}
  {#if !compact}
  <div class="resource-browse-tools">
    <div class="resource-shelves" aria-label="Resource view"><button class:active={scope === 'browse'} aria-pressed={scope === 'browse'} disabled={importing} onclick={() => switchScope('browse')}>{kind === 'used' ? 'All resources' : 'All'}</button>{#if kind !== 'used'}<button class:active={scope === 'favorites'} aria-pressed={scope === 'favorites'} disabled={importing} onclick={() => switchScope('favorites')}><Star size={16} />Favorites{favoriteCount ? ` ${favoriteCount}` : ''}</button><button class:active={scope === 'recent'} aria-pressed={scope === 'recent'} disabled={importing} onclick={() => switchScope('recent')}><History size={16} />Recent</button>{/if}</div>
    <div class="resource-mode-tools">
      {#if scope === 'browse' && kind === 'illustration' && (collection === 'blue-black' || collection === 'all')}<div class="resource-palette"><PopoverPanel title="Illustration color" bind:open={paletteOpen} width={300} height={420} autoHeight disabled={importing}>
        {#snippet trigger()}<span class="resource-color-dot" style:background={color}></span>Color{/snippet}
        <AccentPicker value={color} onchange={changeColor} disabled={importing} />
      </PopoverPanel></div>{/if}
    {#if !replacing}<button class="text-btn resource-multi-toggle" class:icon-btn={graphicsBrowse} aria-label={batchMode ? "Done selecting resources" : "Select multiple resources"} title={batchMode ? "Exit multiple selection" : "Select several resources to place together"} aria-pressed={batchMode} disabled={importing} onclick={toggleBatch}><CheckSquare size={16} />{#if !graphicsBrowse}{batchMode ? 'Done' : 'Select'}{/if}</button>{/if}
    </div>
  </div>
  {/if}
  {#if error && (items.length || needsConnection || errorRecovery === 'none')}<Notice tone="error" title={errorRecovery === 'import' ? 'Resource could not be added' : 'Resources unavailable'} message={error} ondismiss={() => error = ''} dismissLabel="Dismiss resource error">
    {#snippet actions()}{#if !importing && errorRecovery !== 'none' && items.length}<Button variant="secondary" onclick={retryError}>{errorRecovery === 'import' ? replacing ? 'Retry replacement' : 'Retry adding' : 'Try again'}</Button>{/if}{/snippet}
  </Notice>{/if}
  {#if success}<div class="resource-success" transition:uiPresence role="status"><span><Check size={16} />{success}</span>{#if editor.deck?.revision === lastImportRevision}<button class="text-btn" onclick={undoImport}><Undo2 size={16} />Undo</button>{/if}</div>{/if}
  <div class="resource-workspace" class:has-selection={showDetail}>
    <div class="resource-results" use:uiChange={`${kind}:${scope}:${favoriteView}:${Boolean(selected)}`} bind:this={resultsNode} id="resource-results" role={compact || favoriteView ? 'region' : 'tabpanel'} aria-label={favoriteView ? 'Favorite resources' : compact ? 'Resource results' : undefined} aria-labelledby={compact || favoriteView ? undefined : `resource-tab-${graphicsBrowse ? 'graphics' : kind}`}>
      {#if !compact}<div class="resource-result-head" role={loading ? undefined : 'status'}><span>{loading ? 'Searching…' : countLabel(total, "resource")}{#if graphicsBrowse && family} · {GRAPHIC_FAMILIES.find(f=>f.id===family)?.label}{/if}</span><span>{replacing ? 'Select to preview replacement' : batchMode ? 'Select resources to place together' : 'Preview, then place on canvas'}</span></div>{/if}
      {#if loading && !items.length}<FeedbackState state="loading" density={compact ? 'compact' : 'roomy'} title="Loading resources…" description=""/>
      {:else if error && !items.length && !needsConnection && errorRecovery !== 'none'}<FeedbackState state="error" density={compact ? 'compact' : 'roomy'} title="Resources unavailable" description={error}>
        <Button variant="secondary" disabled={importing} onclick={retryError}>Try again</Button><Button variant="quiet" onclick={()=>{error='';resetSearch();searchInput?.focus();}}>Reset search</Button>
      </FeedbackState>
      {:else if !items.length}
        <EmptyState density={compact ? 'compact' : 'roomy'} icon={needsConnection ? Image : error ? RefreshCw : scope === 'favorites' ? Star : scope === 'recent' ? History : kind === 'used' ? Image : Search}
          title={needsConnection ? `${stockSource === 'unsplash' ? 'Unsplash' : 'Pexels'} unavailable here` : error ? 'Resources unavailable' : query.trim() ? 'No matching resources' : scope === 'favorites' ? 'No favorite resources yet' : scope === 'recent' ? 'No recent resources yet' : kind === 'used' ? 'No library images yet' : 'No matching resources'}
          description={needsConnection ? 'Browse the provider website and upload a licensed photo, or use open collections.' : error ? 'Try reloading resources. Your document is unchanged.' : query.trim() ? 'Try another search or reset filters to browse.' : scope === 'favorites' ? 'Star a resource while browsing to keep it here.' : scope === 'recent' ? 'Placed resources appear here.' : kind === 'used' ? 'Reuse images from this document.' : 'Try another search or reset filters to browse.'}>
          {#if needsConnection}<Button variant="secondary" onclick={() => choosePhotoSource('')}>Browse open collections</Button>
          {:else if error && errorRecovery !== 'none'}<Button variant="secondary" disabled={importing} onclick={retryError}>{errorRecovery === 'import' ? replacing ? 'Retry replacement' : 'Retry adding' : 'Reload resources'}</Button>
          {:else if query || activeFilters.length}<Button variant="secondary" disabled={importing} onclick={()=>{resetSearch();searchInput?.focus();}}>Reset search</Button>
          {:else if scope !== 'browse'}<Button variant="secondary" onclick={() => switchScope('browse')}>Browse resources</Button>
          {:else if kind === 'used'}<Button variant="secondary" onclick={() => switchKind('illustration')}>Browse illustrations</Button>{/if}
        </EmptyState>
      {:else}<div class="resource-grid" class:icon-grid={kind === 'icon' && !favoriteView} aria-busy={loading || importing}>
        {#each items as item, index (viewKey(item))}<div class="resource-tile" use:contextActions={()=>({label:item.title,items:[
          {label:'Preview',icon:Eye,disabled:importing||loading,onselect:()=>pick(item)},
          {label:replacing?'Replace image':'Place on canvas',icon:replacing?Replace:Plus,disabled:importing||loading||Boolean(replacing&&replaceDisabled),onselect:()=>importItems([item],replacing)},
          {label:isFavorite(item)?'Remove from favorites':'Add to favorites',icon:Star,checked:isFavorite(item),divider:true,disabled:importing,onselect:()=>favorite(item)},
          ...(!compact&&!replacing?[{label:isPicked(item)?'Remove from selection':'Add to selection',icon:CheckSquare,checked:isPicked(item),disabled:importing,onselect:()=>{batchMode=true;togglePick(item);}}]:[]),
        ]})} class:selected={selected && viewKey(selected)===viewKey(item)} class:picked={isPicked(item)}>
          <button class="resource-preview-button" data-resource-card data-resource-id={item.id} aria-pressed={batchMode ? isPicked(item) : selected && viewKey(selected)===viewKey(item)} disabled={importing || loading} onclick={event => tileClick(item, event)} onkeydown={event => gridKey(event, index)}>
            <span class="sr-only">{batchMode ? 'Select' : 'Preview'} </span><div class="resource-thumb" class:graphic-background={isGraphicBackground(item.id)} class:vector={item.kind !== 'photo'} class:icon-preview={item.kind === 'icon'} class:art-preview={item.kind === 'illustration' && !isGraphicBackground(item.id)} class:soft-preview={canSoftenPreview(item, itemColor(item))} class:dark-preview={resourcePreviewBackground(item, itemColor(item)) === 'dark'}><ResourceImage src={imageUrl(item,isGraphicBackground(item.id))} alt="" loading="lazy" decoding="async" onload={e => { (e.currentTarget as HTMLImageElement).style.visibility = ''; e.currentTarget.parentElement?.classList.remove('failed'); }} onerror={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; e.currentTarget.parentElement?.classList.add('failed'); }} />{#if batchMode}<span class="resource-check" class:checked={isPicked(item)}>{#if isPicked(item)}<Check size={12} />{/if}</span>{/if}</div>
            <strong title={item.title}>{item.title}</strong>{#if replacing && item.id === target?.resource?.id}<span class="resource-current-label">Current</span>{/if}{#if !item.id.startsWith('unsplash:') && !item.id.startsWith('pexels:')}<small>{item.kind === 'icon' ? item.provider : item.kind === 'photo' ? item.creator || item.provider : item.id.startsWith('deck-graphics:') ? isGraphicBackground(item.id) ? `${graphicInfo(item).familyLabel} · Detail` : `${graphicInfo(item).familyLabel} · Accent` : item.collection === 'blue-black' ? 'Recolorable' : item.collection === 'doodles' ? 'Hand-drawn' : 'Recolorable'}</small>{/if}
            {#if item.graphicRecipe}<small class="variant-summary" title={recipeSummary(item)}>{Math.round(item.graphicRecipe.strength*100)}% · {item.graphicRecipe.scale}× · {item.graphicRecipe.rotation}°</small>{/if}
          </button>
          {#if item.id.startsWith('unsplash:') || item.id.startsWith('pexels:')}<div class="resource-photo-credit"><a href={item.creatorUrl || item.sourceUrl} target="_blank" rel="noopener noreferrer">{item.creator}</a><span>·</span><a href={item.id.startsWith('unsplash:') ? 'https://unsplash.com/?utm_source=deck_studio&utm_medium=referral' : 'https://www.pexels.com/'} target="_blank" rel="noopener noreferrer">{item.provider}</a></div>{/if}
          {#if !replacing}<div class="resource-tile-actions" class:has-place={!batchMode}>
            {#if !compact}<Button kind="icon" class={isFavorite(item) ? "resource-favorite on" : "resource-favorite"} data-tooltip={isFavorite(item) ? 'Remove from favorites' : 'Add to favorites'} aria-label="{isFavorite(item) ? 'Remove from favorites' : 'Add to favorites'} {item.title}" aria-pressed={isFavorite(item)} disabled={importing} onclick={() => favorite(item)}><Star size={16} fill={isFavorite(item) ? 'currentColor' : 'none'} /></Button>{/if}
            {#if batchMode}<button class="resource-quick" aria-label="Preview {item.title}" disabled={importing} onclick={() => pick(item)}><Search size={16} /><span>Preview</span></button>
            {:else}<Button kind="icon" class="resource-add" data-tooltip={isGraphicBackground(item.id) ? 'Fill area' : 'Place on canvas'} aria-label="{isGraphicBackground(item.id) ? 'Fill area with' : 'Place on canvas'} {item.title}" title={isGraphicBackground(item.id) ? 'Drag on the canvas to fill any area' : 'Place on canvas · Choose a position and size'} disabled={importing || loading} onclick={() => importItems([item])}><Plus size={16} /></Button>{/if}
          </div>{/if}
        </div>{/each}
      </div>{/if}
      {#if hasMore}<div class="resource-pagination"><Button variant="secondary" busy={loading} disabled={importing} onclick={() => search(page + 1, true)}>Load more{items.length < total ? ` · Showing ${items.length}` : ''}</Button></div>{/if}
    </div>
    {#if selected && showDetail}<aside class="resource-detail" in:uiPresence={{x: 6, y: 0}} use:uiChange={selected.id} aria-label="Resource preview and import">
      <div class="resource-detail-head"><button class="resource-back text-btn" aria-label="Back to resources" title="Back to resources" onclick={back} disabled={importing}><ArrowLeft size={16} />Back</button><div><button class="icon-btn" aria-label="Preview previous resource" disabled={importing || selectedIndex <= 0} onclick={() => pick(items[selectedIndex - 1])}><ArrowLeft size={16} /></button><button class="icon-btn" aria-label="Preview next resource" disabled={importing || selectedIndex < 0 || selectedIndex >= items.length - 1} onclick={() => pick(items[selectedIndex + 1])}><ArrowRight size={16} /></button><button class="icon-btn" aria-label="Close resource details" disabled={importing} onclick={back}><X size={16} /></button></div></div>
      {#if replacing && replacementImage}<ResourceReplacementFrame image={replacementImage} onload={() => previewState = 'ready'} onerror={() => previewState = 'error'}/><p class="resource-fit-caption" role="status">{previewState === 'error' ? 'Preview unavailable' : previewReady ? 'Preview in your image frame' : 'Loading preview…'}</p>{#if previewState === 'error'}<Button variant="quiet" onclick={() => previewAttempt++}><RefreshCw size={16}/>Retry preview</Button>{/if}
      {:else if isGraphicBackground(selected.id)}<GraphicPreview src={previewUrl} detailSrc={detailUrl} title={selected.title} {background} bind:mode={graphicPreviewMode} replaceId={replacing?originalReplaceId:undefined} onload={()=>previewState='ready'} onerror={()=>previewState='error'} />
        {#if previewState==='error'}<button class="text-btn" onclick={()=>previewAttempt++}>Retry preview</button>{/if}
      {:else}
      <div class="resource-large-preview" class:graphic-background={isGraphicBackground(selected.id)} class:vector={selected.kind !== 'photo'} class:icon-preview={selected.kind === 'icon'} class:art-preview={selected.kind === 'illustration' && !isGraphicBackground(selected.id)} class:soft-preview={!backgroundChoice && canSoftenPreview(selected, color)} class:dark-preview={background === 'dark'} class:checker-preview={background === 'checker'}>
        {#key previewUrl}<ResourceImage src={previewUrl} alt={selected.title} onload={() => previewState = 'ready'} onerror={() => previewState = 'error'} />{/key}
        {#if previewState !== 'ready'}<div class="preview-status"><FeedbackState density="compact" state={previewState === 'error' ? 'error' : 'loading'} title={previewState === 'error' ? 'Preview unavailable' : 'Loading preview…'}>
          {#if previewState === 'error'}<Button variant="secondary" onclick={() => previewAttempt++}>Try again</Button>{/if}
        </FeedbackState></div>{/if}
      </div>
      {/if}
      {#if !isGraphicBackground(selected.id)||graphicPreviewMode!=='slide'}<div class="resource-preview-background" aria-label="Preview background"><span>Background</span>{#each [{id:'paper',label:'Light'},{id:'dark',label:'Dark'},{id:'checker',label:'Transparency grid'}] as bg}<button aria-label="Preview background: {bg.label}" title={bg.label} aria-pressed={background === bg.id} class="resource-preview-swatch {bg.id}" onclick={() => backgroundChoice = bg.id}><span></span></button>{/each}</div>{/if}
      {#if replacing}<div class="resource-replacement-fit" role="group" aria-label="Replacement fit">{#each [{id:'contain',label:'Fit'},{id:'cover',label:'Fill'}] as mode}<Button aria-pressed={replacementFit === mode.id} disabled={importing} onclick={() => replacementFit = mode.id as 'contain' | 'cover'}>{mode.label}</Button>{/each}</div><p class="hint">Fit shows the full image. Fill crops to the frame.</p>{/if}
      <h3>{selected.title}</h3>
      {#if isGraphic(selected)}<p class="hint">{graphicInfo(selected).description}</p>{/if}
      {#if selected.colorable}<div class="resource-color">{#if compact}<div class="resource-quick-color"><span>Color</span><ColorField label={selected.id.startsWith('deck-graphics:') ? 'Graphic color' : selected.kind === 'icon' ? 'Icon color' : 'Illustration accent color'} value={color} onchange={changeColor} opaque allowClear={false} disabled={importing}/></div>{:else}<AccentPicker value={color} label={selected.id.startsWith('deck-graphics:') ? 'Graphic color' : selected.kind === 'icon' ? 'Icon color' : replacing?'Selected illustration accent color':'New illustration accent color'} onchange={changeColor} disabled={importing} />{/if}</div>{/if}
      {#if isGraphic(selected)}<GraphicControls value={recipe} repeatable={graphicInfo(selected).repeatable} disabled={importing} onchange={changeRecipe} />{/if}
      {#if !compact || !replacing}<div class="resource-detail-actions">
        {#if batchMode}<button class="text-btn primary full" disabled={importing} onclick={() => togglePick(selected!)}>{#if isPicked(selected!)}<Check size={16} />Remove from selection{:else}<Plus size={16} />Add to selection{/if}</button><button class="text-btn ghost full" disabled={importing} onclick={back}>Back to selection</button>
        {:else}<Button variant="primary" class="full" busy={importing} disabled={!previewReady || (replacing && (replaceDisabled || currentChoice))} onclick={() => importItems([selected!], replacing)}>{#if replacing}<Replace size={16} />{:else}<Plus size={16} />{/if}{replacing ? 'Replace image' : isGraphicBackground(selected.id) ? 'Fill an area' : 'Place on canvas'}</Button>{#if !replacing && isGraphicBackground(selected.id)}<button class="text-btn ghost full" disabled={importing || !previewReady} onclick={() => importItems([selected!], false, true)}>Fill slide</button>{/if}{#if target?.type === 'image' && !replacing}<button class="text-btn ghost full" disabled={importing || target.locked || !previewReady} onclick={() => importItems([selected!], true)}>Replace image</button>{/if}{/if}
      </div>{/if}
      {#if !replacing && isGraphicBackground(selected.id)}<p class="hint">Drag to fill any area, or fill the entire slide behind your content.</p>{/if}
      {#if target?.locked && (replacing || target.type === 'image')}<p class="hint">Unlock this image to replace it.</p>{/if}
      {#if replacing && target?.sourceRegion}<p class="resource-target-note">The source crop resets for the new image.</p>{/if}
      {#if isGraphic(selected)}<button class="text-btn full" disabled={importing||!previewReady} onclick={downloadGraphic}><Download size={16} />Download SVG</button>{/if}
      <div class="resource-detail-meta"><p>{#if selected.creatorUrl}<a href={selected.creatorUrl} target="_blank" rel="noopener noreferrer">{selected.creator}</a>{:else}{selected.creator || selected.provider}{/if}<span>{selected.attributionRequired ? selected.id.startsWith('unsplash:') || selected.id.startsWith('pexels:') ? 'Photographer and provider credits preserved' : 'Attribution required' : selected.license.startsWith('CC0') ? 'No attribution required' : selected.kind === 'icon' ? 'Copyright notice preserved' : selected.license}</span></p><button class="text-btn" aria-pressed={isFavorite(selected)} disabled={importing} onclick={() => favorite(selected!)}><Star size={16} fill={isFavorite(selected) ? 'currentColor' : 'none'} />{isFavorite(selected) ? 'In favorites' : 'Favorites'}</button></div>
      <details use:uiDisclosure class="resource-credit"><summary>Source and license · {selected.license}</summary><p>{selected.attribution}</p><div><a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">Original source<ExternalLink size={12} /></a><a href={selected.licenseUrl} target="_blank" rel="noopener noreferrer">View license<ExternalLink size={12} /></a></div>{#if selected.licenseNotice}<p>{selected.licenseNotice}</p>{/if}<button class="text-btn" onclick={() => copyCredit(selected!)}>{#if copied}<Check size={16} />Copied{:else}<Copy size={16} />Copy attribution{/if}</button></details>
    </aside>{:else}<aside class="resource-detail resource-detail-idle" aria-label="Use resource">{#if replacing && target?.src}<ResourceImage src={target.src} alt="Current selection" /><strong>Choose a resource for “{target.name || 'Image'}”</strong><p>Replacing keeps the image’s size and position.</p>{:else}{@const ResourceIcon = resourceIcons[graphicsBrowse ? 'graphics' : kind]}<div class="resource-idle-icon"><ResourceIcon size={30} strokeWidth={1.5} /></div><strong>Select a resource to preview it</strong><p>Click or drag on the canvas to place it.</p>{/if}<span>{kind === 'photo' ? 'Photo search requires an internet connection' : kind === 'used' ? 'Reuse resources from this document' : 'Icons and illustrations are available offline'}</span></aside>{/if}
  </div>
  </div>
  {#if compact && replacing}<div class="resource-replacement-footer ui-popover-more">
    <div class="resource-replacement-choice" role="status">
      {#if selected}<div class="resource-choice-thumb">{#key previewUrl}<ResourceImage src={previewUrl} alt="" onload={() => previewState = 'ready'} onerror={() => previewState = 'error'} />{/key}</div><div><strong>{selected.title}</strong><small>{currentChoice ? 'Current image' : previewState === 'error' ? 'Preview unavailable' : !previewReady ? 'Loading preview…' : 'Preview · Not applied'}</small></div><Button variant="quiet" size="sm" disabled={importing} aria-label={replacementDetails ? 'Browse resources' : 'Details · Fit, crop and source'} aria-expanded={replacementDetails} onclick={() => {replacementDetails = !replacementDetails;}}> {replacementDetails ? 'Browse' : 'Details'}</Button>
      {:else}<p>Choose a replacement.</p>{/if}
    </div>
    {#if selected && previewState === 'error'}<Button variant="quiet" onclick={() => previewAttempt++}><RefreshCw size={16} />Retry preview</Button>{/if}
    <div class="resource-replacement-commit"><Button variant="quiet" disabled={importing} onclick={onclose}>Cancel</Button><Button variant="primary" busy={importing} disabled={!selected || !previewReady || replaceDisabled || currentChoice} onclick={() => importItems([selected!], true)}><Replace size={16} />Replace image</Button></div>
    {#if importing}<div class="resource-import-progress"><span role="status">Preparing image…</span><Button variant="quiet" onclick={() => importController?.abort()}>Stop</Button></div>{:else}<p class="resource-replacement-hint">{target?.sourceRegion || target?.crop ? 'Crop resets · ' : 'Original proportions · '}You can undo</p>{/if}
  </div>
  {:else if compact && importing}<div class="resource-quick-footer ui-popover-more"><div class="resource-import-progress">{#if !showDetail || batchMode}<span class="spinner" aria-hidden="true"></span>{/if}<span role="status">Preparing {completed} / {importCount}</span><Button variant="quiet" onclick={() => importController?.abort()}>Cancel</Button></div></div>
  {:else if !compact}<DialogFooter class="resource-footer" inset stacked>
    {#if batchMode && picked.length}<div class="resource-picked-tray" aria-label="Selected resources">{#each picked as item}<button data-tooltip="Remove from selection" aria-label="Remove from selection {item.title}" title="Remove {item.title}" disabled={importing} onclick={() => togglePick(item)}><ResourceImage src={isGraphic(item)?`/api/resources/preview?${new URLSearchParams({id:item.id,color:item.color!,recipe:JSON.stringify(item.graphicRecipe)})}`:imageUrl(item)} alt="" /><X size={12} /></button>{/each}</div>{/if}
    <div class="resource-footer-main">
      {#if importing}<div class="resource-import-progress">{#if !showDetail || batchMode}<span class="spinner" aria-hidden="true"></span>{/if}<span role="status">Preparing {completed} / {importCount}</span><button class="text-btn" onclick={() => importController?.abort()}>Cancel</button></div>
      {:else if batchMode}<div class="resource-batch-actions"><div><strong>Selected {countLabel(picked.length, "resource")}</strong>{#if picked.length}<button class="text-btn" onclick={() => picked = []}>Clear</button>{:else}<span>Maximum {MAX_RESOURCE_BATCH} resources</span>{/if}</div><Button variant="primary" disabled={!picked.length} onclick={() => importItems(picked)}><Plus size={16} />Place{picked.length ? ` ${countLabel(picked.length, "resource")}` : ' selection'}</Button></div>
      {:else}<p>{replacing ? 'You can undo replacements' : catalog ? kind === 'icon' ? countLabel(catalog.iconCount, 'icon') : kind === 'illustration' ? countLabel(catalog.illustrationCount, 'illustration') : 'Source info saved' : 'Source info saved'}</p>{/if}
      <label class="resource-keep-open ui-property-check" title={replacing ? 'Keep the library open after replacing' : 'Return to the library after placing the selected resources'}><input type="checkbox" bind:checked={keepOpen} disabled={importing} onchange={savePreferences} /> {replacing ? 'Stay open' : 'Return to library'}</label>
    </div>
  </DialogFooter>
  {/if}
</div>

<style>
  @media(max-width:760px){
    :global(:root .resource-browse-tools){flex-wrap:wrap;gap:8px}
    :global(.resource-browse-tools > .resource-shelves){flex:1 1 100%;flex-wrap:wrap}
    :global(.resource-browse-tools > :last-child){margin-left:auto}
  }

  .resource-library.compact :global(.resource-quick-controls){flex-wrap:wrap;gap:4px}
  .resource-library.compact :global(.resource-quick-actions){margin-left:auto}
  .resource-library.compact :global(.resource-graphics-categories){gap:4px}
  .resource-library.compact :global(.resource-graphics-categories button){padding-inline:8px}
  :global(.ui-popover-panel.resource-popover) .resource-library.compact.graphics-browsing :global(.resource-grid){grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  :global(.ui-popover-panel.resource-popover) .resource-library.compact.graphics-browsing :global(.resource-tile){display:block}
  :global(.ui-popover-panel.resource-popover) .resource-library.compact.graphics-browsing :global(.resource-preview-button){display:flex;flex-direction:column;align-items:stretch;gap:0}
  :global(.ui-popover-panel.resource-popover) .resource-library.compact.graphics-browsing :global(.resource-thumb){width:100%;height:auto;aspect-ratio:16/9}
  .resource-library.compact.graphics-browsing :global(.resource-thumb.graphic-background img){padding:0}
  :global(.ui-popover-panel.resource-popover) .resource-library.compact.graphics-browsing :global(.resource-tile-actions:not(.has-place) button){width:100%;padding:4px 8px}
  .resource-library.compact.graphics-browsing :global(.resource-quick span){display:inline}
  .resource-preview-button small.variant-summary{display:block;color:var(--text-secondary);font-size:var(--ui-meta);line-height:1.3}
</style>
