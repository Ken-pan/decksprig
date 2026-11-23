<script lang="ts">
 import {onMount} from 'svelte';
 import {Button} from './ui';
 import Notice from './ui/Notice.svelte';
 import {isBrowserEdition} from '../core/runtime';
 let active=$state('');
 let busy=$state(false),error=$state(''),message=$state(''),status=$state<any>();
 const size=(value:number)=>value>=1000000?`${(value/1000000).toFixed(1)} MB`:`${Math.round(value/1000)} KB`;
 async function run(operation:'status'|'migrate'|'rollback'){
  if(busy)return;busy=true;active=operation;error='';message='';
  try{
   const {readStorageInBackground}=await import('../core/storage-reader');
   const browser=await readStorageInBackground('maintenance',{operation});
   let local;
   if(!isBrowserEdition){const response=await fetch('/api/storage',{method:operation==='status'?'GET':'POST',headers:operation==='status'?{}:{'Content-Type':'application/json'},body:operation==='status'?undefined:JSON.stringify({operation})});local=await response.json();if(!response.ok)throw new Error(local.error||'Could not update local storage.');}
   status={browser,local};
   const failures=[...(browser.results??[]).flatMap((r:any)=>r.errors??[]),...(local?.errors??[])];
   if(failures.length)throw new Error(`${failures.length} records could not be converted. Their original data is retained. Retry after checking the storage report.`);
   if(operation!=='status')message=operation==='migrate'?'Storage optimized. Your original media is preserved.':'Compatible storage restored. Your latest edits are retained.';
  }catch(e){error=(e as Error).message;}finally{busy=false;}
 }
 onMount(()=>{void run('status');});
</script>
<h3>Document storage</h3>
<section class="settings-section" aria-label="Storage status">
 <p>Share embedded images across documents, versions and recovery drafts.</p>
 {#if status}<dl><dt>This browser · {status.browser.mode==='compact'?'Optimized':'Compatible'}</dt><dd>{size(status.browser.originBytes??status.browser.mediaBytes+status.browser.backupBytes)} stored · {status.browser.assets} retained {status.browser.assets===1?'image':'images'}</dd>{#if status.local}<dt>Local library and history · {status.local.mode==='compact'?'Optimized':'Compatible'}</dt><dd>{size(status.local.activeBytes)} active · {size(status.local.backupBytes)} rollback snapshots</dd>{/if}</dl>{/if}
 <p class="hint">Restoring compatible storage keeps your latest edits. Verified backups remain available.</p>
 <div class="settings-actions"><Button busy={busy&&active==='migrate'} disabled={busy} onclick={()=>run('migrate')}>Optimize storage</Button><Button busy={busy&&active==='rollback'} disabled={busy} onclick={()=>run('rollback')}>Restore compatible storage</Button></div>
 {#if busy}<p role="status">Updating storage…</p>{/if}
 {#if message}<Notice {message}/>{/if}
 {#if error}<Notice tone="error" message={error}/>{/if}
</section>
