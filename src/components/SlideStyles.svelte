<script lang="ts">
  import {editor} from '../core/editor.svelte';
  import {deckDesignSystem,COLOR_LABELS} from '../core/deck-design-system';
  import ColorField from './ui/ColorField.svelte';
  import PropertyChoice from './ui/PropertyChoice.svelte';
  const system=$derived(deckDesignSystem(editor.deck??{}));
  const backgroundOptions=$derived([{value:'background',label:'Main'},{value:'dark',label:'Contrast'},{value:'',label:'Custom'},...(editor.slide?.backgroundStyle&&!['background','dark'].includes(editor.slide.backgroundStyle)?[{value:editor.slide.backgroundStyle,label:COLOR_LABELS[editor.slide.backgroundStyle]}]:[])]);
  function background(value:string){
    if(!editor.slide||((editor.slide.backgroundStyle??'')===value&&(value!=='dark'||editor.slide.adaptiveColors)))return;
    editor.commit([{op:'update_slide',slideId:editor.slide.id,patch:value?{backgroundStyle:value as 'background'|'dark'}:{background:editor.slide.background}}]);
  }
  function pattern(value:string){
    if(!editor.slide||(editor.slide.patternStyle??'document')===value)return;
    editor.commit([{op:'update_slide',slideId:editor.slide.id,patch:{patternStyle:value as 'document'|'none'}}]);
  }
</script>
{#if editor.slide}
  <div class="slide-style-controls">
    <span class="field-label">Background</span>
    <PropertyChoice label="Slide background style" value={editor.slide.backgroundStyle??''} options={backgroundOptions} onchange={background}/>
    <ColorField label="Slide background" value={editor.slide.background} allowClear={false} onchange={value=>editor.slide&&editor.commit([{op:'update_slide',slideId:editor.slide.id,patch:{background:value}}],'background')}/>
    <p class="hint">{editor.slide.backgroundStyle==='dark'?'Editable colors adapt. Locked objects and source artwork keep their colors.':editor.slide.backgroundStyle?'Follows document colors. Contrast adapts editable colors.':'Custom color for this slide.'}</p>
    {#if editor.slide.backgroundStyle&&(system.pattern.kind!=='none'||editor.slide.patternStyle==='none')}
      <span class="field-label">Pattern</span>
      <PropertyChoice label="Slide background pattern" value={editor.slide.patternStyle??'document'} options={[{value:'document',label:'Use style'},{value:'none',label:'Plain'}]} onchange={pattern}/>
      <p class="hint">{editor.slide.patternStyle==='none'?'Plain on this slide. Document colors still apply.':`${system.pattern.kind==='none'?'Plain':system.pattern.kind==='dots'?'Dots':'Grid'} · Follows document pattern`}</p>
    {/if}
  </div>
{/if}
<style>
  .slide-style-controls{display:flex;flex-direction:column;gap:8px;min-width:0}.slide-style-controls :global(.property-choice){width:100%}.hint{font-size:var(--ui-meta);line-height:var(--ui-line-reading);color:var(--text-secondary)}
</style>
