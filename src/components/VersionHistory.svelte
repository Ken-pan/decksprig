<script lang="ts">
  import {History} from '@lucide/svelte';
  import {editor,api} from '../core/editor.svelte';
  import {copyDeck} from '../core/workspace-view';
  import {countLabel,workspaceOpenError} from '../core/ui-copy';
  import type {Deck} from '../core/model';
  import type {HistorySummary} from '../core/history-summary';
  import {Button,EmptyState} from './ui';
  import FeedbackState from './FeedbackState.svelte';

  let {deckId,onrestored,onclose}:{deckId:string;onrestored:(id:string)=>void;onclose:()=>void}=$props();
  let versions=$state.raw<HistorySummary[]>([]),loading=$state(true),error=$state(''),restoring=$state<number|null>(null);
  let active:{controller:AbortController;current:boolean}|undefined;
  function cancel(){if(active){active.current=false;active.controller.abort();}}
  function current(request:typeof active){return Boolean(request?.current&&editor.deck?.id===deckId);}
  async function load(id:string) {
    cancel();const request=active={controller:new AbortController(),current:true};
    loading=true;error='';versions=[];restoring=null;
    try {
      const items=await api<HistorySummary[]>(`/api/decks/${id}/history`,'GET',undefined,request.controller.signal);
      if(current(request))versions=items;
    } catch(failure){if(current(request))error=workspaceOpenError(failure);}
    finally{if(request.current)loading=false;}
  }
  $effect(()=>{void load(deckId);return cancel;});
  async function restore(revision:number) {
    const request=active,id=deckId;
    if(restoring!==null||!current(request))return;
    restoring=revision;error='';
    try {
      const deck=await api<Deck>(`/api/decks/${id}/history/${revision}`,'GET',undefined,request!.controller.signal);
      if(!current(request))return;
      const copy=copyDeck(deck,`${deck.title} · Restored copy`);
      await editor.create(copy);
      // Once creation has been dispatched, its result is handled by the editor's
      // guarded create contract. Never replay a write when a dialog is closed.
      onrestored(copy.id);
    } catch(failure){if(request?.current)error=workspaceOpenError(failure);}
    finally{if(request?.current)restoring=null;}
  }
</script>

<p class="dialog-intro">Restore a version as a new document. Your current document is preserved.</p>
{#if loading}
  <FeedbackState state="loading" title="Loading versions…" />
{:else if error}
  <FeedbackState state="error" title="Version history unavailable" description={error}>
    <Button variant="secondary" onclick={()=>void load(deckId)}>Retry</Button>
  </FeedbackState>
{:else}
  <div class="document-history">
    {#each versions as version (version.revision)}
      <div><span><strong>{version.title}</strong><small>Version {version.revision} · {new Date(version.updatedAt).toLocaleString('en-US')} · {countLabel(version.count,'slide')}</small></span><Button variant="secondary" busy={restoring===version.revision} disabled={restoring!==null&&restoring!==version.revision||editor.deck?.id!==deckId} onclick={()=>void restore(version.revision)}>Restore copy</Button></div>
    {:else}
      <section><EmptyState icon={History} title="No previous versions yet" description="Earlier versions appear here after you edit and save this document."><Button variant="secondary" onclick={onclose}>Back to editor</Button></EmptyState></section>
    {/each}
  </div>
{/if}
