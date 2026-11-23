<script lang="ts">
  import '../motion-preview.css';
  import { onMount, tick, untrack } from 'svelte';
  import { RotateCcw } from '@lucide/svelte';
  import { runPageTransition, type PageTransitionRun } from '../core/transitions';
  import type { SlideTransition } from '../core/model';
  let {transition, active = true}: {transition: SlideTransition; active?: boolean} = $props();
  let first: HTMLDivElement, second: HTMLDivElement;
  let reversed = $state(false), playing = $state(false), reduced = $state(false);
  let visible = $state(typeof document === 'undefined' || document.visibilityState !== 'hidden');
  let lastSignature = '';
  let run: PageTransitionRun | undefined, generation = 0;
  async function play() {
    if (!active || !visible) return;
    const id = ++generation;
    run?.cancel();
    reversed = !reversed; playing = true;
    await tick();
    if (id !== generation) return;
    const incoming = reversed ? second : first, outgoing = reversed ? first : second;
    first.style.visibility = ''; second.style.visibility = '';
    run = runPageTransition(incoming, outgoing, transition, reversed ? 1 : -1, {reduced, lightweight:matchMedia('(max-width:760px)').matches});
    await run.finished;
    if(id===generation)playing=false;
  }
  function settle() { generation++; run?.cancel(); playing=false; if(first && second){first.style.visibility=reversed?'hidden':'';second.style.visibility=reversed?'':'hidden';} }
  $effect(() => {
    const signature=JSON.stringify(transition), enabled=active && visible && !reduced;
    untrack(()=>{if(!enabled)settle();else if(signature!==lastSignature && first && second)void play();lastSignature=signature;});
  });
  onMount(() => {
    const mq=matchMedia('(prefers-reduced-motion:reduce)'); reduced=mq.matches;
    const change=()=>{reduced=mq.matches;if(reduced)settle();};
    const visibility=()=>visible=document.visibilityState!=='hidden';
    mq.addEventListener('change',change);
    document.addEventListener('visibilitychange',visibility);
    return ()=>{generation++;run?.cancel();mq.removeEventListener('change',change);document.removeEventListener('visibilitychange',visibility)};
  });
</script>
<div class="transition-preview" aria-label="Transition preview">
  <div class="transition-preview-stage" aria-hidden="true">
    <div class="transition-demo-page demo-first" class:top={!reversed} bind:this={first}><span>01 / IDEA</span><strong>Make<br />a move.</strong><i></i></div>
    <div class="transition-demo-page demo-second" class:top={reversed} bind:this={second}><span>02 / EXPLORE</span><strong>New<br />perspective.</strong><i></i></div>
  </div>
  <div class="transition-preview-footer"><span>{reduced ? 'System preference: Reduce motion' : playing ? 'Previewing' : 'Transition preview'}</span><button class="icon-btn small" onclick={play} aria-label="Replay transition preview" title="Replay transition preview"><RotateCcw size={14} /></button></div>
</div>
