<script lang="ts">
 import {untrack,type Component,type Snippet} from 'svelte';
 import InspectorSection from './InspectorSection.svelte';
 import {inspectorTypographyDisclosure} from '../core/inspector-typography';
 import type {SlideElement} from '../core/model';
 let {scope,items,editingId,icon,children}:{scope:string;items:SlideElement[];editingId?:string;icon?:Component<any>;children:Snippet}=$props();
 const initial=untrack(()=>inspectorTypographyDisclosure({scope:'',editingId:'',open:true},scope,items,editingId??''));
 let open=$state(initial.open),context=initial;
 $effect.pre(()=>{const nextEditingId=editingId??'';untrack(()=>{context=inspectorTypographyDisclosure({...context,open},initial.scope,items,nextEditingId);open=context.open;});});
</script>

<InspectorSection title="Typography" {icon} bind:open>{@render children()}</InspectorSection>
