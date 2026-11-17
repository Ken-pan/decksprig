<script lang="ts">
 import {textLinkUrl} from '../core/text-link';
 let {value,onchange}:{value?:string;onchange:(link:string|undefined)=>void}=$props();
 let draft=$state(''),focused=$state(false),error=$state(''),initial='';let root=$state<HTMLDivElement>();
 $effect(()=>{if(!focused&&!error){draft=value??'';initial=draft;}});
 function save(){
  if(draft===initial){draft=value??'';return true;}
  const raw=draft.trim(),link=textLinkUrl(raw);
  if(raw&&!link){error='Use a web, email or phone link without credentials.';return false;}
  error='';if((link??'')!==(value??''))onchange(link);draft=initial=link??'';return true;
 }
</script>
<svelte:window onpointerdowncapture={event=>{if(focused&&!event.composedPath().includes(root!))save();}}/>
<div bind:this={root} style="display:contents">
<label class="field-label">Link<input class="ui-property-input" aria-label="Text link" aria-invalid={Boolean(error)} type="text" placeholder="Web, email or phone link" maxlength="3000" bind:value={draft} onfocus={()=>{focused=true;initial=draft;}} onblur={()=>{save();focused=false;}} oninput={()=>error=''} onkeydown={event=>{if(event.isComposing||event.keyCode===229)return;if(event.key==='Enter'){event.preventDefault();if(save())event.currentTarget.blur();}else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();error='';draft=initial=value??'';event.currentTarget.blur();}}}/></label>
{#if error}<p class="inspector-error" role="alert">{error}</p>{/if}
</div>
