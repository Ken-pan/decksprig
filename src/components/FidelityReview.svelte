<script lang="ts">
  import {slideLabel} from '../core/slide-label';
  import { onMount } from 'svelte';
  import type { Deck } from '../core/model';
  import { auditFonts, type FontAudit } from '../core/fidelity';
  import { AlertTriangle } from '@lucide/svelte';
  import SlideCanvas from './SlideCanvas.svelte';
  let {deck, attach, fonts}: {deck: Deck; attach: ()=>void; fonts: ()=>void} = $props();
  let index=$state(0), mode=$state('side'), overlay=$state(50), audit=$state<FontAudit[]>([]), checking=$state(true);
  let slide=$derived(deck.slides[index]);
  onMount(()=>{void auditFonts(deck).then(v=>{audit=v;checking=false;});});
</script>
<p class="hint">Compare the original and editable slide.</p>
<div class="review-controls"><label class="field-label">Slide<select aria-label="Slide to compare" bind:value={index}>{#each deck.slides as s,i}<option value={i}>{slideLabel(i)}</option>{/each}</select></label><label class="field-label">Comparison view<select aria-label="Comparison view" bind:value={mode}><option value="side">Side by side</option><option value="overlay">Overlay</option></select></label></div>
{#if slide.source}<p class="hint">Source · {slide.source.provider}{#if slide.source.label} · {slide.source.label}{/if}</p>{/if}
{#if slide.source?.render}
  {#if mode==='side'}<div class="review-pair"><div><p class="section-label">Source reference</p><SlideCanvas {deck} {slide} original /></div><div><p class="section-label">Editable version</p><SlideCanvas {deck} {slide} /></div></div>
  {:else}<label class="field-label">Source opacity · {overlay}%<input aria-label="Source opacity" type="range" min="0" max="100" bind:value={overlay}/></label><div class="review-overlay"><SlideCanvas {deck} {slide}/><img src={slide.source.render} alt="Source reference overlay" style:opacity={overlay/100}/></div>{/if}
{:else}<p class="hint">Attach an original PDF to compare this slide.</p>{/if}
<button class="text-btn ghost" onclick={attach}>Attach source PDF</button>
<h3>Source fonts</h3>
{#if checking}<p class="hint">Checking fonts in this browser…</p>{:else}<div class="font-audit">{#each audit as f}<div><strong>{f.family}</strong><span data-font-status={f.status}>{#if ['missing','partial'].includes(f.status)}<AlertTriangle size={14} aria-hidden="true" />{/if}{({embedded:'Embedded in document',loaded:'Web font loaded',local:'Available on this device',missing:'Missing · Using a fallback',partial:`Missing weight ${f.missingWeights?.join(' / ')}`})[f.status]}</span><small>{f.pages.length===1?'Slide':'Slides'} {f.pages.join(', ')}  · Weight {[...f.weights].sort((a,b) => a-b).join(' / ')}</small></div>{/each}</div>{#if audit.some(f=>['missing','partial'].includes(f.status))}<button class="text-btn ghost" onclick={fonts}>Add source fonts</button>{/if}{/if}
<div class="warning-list">{#each slide.source?.warnings ?? [] as warning}<p><AlertTriangle size={14} aria-hidden="true" />{warning}</p>{/each}</div>
<style>
  .font-audit span{display:flex;align-items:flex-start;gap:8px}
  .font-audit span[data-font-status='missing'],.font-audit span[data-font-status='partial'],.warning-list p{color:var(--warning-text)}
  .font-audit span :global(svg),.warning-list :global(svg){flex:none;margin-top:2px}
  .review-controls{display:flex;gap:20px;margin:16px 0}.review-controls label:first-child{flex:1}.review-pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}.review-overlay{position:relative;margin:16px 0}.review-overlay>img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none}.font-audit{margin:12px 0}.font-audit>div{display:grid;grid-template-columns:1fr 1fr;padding:12px 0;border-bottom:1px solid var(--border-subtle);gap:4px 12px;font-size:var(--ui-text)}.font-audit small{grid-column:1/-1;color:var(--text-secondary)}h3{margin-top:24px}@media(max-width:600px){.review-pair{grid-template-columns:1fr}.font-audit>div{grid-template-columns:1fr}}
</style>
