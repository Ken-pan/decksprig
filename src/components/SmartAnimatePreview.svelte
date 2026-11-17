<script lang="ts">
  import '../motion-preview.css';
  import { onMount, tick, untrack } from 'svelte';
  import { Play, Pause, RotateCcw } from '@lucide/svelte';
  import { Button, IconButton } from './ui';
  import SlideCanvas from './SlideCanvas.svelte';
  import type { Deck, Slide } from '../core/model';
  import { runPageTransition, type PageTransitionRun } from '../core/transitions';
  let {deck, from, to, active=true}: {deck:Deck;from?:Slide;to:Slide;active?:boolean}=$props();
  let source=$state<HTMLDivElement>(),destination=$state<HTMLDivElement>();
  let phase=$state(100),playing=$state(false),slow=$state(false),reduced=$state(false);
  let visible=$state(typeof document==='undefined'||document.visibilityState!=='hidden');
  let run:PageTransitionRun|undefined,generation=0,frame=0,last='';
  const duration=()=> (to.transition?.duration ?? 650)*(slow?2:1);
  function settle(){generation++;cancelAnimationFrame(frame);run?.cancel();playing=false;phase=100;if(source)source.style.visibility='hidden';}
  async function start(paused=false,progress=0){
    if(!from || !active || !visible || reduced)return;
    const id=++generation;cancelAnimationFrame(frame);run?.cancel();playing=!paused;
    await tick();if(id!==generation || !source || !destination)return;
    source.style.visibility='';destination.style.visibility='';
    run=runPageTransition(destination,source,{effect:'smart',duration:duration(),easing:to.transition?.easing ?? 'cinematic'},1,{paused,from,to,fromStep:Infinity,toStep:Infinity});
    for(const a of run.animations)a.currentTime=duration()*progress/100;phase=progress;
    const sample=()=>{if(id!==generation || !playing)return;const clock=run?.animations.find(a=>a.playState!=='idle');if(clock)phase=Math.min(100,Number(clock.currentTime ?? 0)/duration()*100);frame=requestAnimationFrame(sample);};
    if(!paused)frame=requestAnimationFrame(sample);
    await run.finished;if(id===generation){cancelAnimationFrame(frame);playing=false;phase=100;}
  }
  async function scrub(value:number){
    value=Math.max(0,Math.min(100,value));
    if(!run || run.animations.every(a=>a.playState==='idle')){await start(true,value);return;}
    playing=false;cancelAnimationFrame(frame);run.setPaused(true);for(const a of run.animations)a.currentTime=duration()*value/100;phase=value;
  }
  function toggle(){if(playing){playing=false;cancelAnimationFrame(frame);run?.setPaused(true);}else void start(false,phase===100?0:phase);}
  $effect(()=>{const signature=`${deck.revision}:${from?.id}:${to.id}:${to.transition?.duration}:${to.transition?.easing}:${slow}`,enabled=active&&visible&&!reduced;untrack(()=>{if(!enabled)settle();else if(signature!==last)void start();last=signature;});});
  onMount(()=>{const mq=matchMedia('(prefers-reduced-motion:reduce)');reduced=mq.matches;const preference=()=>reduced=mq.matches,visibility=()=>visible=document.visibilityState!=='hidden';mq.addEventListener('change',preference);document.addEventListener('visibilitychange',visibility);return()=>{settle();mq.removeEventListener('change',preference);document.removeEventListener('visibilitychange',visibility);};});
</script>
<div class="smart-preview">
  <div class="smart-preview-stage" style:aspect-ratio="{deck.width}/{deck.height}" inert aria-hidden="true">
    {#if from}<div class="smart-preview-page" bind:this={source}><SlideCanvas {deck} slide={from} /></div>{/if}
    <div class="smart-preview-page" bind:this={destination}><SlideCanvas {deck} slide={to} /></div>
  </div>
  <div class="smart-preview-caption"><span>{from?'Previous → Current':'Current'} · {reduced?'Reduced motion':`${Math.round(phase)}%`}</span><div>
    <IconButton label={playing?'Pause smart animate':'Play smart animate'} size="sm" disabled={!from||!active||reduced} onclick={toggle}>{#if playing}<Pause size={13}/>{:else}<Play size={13}/>{/if}</IconButton>
    <IconButton label="Replay smart animate" size="sm" disabled={!from||!active||reduced} onclick={()=>void start()}><RotateCcw size={13}/></IconButton>
  </div></div>
  <label class="smart-preview-progress"><span>Animation progress</span><input type="range" min="0" max="100" step="1" value={phase} disabled={!from||!active||reduced} aria-label="Smart animate progress" oninput={e=>void scrub(e.currentTarget.valueAsNumber)}/></label>
  <Button variant="quiet" size="sm" class="full" aria-pressed={slow} disabled={!from||reduced} onclick={()=>slow=!slow}>{slow?'Normal speed':'Slow preview'}</Button>
</div>
