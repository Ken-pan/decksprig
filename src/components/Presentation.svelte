<script lang="ts">
  import {slideSearchText} from '../core/slide-label';
  import '../presentation.css';
  import type {PresentationCommandEvent} from '../core/presentation-command';
  import { onMount, tick, mount, unmount } from 'svelte';
  import {EmptyState} from './ui';
  import { uiPresence } from '../ui-motion';
  import { ArrowLeft, ArrowRight, RotateCcw, Maximize2, Minimize2, X, PanelRight, Pause, Play, Grid2X2, Ellipsis, Search, CircleHelp, EyeOff } from '@lucide/svelte';
  import SlideCanvas from './SlideCanvas.svelte';
  import SlideThumbnail from './SlideThumbnail.svelte';
  import SpeakerPanel from './SpeakerPanel.svelte';
  import PhotoCredits from './PhotoCredits.svelte';
  import { editor } from '../core/editor.svelte';
  import type { Deck, Slide } from '../core/model';
  import {clickOrders,objectCueDuration} from '../core/motion';
  import { adjacentVisibleSlide, presentationStartIndex, visibleSlideIndices } from '../core/slide-visibility';
  import { runPageTransition, resolvePageTransition, type PageTransitionRun } from '../core/transitions';
  import {nativeSlideTransition,createNativeAdvance} from '../core/figma-transitions';
  import { createPlaybackGestures } from '../core/player-gestures';
  import { matchSmartLayers } from '../core/smart-motion';
  import { createPresentationClock, formatPresentationTime, presentationSlideNumber, navigatePresentationCue, type SpeakerSession } from '../core/presentation-session';
  let {deck, original: sourceView = false, clientId = '', startId, returnTo, onclose}: {deck: Deck; original?: boolean; clientId?: string; startId?:string; returnTo?:HTMLElement; onclose: () => void} = $props();
  // svelte-ignore state_referenced_locally
  const original = sourceView;
  // svelte-ignore state_referenced_locally
  let index = $state(presentationStartIndex(deck.slides, Math.max(0, deck.slides.findIndex(s => s.id === (startId || editor.slide?.id)))) ?? 0);
  let visibleIndices = $derived(visibleSlideIndices(deck.slides));
  let previousIndex = $derived(adjacentVisibleSlide(deck.slides, index, -1));
  let nextIndex = $derived(adjacentVisibleSlide(deck.slides, index, 1));
  let slide = $derived(deck.slides[index]);
  let outgoing = $state<Slide | null>(null), direction = $state(1), step = $state(0), replay = $state(0);
  let reduced = $state(false), quiet = $state(false), blackout = $state(false), speaker = $state(false), paused = $state(false);
  let viewer: HTMLDialogElement, stage: HTMLDivElement, canvas: HTMLDivElement;
  let prototypeInteractions = $state<string[]>([]);
  let prototypeActive = $derived(prototypeInteractions.some(id => id.startsWith(`${slide.id}:`)));
  let entering = $state(true), restored = $state(false), outgoingStep = $state(0);
  let sharedIds = $derived(resolvePageTransition(outgoing,slide,direction).effect === 'smart' && outgoing && !original ? matchSmartLayers(outgoing,slide,{fromStep:outgoingStep,toStep:step}).pairs.map(p=>p.to.id) : []);
  let background = $state(false), incomingNode = $state<HTMLDivElement>(), outgoingNode = $state<HTMLDivElement>();
  let orders = $derived(original ? [] : clickOrders(slide));
  let hasPhotoCredits = $derived(!original && deck.slides.some(s => s.elements.some(e => !e.hidden && e.resource?.id.startsWith('unsplash:'))));
  let lastCue = $derived(nextIndex === null && step === orders.length);
  let stageSize = $state({width: 0, height: 0});
  let canvasWidth = $derived(Math.min(stageSize.width, stageSize.height * deck.width / deck.height));
  let chrome = $state(false), finePointer = $state(true), isFullscreen = $state(false);
  let panel = $state<'overview' | 'tools' | 'help' | null>(null), search = $state(''), numberBuffer = $state(''), status = $state('');
  let searchInput = $state<HTMLInputElement>(), panelNode = $state<HTMLElement>();
  let pointer = $state<'none' | 'laser' | 'spotlight'>('none'), point = $state<{x: number; y: number} | null>(null);
  let autoplay = $state(false), interval = $state(10), loop = $state(false);
  let nativeTiming=$derived(nativeSlideTransition(slide.transition??{effect:'none',duration:100,easing:'linear'})?.timing);
  const nativeAdvance=createNativeAdvance();
  let elapsed = $state('00:00'), timerRunning = $state(true), speakerWindowOpen = $state(false);
  let pageRun: PageTransitionRun | undefined, epoch = 0, ownedFullscreen = false;
  let hideTimer: ReturnType<typeof setTimeout>, numberTimer: ReturnType<typeof setTimeout>;
  let clock: ReturnType<typeof createPresentationClock> | undefined;
  let speakerWindow: Window | null = null, speakerComponent: ReturnType<typeof mount> | undefined;
  let styleObserver: MutationObserver | undefined, lastPanelTrigger: HTMLElement | null = null;
  // Stable proxy shared by the in-place panel and the optional same-origin speaker window.
  // svelte-ignore state_referenced_locally
  const session: SpeakerSession = $state({deck, original, index: 0, step: 0, steps: 0, elapsed: '00:00', timerRunning: true, blackout: false});
  $effect(() => { Object.assign(session, {deck, original, index, step, steps: orders.length, elapsed, timerRunning, blackout}); });
  let filteredSlides = $derived(deck.slides.map((s,i) => ({slide:s,index:i})).filter(s => !search.trim() || slideSearchText(s.slide,s.index).toLowerCase().includes(search.trim().toLowerCase())));
  onMount(()=>{const listener=async(event:Event)=>{const {action,resolve,reject}=(event as PresentationCommandEvent).detail;try{
    if(action.command==='next')go(1);if(action.command==='previous')go(-1);
    if(action.command==='go_to'){const next=deck.slides.findIndex(s=>s.id===action.slideId);if(next<0)throw new Error('Slide no longer exists.');jump(next);}
    if(action.command==='restart')restart();if(action.command==='pause')paused=true;if(action.command==='resume')paused=false;
    if(action.command==='blackout')blackout=true;if(action.command==='show_slide')blackout=false;
    if(action.command==='speaker_view')speaker=true;if(action.command==='close_speaker_view')speaker=false;
    if(action.command==='reset_timer')resetClock();if(action.command==='pause_timer'&&clock?.running)toggleClock();if(action.command==='resume_timer'&&!clock?.running)toggleClock();
    if(action.command==='autoplay'){interval=action.interval??10;loop=action.loop??false;autoplay=true;}if(action.command==='stop_autoplay')autoplay=false;
    await tick();resolve({message:`Presentation ${action.command.replaceAll('_',' ')} completed`,slideId:slide.id,state:`slide-${index+1}-cue-${step}`});
  }catch(error){reject(error as Error);}};document.addEventListener('deck-studio-presentation-command',listener);return()=>document.removeEventListener('deck-studio-presentation-command',listener);});
  const gestures = createPlaybackGestures(n => go(n), target => target.focus({preventScroll:true}));
  async function transition() {
    const id = ++epoch; pageRun?.cancel(); entering = true;
    await tick();await import('../core/motion-runtime').catch(()=>{});await tick();if(id!==epoch)return;
    const t = resolvePageTransition(outgoing,slide,direction);
    if (reduced || quiet || t.effect === 'none' || !incomingNode) { outgoing = null; entering = false; return; }
    pageRun = runPageTransition(incomingNode, outgoingNode ?? null, t, direction, {paused: paused || prototypeActive || background || blackout || Boolean(panel), lightweight: matchMedia('(max-width:760px)').matches, from:outgoing ?? undefined, to:slide, fromStep:outgoingStep, toStep:step});
    await pageRun.finished; if (id === epoch) { outgoing = null; entering = false; }
  }
  function settlePage() { epoch++; pageRun?.cancel(); outgoing = null; entering = false; }
  function jump(next: number, nextStep = 0, complete = false) {
    next = Math.max(0, Math.min(deck.slides.length - 1, next));
    if (next === index) { if (nextStep !== step || complete) settlePage(); restored = complete; step = nextStep; return; }
    direction = next > index ? 1 : -1; restored = complete || direction < 0; outgoing = slide; outgoingStep = step; index = next; step = nextStep; replay++; point = null;
    editor.chooseSlide(slide.id); editor.sourceMode = original && Boolean(slide.source?.render); void transition();
  }
  function go(n: number, automatic = false) {
    if (!automatic) autoplay = false;
    if (blackout) { blackout = false; return; }
    const next = navigatePresentationCue(deck.slides, index, step, n, deck.slides.map(s => original ? 0 : clickOrders(s).length));
    jump(next.index, next.step);
  }
  function restart() { autoplay = false; settlePage(); step = 0; restored = false; replay++; paused = false; void transition(); }
  function pause() { if ((!reduced && !quiet)||nativeTiming?.type==='AFTER_DELAY') paused = !paused; }
  function toggleClock() { clock?.toggle(); timerRunning = Boolean(clock?.running); }
  function resetClock() { clock?.reset(); elapsed = '00:00'; }
  function reveal() {
    chrome = true; clearTimeout(hideTimer);
    if (finePointer) hideTimer = setTimeout(() => {
      if (!panel && !numberBuffer && !viewer?.querySelector('.presentation-header:focus-within,.presentation-controls:focus-within,.presentation-header:hover,.presentation-controls:hover')) chrome = false;
      else reveal();
    }, 1600);
  }
  async function openPanel(next: typeof panel, trigger?: Event) {
    if (panel === next) { closePanel(); return; }
    lastPanelTrigger = trigger?.currentTarget as HTMLElement ?? document.activeElement as HTMLElement;
    panel = next; search = ''; reveal(); await tick();
    if (next === 'overview') searchInput?.focus(); else panelNode?.focus();
  }
  function closePanel() { panel = null; reveal(); void tick().then(() => (lastPanelTrigger?.isConnected ? lastPanelTrigger : canvas)?.focus({preventScroll:true})); }
  function selectSlide(next: number) { autoplay = false; closePanel(); jump(next); void tick().then(() => canvas?.focus({preventScroll:true})); }
  function toggleBlackout() { blackout = !blackout; point = null; reveal(); }
  async function close() { if (ownedFullscreen && document.fullscreenElement) await document.exitFullscreen().catch(() => {}); onclose(); }
  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else { await document.documentElement.requestFullscreen(); ownedFullscreen = true; } }
    catch { status = 'Full screen is unavailable. Use your browser’s full-screen menu.'; reveal(); }
  }
  function pointerMove(event: PointerEvent) {
    gestures.pointermove(event);
    if (pointer !== 'none' && !(event.target as Element)?.closest('.prototype-shell')) {
      const rect = canvas.getBoundingClientRect(); point = {x:event.clientX - rect.left, y:event.clientY - rect.top};
    }
  }
  function prototypeInteraction(id: string, active: boolean) {
    prototypeInteractions = prototypeInteractions.filter(value => value !== id);
    if (active) prototypeInteractions.push(id);
  }
  function canvasDown(event: PointerEvent) {
    if (pointer === 'none') gestures.pointerdown(event);
    else if (!(event.target as Element)?.closest('.prototype-shell')) { canvas.focus({preventScroll:true}); pointerMove(event); }
  }
  function keyboard(event: KeyboardEvent) {
    if (event.defaultPrevented || event.keyCode === 229 || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
    // Duck typing supports elements from the separate speaker window as well.
    const target = event.target as HTMLElement | null;
    if (target?.closest?.('dialog') && target.closest('dialog') !== viewer) return;
    if (target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])') && event.key !== 'Escape') return;
    if (target?.closest?.('.speaker-notes') && ['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key)) return;
    if (event.key === 'Escape') { event.preventDefault(); if (panel) closePanel(); else if (numberBuffer) numberBuffer = ''; else if (blackout) toggleBlackout(); else void close(); return; }
    if (panel) return;
    if (!numberBuffer && target?.closest?.('button,a') && [' ', 'Enter'].includes(event.key)) return;
    if (event.key === 'Tab') reveal();
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault(); numberBuffer = (numberBuffer + event.key).slice(-3); reveal(); clearTimeout(numberTimer); numberTimer = setTimeout(() => numberBuffer = '', 4000); return;
    }
    if (numberBuffer && event.key === 'Backspace') { event.preventDefault(); numberBuffer = numberBuffer.slice(0,-1); return; }
    if (numberBuffer && event.key === 'Enter') {
      event.preventDefault(); const destination = presentationSlideNumber(numberBuffer,deck.slides.length);
      if (destination !== null) { autoplay = false; jump(destination); } else status = `Choose a slide from 1 to ${deck.slides.length}.`;
      numberBuffer = ''; return;
    }
    if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(event.key)) { event.preventDefault(); go(1); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) { event.preventDefault(); go(-1); }
    else if (event.key === 'Home') { event.preventDefault(); autoplay = false; jump(visibleIndices[0],0,true); }
    else if (event.key === 'End') { event.preventDefault(); autoplay = false; const last=visibleIndices.at(-1)!; jump(last,original ? 0 : clickOrders(deck.slides[last]).length,true); }
    else {
      const key = event.key.toLowerCase();
      if (['r','b','f','p','g','n','l','s','?'].includes(key)) event.preventDefault();
      if (key === 'r') restart();
      if (key === 'b') toggleBlackout();
      if (key === 'f') void fullscreen();
      if (key === 'p') pause();
      if (key === 'g') void openPanel('overview');
      if (key === 'n') { if (speakerWindowOpen) void openSpeakerWindow(); else { speaker = !speaker; settlePage(); } }
      if (key === 'l' || key === 's') { pointer = pointer === (key === 'l' ? 'laser' : 'spotlight') ? 'none' : key === 'l' ? 'laser' : 'spotlight'; point = null; }
      if (key === '?') void openPanel('help');
    }
  }
  function disposeSpeakerWindow(closeWindow = true) {
    styleObserver?.disconnect(); styleObserver = undefined;
    if (speakerComponent) { void unmount(speakerComponent); speakerComponent = undefined; }
    if (closeWindow && speakerWindow && !speakerWindow.closed) speakerWindow.close();
    speakerWindow = null; speakerWindowOpen = false;
  }
  async function openSpeakerWindow() {
    if (speakerWindow && !speakerWindow.closed) { speakerWindow.focus(); return; }
    const popup = window.open(new URL('speaker.html',document.baseURI).href, '_blank', 'popup,width=1000,height=800');
    if (!popup) { status = 'Allow pop-ups to open a speaker window. You can use Speaker view here.'; speaker = true; reveal(); return; }
    speakerWindow = popup;
    const ready = await new Promise<boolean>(resolve => {
      let attempts = 0;
      const check = () => {
        if (popup.closed || speakerWindow !== popup) { resolve(false); return; }
        try { if (/\/speaker(?:\.html)?$/.test(popup.location.pathname) && popup.document.readyState === 'complete') { resolve(true); return; } } catch { /* Wait for the same-origin shell. */ }
        if (++attempts >= 100) { resolve(false); return; }
        setTimeout(check,100);
      };
      check();
    });
    if (!ready) {
      if (speakerWindow === popup) {
        const cancelled = popup.closed;
        disposeSpeakerWindow(); speaker = true;
        if (!cancelled) status = 'The speaker window could not load. Try opening it again.';
        reveal();
      }
      return;
    }
    const doc = popup.document;
    doc.title = `${deck.title} — Speaker view`;
    Object.assign(doc.documentElement.dataset, document.documentElement.dataset); doc.documentElement.dataset.theme = 'dark';
    const base = doc.createElement('base'); base.href = document.baseURI; doc.head.append(base);
    const copies = new Map<Node, Node>();
    const syncStyles = () => {
      document.head.querySelectorAll('style,link[rel="stylesheet"]').forEach(node => {
        const old = copies.get(node), copy = node.cloneNode(true);
        if (old) { if (!old.isEqualNode(copy)) { old.parentNode?.replaceChild(copy,old); copies.set(node,copy); } }
        else { doc.head.append(copy); copies.set(node,copy); }
      });
    };
    syncStyles(); styleObserver = new MutationObserver(syncStyles); styleObserver.observe(document.head,{childList:true,subtree:true,characterData:true});
    doc.body.className = 'speaker-window';
    const root = doc.createElement('main'); doc.body.replaceChildren(root);
    speakerComponent = mount(SpeakerPanel,{target:root,props:{session,detached:true,onadvance:go,onclock:toggleClock,onreset:resetClock}});
    popup.addEventListener('keydown',keyboard); popup.addEventListener('pagehide',() => disposeSpeakerWindow(false),{once:true});
    speakerWindowOpen = true; speaker = false; settlePage(); reveal();
  }
  $effect(() => { const hold=paused || prototypeActive || background || blackout || Boolean(panel);pageRun?.setPaused(hold); });
  $effect(() => { if (quiet || reduced) { settlePage(); paused = false; } });
  $effect(() => {
    nativeAdvance.update(`${slide.id}:${step}:${replay}`,!autoplay&&nextIndex!==null&&step===orders.length&&nativeTiming?.type==='AFTER_DELAY'?(nativeTiming.delay??0)+((reduced||quiet)?0:objectCueDuration(slide,step)):undefined,paused||prototypeActive||background||blackout||Boolean(panel)||entering,()=>go(1,true));
  });
  onMount(()=>()=>nativeAdvance.destroy());
  $effect(() => {
    index; step; replay; interval; loop;
    if (!autoplay || paused || prototypeActive || background || blackout || panel || entering) return;
    const timer = setTimeout(() => {
      if (lastCue) { if (loop) { jump(visibleIndices[0]); if (visibleIndices.length === 1) { replay++; restored = false; void transition(); } } else { autoplay = false; status = 'Autoplay finished'; reveal(); } }
      else go(1,true);
    },Math.max(interval*1000,(reduced||quiet)?0:objectCueDuration(slide,step)));
    return () => clearTimeout(timer);
  });
  onMount(() => {
    const previous = document.activeElement as HTMLElement | null;
    const mq = matchMedia('(prefers-reduced-motion: reduce)'), pointerQuery = matchMedia('(hover:hover) and (pointer:fine)');
    const preference = () => { reduced = mq.matches; };
    const input = () => { finePointer = pointerQuery.matches; };
    preference(); input(); mq.addEventListener('change',preference); pointerQuery.addEventListener('change',input);
    const visibility = () => { background = document.visibilityState === 'hidden'; };
    const fullscreenChange = () => { isFullscreen = Boolean(document.fullscreenElement); reveal(); };
    visibility(); document.addEventListener('visibilitychange',visibility); document.addEventListener('fullscreenchange',fullscreenChange);
    const observer = new ResizeObserver(entries => { const rect = entries[0].contentRect; stageSize = {width:rect.width,height:rect.height}; settlePage(); }); observer.observe(stage);
    clock = createPresentationClock(() => performance.now());
    const clockInterval = setInterval(() => { elapsed = formatPresentationTime(clock!.elapsed()); if (speakerWindowOpen && speakerWindow?.closed) disposeSpeakerWindow(false); },250);
    viewer.showModal(); canvas.focus(); chrome = false; clearTimeout(hideTimer); void transition();
    return () => {
      epoch++; pageRun?.cancel(); observer.disconnect(); clearInterval(clockInterval); clearTimeout(hideTimer); clearTimeout(numberTimer); disposeSpeakerWindow();
      mq.removeEventListener('change',preference); pointerQuery.removeEventListener('change',input); document.removeEventListener('visibilitychange',visibility); document.removeEventListener('fullscreenchange',fullscreenChange);
      if (ownedFullscreen && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      const wasOpen=viewer?.open;viewer?.close();if(wasOpen)restoreFocus(returnTo,previous);
    };
  });
  import {restoreFocus} from '../ui-focus';
  import {modalFocus} from '../ui-modal-focus';
</script>
<svelte:window onkeydown={keyboard} />
<dialog bind:this={viewer} use:modalFocus={()=>returnTo} aria-modal="true" transition:uiPresence={{y:0}} class="presentation" class:blackout class:speaker class:chrome-visible={chrome || !finePointer || Boolean(panel)} aria-label="Present document" onfocusin={e => { if ((e.target as HTMLElement).closest('.presentation-header,.presentation-controls,.player-panel,.speaker-panel')) reveal(); }} oncancel={e => { e.preventDefault(); if (panel) closePanel(); else if (blackout) toggleBlackout(); else void close(); }}>
  <span id="player-keyboard-help" hidden>Arrow keys or Space advance slides and builds. Swipe on touch screens. G opens all slides, N shows speaker notes, B toggles a black screen, F toggles full screen, R replays, P pauses motion. Press ? for all shortcuts. Type a slide number and press Enter to jump.</span>
  <div class="presentation-workspace" inert={Boolean(panel)}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="presentation-stage" class:has-photo-credits={hasPhotoCredits} bind:this={stage} onpointermove={e => { if (e.pointerType !== 'touch' && e.clientY > stage.getBoundingClientRect().bottom - 72) reveal(); }}>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div bind:this={canvas} class="presentation-canvas player-canvas" class:pointing={pointer !== 'none'} tabindex="0" role="region" aria-label="Presentation canvas" aria-describedby="player-keyboard-help" inert={Boolean(panel)} style:width="{canvasWidth}px" style:aspect-ratio="{deck.width} / {deck.height}"
        onclick={e => { if (pointer === 'none') gestures.click(e); }} onkeydown={e => { e.stopPropagation(); keyboard(e); }}
        onpointerdown={canvasDown} onpointermove={pointerMove} onpointerleave={() => point = null} onpointerup={e => { if (pointer === 'none') gestures.pointerup(e); }} onpointercancel={() => { gestures.pointercancel(); point = null; }}>
        {#if outgoing}<div class="player-layer outgoing" bind:this={outgoingNode} inert aria-hidden="true"><SlideCanvas {deck} slide={outgoing} {original} playback step={outgoingStep} restored reduced /></div>{/if}
        {#key slide.id}<div class="player-layer incoming" bind:this={incomingNode}><SlideCanvas {deck} {slide} {original} playback {step} {replay} {entering} {restored} {sharedIds} paused={paused || prototypeActive || background || blackout || Boolean(panel)} onprototypeinteraction={prototypeInteraction} reduced={reduced || quiet} {clientId} /></div>{/key}
        {#if point && pointer === 'laser'}<div class="presentation-laser" style:left="{point.x}px" style:top="{point.y}px" aria-hidden="true"></div>{/if}
        {#if point && pointer === 'spotlight'}<div class="presentation-spotlight" style:background="radial-gradient(circle 110px at {point.x}px {point.y}px, transparent 75%, rgb(0 0 0 / 65%) 100%)" aria-hidden="true"></div>{/if}
      </div>
      {#if blackout}<div class="blackout-hint" aria-live="polite">Black screen <span>Press B or use an arrow to return</span></div>{/if}
      <header class="presentation-header" inert={Boolean(panel)}>
        <button class="player-button" onclick={close} aria-label="Exit presentation" aria-describedby="player-keyboard-help"><X size={20}/></button>
        {#if original}<span class="presentation-reference">Source reference</span>{/if}
        <div class="presentation-header-actions"><button class="player-button player-speaker-toggle" onclick={() => { if (speakerWindowOpen) void openSpeakerWindow(); else { speaker = !speaker; settlePage(); reveal(); } }} aria-label={speakerWindowOpen ? 'Speaker window' : 'Speaker view'} aria-pressed={speaker} aria-describedby="player-keyboard-help"><PanelRight size={18}/></button><button class="player-button" onclick={fullscreen} aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'} aria-describedby="player-keyboard-help">{#if isFullscreen}<Minimize2 size={18}/>{:else}<Maximize2 size={18}/>{/if}</button></div>
      </header>
      <footer class="presentation-controls" inert={Boolean(panel)} onpointerenter={reveal}>
        <div class="player-navigation"><button class="player-button" onclick={() => go(-1)} disabled={previousIndex === null && step === 0} aria-label="Previous slide or step"><ArrowLeft size={20}/></button><button class="player-count" onclick={e => openPanel('overview',e)} aria-label={`All slides · ${index + 1} / ${deck.slides.length}${slide.hidden?' · Hidden slide shown temporarily':''}${orders.length ? ` · ${step}/${orders.length}` : ''}`} aria-describedby="player-keyboard-help"><strong>{index + 1}<span> / {deck.slides.length}</span></strong>{#if orders.length||slide.hidden}<small>{#if slide.hidden}Hidden slide{#if orders.length} · {/if}{/if}{#if orders.length}{step}/{orders.length}{/if}</small>{/if}</button><button class="player-button" onclick={() => go(1)} disabled={lastCue} aria-label="Next slide or step"><ArrowRight size={20}/></button></div>
        {#if autoplay}<button class="player-button presentation-autoplay" onclick={() => autoplay = false} aria-label="Stop autoplay"><Pause size={16}/></button>{/if}
        <button class="player-button" onclick={e => openPanel('tools',e)} aria-label="Presentation tools"><Ellipsis size={20}/></button>
      </footer>
      <div class="presentation-progress" aria-hidden="true"><div style:width="{((visibleIndices.filter(i=>i<index).length + (slide.hidden?0:orders.length ? step / orders.length : 1)) / visibleIndices.length) * 100}%"></div></div>
      {#if !original}<div class="presentation-credits"><PhotoCredits {slide}/></div>{/if}
      {#if numberBuffer}<div class="player-message" role="status">Go to slide {numberBuffer}<span>Press Enter</span></div>{/if}
      {#if status}<div class="player-message" role="status">{status}<button class="player-button" onclick={() => status = ''} aria-label="Dismiss message"><X size={16}/></button></div>{/if}
    </div>
    {#if speaker}<SpeakerPanel {session} onadvance={go} onclock={toggleClock} onreset={resetClock} ondetach={openSpeakerWindow} onclose={() => { speaker = false; canvas?.focus(); reveal(); }}/>{/if}
  </div>
  {#if panel}
    <div class="player-overlay">
      <section bind:this={panelNode} tabindex="-1" class="player-panel" class:overview={panel === 'overview'} aria-label={panel === 'overview' ? 'All slides' : panel === 'tools' ? 'Presentation tools' : 'Keyboard shortcuts'} transition:uiPresence>
        <header><h2>{panel === 'overview' ? 'All slides' : panel === 'tools' ? 'Presentation tools' : 'Keyboard shortcuts'}</h2><button class="player-button" onclick={closePanel} aria-label="Close panel"><X size={20}/></button></header>
        {#if panel === 'overview'}
          {#if visibleIndices.length < deck.slides.length}<p class="player-panel-summary">{visibleIndices.length} visible · {deck.slides.length-visibleIndices.length} hidden</p>{/if}
          <label class="player-search"><Search size={18}/><input bind:this={searchInput} bind:value={search} aria-label="Search slides" placeholder="Find slide or text"/></label>
          <div class="player-slide-grid">{#each filteredSlides as item (item.slide.id)}<button class="player-slide-option" class:current={item.index === index} aria-current={item.index === index ? 'page' : undefined} onclick={() => selectSlide(item.index)}><SlideThumbnail {deck} slide={item.slide} {original} active={item.index === index}/><span><span class="sr-only">Slide </span><strong>{String(item.index + 1).padStart(2,'0')}</strong>{#if item.slide.hidden}<span class="player-hidden-label"><EyeOff size={14} aria-hidden="true"/>Hidden</span>{/if}</span></button>{:else}<div class="player-empty"><EmptyState icon={Search} title="No matching slides" description="Try slide text or a slide number."><button class="player-button" onclick={()=>{search='';searchInput?.focus();}}>Clear search</button></EmptyState></div>{/each}</div>
          <p class="player-panel-hint">Hidden slides are skipped during navigation. Choose any slide to show it, or type its number during the presentation and press Enter.</p>
        {:else if panel === 'tools'}
          <div class="player-tools-grid">
            <button class="player-tool" onclick={() => openPanel('overview')}><Grid2X2 size={18}/><span>All slides</span><kbd>G</kbd></button>
            <button class="player-tool" onclick={restart}><RotateCcw size={18}/><span>Replay this slide</span><kbd>R</kbd></button>
            <button class="player-tool" onclick={pause} disabled={(reduced || quiet)&&nativeTiming?.type!=='AFTER_DELAY'} aria-pressed={paused}>{#if paused}<Play size={18}/>{:else}<Pause size={18}/>{/if}<span>{paused ? 'Resume motion' : 'Pause motion'}</span><kbd>P</kbd></button>
            <button class="player-tool" onclick={() => { toggleBlackout(); closePanel(); }} aria-pressed={blackout}><span class="player-black-icon"></span><span>{blackout ? 'Show presentation' : 'Black screen'}</span><kbd>B</kbd></button>
          </div>
          <label class="player-setting"><span>Pointer</span><select bind:value={pointer} onchange={() => { point = null; }} aria-label="Pointer mode"><option value="none">Off</option><option value="laser">Laser pointer</option><option value="spotlight">Spotlight</option></select></label>
          <label class="player-check"><input type="checkbox" checked={quiet || reduced} onchange={e => quiet = e.currentTarget.checked} disabled={reduced}/><span>Reduce slide motion{#if reduced}<small>Enabled by your system preference</small>{/if}</span></label>
          <div class="player-autoplay-settings"><div class="speaker-section-heading"><h3>Autoplay</h3><button class="player-button" aria-label={autoplay ? 'Stop autoplay' : 'Start autoplay'} onclick={() => { autoplay = !autoplay; if (autoplay) { paused = false; if (lastCue) jump(visibleIndices[0]); closePanel(); } }}>{#if autoplay}<Pause size={18}/>{:else}<Play size={18}/>{/if}<span>{autoplay ? 'Stop' : 'Start'}</span></button></div><label class="player-setting"><span>Time per slide or step</span><select bind:value={interval} aria-label="Autoplay interval">{#each [5,10,15,30] as seconds}<option value={seconds}>{seconds} seconds</option>{/each}</select></label><label class="player-check"><input type="checkbox" bind:checked={loop}/><span>Loop presentation</span></label><p class="player-panel-hint">Pauses for tools, black screen and prototype interaction. Manual navigation stops autoplay.</p></div>
          <button class="player-tool" onclick={() => openPanel('help')}><CircleHelp size={18}/><span>Keyboard shortcuts</span><kbd>?</kbd></button>
        {:else}
          <dl class="player-shortcuts"><div><dt>Next slide or step</dt><dd><kbd>→</kbd><kbd>Space</kbd></dd></div><div><dt>Previous slide or step</dt><dd><kbd>←</kbd></dd></div><div><dt>First / last slide</dt><dd><kbd>Home</kbd><kbd>End</kbd></dd></div><div><dt>Jump to a slide</dt><dd><kbd>1–{deck.slides.length}</kbd><kbd>Enter</kbd></dd></div><div><dt>All slides</dt><dd><kbd>G</kbd></dd></div><div><dt>Speaker view</dt><dd><kbd>N</kbd></dd></div><div><dt>Laser / spotlight</dt><dd><kbd>L</kbd><kbd>S</kbd></dd></div><div><dt>Black screen</dt><dd><kbd>B</kbd></dd></div><div><dt>Replay / pause motion</dt><dd><kbd>R</kbd><kbd>P</kbd></dd></div><div><dt>Full screen</dt><dd><kbd>F</kbd></dd></div><div><dt>Close panel / exit</dt><dd><kbd>Esc</kbd></dd></div></dl><p class="player-panel-hint">Click the slide or swipe horizontally to advance. Embedded prototypes keep their own controls.</p>
        {/if}
      </section>
    </div>
  {/if}
</dialog>
