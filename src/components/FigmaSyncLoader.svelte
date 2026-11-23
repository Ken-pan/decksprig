<script lang="ts">
 import AsyncFeature from './AsyncFeature.svelte';
 import {editor} from '../core/editor.svelte';
 import {isBrowserEdition} from '../core/runtime';
 import {hasFigmaCheckpoint} from '../core/figma-sync-bootstrap';
 let {open,onclose,onDocument}:{open:boolean;onclose:()=>void;onDocument?:(id:string)=>void}=$props();
 let loaded=$state(false);
 $effect(()=>{
  const id=editor.deck?.id;
  if(open){loaded=true;return;}
  if(loaded||!id||isBrowserEdition)return;
  let current=true;void hasFigmaCheckpoint(id).then(saved=>{if(current&&saved)loaded=true;});
  return()=>{current=false;};
 });
</script>

{#if loaded}<AsyncFeature feature="figma-sync-panel" props={{open,onclose,onDocument}} />{/if}
