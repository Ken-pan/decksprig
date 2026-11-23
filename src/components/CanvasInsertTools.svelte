<script lang="ts">
  import { MousePointer2, Type, PenLine, Paintbrush, Highlighter, Eraser, ChevronUp, Table2, ChartColumn, AppWindow, Plus, Star, LayoutTemplate } from '@lucide/svelte';
  import LineTools from './LineTools.svelte';
  import InsertToolsFrame from './InsertToolsFrame.svelte';
  import DrawingTools from './DrawingTools.svelte';
  import {drawingState} from '../drawing-state.svelte';
  import {DRAWING_BRUSHES} from '../core/drawing-settings';
  import { resourceIcons, shapeToolIcons } from './icons';
  import {SHAPE_TOOLS, SHAPE_LABELS, isShapeTool, type ShapeInsertTool} from '../core/shapes';
  import { ActionMenu, Button } from './ui';
  import { type CanvasTool, type PrimitiveInsertTool } from '../core/insertion';
  import type { ResourceQuickView } from './resource-library-view';
  let {insertTool, resourceOpen, resourceActiveView, resourceBusy = false, disabled = false, compact = false, onselect, oninsert, onresource, onchart, onprototype, onblocks}: {
    insertTool: CanvasTool | null; resourceOpen: boolean; resourceActiveView?: ResourceQuickView; resourceBusy?: boolean; disabled?: boolean; compact?: boolean;
    onselect: () => void; oninsert: (tool: PrimitiveInsertTool | 'draw', focus?: boolean) => void; onresource: (view: ResourceQuickView, anchor: HTMLButtonElement) => void;
    onchart: () => void; onprototype: () => void; onblocks: () => void;
  } = $props();
  let moreGroup = $state<HTMLDivElement>();
  let lastShape = $state<ShapeInsertTool>('rect');
  const drawingIcons = {pen: PenLine, brush: Paintbrush, highlighter: Highlighter};
  const DrawingIcon = $derived(drawingState.settings.mode === 'erase' ? Eraser : drawingIcons[drawingState.settings.brush]);
  const drawingLabel = $derived(DRAWING_BRUSHES.find(brush => brush.id === drawingState.settings.brush)?.label ?? 'Pen');
  const currentShape = $derived(isShapeTool(insertTool) && insertTool !== 'line' ? insertTool : lastShape);
  const ShapeIcon = $derived(shapeToolIcons[currentShape]);
  $effect(() => { if (isShapeTool(insertTool) && insertTool !== 'line') lastShape = insertTool; });
  function openResource(view: ResourceQuickView) { const anchor = moreGroup?.querySelector<HTMLButtonElement>('button'); if (anchor) onresource(view, anchor); }
  const resourceTools = [
    {id: 'photo', label: 'Photos', title: 'Photos', icon: resourceIcons.photo},
    {id: 'icon', label: 'Icons', title: 'Icons', icon: resourceIcons.icon},
    {id: 'illustration', label: 'Art', title: 'Illustrations', icon: resourceIcons.illustration},
  ] as const;
</script>
      <InsertToolsFrame {compact}>
        {#snippet primary()}
        <Button kind="icon" class="dock-select" aria-label="Select" title="Select · Esc" aria-pressed={!insertTool && !resourceOpen} onclick={onselect}><MousePointer2 size={16} /><span class="dock-label">Select</span></Button>
        <Button kind="icon" class="text-entry" aria-pressed={insertTool === 'text'} {disabled} onclick={() => oninsert('text')} title="Place text · T" aria-label="Insert text"><Type size={16} /><span class="dock-label">Text</span></Button>
        <div class="drawing-split" role="group" aria-label="Drawing tools">
        <Button kind="icon" class="draw-entry" aria-pressed={insertTool === 'draw'} {disabled} onclick={() => oninsert('draw')} title={drawingState.settings.mode==='erase'?'Erase strokes':`Draw · ${drawingLabel}`} aria-label={drawingState.settings.mode==='erase'?'Erase strokes':'Draw'}><DrawingIcon size={16}/><span class="dock-label">{drawingState.settings.mode==='erase'?'Erase':'Draw'}</span></Button>
        <div class="drawing-options"><DrawingTools settings={drawingState.settings} onchange={settings => {drawingState.settings=settings;if(insertTool!=='draw')oninsert('draw',false);}} active={insertTool === 'draw'} ondone={onselect} {disabled}/></div>
        </div>
        <div class="shape-split" role="group" aria-label="Shape tools">
          <Button kind="icon" class="shape-entry" aria-label={`Insert shapes · ${SHAPE_LABELS[currentShape]}`} title={`Place ${SHAPE_LABELS[currentShape].toLowerCase()}`} aria-pressed={isShapeTool(insertTool) && insertTool !== 'line'} {disabled} onclick={() => oninsert(currentShape)}><ShapeIcon size={16} /><span class="dock-label">Shapes</span></Button>
          <ActionMenu class="shape-options" iconOnly label="More shapes" {disabled} items={SHAPE_TOOLS.filter(tool=>tool!=='line').map(tool=>({label:SHAPE_LABELS[tool],icon:shapeToolIcons[tool],shortcut:tool==='rect'?'R':undefined,checked:currentShape===tool,onselect:()=>{lastShape=tool;oninsert(tool);}}))}><ChevronUp size={13} /></ActionMenu>
        </div>
        <LineTools active={insertTool==='line'} {disabled} oninsert={()=>oninsert('line')}/>
        {/snippet}
        {#snippet resources()}
        {#each resourceTools as tool}
          <Button kind="icon" data-resource-view={tool.id} class={resourceOpen && resourceActiveView === tool.id ? 'resource-entry active' : 'resource-entry'} disabled={disabled || resourceBusy} title={tool.title} aria-label={tool.label === tool.title ? `${tool.title} resources` : `${tool.label} · ${tool.title} resources`} aria-haspopup="dialog" aria-controls="workspace-resource-popover" aria-expanded={resourceOpen && resourceActiveView === tool.id} popovertarget="workspace-resource-popover" popovertargetaction="show" onclick={event => { event.preventDefault(); void onresource(tool.id, event.currentTarget); }} onkeydown={event => { if (!event.isComposing && event.keyCode !== 229 && !event.altKey && !event.ctrlKey && !event.metaKey && event.key === 'ArrowDown') { event.preventDefault(); if (!resourceOpen || resourceActiveView !== tool.id) void onresource(tool.id, event.currentTarget); } }}><tool.icon size={16} /><span class="dock-label">{tool.label}</span></Button>
        {/each}
        {/snippet}
        {#snippet more()}
        <div bind:this={moreGroup}>
        <ActionMenu iconOnly label="More insert tools" active={['chart','table','block'].includes(insertTool??'') || resourceOpen && ['graphics','favorites'].includes(resourceActiveView??'')} {disabled} items={[
          {label:'Table',icon:Table2,checked:insertTool==='table',onselect:()=>oninsert('table')},
          {label:'Chart',icon:ChartColumn,onselect:onchart},
          {label:'Blocks',icon:LayoutTemplate,onselect:onblocks},
          {label:'Interactive prototype',icon:AppWindow,onselect:onprototype},
          ...(compact ? [
            ...resourceTools.map((tool,index)=>({label:tool.title,icon:tool.icon,divider:index===0,disabled:resourceBusy,onselect:()=>openResource(tool.id)})),
          ] : []),
          {label:'Patterns & textures',icon:resourceIcons.graphics,divider:!compact,disabled:resourceBusy,onselect:()=>openResource('graphics')},
          {label:'Saved resources',icon:Star,disabled:resourceBusy,onselect:()=>openResource('favorites')},
        ]}><Plus size={16} /><span class="dock-label">More</span></ActionMenu>
        </div>
        {/snippet}
      </InsertToolsFrame>
<style>
  /* Tool selection is scoped in feedback.css so popovers retain neutral choices. */
  :global(.canvas-insert-dock .icon-btn) { color: var(--text-primary); }
  :global(#app .canvas-insert-dock .active:enabled) { background: var(--control-selected-surface); color: var(--control-selected-text); }
  .shape-split, .drawing-split { display: flex; align-items: center; width: 68px; min-width: 68px; border-radius: var(--r-control); }
  .shape-split > :global(.shape-entry), .drawing-split > :global(.draw-entry) { width: 44px; min-width: 44px; padding: 0; border-radius: var(--r-control); }
  .shape-split > :global(.shape-options), .drawing-options { width: 24px; }
  .shape-split > :global(.shape-options > button), .drawing-options :global(.ui-panel-trigger > button) { width: 24px; min-width: 24px; padding: 0; border-radius: var(--r-control); }
  .shape-split > :global(.shape-options > button > svg), .drawing-options :global(.ui-panel-trigger > button > svg) { width: 10px; height: 10px; }
  @media (min-width: 761px) and (pointer: fine) {
    .shape-split, .drawing-split { width: 68px; }
    .shape-split > :global(.shape-entry), .drawing-split > :global(.draw-entry) { width: 44px; min-width: 44px; min-height: 44px; }
    .shape-split > :global(.shape-options), .drawing-options { width: 24px; }
    .shape-split > :global(.shape-options > button), .drawing-options :global(.ui-panel-trigger > button) { width: 24px; min-width: 24px; min-height: 44px; }
    .shape-split > :global(.shape-options > button > svg), .drawing-options :global(.ui-panel-trigger > button > svg) { width: 12px; height: 12px; }
  }
  @media (max-width: 760px), (pointer: coarse) {
    .shape-split, .drawing-split { width:100%; min-width:88px; }
    .shape-split > :global(.shape-entry), .drawing-split > :global(.draw-entry) { width:auto; flex:1; min-width:44px; min-height:44px; }
    .shape-split > :global(.shape-options), .drawing-options { width:44px; flex:none; }
    .shape-split > :global(.shape-options > button), .drawing-options :global(.ui-panel-trigger > button) { width:44px; min-width:44px; min-height:44px; }
    .shape-split > :global(.shape-entry), .drawing-split > :global(.draw-entry) { flex-direction: column; gap: 2px; padding: 2px 4px; }
  }
</style>
