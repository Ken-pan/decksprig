<script lang="ts">
  import {canEditText} from '../core/shapes';
  import FeedbackState from './FeedbackState.svelte';
  import Notice from './ui/Notice.svelte';
  import { floatingPlacement, visualBounds } from '../ui-viewport';
  import { popoverFocus, restoreFocus } from '../ui-focus';
  import '../fonts.css';
  import { fontDisplayName } from "../core/fonts";
  import { countLabel } from "../core/ui-copy";
  import { loadLibraryFont } from '../core/font-loading';
  import { onMount, onDestroy, tick } from 'svelte';
  import { Search, Check, ChevronDown, Type, ArrowRight, X, ChevronLeft, ChevronRight } from '@lucide/svelte';
  import { Button , EmptyState} from './ui';
  import { editor } from '../core/editor.svelte';
  import { uid } from '../core/model';
  import { FONT_CATEGORIES, findFont, fontStack, localFontChoices, nearestWeight, searchFonts, type FontChoice } from '../core/fonts';
  import { onlineCatalog, onlineFontItem, onlineReference, loadOnlineFont } from '../core/online-fonts';
  import { fontSelectionOperations,documentFontSelectionOperations } from '../core/font-selection';
  import {documentFontChoices} from '../core/document-style-choices';
  import {TEXT_LABELS} from '../core/deck-design-system';
  import { textPropertyState } from '../core/text-properties';

  let {onbrowse, toolbar = false,showLinkHint=true}: {onbrowse: () => void; toolbar?: boolean;showLinkHint?:boolean} = $props();
  let baseFontSize = $state(16);
  const id = uid('font-picker');
  let trigger = $state<HTMLButtonElement>(), popup = $state<HTMLDivElement>(), search = $state<HTMLInputElement>();
  let open = $state(false), busy = $state(false), query = $state(''), source = $state<'document'|'local' | 'online'>('document');
  let category = $state('all');
  let local = $state<FontChoice[]>([]), online = $state<FontChoice[]>([]), catalogLoading = $state(false), catalogError = $state('');
  let previewAttempt = $state(0);
  let preview = $state<FontChoice | null>(null), previewLoading = $state(false), previewError = $state(''), loaded = $state<string[]>([]);
  const pageSize=40;
  let start=$state(0),navigated=false,typeahead='',typedAt=0;
  let active = $state(0), error = $state(''), sample = $state('Aa Let type tell your story'), previewWeight = $state(400);
  let left = $state(0), top = $state(0), height = $state(420), width = $state(300);
  let generation = 0, disposed = false, hoverTimer: ReturnType<typeof setTimeout> | undefined;
  let targetKey = '';
  let target = $state<{deckId: string; slideId: string; revision: number; ids: string[]} | null>(null);
  const selected = $derived(editor.selection.filter(e => canEditText(e) && !e.locked));
  // Labels inherit the same family/run fields as text, without the shape fill.
  const familyState = $derived(textPropertyState(editor.selection.filter(canEditText).map(e=>({...e,type:'text' as const})), 'fontFamily'));
  const currentFamily = $derived(familyState.value ?? 'Manrope');
  const mixedFamily = $derived(familyState.mixed);
  const familyLabel=$derived(mixedFamily?'Mixed fonts':fontDisplayName(findFont(currentFamily) ?? {family:currentFamily}));
  const canApply = $derived(Boolean(target?.ids.length));
  const documentChoices=$derived(documentFontChoices(editor.deck??{}));
  const documentItems=$derived(documentChoices.map(c=>local.find(f=>f.family===c.family)??(editor.deck?.onlineFonts?.find(f=>f.family===c.family)?onlineFontItem(editor.deck.onlineFonts.find(f=>f.family===c.family)!):{...localFontChoices(editor.deck,c.family)[0],id:`style:${c.family}`})));
  const fontLink=$derived(selected.length&&selected.every(e=>!e.design?.overrides?.includes('fontFamily')&&(e.design?.font??e.design?.text)===(selected[0].design?.font??selected[0].design?.text))?selected[0].design?.font??selected[0].design?.text:undefined);
  const items = $derived.by(() => {
    const result = searchFonts(query, source==='document'?'all':category, 'all', undefined, source==='document'?documentItems:source === 'local' ? local : online) as FontChoice[];
    return query.trim() ? result : result.sort((a, b) => Number(b.family === currentFamily) - Number(a.family === currentFamily));
  });
  const visible = $derived(items.slice(start, start+pageSize));
  const catalogFailed = $derived(source === 'online' && !visible.length && !catalogLoading && Boolean(catalogError));
  $effect(() => { if (open && source !== 'online') for (const font of visible) void loadLibraryFont(font.family, editor.deck?.fonts).catch(() => {}); });
  const activeId = $derived(items[active] ? `${id}-option-${active}` : undefined);
  function selectionKey() { return `${editor.deck?.id}:${editor.slide?.id}:${editor.deck?.revision}:${editor.selected.join(',')}`; }
  $effect(() => { const key = selectionKey(); if (open && key !== targetKey) close(); });
  onDestroy(() => { disposed = true; generation++; clearTimeout(hoverTimer); });
  onMount(() => {
    const scroll = (event: Event) => {
      if (!open || popup?.contains(event.target as Node)) return;
      const rect = trigger?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) close(); else position();
    };
    const resize = () => { if (open) position(); };
    const observer = new ResizeObserver(resize); if (popup) observer.observe(popup);
    document.addEventListener('scroll', scroll, true); window.addEventListener('resize', resize); window.visualViewport?.addEventListener('resize', resize); window.visualViewport?.addEventListener('scroll', resize);
    return () => { observer.disconnect(); document.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('scroll', resize); };
  });
  function position() {
    if (!trigger) return;
    baseFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const viewport = visualBounds(); width = Math.min(300, viewport.width - 24);
    const preferred=source==='document'?Math.min(460,180+documentItems.length*54):580;
    const result = floatingPlacement(trigger.getBoundingClientRect(), {width, height: popup?.offsetHeight || preferred}, viewport, {maxHeight: 580, preferredHeight: preferred, minHeight: source==='document'?260:!visible.length?480:360});
    height = result.maxHeight; left = result.left; top = result.top;
  }
  $effect(() => { visible.length; if (open) void tick().then(() => { if (open) position(); }); });
  async function toggle() {
    if (open) { close(true); return; }
    if (!editor.deck || !editor.slide) return;
    generation++; targetKey = selectionKey();
    target = {deckId: editor.deck.id, slideId: editor.slide.id, revision: editor.deck.revision, ids: selected.map(e => e.id)};
    local = localFontChoices(editor.deck, currentFamily);
    const stored = editor.deck.onlineFonts?.find(f => f.family === currentFamily);
    preview = stored ? onlineFontItem(stored) : local.find(f => f.family === currentFamily) ?? local[0];
    sample = selected[0]?.text.trim().slice(0, 120) || 'Aa Let type tell your story'; previewWeight = selected[0]?.fontWeight ?? 400;
    source = 'document'; query = ''; category = 'all'; resetList(); error = '';
    active = 0;
    open = true; position(); popup?.showPopover(); await tick(); position(); focusSource();
  }
  function returnToTrigger(){restoreFocus(trigger);}
  function close(restoreFocus = false) {
    open = false; generation++; busy = false; clearTimeout(hoverTimer); popup?.hidePopover();
    if (restoreFocus) returnToTrigger();
  }
  function toggled(event: ToggleEvent) { if (event.newState === 'closed' && open) { open = false; generation++; busy = false; clearTimeout(hoverTimer); } }
  async function fetchCatalog(refresh = false) {
    if (catalogLoading) return;
    catalogLoading = true; catalogError = '';
    try {
      const catalog = await onlineCatalog(refresh); if (disposed) return;
      const imported = new Set(editor.deck?.fonts?.map(f => f.family));
      const saved = editor.deck?.onlineFonts?.map(onlineFontItem) ?? [];
      online = [...new Map([...catalog, ...saved].filter(f => !imported.has(f.family)).map(f => [f.family, f])).values()];
    } catch (e: any) { if (!disposed) catalogError = 'Online catalog unavailable'; }
    finally { if (!disposed) catalogLoading = false; }
  }
  function focusSource(){if(source==='document')document.getElementById(activeId!)?.focus({preventScroll:true});else search?.focus();}
  function resetList(){active=0;start=0;navigated=false;typeahead='';const list=popup?.querySelector('[role="listbox"]');if(list)list.scrollTop=0;}
  async function switchSource(next: typeof source) { source = next; resetList(); if(next==='document')query=''; if (next === 'online' && !online.length && !catalogLoading) void fetchCatalog(); await tick();position();focusSource(); }
  function clearSearch() { query = ''; resetList(); search?.focus(); }
  function selectCategory(next: string) {
    category = category === next ? 'all' : next; resetList();
    preview = visible[0] ?? null;
    const list = popup?.querySelector('[role="listbox"]'); if (list) list.scrollTop = 0;
  }
  function hover(font: FontChoice, index: number) {
    if (busy) return;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.getAttribute('role') === 'option' && popup?.contains(focused)) {
      // A pointer preview must not change which focused option Enter will apply.
      clearTimeout(hoverTimer); hoverTimer = setTimeout(() => preview = font, 160);
    } else active = index;
  }
  $effect(() => {
    const font = items[active];
    if (!open || busy || !font) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => preview = font, 160);
    return () => clearTimeout(hoverTimer);
  });
  async function activate(index:number,focus:boolean){
    const session=generation;
    active=Math.max(0,Math.min(items.length-1,index));start=Math.floor(active/pageSize)*pageSize;navigated=true;preview=items[active]??null;
    await tick();if(!open||session!==generation)return;
    const option=document.getElementById(activeId!);
    if(focus)option?.focus({preventScroll:true});option?.scrollIntoView({block:'nearest'});
  }
  async function pageFonts(direction:1|-1){await activate(start+direction*pageSize,true);}
  function key(event: KeyboardEvent) {
    event.stopPropagation();
    if (!event.isComposing && event.keyCode !== 229 && (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 's') { event.preventDefault(); return; }
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (busy) { if (event.key === 'Enter') event.preventDefault(); }
    else if (!event.shiftKey && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      if (event.target === search && ['Home', 'End'].includes(event.key)) return;
      event.preventDefault(); if (!items.length) return;
      const next=event.key==='Home'?0:event.key==='End'?items.length-1:event.target===search&&!navigated?(event.key==='ArrowDown'?0:items.length-1):active+(event.key==='ArrowDown'?1:-1);
      void activate(next,event.target!==search);
    } else if (event.key === 'Enter' && items[active]) { event.preventDefault(); void choose(items[active]); }
    else if(event.target!==search&&event.key.length===1&&event.key.trim()){
      event.preventDefault();const now=Date.now(),letter=event.key.toLocaleLowerCase();
      typeahead=now-typedAt>700?letter:typeahead+letter;typedAt=now;
      const prefix=[...typeahead].every(c=>c===letter)?letter:typeahead;
      const from=prefix.length===1?active+1:active;
      for(let i=0;i<items.length;i++){const index=(from+i)%items.length;if(fontDisplayName(items[index]).toLocaleLowerCase().startsWith(prefix)){void activate(index,true);break;}}
    }
  }
  function quietKey(event: KeyboardEvent) { event.stopPropagation(); if (!event.isComposing && event.keyCode !== 229 && (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 's') event.preventDefault(); if (event.key === 'Escape' && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); close(true); } }
  $effect(() => {
    const font = preview, isOpen = open, text = sample, weight = previewWeight;
    if (!isOpen || !font) return;
    previewAttempt;
    let cancelled = false; previewLoading = true; previewError = '';
    void (async () => {
      try {
        if (font.online) {
          const ref = await onlineReference(font); if (cancelled) return;
          await loadOnlineFont(ref, weight, text);
        } else { await loadLibraryFont(font.family, editor.deck?.fonts); await document.fonts.load(`${nearestWeight(font.weights, weight)} 28px ${fontStack(font.family, font.category)}`, text); }
        if (!cancelled) { loaded = [...new Set([...loaded, font.family])]; previewLoading = false; }
      } catch { if (!cancelled) { previewLoading = false; previewError = 'Preview unavailable. Try again or choose a local font.'; } }
    })();
    return () => { cancelled = true; };
  });
  async function choose(font: FontChoice) {
    if (busy || !editor.deck) return;
    if (!target?.ids.length) { preview = font; return; }
    const captured = target, session = generation;
    const documentSource=source==='document';
    busy = true; error = ''; preview = font;
    try {
      const operations = documentSource?await documentFontSelectionOperations(editor.operationDocument(), captured.slideId, captured.ids, font):await fontSelectionOperations(editor.operationDocument(), captured.slideId, captured.ids, font);
      if (!open || disposed || session !== generation) return;
      if (selectionKey() !== targetKey) throw new Error('The selected text has changed. Select the font again.');
      editor.commit(operations, '', 'manual', captured.revision);
      if (editor.deck.id !== captured.deckId || editor.deck.revision === captured.revision) throw new Error(editor.error || 'The font was not applied. Try again.');
      close(true);
    } catch (e: any) {
      if (open && session === generation) error = /fetch|network|timeout|abort|font service unavailable/i.test(String(e.message))
        ? 'This font could not load. Try again or choose a local font.' : e.message;
    }
    finally { if (session === generation) busy = false; }
  }
</script>

<div class="font-picker" class:font-picker-toolbar={toolbar}>
  <button bind:this={trigger} class={toolbar ? 'text-btn font-toolbar-trigger' : 'font-trigger'} aria-label={toolbar ? 'Open font menu' : `Choose font · ${familyLabel}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} disabled={!editor.deck || (!toolbar && !selected.length)} onclick={toggle} onkeydown={event => { if (!event.isComposing && event.keyCode !== 229 && !event.altKey && !event.ctrlKey && !event.metaKey && event.key === 'ArrowDown') { event.preventDefault(); event.stopPropagation(); void toggle(); } }}>
    {#if toolbar}<Type size={16} /><span>Font</span>{:else}<span style:font-family={mixedFamily?undefined:fontStack(currentFamily)}>{familyLabel}</span><ChevronDown size={14} />{/if}
  </button>
  {#if !toolbar&&showLinkHint&&fontLink}<p class="font-link-hint">{TEXT_LABELS[fontLink]} font · Follows document</p>{/if}
  <div bind:this={popup} id={id} use:popoverFocus={{close:()=>close(), origin:()=>trigger}} popover="auto" inert={!open} role="dialog" tabindex="-1" class="font-dropdown" class:font-dropdown-document={source==='document'} class:font-dropdown-compact={height < baseFontSize * 30} class:font-dropdown-tight={height < 320} aria-label="Font menu" style:left="{left}px" style:top="{top}px" style:max-height="{height}px" style:width="{width}px" ontoggle={toggled}>
    {#if source!=='document'}<div class="font-dropdown-search"><Search size={14} /><input bind:this={search} role="combobox" aria-label="Search fonts" aria-autocomplete="list" aria-expanded={open} aria-controls="{id}-list" aria-activedescendant={activeId} bind:value={query} placeholder="Search fonts…" readonly={busy} aria-disabled={busy} oninput={resetList} onkeydown={key} />{#if query}<button class="font-dropdown-clear" aria-label="Clear font search" disabled={busy} onclick={clearSearch} onkeydown={quietKey}><X size={13} /></button>{/if}</div>{/if}
    <div class="font-dropdown-sources"><button aria-pressed={source==='document'} disabled={busy} onclick={()=>switchSource('document')} onkeydown={quietKey} aria-label="Document fonts">Document</button><button aria-pressed={source === 'local'} disabled={busy} onclick={() => switchSource('local')} onkeydown={quietKey} aria-label="Local fonts">Local</button><button aria-pressed={source === 'online'} disabled={busy} onclick={() => switchSource('online')} onkeydown={quietKey} aria-label="Online fonts" title="Open-source fonts">Online</button></div>
    <div class="font-dropdown-body">
    {#if source!=='document' && !(source === 'online' && !visible.length && (catalogLoading || catalogError))}
    <div class="font-dropdown-compact-category"><select aria-label="Font category" value={category} disabled={busy} onchange={event=>selectCategory(event.currentTarget.value as typeof category)}><option value="all">All categories</option>{#each FONT_CATEGORIES as option}<option value={option.id}>{option.label}</option>{/each}</select></div>
    <div class="font-dropdown-categories" role="group" aria-label="Font category">
      <Button class="ui-filter-chip" size="sm" aria-pressed={category === 'all'} disabled={busy} onclick={() => selectCategory('all')} onkeydown={quietKey}>All</Button>
      {#each FONT_CATEGORIES as option}<Button class="ui-filter-chip" size="sm" aria-pressed={category === option.id} disabled={busy} onclick={() => selectCategory(option.id)} onkeydown={quietKey}>{option.label}</Button>{/each}
    </div>
    {/if}
    <p class="font-dropdown-context">{source==='document'?'Document fonts · Size and spacing stay unchanged.':canApply ? target!.ids.length > 1 ? `Apply to ${countLabel(target!.ids.length, 'text object')}` : 'Custom font for selected text.' : 'Preview fonts. Select canvas text to apply.'}</p>
    <div class="font-dropdown-list" id="{id}-list" role={visible.length ? 'listbox' : undefined} aria-label="Font list" aria-busy={busy}>
      {#each visible as font, index (font.id)}
        <button id="{id}-option-{start+index}" role="option" aria-setsize={items.length} aria-posinset={start+index+1} aria-selected={canApply ? !mixedFamily && font.family === currentFamily : font.family === preview?.family} class:highlighted={active === start+index} aria-disabled={busy} tabindex={active === start+index ? 0 : -1} onclick={() => choose(font)} onpointermove={event => {if(event.pointerType!=='touch'&&!event.buttons)hover(font,start+index);}} onfocus={() => { active = start+index; navigated=true; preview = font; }} onkeydown={key}>
          <span class="font-dropdown-name" style:font-family={!font.online || loaded.includes(font.family) ? fontStack(font.family) : undefined}>{fontDisplayName(font)}</span>
          {#if canApply && !mixedFamily && font.family === currentFamily}<Check size={13} />{/if}
          {#if source==='document'}<small>{documentChoices.find(c=>c.family===font.family)?.label}</small>{:else if font.label || font.origin || font.chinese || (source === 'online' && !font.online)}<small>{font.label ? font.family : font.origin === 'document' ? 'Document fonts' : font.origin === 'system' ? 'System fonts' : font.chinese ? 'Chinese' : 'Built in'}</small>{/if}
        </button>
      {:else}{#if source === 'online' && (catalogLoading || catalogError)}<FeedbackState density={height < 320 ? 'inline' : 'compact'} state={catalogLoading ? 'loading' : 'error'} title={catalogLoading ? 'Loading online fonts…' : 'Font catalog unavailable'} description={catalogLoading ? '' : 'Try again or browse local fonts.'}>
      </FeedbackState>{:else}<EmptyState density={height < 320 ? 'inline' : 'compact'} icon={Type} title="No matching fonts" description="Try another search or choose another category.">
        {#if query.trim()}<Button variant="secondary" onclick={clearSearch} onkeydown={quietKey}>Clear search</Button>{/if}{#if source === 'local' && query.trim()}<Button onclick={()=>switchSource('online')} onkeydown={quietKey}>Search online fonts<ArrowRight size={12}/></Button>{/if}
      </EmptyState>{/if}{/each}
    </div>
    </div>
    {#if catalogFailed}<div class="font-dropdown-recovery"><Button variant="secondary" onclick={()=>{popup?.focus({preventScroll:true});void fetchCatalog(true);}} onkeydown={quietKey}>Try again</Button><Button onclick={()=>switchSource('local')} onkeydown={quietKey}>Local fonts</Button></div>{/if}
    {#if items.length>pageSize}<div class="font-dropdown-pagination"><span role="status">{start+1}–{Math.min(start+pageSize,items.length)} of {items.length}</span><button aria-label="Previous fonts" disabled={busy||start===0} onclick={()=>pageFonts(-1)} onkeydown={quietKey}><ChevronLeft size={16}/></button><button aria-label="Next fonts" disabled={busy||start+pageSize>=items.length} onclick={()=>pageFonts(1)} onkeydown={quietKey}><ChevronRight size={16}/></button></div>{/if}
    {#if source!=='document' && preview && visible.length}<div class="font-dropdown-preview" aria-label="Font preview"><div><span>Preview · {fontDisplayName(preview)}</span><span role="status">{busy ? 'Applying…' : previewLoading ? 'Loading…' : ''}</span></div><p style:font-family={fontStack(preview.family, preview.category)} style:font-weight={nearestWeight(preview.weights, previewWeight)}>{sample}</p>{#if previewError}<Notice tone="error" title="Font preview unavailable" message="Try again or choose a local font.">{#snippet actions()}<Button variant="secondary" disabled={busy} onclick={()=>previewAttempt++} onkeydown={quietKey}>Try again</Button>{/snippet}</Notice>{:else if /[\u3400-\u9fff]/.test(sample) && !preview.chinese && !preview.origin}<small>Chinese text may use a fallback font.</small>{/if}</div>{/if}
    {#if !catalogFailed}<div class="font-dropdown-footer"><span role="status">{countLabel(items.length, source === 'document'?'document font':source === 'online' ? 'open-source font' : 'local font')}</span><button onclick={() => { close(true); onbrowse(); }} onkeydown={quietKey}>Font library<ArrowRight size={12} /></button></div>{/if}
    {#if catalogError && source === 'online' && visible.length}<Notice tone="error" title="Font catalog unavailable" message={catalogError}>{#snippet actions()}<Button disabled={catalogLoading} onclick={() => fetchCatalog(true)} onkeydown={quietKey}>Try again</Button>{/snippet}</Notice>{/if}
    {#if error}<Notice tone="error" title="Font could not be applied" message={error}/>{/if}
  </div>
</div>
