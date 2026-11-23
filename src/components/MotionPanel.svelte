<script lang="ts">
  import '../motion-preview.css';
  import {rememberPanelScroll} from '../panel-scroll.svelte';
  import {slideLabel} from '../core/slide-label';
  import '../motion-panel.css';
  import { countLabel } from "../core/ui-copy";
  import { tick, untrack, setContext } from 'svelte';
  import { Play, Sparkles, ArrowUp, ArrowDown, CopyPlus, ExternalLink, MousePointer2, Clapperboard, ChevronLeft, ChevronRight, ChevronDown, PanelsTopLeft, ListOrdered } from '@lucide/svelte';
  import { Button, IconButton, SegmentedControl , EmptyState} from './ui';
  import { editor } from '../core/editor.svelte';
  import { ANIMATIONS, MOTION_RECIPES, defaultTransition, defaultAnimation, suggestEntrances, type MotionRecipe } from '../core/motion';
  import { TRANSITION_PRESETS, transitionPreset } from '../core/transitions';
  import TransitionPicker from './TransitionPicker.svelte';
  import FigmaTransitionSettings from './FigmaTransitionSettings.svelte';
  import {smartTransitionContext,editNativeTransition,FIGMA_TRANSITION_CURVES} from '../core/figma-transition-authoring';
  import {nativeSpringDisplayDuration} from '../core/figma-motion-timing';
  import TransitionPreview from './TransitionPreview.svelte';
  import SmartAnimatePreview from './SmartAnimatePreview.svelte';
  import { matchSmartLayers } from '../core/smart-motion';
  import { createNextMotionState, entranceSequence, moveEntranceGroup, objectMotionSequence, moveObjectMotionGroup } from '../core/motion-authoring';
  import NumberField from './ui/NumberField.svelte';
  import Notice from './ui/Notice.svelte';
  import {uiDisclosure} from '../ui-motion';
  import {motionPropertyState} from '../core/motion-properties';
  import {nativeSlideTransition,editFigmaTransition,type NativeSlideTransition} from '../core/figma-transitions';
  import PropertyChoice from './ui/PropertyChoice.svelte';
  import type { ElementAnimation, SlideTransition } from '../core/model';
  let {onpreview, active = true,disabled=false,onexitpreview}: {onpreview: (fromId?:string) => void; active?: boolean;disabled?:boolean;onexitpreview?:()=>void} = $props();
  type Scope = 'page' | 'object' | 'sequence';
  let scope=$state<Scope>('page'), recipe=$state<MotionRecipe>('quiet');
  let body=$state<HTMLDivElement>(),root=$state<HTMLDivElement>();
  rememberPanelScroll(()=>active,()=>`${editor.deck?.id}:${editor.activeId}:${scope}:${editor.selected.join(',')}`,()=>[root,body]);
  let lastSelection='';
  let disclosures=$state({matches:false,more:false,order:false,matching:false});
  let sequencePages=$state({auto:0,click:0}),expandedGroups=$state<Record<string,boolean>>({}),matchLimit=$state(20);
  $effect(()=>{editor.activeId;sequencePages={auto:0,click:0};expandedGroups={};matchLimit=20;});
  const selection=$derived(editor.selection);
  let editable=$derived(selection.filter(e=>!e.locked&&e.type!=='prototype'));
  let selected=$derived(editable[0]??selection[0]);
  const propertyItems=$derived(editable.length?editable:selection);
  setContext('property-edit-scope',()=>`${editor.deck?.id}:${editor.activeId}:${editor.selected.join(',')}:${scope}`);
  let transition=$derived(editor.slide?.transition ?? defaultTransition);
  let nativeTransition=$derived(nativeSlideTransition(transition));
  let springDuration=$derived(nativeTransition?nativeSpringDisplayDuration(nativeTransition.curve):undefined);
  let preset=$derived(transitionPreset(transition.effect));
  let animation=$derived(selected?.animation ?? {...defaultAnimation,phase:'in' as const,trigger:'click' as const});
  let phase=$derived(animation.phase??'in');
  let earlierMotion=$derived(Boolean(editor.slide?.elements.some(e=>!e.hidden&&e.id!==selected?.id&&e.animation&&e.animation.effect!=='none'&&e.animation.order<animation.order)));
  let pageIndex=$derived(editor.deck?.slides.findIndex(s=>s.id===editor.slide?.id) ?? -1);
  let previous=$derived(editor.deck?.slides[pageIndex-1]), next=$derived(editor.deck?.slides[pageIndex+1]);
  let smartContext=$derived(editor.deck&&editor.slide?smartTransitionContext(editor.deck,editor.slide):undefined);
  let matches=$derived(active&&transition.effect==='smart'&&smartContext?.from&&smartContext.to?matchSmartLayers(smartContext.from,smartContext.to):{pairs:[],issues:[]});
  let sharedIds=$derived(transition.effect==='smart'?matches.pairs.map(p=>smartContext?.outgoing?p.from.id:p.to.id):[]);
  let previousPair=$derived(matches.pairs.find(p=>(smartContext?.outgoing?p.from.id:p.to.id)===selected?.id));
  let nextPair=$derived(active&&scope==='object'&&next?.transition?.effect==='smart'&&!nativeSlideTransition(next.transition)&&editor.slide?matchSmartLayers(editor.slide,next).pairs.find(p=>p.from.id===selected?.id):undefined);
  let relevantPair=$derived(transition.effect==='smart'?previousPair:next?.transition?.effect==='smart'?nextPair:undefined);
  let association=$derived(transition.effect==='smart'||next?.transition?.effect==='smart'||Boolean(selected?.motionKey));
  let unsupported=$derived(selected && (selected.type==='prototype'||selected.type==='line'||Boolean(selected.sourceRegion)));
  let mixed=$derived(propertyItems.length>1&&propertyItems.some(e=>JSON.stringify(e.animation??defaultAnimation)!==JSON.stringify(animation)));
  let mixedEffect=$derived(motionPropertyState(propertyItems,'effect').mixed);
  let mixedEasing=$derived(differs('easingBezier')||!animation.easingBezier&&differs('easing'));
  let suggestions=$derived(active&&scope==='sequence'&&editor.deck&&editor.slide?suggestEntrances(editor.deck,editor.slide,recipe,sharedIds):[]);
  let sequence=$derived(active&&scope==='sequence'&&editor.slide?objectMotionSequence(editor.slide):[]);
  let autoGroups=$derived.by(()=>{if(!active||scope!=='sequence'||!editor.slide)return [];const groups=entranceSequence(editor.slide,'auto').map(g=>({...g,cue:0}));const remainder=sequence.find(g=>g.cue===0)?.elements.filter(e=>e.animation?.trigger!=='auto')??[];return remainder.length?[...groups,{cue:0,order:-1,elements:remainder,canMoveEarlier:false,canMoveLater:false}]:groups;});
  let clickGroups=$derived(sequence.filter(g=>g.cue>0));
  $effect(()=>{const ids=editor.selection.map(e=>e.id).join('|');untrack(()=>{if(ids!==lastSelection){if(ids)scope='object';else if(scope==='object')scope='page';lastSelection=ids;}});});
  function page(patch:Partial<SlideTransition>){if(editor.slide&&!disabled)editor.commit([{op:'update_slide',slideId:editor.slide.id,patch:{transition:editFigmaTransition(transition,patch)}}],`motion-slide-${Object.keys(patch).join('-')}`);}
  function setNative(value:SlideTransition,property='mode'){if(editor.slide&&!disabled)editor.commit([{op:'update_slide',slideId:editor.slide.id,patch:{transition:value}}],`motion-native-${property}`);}
  function nativeCurve(curve:NativeSlideTransition['curve']){if(nativeTransition)setNative(editNativeTransition(transition,{curve}),'curve');}
  function chooseEffect(effect:SlideTransition['effect']){page({effect,...(!editor.slide?.transition?{duration:transitionPreset(effect).duration,easing:transitionPreset(effect).easing}:{})});}
  function node(patch:Partial<ElementAnimation>){if(editor.slide&&!disabled){const order=Math.min(3000,Math.max(-1,...editor.slide.elements.filter(e=>e.animation&&e.animation.effect!=='none').map(e=>e.animation!.order))+1);editor.commit(editable.map(e=>({op:'update_element',slideId:editor.slide!.id,elementId:e.id,patch:{animation:{...defaultAnimation,...(e.animation??{phase:'in' as const,trigger:'click' as const,order}),...patch}}})),`motion-${Object.keys(patch).join('-')}`);}}
  function removeMotion(){if(editor.slide&&!disabled)editor.commit(editable.map(e=>({op:'update_element',slideId:editor.slide!.id,elementId:e.id,patch:{animation:undefined}})));}
  function differs(key:keyof ElementAnimation){return motionPropertyState(propertyItems,key).mixed;}
  function nextState(){if(!editor.deck||!editor.slide||disabled)return;try{const revision=editor.deck.revision,{slide,operations}=createNextMotionState(editor.deck,editor.slide);editor.commit(operations,'','manual',revision);if(editor.deck.slides.some(s=>s.id===slide.id)){editor.chooseSlide(slide.id);editor.sourceMode=false;scope='page';editor.notify('Next state created. Adjust objects, then preview smart animate.');}}catch(error){editor.error=error instanceof Error?error.message:'Could not create the next state. Try again.';}}
  async function chooseObject(id:string){editor.sourceMode=false;editor.choose(id);scope='object';await tick();document.querySelector<HTMLSelectElement>('.motion-panel [aria-label="Animation style"]')?.focus({preventScroll:true});}
</script>
<div bind:this={root} class="inspector-content motion-panel" data-motion-scope={scope}>
  <div class="motion-scope"><SegmentedControl label="Motion scope" options={[{value:'page',label:'Slide',ariaLabel:'Slide transition'},{value:'object',label:'Object',ariaLabel:'Object animation'},{value:'sequence',label:'Order',ariaLabel:'Order of object animations'}]} value={scope} onchange={value=>scope=value as Scope}/></div>
  <div class="motion-panel-body" bind:this={body} tabindex="-1">{#if active}{#if disabled}<Notice tone="info" message="Exit the AI preview to edit motion.">{#snippet actions()}<Button variant="secondary" onclick={onexitpreview}>Exit preview</Button>{/snippet}</Notice>{/if}<fieldset class="motion-controls" {disabled}>
    {#if scope==='page'}
      <section class="panel-section motion-page-settings" aria-label="Slide transition settings">
        <div class="motion-context"><h3><PanelsTopLeft size={16} aria-hidden="true"/>Slide transition</h3><span>{slideLabel(editor.deck?.slides.findIndex(s=>s.id===editor.slide?.id)??0)}</span></div>
        {#if nativeTransition}<FigmaTransitionSettings value={transition} onchange={setNative}/>{:else}{#key editor.slide?.id}<TransitionPicker value={transition.effect} onchange={chooseEffect}/>{/key}{/if}
        <p class="hint motion-effect-description">{nativeTransition?'Plays from this slide to the next visible slide.':preset.description}</p>
        {#if transition.effect==='smart' && editor.deck && editor.slide}<SmartAnimatePreview deck={editor.deck} from={smartContext?.from} to={smartContext?.to??editor.slide} {active}/>{:else}<TransitionPreview {transition} {active}/>{/if}
        <div class="motion-timing"><NumberField label="Transition duration" preset="duration" prefix="Duration" unit="ms" min={nativeTransition?10:100} max={nativeTransition?60000:2000} step="any" keyboardStep={50} disabled={transition.effect==='none'||springDuration!==undefined} value={springDuration??(nativeTransition?nativeTransition.duration*1000:transition.duration)} onchange={duration=>page({duration})}/><label class="field-label">Easing{#if nativeTransition}<select class="ui-property-input" aria-label="Transition easing" disabled={transition.effect==='none'} value={nativeTransition.curve} onchange={e=>nativeCurve(e.currentTarget.value)}>{#each FIGMA_TRANSITION_CURVES as [value,label]}<option {value}>{label}</option>{/each}</select>{:else}<select class="ui-property-input" aria-label="Transition easing" disabled={transition.effect==='none'} value={transition.easing} onchange={e=>page({easing:e.currentTarget.value as SlideTransition['easing']})}><option value="smooth">Smooth</option><option value="snappy">Snappy</option><option value="linear">Linear</option><option value="cinematic">Cinematic</option></select>{/if}</label></div>
        <Button variant="quiet" size="sm" disabled={transition.effect==='none'} onclick={()=>page({duration:preset.duration,easing:preset.easing})} title={`Use preset duration (${preset.duration} ms) and easing`} aria-label="Reset timing to preset defaults">Reset timing</Button>
        {#if transition.effect==='smart'}
          {#if smartContext?.from&&smartContext.to}<details bind:open={disclosures.matches} use:uiDisclosure={next=>disclosures.matches=next} class="motion-disclosure motion-match-details"><summary><span>Object matches</span><small>{countLabel(matches.pairs.length, "object")}{matches.issues.length?` · ${countLabel(matches.issues.length, 'issue')} to review`:''}</small><ChevronDown class="motion-disclosure-chevron" size={14} aria-hidden="true"/></summary><div class="motion-disclosure-body"><p class="hint">Match IDs take priority; otherwise, objects match by a unique name within the same group. {nativeTransition?'The transition plays from this slide to the next visible slide.':'Returning reverses the animation.'}</p>{#each matches.issues as issue}<p class="motion-match-warning">{issue}</p>{/each}{#each matches.pairs.slice(0,matchLimit) as p}<button class:active={selected?.id===(smartContext?.outgoing?p.from.id:p.to.id)} onclick={()=>void chooseObject(smartContext?.outgoing?p.from.id:p.to.id)}><span>{smartContext?.outgoing?p.from.name:p.to.name}</span><small>{p.dissolve?'Movement and dissolve':p.changed.length?'Continuity':'Static'}</small></button>{/each}{#if matches.pairs.length>matchLimit}<Button variant="quiet" onclick={()=>matchLimit+=20}>Show more matches</Button>{/if}{#if !matches.pairs.length}<p class="hint">No matching objects yet. Duplicate the previous state or select an object to configure matching.</p>{/if}</div></details>{:else}<p class="hint">{nativeTransition?'Add a following slide to preview this transition.':'Duplicate this slide, then adjust objects on the copy.'}</p>{/if}
        {/if}
        <div class="motion-next-state"><Button variant="secondary" size="sm" class="full" disabled={!editor.deck||editor.deck.slides.length>=500} aria-label="Duplicate state as the next slide" title="Duplicate this slide as the next motion state" onclick={nextState}><CopyPlus size={16}/>Duplicate state</Button></div>
        <details bind:open={disclosures.more} use:uiDisclosure={next=>disclosures.more=next} class="motion-disclosure"><summary><span>More options</span><ChevronDown class="motion-disclosure-chevron" size={14} aria-hidden="true"/></summary><div class="motion-disclosure-body">{#if nativeTransition}<Button variant="quiet" size="sm" class="full" onclick={()=>page({native:undefined})}>Browse Deck transitions</Button>{:else}<Button variant="quiet" size="sm" class="full" onclick={()=>setNative(editNativeTransition(transition,{}))}>Use Figma Slides transitions</Button>{/if}<a href="/examples/modern-transitions-showcase.html" target="_blank" rel="noopener noreferrer">View all {TRANSITION_PRESETS.length} transition demos <ExternalLink size={16} /></a><a href="/examples/smart-motion-studies.html" target="_blank" rel="noopener noreferrer">View smart animate examples <ExternalLink size={16} /></a><Button variant="quiet" size="sm" class="full" disabled={!editor.deck||editor.deck.slides.length<2} onclick={()=>editor.commit(editor.deck!.slides.map(s=>({op:'update_slide',slideId:s.id,patch:{transition}})))} title={`Apply this transition to all ${editor.deck?.slides.length ?? 0} slides`}>Apply to all slides</Button></div></details>
      </section>
    {:else if scope==='object'}
      <section class="panel-section" aria-label="Object animation settings">
        <div class="motion-context"><h3><Clapperboard size={16} aria-hidden="true"/>Object animation</h3><span>{editor.selection.length>1?`Selected ${countLabel(editor.selection.length, "object")}`:selected?.name || 'No object selected'}</span></div>
        {#if selected}
          {#if !editable.length}<p class="hint">{selection.some(e=>e.type==='prototype')?'Interactive prototypes keep their own playback.':'Selected objects are locked. Unlock them to edit motion.'}</p>{:else if mixed}<p class="mixed-note">Mixed settings. Locked objects and interactive prototypes stay unchanged.</p>{/if}
          <fieldset disabled={!editable.length}>
            <label class="field-label">Style<select class="ui-property-input" aria-label="Animation style" value={mixedEffect?'mixed':animation.effect} onchange={e=>node({effect:e.currentTarget.value as ElementAnimation['effect']})}>{#if mixedEffect}<option value="mixed" disabled>Mixed settings</option>{/if}{#each ANIMATIONS as [id,label]}<option value={id}>{label.replace(' in','')}</option>{/each}</select></label>
            {#if mixedEffect||animation.effect!=='none'}
              <div class="field-label"><span>Animate</span><PropertyChoice label="Animate object" value={differs('phase')?'':phase} options={[{value:'in',label:'In'},{value:'out',label:'Out'}]} disabled={!editable.length} onchange={value=>node({phase:value as 'in'|'out'})}/></div>
              <label class="field-label">Timing<select class="ui-property-input" aria-label="Animation timing" value={differs('trigger')?'mixed':animation.trigger} onchange={e=>node({trigger:e.currentTarget.value as ElementAnimation['trigger']})}>{#if differs('trigger')}<option value="mixed" disabled>Mixed settings</option>{/if}{#if propertyItems.some(e=>e.animation?.trigger==='auto')}<option value="auto">On slide entry</option>{/if}<option value="click">On click</option><option value="with-previous" disabled={!earlierMotion}>With previous</option><option value="after-previous" disabled={!earlierMotion}>After previous</option></select></label>
              {#if !differs('trigger')&&animation.trigger==='auto'}<label class="ui-property-check"><input type="checkbox" indeterminate={differs('withTransition')} checked={Boolean(animation.withTransition)} disabled={!editable.length} onchange={e=>node({withTransition:e.currentTarget.checked})}/><span>Run with slide transition</span></label>{/if}
              <div class="motion-timing"><NumberField label="Animation duration" preset="duration" prefix="Duration" unit="ms" min={100} max={2000} step="any" keyboardStep={50} value={animation.duration} mixed={differs('duration')} onchange={duration=>node({duration})}/><NumberField label="Animation delay" preset="delay" prefix="Delay" unit="ms" min={0} max={5000} step="any" keyboardStep={50} value={animation.delay} mixed={differs('delay')} onchange={delay=>node({delay})}/></div>
              <details bind:open={disclosures.order} use:uiDisclosure={next=>disclosures.order=next} class="motion-disclosure"><summary><span>Order and easing</span><ChevronDown class="motion-disclosure-chevron" size={14} aria-hidden="true"/></summary><div class="motion-disclosure-body"><NumberField label="Play order" preset="count" prefix="Order" min={1} max={3001} step={1} value={animation.order+1} mixed={differs('order')} onchange={order=>node({order:order-1})}/><p class="hint">Equal click steps play together. Relative timing follows the previous animation.</p><label class="field-label">Animation easing<select class="ui-property-input" aria-label="Animation easing" value={mixedEasing?'mixed':animation.easingBezier?'custom':animation.easing} onchange={e=>node({easing:e.currentTarget.value as ElementAnimation['easing'],easingBezier:undefined})}>{#if mixedEasing}<option value="mixed" disabled>Mixed settings</option>{/if}{#if animation.easingBezier}<option value="custom" disabled>Custom curve</option>{/if}<option value="smooth">Smooth</option><option value="snappy">Snappy</option><option value="linear">Linear</option></select></label>{#if animation.easingBezier&&!mixedEasing}<p class="hint">cubic-bezier({animation.easingBezier.join(', ')})</p>{/if}</div></details>
              <Button variant="quiet" size="sm" onclick={removeMotion}>Remove animation</Button>
            {/if}
          </fieldset>
          {#if animation.effect!=='none'&&sharedIds.includes(selected.id)}<p class="hint">This object continues across slides. Preview this slide or replay to play its object animation.</p>{/if}
          {#if association}<details bind:open={disclosures.matching} use:uiDisclosure={next=>disclosures.matching=next} class="motion-disclosure"><summary><span>Object matching</span><small>{unsupported?'Independent':selected.motionMatch==='off'?'Excluded':relevantPair?'Matched':'Automatic'}</small><ChevronDown class="motion-disclosure-chevron" size={14} aria-hidden="true"/></summary><div class="motion-disclosure-body">
            {#if unsupported}<p class="hint">{selected.type==='prototype'?'Prototypes keep their own interaction and do not animate across slides.':'This object uses dissolve and does not animate across slides.'}</p>{:else}<label class="field-label">Match mode<select class="ui-property-input" aria-label="Match mode across slides" disabled={selected.locked||editor.selection.length!==1} value={selected.motionMatch ?? 'auto'} onchange={e=>editor.patch({motionMatch:e.currentTarget.value as 'auto'|'off'})}><option value="auto">Automatic</option><option value="off">Exclude from smart animate</option></select></label><label class="field-label">Match ID<input class="ui-property-input" aria-label="Match ID across slides" maxlength="80" disabled={selected.locked||editor.selection.length!==1} value={selected.motionKey ?? ''} placeholder="For example: hero-image" onchange={e=>editor.patch({motionKey:e.currentTarget.value.trim()})}/></label><p class="hint">{editor.selection.length!==1?'Select one object to edit matching settings.':relevantPair?`Matched on the ${transition.effect==='smart'&&!smartContext?.outgoing?'previous':'next'} slide to “${transition.effect==='smart'&&!smartContext?.outgoing?relevantPair.from.name:relevantPair.to.name}”.`:'Use the same ID for the same object in adjacent states. Each ID must appear only once per slide.'}</p>{/if}
          </div></details>{/if}
        {:else}<EmptyState density="inline" icon={MousePointer2} title="Select an object" description="" />{/if}
      </section>
    {:else}
      <section class="panel-section" aria-label="Play order settings">
        <div class="motion-context"><h3><ListOrdered size={16} aria-hidden="true"/>Play order</h3><span>{countLabel(autoGroups.length, 'automatic group')} · {countLabel(clickGroups.length, 'click step')}</span></div>
        <label class="field-label">Slide sequence<select class="ui-property-input" aria-label="Motion sequence style" bind:value={recipe}>{#each MOTION_RECIPES as [id,label]}<option value={id}>{label}</option>{/each}</select></label>
        <Button variant="secondary" size="sm" class="full" disabled={!suggestions.length} title={`Apply entrance effects to ${countLabel(suggestions.length, 'object')} without motion`} aria-label="Apply sequence to objects without motion" onclick={()=>editor.commit(suggestions)}><Sparkles size={16}/>Apply sequence</Button>
        <p class="hint">Applies only to objects without motion.</p>
      </section>
      {#if editor.slide&&(autoGroups.length||clickGroups.length)}<section class="panel-section motion-list" aria-label="Object animation sequence">{#each ['auto','click'] as trigger}{@const groups=trigger==='auto'?autoGroups:clickGroups}{#if groups.length}{@const page=Math.min(sequencePages[trigger as 'auto'|'click'],Math.max(0,Math.ceil(groups.length/20)-1))}<div class="motion-sequence"><h4>{trigger==='auto'?'On slide entry':'On-click groups'}</h4>{#if groups.length>20}<nav class="motion-pagination" aria-label={`${trigger==='auto'?'Automatic':'On-click'} animation groups`}><Button variant="quiet" aria-label={`Previous ${trigger} groups`} disabled={page===0} onclick={()=>sequencePages[trigger as 'auto'|'click']=page-1}><ChevronLeft size={16}/></Button><span>{page*20+1}–{Math.min(groups.length,(page+1)*20)} of {groups.length}</span><Button variant="quiet" aria-label={`Next ${trigger} groups`} disabled={(page+1)*20>=groups.length} onclick={()=>sequencePages[trigger as 'auto'|'click']=page+1}><ChevronRight size={16}/></Button></nav>{/if}{#each groups.slice(page*20,(page+1)*20) as group,offset}{@const i=page*20+offset}{@const groupKey=`${trigger}:${group.order}`}<div class="motion-cue-group"><div class="motion-cue-head"><span>{group.order<0?'Relative animations':`${trigger==='auto'?'Group':'Step'} ${i+1}`}</span><div><IconButton label={`Move earlier ${trigger==='auto'?'Entrance group':'Click steps'} ${i+1}`} size="sm" disabled={!group.canMoveEarlier} onclick={()=>editor.commit(trigger==='auto'?moveEntranceGroup(editor.slide!,'auto',group.order,-1):moveObjectMotionGroup(editor.slide!,group.cue,-1))}><ArrowUp size={16}/></IconButton><IconButton label={`Move later ${trigger==='auto'?'Entrance group':'Click steps'} ${i+1}`} size="sm" disabled={!group.canMoveLater} onclick={()=>editor.commit(trigger==='auto'?moveEntranceGroup(editor.slide!,'auto',group.order,1):moveObjectMotionGroup(editor.slide!,group.cue,1))}><ArrowDown size={16}/></IconButton></div></div>{#each expandedGroups[groupKey]?group.elements:group.elements.slice(0,10) as e}<button class:active={editor.selected.includes(e.id)} onclick={()=>void chooseObject(e.id)}><strong>{e.name}</strong><small>{e.animation?.phase==='out'?'Out':'In'} · {ANIMATIONS.find(a=>a[0]===e.animation?.effect)?.[1].replace(' in','')} · {e.animation!.duration}ms{e.animation?.trigger==='after-previous'?' · After previous':e.animation?.trigger==='with-previous'?' · With previous':''}{e.animation!.delay?` · Delay ${e.animation!.delay}ms`:''}</small></button>{/each}{#if group.elements.length>10}<Button variant="quiet" size="sm" aria-expanded={Boolean(expandedGroups[groupKey])} onclick={()=>expandedGroups[groupKey]=!expandedGroups[groupKey]}>{expandedGroups[groupKey]?'Show fewer objects':`Show all ${group.elements.length} objects`}</Button>{/if}</div>{/each}</div>{/if}{/each}</section>{:else}<div class="panel-section"><EmptyState density="inline" icon={Clapperboard} title="No object animations yet" description="Apply a slide sequence above, or select an object to set its motion." /></div>{/if}
    {/if}
  </fieldset>{/if}</div>
  <div class="motion-panel-footer"><Button variant="secondary" class="full" disabled={!editor.slide||disabled} onclick={()=>onpreview(scope==='page'&&transition.effect==='smart'?smartContext?.previewFromId:undefined)}><Play size={16}/>{scope==='page'&&transition.effect==='smart'&&smartContext?.from&&smartContext.to?'Preview smart animate':'Preview current slide'}</Button>{#if editor.sourceMode}<p class="hint">Preview uses the editable version. Source references stay static.</p>{/if}</div>
</div>
<style>
.motion-controls{margin:0;padding:0;border:0;min-width:0}.motion-controls:disabled{opacity:1}.motion-panel :global(.panel-section){padding:12px;gap:8px}
.motion-context h3{display:flex;align-items:center;gap:8px;min-width:0}.motion-context h3 :global(svg){flex:none;color:var(--text-secondary)}

.motion-timing{display:flex;flex-direction:column;gap:8px;min-width:0}.motion-controls .field-label{margin:0;gap:4px}
.motion-controls .field-label select{font-size:var(--ui-label);line-height:var(--ui-line-control)}
</style>
