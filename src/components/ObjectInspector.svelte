<script lang="ts">
  import TextLinkField from './TextLinkField.svelte';
  import './ui/linked-dimensions.css';
  import DrawingProperties from './DrawingProperties.svelte';
  import {drawingSelection} from '../core/drawing-properties';
  import LineControls from './LineControls.svelte';
  import {DEFAULT_LINE,type LineStyle} from '../core/lines';
  import {canAddAutoLayout} from '../core/group-commands';
  import {setContext,tick} from 'svelte';
  import InspectorTypography from './InspectorTypography.svelte';
  import ImagePositionControls from './ImagePositionControls.svelte';
  import RestoreImageRatio from './RestoreImageRatio.svelte';
  import InspectorSection from './InspectorSection.svelte';
  import {inspectorCapabilities,dataLabelSize,shapeTypeOperations,shadowPatchOperations,shadowPropertyMixed} from '../core/inspector-properties';
  import AsyncFeature from './AsyncFeature.svelte';
  import {canRecolorResource,isRegionFill} from '../core/resource-purpose';
  import ContainerProperties from './ContainerProperties.svelte';
  import GroupMembership from './GroupMembership.svelte';
  import {groupExitActions} from '../group-exit-actions';
  import { objectAction } from '../editor-focus';
  import {objectClipboardActions} from '../clipboard-actions';
  import { textProperties, textSelectionState, type TextProperty } from '../core/text-properties';
  import { editor } from '../core/editor.svelte';
  import { uiDisclosure } from '../ui-motion';
  import {selectionMembers,selectionFrame,scaleSelection,resizeSelectionFrame} from '../core/selection-transform';
  import {canReorderSelection} from '../core/stack-order';
  import { moveElements } from '../core/operations';
  import { isFigmaPrototype, normalizePrototypeUrl } from '../core/prototype';
  import { type SlideElement } from '../core/model';
  import {canEditText, isTextShape, shapeTextElement, shapeTextPatch} from '../core/shape-text';
  import {shapeKind, SHAPE_TOOLS, SHAPE_LABELS, type ShapeInsertTool} from '../core/shapes';
  import ObjectAutoLayout from './ObjectAutoLayout.svelte';
  import {selectedLayout} from '../core/object-layout';
  import { textStylePatch, WEIGHT_LABELS } from '../core/fonts';
  import {textWeightOptions} from '../core/text-weight-options';
  import { selectionBounds, keepsAspectRatio, resizedDimensions } from '../core/interactions';
  import { elementLabel } from './element-labels';
  import AlignmentControls from './AlignmentControls.svelte';
  import FontPicker from './FontPicker.svelte';
  import ElementDataEditor from './ElementDataEditor.svelte';
  import ChartProperties from './ChartProperties.svelte';
  import PropertyChoice from './ui/PropertyChoice.svelte';
  import NumberField from './ui/NumberField.svelte';
  import LinkedDimensionsSurface from './ui/LinkedDimensionsSurface.svelte';
  import {layoutNumberPresets} from '../core/numeric-field';
  import ColorField from './ui/ColorField.svelte';
  import PropertyRow from './ui/PropertyRow.svelte';
  import {objectColorStyleOperations,objectStyleWeightOperations} from '../core/object-style-operations';
  import {COLOR_ROLES,type ColorRole,type TextRole} from '../core/design-system-schema';
  import {COLOR_LABELS,TEXT_LABELS,deckDesignSystem} from '../core/deck-design-system';
  import ObjectStyles from './ObjectStyles.svelte';
  import { ActionMenu, Button } from './ui';
  import {elementIcon} from './icons';
  import RadiusIcon from './icons/CornerRadius.svelte';
  import BringForward from './icons/BringForward.svelte';
  import SendBackward from './icons/SendBackward.svelte';
  import {textAlignmentIcons, textSizingIcons} from './icons/text-icons';
  import {Ellipsis, Layers, Type, Image, PenLine, Move, Blend, WrapText, SquareDashed, ChevronDown, FileText, Replace, Info, AppWindow, Play, Settings2, Table2, ChartColumn, AlignHorizontalJustifyCenter, Paintbrush, Ruler, Shapes, Plus} from '@lucide/svelte';
  import { Link2, Unlink2, RotateCw, Scan, Crop, Expand, FlipHorizontal2, FlipVertical2, AlignLeft, AlignCenter, AlignRight, Copy, Trash2, Lock, Unlock, Group, Ungroup, Bold, Italic, Underline, Strikethrough } from '@lucide/svelte';
  const inspectorId=$props.id();
  const selection=$derived(editor.selection);
  const editable=$derived(selection.filter(v=>!v.locked));
  const propertyItems=$derived(editable.length?editable:selection);
  const capabilities=$derived(inspectorCapabilities(propertyItems));
  const drawings=$derived(drawingSelection(propertyItems));
  const textSummary=$derived(textSelectionState(propertyItems.map(item=>isTextShape(item)?shapeTextElement(item):item)));
  const textStates=$derived(textSummary.properties);
  setContext('property-edit-scope',()=>`${editor.deck?.id}:${editor.activeId}:${editor.selected.join(',')}:${editor.selectedContainer}`);
  let e = $derived(propertyItems[0]);
  const scope=$derived(`${editor.deck?.id}:${editor.activeId}:${editor.selected.join(',')}:${editor.selectedContainer}:${e?.type}`);
  const sections=$state({image:true,drawing:true,prototype:true,chart:true,table:true,shape:true,appearance:true,transform:false,crop:false,provenance:false,display:false,textOptions:false,poster:false,colorStyles:false,layout:false});
  let layoutPanels=$state({limits:false,group:false,order:false,help:false,individualPadding:false});
  let containerPanels=$state({scale:false,hierarchy:false});
  let sameType=$derived(capabilities.sameType);
  let allLocked=$derived(selection.every(v=>v.locked));
  let mixedLocks=$derived(selection.some(v=>v.locked)&&!allLocked);
  let positionBounds=$derived(editor.slide?selectionFrame(editor.slide,editor.selected,editor.selectionScope):null);
  function mixed(key:keyof SlideElement){if(sameType&&canEditText(e)&&(e?.type==='text'||key!=='fill')&&textProperties.includes(key as TextProperty))return textStates[key as TextProperty].mixed;const items=propertyItems;if(key==='verticalAlign'&&isTextShape(e))return items.some(v=>shapeTextElement(v).verticalAlign!==shapeTextElement(items[0]).verticalAlign);return items.some(v=>v[key]!==items[0]?.[key]);}
  function textValue<K extends TextProperty>(key: K) { return textStates[key].value ?? e[key]; }
  let boldState=$derived(textSummary.bold),italicState=$derived(textSummary.italic),underlineState=$derived(textSummary.underline),strikeState=$derived(textSummary.strikethrough);
  let {onfonts, onresources, onprototype, onstyles, ondraw, active=true}: {active?:boolean;ondraw?:()=>void;onfonts: () => void; onresources?: (replaceId?: string) => void; onprototype?: (element: SlideElement) => void;onstyles?:(role?:TextRole)=>void} = $props();
  function prototypeUrl(value: string) { prototypeError='';try { editor.patch({prototype: {...e.prototype!, url: normalizePrototypeUrl(value)}}); } catch (error: any) { prototypeError = error.message; } }
  let weights = $derived(textWeightOptions(propertyItems,editor.deck?.fonts,editor.deck?.onlineFonts));
  function patchText(patch: Partial<SlideElement>,merge='') {
    if (editor.slide) editor.commit(editable.filter(canEditText).map(e => {const text=isTextShape(e)?shapeTextElement(e):e;const next={...text,...textStylePatch(text,patch)};return {op:'update_element' as const,slideId:editor.slide!.id,elementId:e.id,patch:isTextShape(e)?shapeTextPatch(e,next):textStylePatch(e,patch)};}),merge);
  }
  let single = $derived(editor.selection.length === 1);
  let memberLayout=$derived(editor.slide&&selectedLayout(editor.slide,editor.selected));
  let region = $derived(editable.length > 0 && editable.every(isRegionFill));
  let recolorable = $derived(editable.length > 0 && editable.every(v => v.type === 'image' && !v.sourceRegion && canRecolorResource(v.resource)));
  let shapes = $derived(capabilities.shapes);
  let shadowMixed = $derived(editable.some(v=>Boolean(v.shadow)!==Boolean(editable[0]?.shadow)));
  function changeShape(value:string){if(editor.slide)editor.commit(shapeTypeOperations(editor.slide,editor.selected,value as ShapeInsertTool));}
  const shapeValue=$derived(e&&propertyItems.every(item=>shapeKind(item)===shapeKind(e))?shapeKind(e):'');
  const shadowMixedFields=$derived(Object.fromEntries(['color','opacity','blur','x','y'].map(key=>[key,shadowPropertyMixed(editable,key as keyof import('../core/shape-schema').ElementShadow)])));
  const weightRole=$derived(editable.length&&editable.every(e=>e.design?.text===editable[0].design?.text)?editable[0].design?.text:undefined);
  const styleWeight=$derived(weightRole?deckDesignSystem(editor.deck??{}).typography[weightRole].fontWeight:undefined);
  const linkedWeight=$derived(weightRole&&!mixed('fontWeight')&&textValue('fontWeight')===styleWeight&&editable.every(e=>!e.design?.overrides?.includes('fontWeight')));
  function chooseWeight(value:string){if(value==='style'){if(editor.deck&&editor.slide&&!editor.editingId)editor.commit(objectStyleWeightOperations(editor.operationDocument(),editor.slide.id,editable.map(e=>e.id)));}else patchText({fontWeight:Number(value)});}
  const colorRoles=$derived(COLOR_ROLES.map(value=>({value,label:COLOR_LABELS[value],color:deckDesignSystem(editor.deck??{}).colors[value]})));
  const hasStroke=$derived(propertyItems.some(item=>item.stroke!=='transparent'&&(item.type==='table'||item.strokeWidth>0)));
  const styleEligible=$derived(editable.length>0&&editable.every(e=>!e.designPattern&&!e.resource&&!e.sourceRegion&&!['image','prototype'].includes(e.type)));
  function colorLink(property:'fill'|'stroke'){const first=editable[0]?.design?.[property]??'';return editable.every(e=>(e.design?.[property]??'')===first)?first:'mixed';}
  function linkColor(property:'fill'|'stroke',role:string){if(editor.deck&&editor.slide)editor.commit(objectColorStyleOperations(editor.operationDocument(),editor.slide.id,editable.map(e=>e.id),property,role?role as ColorRole:undefined));}
  let ratioState = $derived<boolean|'mixed'>(editable.length && editable.some(v=>keepsAspectRatio(v)) ? editable.every(v=>keepsAspectRatio(v)) ? true : 'mixed' : false);
  const showRatioToggle=$derived(single&&editable.length>0&&editable.every(v=>!['text','line','prototype'].includes(v.type)));
  function number(n: number, key: keyof SlideElement) {
    if(!single&&(key==='x'||key==='y')&&positionBounds)editor.commit(moveElements(editor.operationDocument(),editor.slide!.id,editor.selected,key==='x'?n-positionBounds.x:0,key==='y'?n-positionBounds.y:0,editor.selectionScope),`prop-${key}`);
    else if(!single&&positionBounds&&(key==='w'||key==='h')){const members=selectionMembers(editor.slide!,editor.selected,false,editor.selectionScope),delta=n-positionBounds[key],to=resizeSelectionFrame(positionBounds,members,key==='w'?delta:0,key==='h'?delta:0,'se',true);editor.commit(scaleSelection(editor.operationDocument(),editor.slide!.id,editor.selected,positionBounds,to,editor.selectionScope),`prop-${key}`);}
    else if(key==='w'||key==='h')editor.commit(editable.map(v=>({op:'update_element',slideId:editor.slide!.id,elementId:v.id,patch:resizedDimensions(v,key,n)})),`prop-${key}`);
    else if(canEditText(e)&&['lineHeight','letterSpacing','fontSize'].includes(key))patchText({[key]:n},`prop-${key}`);
    else editor.patch({[key]:n},`prop-${key}`);
  }
  function grouping() { editor.group(); }
  const sizingOptions=[{value:'auto-width',label:'Auto width',icon:textSizingIcons['auto-width'],description:'Width and height follow the text'},{value:'auto-height',label:'Auto height',icon:textSizingIcons['auto-height'],description:'Width stays fixed; height follows the text'},{value:'fixed',label:'Fixed size',icon:textSizingIcons.fixed,description:'Width and height stay fixed'}];
  let sizing=$derived(mixed('textSizing')?'':e?.textSizing??'fixed');
  let imageError=$state(''),prototypeError=$state('');
  $effect(()=>{editor.selected.join(',');imageError='';prototypeError='';});
  async function imageFit(fit:SlideElement['fit']){
    if(!editor.deck||!editor.slide)return;
    if(fit==='crop'){editor.croppingId=e.id;return;}
    const origin={revision:editor.deck.revision,deckId:editor.deck.id,slideId:editor.activeId},items=[...editable];
    try{
      const operations=await Promise.all(items.map(async item=>{
        let imageSize=item.imageSize;
        if(item.crop&&!imageSize&&item.src){imageSize=await new Promise<{w:number;h:number}>((resolve,reject)=>{const image=new window.Image();image.onload=()=>resolve({w:image.naturalWidth,h:image.naturalHeight});image.onerror=()=>reject(new Error('The image could not load. Check its source and try again.'));image.src=item.src!;});}
        return {op:'update_element' as const,slideId:origin.slideId,elementId:item.id,patch:{fit,...(fit==='cover'?{crop:undefined,imageZoom:undefined}:{crop:undefined,imagePosition:undefined,imageZoom:undefined}),...(imageSize?{imageSize}:{})}};
      }));
      if(editor.deck?.id!==origin.deckId||editor.activeId!==origin.slideId||editor.deck?.revision!==origin.revision)return;
      editor.commit(operations,'','manual',origin.revision);
    }catch(error){imageError=(error as Error).message;}
  }

  function flip(key:'flipX'|'flipY'){editor.patch({[key]:!editable.every(e=>e[key])});}
  function stroke(value:string){
    if(!editor.slide)return;
    const origin=scope,restoreFocus=value==='transparent'&&Boolean(document.activeElement?.closest('.stroke-properties'));
    editor.commit(editable.map(item=>({op:'update_element',slideId:editor.slide!.id,elementId:item.id,patch:item.type==='table'?{stroke:value}:{stroke:value,strokeWidth:value==='transparent'?0:item.strokeWidth||1}})),'stroke');
    if(restoreFocus)void tick().then(()=>{if(scope===origin)document.getElementById(`${inspectorId}-add-stroke`)?.focus({preventScroll:true});});
  }
</script>
{#if active}
{#key scope}
{#if editor.selectedContainer}<ContainerProperties bind:disclosures={containerPanels}/><ObjectAutoLayout bind:disclosures={layoutPanels}/>{:else if e}
  {@const ObjectIcon = drawings.all ? PenLine : sameType ? elementIcon(e) : Layers}
  <div class="panel-section object-summary">
    <div class="object-heading">
      <span class="object-type-icon"><ObjectIcon size={16} aria-hidden="true" /></span>
      <div class="object-heading-copy">
        {#if single}<input class="object-name" aria-label="Object name" value={e.name} maxlength="200" disabled={e.locked} onchange={event=>{const name=event.currentTarget.value.trim();event.currentTarget.value=name||e.name;if(name&&name!==e.name)editor.patch({name});}} onkeydown={event=>{if(event.isComposing||event.keyCode===229)return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();event.currentTarget.value=e.name;}}} />{:else}<strong>{editor.selection.length} objects</strong>{/if}
        {#if !single||e.sourceRegion||e.pageElement}<span>{sameType && (!drawings.any || drawings.all) ? elementLabel(e) : 'Mixed types'}{#if mixedLocks} · {editable.length} editable{/if}</span>{/if}
      </div>
      <ActionMenu class="object-menu" label="Object actions" iconOnly items={[
        ...objectClipboardActions(),
        {label: single ? 'Duplicate object' : 'Duplicate objects', icon: Copy, disabled: allLocked, onselect: event => void objectAction(() => editor.duplicateSelection(),event)},
        {label: allLocked ? (single ? 'Unlock object' : 'Unlock objects') : (single ? 'Lock object' : 'Lock objects'), icon: allLocked ? Unlock : Lock, onselect: () => editor.patch({locked: !allLocked})},
        ...groupExitActions(),
        {label: 'Bring forward', icon: BringForward, divider: true, disabled: !canReorderSelection(editor.slide,editor.selected,1,editor.selectionScope), onselect: () => editor.reorderSelection(1)},
        {label: 'Send backward', icon: SendBackward, disabled: !canReorderSelection(editor.slide,editor.selected,-1,editor.selectionScope), onselect: () => editor.reorderSelection(-1)},
        {label: single ? 'Delete object' : 'Delete objects', icon: Trash2, tone: 'danger', divider: true, disabled: allLocked, onselect: event => void objectAction(() => editor.remove(),event)},
      ]}><Ellipsis size={16} /></ActionMenu>
    </div>
  </div>
  {#if allLocked}
    <div class="inspector-lock-state"><p><Lock size={16} aria-hidden="true" /><span>{single ? 'Locked object' : 'Locked selection'}</span></p><Button variant="secondary" class="full" onclick={() => editor.patch({locked:false})}><Unlock size={16} />{single ? 'Unlock object' : 'Unlock objects'}</Button></div>
  {:else if mixedLocks}<p class="inspector-selection-note">Changes apply to {editable.length} editable {editable.length===1?'object':'objects'}. Locked objects stay unchanged.</p>{/if}
  <GroupMembership standalone/>
  <fieldset class="object-properties" disabled={allLocked}>
    <section class="panel-section inspector-section" aria-label="Layout properties">
      <div class="section-heading"><h3><Ruler size={16} aria-hidden="true"/>Layout</h3></div>
      <div class="layout-fields">
        {#each [[['x','X'],['y','Y']],[['w','Width'],['h','Height']]] as fields,row}
          <div class="layout-property-row" class:has-ratio-toggle={row===1&&showRatioToggle} class:dimensions-linked={row===1&&showRatioToggle&&ratioState===true}>
            {#each fields as [key,label]}
              {@const auto = sameType&&e.type==='text'&&(key==='w'?sizing==='auto-width':key==='h'&&sizing!==''&&sizing!=='fixed')}
              <div class="layout-field"><NumberField unit="px" {label} presets={editor.deck?layoutNumberPresets(key,editor.deck,positionBounds??e):[]} prefix={key==='w'?'W':key==='h'?'H':label} disabled={!single&&!positionBounds||single&&Boolean(memberLayout)&&(key==='x'||key==='y')&&memberLayout!.order.length>1} value={!single&&positionBounds?positionBounds[key as 'x'|'y'|'w'|'h']:e[key as 'x'|'y'|'w'|'h']} mixed={!single?!positionBounds:mixed(key as keyof SlideElement)} automatic={single&&Boolean(auto)} min={key==='w'||key==='h'?1:-20000} max={20000} step="any" increment={4} hint={auto?key==='w'?'Enter a width to fix it and keep automatic height':'Enter a height to use fixed size':`${label} in px · ↑ / ↓ adjusts by 1 · Shift adjusts to the next 4 px value`} onchange={value=>number(value,key as keyof SlideElement)}/></div>
              {#if key==='w'&&showRatioToggle}<Button variant="quiet" size="sm" kind="icon" class="ratio-toggle" aria-label="Keep aspect ratio" aria-pressed={ratioState} aria-describedby={`${inspectorId}-ratio-help`} title={ratioState===true?'Unlink width and height · Shift reverses this while dragging':'Link width and height · Shift reverses this while dragging'} onclick={()=>editor.patch({aspectRatioLocked:ratioState!==true})}>{#if ratioState===true}<Link2 size={12} aria-hidden="true"/>{:else}<Unlink2 size={12} aria-hidden="true"/>{/if}</Button>{/if}
            {/each}
            {#if row===1&&showRatioToggle&&ratioState===true}
              <LinkedDimensionsSurface/>
            {/if}
          </div>
        {/each}
        {#if showRatioToggle}<span id={`${inspectorId}-ratio-help`} class="sr-only">{ratioState===true?'Width and height change together.':'Width and height change independently.'}</span>{/if}
      </div>
      
      {#if sameType&&e.type==='line'}
      <InspectorSection title="Line" icon={Move}><LineControls value={e.line??DEFAULT_LINE} mixed={(Object.keys(DEFAULT_LINE) as (keyof LineStyle)[]).filter(key=>propertyItems.some(item=>(item.line??DEFAULT_LINE)[key]!== (e.line??DEFAULT_LINE)[key]))} onchange={patch=>editor.slide&&editor.commit(propertyItems.map(item=>({op:'update_element' as const,slideId:editor.slide!.id,elementId:item.id,patch:{line:{...DEFAULT_LINE,...item.line,...patch}}})))}/></InspectorSection>
    {/if}
    {#if sameType&&e.type==='text'}<div class="property-choice-row text-resizing"><span>Resizing{#if sizing===''}<small>Mixed</small>{/if}</span><PropertyChoice label="Text resizing" options={sizingOptions} value={sizing} icons disabled={allLocked} onchange={value=>patchText({textSizing:value as SlideElement['textSizing']})}/></div>{/if}
      {#if !(single&&e.type==='text')}<div class="property-grid"><NumberField label="Rotation" icon={RotateCw} presets={[-180,-90,-45,0,45,90,180]} value={e.rotation} mixed={mixed('rotation')} unit="°" step="any" onchange={value=>number(value,'rotation')}/></div>{/if}
      {#if !single}<p class="compact-hint">Width and height scale the editable selection together.</p><AlignmentControls dense/>{:else}<AlignmentControls dense quick/>{#if e.type==='text'}<details class="inspector-disclosure" bind:open={sections.transform} use:uiDisclosure={next=>sections.transform=next}><summary><span>Transform</span><ChevronDown size={14}/></summary><div class="inspector-disclosure-body"><NumberField label="Rotation" icon={RotateCw} presets={[-180,-90,-45,0,45,90,180]} value={e.rotation} mixed={mixed('rotation')} unit="°" step="any" onchange={value=>number(value,'rotation')}/></div></details>{/if}{/if}
      {#if canAddAutoLayout(editor.selected.length,editor.selectedContainer)&&!memberLayout&&!allLocked}<details class="inspector-disclosure" bind:open={sections.layout} use:uiDisclosure={next=>sections.layout=next}><summary><span>Auto layout</span><ChevronDown size={14}/></summary><div class="inspector-disclosure-body"><ObjectAutoLayout bind:disclosures={layoutPanels}/></div></details>{/if}
      {#if !allLocked&&editor.selection.length>1}<div class="inspector-actions"><Button variant="quiet" disabled={editable.length<2} onclick={grouping}><Group size={16}/>Group</Button></div>{/if}
    </section>
    {#if memberLayout}<ObjectAutoLayout bind:disclosures={layoutPanels}/>{/if}
    {#if drawings.all}
      <InspectorSection title="Drawing" icon={PenLine} bind:open={sections.drawing}>
        <DrawingProperties items={propertyItems} {ondraw}/>
        <div class="inspector-actions"><Button variant="quiet" aria-label="Flip drawing horizontally" aria-pressed={mixed('flipX')?'mixed':e.flipX} onclick={()=>flip('flipX')}><FlipHorizontal2 size={16}/>Horizontal</Button><Button variant="quiet" aria-label="Flip drawing vertically" aria-pressed={mixed('flipY')?'mixed':e.flipY} onclick={()=>flip('flipY')}><FlipVertical2 size={16}/>Vertical</Button></div>
      </InspectorSection>
    {/if}
    {#if !allLocked}
    {#if capabilities.shapeType}
      <InspectorSection title="Shape" icon={Shapes} bind:open={sections.shape}>
        <PropertyRow label="Type"><select class="ui-property-input" aria-label="Shape type" value={shapeValue} onchange={event=>changeShape(event.currentTarget.value)}>{#if !shapeValue}<option value="" disabled>Mixed</option>{/if}{#each SHAPE_TOOLS.filter(tool=>tool!=='line'&&tool!=='roundrect') as tool}<option value={tool}>{SHAPE_LABELS[tool]}</option>{/each}</select></PropertyRow>
        {#if capabilities.radius}<NumberField label="Corner radius" icon={RadiusIcon} presets={[0,4,8,12,16,24,32,48,64]} value={e.radius} mixed={mixed('radius')} min={0} max={500} unit="px" step="any" onchange={value=>number(value,'radius')}/>{/if}
      </InspectorSection>
    {/if}
    {#if sameType&&canEditText(e)}
      <InspectorTypography {scope} items={propertyItems} editingId={editor.editingId} icon={Type}>
        {#if e.type==='text'}<ObjectStyles mode="text" onedit={onstyles}/>{/if}
        {#if isTextShape(e)}
          {#if single}<label class="field-label">Content<textarea class="ui-property-input" aria-label={e.type==='line'?'Line text':'Shape text'} rows="3" value={e.text} oninput={event=>editor.patch({text:event.currentTarget.value},'shape-text')}></textarea></label>{/if}
          <PropertyRow label="Text"><ColorField label={e.type==='line'?'Line text color':'Shape text color'} value={textValue('fill')} mixed={textStates.fill.mixed} onchange={value=>patchText({fill:value},'shape-text-color')}/></PropertyRow>
        {/if}
        <FontPicker onbrowse={onfonts} showLinkHint={false}/>
        <div class="property-grid font-properties"><label class="weight-field"><span class="sr-only">Weight</span><select class="ui-property-input" aria-label="Weight" title="Font weight" value={mixed('fontWeight')?'':linkedWeight?'style':textValue('fontWeight')} onchange={event=>chooseWeight(event.currentTarget.value)}>{#if mixed('fontWeight')}<option value="" disabled>Mixed</option>{/if}{#if weightRole}<option value="style" disabled={Boolean(editor.editingId)}>Style · {styleWeight}</option>{/if}{#each [...new Set([...weights,textValue('fontWeight')])].sort((a,b)=>a-b) as w}<option value={w}>{WEIGHT_LABELS[w]||w}</option>{/each}</select></label><NumberField unit="px" label="Font size" prefix="Size" presets={[12,14,16,18,20,24,32,40,48,64,80,96,120]} hint="Font size in px" value={Math.round(textValue('fontSize')*10)/10} mixed={mixed('fontSize')} min={4} max={500} step="any" onchange={value=>number(value,'fontSize')}/></div>
        <div class="inspector-format-row"><div class="decoration-buttons" role="group" aria-label="Text formatting"><button class="icon-btn" aria-label="Bold" title="Bold" aria-pressed={boldState} onclick={()=>patchText({fontWeight:boldState===true?400:700})}><Bold size={16}/></button><button class="icon-btn" aria-label="Italic" title="Italic" aria-pressed={italicState} onclick={()=>patchText({italic:italicState!==true})}><Italic size={16}/></button><button class="icon-btn" aria-label="Underline" title="Underline" aria-pressed={underlineState} onclick={()=>patchText({underline:underlineState!==true,...(underlineState!==true?{strikethrough:false}:{})})}><Underline size={16}/></button><button class="icon-btn" aria-label="Strikethrough" title="Strikethrough" aria-pressed={strikeState} onclick={()=>patchText({strikethrough:strikeState!==true,...(strikeState!==true?{underline:false}:{})})}><Strikethrough size={16}/></button></div><PropertyChoice label="Text alignment" value={mixed('align')?'':textValue('align')} icons options={[{value:'left',label:'Left',icon:AlignLeft},{value:'center',label:'Center',icon:AlignCenter},{value:'right',label:'Right',icon:AlignRight}]} onchange={value=>patchText({align:value as SlideElement['align']})}/></div>
        <div class="property-choice-row"><span>Vertical</span><PropertyChoice label="Vertical text alignment" value={mixed('verticalAlign')?'':isTextShape(e)?shapeTextElement(e).verticalAlign:e.verticalAlign} icons options={[{value:'top',label:'Top',icon:textAlignmentIcons.top},{value:'middle',label:'Middle',icon:textAlignmentIcons.middle},{value:'bottom',label:'Bottom',icon:textAlignmentIcons.bottom}]} disabled={e.type==='text'&&sizing!=='fixed'} onchange={value=>patchText({verticalAlign:value as SlideElement['verticalAlign']})}/></div>{#if e.type==='text'&&sizing!=='fixed'}<p class="compact-hint">Use Fixed size to align text vertically.</p>{/if}
        <details class="inspector-disclosure" bind:open={sections.textOptions} use:uiDisclosure={next=>sections.textOptions=next}><summary><span>More text options</span><ChevronDown size={14}/></summary><div class="inspector-disclosure-body"><div class="property-stack"><NumberField label="Line height" preset="lineHeight" prefix="Line height" keyboardStep={.05} unit="×" value={textValue('lineHeight')} mixed={mixed('lineHeight')} min={.5} max={4} step="any" onchange={value=>number(value,'lineHeight')}/><NumberField label="Letter spacing" preset="tracking" prefix="Letter spacing" value={textValue('letterSpacing')} mixed={mixed('letterSpacing')} min={-30} max={50} unit="px" step="any" onchange={value=>number(value,'letterSpacing')}/></div>{#if single&&e.type==='text'}<label class="field-label">Content<textarea class="ui-property-input" aria-label="Text content" rows="4" value={e.text} oninput={event=>editor.patch({text:event.currentTarget.value},'text')}></textarea></label>{#key `${editor.deck?.id}:${editor.slide?.id}:${e.id}`}{@const target={deck:editor.deck?.id,slide:editor.slide?.id,id:e.id}}<TextLinkField value={e.link} onchange={link=>{if(editor.deck?.id!==target.deck)return;const object=editor.deck?.slides.find(s=>s.id===target.slide)?.elements.find(e=>e.id===target.id);if(object?.type==='text'&&!object.locked)editor.commit([{op:'update_element',slideId:target.slide!,elementId:target.id,patch:{link}}]);}}/>{/key}{/if}</div></details>
      </InspectorTypography>
    {:else if sameType&&e.type==='image'&&!drawings.any}
      <InspectorSection title={region ? 'Area fill' : 'Image'} icon={Image} label="Image properties" bind:open={sections.image}>
        {#if region}<p class="compact-hint">Resize this area freely. The pattern or texture fills its bounds.</p>{:else}<div class="image-mode-row"><PropertyChoice label="Image fit mode" value={editor.croppingId===e.id?'crop':mixed('fit')?'':e.fit} disabled={Boolean(e.sourceRegion)} options={[{value:'cover',label:'Fill',description:'Fill the box and crop excess image'},{value:'contain',label:'Fit',description:'Keep the entire image visible'},{value:'crop',label:'Crop',description:'Adjust directly on the canvas'},{value:'fill',label:'Stretch',description:'Stretch the image to the box'}]} onchange={value=>void imageFit(value as SlideElement['fit'])}/>{#if single&&!e.sourceRegion}<RestoreImageRatio value={e} disabled={Boolean(editor.croppingId)} onchange={patch=>editor.patch(patch)}/>{/if}</div>{/if}
        {#if imageError}<p class="inspector-error" role="alert">{imageError}</p>{/if}
        {#if recolorable}{#key editor.selected.join(',')}<AsyncFeature feature="resource-appearance" props={{}} />{/key}{/if}
        {#if single&&!e.sourceRegion&&!region}{#if e.fit==='cover'&&!editor.croppingId}<ImagePositionControls value={e} onchange={(patch,merge)=>editor.patch(patch,merge)}/>{/if}{#if e.fit==='crop'&&!editor.croppingId}<Button variant="quiet" class="full" onclick={()=>editor.croppingId=e.id}><Crop size={16}/>Edit crop</Button><p class="compact-hint">Double-click the image to crop.</p>{/if}{/if}
        <div class="inspector-actions"><Button variant="quiet" aria-label="Flip image horizontally" aria-pressed={mixed('flipX')?'mixed':e.flipX} onclick={()=>flip('flipX')}><FlipHorizontal2 size={16}/>Horizontal</Button><Button variant="quiet" aria-label="Flip image vertically" aria-pressed={mixed('flipY')?'mixed':e.flipY} onclick={()=>flip('flipY')}><FlipVertical2 size={16}/>Vertical</Button></div>
        {#if single}<Button variant="secondary" class="full" onclick={()=>onresources?.(e.id)}><Replace size={16}/>Replace image</Button>
        {#if e.sourceRegion}<p class="compact-hint">Replace this source region to adjust its crop.</p>{/if}
        {#if e.resource}<details class="inspector-disclosure resource-provenance" bind:open={sections.provenance} use:uiDisclosure={next=>sections.provenance=next}><summary><span>More information</span><ChevronDown size={14}/></summary><div class="inspector-disclosure-body"><p>{e.resource.provider} · {e.resource.license}</p>{#if e.resource.creator}<p>{e.resource.id.startsWith("unsplash:")?"Photo by":"By"} <a href={e.resource.creatorUrl||e.resource.sourceUrl} target="_blank" rel="noopener noreferrer">{e.resource.creator}</a></p>{/if}{#if e.resource.attribution&&(!e.resource.creator||!e.resource.attribution.includes(e.resource.creator))}<p>{e.resource.attribution}</p>{/if}<div><a href={e.resource.sourceUrl} target="_blank" rel="noopener noreferrer">Original source</a> · <a href={e.resource.licenseUrl} target="_blank" rel="noopener noreferrer">License</a></div>{#if e.resource.licenseNotice}<p>{e.resource.licenseNotice}</p>{/if}</div></details>{/if}{/if}
      </InspectorSection>
    {:else if e.type==='prototype'&&e.prototype&&single}
      <InspectorSection title="Prototype" icon={AppWindow} bind:open={sections.prototype}><label class="field-label">Share link<input class="ui-property-input" aria-label="Prototype link" aria-invalid={Boolean(prototypeError)} aria-describedby={prototypeError?'prototype-link-error':undefined} type="url" value={e.prototype.url} onchange={event=>prototypeUrl(event.currentTarget.value)}/></label>{#if prototypeError}<p id="prototype-link-error" class="inspector-error" role="alert">{prototypeError}</p>{/if}<Button variant="secondary" class="full" onclick={()=>onprototype?.(e)}><Play size={16}/>Interactive preview</Button>
        {#if isFigmaPrototype(e.prototype.url)}<details class="inspector-disclosure" bind:open={sections.display} use:uiDisclosure={next=>sections.display=next}><summary><span>Display options</span><ChevronDown size={14}/></summary><div class="inspector-disclosure-body"><label class="field-label">Zoom<select class="ui-property-input" aria-label="Prototype scale" value={e.prototype.scaling} onchange={event=>editor.patch({prototype:{...e.prototype!,scaling:event.currentTarget.value as 'contain'|'scale-down'|'fit-width'}})}><option value="contain">Fit to window</option><option value="scale-down">Scale down only</option><option value="fit-width">Fit width</option></select></label><PropertyChoice label="Prototype layout" value={String(e.prototype.responsive)} options={[{value:'false',label:'Fixed'},{value:'true',label:'Responsive'}]} onchange={value=>editor.patch({prototype:{...e.prototype!,responsive:value==='true'}})}/><label class="ui-property-check"><input type="checkbox" checked={e.prototype.deviceFrame} onchange={event=>editor.patch({prototype:{...e.prototype!,deviceFrame:event.currentTarget.checked}})}/>Device frame</label><label class="ui-property-check"><input type="checkbox" checked={e.prototype.chrome} onchange={event=>editor.patch({prototype:{...e.prototype!,chrome:event.currentTarget.checked}})}/>Figma footer</label></div></details>{:else}<p class="compact-hint">This website controls its own layout.</p>{/if}
        <details class="inspector-disclosure" bind:open={sections.poster} use:uiDisclosure={next=>sections.poster=next}><summary><span>Poster image</span><ChevronDown size={14}/></summary><div class="inspector-disclosure-body"><label class="field-label">Image URL<input class="ui-property-input" aria-label="Prototype poster" type="url" value={e.prototype.poster??''} placeholder="https://…" onchange={event=>editor.patch({prototype:{...e.prototype!,poster:event.currentTarget.value.trim()||undefined}})}/></label><p class="compact-hint">Shown before activation and in static exports.</p></div></details>
      </InspectorSection>
    {:else if sameType&&e.type==='chart'}
      <InspectorSection title="Chart" icon={ChartColumn} bind:open={sections.chart}>{#if single}<ChartProperties element={e}/>{/if}<NumberField unit="px" label="Data text size" preset="font" prefix="Text size" value={dataLabelSize(e)} mixed={propertyItems.some(item=>dataLabelSize(item)!==dataLabelSize(e))} min={18} max={28} hint="Chart labels use 18–28 px" step="any" onchange={value=>number(value,'fontSize')}/></InspectorSection>
    {:else if sameType&&e.type==='table'}
      <InspectorSection title="Table" icon={Table2} label="Table properties" bind:open={sections.table}>{#if single}{#key e.id}<ElementDataEditor element={e}/>{/key}{/if}<NumberField unit="px" label="Data text size" preset="font" prefix="Text size" value={dataLabelSize(e)} mixed={propertyItems.some(item=>dataLabelSize(item)!==dataLabelSize(e))} min={4} max={500} hint="Table text size in px" step="any" onchange={value=>number(value,'fontSize')}/></InspectorSection>
    {/if}
    {#if !drawings.all}<InspectorSection title="Appearance" icon={Paintbrush} bind:open={sections.appearance}>
      {#if capabilities.radius&&!capabilities.shapeType}<NumberField label="Corner radius" icon={RadiusIcon} presets={[0,4,8,12,16,24,32,48,64]} value={e.radius} mixed={mixed('radius')} min={0} max={500} unit="px" step="any" onchange={value=>number(value,'radius')}/>{/if}
      {#if capabilities.fill}
        {@const title=['text','table'].includes(e.type)?'Text':e.type==='chart'?'Series':'Fill'}
        <PropertyRow label={title}><ColorField label={`${title} color`} value={e.type==='text'?textValue('fill'):e.fill} mixed={mixed('fill')} roles={colorRoles} roleValue={colorLink('fill')} onrole={styleEligible&&!editor.editingId?role=>linkColor('fill',role):undefined} clearLabel={`Remove ${title.toLowerCase()}`} onchange={value=>e.type==='text'?patchText({fill:value},'color'):editor.patch({fill:value},'color')}/></PropertyRow>
      {/if}
      {#if capabilities.stroke}
        {@const title=e.type==='table'?'Border':'Stroke'}
        {#if hasStroke}
          <div class="stroke-properties">
            <PropertyRow label={title}><ColorField label={`${title} color`} value={e.stroke} mixed={mixed('stroke')} roles={colorRoles} roleValue={colorLink('stroke')} onrole={styleEligible&&!editor.editingId?role=>linkColor('stroke',role):undefined} clearLabel={`Remove ${title.toLowerCase()}`} onchange={stroke}/></PropertyRow>
            {#if shapes}<div class="stroke-width"><NumberField label="Stroke width" preset="stroke" prefix="Width" value={e.strokeWidth} mixed={mixed('strokeWidth')} min={0} max={100} unit="px" step="any" onchange={value=>number(value,'strokeWidth')}/></div>{/if}
          </div>
        {:else}
          <PropertyRow label={title}><Button id={`${inspectorId}-add-stroke`} variant="quiet" onclick={()=>stroke(e.stroke!=='transparent'?e.stroke:deckDesignSystem(editor.deck??{}).colors.ink)}><Plus size={14}/>{`Add ${title.toLowerCase()}`}</Button></PropertyRow>
        {/if}
      {/if}
      <NumberField label="Opacity" prefix="Opacity" presets={[0,25,50,75,100]} value={Math.round(e.opacity*1000)/10} mixed={mixed('opacity')} min={0} max={100} unit="%" step="any" onchange={value=>editor.patch({opacity:value/100})}/>
      {#if shapes}<AsyncFeature feature="shape-effects" props={{value:e.shadow,mixed:shadowMixed,mixedFields:shadowMixedFields,disabled:allLocked,onchange:shadow=>editor.patch({shadow}),onpatch:patch=>editor.slide&&editor.commit(shadowPatchOperations(editor.slide,editor.selected,patch),'shadow')}}/>{/if}
    </InspectorSection>{/if}
    {#if !sameType&&!capabilities.fill&&!capabilities.stroke&&styleEligible}<details class="panel-section inspector-section inspector-disclosure" bind:open={sections.colorStyles} use:uiDisclosure={next=>sections.colorStyles=next}><summary><span>Color styles</span><ChevronDown size={14}/></summary><div class="inspector-disclosure-body"><ObjectStyles mode="colors"/></div></details>{/if}
    {/if}
  </fieldset>
{/if}
{/key}
{/if}
<style>
  .panel-section{padding:12px;gap:8px}
  .object-summary{padding-block:8px;position:sticky;top:0;z-index:2;background:var(--surface-chrome)}
  @media(max-height:520px){.object-summary{position:static}}
  .object-heading{gap:8px;min-width:0}
  .object-type-icon{display:grid;place-items:center;width:32px;height:32px;flex:none;color:var(--text-secondary)}
  .object-heading-copy{flex:1;min-width:0;gap:2px}
  .object-heading-copy>span{font-size:var(--ui-meta);line-height:var(--ui-line-body)}
  .object-name{padding:4px 8px;margin-left:-8px;min-height:32px;font-size:var(--ui-text);border-radius:var(--r-control)}
  .object-name:focus-visible{outline:2px solid var(--accent-line);outline-offset:0}
  .inspector-lock-state{padding:12px 16px;display:flex;flex-direction:column;gap:8px;border-bottom:1px solid var(--border-subtle)}
  .inspector-lock-state p{display:flex;align-items:center;gap:8px;font-size:var(--ui-label);color:var(--text-secondary)}
  .inspector-selection-note,.compact-hint{font-size:var(--ui-meta);line-height:var(--ui-line-reading);color:var(--text-secondary)}
  .inspector-selection-note{padding:8px 16px;border-bottom:1px solid var(--border-subtle)}
  h3{font-size:var(--ui-label);line-height:var(--ui-line-body)}
  .section-heading{display:flex;align-items:center;justify-content:space-between}
  .section-heading h3{display:flex;align-items:center;gap:8px;margin:0;min-width:0}.section-heading h3 :global(svg){flex:none;color:var(--text-secondary)}
  .property-stack{display:flex;flex-direction:column;gap:8px;min-width:0}
  .layout-fields{display:flex;flex-direction:column;gap:8px;min-width:0}
  .layout-property-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;min-width:0;align-items:center}
  /* The link reveals inside a reserved slot; editable values never move on hover. */
  .layout-property-row.has-ratio-toggle{grid-template-columns:minmax(0,1fr) 28px minmax(0,1fr);gap:4px}
  .has-ratio-toggle :global(.ratio-toggle){justify-self:center;margin-inline:0}
  @media(max-width:760px),(pointer:coarse){
    .layout-property-row.has-ratio-toggle{grid-template-columns:minmax(0,1fr) 44px minmax(0,1fr);column-gap:0}
    .has-ratio-toggle :global(.ratio-toggle){margin-inline:0}
  }
  .layout-field{min-width:0}
  .property-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,6.5rem),1fr));gap:8px;min-width:0}
  .field-label{min-width:0;margin:0;gap:4px}
  .field-label input,.field-label select,.weight-field select{min-height:var(--property-control-height,36px);background:var(--field-surface);border-color:var(--field-border)}
  .weight-field{min-width:0}
  .weight-field select{width:100%;font-size:var(--ui-label)}
  textarea{background:var(--field-surface);border-color:var(--field-border);font-size:var(--ui-body);line-height:var(--ui-line-reading);resize:vertical}
  .inspector-format-row{display:flex;align-items:stretch;gap:8px;min-width:0}
  .decoration-buttons{display:flex;align-items:center;gap:2px;flex:1;min-width:0}
  .decoration-buttons button{flex:1;min-width:32px;min-height:36px;height:auto;padding:4px;border-radius:var(--r-sm)}
  .decoration-buttons button[aria-pressed='true']{background:var(--state-selected);color:var(--text-link)}
  .decoration-buttons button[aria-pressed='mixed']{background:var(--state-hover)}
  .inspector-format-row :global(.property-choice){flex:1;min-width:0}
  .image-mode-row{display:flex;align-items:center;gap:4px;min-width:0}.image-mode-row :global(.property-choice){flex:1}
  .property-choice-row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;font-size:var(--ui-label);color:var(--text-secondary)}
  .property-choice-row>span{display:flex;flex-direction:column;flex:none;gap:2px}
  .property-choice-row small{font-size:var(--ui-meta)}
  .property-choice-row :global(.property-choice){flex:none;max-width:100%}
  .inspector-disclosure{min-width:0}
  .inspector-disclosure>summary{display:flex;align-items:center;gap:8px;min-height:32px;cursor:pointer;list-style:none;color:var(--text-secondary);font-size:var(--ui-label)}
  .inspector-disclosure>summary::-webkit-details-marker{display:none}
  .inspector-disclosure>summary span{flex:1;min-width:0}
  .inspector-disclosure>summary :global(svg){flex:none}
  .inspector-disclosure[open]>summary :global(svg){rotate:180deg}
  .inspector-disclosure>summary:focus-visible{outline:2px solid var(--accent-line);outline-offset:0;border-radius:var(--r-sm)}
  .inspector-disclosure-body{display:flex;flex-direction:column;gap:8px;padding-block:8px 4px}
  .inspector-actions{display:flex;gap:8px;flex-wrap:wrap}
  .inspector-actions :global(button){flex:1 1 7rem;min-width:0;white-space:normal}
  .inspector-actions :global(button[aria-pressed='true']){background:var(--state-selected);color:var(--text-link)}
  .stroke-properties{display:flex;flex-direction:column;gap:8px}.stroke-width{padding-left:0;min-width:0}
  
  
  
  
  .resource-provenance{font-size:var(--ui-label);line-height:var(--ui-line-reading)}
  .resource-provenance p,.resource-provenance a{overflow-wrap:anywhere}
  .inspector-error{font-size:var(--ui-meta);color:var(--danger-text)}
  @media(max-width:760px),(pointer:coarse){
    .image-mode-row :global(.icon-btn){min-width:44px;min-height:44px}
    .object-name,.field-label input,.field-label select,.weight-field select,.inspector-disclosure>summary,
    .inspector-format-row{flex-wrap:wrap}.decoration-buttons{flex-basis:100%}.decoration-buttons button{min-height:44px;min-width:44px}
    .property-choice-row{align-items:stretch;flex-direction:column;gap:4px}.property-choice-row>span{flex-direction:row;gap:8px}.property-choice-row :global(.property-choice){width:100%}
    .object-summary :global(.ui-button),.inspector-lock-state :global(.ui-button),.inspector-section :global(.ui-button){min-height:44px}
    .object-summary :global(.object-menu .ui-button){min-width:44px}
    .stroke-width{padding-left:0}
  }
  @media(min-width:761px){.inspector-section{container-type:inline-size}}
  @container(max-width:15rem){.inspector-format-row{flex-wrap:wrap}.decoration-buttons{flex-basis:100%}}
  @container(max-width:13rem){.stroke-width{padding-left:0}}
</style>
