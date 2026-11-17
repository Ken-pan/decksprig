<script lang="ts">
  import {onMount,untrack} from 'svelte';
  import {createBodyTextEditor,type BodyTextEditor} from '../body-text-editor';
  import {editor} from '../core/editor.svelte';
  import {fontStack,sameFontFamily} from '../core/font-stack';
  import type {SlideElement} from '../core/model';
  import {prepareTextEditingFonts} from '../core/text-editing-fonts';
  let {element,scale=1,label,placeholder,mobile=false,current,onchange,onready,onblur,onerror}:{element:SlideElement;scale?:number;label?:string;placeholder?:string;mobile?:boolean;current:()=>boolean;onchange:(element:SlideElement)=>void;onready:(editor:BodyTextEditor|null)=>void;onblur?:(event:FocusEvent)=>void;onerror:()=>void}=$props();
  const seed=untrack(()=>element),document=editor.deck!,owner={deck:document.id,slide:editor.activeId,revision:document.revision};
  let mount:HTMLDivElement,handle:BodyTextEditor|undefined;
  const valid=()=>current()&&editor.deck?.id===owner.deck&&editor.activeId===owner.slide&&editor.deck?.revision===owner.revision;
  onMount(()=>{
    try{handle=createBodyTextEditor(mount,{element:seed,scale,label,placeholder,autofocus:mobile,current:valid,onchange,onselection:()=>window.dispatchEvent(new Event('deck-studio-text-format')),onwarning:message=>editor.notify(message,'warning'),onblur,prepareFont:element=>prepareTextEditingFonts(element,document),stack:family=>fontStack(family,document.onlineFonts?.find(f=>sameFontFamily(f.family,family))?.category)});onready(handle);}
    catch(error){editor.notify((error as Error).message,'warning');onerror();}
    return()=>{handle?.destroy();onready(null);};
  });
  let available=true;
  $effect(()=>{const next=valid();if(next!==available){available=next;handle?.refresh();}});
</script>
<div class="body-text-mount" bind:this={mount}></div>
<style>
  .body-text-mount{display:contents}
  :global(.body-text-editor){outline:none;white-space:inherit;position:relative;overflow-wrap:inherit;cursor:text;user-select:text}
  :global(.body-text-editor .text-paragraph::after){content:none}
  :global(.body-text-editor .text-paragraph[data-bullet]::before){content:attr(data-bullet) " "}
  :global(.body-text-editor [data-body-end]){pointer-events:none}
  :global(.body-text-editor[data-empty=true][data-placeholder]>:first-child::before){content:var(--body-placeholder);pointer-events:none}
  :global(.body-text-editor .ProseMirror-separator){display:inline!important;width:0!important;height:0!important;margin:0!important;border:0!important}
  :global(.body-text-editor.ProseMirror-hideselection *::selection){background:transparent}
</style>
