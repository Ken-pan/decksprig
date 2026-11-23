<script lang="ts">
 import {onMount,tick} from 'svelte';
 import {Type,X} from '@lucide/svelte';
 import {Button} from './ui';
 import NumberField from './ui/NumberField.svelte';
 import PropertyChoice from './ui/PropertyChoice.svelte';
 import {numericFieldValidity} from './ui/numeric-validity.svelte';
 import {localFontChoices} from '../core/fonts';
 import {textPropertyState} from '../core/text-properties';
 import {textRangeTarget,type TextFormatPatch,type TextFormatState} from '../core/text-range-format';
 import {editor} from '../core/editor.svelte';
 import {positionFloating} from '../ui-viewport';
 import {popoverFocus,restoreFocus} from '../ui-focus';
 let {readInline,onformat,disabled=false}:{readInline:()=>TextFormatState|null;onformat:(patch:TextFormatPatch,range:TextFormatState['range'])=>Promise<void>|void;disabled?:boolean}=$props();
 const validity=numericFieldValidity(),id=$props.id();let trigger=$state<HTMLButtonElement>(),popup=$state<HTMLDivElement>(),context=$state<TextFormatState|null>(null),opened=$state(false),tracking=$state<number|string>(''),frame=0;
 const selected=$derived(context?[context.element.text?textRangeTarget(context.element,context.range):context.element]:[]),family=$derived(textPropertyState(selected,'fontFamily')),spacing=$derived(textPropertyState(selected,'letterSpacing'));
 const choices=$derived(localFontChoices(editor.deck,family.value));
 const baseline=$derived.by(()=>{const values=selected.flatMap(e=>(e.paragraphs?.flatMap(p=>p.runs)??e.runs??[]).map(run=>run.baseline??'normal'));return values.every(v=>v===values[0])?values[0]??'normal':'';});
 function refresh(){context=readInline();}
 function position(){if(popup?.matches(':popover-open')&&trigger)positionFloating(popup,trigger.getBoundingClientRect(),{preferredHeight:popup.scrollHeight,minHeight:160});}
 function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(position);}
 async function open(){refresh();if(!context)return;tracking=spacing.mixed?'':spacing.value??0;await tick();popup?.showPopover();position();popup?.focus({preventScroll:true});}
 function close(){popup?.hidePopover();restoreFocus(trigger);}
 async function apply(patch:TextFormatPatch){const state=readInline()??context;if(!state||disabled)return;await onformat(patch,state.range);popup?.hidePopover();refresh();}
 onMount(()=>{const observer=new ResizeObserver(schedule);if(popup)observer.observe(popup);document.addEventListener('selectionchange',refresh);window.addEventListener('deck-studio-text-format',refresh);window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);refresh();return()=>{observer.disconnect();cancelAnimationFrame(frame);document.removeEventListener('selectionchange',refresh);window.removeEventListener('deck-studio-text-format',refresh);window.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('resize',schedule);};});
</script>
<div class="cell-type" data-text-formatting>
 <button bind:this={trigger} type="button" class="ui-button icon-btn" {disabled} aria-label="Font and character options" aria-haspopup="dialog" aria-controls={id} aria-expanded={opened} onpointerdown={refresh} onclick={open}><Type size={16}/></button>
 <div bind:this={popup} {id} popover="auto" use:popoverFocus={{close:()=>popup?.hidePopover(),origin:()=>trigger}} role="dialog" tabindex="-1" aria-label="Font and character options" class="cell-type-popup ui-property-surface" data-text-formatting onbeforetoggle={event=>opened=event.newState==='open'} onkeydowncapture={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}}}>
  <header><strong>Font and characters</strong><Button variant="quiet" aria-label="Close font options" onclick={close}><X size={16}/></Button></header>
  <div class="cell-type-body">
   <label>Font<select aria-label="Selected text font" value={family.mixed?'':family.value} onchange={event=>void apply({fontFamily:event.currentTarget.value})}>{#if family.mixed}<option value="" disabled>Mixed fonts</option>{/if}{#each choices as font}<option value={font.family}>{font.family}</option>{/each}</select></label>
   <div><span>Baseline</span><PropertyChoice label="Text baseline" value={baseline} options={[{value:'normal',label:'Normal'},{value:'super',label:'Superscript'},{value:'sub',label:'Subscript'}]} onchange={value=>void apply({baseline:value as 'normal'|'super'|'sub'})}/></div>
   <form onsubmit={event=>{event.preventDefault();if(String(tracking).trim()&&Number.isFinite(Number(tracking))&&Number(tracking)>=-50&&Number(tracking)<=100)void apply({letterSpacing:Number(tracking)});}}><NumberField label="Character spacing" prefix="Spacing" unit="px" min={-50} max={100} step="any" value={tracking} oninput={value=>tracking=value} onchange={value=>tracking=value} scrubbable={false}/><Button type="submit" variant="secondary" disabled={!validity.valid||String(tracking).trim()===''}>Apply</Button></form>
  </div>
 </div>
</div>
<style>
 .cell-type{display:flex;align-items:center}.cell-type-popup{position:fixed;inset:auto;margin:0;padding:0;width:320px;max-width:calc(100vw - 24px);border:1px solid var(--component-border);border-radius:var(--r-control);background:var(--surface-overlay);color:var(--text-primary);box-shadow:var(--shadow-popover);font:var(--ui-reading)/var(--ui-line-reading) var(--font-ui);box-sizing:border-box;overflow:auto}.cell-type-popup header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border-bottom:1px solid var(--border-subtle)}header strong{font-weight:500}.cell-type-body{display:flex;flex-direction:column;gap:16px;padding:12px}.cell-type-body label,.cell-type-body>div{display:flex;flex-direction:column;gap:8px}.cell-type-body select{width:100%;min-height:36px;border:1px solid var(--field-border);border-radius:var(--r-control);background:var(--field-surface);color:var(--text-primary);padding:8px;font:inherit}.cell-type-body form{display:flex;align-items:end;gap:8px}.cell-type-body form :global(.number-property){flex:1;min-width:0}@media(max-width:760px),(pointer:coarse){.cell-type-body select{min-height:44px;font-size:max(16px,var(--ui-reading))}}
</style>
