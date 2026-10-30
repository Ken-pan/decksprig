<script lang="ts">
  import { editor } from '../core/editor.svelte';
  import { notificationUI } from '../notification-ui.svelte';
  import { notificationDuration, notificationLifetime } from '../notification-lifetime';
  import { uiPresence } from '../ui-motion';
  import { positionNotification } from '../notification-position';
  import { Button } from './ui';
  import Notice from './ui/Notice.svelte';
  let {kind, owner}: {kind: 'feedback' | 'toast'; owner?: HTMLDialogElement} = $props();
  const active = $derived(owner ? notificationUI.dialog === owner : kind === 'feedback' || !notificationUI.dialog);
  function placement(node:HTMLElement) { if(!owner)return positionNotification(node); }
  const lifetime=$derived.by(()=>{
    const id=editor.noticeSequence;
    return {id,duration:notificationUI.busy?0:notificationDuration(editor.noticeTone,editor.notice),dismiss:()=>{if(editor.noticeSequence===id&&!notificationUI.busy)editor.notice='';}};
  });
</script>

{#if active && kind === 'feedback'}
  <div class="notification-feedback" class:notification-in-dialog={Boolean(owner)}>
    {#if editor.recovery}
      <Notice tone="warning" title={editor.recoveries.length === 1 ? 'Recovery draft found' : `${editor.recoveries.length} recovery drafts found`} message="Choose a draft to recover or export. Original drafts stay unchanged.">
        {#snippet actions()}
          <label class="recovery-choice field-label">
            <span>Recovery draft</span>
            <select bind:value={editor.recoveryIndex} disabled={Boolean(notificationUI.busy) || notificationUI.recoveryBusy}>
              {#each editor.recoveries as draft, index}
                <option value={index}>{index + 1}. {draft.title} · {new Date(draft.updatedAt).toLocaleString('en-US', {dateStyle:'medium', timeStyle:'short'})} · {draft.slides.length} {draft.slides.length === 1 ? 'slide' : 'slides'}</option>
              {/each}
            </select>
          </label>
          <Button variant="secondary" busy={notificationUI.recoveryBusy} disabled={Boolean(notificationUI.busy)} onclick={notificationUI.recover}>Recover as copy</Button><Button variant="quiet" disabled={Boolean(notificationUI.busy)} onclick={notificationUI.exportRecovery}>Export draft</Button>{/snippet}
      </Notice>
    {/if}
    {#if editor.saveFailed && editor.dirty}
      <Notice tone="error" title="Changes not saved" message={editor.error || 'Saving did not finish.'} detail="Save or export a copy before leaving.">
        {#snippet actions()}<Button variant="secondary" busy={editor.saving} disabled={Boolean(notificationUI.busy)} onclick={()=>editor.flush()}>Retry save</Button><Button variant="quiet" disabled={Boolean(notificationUI.busy)} onclick={notificationUI.exportCopy}>Export a copy</Button>{/snippet}
      </Notice>
    {:else if editor.error}<Notice tone="error" title="Action could not finish" message={editor.error} ondismiss={()=>editor.error=''} dismissLabel="Dismiss error"/>{/if}
    {#if notificationUI.error && notificationUI.error !== editor.error}<Notice tone="error" title="Action could not finish" message={notificationUI.error} ondismiss={notificationUI.dismissError} dismissLabel="Dismiss error"/>{/if}
  </div>
{:else if active && kind === 'toast' && (notificationUI.busy || editor.notice)}
  <div class="notification-outlet" class:notification-in-dialog={Boolean(owner)} use:placement>
    <div transition:uiPresence={{y:4}} use:notificationLifetime={lifetime}>
      <Notice tone={notificationUI.busy?'progress':editor.noticeTone} indicator={notificationUI.busy?notificationUI.busyIndicator:true} message={notificationUI.busy||editor.notice} ondismiss={notificationUI.busy?undefined:()=>editor.notice=''}/>
    </div>
  </div>
{/if}


<style>
  .recovery-choice { display:flex; flex-direction:column; flex:1 1 100%; min-width:0; max-width:100%; }
  .recovery-choice select { width:100%; min-width:0; }
</style>
