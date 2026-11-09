<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowUpRight, BookOpen, LayoutTemplate, Plus, Upload, Sparkles } from '@lucide/svelte';
  import { Button } from './ui';
  import SlideCanvas from './SlideCanvas.svelte';
  import type { Deck } from '../core/model';
  import type { CollectionId } from '../core/template-collections';

  let { ontemplates, onblank, onimport, onlibrary, onai, ondemo, demoLoading = false, aiReady = false }: {
    ontemplates: (collection?: CollectionId) => void;
    onblank: () => Promise<void>;
    onimport: () => void;
    onlibrary: () => void;
    onai: () => void;
    ondemo: () => Promise<void>;
    demoLoading?: boolean;
    aiReady?: boolean;
  } = $props();

  const starters = [
    { id: 'portfolio', name: 'Editorial', category: 'Portfolio' },
    { id: 'review', name: 'Studio', category: 'Project review' },
    { id: 'minimal', name: 'Minimalist', category: 'General presentation' },
  ] as const;
  let previews = $state.raw<Deck[]>([]);
  let creating = $state(false);
  onMount(() => {
    let disposed = false;
    // Render the actual template covers, with their own fonts and artwork.
    // Keep template generation outside the editor's startup dependency graph.
    void Promise.all([import('../core/template-covers.json'), import('../core/font-loading')]).then(async ([covers, fonts]) => {
      const decks = covers.default as Deck[];
      await fonts.loadLibraryTypography(decks.map(deck => deck.slides[0]));
      if (!disposed) previews = decks;
    }).catch(() => {}); // Starting a document remains available without previews.
    return () => { disposed = true; };
  });
  async function startBlank() {
    if (creating) return;
    creating = true;
    try { await onblank(); } finally { creating = false; }
  }
</script>

<section class="workspace-welcome" aria-labelledby="welcome-title">
  <div class="welcome-intro">
    <h1 id="welcome-title">Start a document</h1>
    <div class="welcome-actions">
      <Button variant={aiReady ? 'secondary' : 'primary'} size="lg" disabled={creating} onclick={() => ontemplates()}><LayoutTemplate size={16} />Choose a template</Button>
      <Button variant="secondary" size="lg" busy={creating} onclick={startBlank}><Plus size={16} />Start blank</Button>
      <Button variant={aiReady ? 'primary' : 'quiet'} size="lg" disabled={creating} onclick={onai}><Sparkles size={16} />Create with AI</Button>
    </div>
  </div>

  <div class="welcome-templates" aria-label="Featured templates">
    {#each starters as starter, index}
      <button class="welcome-template" disabled={creating} aria-label={`Preview ${starter.name} template`} onclick={() => ontemplates(starter.id)}>
        <div class="welcome-cover" aria-hidden="true">
          {#if previews[index]}<SlideCanvas deck={previews[index]} slide={previews[index].slides[0]} />
          {:else}<div class="welcome-cover-placeholder"><LayoutTemplate size={24} /></div>{/if}
        </div>
        <span class="welcome-template-meta"><span><strong>{starter.name}</strong><span class="welcome-category">{starter.category}</span></span><ArrowUpRight size={16} aria-hidden="true" /></span>
      </button>
    {/each}
  </div>

  <div class="welcome-existing">
    <Button variant="quiet" disabled={creating} busy={demoLoading} onclick={ondemo}><BookOpen size={16} />Try sample</Button>
    <Button variant="quiet" disabled={creating} onclick={onimport}><Upload size={16} />Import document</Button>
    <span class="welcome-action-divider" aria-hidden="true"></span>
    <Button variant="quiet" disabled={creating} onclick={onlibrary}><BookOpen size={16} />Open document library</Button>
  </div>
</section>

<style>
/* The starting workspace has no editing context. Pane preferences remain intact
   and the regular editor composition returns as soon as a document is opened. */
:global(.welcome-workspace .topbar .brand-type) { display: flex; }
:global(.welcome-workspace .topbar .brand-button) { width: auto; min-width: max-content; }
:global(.welcome-workspace .topbar-left) { max-width: none; }
:global(.welcome-workspace .topbar) { padding-inline: 24px; }
:global(.welcome-workspace .workspace.left-hidden.right-hidden) { grid-template-columns: 0px minmax(0, 1fr) 0px; grid-template-rows: minmax(0, 1fr); }
:global(.welcome-workspace .workspace .stage-column) { grid-column: 2; grid-row: 1; background: var(--surface-chrome); }
:global(.welcome-workspace .workspace :is(.slide-rail, .property-panel)) { display: none; }
:global(.editor-app.welcome-workspace .canvas-stage) { padding: 48px 40px; --canvas-header-height: 0px; }
:global(.welcome-workspace :is(.canvas-meta, .stage-footer)) { display: none; }
@media (max-width: 760px) {
  :global(.welcome-workspace .topbar) { padding-inline: 16px; }
  :global(.editor-app.welcome-workspace .canvas-stage) { display: block; padding: 24px; }
}
@media (max-height: 600px) and (min-width: 761px) {
  :global(.editor-app.welcome-workspace .canvas-stage) { padding-block: 24px; }
}


  .workspace-welcome { width: min(100%, 960px); padding: 16px 8px; margin-block: auto; }
  .welcome-intro { text-align: center; margin-bottom: 48px; }
  h1 { font-family: var(--font-brand); font-size: clamp(1.75rem, 2.4vw, 2.25rem); font-weight: 600; line-height: 1.2; letter-spacing: -.04em; margin: 0 0 12px; color: var(--text-primary); }
  
  .welcome-actions { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; margin-top: 24px; }
  .welcome-actions :global(.ui-button) { min-height: 44px; padding-inline: 20px; }
  .welcome-templates { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
  .welcome-template { display: flex; flex-direction: column; align-items: stretch; gap: 12px; min-width: 0; text-align: left; padding: 8px; margin: -8px; border-radius: var(--r-control); background: transparent; transition: background var(--dur-fast) var(--ui-ease-out); }
  .welcome-cover { aspect-ratio: 16 / 9; width: 100%; overflow: hidden; border: 1px solid var(--border-default); border-radius: var(--radius-sm); background: var(--surface-chrome); }
  .welcome-cover :global(.canvas-wrap) { width: 100%; }
  .welcome-cover-placeholder { height: 100%; display: grid; place-items: center; color: var(--text-secondary); }
  .welcome-template-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-inline: 4px; }
  .welcome-template-meta > span { display: flex; flex-direction: column; gap: 4px; }
  .welcome-template-meta strong { font-size: var(--ui-body); font-weight: 500; color: var(--text-primary); }
  .welcome-category { font-size: var(--ui-label); color: var(--text-secondary); line-height: var(--ui-line-reading); }
  .welcome-template-meta > :global(svg) { color: var(--text-secondary); flex: none; }
  .welcome-template:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .welcome-existing { display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap; border-top: 1px solid var(--border-subtle); margin-top: 32px; padding-top: 20px; }
  .welcome-existing :global(.ui-button) { min-height: 44px; }
  .welcome-action-divider { height: 16px; width: 1px; background: var(--border-default); }
  @media (hover: hover) and (pointer: fine) { .welcome-template:hover { background: var(--state-hover); } }
  @media (max-width: 760px) {
    .workspace-welcome { max-width: 480px; padding: 8px 0; }
    .welcome-intro { text-align: left; margin-bottom: 32px; }
    
    .welcome-actions { justify-content: flex-start; gap: 8px; margin-top: 20px; }
    .welcome-actions :global(.ui-button) { padding-inline: 12px; }
    .welcome-templates { grid-template-columns: 1fr; gap: 16px; }
    .welcome-template { display: grid; grid-template-columns: minmax(100px, 42%) minmax(0, 1fr); align-items: center; gap: 16px; }
    .welcome-template-meta { padding: 0; }
    .welcome-existing { justify-content: flex-start; gap: 4px; margin-top: 24px; padding-top: 16px; }
    .welcome-action-divider { display: none; }
  }
  @media (max-width: 360px) { .welcome-actions { flex-direction: column; align-items: stretch; } }
</style>
