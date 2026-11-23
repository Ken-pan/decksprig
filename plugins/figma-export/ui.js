const BRAND_NAME = 'Decksprig'; // Build replaces this development default from src/brand-name.js.
const status=document.getElementById('status'),connect=document.getElementById('connect'),stop=document.getElementById('stop'),code=document.getElementById('code'),file=document.getElementById('file');
// Measure the intrinsic wrapper, not the body that Figma may stretch to its UI.
// ResizeObserver also follows disclosure animation, wrapped feedback and fonts.
if(typeof ResizeObserver!=='undefined'){
  const content=document.getElementById('plugin-content');
  let framePending=false,lastHeight=0;
  new ResizeObserver(()=>{
    if(framePending)return;framePending=true;
    requestAnimationFrame(()=>{
      framePending=false;const height=Math.ceil(content.getBoundingClientRect().height);
      if(height>0&&height!==lastHeight){lastHeight=height;parent.postMessage({pluginMessage:{type:'resize',height}},'*');}
    });
  }).observe(content);
}
// Presentation follows confirmed connection events; it never starts a sync itself.
function setUIState(state){document.body.dataset.syncState=state;connect.setAttribute('aria-busy',String(state==='connecting'));}
setUIState('idle');
const options=document.getElementById('options'),optionsContent=document.getElementById('options-content'),optionsSummary=document.getElementById('options-summary');
function optionsAvailable(open){optionsContent.inert=!open;optionsSummary.setAttribute('aria-expanded',String(open));if(!open&&optionsContent.contains(document.activeElement))optionsSummary.focus({preventScroll:true});}
optionsSummary.addEventListener('click',()=>optionsAvailable(!options.open));
options.addEventListener('toggle',()=>optionsAvailable(options.open));
optionsAvailable(options.open);
const endpoint='http://localhost:4310/api/figma-sync';
// Opening the plugin should put keyboard input in its connection form.
requestAnimationFrame(()=>{if(document.activeElement===document.body)code.focus({preventScroll:true});});
code.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing&&!connect.disabled){event.preventDefault();connect.click();}});
let media=DeckStudioPptx.createSyncMedia();
let session,format='json',signature,ack=0,seq=0,timer,heartbeat,busy=false,beatBusy=false,pendingCommand,lastCommand,generation=0,paused=false,pauseReason='',needsReconnect=false,lastRetry=0,serverRevision,readWait,nativeDirty=false,watching=false;
// A paired session owns its linked slides; the editable range then applies only to exports.
function updateRangeScope(){const linked=Boolean(session);document.getElementById('connection-scope-hint').hidden=linked;document.getElementById('range-label').textContent=linked?'Export slide range':'Slide range';document.getElementById('range-hint').textContent=linked?`For file exports only. Start a new connection in ${BRAND_NAME} to sync a different range.`:'Used for new connections and file exports. Reconnect keeps the linked slides.';}
updateRangeScope();
function send(message){if(message.type==='export'||message.type==='connect')message.range=document.getElementById('range').value;parent.postMessage({pluginMessage:{...message,requestId:generation}},'*');}
async function request(path,method='GET',body,current=session,codec=media,signal){const encoded=body===undefined?undefined:codec.encode(body).packet;const response=await fetch(endpoint+path,{method,headers:{'Content-Type':'application/json',...(current?{Authorization:'Bearer '+current.token}:{})},body:encoded===undefined?undefined:JSON.stringify(encoded),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)}),raw=await response.json(),data=codec.decode(raw);if(!response.ok)throw Object.assign(new Error(data.error||'The local connection could not complete.'),{status:response.status});if(encoded)codec.accept(encoded);return data;}
function disconnect(){const restoreCode=document.activeElement===stop||(document.activeElement===connect&&code.disabled);generation++;clearTimeout(timer);clearInterval(heartbeat);readWait?.abort();readWait=undefined;serverRevision=undefined;nativeDirty=watching=false;session=undefined;signature=undefined;ack=seq=0;pendingCommand=lastCommand=undefined;busy=beatBusy=paused=needsReconnect=false;pauseReason='';lastRetry=0;connect.disabled=false;connect.textContent='Connect';stop.style.display='none';code.disabled=false;updateRangeScope();setUIState('idle');if(restoreCode)code.focus({preventScroll:true});send({type:'disconnect'});}
function resume(){paused=false;pauseReason='';connect.disabled=true;connect.textContent='Connect';status.textContent='Retrying sync…';setUIState('syncing');next();}
async function beat(){if(!session||beatBusy)return;const current=session,version=generation;beatBusy=true;try{const result=await request('/'+current.id+'/plugin?heartbeat=1','POST',{paused,reconnect:needsReconnect,retry:lastRetry,...(pauseReason?{error:pauseReason}:{})},current);if(version!==generation||session!==current)return;if(result.retry>lastRetry){lastRetry=result.retry;if(paused&&!needsReconnect)resume();}}catch(error){if(version!==generation)return;if(error.status===401){disconnect();status.textContent=`Connection ended. Enter a new code from ${BRAND_NAME}.`;setUIState('attention');}else if(!paused){status.textContent='Connection interrupted. Changes are preserved.';setUIState('attention');}}finally{if(version===generation)beatBusy=false;}}
async function fail(error,uncertain=false){setUIState('attention');status.textContent=error.message||String(error);clearTimeout(timer);busy=false;if(!session){connect.disabled=false;return;}paused=true;pauseReason=status.textContent;needsReconnect=needsReconnect||uncertain||error.status===401;connect.disabled=needsReconnect;connect.textContent=needsReconnect?'Connect':'Retry sync';const current=session,version=generation;try{await request('/'+current.id+'/plugin','POST',{error:pauseReason,reconnect:needsReconnect,retry:lastRetry},current);}catch{}if(version===generation&&needsReconnect)status.textContent=`Reconnect from ${BRAND_NAME} to reconcile both versions.`;}
async function publish(bundle,warnings=[],applied=false,nextAck=ack){const current=session,version=generation,payload={seq:seq+1,ack:nextAck,bundle,warnings,applied};try{await request('/'+current.id+'/plugin','POST',payload,current);}catch(error){if(version!==generation||session!==current)return false;if(!(error instanceof TypeError||['AbortError','TimeoutError'].includes(error.name)||error.status>=500))throw error;await request('/'+current.id+'/plugin','POST',payload,current);}if(version!==generation||session!==current)return false;seq++;ack=nextAck;return true;}
async function poll(){if(!session||busy||paused)return;const current=session,version=generation,controller=new AbortController();busy=true;try{readWait=controller;const after=Math.max(ack,pendingCommand?.seq??0),wait=serverRevision===undefined?'':'&since='+serverRevision+'&wait='+(nativeDirty?0:watching?20000:1600);const result=await request('/'+current.id+'/plugin?after='+after+wait,'GET',undefined,current,media,controller.signal);if(version!==generation||session!==current)return;readWait=undefined;serverRevision=result.revision;pendingCommand=result.command??(pendingCommand?.seq>ack?pendingCommand:undefined);nativeDirty=false;send({type:'snapshot',signature});}catch(error){if(version!==generation)return;if(controller.signal.aborted){next(0);return;}if(error.status===401){disconnect();status.textContent=`Connection ended. Enter a new code from ${BRAND_NAME}.`;setUIState('attention');}else if(error instanceof TypeError||['AbortError','TimeoutError'].includes(error.name)||error.status>=500){status.textContent='Connection interrupted. Retrying…';setUIState('attention');next(1600);}else await fail(error,true);}finally{if(readWait===controller)readWait=undefined;}}
function next(delay=0){busy=false;clearTimeout(timer);if(session&&!paused)timer=setTimeout(poll,nativeDirty?80:delay);}
connect.onclick=async()=>{if(session){if(paused&&!needsReconnect){const current=session,version=generation;try{const result=await request('/'+current.id+'/plugin','POST',{retry:true},current);if(version===generation){lastRetry=result.retry??lastRetry;resume();}}catch(error){if(version===generation)await fail(error,true);}}return;}if(!code.value.trim()){status.textContent='Paste a connection code to continue.';setUIState('attention');code.focus({preventScroll:true});return;}generation++;media=DeckStudioPptx.createSyncMedia();connect.disabled=true;busy=true;status.textContent='Reading this Figma file…';setUIState('connecting');send({type:'connect'});};
stop.onclick=async()=>{const current=session,codec=media;disconnect();const version=generation;if(current)try{await request('/'+current.id+'/plugin','DELETE',undefined,current,codec);}catch{}if(version===generation)status.textContent='Disconnected. Both documents are preserved.';};
document.getElementById('export').onclick=()=>{format='json';send({type:'export'});};
document.getElementById('pptx').onclick=()=>{format='pptx';send({type:'export'});};
document.getElementById('import').onclick=()=>file.click();
file.onchange=async()=>{const version=generation;try{const selected=file.files[0];if(!selected)return;if(selected.size>100000000)throw new Error('Choose a file smaller than 100 MB.');const raw=JSON.parse(await selected.text());status.textContent='Preparing native slides…';const prepared=await DeckStudioPptx.prepareFile(raw);if(version===generation)send({type:'apply',...prepared,seq:0});}catch(error){if(version===generation)await fail(error);}finally{file.value='';}};
onmessage=async event=>{const m=event.data.pluginMessage;if(!m||m.requestId!==undefined&&m.requestId!==generation)return;const version=generation;try{
  if(m.type==='native-change'){if(session&&!paused)setUIState('syncing');nativeDirty=true;if(readWait)readWait.abort();else if(!busy&&!paused)next(80);return;}
  if(m.type==='status'){if(busy&&!paused)status.textContent=m.text;return;}
  if(m.type==='error'){await fail(new Error(m.text),m.reconnect===true);return;}
  if(needsReconnect&&['snapshot','unchanged','changed-before-apply','applied'].includes(m.type))return;
  if(m.type==='connect-ready'){
    if(!m.fileKey)throw new Error('Save this Figma file before connecting.');const codec=media,paired=await request('/pair','POST',{code:code.value.trim(),fileKey:m.fileKey});if(version!==generation){try{await request('/'+paired.id+'/plugin','DELETE',undefined,paired,codec);}catch{}return;}const focusConnection=document.activeElement===code||document.activeElement===connect;session=paired;updateRangeScope();serverRevision=paired.revision;watching=m.watching===true;nativeDirty=false;code.value='';code.disabled=true;stop.style.display='block';if(focusConnection)stop.focus({preventScroll:true});setUIState('syncing');status.textContent=`Connecting to ${BRAND_NAME}…`;pendingCommand=session.command;signature=undefined;send({type:'snapshot',deck:pendingCommand?.deck,scope:session.scope});busy=true;heartbeat=setInterval(beat,5000);void beat();return;
  }
  if(m.type==='snapshot'){
    // Commit the fingerprint only after the server receives the native snapshot.
    if(!await publish(m.bundle))return;signature=m.signature;
    status.textContent=`Figma changes sent. Waiting for ${BRAND_NAME}…`;setUIState('syncing');next();return;
  }
  if(m.type==='unchanged'){
    if(pendingCommand&&pendingCommand.seq>ack&&pendingCommand.seen===seq){lastCommand=pendingCommand;setUIState('syncing');send({type:'apply',...pendingCommand,signature});return;}
    const waiting=pendingCommand&&pendingCommand.seq>ack;status.textContent=waiting?`Waiting for ${BRAND_NAME} to reconcile changes…`:'Changes sync automatically.';setUIState(waiting?'syncing':'connected');next();return;
  }
  if(m.type==='changed-before-apply'){signature=undefined;next();return;}
  if(m.type==='applied'){
    if(session){if(!await publish(m.bundle,m.warnings,true,m.ack))return;signature=m.signature;status.textContent=m.warnings?.length?m.warnings.join(' '):'Changes sync automatically.';setUIState('connected');next();}
    else {setUIState('idle');status.textContent=m.warnings?.length?m.warnings.join(' '):'Deck file opened. Text and supported objects are editable.';}return;
  }
  if(m.type==='download'){
    status.textContent=format==='pptx'?'Building PowerPoint…':'Preparing file…';const bytes=format==='pptx'?await DeckStudioPptx.fromBundle(JSON.parse(m.json)):m.json,blob=new Blob([bytes],{type:format==='pptx'?'application/vnd.openxmlformats-officedocument.presentationml.presentation':'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=format==='pptx'?m.filename.replace(/\.deck\.json$/i,'.pptx'):m.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);status.textContent='Download started. Compare the editable version with its source reference.';
  }
}catch(error){if(version===generation)await fail(error,error instanceof TypeError||['AbortError','TimeoutError'].includes(error.name)||Boolean(error.status));}};

async function prepareAssets(deck){const assets={};for(const slide of deck.slides)for(const e of slide.elements){if(e.type==='image'||e.type==='prototype'){const src=e.sourceRegion?slide.source?.render:e.src||e.prototype?.poster;if(!src)continue;const match=/^data:(image\/[^;,]+)(;base64)?,(.*)$/s.exec(src);if(!match)throw new Error('Export “Figma Slides” from Deck Studio to include remote images.');const blob=match[2]?new Blob([Uint8Array.from(atob(match[3]),c=>c.charCodeAt(0))],{type:match[1]}):new Blob([decodeURIComponent(match[3])],{type:match[1]});const bitmap=await createImageBitmap(blob);try{const canvas=document.createElement('canvas'),scale=Math.min(2,4096/Math.max(e.w,e.h));canvas.width=Math.max(1,Math.round(e.w*scale));canvas.height=Math.max(1,Math.round(e.h*scale));const ctx=canvas.getContext('2d');ctx.scale(scale,scale);const r=DeckStudioPptx.imageLayout(e.sourceRegion?{...e,crop:e.sourceRegion,fit:'fill',imageSize:undefined}:e,{w:bitmap.width,h:bitmap.height});ctx.beginPath();ctx.rect(r.visible.x,r.visible.y,r.visible.w,r.visible.h);ctx.clip();ctx.drawImage(bitmap,r.x,r.y,r.w,r.h);assets[e.id]={image:canvas.toDataURL('image/png')};}finally{bitmap.close();}}else if(e.type==='diamond'||e.shape){assets[e.id]={svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${e.w}" height="${e.h}"><path d="${DeckStudioPptx.shapePath(e)}" fill="${e.fill}" stroke="${e.stroke}" stroke-width="${e.strokeWidth}"/></svg>`};}else if(e.type==='chart'||e.type==='table')throw new Error('Export “Figma Slides” from Deck Studio to include charts and tables.');}return assets;}
