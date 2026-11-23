<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, ArrowRight, Plus, Check, Layers, BookOpen } from '@lucide/svelte';
  import { BRAND, installSavedBrand, syncBrowserBrand } from '../branding';
  import BrandLockup from './BrandLockup.svelte';
  import Button from './ui/Button.svelte';

  const palettes = [{id:'forest',label:'Forest'}, {id:'graphite',label:'Graphite'}, {id:'paper',label:'Paper'}, {id:'indigo',label:'Indigo'}, {id:'ocean',label:'Ocean'}, {id:'violet',label:'Violet'}, {id:'rose',label:'Rose'}];
  const roles = [{name:'Workspace',token:'--surface-chrome'}, {name:'Canvas surface',token:'--surface-sunken'}, {name:'Primary action',token:'--action-solid-bg'}, {name:'Selected state',token:'--state-selected'}, {name:'Brand mark',token:'--brand-mark-color'}, {name:'Primary text',token:'--text-primary'}];
  let palette=$state('forest'), theme=$state('light');
  function preview() {
    document.documentElement.dataset.palette=palette;
    if(theme==='system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme=theme;
    syncBrowserBrand();
  }
  onMount(()=>{
    const dispose=installSavedBrand();
    palette=document.documentElement.dataset.palette || 'forest';
    theme=document.documentElement.dataset.theme || 'system';
    return dispose;
  });
</script>

<main class="brand-guide">
  <header class="guide-header"><BrandLockup/><a href="/" class="text-btn ghost"><ArrowLeft size={16}/>Back to editor</a></header>
  <div class="guide-title"><div><p class="guide-kicker">Brand guidelines · {BRAND.version}</p><h1>Clarity in every creation.</h1><p>A consistent identity across the mark, wordmark, and workspace. Forest green by default, with appearance choices for every workspace.</p></div><span class="guide-tag">{BRAND.name}</span></div>
  <section class="guide-theme" aria-label="Brand theme preview"><div><h2>Appearance preview</h2><p>Changes here are for preview only. Save app preferences in the editor’s Settings.</p></div><div class="guide-theme-controls"><div class="guide-palette-buttons" role="group" aria-label="Preview color palette">{#each palettes as option}<button data-brand-palette={option.id} aria-pressed={palette===option.id} onclick={()=>{palette=option.id;preview();}}>{option.label}</button>{/each}</div><div class="seg" role="group" aria-label="Preview appearance">{#each [{id:'light',label:'Light'},{id:'dark',label:'Dark'},{id:'system',label:'System'}] as option}<button data-brand-theme={option.id} aria-pressed={theme===option.id} onclick={()=>{theme=option.id;preview();}}>{option.label}</button>{/each}</div></div></section>
  <section class="guide-section guide-identity"><div class="guide-section-label"><span>01</span><h2>Mark and wordmark</h2><p>A rounded card, a two-leaf cutout, and one rear card. The wordmark uses its own Manrope font family.</p></div><div class="guide-identity-display"><BrandLockup size="large" caption={BRAND.description}/><div class="guide-mark-sizes" aria-label="Mark sizes">{#each [16,24,40,64] as size}<div><span class="brand-mark" style:width="{size}px" style:height="{size}px" aria-hidden="true"></span><small>{size}</small></div>{/each}</div></div></section>
  <section class="guide-section"><div class="guide-section-label"><span>02</span><h2>Semantic colors</h2><p>Neutral surfaces support editing. Accent color identifies the brand and primary actions.</p></div><div class="guide-colors">{#each roles as role}<div><span class="guide-color" style:background={`var(${role.token})`}></span><strong>{role.name}</strong><code>{role.token}</code></div>{/each}</div></section>
  <section class="guide-section"><div class="guide-section-label"><span>03</span><h2>Type hierarchy</h2><p>The wordmark, interface, and documents use independent typography. Interface fonts do not override imported document fonts.</p></div><div class="guide-type-specimens"><div><span class="brand-wordmark">{BRAND.name}</span><small>Wordmark · Manrope / 650</small></div><div><h3>Your next portfolio</h3><small>Dialog title · 18 / 600</small></div><div><p>Preview your changes before applying.</p><small>Interface text · Inter / 13</small></div><div><span class="guide-meta">Saved locally · 10 slides</span><small>Supporting text · 11</small></div></div></section>
  <section class="guide-section guide-controls-section"><div class="guide-section-label"><span>04</span><h2>Actions and states</h2><p>Clear primary actions and restrained secondary controls, with consistent icons and components.</p></div><div class="guide-control-specimens"><div class="button-row"><Button variant="primary"><Plus size={16}/>New document</Button><Button variant="secondary"><BookOpen size={16}/>Open document library</Button><Button variant="quiet">View details<ArrowRight size={16}/></Button></div><div class="guide-state-specimens"><span><Check size={15}/>Saved locally</span><span class="guide-selected">Design<span class="guide-active-line"></span></span><button class="guide-focus" type="button">Keyboard focus</button></div><p class="guide-principle">The workspace gives your content room to lead. Preview AI proposals before applying them, with undo available for every change.</p></div></section>
  <footer class="guide-footer"><span>Approved artwork and mark geometry are preserved.</span><span>Interface colors are independent of document and resource colors.</span></footer>
</main>
