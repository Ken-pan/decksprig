<script lang="ts">
  import {getContext,onDestroy,onMount,untrack} from 'svelte';
  import {Pipette,Check} from '@lucide/svelte';
  import PopoverPanel from './PopoverPanel.svelte';
  import Button from './Button.svelte';
  import NumberField from './NumberField.svelte';
  import {visualBounds} from '../../ui-viewport';
  import {colorToHsva,hsvaToColor,colorPlanePoint,colorChannels,channelsToColor,type ColorFormat,type Hsva} from '../../core/color-picker';
  import {propertyColor} from '../../core/property-color';
  import {beginPropertyGesture} from '../../core/property-gesture';
  import type {Editor} from '../../core/editor.svelte';
  import './color-popover.css';
  let {anchor,label,value,mixed=false,opaque=false,open=$bindable(false),oninput,onchange,roles=[],roleValue='',onrole}:{
    anchor:HTMLElement;label:string;value:string;mixed?:boolean;opaque?:boolean;open?:boolean;
    roles?:{value:string;label:string;color?:string}[];roleValue?:string;onrole?:(role:string)=>void;
    oninput?:(value:string)=>void;onchange?:(value:string)=>void;
  }=$props();
  const editor=getContext<Editor|undefined>('numeric-editor'),id=$props.id();
  let surface=$state<PopoverPanel>(),hsv=$state<Hsva>({h:0,s:0,v:1,a:1}),hex=$state('#ffffff'),invalid=$state(false),sampling=$state(false),error=$state('');
  let mode=$state<'custom'|'tokens'>('custom');
  let format=$state<ColorFormat>('hex'),room=$state(500),largeTargets=$state(false),channelValidity=$state<Record<string,boolean>>({});
  const channelsValid=$derived(Object.values(channelValidity).every(Boolean));
  const usableRoom=$derived(room-(onrole&&roles.length?56:0)-(invalid||!channelsValid||error?64:0));
  const compact=$derived(usableRoom<400),tiny=$derived(usableRoom<350),minimal=$derived(usableRoom<230);
  const channels=$derived(format==='hex'?[]:colorChannels(hsv,format));
  const tokenSelect=$derived(Math.min(520,room)<(largeTargets?148:128)+roles.length*48);
  const channelLabels=$derived(format==='rgb'?['Red','Green','Blue']:format==='hsl'?['Hue','Saturation','Lightness']:['Hue','Saturation','Brightness']);
  let expected='',frame=0,pending:Hsva|undefined,disposed=false,sample:AbortController|undefined;
  type Drag={node:HTMLElement;id:number;before:Hsva;beforeColor:string;gesture?:ReturnType<typeof beginPropertyGesture>};
  let drag:Drag|undefined;
  const currentColor=$derived(hsvaToColor(hsv)),hueColor=$derived(hsvaToColor({h:hsv.h,s:1,v:1,a:1}));
  const canSample=typeof window!=='undefined'&&'EyeDropper' in window;
  function load(color:string){hsv=colorToHsva(mixed?'#ffffff':color);if(opaque)hsv.a=1;hex=hsvaToColor(hsv);invalid=false;expected=color;}
  function initialize(){load(value);error='';mode=onrole&&roles.length&&roleValue?'tokens':'custom';}
  function chooseToken(role:string){finish();invalid=false;error='';onrole?.(role);}
  function modeKey(event:KeyboardEvent){
    if(event.isComposing||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();mode=event.key==='Home'?'custom':event.key==='End'?'tokens':mode==='custom'?'tokens':'custom';
    (event.currentTarget as HTMLElement).parentElement?.querySelector<HTMLElement>(`[data-mode="${mode}"]`)?.focus();
  }
  $effect(()=>{if(open)surface?.show();else{surface?.close();untrack(()=>{finish();sample?.abort();});}});
  $effect(()=>{const next=value;if(open&&next!==expected)untrack(()=>load(next));});
  function publish(next:Hsva,final=false){
    if(disposed||!open)return;
    const color=hsvaToColor({...next,a:opaque?1:next.a});
    const apply=()=>{hsv={...next,a:opaque?1:next.a};hex=color;invalid=false;expected=color;(oninput??onchange)?.(color);if(final&&oninput)onchange?.(color);};
    if(drag?.gesture){if(!drag.gesture.apply(apply))surface?.close();}else apply();
  }
  function flush(){cancelAnimationFrame(frame);frame=0;const next=pending;pending=undefined;if(next)publish(next);}
  function preview(next:Hsva){hsv=next;pending=next;if(!frame)frame=requestAnimationFrame(flush);}
  function start(event:PointerEvent){
    if(event.button!==0||!event.isPrimary||drag)return;
    const node=event.currentTarget as HTMLElement;drag={node,id:event.pointerId,before:{...hsv},beforeColor:value,gesture:editor?beginPropertyGesture(editor):undefined};
    node.setPointerCapture(event.pointerId);
  }
  function plane(event:PointerEvent){if(!drag||event.pointerId!==drag.id)return;const bounds=drag.node.getBoundingClientRect();preview({...hsv,...colorPlanePoint(event.clientX-bounds.left,event.clientY-bounds.top,bounds.width,bounds.height)});}
  function planeStart(event:PointerEvent){start(event);if(!drag)return;event.preventDefault();drag.node.focus({preventScroll:true});plane(event);}
  function finish(cancel=false){
    if(!drag)return;
    if(cancel){cancelAnimationFrame(frame);frame=0;pending=undefined;}else flush();
    const previous=drag;drag=undefined;
    const current=previous.gesture?.isCurrent()??true,rolledBack=previous.gesture?.finish(cancel);
    if(cancel&&current){hsv=previous.before;hex=hsvaToColor(hsv);expected=previous.beforeColor;if(!rolledBack)(oninput??onchange)?.(previous.beforeColor);}
    if(previous.node.hasPointerCapture(previous.id))previous.node.releasePointerCapture(previous.id);
  }
  function end(event:PointerEvent,cancel=false){if(event.pointerId===drag?.id)finish(cancel);}
  function planeKey(event:KeyboardEvent){
    if(event.isComposing||event.altKey||event.ctrlKey||event.metaKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();const step=event.shiftKey?.1:.01;
    publish({...hsv,s:event.key==='Home'?0:event.key==='End'?1:Math.max(0,Math.min(1,hsv.s+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0))),v:Math.max(0,Math.min(1,hsv.v+(event.key==='ArrowUp'?step:event.key==='ArrowDown'?-step:0)))},true);
  }
  function editHex(){const next=propertyColor(hex);if(!next||next==='transparent'||opaque&&next.length!==7){invalid=true;return false;}publish(colorToHsva(next),true);return true;}
  function changeFormat(event:Event){const select=event.currentTarget as HTMLSelectElement,next=select.value as ColorFormat,active=document.activeElement;if(active instanceof HTMLInputElement&&active.closest('.ui-color-popover'))active.blur();if(format==='hex'&&hex!==currentColor&&!editHex()){select.value=format;return;}format=next;channelValidity={};invalid=false;hex=currentColor;}
  function channelChange(index:number,model:Exclude<ColorFormat,'hex'>){return(value:number)=>{if(format!==model)return;const next=colorChannels(hsv,model);next[index]=value;publish(channelsToColor(next,model,hsv.a),true);};}
  function key(event:KeyboardEvent){
    if(event.isComposing||event.keyCode===229)return;
    if(event.key==='Escape'&&drag){event.preventDefault();event.stopPropagation();finish(true);}
    else if(event.key==='Enter'&&event.target instanceof HTMLInputElement&&event.target.type==='text'){event.preventDefault();event.stopPropagation();if(editHex())surface?.close();}
  }
  async function pickScreen(){
    type EyeDropper={open:(options:{signal:AbortSignal})=>Promise<{sRGBHex:string}>};
    const EyeDropper=(window as unknown as {EyeDropper?:new()=>EyeDropper}).EyeDropper;if(!EyeDropper)return;
    sample?.abort();const request=new AbortController();sample=request;sampling=true;error='';
    try{const result=await new EyeDropper().open({signal:request.signal});if(!disposed&&open&&!request.signal.aborted)publish({...colorToHsva(result.sRGBHex),a:hsv.a},true);}
    catch(reason){if(!request.signal.aborted&&open&&(reason as Error).name!=='AbortError')error='Color sampling is unavailable.';}
    finally{if(sample===request){sampling=false;sample=undefined;}}
  }
  onMount(()=>{const targets=matchMedia('(max-width:760px),(pointer:coarse)'),resize=()=>{room=Math.max(120,visualBounds().height-24);largeTargets=targets.matches;};resize();targets.addEventListener('change',resize);window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);return()=>{targets.removeEventListener('change',resize);window.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize);};});
  onDestroy(()=>{finish();disposed=true;cancelAnimationFrame(frame);sample?.abort();});
</script>
<PopoverPanel bind:this={surface} title={label} {anchor} returnFocus={()=>anchor} bind:open width={288} height={Math.min(520,room)} minHeight={520} autoHeight viewportOnly class={`ui-color-popover ${mode==='tokens'?'tokens':''} ${compact?'compact':''} ${tiny?'tiny':''} ${minimal?'minimal':''}`} onopen={initialize} onkeydown={key}>
  {#if onrole&&roles.length}
    <div class="picker-modes" role="tablist" aria-label="Color source">
      {#each ['custom','tokens'] as item}<button type="button" role="tab" id={`${id}-${item}-tab`} aria-controls={`${id}-${item}-panel`} aria-selected={mode===item} tabindex={mode===item?0:-1} data-mode={item} onclick={()=>mode=item as 'custom'|'tokens'} onkeydown={modeKey}>{item==='custom'?'Custom':'Tokens'}</button>{/each}
    </div>
  {/if}
  {#if mode==='tokens'&&onrole&&roles.length}
    <div class="picker-tokens" role="tabpanel" id={`${id}-tokens-panel`} aria-labelledby={`${id}-tokens-tab`}>
      {#if tokenSelect}<select class="picker-token-select" aria-label="Color token" value={roleValue} onchange={event=>chooseToken(event.currentTarget.value)}><option value="" disabled>Choose a token</option>{#each roles as role}<option value={role.value}>{role.label}</option>{/each}</select>
      {:else}{#each roles as role}<button type="button" class="picker-token" aria-label={`Color token: ${role.label}`} aria-pressed={roleValue===role.value} onclick={()=>chooseToken(role.value)}><i style:background={role.color} aria-hidden="true"></i><span>{role.label}</span>{#if roleValue===role.value}<Check size={14} aria-hidden="true"/>{/if}</button>{/each}{/if}
    </div>
  {:else}
  <div class="color-popover-content" role={onrole&&roles.length?'tabpanel':undefined} id={`${id}-custom-panel`} aria-labelledby={onrole&&roles.length?`${id}-custom-tab`:undefined}>
    {#if !tiny}<button type="button" class="color-plane" style:--picker-hue={hueColor} aria-label="Saturation and brightness" aria-describedby={`${id}-plane-help`} onpointerdown={planeStart} onpointermove={plane} onpointerup={event=>end(event)} onpointercancel={event=>end(event,true)} onlostpointercapture={event=>end(event)} onkeydown={planeKey}>
      <span class="color-plane-marker" style:left={`${hsv.s*100}%`} style:top={`${(1-hsv.v)*100}%`} aria-hidden="true"></span>
    </button>{/if}
    <span id={`${id}-plane-help`} class="sr-only">Use arrow keys to adjust saturation and brightness. Hold Shift for larger steps. Saturation {Math.round(hsv.s*100)} percent, brightness {Math.round(hsv.v*100)} percent.</span>
    {#if !tiny}<label class="picker-slider"><span>Hue</span><input class="picker-hue" type="range" min="0" max="360" step="1" value={hsv.h} aria-label="Hue" aria-valuetext={`${Math.round(hsv.h)} degrees`} onpointerdown={start} onpointerup={event=>end(event)} onpointercancel={event=>end(event,true)} onlostpointercapture={event=>end(event)} oninput={event=>publish({...hsv,h:event.currentTarget.valueAsNumber})}/><span class="picker-percent">{Math.round(hsv.h)}°</span></label>{/if}
    {#if !opaque&&!minimal}<label class="picker-slider"><span>Opacity</span><input class="picker-alpha" style:--picker-color={hsvaToColor({...hsv,a:1})} type="range" min="0" max="100" step="1" value={Math.round(hsv.a*100)} aria-label="Color opacity" aria-valuetext={`${Math.round(hsv.a*100)} percent`} onpointerdown={start} onpointerup={event=>end(event)} onpointercancel={event=>end(event,true)} onlostpointercapture={event=>end(event)} oninput={event=>publish({...hsv,a:event.currentTarget.valueAsNumber/100})}/><span class="picker-percent">{Math.round(hsv.a*100)}%</span></label>{/if}
    <div class="picker-format-row"><select aria-label="Color format" value={format} onchange={changeFormat}><option value="hex">Hex</option><option value="rgb">RGB</option><option value="hsl">HSL</option><option value="hsb">HSB</option></select><span class="picker-result" style:--property-color={currentColor} aria-hidden="true"></span>{#if canSample}<Button kind="icon" aria-label="Pick color from screen" title="Pick color from screen" busy={sampling} onclick={pickScreen}><Pipette size={16}/></Button>{/if}</div>
    {#if format==='hex'}<input class="picker-hex-input" onkeydowncapture={event=>{if(event.key==='Tab'&&!event.isComposing&&event.keyCode!==229&&hex!==currentColor)editHex();}} type="text" aria-label="Color hex" aria-invalid={invalid} aria-describedby={invalid?`${id}-error`:undefined} spellcheck="false" autocapitalize="off" autocomplete="off" bind:value={hex} oninput={()=>invalid=!propertyColor(hex)||hex.trim()==='transparent'||opaque&&propertyColor(hex)?.length!==7} onchange={editHex}/>
    {:else}<div class="picker-channels">{#each channelLabels as name,i (`${format}-${i}`)}<NumberField label={name} prefix={name[0]} scrubbable={false} value={channels[i]} presets={[]} min={0} max={format==='rgb'?255:i===0?360:100} unit={format==='rgb'?'':i===0?'°':'%'} onvaliditychange={valid=>channelValidity={...channelValidity,[name]:valid}} onchange={channelChange(i,format as Exclude<ColorFormat,'hex'>)}/>{/each}</div>{/if}
    {#if invalid}<p id={`${id}-error`} class="picker-error" role="alert">{opaque?'Enter a six-digit hex color.':'Enter a valid hex color.'}</p>{/if}
    {#if error}<p class="picker-error" role="status">{error}</p>{/if}
  </div>
  {/if}
</PopoverPanel>
