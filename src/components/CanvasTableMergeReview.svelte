<script lang="ts">
  import {onMount} from 'svelte';
  import Dialog from './Dialog.svelte';
  import TableVisual from './TableVisual.svelte';
  import {Button,DialogFooter} from './ui';
  import {editor} from '../core/editor.svelte';
  import {confirmMergedTableCopy,type TableMergeCopyReview} from '../core/table-merge-copy';
  import {objectAction} from '../editor-focus';
  import {portalToBody} from '../ui-portal';
  import type {DesignSystem} from '../core/design-system-schema';
  let {review,system,onclose}:{review:TableMergeCopyReview;system?:DesignSystem;onclose:()=>void}=$props();
  let host=$state<HTMLDivElement>(),width=$state(420),error=$state('');
  const scale=$derived(Math.min(1,width/review.preview.w));
  const background=$derived(editor.deck?.slides.find(slide=>slide.id===review.slideId)?.background??'#ffffff');
  const stale=$derived(editor.deck?.id!==review.documentId||editor.deck?.revision!==review.baseRevision);
  async function create(){
    if(stale)return;
    try{await objectAction(()=>{const id=confirmMergedTableCopy(editor,review);if(id)onclose();else error=editor.error||'The copy could not be created. Review the table again.';});}
    catch(e){error=e instanceof Error?e.message:'The copy could not be created. Review the table again.';}
  }
  onMount(()=>{const observer=new ResizeObserver(()=>{if(host)width=host.clientWidth;});observer.observe(host!);width=host!.clientWidth;return()=>observer.disconnect();});
</script>
<div use:portalToBody>
<Dialog title="Merge in an editable copy" subtitle={`Cells ${review.rangeLabel}`} {onclose} returnFocus={()=>document.querySelector<HTMLElement>(`.canvas-stage .slide-element[data-element-id="${CSS.escape(editor.selected[0]??review.sourceId)}"]`)??undefined}>
  <p>Your original table stays unchanged. The copy uses editable cell layers when sent to Figma, without native table tools or animations. Some text styling may differ.</p>
  {#if review.hiddenValueCount}<p>{review.hiddenValueCount} {review.hiddenValueCount===1?'value is':'values are'} covered by the merge. Split the cells to restore them.</p>{/if}
  <div class="merge-copy-preview" bind:this={host} role="img" aria-label={`Merged table preview, cells ${review.rangeLabel}`} style:background={background}>
    <div class="merge-copy-extent" style:height={`${review.preview.h*scale}px`}>
      <div class="merge-copy-table" style:width={`${review.preview.w}px`} style:height={`${review.preview.h}px`} style:transform={`scale(${scale})`} style:line-height={review.preview.lineHeight} style:letter-spacing={`${review.preview.letterSpacing}px`}><TableVisual onlineFonts={editor.deck?.onlineFonts} element={review.preview} {system}/></div>
    </div>
  </div>
  {#if stale}<p role="status">The document changed. Close this preview and review the merge again.</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#snippet footer()}<DialogFooter>{#snippet actions()}<Button onclick={onclose}>Cancel</Button><Button variant="primary" disabled={stale} onclick={create}>Create merged copy</Button>{/snippet}</DialogFooter>{/snippet}
</Dialog>
</div>
<style>
  p{margin:0 0 12px;line-height:1.6}.merge-copy-preview{width:100%;max-height:320px;overflow:auto;border:1px solid var(--component-border);box-sizing:border-box;color-scheme:light}.merge-copy-extent{position:relative;min-height:1px}.merge-copy-table{position:absolute;top:0;left:0;transform-origin:top left}
</style>
