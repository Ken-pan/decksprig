<script lang="ts">
 import {onDestroy} from 'svelte';
 import {Button} from './ui';
 import Notice from './ui/Notice.svelte';
 import {editor} from '../core/editor.svelte';
 import {renameLibraryDocument} from '../core/document-library-actions';
 let {target,onclose,onsaved}:{target:{id:string;title:string};onclose:()=>void;onsaved:()=>void}=$props();
 let value=$state(''),working=$state(false),error=$state('');
 let active=true,scope=0,lastTarget:typeof target|undefined;onDestroy(()=>{active=false;});
 $effect(()=>{const next=target;if(next!==lastTarget){lastTarget=next;scope++;value=next.title;working=false;error='';}});
 async function save(){
  const id=target.id,title=value.trim(),version=scope;if(!title||working)return;working=true;error='';
  try{await renameLibraryDocument(editor,id,title);if(active&&scope===version)onsaved();else editor.notify('Document renamed');}
  catch(failure){if(active&&scope===version)error=(failure as Error).message;else editor.notify((failure as Error).message,'warning');}
  finally{if(active&&scope===version)working=false;}
 }
</script>

<label class="field-label">Document title<input aria-label="New document title" data-dialog-autofocus bind:value maxlength="300" disabled={working} onkeydown={event=>{if(event.key==='Enter'&&!event.isComposing&&event.keyCode!==229&&!event.repeat){event.preventDefault();void save();}}}/></label>
{#if error}<Notice tone="error" message={error}/>{/if}
<div class="button-row"><Button variant="secondary" onclick={onclose}>{working?'Close':'Cancel'}</Button><Button variant="primary" busy={working} disabled={!value.trim()||working} onclick={save}>Save title</Button></div>
