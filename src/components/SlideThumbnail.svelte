<script lang="ts">
  import { onMount } from 'svelte';
  import {observeThumbnail} from '../core/thumbnail-visibility';
  let SlideCanvas=$state<typeof import('./SlideCanvas.svelte')['default']>();
  $effect(()=>{if((visible||active)&&!SlideCanvas)void import('./SlideCanvas.svelte').then(m=>SlideCanvas=m.default);});
  import type { Deck, Slide } from '../core/model';
  let {deck, slide, active = false, original = false}: {deck: Pick<Deck, 'width' | 'height'> & Partial<Pick<Deck, 'fonts' | 'onlineFonts' | 'designSystem'>>; slide: Slide; active?: boolean; original?: boolean} = $props();
  let host: HTMLDivElement;
  let visible = $state(false);
  onMount(() => observeThumbnail(host, value => {visible = value;}));
</script>

<div aria-hidden="true" bind:this={host} style:aspect-ratio="{deck.width} / {deck.height}">
  {#if (visible || active)&&SlideCanvas}<SlideCanvas {deck} {slide} {original} thumbnail />{/if}
</div>
