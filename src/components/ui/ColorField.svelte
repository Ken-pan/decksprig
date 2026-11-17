<script lang="ts">
  import {getContext,onDestroy,untrack} from 'svelte';
  import {Minus, Ellipsis, Unlink} from '@lucide/svelte';
  import ActionMenu from './ActionMenu.svelte';
  import ColorSwatch from './ColorSwatch.svelte';
  import {propertyColor} from '../../core/property-color';
  let {label,value,mixed=false,disabled=false,onchange,roles=[],roleValue='',onrole,allowClear=true,opaque=false,toolbar=false,onvaliditychange,clearLabel}: {label:string;value:string;clearLabel?:string;mixed?:boolean;disabled?:boolean;onchange:(value:string)=>boolean|void;roles?:{value:string;label:string;color?:string}[];roleValue?:string;onrole?:(role:string)=>void;allowClear?:boolean;opaque?:boolean;toolbar?:boolean;onvaliditychange?:(valid:boolean)=>void}=$props();
  const id=$props.id(),editScope=getContext<()=>string|undefined>('property-edit-scope');
  let scope=editScope?.();
  let swatch=$state<ColorSwatch>();
  let error=$state(''),input=$state<HTMLInputElement>(),submitted:string|undefined,disposed=false;
  const displayed=$derived(mixed?'':propertyColor(value)??value);
  const linkedRole=$derived(roles.find(role=>role.value===roleValue));
  const help=$derived(mixed?'Multiple colors.':value==='transparent'?'No color.':'');
  $effect(()=>{const next=displayed;label;scope=editScope?.();error='';submitted=undefined;if(input)input.value=next;untrack(()=>onvaliditychange?.(true));});
  onDestroy(()=>{disposed=true;});
  function current(){return !disposed&&!disabled&&scope===editScope?.();}
  function apply(color:string){
    if(!current())return;
    error='';onvaliditychange?.(true);
    if(color===submitted||!mixed&&color===propertyColor(value))return;
    if(onchange(color)===false){if(input)input.value=displayed;return;}
    submitted=color;
  }
  function chooseRole(role:string){
    if(!current())return;
    error='';submitted=undefined;onvaliditychange?.(true);
    if(input)input.value=roles.find(item=>item.value===role)?.color??displayed;
    onrole?.(role);
  }
  function commit(){
    if(!current()||!input?.isConnected)return;
    if(!input.value.trim()&&mixed){error='';onvaliditychange?.(true);return;}
    const color=propertyColor(input.value);
    if(!color||opaque&&(color==='transparent'||color.length!==7)){onvaliditychange?.(false);error=opaque?'Use a six-digit hex color.':'Use hex (e.g. #336699 or #33669980) or transparent.';return;}
    input.value=color;apply(color);
  }
  function key(event:KeyboardEvent){
    if(!current()||event.isComposing||event.keyCode===229)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(input)input.value=displayed;error='';onvaliditychange?.(true);}
    else if(event.key==='Enter'){event.preventDefault();event.stopPropagation();commit();}
  }
</script>
<div class="color-property" class:toolbar>
  <div class="color-control-row">
  <div class="color-field" class:has-error={Boolean(error)}>
    <ColorSwatch bind:this={swatch} roles={onrole?roles:[]} {roleValue} onrole={chooseRole} {label} {value} {mixed} {disabled} {opaque} framed={toolbar} descriptionId={help?`${id}-help`:undefined} oninput={apply} onchange={apply}/>
    {#if !toolbar}{#if onrole&&linkedRole}
      <button type="button" class="color-token-name" {disabled} aria-label={`${label}: ${linkedRole.label}`} aria-haspopup="dialog" onclick={()=>swatch?.openPicker()}>{linkedRole.label}</button>
    {:else}
    <input bind:this={input} class="color-hex" data-document-value={displayed} {disabled} spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="{label} hex" aria-invalid={Boolean(error)} aria-describedby={[error?`${id}-error`:'',help?`${id}-help`:''].filter(Boolean).join(' ')||undefined} value={displayed} placeholder={mixed?'Mixed':undefined} oninput={event=>{if(!current())return;error='';const color=propertyColor(event.currentTarget.value);onvaliditychange?.(Boolean(color&&(!opaque||color!=='transparent'&&color.length===7))||mixed&&!event.currentTarget.value.trim());}} onchange={commit} onkeydown={key}/>
    {/if}{/if}
  </div>
    {#if onrole&&roles.length}<ActionMenu label={`${label} options`} iconOnly items={[
      {label:'Use custom color',icon:Unlink,checked:!roleValue,onselect:()=>chooseRole('')},
      ...(allowClear?[{label:clearLabel??`Remove ${label.toLowerCase()}`,icon:Minus,tone:'danger' as const,disabled:disabled||value==='transparent'&&!mixed,onselect:()=>{apply('transparent');}}]:[])
    ]} {disabled}><Ellipsis size={16} aria-hidden="true"/></ActionMenu>
    {:else if allowClear}<button type="button" class="color-clear" data-tone="danger" aria-label="No {label.toLowerCase()}" title="No {label.toLowerCase()}" disabled={disabled||value==='transparent'&&!mixed} onclick={()=>{if(input)input.value='transparent';apply('transparent');}}><Minus size={16} aria-hidden="true"/></button>{/if}
  </div>
  {#if help}<span id="{id}-help" class="sr-only">{help}</span>{/if}

  {#if error}<p id="{id}-error" role="alert">{error}</p>{/if}
</div>
<style>
  .toolbar{flex:none}.toolbar .color-field{flex:none;min-height:0;padding:0;border:0;background:transparent}
  .color-token-name{flex:1;min-width:0;min-height:24px;padding:0;text-align:left;font:inherit;font-size:var(--ui-label);line-height:var(--ui-line-control);color:var(--text-primary);background:transparent;border:0;border-radius:var(--r-item);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  @media(max-width:760px),(pointer:coarse){.color-token-name{min-height:44px}}
  p{margin-top:4px;font-size:var(--ui-meta);color:var(--danger-text)}
</style>
