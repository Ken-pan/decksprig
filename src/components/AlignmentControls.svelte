<script lang="ts">
  import Notice from './ui/Notice.svelte';
  import { onMount, tick } from 'svelte';
  import { positionFloating } from '../ui-viewport';
  import {uiDisclosure} from '../ui-motion';
  import '../selection-tools.css';
  import { AlignHorizontalJustifyStart,AlignHorizontalJustifyCenter,AlignHorizontalJustifyEnd,AlignVerticalJustifyStart,AlignVerticalJustifyCenter,AlignVerticalJustifyEnd,AlignHorizontalDistributeCenter,AlignVerticalDistributeCenter,ChevronDown,X } from '@lucide/svelte';
  import { editor } from '../core/editor.svelte';
  import PropertyChoice from './ui/PropertyChoice.svelte';
  import { objectAction } from '../editor-focus';
  import {alignElements,distributeElements,arrangementUnits,distributionGap,alignmentReference,type AlignmentDirection} from '../core/arrangement-operations';
  import {arrangementParent} from '../core/container-tree';
  import {layoutArrangement,layoutAlignment,layoutDistribution} from '../core/arrangement-layout';
  let {compact=false,hiddenTrigger=false,dense=false,quick=false}:{compact?:boolean;hiddenTrigger?:boolean;dense?:boolean;quick?:boolean}=$props();
  const id=$props.id();
  let trigger=$state<HTMLButtonElement>(),popup=$state<HTMLDivElement>(),open=$state(false),error=$state('');
  let optionsOpen=$state(false);
  const units=$derived(editor.deck&&editor.slide?arrangementUnits(editor.deck,editor.slide.id,editor.selected,editor.selectionScope):[]);
  const parent=$derived(editor.slide&&arrangementParent(editor.slide,editor.selected,editor.selectionScope));
  const inGroup=$derived(Boolean(editor.editingGroup&&parent));
  const flow=$derived(editor.slide&&layoutArrangement(editor.slide,editor.selected,editor.selectionScope));
  const reference=$derived(alignmentReference(editor.alignmentReference,units.length,inGroup));
  const references=$derived([...inGroup?[{value:'group',label:'Group',description:'Current group bounds'}]:[],{value:'selection',label:'Selection',disabled:units.length<2},{value:'content',label:dense?'Margins':'Content area (inside margins)',description:'Content area inside slide margins'},{value:'page',label:dense?'Slide':'Entire slide',description:'Entire slide'}]);
  const actions=[{id:'left',icon:AlignHorizontalJustifyStart,label:'Align left'},{id:'center',icon:AlignHorizontalJustifyCenter,label:'Align horizontal centers'},{id:'right',icon:AlignHorizontalJustifyEnd,label:'Align right'},{id:'top',icon:AlignVerticalJustifyStart,label:'Align top'},{id:'middle',icon:AlignVerticalJustifyCenter,label:'Align vertical centers'},{id:'bottom',icon:AlignVerticalJustifyEnd,label:'Align bottom'}];
  const distributions=[{axis:'x',label:'Distribute horizontally',icon:AlignHorizontalDistributeCenter},{axis:'y',label:'Distribute vertically',icon:AlignVerticalDistributeCenter}] as const;
  let externalAnchor:DOMRect|undefined,externalOrigin:HTMLElement|undefined;
  export function openAt(rect:DOMRect){externalAnchor=rect;externalOrigin=document.activeElement instanceof HTMLElement?document.activeElement:undefined;popup?.showPopover();}
  function close(){popup?.hidePopover();restoreFocus(externalOrigin,trigger);externalAnchor=undefined;externalOrigin=undefined;}
  function position(){if(popup?.matches(':popover-open')&&trigger)positionFloating(popup,externalOrigin?.isConnected?externalOrigin.getBoundingClientRect():externalAnchor??trigger.getBoundingClientRect(),{preferredHeight:popup.scrollHeight,minHeight:160});}
  async function toggled(event:ToggleEvent){open=event.newState==='open';if(open){error='';await tick();if(!popup?.matches(':popover-open'))return;position();(matchMedia('(pointer:coarse)').matches?popup:popup.querySelector<HTMLElement>('select,[role="radio"][tabindex="0"]')??popup)?.focus({preventScroll:true});}}
  onMount(()=>{let frame=0;const schedule=(event?:Event)=>{if(event?.target instanceof Node&&popup?.contains(event.target))return;cancelAnimationFrame(frame);frame=requestAnimationFrame(position);};const observer=new ResizeObserver(()=>schedule());if(popup)observer.observe(popup);window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true);window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);return()=>{observer.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);};});
  function apply(direction:AlignmentDirection|'x'|'y',event:MouseEvent){if(!editor.deck||!editor.slide)return;error='';try{const ops=direction==='x'||direction==='y'?distributeElements(editor.operationDocument(),editor.slide.id,editor.selected,direction,editor.selectionScope):alignElements(editor.operationDocument(),editor.slide.id,editor.selected,direction,reference,editor.selectionScope);if(compact)close();void objectAction(()=>editor.commit(ops),event);}catch(e:any){error=e.message;}}
  function key(event:KeyboardEvent){if(event.key==='Escape'&&!event.isComposing&&event.keyCode!==229){event.preventDefault();event.stopPropagation();close();}}
  import {popoverFocus,restoreFocus} from '../ui-focus';
</script>
{#snippet referenceControls()}
  {#if flow}<p class="alignment-note">Auto layout · {flow.layout.name}</p>{#if !flow.complete}<p class="alignment-note">Members share alignment and spacing.</p><button class="text-btn" onclick={()=>{editor.enterGroup(flow.layout.id);editor.selectAll();}}>Select all members</button>{/if}
  {:else if quick}<label class="alignment-reference quick-reference"><span>Align to</span><select class="ui-property-input" aria-label="Align to" value={reference} onchange={event=>editor.alignmentReference=event.currentTarget.value as typeof reference}>{#each references as option}<option value={option.value} disabled={option.disabled}>{option.label}</option>{/each}</select></label>
  {:else if dense}<div class="alignment-reference"><span>Align to</span><PropertyChoice label="Align to" options={references} value={reference} onchange={value=>editor.alignmentReference=value as typeof reference}/></div>{:else}<label class="field-label alignment-reference">Align to<select aria-label="Align to" value={reference} onchange={event=>editor.alignmentReference=event.currentTarget.value as typeof reference}>{#each references as option}<option value={option.value} disabled={option.disabled}>{option.label}</option>{/each}</select></label>{/if}
{/snippet}
{#snippet alignmentButtons()}
  <div class="alignment-buttons">{#each actions as action}{@const state=flow&&layoutAlignment(flow,action.id as AlignmentDirection)}<button class="icon-btn" disabled={!units.length||Boolean(state?.reason)} aria-label={action.label} title={state?.reason??action.label} aria-pressed={flow&&state?.patch?Object.entries(state.patch).every(([key,value])=>flow.layout[key as keyof typeof flow.layout]===value):undefined} onclick={event=>apply(action.id as AlignmentDirection,event)}><action.icon size={16}/></button>{/each}</div>
{/snippet}
{#snippet distributionControls()}
  <div class="distribution-buttons">{#each distributions as action}{@const gap=distributionGap(units,action.axis)}{@const state=flow&&layoutDistribution(flow,action.axis)}<button class="text-btn" aria-label={action.label} title={flow?state?.reason??action.label:gap===null?'Select at least three objects or groups':gap<0?'Move the outer objects farther apart first':action.label} disabled={flow?Boolean(state?.reason):gap===null||gap<0} aria-pressed={flow&&!state?.reason?flow.layout.justify==='space-between':undefined} onclick={event=>apply(action.axis,event)}><action.icon size={16}/>{action.axis==='x'?'Horizontal':'Vertical'}</button>{/each}</div>
  {#if flow&&flow.complete}<p class="alignment-note">{flow.locked?'Unlock all members to change this layout.':flow.layout.direction==='grid'?'Grid spacing follows column and row gaps.':(flow.layout.direction==='horizontal'?flow.layout.widthMode:flow.layout.heightMode)==='hug'?'Hug follows contents with equal gaps. Use Fixed to spread members.':'Alignment and distribution update the shared layout.'}</p>
  {:else if !flow}{#if dense&&!quick}<details class="alignment-help"><summary>Alignment tips</summary><p class="alignment-note">Groups keep their internal spacing. Distribution keeps the outer objects in place. Locked and hidden objects are excluded.</p></details>{:else}<p class="alignment-note">Groups keep their internal spacing. Distribution keeps the outer objects in place. Locked and hidden objects are excluded.</p>{/if}{/if}
{/snippet}
{#snippet content()}
  {@render referenceControls()}
  {@render alignmentButtons()}
  {#if quick}<details class="alignment-options" bind:open={optionsOpen} use:uiDisclosure={next=>optionsOpen=next}><summary><span>Alignment options</span><ChevronDown size={14}/></summary><div>{@render distributionControls()}</div></details>{:else}{@render distributionControls()}{/if}
  {#if error}<Notice tone="error" title="Alignment could not finish" message={error}/>{/if}
{/snippet}
{#if compact}
  <button bind:this={trigger} style:display={hiddenTrigger?'none':undefined} class="text-btn" aria-label="Object alignment and distribution" title="Align and distribute" aria-haspopup="dialog" aria-controls={id} aria-expanded={open} popovertarget={id} disabled={!units.length}><AlignHorizontalJustifyCenter size={16}/>Align</button>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div bind:this={popup} {id} use:popoverFocus={{close:()=>popup?.hidePopover(), origin:()=>externalOrigin??trigger}} popover="auto" inert={!open} class="alignment-popover selection-tools-popover ui-property-surface canvas-controls-popover" role="dialog" tabindex="-1" aria-label="Object alignment and distribution" onbeforetoggle={event=>open=event.newState==='open'} ontoggle={toggled} onkeydown={key}>
    <header><strong>Alignment</strong><button class="icon-btn" aria-label="Close alignment settings" onclick={close}><X size={16}/></button></header>
    <div class="selection-format-body">{@render content()}</div>
  </div>
{:else}<div class="alignment-inline">{@render content()}</div>{/if}
<style>
  .alignment-reference{margin:0 0 8px;font-size:var(--ui-meta);gap:4px}.alignment-buttons{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px}.alignment-buttons button{width:100%;height:36px}
  .quick-reference{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px}.quick-reference select{width:100%;min-width:0}
  .alignment-options>summary{display:flex;align-items:center;gap:8px;min-height:32px;cursor:pointer;list-style:none;color:var(--text-secondary);font-size:var(--ui-meta)}.alignment-options>summary::-webkit-details-marker{display:none}.alignment-options>summary>span{flex:1;min-width:0}.alignment-options>summary :global(svg){flex:none}.alignment-options[open]>summary :global(svg){rotate:180deg}.alignment-options>summary:focus-visible{outline:2px solid var(--accent-line);outline-offset:0;border-radius:var(--r-sm)}
  .alignment-help summary{padding-block:8px;cursor:pointer;font-size:var(--ui-meta);color:var(--text-secondary)}
  .distribution-buttons{display:grid;grid-template-columns:repeat(auto-fit,minmax(8em,1fr));gap:4px;margin-top:6px}.distribution-buttons button{font-size:var(--ui-label);border:1px solid var(--border-default);padding:0 6px;min-height:32px}
  .alignment-note{margin-top:8px;color:var(--text-tertiary);font-size:var(--ui-meta);line-height:var(--ui-line-body)}
  .alignment-popover{width:min(284px,calc(100vw - 24px))}
  .alignment-popover .alignment-reference,.alignment-popover .alignment-note{margin:0}
  @media(max-width:760px),(pointer:coarse){.alignment-buttons{grid-template-columns:repeat(3,minmax(0,1fr))}.alignment-buttons button,.distribution-buttons button,.alignment-options>summary{min-height:44px}}
</style>
