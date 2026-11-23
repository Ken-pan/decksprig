<script lang="ts">
  import {onMount,tick,untrack,type Snippet} from 'svelte';
  import {Virtualizer,defaultRangeExtractor,elementScroll,observeElementRect,observeElementOffset,type VirtualItem,type Range} from '@tanstack/virtual-core';
  import type {LibraryDocument} from '../core/document-library-view';
  import {libraryNavigationIndex} from '../core/library-navigation';

  let {documents,view,card}:{documents:LibraryDocument[];view:string;card:Snippet<[LibraryDocument,number,number]>}=$props();
  const hint=$props.id();
  let host:HTMLDivElement;
  let instance=$state.raw<Virtualizer<HTMLElement,HTMLDivElement>>();
  let rows=$state.raw<VirtualItem[]>([]),total=$state(0),columns=$state(3),gap=$state(16),margin=$state(0),estimate=$state(300);
  let active=$state('');
  const windowed=$derived(documents.length>60);
  let previous:LibraryDocument[]|undefined,layout='',navigation=0,pendingAnchor:number|undefined;

  function refresh(virtual:Virtualizer<HTMLElement,HTMLDivElement>){
    untrack(()=>{
      rows=virtual.getVirtualItems();total=virtual.getTotalSize();
      if(!active&&windowed)active=documents[0]?.id??'';
    });
  }
  function geometry(){
    const scroll=host.closest<HTMLElement>('.modal-body');if(!scroll)return;
    const style=getComputedStyle(host),nextColumns=Number(style.getPropertyValue('--library-columns'))||1,nextGap=parseFloat(style.getPropertyValue('--library-gap'))||0;
    const nextMargin=host.getBoundingClientRect().top-scroll.getBoundingClientRect().top+scroll.scrollTop-scroll.clientTop;
    const key=`${host.clientWidth}:${view}:${getComputedStyle(document.documentElement).fontSize}:${nextColumns}:${nextGap}`;
    if(layout!==key){
      const focusedItem=fileFor(document.activeElement),focusIndex=focusedItem?documents.findIndex(d=>d.id===focusedItem.dataset.deckId):-1;
      const actions=document.activeElement instanceof Element&&!document.activeElement.matches('.doc-library-open');
      if(layout&&instance?.range)pendingAnchor=instance.range.startIndex*columns;
      layout=key;columns=nextColumns;gap=nextGap;
      const measured=host.querySelector<HTMLElement>('.doc-library-row')?.getBoundingClientRect().height;
      estimate=measured&&measured>0?measured:view==='list'?96:300;
      instance?.measure();
      // Regrouping rows replaces their DOM. Keep the same document and control
      // focused when a resize or enlarged text changes the number of columns.
      if(focusIndex>=0){pendingAnchor=undefined;void focusFile(focusIndex,actions);}
    }
    if(Math.abs(margin-nextMargin)>.5)margin=nextMargin;
  }
  const visibleRange=$derived.by(()=>{
    // Retain one keyboard entry even while focus is on the toolbar or storage
    // hint. Tabbing out and back must return to the same document after scroll.
    const source=documents,size=columns,pin=active;
    const pinned=pin?Math.floor(source.findIndex(d=>d.id===pin)/size):-1;
    return (range:Range)=>{const indices=defaultRangeExtractor(range);if(pinned>=0&&!indices.includes(pinned))indices.push(pinned);return indices.sort((a,b)=>a-b);};
  });
  const rowKey=$derived.by(()=>{const source=documents,size=columns,mode=view;return (index:number)=>`${mode}:${size}:${source[index*size]?.id??index}`;});
  $effect(()=>{
    const virtual=instance,source=documents,enabled=windowed,size=columns,spacing=gap,offset=margin,height=estimate,range=visibleRange,key=rowKey;
    if(!virtual)return;
    untrack(()=>{
      const changed=previous!==source;previous=source;
      if(changed){active=source[0]?.id??'';pendingAnchor=undefined;}
      virtual.setOptions({...virtual.options,count:Math.ceil(source.length/size),enabled,estimateSize:()=>height,gap:spacing,scrollMargin:offset,rangeExtractor:range,getItemKey:key});
      virtual._willUpdate();refresh(virtual);
      if(changed)host.closest<HTMLElement>('.modal-body')?.scrollTo({top:0,behavior:'instant'});
      if(pendingAnchor!==undefined){const anchor=pendingAnchor;pendingAnchor=undefined;void tick().then(()=>virtual.scrollToIndex(Math.floor(anchor/size),{align:'start'}));}
    });
  });
  function measureRow(node:HTMLDivElement,value:{virtual:typeof instance;index:number}){
    const update=(next:typeof value)=>{value=next;node.dataset.index=String(next.index);next.virtual?.measureElement(node);};update(value);
    return {update,destroy:()=>queueMicrotask(()=>value.virtual?.measureElement(null))};
  }
  // ActionMenu's native trigger stays in its existing DOM structure. Only this
  // library's mounted triggers participate in the same roving stop as the file.
  $effect(()=>{
    const id=active,enabled=windowed;rows;documents;
    void tick().then(()=>{for(const item of host?.querySelectorAll<HTMLElement>('.doc-library-file')??[]){const trigger=item.querySelector<HTMLButtonElement>('.ui-action-menu-trigger > button');if(trigger)trigger.tabIndex=!enabled||item.dataset.deckId===id?0:-1;}});
  });
  function fileFor(target:EventTarget|null){return target instanceof Element?target.closest<HTMLElement>('.doc-library-file'):null;}
  function focusIn(event:FocusEvent){const item=fileFor(event.target);if(item)active=item.dataset.deckId??'';}
  async function focusFile(index:number,actions=false){
    const id=documents[index]?.id;if(!id)return;
    const current=++navigation;active=id;
    await tick();if(current!==navigation||!host.isConnected)return;
    instance?.scrollToIndex(Math.floor(index/columns),{align:'auto'});await tick();
    if(current!==navigation||!host.isConnected)return;
    const item=Array.from(host.querySelectorAll<HTMLElement>('.doc-library-file')).find(e=>e.dataset.deckId===id);
    const button=item?.querySelector<HTMLButtonElement>(actions?'.ui-action-menu-trigger > button':'.doc-library-open');
    button?.focus({preventScroll:true});button?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  }
  async function key(event:KeyboardEvent){
    if(event.defaultPrevented||event.isComposing||event.keyCode===229||event.altKey||event.ctrlKey||event.metaKey)return;
    const target=event.target;if(!(target instanceof HTMLElement)||!target.matches('.doc-library-open'))return;
    const item=fileFor(target);if(!item)return;
    if(event.shiftKey)return;
    const index=documents.findIndex(d=>d.id===item.dataset.deckId),height=instance?.scrollRect?.height??300;
    const next=libraryNavigationIndex(event.key,index,documents.length,view==='list'?1:columns,Math.max(1,Math.floor(height/(estimate+gap))));
    if(next===undefined)return;event.preventDefault();event.stopPropagation();
    await focusFile(next);
  }
  onMount(()=>{
    const virtual=new Virtualizer<HTMLElement,HTMLDivElement>({count:0,enabled:false,getScrollElement:()=>host.closest<HTMLElement>('.modal-body'),estimateSize:()=>300,overscan:2,observeElementRect,observeElementOffset,scrollToFn:elementScroll,onChange:refresh,
      // Keep CSS's fractional row heights; rounding each row accumulates visible
      // gaps after resizing or enlarging text, unlike the ordinary grid layout.
      measureElement:(node,entry)=>entry?.borderBoxSize?.[0]?.blockSize??node.getBoundingClientRect().height});
    instance=virtual;const dispose=virtual._didMount(),resize=new ResizeObserver(geometry);
    resize.observe(host);if(host.parentElement)resize.observe(host.parentElement);
    host.addEventListener('focusin',focusIn);host.addEventListener('keydown',key);geometry();
    return ()=>{navigation++;resize.disconnect();dispose();host.removeEventListener('focusin',focusIn);host.removeEventListener('keydown',key);};
  });
  $effect(()=>{view;void tick().then(()=>{if(host?.isConnected)geometry();});});
</script>

<p id={hint} class="sr-only">Use arrow keys to browse documents, Home or End to jump, and Shift F10 for document actions.</p>
<div class="doc-library-files" data-view={view} data-windowed={windowed||undefined} bind:this={host} role="list" aria-label="Documents" aria-describedby={hint} style:height={windowed?`${total}px`:undefined}>
  {#if windowed}
    {#each rows as row (row.key)}
      <div class="doc-library-row" data-index={row.index} style:top={`${row.start-margin}px`} use:measureRow={{virtual:instance,index:row.index}} role="presentation">
        {#each documents.slice(row.index*columns,(row.index+1)*columns) as document,index (document.id)}
          {@render card(document,row.index*columns+index,active===document.id?0:-1)}
        {/each}
      </div>
    {/each}
  {:else}
    {#each documents as document,index (document.id)}{@render card(document,index,0)}{/each}
  {/if}
</div>
