<script lang="ts">
 import {onDestroy} from 'svelte';
 import {Button} from './ui';
 import {editor} from '../core/editor.svelte';
 import {countLabel} from '../core/ui-copy';
 import {nativeMotionLinkedSource,reviewNativeMotionImport,applyNativeMotionReview,inflateNativeMotionCanvas,type NativeMotionReview} from '../core/native-deck-motion-import';
 import {nativeDeckBlobSource,readNativeDeckCanvas,type NativeDeckMotionCapture} from '../core/native-deck-motion';
 let fileName=$state(''),selectedSource=$state(''),confirmed=$state(false),capture=$state.raw<NativeDeckMotionCapture>(),review=$state.raw<NativeMotionReview>(),working=$state(false),error=$state(''),phase=$state(''),appliedRevision=$state<number>();
 let version=0,request:AbortController|undefined,documentId='';
 const source=$derived(editor.deck&&nativeMotionLinkedSource(editor.deck));
 const applied=$derived(Boolean(review&&appliedRevision===editor.deck?.revision));
 const stale=$derived(Boolean(review&&!applied&&(review.documentId!==editor.deck?.id||review.baseRevision!==editor.deck?.revision)));
 const editBlocked=$derived(Boolean(editor.pending||editor.editingId||editor.croppingId));
 $effect(()=>{const id=editor.deck?.id;if(id!==documentId){documentId=id??'';version++;request?.abort();fileName='';selectedSource='';confirmed=false;capture=review=undefined;appliedRevision=undefined;working=false;phase=error='';}});
 onDestroy(()=>{version++;request?.abort();});
 function changeSource(){confirmed=false;review=undefined;appliedRevision=undefined;error='';}
 async function choose(event:Event){const input=event.currentTarget as HTMLInputElement,file=input.files?.[0];input.value='';if(!file||!editor.deck)return;const generation=++version,id=editor.deck.id;request?.abort();request=new AbortController();working=true;fileName=file.name;capture=review=undefined;confirmed=false;appliedRevision=undefined;error='';phase='Reading motion from the backup…';
  try{if(!/\.deck$/i.test(file.name))throw Error('Choose a native Figma .deck backup.');const canvas=await readNativeDeckCanvas(nativeDeckBlobSource(file),inflateNativeMotionCanvas);if(generation!==version||editor.deck?.id!==id)return;const owned=new Uint8Array(canvas.length);owned.set(canvas);const response=await fetch('/api/figma-native-motion/canvas',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Native-Deck-Archive-Bytes':String(file.size)},body:owned.buffer,signal:request.signal});const value=await response.json();if(!response.ok)throw Error(value.error||'The native motion could not be read.');if(generation!==version||editor.deck?.id!==id)return;capture=value;phase='Motion data is ready. Confirm its source, then review the changes.';}catch(e){if(generation===version){error=e instanceof Error?e.message:'The backup could not be read. Existing motion is unchanged.';phase='';}}finally{if(generation===version)working=false;}}
 function inspect(){if(!capture||!editor.deck)return;error='';appliedRevision=undefined;try{review=reviewNativeMotionImport(editor.operationDocument(),capture,{linkedFileKey:selectedSource,archiveSourceConfirmed:confirmed});}catch(e){error=(e as Error).message;}}
 function apply(){if(!review)return;error='';try{const result=applyNativeMotionReview(editor,review,{linkedFileKey:selectedSource,archiveSourceConfirmed:confirmed});appliedRevision=result.revision;phase='';editor.notify(`Applied ${result.changes} motion ${result.changes===1?'change':'changes'}. Undo is available.`);}catch(e){error=(e as Error).message;}}
</script>

<section class="native-motion-import" aria-label="Import motion from a Figma backup">
 <p>Import supported object cues from a saved native .deck backup. Existing motion on unsupported slides stays unchanged.</p>
 {#if !source}<p>Open a document imported from Figma before adding motion from its native backup.</p>
 {:else}
  <label>Linked Figma file<select aria-label="Linked Figma file for motion import" bind:value={selectedSource} onchange={changeSource} disabled={working}><option value="">Choose the linked file</option><option value={source.fileKey}>{editor.deck?.title} · {source.fileKey}</option></select></label>
  <a href={source.url} target="_blank" rel="noopener noreferrer">Open linked Figma file</a>
  <label class="backup-file">Native Figma backup<input aria-label="Native Figma backup" type="file" accept=".deck" onchange={choose} disabled={working}/></label>
  {#if fileName}<p class="file-name">{fileName}</p>{/if}
  <p class="import-hint">The full backup stays on your computer. Only its small canvas section is sent to this local app; separate image assets are not uploaded.</p>
  <label class="source-confirm"><input type="checkbox" bind:checked={confirmed} disabled={working||!capture||!selectedSource} onchange={()=>{review=undefined;appliedRevision=undefined;}}/><span>I confirm this backup belongs to the linked Figma file selected above</span></label>
  <p class="import-hint">The backup does not expose a verified file identity. Imported cues play in Deck Studio; this is not a live motion connection.</p>
  <Button busy={working} disabled={!capture||!confirmed||selectedSource!==source.fileKey} onclick={inspect}>{review?'Review again':'Review motion'}</Button>
  {#if phase}<p role="status">{phase}</p>{/if}
  {#if review}
   {@const slideCount=new Set(review.operations.filter(op=>'slideId'in op).map(op=>'slideId'in op?op.slideId:'')).size}
   <div class="motion-review" aria-label="Native motion review">
    <p>{countLabel(review.operations.length,'motion change')} ready across {countLabel(slideCount,'slide')}</p>
    <ul>{#each review.slides.filter(s=>s.changes||s.matchingObjects||s.blocked).slice(0,8) as slide}<li><strong>{slide.label}</strong><span>{slide.matchingObjects} matching {slide.matchingObjects===1?'object':'objects'} · {slide.blocked?'Needs review':slide.changes?countLabel(slide.changes,'change'):'Unchanged'}</span></li>{/each}</ul>
    {#if review.issues.length}<details><summary>Unsupported or unmatched items ({review.issues.length})</summary>{#each review.issues as issue}<p>{#if issue.slideId}<strong>{review.slides.find(s=>s.id===issue.slideId)?.label??'Source slide'}: </strong>{/if}{issue.message}</p>{/each}</details>{/if}
    {#if !review.operations.length}<p>No supported motion changes are ready. Existing motion is unchanged.</p>{/if}
    {#if applied}<p role="status">Motion applied. Undo is available.</p>{:else if stale}<p role="status">The document changed. Review this backup again before applying motion.</p>{/if}
    {#if editBlocked}<p>Finish the current edit or proposal before applying motion.</p>{/if}
    <Button variant="primary" disabled={working||!review.operations.length||!confirmed||selectedSource!==source.fileKey||stale||applied||editBlocked} onclick={apply}>Apply motion</Button>
   </div>
  {/if}
 {/if}
 {#if error}<p role="alert">{error}</p>{/if}
</section>
<style>
 .native-motion-import,.motion-review{display:flex;flex-direction:column;gap:12px}.native-motion-import p{margin:0;line-height:var(--ui-line-reading)}.native-motion-import label{display:flex;flex-direction:column;gap:6px}.native-motion-import select,.native-motion-import input[type=file]{width:100%;max-width:100%;min-height:var(--ui-action-size);font:inherit;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:var(--r-control);padding:10px}.native-motion-import .source-confirm{display:flex;flex-direction:row;align-items:flex-start;gap:8px}.source-confirm input{width:16px;min-width:16px;height:16px;min-height:16px;padding:0;flex:none;margin:4px 0 0}.source-confirm span{min-width:0}.file-name{overflow-wrap:anywhere}.import-hint{font-size:var(--ui-meta)}.motion-review{border-top:1px solid var(--border-subtle);padding-top:12px}.motion-review ul{padding-left:20px;margin:0}.motion-review li{margin:8px 0}.motion-review li span{display:block;color:var(--text-secondary)}.native-motion-import :global(.ui-button){align-self:flex-start;max-width:100%;white-space:normal;text-align:left}
</style>
