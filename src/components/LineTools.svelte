<script lang="ts">
  import {tick} from 'svelte';
  import {ChevronUp} from '@lucide/svelte';
  import {Button,PopoverPanel} from './ui';
  import {LINE_ROUTES,type LineStyle} from '../core/lines';
  import {lineState} from '../line-state.svelte';
  import LineIcon from './icons/LineIcon.svelte';
  import LineControls from './LineControls.svelte';
  let {active=false,disabled=false,oninsert}:{active?:boolean;disabled?:boolean;oninsert:()=>void}=$props();
  let panel=$state<PopoverPanel>();
  const selectedLabel=$derived(LINE_ROUTES.find(item=>item.value===lineState.style.route)?.label??'Line');
  function place(){panel?.close();if(!active)oninsert();else void tick().then(()=>document.querySelector<HTMLElement>('.canvas-stage')?.focus({preventScroll:true}));}
  function patchStyle(patch:Partial<LineStyle>){lineState.style={...lineState.style,...patch};}
</script>
<div class="line-split" role="group" aria-label="Line tools">
  <Button kind="icon" class="line-entry" aria-label="Lines · Insert line" title={`Place ${selectedLabel.toLowerCase()}`} aria-pressed={active} {disabled} onclick={oninsert}><LineIcon style={lineState.style} size={20}/><span class="dock-label">Lines</span></Button>
  <div class="line-options">
  <PopoverPanel bind:this={panel} title="Lines" triggerLabel="Line settings" iconOnly width={320} height={640} minHeight={180} autoHeight viewportOnly {disabled}>
    {#snippet trigger()}<ChevronUp size={13}/>{/snippet}
    <div class="line-library">
      <LineControls value={lineState.style} onchange={patchStyle}/>
      <div class="line-place"><Button variant="secondary" onclick={place}>Place line</Button></div>
    </div>
  </PopoverPanel>
  </div>
</div>
<style>
  .line-split {display:flex;align-items:center;width:68px;min-width:68px;border-radius:var(--r-control);}
  .line-split > :global(.line-entry) {width:44px;min-width:44px;padding:0;border-radius:var(--r-control);}
  .line-options {width:24px;}
  .line-options :global(.ui-panel-trigger > button) {width:24px;min-width:24px;padding:0;border-radius:var(--r-control);}
  .line-options :global(.ui-panel-trigger > button > svg) {width:10px;height:10px;}
  .line-library {display:grid;gap:12px;}
  .line-place {border-top:1px solid var(--border-subtle);padding-top:12px;}
  .line-place :global(button){width:100%;}
  @media(min-width:761px) and (pointer:fine){
    .line-split {width:68px;}
    .line-split > :global(.line-entry){width:44px;min-width:44px;min-height:44px;}
    .line-options {width:24px;}
    .line-options :global(.ui-panel-trigger > button){width:24px;min-width:24px;min-height:44px;}
    .line-options :global(.ui-panel-trigger > button > svg){width:12px;height:12px;}
  }
  @media(max-width:760px),(pointer:coarse){
    .line-split {width:100%;min-width:88px;}
    .line-split > :global(.line-entry){width:auto;flex:1;min-width:44px;min-height:44px;flex-direction:column;gap:2px;padding:2px 4px;}
    .line-options{width:44px;flex:none;}
    .line-options :global(.ui-panel-trigger > button){width:44px;min-width:44px;min-height:44px;}
  }
</style>
