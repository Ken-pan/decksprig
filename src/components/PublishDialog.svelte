<script lang="ts">
 import {onMount,onDestroy} from 'svelte';
 import Dialog from './Dialog.svelte';
 import {Button,DialogFooter} from './ui';
 import {ChevronDown} from '@lucide/svelte';
 import Notice from './ui/Notice.svelte';
 import {api} from '../core/editor.svelte';
 import {isBrowserEdition} from '../core/runtime';
 import {publicationDocument} from '../core/publication';
 import type {Deck} from '../core/model';
 import type {WorkflowReceipt} from '../core/workflows';
 import type {PublishDraft} from '../../server/publishing';
 let {readDocument,onclose,oncomplete,onprepared,includeNotes=false,connectOnly=false}:{readDocument:()=>Promise<Deck>;onclose:()=>void;oncomplete?:(receipt:WorkflowReceipt)=>void;onprepared?:(receipt:WorkflowReceipt)=>void;includeNotes?:boolean;connectOnly?:boolean}=$props();
 let busy=$state(''),error=$state(''),token=$state(''),connection=$state<{configured:boolean;connected:boolean;source?:string}>({configured:false,connected:false}),draft=$state<PublishDraft>(),preview=$state(''),html=$state.raw<Blob>();
 let connectionOpen=$state(false);
 let previewFrame=$state<HTMLIFrameElement>();

 let disposed=false,timer:ReturnType<typeof setInterval>|undefined;
 onMount(()=>{connectionOpen=connectOnly;void status();if(!connectOnly)void prepare();});
 onDestroy(()=>{disposed=true;token='';if(timer)clearInterval(timer);});
 async function status(){if(isBrowserEdition)return;try{connection=await api('/api/publishing/connection');}catch(e:any){if(!disposed)error=e.message;}}
 async function connect(){if(busy)return;busy='Connecting…';error='';try{connection=await api('/api/publishing/connection','PUT',{token});token='';if(connectOnly&&connection.connected)oncomplete?.({message:'Netlify connection verified',provider:'netlify',state:'connected'});}catch(e:any){error=e.message;}finally{busy='';}}
 async function prepare(){if(busy)return;busy='Preparing website…';error='';try{const deck=publicationDocument(await readDocument(),includeNotes);html=await (await import('../core/export')).buildHtml(deck);if(disposed)return;preview='/publication-preview.html';if(!isBrowserEdition)draft=await api('/api/publishing/prepare','POST',{deckId:deck.id,revision:deck.revision,html:await html.text()});if(draft)onprepared?.({message:'Website preview ready',artifactId:draft.id,provider:'netlify',state:'prepared'});}catch(e:any){if(!disposed)error=e.message;}finally{if(!disposed)busy='';}}
 function downloadPackage(){if(!html)return;const url=URL.createObjectURL(html),link=document.createElement('a');link.href=url;link.download='presentation.html';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function check(){if(!draft)return;try{const latest=await api(`/api/publishing/${draft.id}`);if(disposed)return;draft=latest;if(latest.state==='published'){if(timer)clearInterval(timer);timer=undefined;busy='';oncomplete?.({message:'Presentation website published',url:latest.url,artifactId:latest.id,provider:'netlify',state:'published'});}else if(['failed','unknown'].includes(latest.state)){if(timer)clearInterval(timer);timer=undefined;busy='';error=latest.error||'The publication needs attention.';}}catch(e:any){if(!disposed){busy='';error=e.message;if(timer)clearInterval(timer);timer=undefined;}}}
 async function publish(){if(busy||!draft||!connection.connected)return;busy='Publishing website…';error='';try{draft=await api(`/api/publishing/${draft.id}/publish`,'POST',{confirmation:{deckId:draft.deckId,revision:draft.revision,sha256:draft.sha256}});if(disposed)return;if(draft!.state==='published'){busy='';oncomplete?.({message:'Presentation website published',url:draft!.url,artifactId:draft!.id,provider:'netlify',state:'published'});}else{let pending=false;timer=setInterval(async()=>{if(pending)return;pending=true;try{await check();}finally{pending=false;}},2000);}}catch(e:any){if(!disposed){error=e.message;busy='';if(draft)void check();}}}
</script>
<svelte:window onmessage={event=>{
 if(event.source!==previewFrame?.contentWindow)return;
 if(event.data==='deck-studio-preview-escape')onclose();
 else if(event.data==='deck-studio-preview-ready'&&html){const frame=previewFrame,output=html;void output.text().then(content=>{if(!disposed&&frame===previewFrame&&html===output)frame?.contentWindow?.postMessage({type:'deck-studio-preview-render',html:content},'*');});}
}}/>
<Dialog class="ui-control-surface ui-property-surface" title={connectOnly?'Connect Netlify':'Publish presentation website'} wide onclose={onclose}>
 <p class="dialog-intro">{connectOnly?'Connect Netlify to publish your presentation.':'Publishing makes this website public.'}</p>
 {#if !connectOnly}
  {#if preview}<iframe bind:this={previewFrame} class="website-preview" title="Website preview" src={preview} sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>{:else if !error}<Notice tone="progress" message={busy||'Preparing preview…'}/>{/if}
  <p class="hint">Visible slides only · {includeNotes?'Speaker notes included':'Speaker notes excluded'}{draft?` · ${(draft.bytes/1024/1024).toFixed(1)} MB`:''}</p>
 {/if}
 {#if isBrowserEdition}<Notice tone="info" message="Download HTML to publish with your hosting provider."/>
 {:else if !connection.connected}<details bind:open={connectionOpen} class="hosting-connection ui-control-disclosure"><summary><span>Connect Netlify</span><ChevronDown size={14}/></summary><form onsubmit={event=>{event.preventDefault();void connect();}}><label class="field-label">Netlify access token<input class="ui-property-input" type="password" aria-label="Netlify access token" bind:value={token} autocomplete="off" disabled={Boolean(busy)}/></label><p class="hint">Used for this session only.</p><Button variant="secondary" type="submit" disabled={!token.trim()||Boolean(busy)}>Connect</Button></form><a href="https://app.netlify.com/user/applications" target="_blank" rel="noopener noreferrer">Netlify access tokens</a></details>
 {:else}<p class="hint">Netlify connected.</p>{/if}
 {#if draft?.state==='published'&&draft.url}<Notice tone="success" title="Website published" message="The public website is ready."/><a href={draft.url} target="_blank" rel="noopener noreferrer">{draft.url}</a>{/if}
 {#if busy&&(connectOnly||preview)}<Notice tone="progress" message={busy}/>{/if}
 {#if error}<Notice tone="error" title="Website action failed" message={error}/>{/if}
 {#snippet footer()}<DialogFooter>{#snippet actions()}<Button onclick={onclose}>Close</Button>{#if !connectOnly}<Button disabled={!html||Boolean(busy)} onclick={downloadPackage}>Download HTML</Button>{#if !isBrowserEdition}<Button variant="primary" busy={Boolean(busy)} disabled={!draft||!connection.connected||['published','unknown','creating','uploading'].includes(draft.state)} onclick={publish}>Publish</Button>{/if}{/if}{/snippet}</DialogFooter>{/snippet}
</Dialog>
<style>.website-preview{width:100%;height:clamp(200px,36vh,430px);border:1px solid var(--border);border-radius:var(--r-sm);background:var(--surface)}.hosting-connection{display:flex;flex-direction:column;gap:12px}.hosting-connection summary{cursor:pointer;padding:8px 0}.hosting-connection :global(.field-label){margin-top:12px}.hosting-connection a{font-size:var(--ui-label);display:block;padding-top:8px}@media(max-width:760px){.website-preview{height:220px}}</style>
