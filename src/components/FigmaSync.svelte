<script lang="ts">
  import {BRAND_NAME} from '../brand-name.js';
  import {onDestroy,onMount,untrack,tick} from 'svelte';
  import Dialog from './Dialog.svelte';
  import {Button} from './ui';
  import {editor} from '../core/editor.svelte';
  import {isBrowserEdition} from '../core/runtime';
  import {createSyncMedia} from '../core/figma-sync-media';
  import {figmaTransfer} from '../core/figma-transfer';
  import {importFigma} from '../importers/figma';
  import {unreadableDeckObjectMotionNodes} from '../core/figma-object-motion';
  import {mergeFigmaDeck,projectFigmaChanges,refreshFigmaTextRendering,isFigmaNumberingRefresh,type FigmaConflict} from '../core/figma-sync';
  import {recoverFigmaDeck,projectFigmaCheckpoint,figmaReconnectScope,figmaReadRetry,retryFigmaWrite,type FigmaCheckpoint,type FigmaScope} from '../core/figma-sync-recovery';
  import type {Deck} from '../core/model';
  import {readFigmaCheckpoint,saveFigmaCheckpoint} from '../core/figma-checkpoint-store';
  import {figmaSyncNotes} from '../core/figma-compatibility';
  import {figmaPairedStatus} from '../core/figma-sync-status';
  import {placeFigmaSyncStatus} from '../figma-sync-entry';
  import {ArrowLeftRight,ChevronDown,Copy,Check,Pause} from '@lucide/svelte';
  import {uiDisclosure} from '../ui-motion';
  import FigmaNativeMotionImport from './FigmaNativeMotionImport.svelte';
  let {open,onclose,onDocument}: {open:boolean;onclose:()=>void;onDocument?:(id:string)=>void}=$props();
  type Connection={id:string;code:string;token:string;media:ReturnType<typeof createSyncMedia>};
  let connection=$state<Connection>(),statusText=$state('Ready to connect'),error=$state(''),working=$state(false),paired=$state(false),conflicts=$state<FigmaConflict[]>([]),warnings=$state<string[]>([]);
  let reconnect=$state(false),checkpoint=$state.raw<FigmaCheckpoint>(),reconnectScope:FigmaScope|undefined;
  let connectedId='',direction='deck',commandSeq=0,nativeSeq=0,lastSeen=0,ack=0,timer:ReturnType<typeof setTimeout>|undefined,inFlight=false,generation=0,waitingForPlugin=false;
  let sent:Deck|undefined,nativeBase:Deck|undefined,remoteProjection:Deck|undefined,mergeBase:Deck|undefined;
  let lastSentSignature=$state('');
  let lastRemote=$state<Deck>();
  let checkpointLoading=$state(false),checkpointNote=$state(''),copied=$state(false),codeField=$state<HTMLInputElement>();
  let pendingDirection=$state<'deck'|'figma'|'resume'>();
  let connectionPanel=$state<HTMLDivElement>(),connectionControls=$state<HTMLDivElement>();
  const canResume=$derived(Boolean(checkpoint&&checkpoint.deck.id===editor.deck?.id));
  let quickOpen=$state(false);
  const showing=$derived(open||quickOpen);
  const ownsConnection=$derived(Boolean(connection&&connectedId===editor.deck?.id));
  function close(){quickOpen=false;onclose();}
  $effect(()=>{
    const id=editor.deck?.id,current=connection;
    untrack(()=>{if(checkpoint?.deck.id!==id)checkpoint=undefined;});
    if(!id||isBrowserEdition||current){checkpointLoading=false;return;}let active=true;checkpointLoading=true;
    void readFigmaCheckpoint(id).then(saved=>{if(active&&!connection&&editor.deck?.id===id&&!checkpoint)checkpoint=saved;}).catch(()=>{if(active)checkpointNote='Saved reconnect is unavailable in this browser. You can still start a new connection.';}).finally(()=>{if(active)checkpointLoading=false;});
    return()=>{active=false;};
  });
  async function rememberCheckpoint(value:FigmaCheckpoint){
    checkpoint=value;try{await saveFigmaCheckpoint(value);checkpointNote='';}catch{checkpointNote='Sync is active. Reconnect after a reload is unavailable because browser storage could not save the connection.';}
  }
  async function copyCode(){const current=connection;if(!current)return;try{await navigator.clipboard.writeText(current.code);if(connection===current)copied=true;}catch{codeField?.focus();codeField?.select();}}
  $effect(()=>{if(!copied)return;const timeout=setTimeout(()=>copied=false,2000);return()=>clearTimeout(timeout);});
  let serverRevision:number|undefined,readWait:AbortController|undefined,sending:Promise<void>|undefined,wakePending=false;
  const signature=(d:Deck)=>JSON.stringify(d,(key,value)=>['revision','updatedAt','source','provenance','nativeTextLayout'].includes(key)?undefined:value);
  const connectionState=$derived(paired&&statusText==='Connected · Changes sync automatically'&&editor.deck&&signature(editor.deck)!==lastSentSignature?'Changes waiting to sync':statusText);
  const syncPaused=$derived(Boolean(reconnect||error||conflicts.length));
  const synced=$derived(paired&&!syncPaused&&connectionState==='Connected · Changes sync automatically');
  const summary=$derived(!connection?'Reconnect Figma':conflicts.length?'Figma · Review changes':reconnect||error?'Figma · Needs attention':!paired?'Figma · Connect':connectionState==='Connected · Changes sync automatically'?'Figma · Synced':'Figma · Syncing');
  const entryDescription=$derived(!connection?'Reconnect Figma':conflicts.length?'Review Figma changes':reconnect||error?'Figma needs attention':!paired?'Connect to Figma':synced?'Figma synced':'Syncing with Figma');
  async function request(path:string,method='GET',body?:unknown,session=connection,media=session?.media??createSyncMedia(),signal?:AbortSignal,keepalive=false){
    const encoded=body===undefined?undefined:media.encode(body).packet;
    const response=await fetch('/api/figma-sync'+path,{method,headers:{'Content-Type':'application/json',...(session?{Authorization:`Bearer ${session.token}`}:{})},body:encoded===undefined?undefined:JSON.stringify(encoded),keepalive,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)}),raw=await response.json(),result=media.decode(raw);if(!response.ok)throw Object.assign(new Error(result.error||'The Figma connection could not complete.'),{status:response.status});if(encoded)media.accept(encoded);return result;
  }
  async function disconnect(keepalive=false){
    const restoreConnectionFocus=showing&&connectionControls?.contains(document.activeElement);
    generation++;copied=false;pendingDirection=undefined;clearTimeout(timer);readWait?.abort();readWait=undefined;sending=undefined;serverRevision=undefined;wakePending=false;const current=connection;connection=undefined;paired=false;conflicts=[];working=false;inFlight=false;waitingForPlugin=false;reconnect=false;error='';statusText='Disconnected. Both documents are preserved.';
    if(restoreConnectionFocus)void tick().then(()=>{if(showing&&!connection&&!working)connectionPanel?.closest('dialog')?.querySelector<HTMLElement>('h2')?.focus({preventScroll:true});});
    if(current)try{await request(`/${current.id}/editor`,'DELETE',undefined,current,current.media,undefined,keepalive);}catch{/* The expiring server capability is never saved. */}
  }
  function focusPairedControls(next:boolean){
    if(next&&!paired&&showing&&(document.activeElement===codeField||connectionPanel?.querySelector('.copy-code')?.contains(document.activeElement)))connectionControls?.querySelector('button')?.focus({preventScroll:true});
  }
  onMount(()=>{const close=()=>{void disconnect(true);};window.addEventListener('pagehide',close);return()=>window.removeEventListener('pagehide',close);});
  onDestroy(()=>{void disconnect();});
  async function start(value:'deck'|'figma'|'resume'){
    if(!editor.deck||working)return;
    const base=value==='resume'&&canResume?checkpoint:undefined,targetId=editor.deck.id,focusOrigin=document.activeElement;
    const closing=disconnect(),version=generation;working=true;pendingDirection=value;await closing;if(version!==generation)return;error='';direction=value;lastRemote=remoteProjection=undefined;warnings=[];reconnectScope=undefined;
    try{
      if(value==='resume'){if(!base)throw new Error('Choose a direction to connect again. Both versions are preserved.');reconnectScope=figmaReconnectScope(base);}else checkpoint=undefined;
      await editor.flush();const d=await editor.readDocument(),transfer=value==='deck'?await figmaTransfer(d):{deck:d,assets:{}};
      if(version!==generation||editor.deck?.id!==targetId)return;
      const media=createSyncMedia(),created=await request('/start','POST',{...transfer,direction:value==='resume'?'figma':value,...(reconnectScope?{scope:reconnectScope}:{})},undefined,media),current={...created,media};
      if(version!==generation||editor.deck?.id!==targetId){try{await request(`/${current.id}/editor`,'DELETE',undefined,current);}catch{}return;}
      connection=current;connectedId=d.id;sent=value==='deck'?d:undefined;commandSeq=value==='deck'?1:0;lastSentSignature=value==='deck'?signature(d):'';ack=nativeSeq=lastSeen=0;nativeBase=undefined;conflicts=[];statusText='Waiting for the Figma plugin';void tick().then(()=>{if(version===generation&&connection?.id===current.id&&showing&&(document.activeElement===focusOrigin||document.activeElement===document.body))codeField?.focus({preventScroll:true});});void poll();
    }catch(e){if(version===generation)error=(e as Error).message;}finally{if(version===generation){working=false;pendingDirection=undefined;}}
  }
  function schedule(delay=serverRevision===undefined?1400:0){clearTimeout(timer);if(connection)timer=setTimeout(poll,delay);}
  $effect(()=>{
    if(!connection||!paired||error||reconnect||conflicts.length||editor.editingId||editor.croppingId||editor.pending||!editor.deck||signature(editor.deck)===lastSentSignature)return;
    const wake=setTimeout(()=>{wakePending=true;if(readWait)readWait.abort();else if(!inFlight)schedule(0);},80);
    return()=>clearTimeout(wake);
  });
  async function sendCurrent(){
    if(sending)return sending;
    readWait?.abort();const pending=sendDocument();sending=pending;
    try{await pending;}finally{if(sending===pending)sending=undefined;}
  }
  async function sendDocument(){
    if(!connection||!editor.deck)return;const current=connection,version=generation,d=await editor.readDocument(),transfer=await figmaTransfer(d,ack===commandSeq?sent:checkpoint?.deck);if(version!==generation||connection!==current||editor.deck?.id!==connectedId)return;
    const payload={seq:commandSeq+1,seen:nativeSeq,deck:d,assets:transfer.assets,...(remoteProjection?{baseDeck:remoteProjection}:{})};
    try{await retryFigmaWrite(()=>request(`/${current.id}/editor`,'POST',payload,current),()=>version===generation&&connection===current&&editor.deck?.id===connectedId);}catch(e){if(version===generation&&figmaReadRetry(e)&&(e as {status?:number}).status!==409)reconnect=true;throw e;}
    if(version!==generation||connection!==current)return;
    commandSeq++;lastSeen=nativeSeq;sent=d;remoteProjection=undefined;nativeBase=undefined;lastSentSignature=signature(d);statusText='Sending changes to Figma';
  }
  async function poll(){
    if(!connection||inFlight)return;
    if(sending||editor.editingId||editor.croppingId||editor.pending){schedule(120);return;}
    inFlight=true;wakePending=false;const version=generation,current=connection,controller=new AbortController();let reading=true,delay:number|undefined;
    try{
      if(editor.deck?.id!==connectedId){await disconnect();return;}
      readWait=controller;
      const localChange=paired&&editor.deck&&signature(editor.deck)!==lastSentSignature;
      const result=await request(`/${current.id}/editor?after=${nativeSeq}${serverRevision===undefined?'':`&since=${serverRevision}&wait=${localChange?0:20000}`}`,'GET',undefined,current,current.media,controller.signal);if(version!==generation||connection!==current)return;
      if(editor.deck?.id!==connectedId){await disconnect();return;}
      readWait=undefined;serverRevision=result.revision;reading=false;focusPairedControls(result.paired);paired=result.paired;
      if(result.reconnect||result.commandSeq>commandSeq){reconnect=true;statusText='Reconnect Figma to reconcile both versions';return;}
      if(result.error){waitingForPlugin=true;throw new Error(result.error);}
      if(waitingForPlugin){waitingForPlugin=false;error='';}
      if(editor.editingId||editor.croppingId||editor.pending){statusText='Waiting for the current edit to finish';return;}
      const native=result.native;
      if(native&&native.seq>nativeSeq){
        const remote=importFigma(native.bundle),unreadableMotion=unreadableDeckObjectMotionNodes(native.bundle);warnings=figmaSyncNotes(native.warnings??[],remote.slides);lastRemote=remote;
        if(direction==='resume'&&checkpoint){
          const recovered=recoverFigmaDeck(checkpoint,editor.deck!,remote,native.bundle.scopeIds,unreadableMotion);sent=mergeBase=checkpoint.deck;nativeBase=checkpoint.native;remoteProjection=recovered.projection;direction='deck';conflicts=recovered.conflicts;
          if(recovered.deck&&signature(recovered.deck)!==signature(editor.deck!))editor.replace(recovered.deck,!isFigmaNumberingRefresh(editor.deck!,recovered.deck));
          if(conflicts.length){nativeSeq=native.seq;statusText='Sync paused · Both sides changed the same content';return;}
        }else if(direction==='figma'&&!sent){
          // Import into a new local document; the previously open document survives.
          const prepared=await (await import('../importers/figma-fonts')).prepareFigmaFonts(remote);if(version!==generation||connection!==current||editor.deck?.id!==connectedId)return;
          await editor.create(prepared);if(version!==generation||connection!==current)return;connectedId=editor.deck!.id;onDocument?.(connectedId);sent=editor.deck!;nativeBase=remote;await rememberCheckpoint({deck:sent,native:remote});if(version!==generation||connection!==current)return;lastSentSignature='';direction='deck';
        }else if(checkpoint&&native.ack<commandSeq){
          const merge=projectFigmaCheckpoint(checkpoint,editor.deck!,remote,unreadableMotion);mergeBase=checkpoint.deck;remoteProjection=merge.projection;conflicts=merge.conflicts;
          if(conflicts.length){nativeSeq=native.seq;statusText='Sync paused · Both sides changed the same content';return;}
          if(merge.deck&&signature(merge.deck)!==signature(editor.deck!))editor.replace(merge.deck,!isFigmaNumberingRefresh(editor.deck!,merge.deck));
        }else if(native.ack===commandSeq&&sent){
          if(!nativeBase||native.ack!==ack){nativeBase=remote;ack=native.ack;await rememberCheckpoint({deck:refreshFigmaTextRendering(sent,sent,remote),native:remote});if(version!==generation||connection!==current)return;const accepted=refreshFigmaTextRendering(editor.deck!,sent,remote);if(accepted!==editor.deck)editor.replace(accepted,false);}
          else{
            remoteProjection=projectFigmaChanges(sent,nativeBase,remote,unreadableMotion);mergeBase=sent;const merge=mergeFigmaDeck(sent,editor.deck!,remoteProjection);conflicts=merge.conflicts;
            if(conflicts.length){nativeSeq=native.seq;statusText='Sync paused · Both sides changed the same content';return;}
            if(merge.deck&&signature(merge.deck)!==signature(editor.deck!)){const metadata=isFigmaNumberingRefresh(editor.deck!,merge.deck);editor.replace(merge.deck,!metadata);if(!metadata)editor.notify('Figma changes synced. Undo is available.');}
          }
        }
        nativeSeq=native.seq;
      }
      if(!editor.deck)return;
      if(conflicts.length){statusText='Sync paused · Both sides changed the same content';return;}
      if(paired&&result.pluginOnline===false){reconnect=true;statusText='Waiting for Figma · Changes are kept locally';return;}
      reconnect=false;
      if(result.pluginPaused){statusText='Waiting for Figma to resume';return;}
      // A native edit must be acknowledged before the plugin accepts a command.
      if(paired&&native&&(native.ack===commandSeq||native.seq>lastSeen)&&(!sent||signature(editor.deck)!==lastSentSignature||native.ack!==commandSeq||native.seq>lastSeen&&!native.applied))await sendCurrent();
      else if(paired)statusText=figmaPairedStatus(native,nativeSeq,ack,commandSeq);
    }catch(e){if(version===generation&&connection===current&&!controller.signal.aborted){delay=1400;if((e as {status?:number}).status===401||direction==='resume')reconnect=true;if(!reconnect&&((reading&&figmaReadRetry(e))||(e as {status?:number}).status===409))statusText='Connection interrupted · Changes are kept locally';else{error=(e as Error).message;statusText=reconnect?'Reconnect Figma to reconcile both versions':'Sync paused';}}}
    finally{if(version===generation&&connection===current){if(readWait===controller)readWait=undefined;inFlight=false;if(!error||waitingForPlugin)schedule(wakePending?0:delay);}}
  }
  async function retry(){
    if(!connection)return;const current=connection,version=generation;
    try{
      // Replace a rejected command with the user's correction before resuming
      // the plugin. A newer native version must be read and merged first.
      if(sent&&editor.deck&&signature(editor.deck)!==lastSentSignature)try{await sendCurrent();}catch(e){if((e as {status?:number}).status!==409)throw e;}
      if(version!==generation||connection!==current)return;
      await request(`/${current.id}/editor`,'POST',{retry:true},current);if(version!==generation||connection!==current)return;error='';void poll();
    }catch(e){if(version===generation)error=(e as Error).message;}
  }
  async function resolve(choice:'local'|'remote'){
    if(!sent||!remoteProjection||!editor.deck)return;
    const result=mergeFigmaDeck(mergeBase??sent,editor.deck,remoteProjection,choice);if(!result.deck)return;
    editor.replace(result.deck);conflicts=[];error='';const version=generation;try{await sendCurrent();if(version===generation)schedule();}catch(e){if(version===generation)error=(e as Error).message;}
  }
  async function downloadRemote(){if(lastRemote)await (await import('../core/document-export-download')).downloadDocument(lastRemote,'json',false);}
</script>

{#if ownsConnection||canResume}
  <div class="figma-sync-entry" hidden use:placeFigmaSyncStatus><Button class="figma-status-trigger" variant="quiet" title={entryDescription} data-tooltip={entryDescription} aria-label={`${summary} · Open connection`} aria-haspopup="dialog" aria-expanded={showing} onclick={()=>quickOpen=true}>{#if syncPaused}<Pause size={16} aria-hidden="true"/>{:else if synced}<Check size={16} aria-hidden="true"/>{:else}<ArrowLeftRight size={16} aria-hidden="true"/>{/if}<span class="figma-status-label">Figma</span></Button></div>
{/if}
{#if showing}
  <Dialog title="Figma Slides" onclose={close} class="figma-sync-dialog">
    <div class="figma-sync ui-property-surface" bind:this={connectionPanel}>
      {#if isBrowserEdition}<p>Live sync is available in the local Mac edition.</p>
      {:else if !connection}
        <div class="connection-intro">
          <span class="connection-icon" aria-hidden="true"><ArrowLeftRight size={20}/></span>
          <div><h3>{canResume?'Ready to reconnect':'Connect your slides'}</h3><p>Changes sync while both editors are open.</p></div>
        </div>
        <div class="choices">
          <Button variant="primary" busy={working&&pendingDirection===(canResume?'resume':'deck')} disabled={working&&pendingDirection!==(canResume?'resume':'deck')||!editor.deck||checkpointLoading} onclick={()=>start(canResume?'resume':'deck')}>{canResume?'Reconnect Figma':'Send to Figma'}</Button>
          {#if !canResume}<Button busy={working&&pendingDirection==='figma'} disabled={working&&pendingDirection!=='figma'||!editor.deck||checkpointLoading} onclick={()=>start('figma')}>Import from Figma</Button>{/if}
        </div>
      {:else}
        <div class="connection-intro" data-state={syncPaused?'attention':synced?'connected':'waiting'}>
          <span class="connection-icon" aria-hidden="true">{#if syncPaused}<Pause size={20}/>{:else if synced}<Check size={20}/>{:else}<ArrowLeftRight size={20}/>{/if}</span>
          <div><h3>{syncPaused?'Sync needs attention':!paired?'Finish in Figma':synced?'Connected':'Syncing changes'}</h3><p>{!paired?`Open the ${BRAND_NAME} plugin and paste this code.`:'Keep both editors and the plugin open.'}</p></div>
        </div>
        {#if !paired}
          <div class="pairing"><label for="figma-connection-code">Connection code</label><div class="code-row"><input bind:this={codeField} id="figma-connection-code" readonly value={connection.code} onclick={event=>event.currentTarget.select()} aria-label="Figma connection code"/><Button variant="primary" class="copy-code" onclick={copyCode}>{#if copied}<Check size={16} aria-hidden="true"/>{:else}<Copy size={16} aria-hidden="true"/>{/if}{copied?'Copied':'Copy code'}</Button></div></div>
        {/if}
        <div class="sync-status" bind:this={connectionControls}><p class="connection-state" role="status">{synced?'Changes sync automatically.':connectionState}</p><Button size="sm" onclick={()=>disconnect()}>Disconnect</Button></div>
        {#if reconnect}<Button variant="primary" busy={working} onclick={()=>canResume?start('resume'):disconnect()}>{canResume?'Reconnect Figma':'Connect again'}</Button>{/if}
        {#if conflicts.length}
          <p>{conflicts.length} {conflicts.length===1?'property needs':'properties need'} a choice. Independent changes have been kept.</p>
          <details use:uiDisclosure class="sync-detail"><summary><span>View conflicts</span><ChevronDown size={14} aria-hidden="true"/></summary><ul>{#each conflicts.slice(0,6) as conflict}<li>{conflict.path.split('.').at(-1)}</li>{/each}</ul></details>
          <div class="choices"><Button variant="secondary" onclick={()=>resolve('local')}>Keep Deck Studio changes</Button><Button variant="secondary" onclick={()=>resolve('remote')}>Keep Figma changes</Button><Button onclick={downloadRemote}>Download Figma copy</Button></div>
        {/if}
      {/if}
      {#if checkpointLoading&&!connection}<p role="status">Checking the saved Figma connection…</p>{/if}
      {#if checkpointNote}<p>{checkpointNote}</p>{/if}
      {#if error}<p role="alert">{error}</p>{#if connection&&!reconnect}<Button onclick={retry}>Retry sync</Button>{/if}{#if lastRemote}<Button onclick={downloadRemote}>Download Figma copy</Button>{/if}{/if}
      {#if warnings.length}<details use:uiDisclosure class="sync-detail compatibility"><summary><span>{warnings.length} compatibility {warnings.length===1?'note':'notes'}</span><ChevronDown size={14} aria-hidden="true"/></summary>{#each warnings as warning}<p>{warning}</p>{/each}</details>{/if}
      <details use:uiDisclosure class="sync-options">
        <summary>More options<ChevronDown size={16} aria-hidden="true"/></summary>
        <div class="options-content">
          {#if !isBrowserEdition&&canResume&&!connection}
            <div class="option-group"><h3>Start a new connection</h3><div class="new-connection"><Button variant="secondary" busy={working&&pendingDirection==='deck'} disabled={working&&pendingDirection!=='deck'||!editor.deck||checkpointLoading} onclick={()=>start('deck')}>Send to Figma</Button><Button variant="secondary" busy={working&&pendingDirection==='figma'} disabled={working&&pendingDirection!=='figma'||!editor.deck||checkpointLoading} onclick={()=>start('figma')}>Import from Figma</Button></div></div>
          {/if}
          <details use:uiDisclosure class="sync-detail"><summary><span>Plugin setup</span><ChevronDown size={14} aria-hidden="true"/></summary><p>In Figma, import the development plugin using <code>plugins/figma-export/manifest.json</code> from your local Deck Studio folder. Open it and paste the connection code.</p><p>Keep both editors and the plugin open. Each code works once, until the connection closes.</p></details>
          <details use:uiDisclosure class="sync-detail"><summary><span>Transfer a file</span><ChevronDown size={14} aria-hidden="true"/></summary><p>Export “Figma Slides” here, then choose “Open Deck file” in the plugin. To return, export a Deck file from the plugin and import it here.</p><p>Text, basic shapes, images and skipped slides are supported. Complex layers may use images. Keep the source to compare motion and interactive elements. Speaker notes stay in Deck Studio; native presenter notes depend on Figma support.</p></details>
          {#if !isBrowserEdition}<details use:uiDisclosure class="sync-detail"><summary><span>Import motion from a Figma backup</span><ChevronDown size={14} aria-hidden="true"/></summary><FigmaNativeMotionImport/></details>{/if}
        </div>
      </details>
    </div>
  </Dialog>
{/if}
<style>
 .figma-sync-entry{display:flex;align-items:center;flex:none;min-width:0}
 .figma-sync-entry:global([hidden]){display:none}
 .figma-sync-entry :global(.figma-status-trigger){gap:6px;padding-inline:8px}
 .figma-sync-entry:global([data-compact='true']) .figma-status-label{display:none}
 .figma-sync-entry:global([data-compact='true']) :global(.figma-status-trigger){width:var(--control-md);padding-inline:0;gap:0}
 @media(max-width:760px){.figma-sync-entry{display:none}}

  :global(.modal.figma-sync-dialog){width:min(440px,calc(100vw - 24px))}
  .figma-sync{display:flex;flex-direction:column;gap:20px;min-width:0}
  .figma-sync p{margin:0;color:var(--text-secondary);line-height:var(--ui-line-reading)}
  .connection-intro{display:flex;align-items:center;gap:12px}.connection-intro>div{min-width:0}
  .connection-icon{display:grid;place-items:center;flex:none;width:40px;height:40px;border-radius:var(--r-control);background:var(--surface-sunken);color:var(--text-secondary)}
  .figma-sync h3{margin:0 0 4px;font-size:var(--ui-body);font-weight:var(--ui-weight-semibold);color:var(--text-primary)}
  .choices{display:flex;flex-direction:column;gap:8px}
  .pairing{display:flex;flex-direction:column;gap:12px}
  .code-row{display:flex;gap:8px;align-items:stretch}
  .code-row :global(button){flex:none;min-inline-size:9em}
  input{width:100%;min-width:0;padding:12px;border:1px solid var(--border);border-radius:var(--r-control);background:var(--surface);color:var(--text-primary);font:inherit;font-variant-numeric:tabular-nums;letter-spacing:.06em}
  .sync-status{display:flex;align-items:center;justify-content:space-between;gap:12px}
  .sync-status .connection-state{font-size:var(--ui-label);color:var(--text-secondary)}
  .sync-status :global(button){flex:none}
  .sync-options{border-top:1px solid var(--border-subtle);padding-top:8px}
  .sync-options>summary{border-radius:var(--r-control);padding:8px;display:flex;align-items:center;justify-content:space-between;gap:8px;list-style:none;min-height:44px;cursor:pointer;color:var(--text-secondary)}
  .sync-options>summary::-webkit-details-marker{display:none}
  .sync-options>summary:global([aria-expanded="true"]) :global(svg),.sync-detail>summary:global([aria-expanded="true"]) :global(svg){transform:rotate(180deg)}
  .figma-sync summary :global(svg){flex:none;transition:transform var(--ui-motion-reveal) var(--ui-ease-out)}
  .options-content{display:flex;flex-direction:column;gap:8px;padding-top:8px}
  .option-group{padding-bottom:12px}
  .option-group h3{margin-bottom:12px}
  .new-connection{display:flex;flex-wrap:wrap;gap:8px}
  .new-connection :global(button){flex:1}
  .sync-detail>summary{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;padding:10px 8px;border-radius:var(--r-control);list-style:none;cursor:pointer;color:var(--text-secondary)}
  .sync-detail>summary::-webkit-details-marker{display:none}
  .sync-detail p{margin-top:12px}
  .sync-detail code{overflow-wrap:anywhere}
  ul{padding-left:20px;margin:8px 0}
  .connection-intro[data-state='connected'] .connection-icon{color:var(--success-text);background:var(--success-soft)}
  .connection-intro[data-state='attention'] .connection-icon{color:var(--warning-text);background:var(--warning-soft)}
  @media(hover:hover) and (pointer:fine){.figma-sync summary:hover{background:var(--state-hover);color:var(--text-primary)}}
  .figma-sync summary:active{background:var(--state-active)}
  .figma-sync summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  @media(prefers-reduced-motion:reduce){.figma-sync summary :global(svg){transition:none}}
  :global([data-ui-motion='reduced']) .figma-sync summary :global(svg){transition:none}
  @media(max-width:480px){.code-row{flex-wrap:wrap}.code-row :global(button){width:100%}.sync-status{align-items:flex-start;flex-wrap:wrap}}
</style>
