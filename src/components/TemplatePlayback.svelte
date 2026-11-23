<script lang="ts">
  import Notice from './ui/Notice.svelte';
  import {slideLabel} from '../core/slide-label';
  import {onMount,tick,untrack} from 'svelte';
  import {ArrowLeft,ArrowRight,RotateCcw,Pause,Play} from '@lucide/svelte';
  import type {Deck,Slide} from '../core/model';
  import {clickOrders,navigateCue} from '../core/motion';
  import {runPageTransition,resolvePageTransition,type PageTransitionRun} from '../core/transitions';
  import {matchSmartLayers} from '../core/smart-motion';
  import {resolveSlideTextSizing} from '../core/text-layout';
  import {loadLibraryTypography} from '../core/font-loading';
  import {Button} from './ui';
  import SlideCanvas from './SlideCanvas.svelte';
  let {deck,index=$bindable(0),onstop}:{deck:Deck;index?:number;onstop:()=>void}=$props();
  // svelte-ignore state_referenced_locally
  let current=$state(index);
  let fontEpoch=$state(0),ready=$state(false),step=$state(0),replay=$state(0),paused=$state(false),reduced=$state(false),visible=$state(true);
  let failure=$state('');
  let slide=$derived.by(()=>{fontEpoch;return resolveSlideTextSizing(deck.slides[current],deck);});
  let outgoing=$state<Slide|null>(null),direction=$state(1),outgoingStep=$state(0),entering=$state(false),restored=$state(false);
  let orders=$derived(clickOrders(slide));
  let sharedIds=$derived(outgoing&&resolvePageTransition(outgoing,slide,direction).effect==='smart'?matchSmartLayers(outgoing,slide,{fromStep:outgoingStep,toStep:step}).pairs.map(p=>p.to.id):[]);
  let stage:HTMLDivElement,incomingNode=$state<HTMLDivElement>(),outgoingNode=$state<HTMLDivElement>();
  let run:PageTransitionRun|undefined,epoch=0,mounted=true;
  function settle(){epoch++;run?.cancel();run=undefined;outgoing=null;entering=false;}
  async function transition(){
    const generation=++epoch;run?.cancel();entering=true;await tick();await import('../core/motion-runtime').catch(()=>{});await tick();
    if(!mounted||generation!==epoch)return;
    if(reduced||!visible||!incomingNode){outgoing=null;entering=false;return;}
    run=runPageTransition(incomingNode,outgoingNode??null,resolvePageTransition(outgoing,slide,direction),direction,{paused,lightweight:matchMedia('(max-width:760px)').matches,from:outgoing??undefined,to:slide,fromStep:outgoingStep,toStep:step});
    await run.finished;if(mounted&&generation===epoch){outgoing=null;entering=false;}
  }
  function jump(next:number,nextStep=0){
    next=Math.max(0,Math.min(deck.slides.length-1,next));
    if(next===current){settle();restored=false;step=nextStep;return;}
    direction=next>current?1:-1;outgoing=slide;outgoingStep=step;current=next;index=next;step=nextStep;restored=direction<0;replay++;void transition();
  }
  function go(direction:number){const next=navigateCue(current,step,direction,deck.slides.map(s=>clickOrders(s).length));jump(next.index,next.step);}
  function restart(){settle();step=0;replay++;restored=false;paused=false;void transition();}
  function key(event:KeyboardEvent){
    if(event.defaultPrevented||event.target!==stage||event.isComposing||event.keyCode===229||event.metaKey||event.ctrlKey||event.altKey)return;
    if(!ready && event.key!=='Escape')return;
    if(['ArrowRight','ArrowDown',' '].includes(event.key)){event.preventDefault();go(1);}
    else if(['ArrowLeft','ArrowUp'].includes(event.key)){event.preventDefault();go(-1);}
    else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onstop();}
  }
  $effect(()=>{const next=index;untrack(()=>{if(next!==current)jump(next);});});
  $effect(()=>{const hold=paused||!visible;run?.setPaused(hold);});
  onMount(()=>{
    const mq=matchMedia('(prefers-reduced-motion:reduce)');reduced=mq.matches;
    const change=()=>{reduced=mq.matches;if(reduced){paused=false;settle();}};
    const visibility=()=>{visible=document.visibilityState!=='hidden';if(!visible)settle();};
    const fonts=()=>fontEpoch++;
    mq.addEventListener('change',change);document.addEventListener('visibilitychange',visibility);document.fonts.addEventListener('loadingdone',fonts);
    stage.focus({preventScroll:true});
    void loadLibraryTypography(deck.slides,deck.fonts).then(async()=>{await document.fonts.ready;if(!mounted)return;ready=true;fontEpoch++;void transition();}).catch(()=>{if(mounted)failure='The preview fonts could not load. Stop motion and try again.';});
    return()=>{mounted=false;settle();mq.removeEventListener('change',change);document.removeEventListener('visibilitychange',visibility);document.fonts.removeEventListener('loadingdone',fonts);};
  });
</script>

<div class="template-preview" class:motion-loading={!ready} aria-label={`Motion preview: ${slideLabel(current)}`}>
  <span id="template-motion-help" hidden>Arrow keys or Space reveal the next point, then advance the slide. Escape stops the motion preview.</span>
  <!-- This focusable canvas owns keyboard playback, as in the presentation viewer. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div class="template-motion-stage" style:aspect-ratio={`${deck.width}/${deck.height}`} bind:this={stage} role="region" aria-label="Template motion preview" aria-busy={!ready} aria-describedby="template-motion-help" tabindex="0" onkeydown={key}>
    {#if outgoing}<div class="template-motion-page outgoing" bind:this={outgoingNode} aria-hidden="true"><SlideCanvas {deck} slide={outgoing} playback step={outgoingStep} replay={replay-1} {reduced} restored /></div>{/if}
    {#key slide.id}<div class="template-motion-page incoming" bind:this={incomingNode}><SlideCanvas {deck} {slide} playback={ready} {step} {replay} {reduced} {entering} {restored} {sharedIds} paused={paused||!visible}/></div>{/key}
  </div>
</div>
<div class="template-playback-bar">
  <Button kind="icon" aria-label="Previous motion step" disabled={!ready||current===0&&step===0} onclick={()=>go(-1)}><ArrowLeft size={16}/></Button>
  <span aria-live="polite">{current+1} / {deck.slides.length}{#if orders.length}<small>Step {step} / {orders.length}</small>{/if}</span>
  <Button kind="icon" aria-label="Next motion step" disabled={!ready||current===deck.slides.length-1&&step===orders.length} onclick={()=>go(1)}><ArrowRight size={16}/></Button>
</div>
<div class="template-playback-tools">
  <span role="status">{!ready?'Loading motion…':reduced?'Reduce motion is on':orders.length?'Next reveals a point, then advances the slide.':'Motion preview'}</span>
  <Button variant="quiet" disabled={!ready} onclick={restart}><RotateCcw size={15}/>Replay</Button>
  <Button variant="quiet" disabled={!ready||reduced} aria-pressed={paused} onclick={()=>paused=!paused}>{#if paused}<Play size={15}/>Resume{:else}<Pause size={15}/>Pause{/if}</Button>
</div>
{#if failure}<Notice tone="error" title="Motion preview unavailable" message={failure}/>{/if}
<style>
  .template-preview{overflow:hidden;border-radius:var(--radius-sm);border:1px solid var(--border-default)}
  .template-motion-stage{position:relative;overflow:hidden;outline:none}
  .template-motion-stage:focus-visible{outline:2px solid var(--canvas-selection);outline-offset:-2px}
  .template-motion-page{position:absolute;inset:0}.incoming{z-index:2}.outgoing{z-index:1;pointer-events:none}
  .template-motion-page :global(.canvas-wrap){width:100%}
  .template-playback-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:12px 0;font-size:var(--ui-label);color:var(--text-secondary)}
  .template-playback-bar>span{text-align:center;min-width:0;line-height:var(--ui-line-reading)}.template-playback-bar small{display:block;font-size:var(--ui-meta)}
  .template-playback-tools{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-bottom:16px;font-size:var(--ui-meta);color:var(--text-secondary)}
  .template-playback-tools>span{margin-right:auto;flex:1 1 180px;line-height:var(--ui-line-reading)}
</style>
