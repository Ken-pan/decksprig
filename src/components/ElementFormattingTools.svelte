<script lang="ts">
  import {numericFieldValidity} from './ui/numeric-validity.svelte';
  const numericFields=numericFieldValidity();
  import LineSelectionTools from './LineSelectionTools.svelte';
  import DrawingObjectTools from './DrawingObjectTools.svelte';
  import {drawingStyle} from '../core/drawing-properties';
  import ColorField from './ui/ColorField.svelte';
  import NumberField from './ui/NumberField.svelte';
  import RadiusIcon from './icons/CornerRadius.svelte';
  import PropertyChoice from './ui/PropertyChoice.svelte';
  import {inspectorCapabilities,dataLabelSize} from '../core/inspector-properties';
  import {isRegionFill} from '../core/resource-purpose';
  import Notice from './ui/Notice.svelte';
  import {onMount,tick} from 'svelte';
  import {SlidersHorizontal,Replace,Crop,Square,Minus,Paintbrush,Table2,Play,Settings2,ChevronDown,Check,X} from '@lucide/svelte';
  import {Button,DialogFooter} from './ui';
  import AsyncFeature from './AsyncFeature.svelte';
  let chartOpen = $state(false), tableOpen = $state(false), dataTab=$state<'data'|'style'>('data');
  import {deckDesignSystem,COLOR_LABELS} from '../core/deck-design-system';
  import {objectColorStyleOperations} from '../core/object-style-operations';
  import {COLOR_ROLES,type ColorRole} from '../core/design-system-schema';
  import DocumentColorChoices from './DocumentColorChoices.svelte';
  import {swatchInk} from '../selection-color';
  import {positionFloating} from '../ui-viewport';
  import '../selection-tools.css';
  import {editor} from '../core/editor.svelte';
  import type {SlideElement} from '../core/model';
  import {isFigmaPrototype,normalizePrototypeUrl} from '../core/prototype';
  type Menu='border'|'appearance'|'prototype'|'';
  let {onresources,onprototype,ondraw}:{ondraw:()=>void;onresources:(id:string,anchor:HTMLElement)=>void;onprototype:(e:SlideElement)=>void}=$props();
  const id=$props.id();
  const editable=$derived(editor.selection.filter(e=>!e.locked)), e=$derived(editable[0]);
  const single=$derived(editor.selection.length===1);
  const drawing=$derived(single&&e?drawingStyle(e):null);
  const shape=$derived(single&&inspectorCapabilities(editable).shapes);
  const radiusAllowed=$derived(single&&inspectorCapabilities(editable).radius);
  const colorLabel=$derived(e?.type==='table'?'Text color':e?.type==='chart'?'Series color':'Fill color');
  const system=$derived(deckDesignSystem(editor.deck??{}));
  const colorRoles=$derived(COLOR_ROLES.map(value=>({value,label:COLOR_LABELS[value],color:system.colors[value]})));
  const fillRole=$derived(editable.every(item=>(item.design?.fill??'')===(e?.design?.fill??''))?e?.design?.fill??'':'mixed');
  const styleTargets=$derived(editable.filter(e=>!e.resource&&!e.sourceRegion&&!['image','prototype'].includes(e.type)));
  const colors=$derived([...new Set((editor.slide?.elements.flatMap(e=>[e.fill,e.stroke])??[]).filter(c=>/^#[\da-f]{6}$/i.test(c)&&!Object.values(system.colors).some(v=>v.toLowerCase()===c.toLowerCase())))].slice(0,14));
  const opacity=$derived(editable.some(v=>v.opacity!==e?.opacity)?'Mixed':`${Number(((e?.opacity??1)*100).toFixed(1))}%`);
  let menu=$state<Menu>(''),opened=$state(false),popup=$state<HTMLDivElement>(),origin:HTMLButtonElement|undefined;
  let hex=$state(''),colorValid=$state(true),amount=$state<number|string|undefined>(''),radius=$state<number|string|undefined>(''),fontSize=$state<number|string|undefined>('');
  let shadowDraft=$state<SlideElement['shadow']>();
  let pendingRole=$state<ColorRole|undefined>();
  let width=$state<number|string|undefined>(''),error=$state('');
  let link=$state(''),scaling=$state('contain'),responsive=$state(false),deviceFrame=$state(false),chrome=$state(false);
  let frame=0;
  const title=$derived(menu==='border'?e?.type==='line'?'Line style':'Border':menu==='appearance'?'Appearance':'Prototype settings');
  function position(){
    if(!popup?.matches(':popover-open')||!origin)return;
    const body=popup.querySelector<HTMLElement>('form'),header=popup.querySelector<HTMLElement>('header');
    positionFloating(popup,origin.getBoundingClientRect(),{preferredHeight:(body?.scrollHeight??0)+(header?.offsetHeight??0)+2,minHeight:160});
  }
  function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(position);}
  async function open(next:Menu,event:MouseEvent){
    if(!e)return;if(menu===next&&opened){close();return;}
    popup?.hidePopover();origin=event.currentTarget as HTMLButtonElement;menu=next;error='';colorValid=true;
    pendingRole=e.design?.[next==='border'?'stroke':'fill'];
    hex=next==='border'?(e.stroke==='transparent'?(e.type==='line'?e.fill:'#26362c'):e.stroke):e.fill;
    amount=opacity==='Mixed'?'':e.opacity*100;radius=e.radius;fontSize=dataLabelSize(e);width=e.type==='line'?e.strokeWidth||2:e.strokeWidth;
    shadowDraft=e.shadow?{...e.shadow}:undefined;
    link=e.prototype?.url??'';scaling=e.prototype?.scaling??'contain';responsive=e.prototype?.responsive??false;deviceFrame=e.prototype?.deviceFrame??false;chrome=e.prototype?.chrome??false;
    await tick();popup?.showPopover();position();popup?.focus({preventScroll:true});
  }
  function close(){popup?.hidePopover();restoreFocus(origin);}
  function apply(patch:Partial<SlideElement>){editor.patch(patch);close();}
  function chooseColor(role:ColorRole){
    pendingRole=role;hex=system.colors[role];error='';
    if(!Number(width))width=e.type==='line'?2:1;
  }
  function chooseFillRole(role:string){if(editor.deck&&editor.slide)editor.commit(objectColorStyleOperations(editor.operationDocument(),editor.slide.id,styleTargets.map(item=>item.id),'fill',role?role as ColorRole:undefined));}
  function number(value:number|string|undefined,min:number,max:number,label:string){const n=Number(value);if(!String(value??'').trim()||!Number.isFinite(n)||n<min||n>max)throw new Error(`${label}: enter a number from ${min} to ${max}.`);return n;}
  function save(event:SubmitEvent){
    event.preventDefault();if(!e||!numericFields.valid||!colorValid)return;error='';
    try{
      if(menu==='border'){
        if(!/^(#[\da-f]{6}(?:[\da-f]{2})?|transparent)$/i.test(hex))throw new Error('Enter a hex color or transparent.');
        const strokeWidth=hex==='transparent'?0:number(width,e.type==='line'?1:0,100,'Line width');
        if(pendingRole&&editor.deck&&editor.slide){const ops=objectColorStyleOperations(editor.operationDocument(),editor.slide.id,styleTargets.map(e=>e.id),'stroke',pendingRole);for(const op of ops)if(op.op==='update_element')op.patch.strokeWidth=strokeWidth;editor.commit(ops);close();}
        else apply({stroke:hex,strokeWidth});
      }else if(menu==='appearance'){
        const patch:Partial<SlideElement>={opacity:number(amount,0,100,'Opacity')/100};
        if(radiusAllowed)patch.radius=number(radius,0,500,'Corner radius');
        if(shape)patch.shadow=shadowDraft;
        if(single&&['table','chart'].includes(e.type))patch.fontSize=number(fontSize,e.type==='chart'?18:4,e.type==='chart'?28:500,'Text size');
        apply(patch);
      }else if(menu==='prototype'&&e.prototype)apply({prototype:{...e.prototype,url:normalizePrototypeUrl(link),scaling:scaling as 'contain'|'scale-down'|'fit-width',responsive,deviceFrame,chrome}});
    }catch(err){error=err instanceof Error?err.message:'Check the entered values.';schedule();}
  }
  function key(event:KeyboardEvent){if(event.key==='Escape'&&!event.isComposing&&event.keyCode!==229){event.preventDefault();event.stopPropagation();close();}}
  onMount(()=>{
    const observer=new ResizeObserver(schedule);if(popup)observer.observe(popup);
    window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);document.addEventListener('scroll',schedule,true);
    return()=>{observer.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);document.removeEventListener('scroll',schedule,true);};
  });
  import {popoverFocus,restoreFocus} from '../ui-focus';
</script>

{#if e}
{#if tableOpen}<AsyncFeature feature="table" props={{elementId:e.id,initialTab:dataTab,onclose:()=>tableOpen=false}} onclose={()=>tableOpen=false} modalTitle="Edit table"/>{/if}
{#if chartOpen}<AsyncFeature feature="chart" props={{elementId:e.id,initialTab:dataTab,onclose:()=>chartOpen=false}} onclose={()=>chartOpen=false} modalTitle="Edit chart"/>{/if}
<!-- Drawings retain SVG portability and expose paint controls instead of photo tools. -->
{#if single&&e.type==='line'}<LineSelectionTools element={e}/>{:else if drawing}<DrawingObjectTools element={e} {drawing} {ondraw}/>{:else}
<div class="element-quick-tools">
  {#if single}
    {#if e.type==='image'}
      <button class="text-btn" aria-label="Replace image" title="Replace image from library" onclick={ev=>onresources(e.id,ev.currentTarget)}><Replace size={16}/><span>Replace</span></button>
      {#if !isRegionFill(e)&&!e.sourceRegion}<button class="text-btn" aria-label="Crop image" title="Crop image · Double-click image" aria-pressed={editor.croppingId===e.id} onclick={()=>editor.croppingId=e.id}><Crop size={16}/><span class="selection-secondary-label">Crop</span></button>{/if}
    {:else if e.type==='table'||e.type==='chart'}
      <button class="text-btn" aria-label={e.type==='table'?'Data: edit table':'Data: edit chart'} title="Edit data" aria-haspopup="dialog" aria-expanded={chartOpen||tableOpen} onclick={()=>{dataTab='data';if(e.type==='chart')chartOpen=true;else tableOpen=true;}}><Table2 size={16}/><span>Data</span></button>
      <button class="text-btn" aria-label={e.type==='table'?'Customize table':'Customize chart'} aria-haspopup="dialog" onclick={()=>{dataTab='style';if(e.type==='chart')chartOpen=true;else tableOpen=true;}}><SlidersHorizontal size={16}/><span class="selection-secondary-label">Customize</span></button>
    {:else if e.type==='prototype'}
      <button class="text-btn" aria-label="Preview prototype" onclick={()=>onprototype(e)}><Play size={16}/><span>Preview</span></button>
      <button class="icon-btn" aria-label="Prototype settings" title="Prototype settings" aria-haspopup="dialog" aria-controls={id} aria-expanded={opened&&menu==='prototype'} onclick={ev=>open('prototype',ev)}><Settings2 size={16}/></button>
    {/if}
    {#if (shape&&e.type!=='line')||e.type==='table'||e.type==='chart'}
      {#key `${editor.deck?.id}:${editor.activeId}:${editor.selected.join(',')}:${editor.selectedContainer}`}<ColorField toolbar label={colorLabel} value={e.fill} mixed={editable.some(item=>item.fill!==e.fill)} roles={colorRoles} roleValue={fillRole} onrole={styleTargets.length?chooseFillRole:undefined} allowClear={e.type!=='table'&&e.type!=='chart'} clearLabel="Remove fill" onchange={fill=>editor.patch({fill},'color')}/>{/key}
    {/if}
    {#if shape}<button class="text-btn" aria-label={e.type==='line'?'Line style':'Stroke style'} title={e.type==='line'?'Line color and width':'Stroke color and width'} aria-haspopup="dialog" aria-controls={id} aria-expanded={opened&&menu==='border'} onclick={ev=>open('border',ev)}><span class="selection-color-glyph" aria-hidden="true">{#if e.type==='line'}<Minus size={16}/>{:else}<Square size={16}/>{/if}<span class="selection-color-mark" class:clear={e.type!=='line'&&(e.stroke==='transparent'||!e.strokeWidth)} style:background={e.type==='line'?(e.stroke==='transparent'?e.fill:e.stroke):e.stroke!=='transparent'&&e.strokeWidth?e.stroke:undefined}></span></span><span class="selection-secondary-label">{e.type==='line'?`${e.strokeWidth||2} px`:'Stroke'}</span></button>{/if}
  {/if}
  <span id={`${id}-appearance`} hidden>{opacity} opacity{single&&['rect','image'].includes(e.type)?', corner radius':single&&['table','chart'].includes(e.type)?', text size':''}. Locked objects stay unchanged.</span>
  <button class="text-btn quick-opacity" aria-label="Object appearance" aria-describedby={`${id}-appearance`} title="Opacity and appearance" aria-haspopup="dialog" aria-controls={id} aria-expanded={opened&&menu==='appearance'} onclick={ev=>open('appearance',ev)}><Paintbrush size={16}/><span>{opacity==='Mixed'?'—':opacity}</span></button>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div bind:this={popup} id={id} use:popoverFocus={{close:()=>popup?.hidePopover(), origin:()=>origin}} popover="auto" class="element-format-popover selection-tools-popover ui-property-surface canvas-controls-popover" class:wide={menu==='prototype'} role="dialog" tabindex="-1" aria-label={title} onbeforetoggle={ev=>opened=ev.newState==='open'} onkeydown={key}>
    <header><strong>{title}</strong><button class="icon-btn" aria-label="Close object formatting" onclick={close}><X size={16}/></button></header>
    <form class="selection-format-body" onsubmit={save}>
      {#if menu==='border'}
        <DocumentColorChoices value={pendingRole} disabled={!styleTargets.length} onchoose={chooseColor}/>
        <p class="hint">{pendingRole?`${COLOR_LABELS[pendingRole]} · Apply to follow document`:'Custom color'}</p>
        <details class="format-custom-options"><summary><span>Custom color</span><ChevronDown size={14} aria-hidden="true"/></summary>{#if colors.length}<div class="color-presets">{#each colors as value}<button type="button" class="color-swatch" style:background={value} style:color={swatchInk(value)} aria-label={`Stroke color ${value}`}  aria-pressed={hex.toLowerCase()===value.toLowerCase()} onclick={()=>{pendingRole=undefined;hex=value;if(!Number(width))width=e.type==='line'?2:1;}}>{#if hex.toLowerCase()===value.toLowerCase()}<Check size={16}/>{/if}</button>{/each}</div>{/if}<ColorField label="Stroke color" value={hex} allowClear={e.type!=='line'&&e.type!=='table'&&e.type!=='chart'} onvaliditychange={valid=>colorValid=valid} onchange={value=>{pendingRole=undefined;hex=value;width=value==='transparent'?0:Number(width)||1;}}/></details>
        {#if menu==='border'}<NumberField label="Line width" prefix="Width" preset="stroke" unit="px" min={e.type==='line'?1:0} max={100} step="any" value={width} oninput={raw=>width=raw} onchange={value=>width=value}/>{/if}
      {:else if menu==='appearance'}
        <NumberField label="Object opacity" prefix="Opacity" preset="percent" unit="%" min={0} max={100} step="any" mixed={opacity==='Mixed'&&!String(amount??'').trim()} value={amount} oninput={raw=>amount=raw} onchange={value=>amount=value}/>
        <div class="opacity-presets">{#each [25,50,75,100] as value}<button class="text-btn" type="button" aria-pressed={String(amount??'').trim()!==''&&Number(amount)===value} onclick={()=>apply({opacity:value/100})}>{value}%</button>{/each}</div>
        {#if radiusAllowed}<NumberField label="Corner radius" icon={RadiusIcon} preset="radius" unit="px" min={0} max={500} step="any" value={radius} oninput={raw=>radius=raw} onchange={value=>radius=value}/>{/if}
        {#if shape}<AsyncFeature feature="shape-effects" props={{value:shadowDraft,onchange:shadow=>shadowDraft=shadow}}/>{/if}
        {#if single&&['table','chart'].includes(e.type)}<NumberField label="Data text size" prefix="Text size" preset="font" unit="px" min={e.type==='chart'?18:4} max={e.type==='chart'?28:500} step="any" value={fontSize} oninput={raw=>fontSize=raw} onchange={value=>fontSize=value}/>{/if}
        {#if !single}<p class="hint">Applies to editable objects. Locked objects stay unchanged.</p>{/if}
      {:else if menu==='prototype'}
        <label class="field-label">Share link<input class="ui-property-input" type="url" aria-label="Prototype link" bind:value={link}/></label>
        {#if isFigmaPrototype(link)}<label class="field-label">Zoom<select class="ui-property-input" aria-label="Prototype scale" bind:value={scaling}><option value="contain">Fit to window</option><option value="scale-down">Scale down only</option><option value="fit-width">Fit width</option></select></label><PropertyChoice label="Prototype layout" value={String(responsive)} options={[{value:'false',label:'Fixed'},{value:'true',label:'Responsive'}]} onchange={value=>responsive=value==='true'}/><label class="ui-property-check"><input type="checkbox" bind:checked={deviceFrame}/>Device frame</label><label class="ui-property-check"><input type="checkbox" bind:checked={chrome}/>Figma footer</label>{:else}<p class="hint">This website controls its own layout.</p>{/if}
      {/if}
      {#if error}<Notice tone="error" title="Formatting could not update" message={error}/>{/if}
      <DialogFooter class="selection-format-footer">{#snippet actions()}<Button onclick={close}>Cancel</Button><Button variant="secondary" type="submit" disabled={!numericFields.valid||!colorValid}>Apply</Button>{/snippet}</DialogFooter>
    </form>
  </div>
</div>
{/if}
{/if}
<style>
  .element-quick-tools{display:flex;align-items:center;flex-wrap:wrap;gap:4px;flex:0 1 auto;min-width:0}.quick-opacity{gap:4px;font-variant-numeric:tabular-nums}.element-format-popover.wide{width:min(360px,calc(100vw - 24px))}
  
  .opacity-presets{display:grid;grid-template-columns:repeat(auto-fit,minmax(4.5em,1fr));gap:4px}.opacity-presets>button{padding-inline:4px}summary{cursor:pointer;padding-block:8px}
  @media(max-width:760px),(pointer:coarse){.element-quick-tools{gap:2px}summary{min-height:44px}.element-quick-tools>button{padding-inline:8px}}
  @media(max-width:360px){.quick-opacity>span{display:none}}
</style>
