<script lang="ts">
  import {editor} from './core/editor.svelte';
  import type {Deck} from './core/model';
  import {slideLabel} from './core/slide-label';
  import {flip} from 'svelte/animate';
  import {uiCurrentSlide,uiPresence,reducedUI} from './ui-motion';
  import {Eye,EyeOff,Check,Plus,Copy,MoveUp,MoveDown,Trash2,Ellipsis,SquareDashedMousePointer,GripVertical} from '@lucide/svelte';
  import Button from './components/ui/Button.svelte';
  import ActionMenu from './components/ui/ActionMenu.svelte';
  import SlideThumbnail from './components/SlideThumbnail.svelte';
  import {slideClipboardActions} from './editor-clipboard';
  import {beginSlideSelection,endSlideSelection,selectedSlideActions,focusCurrentSlide} from './slide-selection-actions';
  import {slideSelectionDrag} from './slide-rail-drag';
  import {slideRailWindow} from './slide-rail-window';
  import {tick} from 'svelte';
  let touchDrop=$state(''),touchAfter=$state(false),touchMoving=$state(false);
  let {proposalDeck,previewDocument=null,previewActiveId='',onPreviewSelect,viewportWidth,leftWidth,draggedSlide,draggedSlides,dropSlide,dropAfter,onDragStart,slideDragOver,onDragLeave,slideDrop,onDragEnd,toggleSlideHidden,setSelectedSlidesHidden,onAdd,duplicateSlide,slideOrder}: {
    proposalDeck:boolean;viewportWidth:number;leftWidth:number;draggedSlide:string;draggedSlides:string[];dropSlide:string;dropAfter:boolean;
    previewDocument?:Deck|null;previewActiveId?:string;onPreviewSelect?:(id:string)=>void;
    onDragStart:(event:DragEvent,id:string)=>void;slideDragOver:(event:DragEvent,id:string)=>void;onDragLeave:(event:DragEvent)=>void;slideDrop:(event:DragEvent,id:string)=>void;onDragEnd:()=>void;
    toggleSlideHidden:()=>void;setSelectedSlidesHidden:(hidden:boolean)=>void;onAdd:()=>void;duplicateSlide:()=>void;slideOrder:(step:number)=>void;
  }=$props();
  let shownDrop=$derived(touchMoving?touchDrop:dropSlide),shownAfter=$derived(touchMoving?touchAfter:dropAfter);


  let shownDeck=$derived(previewDocument??editor.deck),shownActiveId=$derived(proposalDeck?previewActiveId:editor.activeId);
  // Content revisions update thumbnails without scheduling list-reorder measurements.
  let order:string[]=[];
  const shownIds=$derived.by(()=>{
    const slides=shownDeck?.slides??[];
    if(slides.length!==order.length||slides.some((slide,index)=>slide.id!==order[index])){
      order=slides.map(slide=>slide.id);
    }
    return order;
  });
  const horizontal=$derived(viewportWidth<=1100);
  const windowed=$derived(shownIds.length>60);
  let list:HTMLDivElement, focusedId=$state('');
  let size=$state(0),start=$state(0),end=$state(14);
  function updateWindow(nextSize:number,nextStart:number,nextEnd:number) {
    if(size!==nextSize)size=nextSize;
    if(start!==nextStart)start=nextStart;
    if(end!==nextEnd)end=nextEnd;
  }
  const windowReady=$derived(windowed&&size>0);
  const mountedIndices=$derived.by(()=>{
    const limit=shownIds.length;
    if(!windowed)return shownIds.map((_,index)=>index);
    const indices=new Set<number>();
    for(let index=start;index<Math.min(end,limit);index++)indices.add(index);
    // Keep the tab stop, keyboard target and native drag source in the DOM
    // even across programmatic navigation or an edge-scrolling drag.
    for(const id of [shownActiveId,focusedId,draggedSlide]){
      const index=shownIds.indexOf(id);if(index>=0)indices.add(index);
    }
    return [...indices].sort((a,b)=>a-b);
  });
  async function focusSlide(id:string) {
    focusedId=id;
    await tick();
    if(focusedId!==id||!list?.isConnected)return;
    const destination=list.querySelector<HTMLButtonElement>(`.slide-thumb[data-slide-id="${CSS.escape(id)}"]`);
    destination?.focus({preventScroll:true});
    destination?.scrollIntoView({block:'nearest',inline:'nearest'});
  }

  let selectedSlideIds=$derived(new Set(proposalDeck?[shownActiveId]:editor.selectedSlides));
  let selectedSlidePages=$derived(editor.deck?.slides.filter(slide=>selectedSlideIds.has(slide.id))??[]);
  let slideSelecting=$derived(!proposalDeck&&editor.selectingSlides);
  let hiddenSlideCount=$derived(shownDeck?.slides.filter(slide=>slide.hidden).length??0);
  let activeIndex=$derived(shownDeck?.slides.findIndex(slide=>slide.id===shownActiveId)??0);
  function slideActions(){return slideSelecting?selectedSlideActions(setSelectedSlidesHidden):[
    {label:editor.slide?.hidden?'Unhide slide':'Hide slide',icon:editor.slide?.hidden?Eye:EyeOff,shortcut:'⇧⌘H',onselect:()=>toggleSlideHidden()},
    {label:'Select slides',icon:SquareDashedMousePointer,onselect:beginSlideSelection},
    {label:'Select all slides',shortcut:'⌘A',onselect:()=>editor.selectAllSlides()},
    ...slideClipboardActions(editor.activeId),
    {label:'Duplicate current slide',icon:Copy,onselect:duplicateSlide},
    {label:'Move earlier',icon:MoveUp,disabled:activeIndex<1,onselect:()=>slideOrder(-1)},
    {label:'Move later',icon:MoveDown,disabled:activeIndex>=(editor.deck?.slides.length||1)-1,onselect:()=>slideOrder(1)},
    {label:'Delete current slide',icon:Trash2,tone:'danger' as const,divider:true,disabled:(editor.deck?.slides.length||0)<2,onselect:()=>editor.slide&&editor.commit([{op:'delete_slide',slideId:editor.slide.id}])},
  ];}
  function slideKey(event: KeyboardEvent) {
    if(event.defaultPrevented||event.isComposing||event.keyCode===229)return;
    if(event.altKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();event.stopPropagation();if(!proposalDeck){editor.moveSlides(editor.selectedSlides,event.key==='Home'?'start':event.key==='End'?'end':['ArrowLeft','ArrowUp'].includes(event.key)?'earlier':'later');focusCurrentSlide();}return;}
    if(event.altKey)return;
    const button=event.currentTarget as HTMLButtonElement,cmd=event.ctrlKey||event.metaKey;
    const id=button.dataset.slideId!;
    if(cmd&&!event.shiftKey&&event.key.toLowerCase()==='a') {event.preventDefault();event.stopPropagation();if(!proposalDeck)editor.selectAllSlides();return;}
    if(event.key==='Escape'&&slideSelecting){event.preventDefault();event.stopPropagation();endSlideSelection();return;}
    if(event.key===' '){event.preventDefault();event.stopPropagation();if(!proposalDeck&&!event.repeat)editor.selectSlide(id,{toggle:true,range:event.shiftKey});return;}
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    const index=shownIds.indexOf(id);
    event.preventDefault();event.stopPropagation();
    const next=shownIds[event.key==='Home'?0:event.key==='End'?shownIds.length-1:Math.max(0,Math.min(shownIds.length-1,index+(['ArrowRight','ArrowDown'].includes(event.key)?1:-1)))];
    if(next){if(proposalDeck)onPreviewSelect?.(next);else editor.selectSlide(next,{range:event.shiftKey,additive:cmd,focusOnly:!event.shiftKey&&(cmd||editor.slideSelectionMode)});void focusSlide(next);}
  }
</script>
        <div class="rail-head"><span>Slides <small>{shownDeck?.slides.length ?? 0}</small></span>{#if hiddenSlideCount}<small class="rail-hidden-count">{hiddenSlideCount} hidden</small>{/if}</div>
        {#if slideSelecting}<div class="slide-selection-status" class:narrow-rail={leftWidth<180&&viewportWidth>1100}><span role="status" aria-live="polite" aria-atomic="true">{touchMoving||draggedSlide?'Moving ':''}{selectedSlidePages.length}{touchMoving||draggedSlide?' slides':' selected'}</span><div class="slide-selection-grip" use:slideSelectionDrag={{start:()=>!proposalDeck&&editor.deck&&selectedSlidePages.length?{ids:[...editor.selectedSlides],deckId:editor.deck.id,revision:editor.deck.revision}:undefined,preview:(target,after,moving)=>{touchDrop=target;touchAfter=after;touchMoving=moving;},drop:(snapshot,target,after)=>{if(!proposalDeck&&editor.deck?.id===snapshot.deckId){editor.dropSlides(snapshot.ids,target,after,snapshot.revision);focusCurrentSlide();}}}}><Button kind="icon" aria-label="Drag selected slides to reorder" title="Drag selected slides to reorder" disabled={!selectedSlidePages.length||proposalDeck} onkeydown={slideKey}><GripVertical size={16}/></Button></div><Button kind="text" aria-label="Done selecting slides" onclick={endSlideSelection}>Done</Button></div>{/if}
        <div class="slide-list" role="listbox" aria-label="Slides" aria-multiselectable="true" aria-orientation={horizontal?'horizontal':'vertical'}
          bind:this={list} class:windowed={windowReady} style:--rail-item-size={windowReady?`${size}px`:undefined} style:--rail-item-count={windowReady?shownIds.length:undefined}
          use:uiCurrentSlide={`${shownActiveId}:${windowReady}:${horizontal}`} use:slideRailWindow={{enabled:windowed,horizontal,count:shownIds.length,active:shownActiveId,update:updateWindow}}>
          {#each mountedIndices as i (shownIds[i])}{@const id=shownIds[i]}{@const slide=shownDeck!.slides[i]}<button class="slide-thumb" role="option" aria-selected={selectedSlideIds.has(slide.id)} aria-setsize={windowed?shownIds.length:undefined} aria-posinset={windowed?i+1:undefined}
          style:grid-row={windowReady&&!horizontal?i+1:undefined} style:grid-column={windowReady&&horizontal?i+1:undefined} onfocus={()=>focusedId=id} class:slide-selected={slideSelecting&&selectedSlideIds.has(slide.id)} data-slide-id={slide.id} draggable={!proposalDeck} class:dragging={draggedSlides.includes(slide.id)||touchMoving&&selectedSlideIds.has(slide.id)} class:drop-before={shownDrop===slide.id&&!shownAfter} class:drop-after={shownDrop===slide.id&&shownAfter} ondragstart={event=>onDragStart(event,slide.id)} ondragover={event=>slideDragOver(event,slide.id)} ondragleave={onDragLeave} ondrop={event=>slideDrop(event,slide.id)} ondragend={onDragEnd} animate:flip={{duration: reducedUI() ? 0 : 220}} in:uiPresence={{y: 4}} class:current={slide.id === shownActiveId} class:hidden-slide={slide.hidden} onpointerdown={event=>{if(event.button===2)event.preventDefault();}} onclick={event => proposalDeck?onPreviewSelect?.(slide.id):editor.selectSlide(slide.id,{toggle:event.metaKey||event.ctrlKey,range:event.shiftKey,additive:event.metaKey||event.ctrlKey})} onkeydown={slideKey} tabindex={slide.id === shownActiveId ? 0 : -1} aria-describedby="slide-rail-help" aria-label={`${slideLabel(i)}${slide.hidden?' · Hidden from presentation':''}`} aria-current={slide.id === shownActiveId ? 'page' : undefined}><span class="sr-only">Slide </span><span class="thumb-number">{String(i + 1).padStart(2, '0')}</span><div class="thumb-image" aria-hidden="true"><SlideThumbnail deck={shownDeck!} {slide} active={slide.id === shownActiveId} original={editor.sourceMode&&!proposalDeck} /></div>{#if slideSelecting}<span class="thumb-selection-mark" aria-hidden="true">{#if selectedSlideIds.has(slide.id)}<Check size={12}/>{/if}</span>{/if}{#if slide.hidden}<span class="thumb-hidden-mark" aria-hidden="true"><EyeOff size={14}/></span>{/if}</button>{/each}</div>
        <div class="rail-foot rail-actions" role="group" aria-label="Slide actions"><button class="text-btn full" disabled={!editor.deck||Boolean(proposalDeck)} aria-label="Add slide" title="Add slide" onclick={onAdd}><Plus /><span>{leftWidth<160?'Add':'Add slide'}</span></button><ActionMenu label={slideSelecting?'Selected slide actions':'Current slide actions'} iconOnly disabled={!editor.slide||Boolean(proposalDeck)} items={slideActions()}><Ellipsis size={16} /></ActionMenu></div>

<style>
  .slide-list.windowed {
    display: grid;
    overflow-anchor: none;
    align-content: start;
    align-items: start;
  }
  .slide-list.windowed[aria-orientation="vertical"] {
    grid-template-columns: minmax(0, 1fr);
    grid-auto-rows: var(--rail-item-size);
  }
  .slide-list.windowed[aria-orientation="horizontal"] {
    grid-template-rows: minmax(0, 1fr);
    grid-auto-columns: var(--rail-item-size);
  }
  .slide-list.windowed::after {
    content: '';
    width: 0;
    height: 0;
    pointer-events: none;
  }
  .slide-list.windowed[aria-orientation="vertical"]::after {
    grid-row: var(--rail-item-count);
    grid-column: 1;
  }
  .slide-list.windowed[aria-orientation="horizontal"]::after {
    grid-column: var(--rail-item-count);
    grid-row: 1;
  }
  .slide-list.windowed[aria-orientation="vertical"] > .slide-thumb { grid-column: 1; }
  .slide-list.windowed[aria-orientation="horizontal"] > .slide-thumb { grid-row: 1; }
</style>
