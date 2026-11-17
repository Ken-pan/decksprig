<script lang="ts">
  import { ChevronDown, FileText, Presentation, Globe, EyeOff } from '@lucide/svelte';
  import { Button, SegmentedControl } from './ui';
  let {exportView, hiddenCount = 0, slideCount, referenceComplete, hasGoogleSource, hasKeynote, hasNativeSource, busy, exportKind, onView, onExport, onCancel}: {
    exportView: 'editable' | 'reference'; hiddenCount?: number; slideCount?: number; referenceComplete: boolean; hasGoogleSource: boolean; hasKeynote: boolean; hasNativeSource: boolean;
    busy: string; exportKind: string; onView: (value: 'editable' | 'reference') => void; onExport: (kind: string) => void; onCancel: () => void;
  } = $props();
  type Format = {id: string; title: string; detail: string; suffix: string; logo?: string};
  const reference = $derived(exportView === 'reference');
  const visibleCount = $derived(slideCount === undefined ? undefined : Math.max(0, slideCount - hiddenCount));
  const visibilityId = $props.id();
  const formats: Format[] = $derived([
    {id: 'json', title: 'Deck file', detail: 'Full document', suffix: '.deck.json'},
    ...(!reference?[{id:'figma',title:'Figma Slides',detail:'Native plugin handoff',suffix:'.figma.deck.json'}]:[]),
    {id: 'pptx', title: 'PowerPoint', detail: reference ? 'Source images' : 'Editable objects', suffix: '.pptx'},
    ...(!reference?[{id:'potx',title:'PowerPoint template',detail:'Reusable presentation',suffix:'.potx'}]:[]),
    ...(hasGoogleSource && !reference ? [{id: 'google', title: 'Google Slides', detail: 'Text & slide visibility', suffix: 'Copy'}] : []),
    ...(hasKeynote ? [{id: 'keynote', title: 'Keynote', detail: reference ? 'Source images' : hasNativeSource ? 'Text edits' : 'Presentation', suffix: '.key'}] : []),
    {id: 'pdf', title: 'PDF', detail: reference ? 'Source images' : 'Print dialog', suffix: '.pdf'},
    {id: 'html', title: 'Web page', detail: reference ? 'Source images' : 'Motion & prototypes', suffix: '.html'},
  ]);
  const moreFormats: Format[] = [
    {id: 'json-legacy', title: 'Legacy Deck file', detail: 'For older versions', suffix: '.deck.json'},
    {id: 'broadser', title: 'Broadser board', detail: 'Note cards', suffix: '.json', logo: 'broadser.svg'},
    {id: 'markdown', title: 'Text and notes', detail: 'Markdown', suffix: '.md'},
  ];
</script>

<div class="export-options ui-control-surface ui-property-surface">
  {#if exportKind}<Button variant="secondary" onclick={onCancel}>Cancel export</Button>{/if}
  <div class="export-version">
    <SegmentedControl label="Export version" value={exportView} disabled={Boolean(busy)} options={[
      {value: 'editable', label: 'Editable version'},
      {value: 'reference', label: 'Source reference', disabled: !referenceComplete},
    ]} onchange={value => onView(value as 'editable' | 'reference')} />
    {#if reference}<p class="export-version-note">Slides export as images. Deck files keep all content.</p>{/if}
    {#if !referenceComplete}<p class="export-availability">Attach a source PDF to use Source reference.</p>{/if}
  </div>

  <!-- Visibility rules stay visible beside delivery formats, including on touch. -->
  {#if hiddenCount}
    <div class="export-visibility" id={visibilityId} role="group" aria-label="Hidden slide export scope">
      <p><EyeOff size={16} aria-hidden="true"/><span>{hiddenCount} hidden {hiddenCount===1?'slide':'slides'}</span></p>
      <dl>
        <div><dt>PDF &amp; web</dt><dd>{visibleCount === undefined ? 'Visible slides only' : `${visibleCount} visible ${visibleCount===1?'slide':'slides'}`}</dd></div>
        <div><dt>Deck &amp; PowerPoint</dt><dd>{slideCount === undefined ? 'All slides' : `All ${slideCount} ${slideCount===1?'slide':'slides'}`}</dd></div>
      </dl>
      {#if visibleCount===0}<p class="export-visibility-recovery">Unhide a slide to export PDF or a web page.</p>{/if}
    </div>
  {/if}
  <div class="export-formats" role="group" aria-label="Export formats">
    {#each formats as format (format.id)}{@render formatButton(format)}{/each}
  </div>

  <details class="export-more ui-control-disclosure">
    <summary><span>More options</span><ChevronDown size={14} aria-hidden="true" /></summary>
    {#if reference}<p class="export-availability">Text and board exports need the editable version.</p>{/if}
    <div class="export-formats" role="group" aria-label="More export formats">
      {#each moreFormats as format (format.id)}{@render formatButton(format)}{/each}
    </div>
    <div class="export-guidance">
      {#if !reference}<p>Fonts and effects may look different after export. Embedded prototypes need internet access.</p>{/if}
    </div>
  </details>
</div>

{#snippet formatButton(format: Format)}
  <Button class="export-format" busy={exportKind === format.id} aria-describedby={hiddenCount && ['pdf','html','json','pptx','potx'].includes(format.id) ? visibilityId : undefined} disabled={Boolean(busy) && exportKind !== format.id || (reference && ['broadser', 'markdown'].includes(format.id)) || visibleCount===0 && ['pdf','html'].includes(format.id)} onclick={() => onExport(format.id)}>
    <span class="export-logo" aria-hidden="true">
      {#if format.logo}<img src="/export-icons/{format.logo}" alt="" width="24" height="24" />
      {:else if format.id === 'json' || format.id === 'json-legacy'}<span class="brand-mark"></span>
      {:else if format.id === 'html'}<Globe />
      {:else if ['pptx','potx','google','keynote'].includes(format.id)}<Presentation />
      {:else}<FileText />{/if}
    </span>
    <span class="export-copy"><strong>{format.title}</strong><small><span class="export-suffix">{format.suffix}</span><span>{format.detail}</span></small></span>
  </Button>
{/snippet}

<style>
  .export-options { display: flex; flex-direction: column; gap: 12px; }
  .export-version :global(.ui-segmented) { width: 100%; }
  .export-version :global(.ui-segmented > button) { flex: 1; min-width: 0; white-space: normal; }
  .export-version-note, .export-availability, .export-guidance { color: var(--text-secondary); font-size: var(--ui-meta); line-height: var(--ui-line-reading); }
  .export-version-note { margin: 8px 0 0; }
  .export-availability { margin: 4px 0 0; }
  .export-visibility { display: flex; flex-direction: column; gap: 8px; padding-block: 12px; border-block: 1px solid var(--border-subtle); font-size: var(--ui-meta); line-height: var(--ui-line-body); }
  .export-visibility > p { display: flex; align-items: center; gap: 8px; margin: 0; font-weight: var(--ui-weight-medium); }
  .export-visibility :global(svg) { flex: none; color: var(--text-secondary); }
  .export-visibility dl { display: flex; flex-direction: column; gap: 4px; margin: 0; }
  .export-visibility dl > div { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; }
  .export-visibility dt { color: var(--text-secondary); }
  .export-visibility dd { margin: 0; font-variant-numeric: tabular-nums; }
  .export-visibility > .export-visibility-recovery { font-weight: var(--ui-weight-normal); color: var(--text-secondary); }
  .export-formats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 8px; }
  .export-options :global(.export-format) { display: flex; align-items: center; gap: 12px; width: 100%; min-width: 0; min-height: 48px; height: auto; padding: 4px 8px; text-align: left; justify-content: flex-start; border-radius: var(--r-control); white-space: normal; }
  .export-options :global(.export-format:focus-visible) { outline-offset: -2px; }
  .export-options :global(.export-format[aria-busy='true'] > .export-logo) { display: none; }
  .export-options :global(.export-format[aria-busy='true'] > .spinner) { margin-inline: 5px; }
  .export-logo { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; flex: none; }
  .export-logo img { display: block; width: 24px; height: 24px; object-fit: contain; }
  .export-logo :global(svg) { width: 16px; height: 16px; color: var(--text-secondary); }
  .export-logo :global(.brand-mark) { width: 24px; height: 24px; }
  .export-copy { flex: 1; min-width: 0; }
  .export-copy strong { display: block; font-size: var(--ui-text); font-weight: var(--ui-weight-medium); line-height: var(--ui-line-body); }
  .export-copy small { display: flex; flex-wrap: wrap; column-gap: 8px; margin-top: 2px; color: var(--text-secondary); font-size: var(--ui-meta); line-height: var(--ui-line-body); }
  .export-suffix { white-space: nowrap; }
  .export-more { border-top: 1px solid var(--border-subtle); }
  .export-more > .export-availability { margin: 0 12px 8px; }
  .export-guidance { display: flex; flex-direction: column; gap: 4px; margin: 8px 8px 0; }
  .export-guidance p { margin: 0; }
  @media (max-width: 480px) { .export-formats { grid-template-columns: minmax(0,1fr); } }
</style>
