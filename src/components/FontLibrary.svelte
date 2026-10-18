<script lang="ts">
  import {canEditText} from '../core/shapes';
  import '../fonts.css';
  import FeedbackState from './FeedbackState.svelte';
  import Notice from './ui/Notice.svelte';
  import { fontDisplayName } from "../core/fonts";
  import { countLabel } from "../core/ui-copy";
  import { loadLibraryFont } from '../core/font-loading';
  import DocumentFonts from './DocumentFonts.svelte';
  import { uiIndicator, uiDisclosure, uiCollapse, uiChange } from '../ui-motion';
  import { onMount, onDestroy, untrack } from 'svelte';
  import { Star, Check, Type, ExternalLink, SlidersHorizontal, ChevronDown } from '@lucide/svelte';
  import { Button, SearchField, DialogFooter, SegmentedControl , EmptyState} from './ui';
  import { editor } from '../core/editor.svelte';
  import { FONT_LIBRARY, FONT_CATEGORIES, WEIGHT_LABELS, fontStack, searchFonts, localFontChoices, nearestWeight } from '../core/fonts';
  import type { FontChoice } from '../core/fonts';
  import { fontSelectionOperations } from '../core/font-selection';
  import type { OnlineFont } from '../core/model';
  import { onlineCatalog, onlineReference, onlineFontItem, loadOnlineFont } from '../core/online-fonts';
  let {onclose,initialTab='browse'}: {onclose: () => void;initialTab?:'browse'|'document'} = $props();
  let tab=$state<'browse'|'document'>(untrack(()=>initialTab));
  const target = $state(untrack(() => ({deckId: editor.deck?.id, slideId: editor.slide?.id, revision: editor.deck?.revision,
    elements: editor.selection.filter(e => canEditText(e) && !e.locked).map(e => ({id: e.id, text: e.text, family: e.fontFamily, weight: e.fontWeight}))})));
  const originalText = target.elements[0]?.text.trim().slice(0, 240) || 'Designing for clearer decisions';
  const originalFamily = target.elements[0]?.family ?? 'Manrope';
  const storedFont = untrack(() => editor.deck?.onlineFonts?.find(f => f.family === originalFamily));
  const local = $derived(localFontChoices(editor.deck, originalFamily));
  let source = $state<'local' | 'online'>(storedFont ? 'online' : 'local');
  let chosen = $state<FontChoice>(storedFont ? onlineFontItem(storedFont) : untrack(()=>local.find(f => f.family === originalFamily) ?? FONT_LIBRARY[0]));
  let online = $state<FontChoice[]>([]), catalogLoading = $state(false), catalogError = $state(''), limit = $state(40);
  let reference = $state<OnlineFont | null>(storedFont ?? null), loadedOnline = $state<string[]>([]), retry = $state(0);
  let query = $state(''), category = $state('all'), language = $state('all'), onlyFavorites = $state(false);
  let filtersOpen = $state(false);
  let favorites = $state<string[]>([]);
  let previewText = $state(originalText), size = $state(32), weight = $state(untrack(() => nearestWeight(chosen.weights, target.elements[0]?.weight ?? 400)));
  let status = $state<'loading' | 'ready' | 'error'>('loading'), applying = $state(false), error = $state('');
  let weightEdited = $state(false);
  let disposed = false;
  onDestroy(() => { disposed = true; });
  let filtered = $derived(searchFonts(query, category, language, onlyFavorites ? favorites : undefined, source === 'online' ? online : local) as FontChoice[]);
  let filterCount = $derived(Number(category !== 'all') + Number(language !== 'all') + Number(onlyFavorites));
  let visible = $derived(filtered.slice(0, limit));
  $effect(() => { if (source === 'local') for (const font of visible) void loadLibraryFont(font.family, editor.deck?.fonts).catch(() => {}); });
  let hasChinese = $derived(/[\u3400-\u9fff]/.test(previewText));
  let stale = $derived(editor.deck?.id !== target.deckId || editor.slide?.id !== target.slideId || editor.deck?.revision !== target.revision);
  onMount(() => {
    try { const saved: unknown = JSON.parse(localStorage.getItem('deck-studio-font-favorites') ?? '[]');
      if (Array.isArray(saved)) favorites = saved.filter((f): f is string => typeof f === 'string' && f.length <= 100);
    } catch { /* Keep the library usable if local storage is unavailable. */ }
    if (source === 'online') void fetchCatalog();
  });
  async function fetchCatalog(refresh = false) {
    if (catalogLoading) return;
    catalogLoading = true; catalogError = '';
    try {
      const result = await onlineCatalog(refresh); if (disposed) return;
      const imported = new Set(editor.deck?.fonts?.map(f => f.family));
      online = result.filter(f => !imported.has(f.family));
      if (source === 'online' && !online.some(f => f.id === chosen.id)) choose(online.find(f => f.id === 'figtree') ?? online[0]);
    } catch { if (!disposed) catalogError = 'The online catalog is unavailable. You can use local fonts.'; }
    finally { if (!disposed) catalogLoading = false; }
  }
  function switchSource(next: typeof source) {
    source = next; limit = 40;
    if (next === 'online') {
      if (!online.length) void fetchCatalog();
      else if (!online.some(f => f.id === chosen.id)) choose(online.find(f => f.id === 'figtree') ?? online[0]);
    } else if (chosen.online) choose(local.find(f => f.family === originalFamily) ?? FONT_LIBRARY[0]);
  }
  function favorite(family: string) {
    favorites = favorites.includes(family) ? favorites.filter(f => f !== family) : [...favorites, family];
    try { localStorage.setItem('deck-studio-font-favorites', JSON.stringify(favorites)); } catch { /* Session favorites remain usable. */ }
  }
  function choose(font: typeof chosen | undefined) { if (!font || applying) return; reference = null; chosen = font; weight = nearestWeight(font.weights, weight); error = ''; }
  $effect(() => {
    const font = chosen, family = font.family, sample = previewText || (font.chinese ? 'Let type tell your story' : 'Aa'), currentWeight = weight;
    retry;
    let cancelled = false; status = 'loading';
    void (async () => {
      try {
        if (font.online) {
          const ref = storedFont?.id === font.id && storedFont.version === font.version ? storedFont : await onlineReference(font);
          if (cancelled) return; reference = ref;
          await loadOnlineFont(ref, currentWeight, sample);
          if (cancelled) return;
          loadedOnline = [...new Set([...untrack(() => loadedOnline), family])]; status = 'ready'; error = '';
        } else {
          reference = null;
          await loadLibraryFont(family, editor.deck?.fonts);
          const loaded = await document.fonts.load(`${currentWeight} 32px "${family}"`, sample);
          if (!cancelled) status = font.origin || loaded.length ? 'ready' : 'error';
        }
      } catch (e: any) { if (!cancelled) { status = 'error'; error = e.message; } }
    })();
    return () => { cancelled = true; };
  });
  async function apply() {
    if (applying || !editor.deck || !target.slideId || stale || !target.elements.length || status !== 'ready') return;
    applying = true; error = '';
    const family = chosen.family, appliedWeight = weight, applyWeight = weightEdited, onlineRef = chosen.online ? reference : null;
    try {
      if (chosen.online && !onlineRef) throw new Error('The online font has not finished loading.');
      const operations = await fontSelectionOperations(editor.operationDocument(), target.slideId, target.elements.map(e => e.id), chosen, applyWeight ? appliedWeight : undefined, onlineRef);
      if (disposed) return;
      if (stale) throw new Error('The document has changed. Reopen the font library.');
      editor.commit(operations, '', 'manual', target.revision);
      if (editor.deck.revision === target.revision) throw new Error(editor.error || 'The font was not applied. Try again.');
      onclose();
    } catch (e: any) { error = /fetch|network|timeout|abort|font service unavailable/i.test(String(e.message)) ? 'This font could not load. Try again or choose a local font.' : e.message; } finally { applying = false; }
  }
</script>

<div class="font-library"><div class="document-font-tabs"><SegmentedControl label="Font options" options={[{value:'browse',label:'Browse',ariaLabel:'Browse fonts'},{value:'document',label:'Document',ariaLabel:'Document fonts'}]} value={tab} onchange={value=>tab=value as typeof tab}/></div>
  {#if tab==='document'}<DocumentFonts onimported={()=>target.revision=editor.deck?.revision}/>{:else}
  <div class="font-source-bar">
    <SegmentedControl label="Font source" options={[{value: 'local', label: 'Local', ariaLabel: 'Local fonts', title: 'Fonts available locally'}, {value: 'online', label: 'Online', ariaLabel: 'Online fonts', title: 'Open-source fonts from Google Fonts and Fontsource'}]} value={source} disabled={applying} onchange={value => switchSource(value as typeof source)} />
    <button class="text-btn ghost font-filter-toggle" class:active={filtersOpen || filterCount > 0} aria-expanded={filtersOpen} aria-controls="font-filters" disabled={applying} onclick={() => filtersOpen = !filtersOpen}><SlidersHorizontal size={14} />Filters{#if filterCount}<span>{filterCount}</span>{/if}</button>
  </div>
  <SearchField class="font-query" label="Search fonts" bind:value={query} disabled={applying} placeholder="Search fonts…" count={filtered.length} data-dialog-autofocus={typeof window !== 'undefined' && window.innerWidth > 600 ? true : undefined} />
  {#if filtersOpen}
    <div class="font-filters" transition:uiCollapse id="font-filters">
      <select aria-label="Font category" bind:value={category}><option value="all">All styles</option>{#each FONT_CATEGORIES as c}<option value={c.id}>{c.label}</option>{/each}</select>
      <select aria-label="Language support" bind:value={language}><option value="all">All languages</option><option value="chinese">Chinese</option></select>
      <button class="text-btn ghost" class:active={onlyFavorites} aria-pressed={onlyFavorites} onclick={() => onlyFavorites = !onlyFavorites}><Star size={14} />Favorites</button>
    </div>
  {/if}
  {#if catalogError && source === 'online' && visible.length}<Notice tone="error" title="Font catalog unavailable" message={catalogError}>{#snippet actions()}<Button variant="secondary" disabled={catalogLoading} onclick={() => fetchCatalog(true)}>Try again</Button>{/snippet}</Notice>{/if}
  <div class="font-workspace">
    <div class="font-results" class:font-results-empty={!visible.length} aria-label="Font list">
      {#each visible as font (font.id)}
        <div class="font-row" class:chosen={chosen.id === font.id}>
          <button class="font-choice" aria-label="Preview {font.family}" aria-pressed={chosen.id === font.id} onclick={() => choose(font)}>
            <span class="font-row-name" style:font-family={!font.online || loadedOnline.includes(font.family) ? fontStack(font.family) : undefined}>{fontDisplayName(font)}</span>
            <span class="font-row-meta">{#if fontDisplayName(font) !== font.family}<small>{font.family}</small>{/if}{#if font.origin}<small>{font.origin === 'document' ? 'Document' : 'System'}</small>{:else if font.chinese}<small>Chinese</small>{/if}</span>
            {#if chosen.id === font.id}<Check class="font-selected" size={14} />{/if}
          </button>
          <button class="icon-btn small font-favorite" aria-label="{favorites.includes(font.family) ? 'Remove from favorites' : 'Add to favorites'} {font.family}" aria-pressed={favorites.includes(font.family)} onclick={() => favorite(font.family)}><Star size={14} fill={favorites.includes(font.family) ? 'currentColor' : 'none'} /></button>
        </div>
      {:else}
        {#if source === 'online' && (catalogLoading || catalogError)}<FeedbackState density="compact" state={catalogLoading ? 'loading' : 'error'} title={catalogLoading ? 'Loading online fonts…' : 'Font catalog unavailable'} description={catalogLoading ? '' : 'Try again or browse fonts available locally.'}>
          {#if !catalogLoading}<Button variant="secondary" onclick={() => fetchCatalog(true)}>Try again</Button><Button variant="quiet" onclick={() => switchSource('local')}>Local fonts</Button>{/if}
        </FeedbackState>{:else}<EmptyState density="compact" icon={Type} title={onlyFavorites && !favorites.length ? 'No favorite fonts yet' : 'No matching fonts'} description={onlyFavorites && !favorites.length ? 'Star a font while browsing to keep it here.' : 'Try another search or choose Show all fonts.'}>
          <Button variant="secondary" onclick={() => { query = ''; category = 'all'; language = 'all'; onlyFavorites = false; document.querySelector<HTMLInputElement>('.font-library .font-query input')?.focus(); }}>Show all fonts</Button>
        </EmptyState>{/if}
      {/each}
      {#if filtered.length > visible.length}<button class="text-btn ghost full font-load-more" onclick={() => limit += 40}>Show more</button>{/if}
    </div>
    <div class="font-detail" use:uiChange={chosen.id}>
      <div class="font-detail-head"><h3>{fontDisplayName(chosen)}</h3><span>Preview text</span></div>
      <textarea class="font-preview" aria-label="Font preview text" bind:value={previewText} maxlength="240" disabled={applying} spellcheck="false" style:font-family={fontStack(chosen.family, chosen.category)} style:font-size="{size}px" style:font-weight={weight} placeholder={chosen.chinese ? 'Type to preview this font' : 'Type to preview'}></textarea>
      {#if status === 'loading'}<Notice tone="progress" message="Loading font preview…"/>
      {:else if status === 'error'}<Notice tone="error" title="Font preview unavailable" message="Try again or choose a local font.">{#snippet actions()}<Button variant="secondary" onclick={() => retry++}>Try again</Button>{/snippet}</Notice>
      {:else if hasChinese && !chosen.chinese && !chosen.origin}<p class="hint">Chinese text may use a fallback font.</p>{/if}
      <details use:uiDisclosure class="font-options">
        <summary>More options<ChevronDown size={13} /></summary>
        <div class="font-options-body">
          <label class="font-size-control">Preview size <input aria-label="Font preview size" type="range" min="16" max="64" bind:value={size} /><span>{size}px</span></label>
          <label class="field-label">Font weight to apply<select aria-label="Font weight to apply" bind:value={weight} onchange={() => weightEdited = true}>{#each chosen.weights as w}<option value={w}>{WEIGHT_LABELS[w] || w} · {w}</option>{/each}</select></label>
          <div class="font-samples"><button class="text-btn ghost" onclick={() => previewText = chosen.chinese ? 'Let type tell your story\nPortfolio · Project review 2026' : 'Design with purpose\nAa Bb Cc · 0123456789'}>Sample text</button><button class="text-btn ghost" onclick={() => previewText = originalText}>{target.elements.length ? 'Use selected text' : 'Reset sample text'}</button></div>
          {#if chosen.origin}<p class="hint">{chosen.origin === 'system' ? 'System fonts vary by device.' : 'Uses this document’s font settings.'}</p>
          {:else}<div class="font-license"><span>Free and open source</span><a href={chosen.online && reference ? onlineFontItem(reference).license : chosen.license} target="_blank" rel="noreferrer">{reference?.license || chosen.licenseId || 'OFL-1.1'} <ExternalLink size={11} /></a><a href={chosen.source} target="_blank" rel="noreferrer">Source <ExternalLink size={11} /></a></div>{/if}
          {#if chosen.online}<p class="hint font-online-note">An internet connection is required on first use. Your browser may cache loaded font files.</p>{/if}
          {#if source === 'online'}<button class="text-btn ghost font-refresh" disabled={catalogLoading || applying} onclick={() => fetchCatalog(true)}>Refresh online catalog</button>{/if}
        </div>
      </details>
    </div>
  </div>
  {#if error && status !== 'error'}<Notice tone="error" title="Font could not be applied" message={error}/>{/if}
  {/if}
  <DialogFooter class="font-library-footer" inset>
    {#snippet info()}<div class="hint" role="status">{stale ? 'The document has changed. Reopen this dialog.' : tab==='document'?'Applies to this document only':target.elements.length ? `Apply to ${countLabel(target.elements.length, 'text object')}` : 'Select text to apply a font.'}</div>{/snippet}
    {#snippet actions()}<Button variant="secondary" onclick={onclose}>{tab==='browse'&&target.elements.length ? 'Cancel' : 'Close'}</Button>{#if tab==='browse'&&target.elements.length}<Button variant="primary" disabled={stale || status !== 'ready'} busy={applying} onclick={apply}>Apply font</Button>{/if}{/snippet}
  </DialogFooter>
</div>
