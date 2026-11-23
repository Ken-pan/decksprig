<script lang="ts">
  import {getContext,onDestroy,tick,untrack,type Component} from 'svelte';
  import {Check,ArrowLeftRight} from '@lucide/svelte';
  import {positionFloating} from '../../ui-viewport';
  import {holdPointerCursor} from '../../pointer-cursor';
  import {snappedScrubNumber,numberPresets,numberMenuPresets,type NumberPreset,type NumberPresetKind} from '../../core/numeric-field';
  import {nextIncrement} from '../../core/numeric-increment';
  import {beginPropertyGesture} from '../../core/property-gesture';
  import type {Editor} from '../../core/editor.svelte';
  let {label,prefix=label,icon,value,mixed=false,automatic=false,unit='',min,max,step=1,increment,keyboardStep,disabled=false,hint,preset='number',presets,compact=false,scrubbable=true,invalid=false,descriptionId,scopeKey='',input=$bindable<HTMLInputElement>(),inputAttributes={},oninput,onkeydown,onpaste,onchange,onvaliditychange}: {
    label:string;prefix?:string;icon?:Component<any>;value?:number|string;mixed?:boolean;automatic?:boolean;unit?:string;min?:number;max?:number;step?:number|string;increment?:number;keyboardStep?:number;disabled?:boolean;hint?:string;preset?:NumberPresetKind;presets?:readonly NumberPreset[];compact?:boolean;scrubbable?:boolean;invalid?:boolean;descriptionId?:string;scopeKey?:string;input?:HTMLInputElement;inputAttributes?:Record<string,unknown>;oninput?:(raw:string)=>void;onkeydown?:(event:KeyboardEvent)=>void;onpaste?:(event:ClipboardEvent)=>void;onchange:(value:number)=>unknown;onvaliditychange?:(valid:boolean)=>void;
  }=$props();
  const id=$props.id(),editScope=getContext<()=>string|undefined>('property-edit-scope'),documentEditor=getContext<Editor|undefined>('numeric-editor');
  const readScope=()=>`${editScope?.()??(documentEditor?`${documentEditor.deck?.id}:${documentEditor.activeId}:${documentEditor.selected.join(',')}:${documentEditor.selectedContainer}`:'')}:${scopeKey}`;
  const reportValidity=getContext<((id:string,valid?:boolean)=>void)|undefined>('numeric-validity');
  function validity(valid:boolean){onvaliditychange?.(valid);reportValidity?.(id,valid);}
  let scope=readScope(),disposed=false,submitted:number|undefined;
  let error=$state(''),field=$state<HTMLDivElement>(),menu=$state<HTMLDivElement>(),open=$state(false),scrubbing=$state(false),pointerHeld=$state(false);
  let snapped=$state<number|undefined>();
  let positionFrame=0,valueFrame=0,restoringFocus=false;
  type Gesture=ReturnType<typeof beginPropertyGesture>;
  type Drag={pointerId:number;node:HTMLButtonElement;startX:number;lastX:number;base:number;lastValue:number;original:number;originalRaw:string;targets:number[];snap?:number;precision:string;active:boolean;applied:boolean;scope:string;gesture?:Gesture;release?:()=>void;pending?:number};
  let drag:Drag|undefined;
  const Icon=$derived(icon),displayed=$derived(mixed?'':String(value??''));
  const choices=$derived(numberPresets(preset,{presets,min,max,step}));
  const menuChoices=$derived(numberMenuPresets(preset,{presets,min,max,step}));
  const enabled=()=>!disposed&&!disabled&&Boolean(input&&!input.matches(':disabled')&&!input.closest('[inert]'));
  const unitNames:Record<string,string>={px:'pixels','%':'percent','°':'degrees',ms:'milliseconds','×':'multiplier'};
  const help=$derived([mixed?'Multiple values.':automatic?'Automatic value.':'',unit?`Unit: ${unitNames[unit]??unit}.`:'',hint??'','Drag the label to adjust. Snaps to common values. Shift for larger steps. Alt for precision without snapping.',choices.length?'Click for presets. Press Alt + Down to browse presets.':''].filter(Boolean).join(' '));
  function focusInput(){restoringFocus=true;input?.focus({preventScroll:true});restoringFocus=false;}
  function position(){if(menu&&field&&open){menu.style.width=`${Math.max(menuChoices.some(item=>item.label)?192:128,field.offsetWidth)}px`;positionFloating(menu,field.getBoundingClientRect(),{maxHeight:240,preferredHeight:Math.min(240,menu.scrollHeight),minHeight:44});}}
  function schedulePosition(){if(!open)return;cancelAnimationFrame(positionFrame);positionFrame=requestAnimationFrame(position);}
  async function showPresets(focus=false){if(restoringFocus||!enabled()||!choices.length||drag)return;if(!menu?.matches(':popover-open'))menu?.showPopover();await tick();if(!open)return;position();if(focus)menu?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});}
  function hidePresets(){const previous=restoringFocus;restoringFocus=true;try{menu?.hidePopover();}finally{restoringFocus=previous;}}
  function beforeToggle(event:ToggleEvent){open=event.newState==='open';if(!open){restoringFocus=true;queueMicrotask(()=>restoringFocus=false);}if(menu){menu.inert=!open;if(open){const display=menu.style.display;menu.style.display='flex';position();menu.style.display=display;}}}
  function validInput(){return Boolean(input&&(input.value.trim()?input.validity.valid&&Number.isFinite(input.valueAsNumber):mixed||automatic));}
  function commitInput(node:HTMLInputElement){
    if(!enabled()||scope!==readScope()||!node.isConnected)return;
    if(!node.value.trim()&&(mixed||automatic)){error='';validity(true);return;}
    if(!validInput()){validity(false);error=node.validity.stepMismatch?`Use increments of ${step}.`:min!==undefined&&max!==undefined?`Use ${min} to ${max}.`:min!==undefined?`Use ${min} or more.`:max!==undefined?`Use ${max} or less.`:'Enter a valid number.';return;}
    validity(true);const next=Number(node.value);error='';if(next===submitted||!mixed&&!automatic&&next===Number(value))return;
    if(onchange(next)===false){node.value=displayed;return;}submitted=next;
  }
  function applyValue(next:number){if(!input)return;input.value=String(next);commitInput(input);}
  function choose(next:number){if(!enabled()||scope!==readScope())return;applyValue(next);hidePresets();focusInput();}
  function presetKey(event:KeyboardEvent){
    if(event.isComposing||event.keyCode===229)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hidePresets();focusInput();return;}
    if(event.key==='Tab'){hidePresets();focusInput();return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    const buttons=Array.from(menu?.querySelectorAll<HTMLButtonElement>('button')??[]),index=buttons.indexOf(event.target as HTMLButtonElement);
    const button=buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length];
    button?.focus({preventScroll:true});button?.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  function down(event:PointerEvent){
    if(event.button!==0||!event.isPrimary||!enabled()||!input||drag)return;
    event.preventDefault();hidePresets();
    if(!validInput()){focusInput();commitInput(input);return;}
    if(input.value.trim())commitInput(input);
    const current=input.value.trim()?input.valueAsNumber:Number(value);
    if(!Number.isFinite(current)){focusInput();return;}
    const node=event.currentTarget as HTMLButtonElement;
    drag={pointerId:event.pointerId,node,startX:event.clientX,lastX:event.clientX,base:current,lastValue:current,original:current,originalRaw:input.value,targets:choices.map(item=>item.value),precision:'',active:false,applied:false,scope:readScope()};
    pointerHeld=true;node.setPointerCapture(event.pointerId);node.focus({preventScroll:true});
  }
  function flushValue(){
    cancelAnimationFrame(valueFrame);valueFrame=0;
    if(!drag||drag.pending===undefined)return;
    if(!enabled()||drag.scope!==readScope()){drag.pending=undefined;finish();return;}
    const next=drag.pending;drag.pending=undefined;
    const state=drag,apply=()=>{state.applied=true;applyValue(next);};
    if(state.gesture){if(!state.gesture.apply(apply))finish();}else apply();
  }
  function move(event:PointerEvent){
    if(!drag||event.pointerId!==drag.pointerId||!input)return;
    if(!enabled()||drag.scope!==readScope()){finish();return;}
    if(!drag.active){if(Math.abs(event.clientX-drag.startX)<3)return;drag.active=true;scrubbing=true;drag.gesture=documentEditor?beginPropertyGesture(documentEditor):undefined;drag.release=holdPointerCursor('ew-resize');}
    const precision=event.shiftKey?'coarse':event.altKey?'fine':'';
    if(precision!==drag.precision){drag.base=drag.lastValue;drag.startX=drag.lastX;drag.precision=precision;drag.snap=undefined;}
    const result=snappedScrubNumber(drag.base,(event.clientX-drag.startX)/2,{step:keyboardStep??(typeof step==='number'?step:1),fine:event.altKey,coarse:event.shiftKey,fractional:step==='any',increment,min,max,stepBase:min},drag.targets,drag.snap);
    const next=result.value;drag.snap=result.snapped;snapped=result.snapped;
    drag.lastX=event.clientX;
    // Rebase at a limit so reversing immediately moves away from the boundary.
    if(next===min||next===max){drag.base=next;drag.startX=event.clientX;}
    if(next===drag.lastValue)return;
    drag.lastValue=next;drag.pending=next;
    if(!valueFrame)valueFrame=requestAnimationFrame(flushValue);
  }
  function finish(cancel=false){
    if(!drag)return;if(!cancel)flushValue();
    const previous=drag;if(!previous)return;drag=undefined;pointerHeld=false;cancelAnimationFrame(valueFrame);valueFrame=0;scrubbing=false;snapped=undefined;previous.release?.();
    const canRestore=previous.gesture?.isCurrent()??true;
    const rolledBack=previous.gesture?.finish(cancel);
    if(cancel&&previous.applied&&canRestore&&!rolledBack&&previous.scope===readScope()&&enabled()){
      submitted=undefined;oninput?.(previous.originalRaw);if(previous.originalRaw.trim())onchange(previous.original);if(input)input.value=previous.originalRaw;error='';validity(true);
    }
    if(previous.node.hasPointerCapture(previous.pointerId))previous.node.releasePointerCapture(previous.pointerId);
    if(!previous.active&&!cancel){focusInput();showPresets();}
  }
  function gestureKey(event:KeyboardEvent){if(!drag)return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish(true);}else if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z')finish();}
  function key(event:KeyboardEvent){
    if(!enabled()||scope!==readScope()||event.isComposing||event.keyCode===229)return;
    if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();hidePresets();return;}
    onkeydown?.(event);if(event.defaultPrevented)return;
    if(event.altKey&&event.key==='ArrowDown'&&choices.length){event.preventDefault();event.stopPropagation();void showPresets(true);return;}
    if(event.key==='Tab')hidePresets();
    if(event.key==='Escape'&&input&&(input.value!==displayed||error)){event.preventDefault();event.stopPropagation();input.value=displayed;error='';validity(validInput());}
    else if(event.key==='Enter'){event.preventDefault();event.stopPropagation();if(input)commitInput(input);hidePresets();}
    else if(!event.metaKey&&!event.ctrlKey&&['ArrowUp','ArrowDown'].includes(event.key)&&input){
      event.preventDefault();event.stopPropagation();
      const current=input.value.trim()?input.valueAsNumber:mixed?Number(value):NaN;if(!Number.isFinite(current))return;
      const direction=event.key==='ArrowUp'?1:-1,amount=keyboardStep??(typeof step==='number'?step:1);
      const next=event.shiftKey&&increment?nextIncrement(current,direction,increment):current+direction*amount*(event.shiftKey?10:event.altKey&&step==='any'?.1:1);
      applyValue(Math.max(min??-Infinity,Math.min(max??Infinity,Math.round(next*1e10)/1e10)));
    }
  }
  $effect(()=>{const next=displayed;label;automatic;const nextScope=readScope();if(scope!==nextScope){finish();hidePresets();}scope=nextScope;error='';submitted=undefined;if(input)input.value=next;if(disabled){finish();hidePresets();}untrack(()=>validity(validInput()));});
  onDestroy(()=>{reportValidity?.(id,undefined);disposed=true;finish();cancelAnimationFrame(positionFrame);cancelAnimationFrame(valueFrame);});
  $effect(()=>{
    if(!open&&!pointerHeld)return;
    window.addEventListener('keydown',gestureKey,true);
    const blur=()=>finish(true);window.addEventListener('blur',blur);
    const observer=new ResizeObserver(schedulePosition);if(field)observer.observe(field);if(menu)observer.observe(menu);
    window.addEventListener('resize',schedulePosition);window.addEventListener('scroll',schedulePosition,true);
    window.visualViewport?.addEventListener('resize',schedulePosition);window.visualViewport?.addEventListener('scroll',schedulePosition);
    return()=>{window.removeEventListener('blur',blur);window.removeEventListener('keydown',gestureKey,true);observer.disconnect();window.removeEventListener('resize',schedulePosition);window.removeEventListener('scroll',schedulePosition,true);window.visualViewport?.removeEventListener('resize',schedulePosition);window.visualViewport?.removeEventListener('scroll',schedulePosition);};
  });
</script>
<div class="number-property" class:compact>
  <div bind:this={field} class="number-field" class:scrubbing class:snapped={snapped!==undefined} data-snapped-value={snapped} class:has-error={Boolean(error)||invalid}>
    {#if scrubbable}<button type="button" class="field-prefix" tabindex="-1" {disabled} aria-label={`Adjust ${label}`} onpointerdown={down} onpointermove={move} onpointerup={event=>{if(event.pointerId===drag?.pointerId)finish();}} onpointercancel={()=>finish(true)} onlostpointercapture={()=>finish()}>{#if Icon}<Icon size={14} aria-hidden="true"/>{:else if prefix}<span class="prefix-label">{prefix}</span>{:else}<ArrowLeftRight size={14} aria-hidden="true"/>{/if}{#if automatic}<small>Auto</small>{/if}</button>{:else}<span class="field-prefix-static" aria-hidden="true">{prefix}</span>{/if}
    <input {...inputAttributes} bind:this={input} aria-controls={choices.length?`${id}-presets`:undefined} onclick={()=>void showPresets()} type="number" data-document-value={displayed} aria-label={label} aria-invalid={Boolean(error)||invalid} aria-describedby={[error?`${id}-error`:'',help?`${id}-help`:'',descriptionId??''].filter(Boolean).join(' ')||undefined} {min} {max} {step} {disabled} value={displayed} placeholder={mixed?'Mixed':automatic?'Auto':undefined} oninput={event=>{if(!enabled()||scope!==readScope())return;error='';validity(validInput());oninput?.(event.currentTarget.value);}} onchange={event=>commitInput(event.currentTarget)} onkeydown={key} {onpaste}/>
    {#if unit}<span class="field-unit" aria-hidden="true">{unit}</span>{/if}
  </div>
  {#if choices.length}
    <div id="{id}-presets" bind:this={menu} popover="auto" class="number-presets" role="listbox" aria-label={`${label} presets`} tabindex="-1" inert={!open} onbeforetoggle={beforeToggle} onkeydown={presetKey}>
      {#if open}{#each menuChoices as item,i}
        <button type="button" role="option" aria-selected={!mixed&&!automatic&&Number(value)===item.value} tabindex={i===0?0:-1} onpointerdown={event=>{if(event.pointerType!=='touch')event.preventDefault();}} onclick={()=>choose(item.value)}>
          <span>{item.label||`${item.value}${unit?` ${unit}`:''}`}</span>{#if item.label}<span class="preset-value">{item.value}{unit?` ${unit}`:''}</span>{/if}{#if !mixed&&!automatic&&Number(value)===item.value}<Check size={13} aria-hidden="true"/>{/if}
        </button>
      {/each}{/if}
    </div>
  {/if}
  <span id="{id}-help" class="sr-only">{help}</span>
  {#if error}<p id="{id}-error" class="field-error" role="alert">{error}</p>{/if}
</div>
<style>
  .number-property{min-width:0;container-type:inline-size}
  .number-field{display:flex;align-items:center;gap:2px;min-height:var(--property-control-height,36px);padding:4px 6px 4px 4px;border:1px solid var(--field-border);border-radius:var(--r-control);background:var(--field-surface);font-size:var(--ui-label);color:var(--text-secondary);min-width:0}
  .field-prefix-static{flex:none;color:var(--text-secondary)}
  .field-prefix{display:flex;align-items:center;justify-content:flex-start;gap:2px;flex:none;min-width:0;max-width:45%;margin:0;min-height:26px;height:auto;padding:0;border:0;border-radius:4px;background:transparent;font:inherit;color:var(--text-secondary);cursor:ew-resize;touch-action:none;user-select:none}
  .field-prefix :global(svg){width:14px;height:14px}
  .prefix-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .field-prefix:disabled{cursor:default}.field-prefix small{font-size:var(--ui-meta);color:var(--text-link)}
  .field-prefix:not(:disabled):hover{color:var(--text-primary);background:var(--state-hover)}
  .number-field.snapped{background:var(--state-selected)}
  .number-field.snapped input{font-weight:var(--ui-weight-medium)}
  .scrubbing,.number-field:focus-within{outline:2px solid var(--accent-line);outline-offset:0}
  input{flex:1;min-width:0;width:100%;height:auto;min-height:0;padding:0;border:0;background:transparent;box-shadow:none;font:inherit;color:var(--text-primary);text-align:right;font-variant-numeric:tabular-nums;appearance:textfield}
  input::-webkit-inner-spin-button{appearance:none;margin:0}.number-property .number-field input[type='number']{min-height:0}input:focus-visible{outline:0}
  .field-unit{flex:none;margin-inline-start:2px;font-size:var(--ui-meta)}
  .number-presets{position:fixed;inset:auto;margin:0;padding:4px;overflow:auto;overscroll-behavior:contain;border:1px solid var(--border-default);border-radius:var(--r-popover,12px);background:var(--surface-overlay,var(--field-surface));color:var(--text-primary);box-shadow:var(--shadow-popover);font-size:var(--ui-label)}
  .number-presets:popover-open{display:flex;flex-direction:column;gap:2px}
  .number-presets button{display:flex;align-items:center;gap:8px;width:100%;min-height:32px;height:auto;padding:6px 8px;border:0;border-radius:var(--r-sm);background:transparent;text-align:left;font:inherit;color:inherit}
  .number-presets button:hover,.number-presets button[aria-selected='true']{background:var(--state-hover)}
  .number-presets button:focus-visible{outline:2px solid var(--accent-line);outline-offset:-2px}.number-presets button>span:first-child{flex:1}.preset-value{color:var(--text-secondary);font-variant-numeric:tabular-nums}
  .has-error{border-color:var(--danger-text)}.field-error{margin-top:4px;font-size:var(--ui-meta);color:var(--danger-text)}
  .compact .number-field{padding:2px 4px;border-color:transparent;background:transparent}.compact .field-prefix{min-width:0;font-size:var(--ui-meta)}
  @media(max-width:760px),(pointer:coarse){.number-field{min-height:var(--property-control-height,44px);padding-block:0}input{font-size:max(16px,var(--ui-label));height:44px}.field-prefix{min-height:44px}.number-presets button{min-height:44px}.compact .number-field{padding-block:0}}
  @media(pointer:coarse){.field-prefix,.compact .field-prefix{min-width:24px}}
</style>
