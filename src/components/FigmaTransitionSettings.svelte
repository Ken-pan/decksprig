<script lang="ts">
 import type {SlideTransition} from '../core/model';
 import {nativeSlideTransition,type NativeSlideTransition} from '../core/figma-transitions';
 import {FIGMA_TRANSITION_FAMILIES,FIGMA_TRANSITION_DIRECTIONS,figmaTransitionFamily,figmaTransitionDirection,editNativeTransition} from '../core/figma-transition-authoring';
 import NumberField from './ui/NumberField.svelte';
 let {value,onchange}:{value:SlideTransition;onchange:(value:SlideTransition,property:string)=>void}=$props();
 const native=$derived(nativeSlideTransition(value)!);
 const family=$derived(figmaTransitionFamily(native.style)),direction=$derived(figmaTransitionDirection(native.style));
 const directional=$derived(!['NONE','SMART_ANIMATE','DISSOLVE'].includes(family));
 function change(patch:Partial<NativeSlideTransition>,property:string){onchange(editNativeTransition(value,patch),property);}
</script>
<div class="motion-timing">
 <label class="field-label">Style<select class="ui-property-input" aria-label="Figma transition style" value={family} onchange={e=>{const family=e.currentTarget.value;change({style:['NONE','SMART_ANIMATE','DISSOLVE'].includes(family)?family:family+'_'+direction},'style');}}>{#each FIGMA_TRANSITION_FAMILIES as [id,label]}<option value={id}>{label}</option>{/each}</select></label>
 {#if directional}<label class="field-label">Direction<select class="ui-property-input" aria-label="Figma transition direction" value={direction} onchange={e=>change({style:family+'_'+e.currentTarget.value},'direction')}>{#each FIGMA_TRANSITION_DIRECTIONS as id}<option value={id}>{family.includes('OUT')?'To':'From'} {id.toLowerCase()}</option>{/each}</select></label>{/if}
 {#if family!=='NONE'}<label class="field-label">Timing<select class="ui-property-input" aria-label="Transition timing" value={native.timing.type} onchange={e=>change({timing:e.currentTarget.value==='ON_CLICK'?{type:'ON_CLICK'}:{type:'AFTER_DELAY',delay:1}},'timing')}><option value="ON_CLICK">On click</option><option value="AFTER_DELAY">After delay</option></select></label>
 {#if native.timing.type==='AFTER_DELAY'}<NumberField label="Automatic advance delay" prefix="Delay" unit="s" min={0} max={3600} step="any" keyboardStep={.1} value={native.timing.delay??0} onchange={delay=>change({timing:{type:'AFTER_DELAY',delay}},'delay')}/>{/if}{/if}
</div>
<style>
 .motion-timing{display:flex;flex-direction:column;gap:8px;min-width:0}
 .field-label{margin:0;gap:4px}
</style>
