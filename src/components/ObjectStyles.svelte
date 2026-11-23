<script lang="ts">
  import {objectTextStyleOperations,objectColorStyleOperations} from '../core/object-style-operations';
  import { editor } from '../core/editor.svelte';
  import { deckDesignSystem, styledElement, COLOR_LABELS, TEXT_LABELS } from '../core/deck-design-system';
  import { COLOR_ROLES, TEXT_ROLES, type ColorRole, type TextRole } from '../core/design-system-schema';
  import { swatchInk } from '../selection-color';
  import PropertyRow from './ui/PropertyRow.svelte';
  import { Button } from './ui';
  import { Check, RotateCcw } from '@lucide/svelte';
  let {mode='all',onedit}:{mode?:'all'|'text'|'colors';onedit?:(role:TextRole)=>void}=$props();
  const selected=$derived(editor.selection.filter(e=>!e.locked&&!e.designPattern&&!e.resource&&!e.sourceRegion&&!['image','prototype'].includes(e.type)));
  const allText=$derived(selected.length>0&&selected.every(e=>e.type==='text'));
  const system=$derived(deckDesignSystem(editor.deck??{}));
  const role=$derived(selected.every(e=>e.design?.text===selected[0]?.design?.text)?selected[0]?.design?.text??'':'mixed');
  const overrideFields=$derived([...new Set(selected.flatMap(e=>e.design?.overrides??[]))]);
  const overrideNames={fontFamily:'Font',fontSize:'Size',fontWeight:'Weight',lineHeight:'Line height',letterSpacing:'Tracking'};
  const paletteLabels={background:'Base',ink:'Text',muted:'Muted',accent:'Accent',surface:'Surface',line:'Border',dark:'Dark',onDark:'On dark'};
  const fillRole=$derived(selected.every(e=>(e.type==='line'?e.design?.stroke:e.design?.fill)===(selected[0]?.type==='line'?selected[0]?.design?.stroke:selected[0]?.design?.fill))?(selected[0]?.type==='line'?selected[0]?.design?.stroke:selected[0]?.design?.fill):'mixed');
  function textStyle(value:string,restore=false){
    if(!editor.slide||!editor.deck||editor.editingId)return;
    editor.commit(objectTextStyleOperations(editor.operationDocument(),editor.slide.id,selected.map(e=>e.id),value?value as TextRole:undefined,restore));
  }
  function fillStyle(color:ColorRole){
    if(!editor.slide||!editor.deck||editor.editingId)return;
    const deck=editor.operationDocument();
    editor.commit(selected.flatMap(e=>objectColorStyleOperations(deck,editor.slide!.id,[e.id],e.type==='line'?'stroke':'fill',color)));
  }

</script>
{#if selected.length}
  <div class="panel-section object-deck-styles">
    {#if allText&&mode!=='colors'}<div class="text-style-row"><PropertyRow label="Style"><select class="ui-property-input" aria-label="Text style for selected objects" disabled={Boolean(editor.editingId)} value={role} onchange={ev=>textStyle(ev.currentTarget.value)}>{#if role==='mixed'}<option value="mixed" disabled>Mixed styles</option>{/if}<option value="">Custom</option>{#each TEXT_ROLES as key}<option value={key}>{TEXT_LABELS[key]}</option>{/each}</select></PropertyRow>{#if onedit&&role&&role!=='mixed'}<Button variant="quiet" aria-label="Edit style for all slides" onclick={()=>onedit?.(role as TextRole)}>Edit style</Button>{/if}</div>{#if onedit&&role&&role!=='mixed'}<p class="hint">Edit style opens Document styles for all slides.</p>{/if}{#if editor.editingId}<p class="hint">Finish editing text to change its linked style.</p>{/if}{#if overrideFields.length&&role}<div class="text-style-overrides"><span>Custom: {overrideFields.map(key=>overrideNames[key]).join(', ')}</span><Button variant="quiet" aria-label="Reset selected text to its document style" title="Remove local text overrides from the selection" disabled={Boolean(editor.editingId)} onclick={()=>textStyle(role,true)}><RotateCcw size={16}/>Reset</Button></div>{/if}{/if}
    {#if mode!=='text'}<span class="palette-label">Document colors</span>
    <div class="semantic-palette">{#each COLOR_ROLES as color}{@const active=selected.every(e=>(e.type==='line'?e.design?.stroke:e.design?.fill)===color)}<button title={`${COLOR_LABELS[color]} · ${system.colors[color]}`} aria-label={`Link selected objects to ${paletteLabels[color]} document color`} aria-pressed={active} disabled={Boolean(editor.editingId)} onclick={()=>fillStyle(color)}><i style:background={system.colors[color]} style:color={swatchInk(system.colors[color])}>{#if active}<Check size={12}/>{/if}</i><span>{paletteLabels[color]}</span></button>{/each}</div>
    <p class="color-link-status">{fillRole==='mixed'?'Mixed color links':fillRole?`${COLOR_LABELS[fillRole]} · Document color`:'Custom color'}</p>{/if}
  </div>
{/if}
<style>
  .text-style-row{display:flex;align-items:center;gap:4px}.text-style-overrides{display:flex;align-items:center;gap:4px;flex-wrap:wrap;color:var(--text-secondary);font-size:var(--ui-meta)}.text-style-overrides>span{flex:1;min-width:0}.text-style-overrides :global(button){flex:none;padding-inline:4px}.text-style-row :global(.ui-property-row){flex:1;min-width:0}.text-style-row :global(button){flex:none;padding-inline:8px}.object-deck-styles{padding:0;border:0;gap:8px}.object-deck-styles select{width:100%}.palette-label{font-size:var(--ui-label);color:var(--text-secondary)}.semantic-palette{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}.semantic-palette button{min-height:48px;display:flex;flex-direction:column;gap:4px;padding:4px;border:1px solid transparent;border-radius:var(--r-sm);min-width:0;justify-content:center;background:transparent;color:var(--text-secondary)}.semantic-palette i{width:20px;height:20px;border:1px solid var(--border-default);border-radius:var(--r-sm);display:grid;place-items:center}.semantic-palette span{font-size:var(--ui-meta);line-height:1.5}.semantic-palette button[aria-pressed='true']{background:var(--state-selected);border-color:var(--accent-line)}.object-deck-styles>p{line-height:var(--ui-line-reading)}.color-link-status{font-size:var(--ui-meta);color:var(--text-secondary)}
  @media(max-width:760px),(pointer:coarse){.semantic-palette{grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.semantic-palette button{min-height:44px}.object-deck-styles select{min-height:44px}}
</style>
