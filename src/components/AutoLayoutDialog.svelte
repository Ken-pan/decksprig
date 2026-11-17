<script lang="ts">
  import {fontFamilyKey,sameFontFamily} from '../core/font-stack';
  import Notice from './ui/Notice.svelte';
  import {slideLabel} from '../core/slide-label';
  import { countLabel } from "../core/ui-copy";
  import { loadLibraryFont, loadLibraryTypography } from '../core/font-loading';
  import { onMount, tick } from 'svelte';
  import { uiPresence, uiChange, uiIndicator, uiDisclosure } from '../ui-motion';
  import { X, ArrowLeft, ArrowRight, Check, LockKeyhole, AlertCircle, RefreshCw, LayoutTemplate, Maximize2, Minimize2, Plus, Minus } from '@lucide/svelte';
  import SlideCanvas from './SlideCanvas.svelte';
  import Dialog from './Dialog.svelte';
  import { Button, DialogFooter , EmptyState} from './ui';
  import { editor } from '../core/editor.svelte';
  import type { SlideElement } from '../core/model';
  import { fontStack } from '../core/fonts';
  import { createTextMeasurer } from '../core/text-measure';
  import { AUTO_LAYOUTS, LAYOUT_STYLES, DEFAULT_LAYOUT_OPTIONS, analyzeLayout, curatedLayouts, layoutProposal, type LayoutChoiceId, type LayoutOptions, type LayoutSuggestion } from '../core/auto-layout';

  let {onclose}: {onclose: () => void} = $props();
  let dialog = $state<HTMLDialogElement>();
  let previewHost: HTMLDivElement;
  let previewWidth = $state(700);
  // Keep the proposal base immutable and cloneable by layout helpers.
  let base = $state.raw(editor.snapshot());
  const initialSlideId = editor.slide!.id;
  let slideId = $state(initialSlideId);
  let scope = $state<'slide' | 'deck'>('slide');
  let options = $state<LayoutOptions>({...DEFAULT_LAYOUT_OPTIONS});
  let pageOptions = $state<Record<string, LayoutOptions>>({});
  let retained = $state<Record<string, boolean>>({});
  let localOptions = $derived(pageOptions[slideId]);
  let currentOptions = $derived(localOptions ?? options);
  let keepPage = $derived(scope === 'deck' && !!retained[slideId]);
  let chosen = $state<Record<string, LayoutChoiceId>>({});
  let before = $state(false), fontsReady = $state(false), error = $state('');
  const measure = createTextMeasurer(family => fontStack(family, base.onlineFonts?.find(f => sameFontFamily(f.family,family))?.category));
  const imageAspects = new Map<string, number>();
  const imageSizes = new Map<string, number>();
  const imageStates = new Map<string, 'ready' | 'loading' | 'failed'>();
  let mediaRevision = $state(0);
  let reloadMedia = () => {};
  let inspectedImage = $state<SlideElement | null>(null);
  measure.aspect = e => imageAspects.get(e.src ?? '');
  measure.imageStatus = e => imageStates.get(e.src ?? '') ?? 'loading';
  let expanded = $state(false), previewZoom = $state(1);
  function expandPreview() { inspectedImage = null; expanded = !expanded; previewZoom = expanded && window.innerWidth < 760 ? 2 : 1; }
  async function inspectImage(image: SlideElement) { inspectedImage = image; expanded = true; previewZoom = 1; await tick(); dialog?.querySelector<HTMLButtonElement>('.return-layout')?.focus(); }
  function returnToLayout() { inspectedImage = null; previewZoom = window.innerWidth < 760 ? 2 : 1; }
  function inspectPointer(event: PointerEvent) { if (!(event.target instanceof HTMLImageElement)) return; const id = event.target.closest<HTMLElement>('[data-element-id]')?.dataset.elementId; const image = (before ? slide : candidate.slide).elements.find(e => e.id === id && e.type === 'image'); if (image) void inspectImage(image); }
  let slide = $derived(base.slides.find(s => s.id === slideId) ?? base.slides[0]);
  let info = $derived(analyzeLayout(base, slide));
  let plans = $derived.by(() => { void fontsReady; void mediaRevision; return scope === 'deck' ? base.slides.map(s => curatedLayouts(base, s.id, pageOptions[s.id] ?? options, measure)) : [curatedLayouts(base, slide.id, currentOptions, measure)]; });
  let review = $derived(scope === 'deck' ? plans[base.slides.findIndex(s => s.id === slide.id)] : plans[0]);
  let candidates = $derived(review.suggestions);
  let currentId = $derived(chosen[slide.id] ?? candidates.find(c => c.recommended)?.id ?? info.recommended);
  let selectedCandidate = $derived(candidates.find(c => c.id === currentId) ?? review.rejected.find(c => c.id === currentId)!);
  let candidate: LayoutSuggestion = $derived(keepPage ? {...selectedCandidate, slide, operations: [], issues: [], moved: 0, fitted: 0} : selectedCandidate);
  let batch = $derived(scope === 'slide' ? [candidate] : plans.flatMap((plan, i) => retained[base.slides[i].id] ? [] : [plan.suggestions.find(c => c.id === chosen[base.slides[i].id]) ?? plan.rejected.find(c => c.id === chosen[base.slides[i].id]) ?? plan.suggestions.find(c => c.recommended)!]));
  let issues = $derived(batch.flatMap(c => c.issues));
  let changedPages = $derived(batch.filter(c => c.operations.length).length);
  let operationCount = $derived(batch.reduce((n, c) => n + c.operations.length, 0));
  let stale = $derived(editor.deck?.id !== base.id || editor.deck?.revision !== base.revision);
  let index = $derived(base.slides.findIndex(s => s.id === slide.id));
  let feedback = $derived(keepPage ? 'Keep this slide unchanged when applying layout to the document.' : candidate.issues.length ? 'This layout no longer fits the current settings. Choose another layout.' : currentId === 'original' ? candidate.operations.length ? 'Keep the current composition and update only the selected text style.' : scope === 'deck' ? 'Keep this slide unchanged when applying to all slides.' : 'Keep the current layout and text styles.' : info.visuals ? `${currentId === 'split' ? 'Separate text and evidence' : currentId === 'grid' ? 'Arrange content in groups' : currentId === 'focus' ? 'Focus on key content' : 'Lead with an insight and supporting evidence'} · Image coverage ${Math.round((candidate.imageShare ?? 0) * 100)}%` : 'Organize information in reading order and keep all text.');
  function suggestionName(c:LayoutSuggestion){return c.id==='original'?(c.operations.length?'Current composition':'Current layout'):AUTO_LAYOUTS.find(l=>l.id===c.id)!.name;}
  async function patchOptions(patch: Partial<LayoutOptions>) {
    if (localOptions) pageOptions = {...pageOptions, [slideId]: {...currentOptions, ...patch}};
    else options = {...options, ...patch};
    before = false;
    if (patch.style) {
      fontsReady = false;
      await Promise.all([loadLibraryFont('Manrope', base.fonts), loadLibraryFont('Bodoni Moda', base.fonts)]);
      await Promise.all([document.fonts.load('600 60px "Manrope"'), document.fonts.load('400 64px "Bodoni Moda"')]);
      measure.clear(); fontsReady = true;
    }
  }
  function setLocal(value: boolean) { const next = {...pageOptions}; if (value) next[slideId] = {...options}; else delete next[slideId]; pageOptions = next; before = false; }
  function resetPage() { const next = {...pageOptions}, selections = {...chosen}, keep = {...retained}; delete next[slideId]; delete selections[slideId]; delete keep[slideId]; pageOptions = next; chosen = selections; retained = keep; before = false; }
  function select(id: LayoutChoiceId) { chosen = {...chosen, [slide.id]: id}; before = false; error = ''; }
  function changeScope(value: 'slide' | 'deck') { scope = value; if (value === 'slide') slideId = initialSlideId; before = false; }
  function go(step: number) { slideId = base.slides[Math.max(0, Math.min(base.slides.length - 1, index + step))].id; before = false; inspectedImage = null; }
  function refresh() { base = editor.snapshot(); slideId = base.slides.some(s => s.id === slideId) ? slideId : base.slides[0].id; error = ''; reloadMedia(); }
  function apply() {
    if (stale || issues.length || !fontsReady) return;
    try {
      const proposal = layoutProposal(base, batch);
      if (!proposal) return;
      const revision = editor.deck!.revision;
      editor.commit(proposal.operations, '', 'manual', proposal.baseRevision);
      if (editor.deck!.revision === revision) { error = editor.error; return; }
      editor.notify(`Updated layout on ${countLabel(changedPages, "slide")} · ⌘Z to undo`);
      onclose();
    } catch(e) { error = e instanceof Error&&/^(Layout suggestions|Decorative elements|Resolve the layout)/.test(e.message)?e.message:'Could not apply this layout. Choose another layout or refresh the preview.'; }
  }
  onMount(() => {
    let disposed = false;
    const loaders = new Set<HTMLImageElement>();
    function remember(image: HTMLImageElement, source: string) {
      if (disposed) return;
      if (image.naturalWidth && image.naturalHeight) {
        const path = new URL(source, location.href);
        for (const key of [source, path.href, path.pathname]) {
          imageAspects.set(key, image.naturalWidth / image.naturalHeight);
          imageSizes.set(key, image.naturalWidth); imageStates.set(key, 'ready');
        }
      } else imageStates.set(source, 'failed');
      mediaRevision++;
    }
    async function loadImages() {
      if (disposed) return;
      for (const image of Array.from(document.images)) if (image.complete && image.naturalWidth) remember(image, image.currentSrc || image.src);
      const sources = [...new Set(base.slides.flatMap(s => s.elements.filter(e => e.type === 'image' && !e.hidden && e.opacity > 0 && !e.sourceRegion && e.src).map(e => e.src!)))].filter(src => imageStates.get(src) !== 'ready');
      // Resolve real media dimensions with bounded concurrency; never rank a loading image.
      let cursor = 0;
      await Promise.all(Array.from({length: Math.min(6, sources.length)}, async () => {
        while (!disposed && cursor < sources.length) {
          const source = sources[cursor++], image = new Image(); loaders.add(image); imageStates.set(source, 'loading');
          await new Promise<void>(resolve => {
            const timer = setTimeout(resolve, 4000);
            const finish = () => { clearTimeout(timer); remember(image, source); loaders.delete(image); resolve(); };
            image.onload = finish; image.onerror = finish; image.src = source;
          });
        }
      }));
    }
    reloadMedia = () => { void loadImages(); };
    void (async () => { await loadLibraryTypography(base.slides, base.fonts); await document.fonts.ready; if (disposed) return; measure.clear(); fontsReady = true; await loadImages(); })().catch((e: Error) => { if (!disposed) error = e.message; });
    const observer = new ResizeObserver(([entry]) => previewWidth = Math.max(60, Math.min(entry.contentRect.width, entry.contentRect.height * base.width / base.height)));
    observer.observe(previewHost);
    return () => { disposed = true; reloadMedia = () => {}; for (const image of loaders) { image.onload = null; image.onerror = null; } observer.disconnect(); measure.destroy(); };
  });
</script>

<Dialog title="Layout suggestions" subtitle="Runs locally · Preview before applying" class="auto-layout-dialog" workspace bind:element={dialog} descriptionId="layout-description" closeLabel="Close layout suggestions" {onclose}>
  <div class="auto-layout-workspace">
    <section class="layout-preview" class:expanded aria-label="Layout preview">
      <div class="layout-preview-head"><span>{slideLabel(index)}</span>{#if inspectedImage}<button class="text-btn return-layout" onclick={returnToLayout}><ArrowLeft size={14} />Back to layout</button>{:else}<div class="seg" use:uiIndicator aria-label="Compare layouts"><button aria-pressed={before} onclick={() => before = true}>Before</button><button aria-pressed={!before} onclick={() => before = false}>After</button></div>{/if}</div>
      <!-- The scroll region is focusable for keyboard panning in expanded mode. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="layout-preview-canvas" bind:this={previewHost} role="region" aria-label="Scrollable preview" tabindex={expanded ? 0 : undefined}><!-- Pointer shortcut; the image picker is the keyboard equivalent. -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div class="layout-preview-page" use:uiChange={`${slide.id}:${currentId}:${before}:${keepPage}`} role="region" aria-label="Slide preview" onpointerup={inspectPointer} style:max-width={expanded ? 'none' : `${previewWidth}px`} style:width={inspectedImage ? 'max-content' : expanded ? `${previewWidth * previewZoom}px` : '100%'} data-layout-preview={before ? 'before' : 'after'}>{#if inspectedImage}<img class="source-image-preview" src={inspectedImage.src} alt={inspectedImage.name} draggable="false" style:width="{(imageSizes.get(inspectedImage.src ?? '') ?? 1440) * previewZoom}px" />{:else}<SlideCanvas deck={base} slide={before ? slide : candidate.slide} />{/if}</div></div>
      {#if expanded}<div class="preview-zoom-tools" aria-label="Preview zoom"><button class="icon-btn" aria-label="Zoom out layout preview" disabled={previewZoom <= 1} onclick={() => previewZoom = Math.max(1, previewZoom - .5)}><Minus size={15} /></button><span>{Math.round(previewZoom * 100)}%</span><button class="icon-btn" aria-label="Zoom in layout preview" disabled={previewZoom >= 4} onclick={() => previewZoom = Math.min(4, previewZoom + .5)}><Plus size={15} /></button></div>{/if}
      <div class="layout-preview-foot" class:batch-preview={scope === 'deck'}>
        <span>{inspectedImage ? 'Original size · Scroll to inspect details' : before ? 'Current editable version' : suggestionName(candidate)} <small>{base.width} × {base.height}</small></span>
        {#if !inspectedImage && candidate.slide.elements.some(e => e.type === 'image' && !e.hidden)}<select class="preview-image-picker" value="" aria-label="View original image" onchange={(e) => { const image = candidate.slide.elements.find(image => image.id === e.currentTarget.value); if (image) void inspectImage(image); e.currentTarget.value = ''; }}><option value="" disabled>Image</option>{#each candidate.slide.elements.filter(e => e.type === 'image' && !e.hidden) as image}<option value={image.id}>{image.name}</option>{/each}</select>{/if}
        <button class="text-btn preview-expand" onclick={expandPreview} title={expanded ? 'Collapse layout preview' : 'Expand layout preview'} aria-label={expanded ? 'Collapse layout preview' : 'Expand layout preview'}>{#if expanded}<Minimize2 size={14} />Collapse{:else}<Maximize2 size={14} />Expand{/if}</button>
        {#if scope === 'deck'}<div class="layout-page-nav"><button class="icon-btn" onclick={() => go(-1)} disabled={index === 0} aria-label="Preview previous slide"><ArrowLeft size={15} /></button><span>{index + 1} / {base.slides.length}</span><button class="icon-btn" onclick={() => go(1)} disabled={index === base.slides.length - 1} aria-label="Preview next slide"><ArrowRight size={15} /></button></div>{:else}<span class="layout-local-label">Local layout</span>{/if}
      </div>
      {#if !expanded}<div class="layout-insight" role="status"><span>{keepPage ? 'Keep unchanged' : candidate.id === 'original' ? 'Current layout' : candidate.recommended ? 'Recommended composition' : 'Your selection'}</span><p>{feedback}</p></div>{/if}
    </section>
    <section class="layout-controls" aria-label="Layout options">
      <div class="layout-controls-scroll">
        <div class="layout-section layout-scope"><h3>Apply to</h3><div class="seg" use:uiIndicator><button aria-pressed={scope === 'slide'} onclick={() => changeScope('slide')}>This slide</button><button aria-pressed={scope === 'deck'} onclick={() => changeScope('deck')}>All slides <small>{base.slides.length}</small></button></div><p id="layout-description">{scope === 'deck' ? 'Review each slide before applying.' : ''}</p></div>
        {#if scope === 'deck'}<div class="layout-page-control"><div><label><input type="checkbox" checked={!!localOptions} disabled={keepPage} onchange={(e) => setLocal(e.currentTarget.checked)} />Custom settings</label><button class="text-btn keep-page" aria-label={keepPage ? "Skipped slide: click to include in layout changes" : "Skip slide in document-wide layout changes"} title={keepPage ? "Include this slide in layout changes" : "Keep this slide unchanged when applying to all slides"} aria-pressed={keepPage} onclick={() => { retained = {...retained, [slideId]: !keepPage}; before = false; }}>{keepPage ? 'Skipped' : 'Skip slide'}</button></div><small>{keepPage ? 'This slide stays unchanged.' : localOptions ? 'Settings for this slide only' : 'Settings for all slides'}</small></div>{/if}
        <fieldset class="layout-style-section" disabled={keepPage}><legend>Text style</legend><div class="layout-style-options">{#each LAYOUT_STYLES as direction}<button type="button" class:active={(currentOptions.style ?? 'original') === direction.id} aria-pressed={(currentOptions.style ?? 'original') === direction.id} onclick={() => patchOptions({style: direction.id})}><span class="style-sample" class:editorial={direction.id === 'editorial'} class:original={direction.id === 'original'}>Aa</span><strong>{direction.name}</strong><small>{direction.detail}</small></button>{/each}</div></fieldset>
        <div class="layout-section">
          <div class="layout-section-title"><h3>Choose layout</h3><span>{countLabel(candidates.length - 1, "suggestion")}</span></div>
          {#if !info.units}<EmptyState density="inline" icon={LayoutTemplate} title={slide.elements.some(e => !e.hidden) ? 'No layout changes available' : 'Add content first'} description={slide.elements.some(e => !e.hidden) ? 'Add editable text or images for layout suggestions.' : 'Add text or an image first.'}><Button variant="secondary" onclick={onclose}>Back to canvas<ArrowRight size={14} /></Button></EmptyState>
          {:else}<div class="layout-suggestions">
            {#each candidates as suggestion}<button class="layout-suggestion" data-layout-choice={suggestion.id} disabled={keepPage} class:selected={currentId === suggestion.id && !keepPage} aria-pressed={currentId === suggestion.id && !keepPage} aria-label="{suggestionName(suggestion)}{suggestion.recommended ? ' · Recommended' : ''}" onclick={() => select(suggestion.id)}><div class="layout-suggestion-image"><SlideCanvas deck={base} slide={suggestion.slide} /><span class="layout-suggestion-check"><Check size={12} /></span></div><div class="layout-suggestion-name"><strong>{suggestionName(suggestion)}</strong>{#if suggestion.recommended && suggestion.id !== 'original'}<span>Recommended</span>{/if}</div><small>{suggestion.id === 'original' ? suggestion.operations.length ? 'Update text style only' : 'Keep layout and text styles' : AUTO_LAYOUTS.find(l => l.id === suggestion.id)!.description}</small></button>{/each}
          </div><p class="layout-curation-note">{review.unresolvedImages ? "Images are not ready. Keeping the current composition." : candidates.length === 1 ? "No layout changes suggested." : "Only distinct layouts that preserve content and image visibility are shown."}{review.sourceIssues ? " Some content on the original slide still needs manual review." : ""}</p>{/if}
        </div>
        <details use:uiDisclosure class="layout-tuning-shell"><summary>Adjust layout <small>{localOptions ? "This slide" : scope === "deck" ? "All slides" : "This slide"}</small></summary><fieldset class="layout-section layout-tuning" aria-label="Adjust composition" disabled={keepPage}><span class="option-label">Text and image balance</span><div use:uiIndicator class="seg layout-emphasis">{#each [{id: 'text', name: 'Text'}, {id: 'balanced', name: 'Balanced'}, {id: 'image', name: 'Image'}] as emphasis}<button aria-pressed={(currentOptions.emphasis ?? 'balanced') === emphasis.id} onclick={() => patchOptions({emphasis: emphasis.id as LayoutOptions['emphasis']})}>{emphasis.name}</button>{/each}</div><span class="option-label">Content spacing</span><div use:uiIndicator class="seg layout-spacing">{#each [{id: 'compact', name: 'Compact'}, {id: 'balanced', name: 'Balanced'}, {id: 'airy', name: 'Relaxed'}] as spacing}<button aria-pressed={currentOptions.spacing === spacing.id} onclick={() => patchOptions({spacing: spacing.id as LayoutOptions['spacing']})}>{spacing.name}</button>{/each}</div><label class="layout-toggle"><span>Fit text<small>Reduce text size when needed, within readable limits.</small></span><input type="checkbox" checked={currentOptions.fitText} onchange={(e) => patchOptions({fitText: e.currentTarget.checked})} aria-label="Fit text within readable size limits" /></label><label class="layout-toggle"><span>Consistent type<small>Use consistent heading and body sizes.</small></span><input type="checkbox" checked={currentOptions.consistentType !== false} onchange={(e) => patchOptions({consistentType: e.currentTarget.checked})} aria-label="Consistent type for headings and body text" /></label><button class="text-btn reset-page" title="Reset this slide to its recommended layout and text style" onclick={resetPage}>Reset slide</button></fieldset></details>
        <div class="layout-preservation"><LockKeyhole size={14} /><p>Content and colors stay unchanged. {info.preserved ? `On this slide, ${countLabel(info.preserved, 'locked or decorative object')} ${info.preserved === 1 ? 'stays' : 'stay'} in place.` : '⌘Z to undo.'}</p></div>
        {#if issues.length}<div class="layout-issues" role="status"><AlertCircle size={16} /><div><strong>Review these issues</strong>{#each issues.slice(0, 3) as issue}<button onclick={() => { if (scope === 'deck') slideId = issue.slideId; before = false; }}>{scope === 'deck' ? `Slide ${base.slides.findIndex(s => s.id === issue.slideId) + 1} · ` : ''}{issue.message}</button>{/each}{#if issues.length > 3}<small>More: {issues.length - 3} issues. Browse the slides to review them.</small>{/if}</div></div>{/if}
        {#if stale}<div class="layout-stale" role="status"><p>The document has changed. Refresh the layout preview.</p><button class="text-btn ghost" onclick={refresh}><RefreshCw size={14} />Refresh preview</button></div>{/if}
        {#if error}<Notice tone="error" title="Layout could not finish" message={error}/>{/if}
        {#if operationCount > 1000}<p class="error" role="status">This change affects more than 1,000 objects. Apply it one slide at a time.</p>{/if}
      </div>
    </section>
  </div>
  {#snippet footer()}<DialogFooter class="layout-actions">
    {#snippet info()}<p>{!fontsReady ? 'Preparing fonts…' : !operationCount ? 'No layout changes' : `${countLabel(changedPages, "slide")} to update`}<span class="layout-action-count">{operationCount ? ` · ${countLabel(operationCount, "object")}` : ""}</span><small><span class="desktop-preview-hint">Preview only · Not applied</span><span class="mobile-preview-hint">Preview only · Not applied</span></small></p>{/snippet}
    {#snippet actions()}<Button variant="secondary" onclick={onclose}>Cancel</Button><Button variant="primary" onclick={apply} disabled={stale || !fontsReady || issues.length > 0 || !operationCount || operationCount > 1000}><Check size={15} />{scope === 'deck' && changedPages ? `Apply to ${countLabel(changedPages, "slide")}` : 'Apply layout'}</Button>{/snippet}
  </DialogFooter>{/snippet}
</Dialog>

<style>
  
  
  
  
  .auto-layout-workspace{position:relative;flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 356px}.layout-preview{display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--surface-sunken)}
  .layout-preview-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:24px 24px;flex:none}.layout-preview-head>span{display:flex;align-items:center;gap:12px;font-size:var(--ui-meta);color:var(--text-tertiary);min-width:0}.layout-preview-head .seg{flex:none}
  .layout-preview-canvas{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:0 30px 16px}.layout-preview-page{width:100%;max-height:100%;box-shadow:var(--slide-shadow);transition:opacity 150ms var(--ease-out)}
  .layout-preview-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:16px 24px;font-size:var(--ui-label);color:var(--text-secondary);flex:none}.layout-preview-foot small{margin-left:8px;font-size:var(--ui-meta)}.layout-local-label{font-size:var(--ui-meta);color:var(--text-tertiary)}.layout-page-nav{display:flex;align-items:center;gap:8px;font-size:var(--ui-meta);font-variant-numeric:tabular-nums}
  .layout-controls{min-height:0;border-left:1px solid var(--border-default);display:flex;flex-direction:column}.layout-controls-scroll{overflow:auto;min-height:0;overscroll-behavior:contain;padding-bottom:16px;scrollbar-gutter:stable;}
  .layout-section{padding:20px;border-bottom:1px solid var(--border-subtle);display:flex;flex-direction:column;gap:12px}.layout-section h3{font-size:var(--ui-label);font-weight:var(--ui-weight-semibold)}.layout-scope>.seg{width:100%}.layout-scope>.seg button{flex:1;height:30px}.layout-scope p{font-size:var(--ui-meta);line-height:var(--ui-line-reading);color:var(--text-secondary)}
  .layout-section-title{display:flex;flex-direction:column;gap:4px}.layout-section-title>span{font-size:var(--ui-meta);color:var(--text-tertiary)}.layout-suggestions{display:grid;grid-template-columns:1fr 1fr;gap:16px 12px}
  .layout-suggestion{display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;text-align:left;gap:8px;min-width:0;border-radius:var(--r-sm)}.layout-suggestion-image{position:relative;border:1px solid var(--border-default);border-radius:var(--r-xs);overflow:hidden;transition:border-color 140ms,box-shadow 140ms}.layout-suggestion:hover .layout-suggestion-image{border-color:var(--border-strong);box-shadow:0 2px 8px var(--border-subtle)}.layout-suggestion.selected .layout-suggestion-image{outline:2px solid var(--accent);outline-offset:2px}.layout-suggestion-check{position:absolute;bottom:5px;right:5px;display:none;background:var(--accent);color:var(--text-on-accent);width:18px;height:18px;border-radius:50%;align-items:center;justify-content:center}.selected .layout-suggestion-check{display:flex}.layout-suggestion-name{display:flex;align-items:center;justify-content:space-between;gap:4px;margin-top:2px}.layout-suggestion strong{font-size:var(--ui-meta);font-weight:var(--ui-weight-medium)}.layout-suggestion-name>span{font-size:var(--ui-meta);color:var(--text-link)}.layout-suggestion>small{font-size:var(--ui-meta);line-height:var(--ui-line-body);color:var(--text-secondary)}
  .layout-spacing button{flex:1;height:30px}.layout-toggle{display:flex;align-items:center;justify-content:space-between;gap:16px;font-size:var(--ui-label);cursor:pointer;padding-top:4px}.layout-toggle small{display:block;font-size:var(--ui-meta);line-height:var(--ui-line-body);margin-top:4px;color:var(--text-secondary)}.layout-toggle input{width:16px;height:16px;accent-color:var(--accent);flex:none;cursor:pointer}.layout-preservation{display:flex;gap:8px;padding:16px 20px 0;color:var(--text-secondary)}.layout-preservation :global(svg){flex:none;margin-top:2px}.layout-preservation p{font-size:var(--ui-meta);line-height:var(--ui-line-reading)}
  .layout-issues{display:flex;gap:8px;padding:16px 20px 0;color:var(--warning-text)}.layout-issues>:global(svg){flex:none;margin-top:2px}.layout-issues strong{display:block;font-size:var(--ui-meta);margin-bottom:6px}.layout-issues button{display:block;text-align:left;font-size:var(--ui-meta);line-height:var(--ui-line-reading);color:var(--text-secondary);padding:4px 0}.layout-issues button:hover{text-decoration:underline}.layout-stale{margin:16px 20px 0;padding:12px;color:var(--warning-text);background:var(--warning-soft);border:1px solid var(--warning-border);border-radius:var(--r-sm);font-size:var(--ui-label);line-height:var(--ui-line-reading)}.layout-stale button{margin-top:8px}.error{padding:0 20px}
  
  .source-image-preview{display:block;max-width:none;height:auto}.preview-image-picker{width:80px;height:30px;padding:0 4px;font-size:var(--ui-meta);flex:none}.layout-preview.expanded{position:absolute;inset:0;z-index:4}.expanded .layout-preview-canvas{display:block;overflow:auto;touch-action:pan-x pan-y;padding:16px 24px}.expanded .layout-preview-page{margin:0 auto;max-height:none}.preview-zoom-tools{display:flex;align-items:center;justify-content:center;gap:8px;flex:none;padding:4px;font-size:var(--ui-meta)}.preview-expand{font-size:var(--ui-meta);white-space:nowrap;margin-left:auto}.layout-local-label{display:none}
  .layout-insight{display:flex;align-items:center;gap:12px;padding:0 24px 24px;flex:none;color:var(--text-secondary);font-size:var(--ui-meta)}.layout-insight>span{white-space:nowrap;font-size:var(--ui-meta);color:var(--text-link)}.layout-insight p{line-height:var(--ui-line-body)}
  .layout-scope{padding:16px 20px}.layout-scope>h3,.layout-scope>p{display:none}
  .mobile-preview-hint{display:none}.layout-curation-note{font-size:var(--ui-meta);line-height:var(--ui-line-reading);color:var(--text-secondary);margin-top:4px}
  .layout-page-control{padding:0 20px 16px;border-bottom:1px solid var(--border-subtle)}.layout-page-control>div{display:flex;align-items:center;justify-content:space-between;gap:8px}.layout-page-control label{display:flex;gap:8px;align-items:center;font-size:var(--ui-meta);min-height:36px}.layout-page-control input{width:15px;height:15px;accent-color:var(--accent)}.layout-page-control>small{display:block;font-size:var(--ui-meta);color:var(--text-tertiary);margin-top:6px}.keep-page{font-size:var(--ui-meta);white-space:nowrap;border:1px solid var(--border-default);border-radius:var(--r-control);padding:0 12px}.keep-page[aria-pressed=true]{border-color:var(--accent);color:var(--text-link);background:var(--fill-subtle)}
  .layout-style-section{margin:0;padding:20px;border:0;border-bottom:1px solid var(--border-subtle);min-width:0}.layout-style-section legend{float:left;width:100%;font-size:var(--ui-label);font-weight:var(--ui-weight-semibold);padding:0;margin:0 0 16px}.layout-style-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;clear:both}.layout-style-options>button{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:12px 8px;border:1px solid var(--border-default);border-radius:var(--r-sm);text-align:left;transition:background 140ms,border-color 140ms}.layout-style-options>button:hover{background:var(--state-hover)}.layout-style-options>button.active{border-color:var(--accent);background:var(--fill-subtle)}.style-sample{font-family:Manrope,sans-serif;font-size:30px;font-weight:600;letter-spacing:-1px;line-height:1.2;color:var(--text-primary)}.style-sample.editorial{font-family:'Bodoni Moda',serif;font-weight:400}.style-sample.original{font-family:Inter,sans-serif;font-weight:400;color:var(--text-secondary)}.layout-style-options strong{font-size:var(--ui-meta);font-weight:var(--ui-weight-medium);white-space:nowrap}.layout-style-options small{font-size:var(--ui-meta);line-height:var(--ui-line-body);color:var(--text-tertiary)}
  .layout-tuning-shell{border-bottom:1px solid var(--border-subtle)}.layout-tuning-shell summary{padding:16px 20px;font-size:var(--ui-label);font-weight:var(--ui-weight-medium);cursor:pointer}.layout-tuning-shell summary small{float:right;color:var(--text-tertiary);font-weight:var(--ui-weight-normal);font-size:var(--ui-meta)}.layout-tuning{margin:0;border:0;padding-top:0;min-width:0}.option-label{font-size:var(--ui-meta);color:var(--text-secondary);margin-top:4px}.layout-emphasis button{flex:1;height:30px}.reset-page{align-self:flex-start;font-size:var(--ui-meta);color:var(--text-link);margin-top:6px}fieldset:disabled .layout-style-options,fieldset:disabled .seg{opacity:.5}
  @media(max-width:760px){.layout-preview-foot small{display:none}.layout-preview.expanded{position:absolute;inset:0;border:0;z-index:5}.expanded .layout-preview-canvas{height:auto;flex:1;padding:12px}.preview-expand{font-size:var(--ui-meta);padding:0 6px}.preview-zoom-tools .icon-btn{min-width:40px;min-height:40px}}
  @keyframes layout-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  @media(max-width:760px){.auto-layout-workspace{display:flex;flex-direction:column;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;}.layout-preview{flex:none;position:relative;border-bottom:1px solid var(--border-default)}.layout-preview-head{padding:12px 16px}.layout-preview-head>span{gap:8px}.layout-preview-head .seg button{font-size:var(--ui-meta);padding:0 8px;min-height:32px}.layout-preview-canvas{padding:2px 20px 8px}.layout-preview-page{max-width:420px}.layout-preview-foot{padding:8px 16px;font-size:var(--ui-meta)}.layout-local-label{display:none}.layout-preview-foot small{font-size:var(--ui-meta)}.layout-controls{border-left:0;flex:none}.layout-controls-scroll{overflow:visible}.layout-section{padding:16px}.layout-section-title{flex-direction:row;justify-content:space-between;align-items:center}.layout-suggestions{gap:16px 16px}.layout-suggestion strong{font-size:var(--ui-label)}.layout-suggestion>small{font-size:var(--ui-meta)}.layout-scope>.seg button,.layout-spacing button{min-height:36px}.layout-preservation,.layout-issues{padding-left:16px;padding-right:16px}.layout-toggle{min-height:44px}}
  @media(max-width:760px){.layout-preview-canvas{height:clamp(105px,26dvh,220px);flex:none}.layout-preview-page{width:100%}}
  @media(max-width:760px){.layout-preview-foot.batch-preview{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 8px}.batch-preview>span:first-child{grid-column:1;grid-row:1}.batch-preview .layout-page-nav{grid-column:2;grid-row:1;justify-self:end}.batch-preview .preview-image-picker{grid-column:1;grid-row:2}.batch-preview .preview-expand{grid-column:2;grid-row:2;justify-self:end;margin-left:0}.batch-preview .layout-page-nav .icon-btn{width:30px}.batch-preview .preview-image-picker{height:34px}}
  @media(max-width:760px){.layout-scope{padding:12px 16px;gap:8px}.layout-scope>h3,.layout-scope>p{display:none}}
  @media(max-width:760px){.layout-preview:not(.expanded){position:relative}.layout-preview-canvas{height:clamp(105px,20dvh,170px)}.layout-insight{padding:0 16px 12px;gap:8px;font-size:var(--ui-meta)}.layout-insight>span{font-size:var(--ui-meta)}.layout-page-control{padding:0 16px 12px}.layout-page-control label,.keep-page{min-height:40px;font-size:var(--ui-meta)}.layout-style-section{padding:16px}.layout-style-options{gap:8px}.layout-style-options>button{min-height:100px;padding:12px 8px}.layout-style-options strong{font-size:var(--ui-meta)}.layout-style-options small{font-size:var(--ui-meta)}.layout-tuning-shell summary{padding:16px 16px;min-height:44px}.layout-emphasis button{min-height:40px}}
  @media(max-width:760px){
    .layout-preview-foot:not(.batch-preview){display:grid;grid-template-columns:minmax(0,1fr) auto}
    .layout-preview-foot:not(.batch-preview) .preview-expand{grid-column:2;grid-row:1;margin-left:0}
    .layout-preview-foot:not(.batch-preview) .preview-image-picker{grid-column:1;grid-row:2}
    .layout-preview-head .seg button,.layout-scope>.seg button,.layout-spacing button,.layout-emphasis button,.keep-page,.layout-page-control label{min-height:44px}
    .preview-image-picker,.batch-preview .preview-image-picker,.preview-expand{min-height:44px}
    .layout-page-nav .icon-btn,.batch-preview .layout-page-nav .icon-btn,.preview-zoom-tools .icon-btn{min-height:44px;min-width:44px}
  }
  @media(prefers-reduced-motion:reduce){.layout-suggestion-image,.layout-preview-page,.layout-style-options>button{transition:none}}
  @media(max-width:760px){.layout-action-count,.desktop-preview-hint{display:none}.mobile-preview-hint{display:inline}}
</style>
