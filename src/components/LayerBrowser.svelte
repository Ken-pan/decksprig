<script lang="ts">
  import {rememberPanelScroll} from '../panel-scroll.svelte';
  import {tick,untrack,onDestroy} from 'svelte';
  import {editor} from '../core/editor.svelte';
  import {elementLabel} from './element-labels';
  import {Eye,EyeOff,Lock,Unlock,Group,ChevronDown,ChevronRight,GripVertical,PanelTop,Layers,Search,X,Pencil,Ellipsis} from '@lucide/svelte';
  import {elementIcon} from './icons';
  import {layoutIcons} from './icons/layout-icons';
  import {countLabel} from '../core/ui-copy';
  import {isPointerGestureActive} from '../pointer-cursor';
  import {LayerDrag} from '../layer-drag.svelte';
  import {uiDisclosure} from '../ui-motion';
  import {ActionMenu, EmptyState} from './ui';
  let {disabled=false,active=true}:{disabled?:boolean;active?:boolean}=$props();
  let root=$state<HTMLElement>(),list=$state<HTMLElement>();
  let query=$state(''),helpOpen=$state(false);
  let collapsedBySlide=$state<Record<string,string[]>>({});
  const foldScope=$derived(`${editor.deck?.id}:${editor.activeId}`);
  rememberPanelScroll(()=>active,()=>foldScope,()=>[root,list]);
  let collapsed=$derived(collapsedBySlide[foldScope]??[]);
  let selectionUnits=$derived(new Set(editor.slide?selectionRoots(editor.slide,editor.selected,editor.selectionScope):[]));
  function fold(id:string,value:boolean){const current=collapsedBySlide[foldScope]??[];collapsedBySlide={...collapsedBySlide,[foldScope]:value?[...new Set([...current,id])]:current.filter(v=>v!==id)};}
  import {createContainerTree,selectionRoots} from '../core/container-tree';
  import type {SlideElement,Slide} from '../core/model';
  import {layerRangeSelection,renameLayerOperations,type LayerRow as Row} from '../core/layer-browser';
  let anchor='',typeahead='',typedAt=0;
  let renaming=$state<{id:string;deckId:string;slideId:string;revision:number;name:string}>(),renameError=$state('');
  function clearSearch(){query='';root?.querySelector<HTMLInputElement>('.layer-search')?.focus();}
  function chooseRow(row:Row,event:MouseEvent){
    if(drag.view||renaming)return;
    if(event.shiftKey&&tree){const ids=layerRangeSelection(layers,anchor||row.id,row.id,tree);editor.selected=event.metaKey||event.ctrlKey?[...new Set([...editor.selected,...ids])]:ids;editor.selectedGroup='';editor.editingGroupId='';}
    else{editor.choose(row.id,event.metaKey||event.ctrlKey||editor.additiveSelection,Boolean(row.layer));anchor=row.id;}
  }
  async function rename(row:Row){
    if(disabled||drag.view||row.layer?.locked||row.group&&tree?.stats.get(row.id)?.locked||!editor.deck)return;
    renameError='';renaming={id:row.id,deckId:editor.deck.id,slideId:editor.activeId,revision:editor.deck.revision,name:row.name??row.layer!.name};
    await tick();const input=list?.querySelector<HTMLInputElement>('.layer-rename');input?.focus();input?.select();
  }
  async function finishRename(cancel=false,focus=false){
    const target=renaming;if(!target)return;renaming=undefined;
    if(!cancel&&active&&editor.deck?.id===target.deckId&&editor.activeId===target.slideId&&tree){if(editor.deck.revision!==target.revision)renameError='The document changed. Rename the layer again.';else editor.commit(renameLayerOperations(target.slideId,target.id,target.name,tree),'','manual',target.revision);}
    await tick();if(focus)list?.querySelector<HTMLElement>(`[data-layer-row="${CSS.escape(target.id)}"] .layer-name,[data-layer-row="${CSS.escape(target.id)}"] .layer-group-name`)?.focus();
  }
  function renameKey(event:KeyboardEvent){if(event.isComposing||event.keyCode===229)return;event.stopPropagation();if(event.key==='Escape'||event.key==='Enter'){event.preventDefault();void finishRename(event.key==='Escape',true);}}
  function groupState(row:Row,property:'hidden'|'locked'){if(!tree||!editor.slide||disabled)return;const members=tree.descendants(row.id);if(property==='hidden'&&members.some(e=>e.locked))return;const value=property==='hidden'?members.some(e=>!e.hidden):!members.some(e=>e.locked);editor.commit(members.map(e=>({op:'update_element',slideId:editor.slide!.id,elementId:e.id,patch:{[property]:value}})));}
  $effect(()=>{const scope=foldScope;untrack(()=>{anchor='';if(renaming&&`${renaming.deckId}:${renaming.slideId}`!==scope)renaming=undefined;});});
  const contentElements=$derived(editor.slide?.elements.filter(e=>!e.designPattern)??[]);
  let tree=$derived(editor.slide?createContainerTree({...editor.slide,elements:contentElements}):undefined);
  let layers=$derived.by(()=>{
    const candidate=editor.slide;if(!candidate)return[];const slide:Slide=candidate;
    const index=tree!,term=query.trim().toLocaleLowerCase(),rows:Row[]=[],matched=new Set<string>();
    if(term)for(const e of contentElements)if(`${e.name} ${e.text}`.toLocaleLowerCase().includes(term)){matched.add(e.id);for(const id of index.ancestors(e.id))matched.add(id);}
    function visit(parent:string|undefined,depth:number,inherited=false){
      const children:Row[]=[...(index.directElements.get(parent)??[]).map(layer=>({id:layer.id,layer,depth})),...(index.childGroups.get(parent)??[]).map(group=>({id:group.id,group,depth,name:index.layouts.get(group.id)?.name??group.name,count:index.stats.get(group.id)?.count??0,layout:index.layouts.has(group.id)}))];
      const order=index.layouts.get(parent??'')?.order,positions=order?new Map(order.map((id,i)=>[id,i])):undefined;
      children.sort((a,b)=>positions?(positions.get(a.id)??order!.length)-(positions.get(b.id)??order!.length):(index.rank.get(b.id)??-1)-(index.rank.get(a.id)??-1));
      for(const child of children){
        if(child.group){const named=child.name!.toLocaleLowerCase().includes(term);if(term&&!inherited&&!named&&!matched.has(child.id))continue;rows.push(child);if(term||!collapsed.includes(child.id))visit(child.id,depth+1,inherited||named);}
        else if(!term||inherited||matched.has(child.id))rows.push(child);
      }
    }
    visit(undefined,0);return rows;
  });
  const labels=$derived(new Map(contentElements.map(e=>[e.id,e.type==='text'?(e.text.slice(0,200).trim().replace(/\s+/g,' ')+(e.text.length>200?'…':'')||e.name):e.name])));
  function label(e:SlideElement){return labels.get(e.id)??e.name;}
  const drag=new LayerDrag({root:()=>root,list:()=>root&&getComputedStyle(root).overflowY==='auto'?root:list,rows:()=>layers,collapsed:()=>collapsed,fold,disabled:()=>!active||disabled||Boolean(renaming)});
  $effect(()=>{active;disabled;editor.sourceMode;editor.deck?.id;editor.deck?.revision;editor.activeId;untrack(()=>drag.check());});
  $effect(()=>{query;untrack(()=>drag.cancel());});
  onDestroy(()=>drag.cancel(false));
  $effect(()=>{if(!active)untrack(()=>{drag.cancel(false);renaming=undefined;editor.hovered='';});});
  function dropClass(id:string){return drag.view?.drop?.target===id?drag.view.drop.position:undefined;}
  $effect(()=>{
    const slide=editor.slide,index=tree,key=editor.selected.join(','),group=editor.selectedContainer;
    if(!slide||!index||!key)return;
    const ancestors=new Set((group?[group]:editor.selected).flatMap(id=>index.ancestors(id)));
    untrack(()=>{const current=collapsedBySlide[foldScope]??[];if(current.some(id=>ancestors.has(id)))collapsedBySlide={...collapsedBySlide,[foldScope]:current.filter(id=>!ancestors.has(id))};});
  });
  async function navigate(event:KeyboardEvent) {
    if(drag.view||event.defaultPrevented||event.isComposing||event.keyCode===229||event.altKey||event.ctrlKey||event.metaKey)return;
    const list=event.currentTarget as HTMLElement,target=event.target as HTMLElement;if(target instanceof HTMLInputElement)return;const row=target.closest<HTMLElement>('[data-layer-row]');if(!row)return;
    const index=layers.findIndex(v=>v.id===row.dataset.layerRow);if(index<0)return;
    const current=layers[index];let next=index;
    if(event.key==='F2'){event.preventDefault();event.stopPropagation();void rename(current);return;}
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
      if(target.matches('.layer-name,.layer-group-name')&&event.key.length===1&&event.key.trim()){
        event.preventDefault();event.stopPropagation();const now=Date.now(),letter=event.key.toLocaleLowerCase();typeahead=now-typedAt>700?letter:typeahead+letter;typedAt=now;const prefix=[...typeahead].every(c=>c===letter)?letter:typeahead;
        for(let i=1;i<=layers.length;i++){const at=(index+i)%layers.length,candidate=layers[at];if((candidate.name??candidate.layer?.name??'').toLocaleLowerCase().startsWith(prefix)){list.querySelector<HTMLElement>(`[data-layer-row="${CSS.escape(candidate.id)}"] .layer-name,[data-layer-row="${CSS.escape(candidate.id)}"] .layer-group-name`)?.focus();break;}}
      }return;
    }
    if(event.key==='ArrowRight'){
      if(!current.group)return;
      if(collapsed.includes(current.id))fold(current.id,false);else if(layers[index+1]?.depth>current.depth)next=index+1;
    }else if(event.key==='ArrowLeft'){
      if(current.group&&!collapsed.includes(current.id))fold(current.id,true);
      else{for(let i=index-1;i>=0;i--)if(layers[i].depth<current.depth){next=i;break;}}
    }else next=event.key==='Home'?0:event.key==='End'?layers.length-1:Math.max(0,Math.min(layers.length-1,index+(event.key==='ArrowDown'?1:-1)));
    event.preventDefault();event.stopPropagation();const id=layers[next]?.id;if(event.shiftKey&&tree&&['ArrowUp','ArrowDown','Home','End'].includes(event.key)){if(!anchor)anchor=current.id;editor.selected=layerRangeSelection(layers,anchor,id,tree);editor.selectedGroup='';editor.editingGroupId='';}await tick();
    list.querySelector<HTMLElement>(`[data-layer-row="${CSS.escape(id)}"] .layer-name,[data-layer-row="${CSS.escape(id)}"] .layer-group-name`)?.focus();
  }
</script>
<svelte:window onblur={()=>drag.cancel()}/>
<svelte:document onvisibilitychange={()=>{if(document.hidden)drag.cancel();}}/>
<section bind:this={root} class="layer-browser" aria-label="Slide layers" onfocusout={event=>drag.focusOut(event)}>
  {#if active}<div class="layer-browser-header"><div class="layer-search-field"><Search size={14} aria-hidden="true"/><input class="layer-search" type="search" aria-label="Search layers" placeholder="Search layers" disabled={Boolean(drag.view)} bind:value={query} onkeydown={event=>{if(event.key==='Escape'&&query&&!event.isComposing){event.preventDefault();event.stopPropagation();clearSearch();}}}/>{#if query}<button class="layer-search-clear" aria-label="Clear layer search" onclick={clearSearch}><X size={14}/></button>{/if}</div><div class="layer-list-context"><span aria-live="polite">{query.trim()?`${layers.filter(row=>row.layer).length} of ${contentElements.length} objects`:`${countLabel(contentElements.length,'object')} · ${countLabel(tree?.groups.length??0,'group')}`}</span><ActionMenu label="Layer list actions" iconOnly disabled={Boolean(drag.view)} items={[{label:'Expand all groups',disabled:!tree?.groups.length,onselect:()=>collapsedBySlide={...collapsedBySlide,[foldScope]:[]}},{label:'Collapse all groups',disabled:!tree?.groups.length,onselect:()=>collapsedBySlide={...collapsedBySlide,[foldScope]:tree?.groups.map(g=>g.id)??[]}}]}><Ellipsis size={16} aria-hidden="true"/></ActionMenu></div>
    <div class="layer-root" data-layer-root class:drop-inside={drag.view?.drop?.target===null} class:drop-invalid={drag.view?.drop?.target===null&&Boolean(drag.view.invalid)}><PanelTop size={14}/><span>Slide</span><small>{drag.view?'Drop here to move out':'Drag to reorder'}</small></div>
  </div>
  <!-- Keyboard navigation complements native button activation within this group. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div bind:this={list} class="layer-list" onkeydown={navigate}>
    {#each layers as row (row.id)}
      {#if row.group}
        {@const group=row.group}{@const name=row.name!}
        <div class="layer-group" data-layer-row={row.id} data-layer-drop={dropClass(row.id)} style:--layer-depth={row.depth} class:chosen={selectionUnits.has(group.id)} class:previewed={editor.hovered===group.id} class:layer-moving={drag.view?.ids.includes(row.id)} class:drop-invalid={dropClass(row.id)&&Boolean(drag.view?.invalid)}>
          <button class="layer-grip" disabled={disabled||Boolean(renaming)||tree!.stats.get(row.id)?.locked} aria-label={`Move group: ${name}`} aria-describedby="layer-move-help layer-move-keyboard-help" aria-pressed={Boolean(drag.view?.ids.includes(row.id))} title={tree!.stats.get(row.id)?.locked?'Unlock all group contents to move':`Drag ${name} to move`} onpointerdown={event=>drag.pointerDown(event,row.id)} onpointermove={event=>drag.pointerMove(event)} onpointerup={event=>drag.pointerUp(event)} onpointercancel={event=>drag.pointerCancel(event)} onlostpointercapture={event=>drag.pointerCancel(event)} onkeydown={event=>drag.key(event,row.id)} onclick={event=>event.preventDefault()}><GripVertical size={14}/></button>
          <button class="icon-btn small" aria-disabled={Boolean(drag.view)} aria-label={`${collapsed.includes(group.id)?'Expand':'Collapse'} group: ${name}`} aria-expanded={!collapsed.includes(group.id)} onclick={()=>{if(!drag.view)fold(group.id,!collapsed.includes(group.id))}}>{#if collapsed.includes(group.id)}<ChevronRight size={14}/>{:else}<ChevronDown size={14}/>{/if}</button>
{#if renaming?.id===row.id}<input class="layer-rename" aria-label="Rename layer" maxlength="200" bind:value={renaming.name} onkeydown={renameKey} onblur={()=>void finishRename()}/>{:else}          <button class="layer-group-name" aria-disabled={Boolean(drag.view)} aria-pressed={selectionUnits.has(group.id)} aria-label={`Select group: ${name}`} title={`${name} · Level ${row.depth+1}`} onpointerenter={event=>{if(event.pointerType!=='touch'&&!event.buttons&&!drag.view&&!isPointerGestureActive())editor.hovered=group.id;}} onpointerleave={event=>{if(editor.hovered===group.id&&!event.currentTarget.matches(':focus-visible'))editor.hovered='';}} onfocus={event=>{if(event.currentTarget.matches(':focus-visible')&&!isPointerGestureActive())editor.hovered=group.id;}} onblur={()=>{if(editor.hovered===group.id)editor.hovered='';}} onclick={event=>chooseRow(row,event)} ondblclick={()=>rename(row)}>{#if row.layout}{@const LayoutIcon=layoutIcons[tree!.layouts.get(group.id)!.direction]}<LayoutIcon size={14}/>{:else}<Group size={14}/>{/if}<span>{name}</span><small>{row.count}</small></button>{/if}
          <div class="layer-more"><ActionMenu label={`Group actions: ${name}`} iconOnly disabled={disabled||Boolean(drag.view)} items={[{label:'Rename group',icon:Pencil,shortcut:'F2',disabled:tree!.stats.get(row.id)?.locked,onselect:()=>void rename(row)},{label:tree!.stats.get(row.id)?.visible?'Hide group':'Show group',disabled:tree!.stats.get(row.id)?.locked,icon:tree!.stats.get(row.id)?.visible?EyeOff:Eye,onselect:()=>groupState(row,'hidden')},{label:tree!.stats.get(row.id)?.locked?'Unlock group':'Lock group',icon:Lock,onselect:()=>groupState(row,'locked')}]}><Ellipsis size={16} aria-hidden="true"/></ActionMenu></div>
        </div>
      {:else if row.layer}
        {@const layer=row.layer}{@const Icon=elementIcon(layer)}
      <div class="layer-row" data-layer-row={row.id} data-layer-drop={dropClass(row.id)} style:--layer-depth={row.depth} class:chosen={selectionUnits.has(layer.id)} class:previewed={editor.hovered===layer.id} class:layer-hidden={layer.hidden} class:layer-moving={drag.view?.ids.includes(row.id)} class:drop-invalid={dropClass(row.id)&&Boolean(drag.view?.invalid)}>
        <button class="layer-grip" disabled={disabled||Boolean(renaming)||layer.locked} aria-label={`Move layer: ${layer.name}`} aria-describedby="layer-move-help layer-move-keyboard-help" aria-pressed={Boolean(drag.view?.ids.includes(row.id))} title={layer.locked?'Unlock this layer to move':`Drag ${layer.name} to move`} onpointerdown={event=>drag.pointerDown(event,row.id)} onpointermove={event=>drag.pointerMove(event)} onpointerup={event=>drag.pointerUp(event)} onpointercancel={event=>drag.pointerCancel(event)} onlostpointercapture={event=>drag.pointerCancel(event)} onkeydown={event=>drag.key(event,row.id)} onclick={event=>event.preventDefault()}><GripVertical size={14}/></button>
{#if renaming?.id===row.id}<input class="layer-rename" aria-label="Rename layer" maxlength="200" bind:value={renaming.name} onkeydown={renameKey} onblur={()=>void finishRename()}/>{:else}        <button class="layer-name" aria-label={`Select layer: ${layer.name}`} aria-disabled={Boolean(drag.view)} aria-pressed={selectionUnits.has(layer.id)} title={`${layer.name} · ${label(layer)}`} onpointerenter={event=>{if(event.pointerType!=='touch'&&!event.buttons&&!isPointerGestureActive())editor.hovered=layer.id;}} onpointerleave={event=>{if(editor.hovered===layer.id&&!event.currentTarget.matches(':focus-visible'))editor.hovered='';}} onfocus={event=>{if(event.currentTarget.matches(':focus-visible')&&!isPointerGestureActive())editor.hovered=layer.id;}} onblur={()=>{if(editor.hovered===layer.id)editor.hovered='';}} onclick={event=>chooseRow(row,event)} ondblclick={()=>rename(row)}>
          {#if layer.type==='image'&&layer.src}<img class="layer-thumbnail" src={layer.src} alt="" loading="lazy" decoding="async"/>{:else}<Icon size={14}/>{/if}
          <span class="layer-label"><span>{layer.name}</span>{#if layer.type==='text'&&label(layer)!==layer.name}<small>{label(layer)}{layer.hidden?' · Hidden':''}{layer.locked?' · Locked':''}</small>{:else}<small class:kind-only={!layer.hidden&&!layer.locked}>{elementLabel(layer)}{layer.hidden?' · Hidden':''}{layer.locked?' · Locked':''}</small>{/if}</span>
        </button>{/if}
        <button class="icon-btn small layer-control" disabled={disabled||layer.locked||Boolean(drag.view)} class:layer-state={layer.hidden} title={layer.locked?'Unlock this layer to change visibility':undefined} aria-label={`${layer.hidden?'Show':'Hide'} layer: ${layer.name}`} aria-pressed={layer.hidden} onclick={()=>editor.commit([{op:'update_element',slideId:editor.slide!.id,elementId:layer.id,patch:{hidden:!layer.hidden}}])}>{#if layer.hidden}<EyeOff/>{:else}<Eye/>{/if}</button>
        <button class="icon-btn small layer-control" disabled={disabled||Boolean(drag.view)} class:layer-state={layer.locked} aria-label={`${layer.locked?'Unlock':'Lock'} layer: ${layer.name}`} aria-pressed={layer.locked} onclick={()=>editor.commit([{op:'update_element',slideId:editor.slide!.id,elementId:layer.id,patch:{locked:!layer.locked}}])}>{#if layer.locked}<Lock/>{:else}<Unlock/>{/if}</button>
        <div class="layer-more"><ActionMenu label={`Layer actions: ${layer.name}`} iconOnly disabled={disabled||Boolean(drag.view)} items={[{label:'Rename layer',icon:Pencil,shortcut:'F2',disabled:layer.locked,onselect:()=>void rename(row)},{label:layer.hidden?'Show layer':'Hide layer',disabled:layer.locked,icon:layer.hidden?Eye:EyeOff,onselect:()=>editor.commit([{op:'update_element',slideId:editor.slide!.id,elementId:layer.id,patch:{hidden:!layer.hidden}}])},{label:layer.locked?'Unlock layer':'Lock layer',icon:layer.locked?Unlock:Lock,onselect:()=>editor.commit([{op:'update_element',slideId:editor.slide!.id,elementId:layer.id,patch:{locked:!layer.locked}}])}]}><Ellipsis size={16} aria-hidden="true"/></ActionMenu></div>
      </div>
      {/if}
    {:else}<EmptyState density="compact" icon={query.trim() ? Search : Layers} title={query.trim() ? 'No matching layers' : 'No objects yet'} description={query.trim() ? 'Try another name or clear your search.' : 'Add text, shapes, or resources from the canvas toolbar.'}>{#if query.trim()}<button class="text-btn ghost" onclick={()=>{query='';root?.querySelector<HTMLInputElement>('.layer-search')?.focus();}}>Clear search</button>{/if}</EmptyState>{/each}
  </div>
  <div class="layer-move-footer">{#if renameError}<p role="alert">{renameError}</p>{/if}<p class="layer-move-status" role="status">{drag.message}</p><details bind:open={helpOpen} use:uiDisclosure={next=>helpOpen=next}><summary>Moving layers</summary><p id="layer-move-help">Drag the grip to reorder. Drop in the middle of a group to move inside, or on Slide to move out. Auto layout follows the new order. Unlock layers before moving.</p><p id="layer-move-keyboard-help">Rename with F2 or double-click. Shift selects a range; ⌘ / Ctrl toggles a layer. Keyboard: focus a grip, then press Space. Up/Down choose a position, Right moves inside a group, and Left moves out one level. Enter drops; Escape cancels.</p></details></div>
{/if}</section>
{#if drag.view&&!drag.view.keyboard}<div class="layer-drag-ghost" class:invalid={Boolean(drag.view.invalid)} style:left="{Math.max(12,Math.min(drag.x+12,(root?.ownerDocument.defaultView?.innerWidth??0)-172))}px" style:top="{Math.max(12,Math.min(drag.y+12,(root?.ownerDocument.defaultView?.innerHeight??0)-52))}px" aria-hidden="true"><GripVertical size={14}/><span>{drag.view.name}</span></div>{/if}
<style>
  .layer-browser{min-width:0;padding:12px;gap:12px}
  .layer-browser-header{flex:none}
  .layer-search-field{display:flex;align-items:center;gap:8px;border:1px solid var(--field-border);border-radius:var(--r-control);padding:0 8px;background:var(--field-surface);margin-bottom:8px}.layer-search-field:focus-within{outline:2px solid var(--accent-line);outline-offset:0}.layer-search-field :global(svg){flex:none;color:var(--text-secondary)}.layer-search{margin:0;min-width:0;flex:1;border:0;background:transparent;padding:8px 0}.layer-search:focus-visible{outline:0}.layer-search::-webkit-search-cancel-button{appearance:none}.layer-search-clear{display:grid;place-items:center;width:28px;min-height:28px;padding:0;flex:none;border-radius:var(--r-sm)}
  .layer-list-context{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--text-secondary);font-size:var(--ui-meta)}
  .layer-list{flex:1;overscroll-behavior:contain;padding:3px 4px;margin:0 -5px}
  .layer-root{display:flex;align-items:center;gap:8px;min-height:32px;margin-top:8px;padding:4px 8px;border-radius:var(--r-control);color:var(--text-secondary);font-size:var(--ui-label)}.layer-root small{margin-left:auto;font-size:var(--ui-meta)}
  .layer-grip{flex:none;width:20px;min-height:32px;padding:0;background:transparent;border:0;color:var(--text-secondary);cursor:grab;touch-action:none;user-select:none;border-radius:var(--r-control)}.layer-grip:active{cursor:grabbing}.layer-grip:disabled{cursor:default}.layer-grip:focus-visible{outline-offset:-2px}
  .layer-moving{opacity:.6}.layer-group{position:relative}
  .layer-group,.layer-row{margin-left:min(calc(var(--layer-depth)*12px),72px)}.layer-more{display:block;flex:none}.layer-more :global(button){min-width:28px}.layer-rename{flex:1;width:100%;min-width:0;font-size:var(--ui-label)}
  [data-layer-drop=before]::before,[data-layer-drop=after]::after{content:'';position:absolute;left:0;right:0;height:2px;background:var(--accent-line);border-radius:1px;pointer-events:none;z-index:1}[data-layer-drop=before]::before{top:-2px}[data-layer-drop=after]::after{bottom:-2px}
  .layer-browser [data-layer-drop=inside],.layer-root.drop-inside{outline:2px solid var(--accent-line);outline-offset:-2px;background:var(--state-selected)}.layer-browser .drop-invalid{outline-color:var(--warning-border)}.drop-invalid::before,.drop-invalid::after{background:var(--warning-border)}
  .layer-move-footer{flex:none;max-height:35%;overflow:auto;border-top:1px solid var(--border-subtle);padding-top:8px;font-size:var(--ui-meta);color:var(--text-secondary)}.layer-move-status:empty{display:none}.layer-move-status{line-height:var(--ui-line-body);margin:0 0 8px;overflow-wrap:anywhere}.layer-move-footer summary{cursor:pointer;padding:4px 0}.layer-move-footer details p{margin-top:8px;line-height:var(--ui-line-reading)}
  .layer-drag-ghost{position:fixed;z-index:1000;display:flex;gap:8px;align-items:center;width:160px;max-width:calc(100vw - 24px);min-height:36px;padding:8px 12px;pointer-events:none;border:1px solid var(--border-strong);border-radius:var(--r-control);background:var(--surface-chrome);box-shadow:var(--shadow-floating);font-size:var(--ui-label)}.layer-drag-ghost span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.layer-drag-ghost.invalid{border-color:var(--warning-border)}
  .layer-row{min-height:40px}
  .layer-row .layer-label>span{font-size:var(--ui-text);line-height:var(--ui-line-control)}
  .layer-row .layer-label>small{margin-top:0}
  @media(min-width:761px) and (pointer:fine){.layer-row .layer-name{padding-block:2px}.layer-row .kind-only{display:none}}
  @media(max-width:760px),(pointer:coarse){.layer-row{min-height:52px}}
  .layer-group{display:flex;align-items:center;gap:4px;min-width:0;border-radius:var(--r-control);margin-block:8px 4px}.layer-group.chosen{background:var(--state-selected)}.layer-group:is(:focus-within,.previewed):not(.chosen){background:var(--state-hover)}.layer-group-name{display:flex;align-items:center;gap:8px;flex:1;min-width:0;text-align:left;padding:8px 4px;background:none;border:0;font-size:var(--ui-label)}.layer-group-name span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.layer-group-name small{color:var(--text-secondary);font-size:var(--ui-meta)}
  @media(hover:hover) and (pointer:fine){.layer-group:hover:not(.chosen){background:var(--state-hover)}}
  @media(max-width:760px){.layer-browser{overflow:auto;overscroll-behavior:contain}.layer-list{flex:none;overflow:visible}.layer-move-footer{max-height:none;overflow:visible}}
  @media(max-width:760px),(pointer:coarse){.layer-group>.icon-btn,.layer-group-name{min-height:44px}.layer-search,.layer-rename,.layer-search-clear{min-height:44px}.layer-search-clear{width:44px}.layer-grip{width:44px;min-height:44px}.layer-move-footer summary,.layer-root{min-height:44px}.layer-row .layer-name :global(svg){display:none}.layer-root{flex-wrap:wrap}.layer-root small{margin-left:0}.layer-group,.layer-row{margin-left:min(calc(var(--layer-depth)*8px),40px)}.layer-row>.layer-control{display:none}.layer-more{display:block;flex:none}.layer-more :global(.ui-action-menu-trigger>button){min-width:44px;min-height:44px}}
  /* Keep a usable list when enlarged type or a short desktop pane leaves
     too little space for independently fixed search and help regions. */
  @media(min-width:761px) and (pointer:fine){
    @container layer-area (max-height:22rem){
      .layer-browser{overflow:auto;overscroll-behavior:contain}
      .layer-list{flex:none;overflow:visible}
      .layer-move-footer{max-height:none;overflow:visible}
    }
  }
  @media(forced-colors:active){[data-layer-drop=before]::before,[data-layer-drop=after]::after{background:Highlight}.layer-browser [data-layer-drop=inside],.layer-root.drop-inside{outline-color:Highlight}.layer-moving{opacity:1}}
</style>
