<script lang="ts">
  import type {Snippet} from 'svelte';
  import Dialog from './Dialog.svelte';
  import {Button,DialogFooter} from './ui';
  import TextFormattingTools from './TextFormattingTools.svelte';
  import type {TextFormatState,TextFormatPatch,TextRange} from '../core/text-range-format';
  let {children,fontSize,readInline,onformat,oncommit,onclose}:{children:Snippet;fontSize:number;readInline:()=>TextFormatState|null;onformat:(patch:TextFormatPatch,range?:TextRange)=>Promise<void>;oncommit:()=>void;onclose:()=>void}=$props();
</script>
<Dialog title="Edit text" {onclose} class="canvas-mobile-text-dialog">
  <div class="mobile-text-field" style:--editing-font="{Math.max(16,Math.min(24,fontSize))}px">{@render children()}</div>
  <div class="mobile-text-format" role="toolbar" aria-label="Text formatting"><TextFormattingTools inline allowCaret characters {readInline} {onformat}/></div>
  <p class="hint">Changes apply when you choose Done.</p>
  {#snippet footer()}<DialogFooter>{#snippet actions()}<Button onpointerdown={event=>event.preventDefault()} onclick={onclose}>Cancel</Button><Button variant="primary" onpointerdown={event=>event.preventDefault()} onclick={oncommit}>Done</Button>{/snippet}</DialogFooter>{/snippet}
</Dialog>
<style>
  .mobile-text-field{min-height:160px;padding:12px;border:1px solid var(--border-default);border-radius:var(--r-control);background:var(--surface-input)}
  .mobile-text-field :global(.text-content){font-size:var(--editing-font)!important;color:var(--text-primary)!important;min-height:136px;height:auto!important;overflow:visible!important;display:block!important;white-space:pre-wrap;overflow-wrap:anywhere;outline:none}
  .mobile-text-field:focus-within{outline:2px solid var(--text-primary);outline-offset:0}
  .mobile-text-field :global(.text-flow){width:100%;white-space:pre-wrap}
  .hint{margin-top:12px}
  .mobile-text-format{margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  .mobile-text-format :global(button){min-height:44px;min-width:44px}
</style>
