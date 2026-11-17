<script lang="ts">
  import {BRAND_NAME} from '../brand-name.js';
  import Notice from './ui/Notice.svelte';
  import {slideLabel} from '../core/slide-label';
  import { editor } from '../core/editor.svelte';
  import {prepareThemeArtwork} from '../core/theme-artwork';
  import {documentStylePreview} from '../core/document-style-preview';
  import NumberField from './ui/NumberField.svelte';
  import ColorField from './ui/ColorField.svelte';
  import PropertyChoice from './ui/PropertyChoice.svelte';
  import type {Operation} from '../core/operations';
  import { cloneDocumentData, sameDocumentData } from '../core/document-data';
  import { applyDeckDesignSystem, deckDesignSystem, DESIGN_PRESETS, designSystemCoverage, COLOR_LABELS, TEXT_LABELS, contrastRatio } from '../core/deck-design-system';
  import { COLOR_ROLES, TEXT_ROLES, DesignSystemSchema, type DesignSystem } from '../core/design-system-schema';
  import { download } from '../core/download';
  import { loadLibraryFont } from '../core/font-loading';
  import { localFontChoices, fontDisplayName, fontWeights, nearestWeight, WEIGHT_LABELS } from '../core/fonts';
  import { DOCUMENT_STYLE_PRESETS, readDeckStyleLibrary, saveDeckStyle, removeDeckStyle, isPresetSelected, mergeStylePreset, customizeStyleName, improveStyleContrast, type PresetScope, type SavedDeckStyle } from '../core/deck-style-library';
  import { onMount,onDestroy,setContext,tick } from 'svelte';
  import {restoreFocus} from '../ui-focus';
  import { uiDisclosure } from '../ui-motion';
  import Dialog from './Dialog.svelte';
  import SlideCanvas from './SlideCanvas.svelte';
  import { Button, DialogFooter } from './ui';
  import { ArrowLeft, ArrowRight, Check, RotateCcw, Trash2, Save } from '@lucide/svelte';
  let {onclose,initialRole,returnFocus}:{onclose:()=>void;initialRole?:typeof TEXT_ROLES[number];returnFocus?:()=>HTMLElement|undefined}=$props();
  const base=cloneDocumentData(editor.operationDocument());
  const validationErrorId=$props.id();
  let draft=$state<DesignSystem>(cloneDocumentData(deckDesignSystem(base)));
  let adopt=$state(!base.designSystem||designSystemCoverage(base).objects===0);
  let previewIndex=$state(Math.max(0,base.slides.findIndex(s=>s.id===editor.activeId)));
  let presetScope=$state<PresetScope>('all');
  let editingRole=$state<typeof TEXT_ROLES[number]>('title');
  let advancedOpen=$state(false);
  let editVersion=$state(0),fieldErrors=$state<Record<string,boolean>>({}),compact=$state(false),mobilePreview=$state(false);
  let editOrigin:HTMLElement|null=null;
  setContext('property-edit-scope',()=>`${base.id}:${editVersion}`);
  function fieldValidity(key:string,valid:boolean){if(Boolean(fieldErrors[key])!==!valid)fieldErrors={...fieldErrors,[key]:!valid};}
  const invalidDraft=$derived(Object.values(fieldErrors).some(Boolean));
  function resetFields(){editVersion++;fieldErrors={};}
  let previewPane:HTMLDivElement;
  async function showPreview(){if(compact){mobilePreview=!mobilePreview;await tick();if(!mobilePreview){restoreFocus(editOrigin);return;}}previewPane.scrollIntoView({block:'start'});previewPane.focus({preventScroll:true});}
  function reset(){draft=cloneDocumentData(deckDesignSystem(base));adopt=!base.designSystem||designSystemCoverage(base).objects===0;presetScope='all';savedId='';libraryNotice='';libraryError='';fileError='';resetFields();}
  const visiblePresets=$derived(DOCUMENT_STYLE_PRESETS.filter((system,index,all)=>all.findIndex(other=>isPresetSelected(other,system,presetScope))===index));
  let savedStyles=$state<SavedDeckStyle[]>([]),savedId=$state(''),libraryNotice=$state(''),libraryError=$state('');
  let libraryAction=$state<'save'|'remove'>('save');
  onMount(()=>{editingRole=initialRole??'title';advancedOpen=Boolean(initialRole);savedStyles=readDeckStyleLibrary(localStorage);for(const family of new Set(DOCUMENT_STYLE_PRESETS.flatMap(s=>TEXT_ROLES.map(role=>s.typography[role].fontFamily))))void loadLibraryFont(family,base.fonts).catch(()=>{});});
  onMount(()=>{const media=matchMedia('(max-width:760px)'),resize=()=>compact=media.matches;resize();media.addEventListener('change',resize);return()=>media.removeEventListener('change',resize);});
  function saveStyle(){libraryAction='save';try{savedStyles=saveDeckStyle(localStorage,savedStyles,draft);savedId=savedStyles.at(-1)!.id;libraryNotice=`${draft.name} saved in this browser.`;libraryError='';}catch{libraryError=savedStyles.length>=24?'Your library has 24 styles. Remove a saved style or download this one.':'Could not save the style. Download a style file to keep a copy.';}}
  function removeStyle(){libraryAction='remove';try{savedStyles=removeDeckStyle(localStorage,savedStyles,savedId);savedId='';libraryNotice='Saved style removed. Your document is unchanged.';libraryError='';}catch{libraryError='Could not remove the saved style. Try again.';}}
  const fonts=[...localFontChoices(base),...(base.onlineFonts??[]).map(f=>({family:f.family}))];
  const unavailableFamilies=$derived([...new Set(TEXT_ROLES.map(role=>draft.typography[role].fontFamily))].filter(family=>!fonts.some(font=>font.family.toLowerCase()===family.toLowerCase())));
  const headingMixed=$derived(draft.typography.title.fontFamily!==draft.typography.heading.fontFamily);
  const bodyMixed=$derived(draft.typography.body.fontFamily!==draft.typography.caption.fontFamily);
  let styleFile:HTMLInputElement;
  let fileError=$state('');
  async function importStyle(event:Event){
    const input=event.currentTarget as HTMLInputElement,file=input.files?.[0];if(!file)return;
    try{if(file.size>50_000)throw new Error();const value=JSON.parse(await file.text());if(value.schema!=='deck-studio/style/1')throw new Error();draft=DesignSystemSchema.parse(value.system);fileError='';savedId='';libraryNotice='';resetFields();}
    catch{fileError=`Choose a valid ${BRAND_NAME} style file.`;}finally{input.value='';}
  }
  function exportStyle(){const system=DesignSystemSchema.parse(draft);download(JSON.stringify({schema:'deck-studio/style/1',system},null,2),`${system.name.replace(/[^a-zA-Z0-9]+/g,'-').toLowerCase()||'custom'}.deck-style.json`);}
  const validation=$derived(DesignSystemSchema.safeParse(draft));
  function invalidField(...path:string[]){return !validation.success&&validation.error.issues.some(issue=>path.every((key,i)=>issue.path[i]===key));}
  const roleOptions=$derived(TEXT_ROLES.map(role=>({value:role,label:invalidField('typography',role)?`${TEXT_LABELS[role]} !`:TEXT_LABELS[role]})));
  const inputError=$derived(validation.success?'':validation.error.issues.map(issue=>{
    const path=issue.path;return path[0]==='colors'?`${COLOR_LABELS[path[1] as keyof typeof COLOR_LABELS]}: use a six-digit hex color.`:path[0]==='typography'?`${TEXT_LABELS[path[1] as keyof typeof TEXT_LABELS]} ${({fontFamily:'font',fontSize:'size',fontWeight:'weight',lineHeight:'line height',letterSpacing:'tracking'} as Record<string,string>)[String(path[2])]??'value'}: ${issue.code==='invalid_type'?'Enter a valid value.':issue.message}`:path[0]==='name'?'Enter a style name.':`Pattern: ${issue.message}`;
  }).slice(0,2).join(' '));
  const linkedBase=$derived(adopt?applyDeckDesignSystem(base,deckDesignSystem(base),true):base);
  const preview=$derived.by(()=>{if(!validation.success)return {deck:base,error:inputError};try{return {deck:documentStylePreview(linkedBase,validation.data,previewIndex),error:''};}catch{return {deck:base,error:'These styles could not be previewed. Reduce the values and try again.'};}});
  const coverage=$derived(designSystemCoverage(linkedBase));
  const stale=$derived(editor.deck?.id!==base.id||editor.deck?.revision!==base.revision);
  // Text measurement may settle after opening; only authored rules or new links enable Apply.
  const links=(deck:typeof base)=>deck.slides.map(slide=>({background:slide.backgroundStyle,objects:slide.elements.filter(e=>!e.designPattern).map(e=>e.design)}));
  const changed=$derived(!sameDocumentData(base.designSystem,draft)||(adopt&&!sameDocumentData(links(base),links(linkedBase))));
  const contrasts=$derived([{label:'Text',value:contrastRatio(draft.colors.ink,draft.colors.background)},{label:'Secondary text',value:contrastRatio(draft.colors.muted,draft.colors.background)},{label:'Text on dark',value:contrastRatio(draft.colors.onDark,draft.colors.dark)}].filter(c=>c.value<4.5));
  function preset(system:DesignSystem,id=''){draft=mergeStylePreset(draft,system,presetScope);savedId=id;libraryNotice='';fileError='';resetFields();}
  function custom(){draft.name=customizeStyleName(draft.name);savedId='';}
  function setFont(roles:(typeof TEXT_ROLES[number])[],family:string){if(family==='__mixed__')return;for(const role of roles){draft.typography[role].fontFamily=family;draft.typography[role].fontWeight=nearestWeight(fontWeights(family,base.fonts,base.onlineFonts),draft.typography[role].fontWeight);}custom();}
  const scopeSummary=$derived(`${coverage.objects} linked ${coverage.objects===1?'object':'objects'} · ${coverage.slides} of ${base.slides.length} ${base.slides.length===1?'background':'backgrounds'}`);
  let preparingArtwork=$state(false),artworkError=$state(''),active=true;
  onDestroy(()=>active=false);
  async function apply(){
    if(stale||preview.error||invalidDraft||!changed||preparingArtwork)return;
    const system=cloneDocumentData(draft),adopting=adopt;
    preparingArtwork=true;artworkError='';
    try{
      const snapshot=applyDeckDesignSystem(base,system,adopting);
      const prepared=await prepareThemeArtwork(snapshot);
      if(!active)return;
      if(editor.deck?.id!==base.id||editor.deck?.revision!==base.revision||!sameDocumentData(system,draft)||adopting!==adopt){artworkError='The document or style changed. Reopen the preview before applying.';return;}
      const ops:Operation[]=[{op:'set_design_system',system,adopt:adopting}];
      for(const slide of prepared.slides)for(const e of slide.elements){const previous=snapshot.slides.find(s=>s.id===slide.id)!.elements.find(p=>p.id===e.id)!;if(e.src!==previous.src||e.resource?.color!==previous.resource?.color)ops.push({op:'update_element',slideId:slide.id,elementId:e.id,patch:{src:e.src,resource:e.resource}});}
      editor.commit(ops,'','manual',base.revision);
      if(editor.deck?.revision===base.revision+1){editor.notify('Styles applied');onclose();}
      else artworkError=editor.error||'The styles could not be applied. Try again.';
    }catch{if(active)artworkError='The styles could not be prepared. Check the values or try again.';}
    finally{if(active)preparingArtwork=false;}
  }
</script>
<Dialog title="Document styles" subtitle="Fonts, colors, and backgrounds for all slides" workspace {onclose} {returnFocus}>
  <div class="deck-style-workspace" class:mobile-preview={compact&&mobilePreview}>
    <div class="style-controls" inert={compact&&mobilePreview} onfocusin={event=>{editOrigin=event.target as HTMLElement;}}>
      <section class="style-section">
        <h3>Start with a style</h3>
        <PropertyChoice label="Preset changes" options={[{value:'all',label:'Style'},{value:'colors',label:'Colors'},{value:'fonts',label:'Fonts'}]} value={presetScope} onchange={value=>{presetScope=value as PresetScope;savedId='';}}/>
        {#if presetScope!=='all'}<p class="hint">{presetScope==='fonts'?'Sizes, spacing, colors, and patterns':'Fonts and patterns'} stay as they are.</p>{/if}
        {#if savedStyles.length}<div class="saved-style-row"><label class="field-label">Saved styles<select aria-label="Saved style" value={savedId} onchange={ev=>{savedId=ev.currentTarget.value;const item=savedStyles.find(s=>s.id===savedId);if(item)preset(item.system,item.id);}}><option value="">Choose a saved style</option>{#each savedStyles as item}<option value={item.id}>{item.system.name}</option>{/each}</select></label><button class="icon-btn" data-tone="danger" disabled={!savedId} aria-label="Remove saved style" title="Remove saved style from this browser" onclick={removeStyle}><Trash2 size={16}/></button></div>{/if}
        {#if libraryAction==='remove'}{#if libraryNotice}<p class="hint" role="status">{libraryNotice}</p>{/if}{#if libraryError}<Notice tone="error" title="Style library could not update" message={libraryError}/>{/if}{/if}
        <div class="style-presets">
          {#each visiblePresets as system}
            <button class="style-preset" aria-pressed={isPresetSelected(draft,system,presetScope)} onclick={()=>preset(system)}>
              <span class="sr-only">Use </span><span class="preset-specimen" aria-hidden="true" style:background={presetScope==='fonts'?draft.colors.background:system.colors.background} style:color={presetScope==='fonts'?draft.colors.ink:system.colors.ink}><span style:font-family={system.typography.title.fontFamily}>Aa</span><i style:background={presetScope==='fonts'?draft.colors.accent:system.colors.accent}></i></span>
              <span>{system.name}</span>{#if isPresetSelected(draft,system,presetScope)}<Check size={14} aria-hidden="true" />{/if}
            </button>
          {/each}
        </div>

      </section>
      <section class="style-section">
        <h3>Fonts</h3>
        <div class="paired-fonts">
        <label class="field-label">Headings<select aria-label="Titles and headings font" value={headingMixed?'__mixed__':draft.typography.title.fontFamily} onchange={ev=>setFont(['title','heading'],ev.currentTarget.value)}>{#if headingMixed}<option value="__mixed__" disabled>Mixed fonts</option>{/if}{#each [...new Set([draft.typography.title.fontFamily,draft.typography.heading.fontFamily,...fonts.map(f=>f.family)])] as family}<option value={family}>{fontDisplayName({family})}</option>{/each}</select></label>
        <label class="field-label">Body<select aria-label="Body and captions font" value={bodyMixed?'__mixed__':draft.typography.body.fontFamily} onchange={ev=>setFont(['body','caption'],ev.currentTarget.value)}>{#if bodyMixed}<option value="__mixed__" disabled>Mixed fonts</option>{/if}{#each [...new Set([draft.typography.body.fontFamily,draft.typography.caption.fontFamily,...fonts.map(f=>f.family)])] as family}<option value={family}>{fontDisplayName({family})}</option>{/each}</select></label>
        </div>
        {#if unavailableFamilies.length}<p class="hint" role="status">{unavailableFamilies.join(', ')}: not in this document or font library. Add custom fonts in Document fonts for consistent output.</p>{/if}
      </section>
      <section class="style-section">
        <h3>Colors</h3>
        <div class="basic-colors">{#each ['background','ink','accent'] as role}{@const key=role as 'background'|'ink'|'accent'}<div class="style-color-row"><span>{COLOR_LABELS[key]}</span><ColorField label={`${COLOR_LABELS[key]} theme color`} value={draft.colors[key]} opaque allowClear={false} onvaliditychange={valid=>fieldValidity(`${COLOR_LABELS[key]} color`,valid)} onchange={value=>{draft.colors[key]=value;custom();}}/></div>{/each}</div>
        {#if validation.success&&contrasts.length}<div class="contrast-note" role="status"><strong>Check text contrast</strong><p>{contrasts.map(c=>`${c.label}: ${(Math.floor(c.value*100)/100).toFixed(2)}:1`).join(' · ')}. Aim for 4.5:1 for small text.</p><Button variant="secondary" onclick={()=>draft=improveStyleContrast(draft)}>Improve contrast</Button></div>{/if}
      </section>
      <section class="style-section">
        <h3>Background pattern</h3>
        <PropertyChoice label="Document background pattern" options={[{value:'none',label:'Plain'},{value:'dots',label:'Dots'},{value:'grid',label:'Grid'}]} value={draft.pattern.kind} onchange={value=>{draft.pattern.kind=value as DesignSystem['pattern']['kind'];custom();}} />
        {#if draft.pattern.kind!=='none'}<label class="field-label pattern-strength"><span>Strength <output>{Math.round(draft.pattern.opacity*100)}%</output></span><input type="range" aria-label="Pattern strength" min="0" max="0.3" step="0.01" bind:value={draft.pattern.opacity} oninput={custom}/></label>{/if}
      </section>
      <details class="style-section advanced" bind:open={advancedOpen} use:uiDisclosure>
        <summary>Customize styles</summary>
        <div class="advanced-content">
          <h3>Text styles</h3><p class="hint">Sizes scale with the slide.</p>
          <PropertyChoice label="Text style role" options={roleOptions} value={editingRole} onchange={value=>{fieldErrors=Object.fromEntries(Object.entries(fieldErrors).filter(([key])=>!key.startsWith(TEXT_LABELS[editingRole]+' ')));editingRole=value as typeof editingRole;}}/>
          {#each [editingRole] as role}<fieldset class="type-style"><legend>{TEXT_LABELS[role]}</legend>
            <label class="field-label">Font<select aria-label={`${TEXT_LABELS[role]} style font`} data-dialog-autofocus={initialRole?true:undefined} value={draft.typography[role].fontFamily} onchange={ev=>setFont([role],ev.currentTarget.value)}>{#each [...new Set([draft.typography[role].fontFamily,...fonts.map(f=>f.family)])] as family}<option value={family}>{fontDisplayName({family})}</option>{/each}</select></label>
            <div class="type-grid">
              <NumberField preset="font" label={`${TEXT_LABELS[role]} style size`} prefix="Size" value={draft.typography[role].fontSize} min={4} max={200} step="any" unit="px" onvaliditychange={valid=>fieldValidity(`${TEXT_LABELS[role]} size`,valid)} onchange={value=>{draft.typography[role].fontSize=value;custom();}}/>
              <label class="field-label"><span class="sr-only">Weight</span><select title="Font weight" aria-label={`${TEXT_LABELS[role]} style weight`} bind:value={draft.typography[role].fontWeight} onchange={custom}>{#each [...new Set([draft.typography[role].fontWeight,...fontWeights(draft.typography[role].fontFamily,base.fonts,base.onlineFonts)])].sort((a,b)=>a-b) as weight}<option value={weight}>{WEIGHT_LABELS[weight]??weight}</option>{/each}</select></label>
              <NumberField preset="lineHeight" label={`${TEXT_LABELS[role]} style line height`} prefix="Line" value={draft.typography[role].lineHeight} min={.5} max={4} step="any" keyboardStep={.05} unit="×" onvaliditychange={valid=>fieldValidity(`${TEXT_LABELS[role]} line height`,valid)} onchange={value=>{draft.typography[role].lineHeight=value;custom();}}/>
              <NumberField preset="tracking" label={`${TEXT_LABELS[role]} style tracking`} prefix="Letter" value={draft.typography[role].letterSpacing} min={-30} max={50} step="any" unit="px" onvaliditychange={valid=>fieldValidity(`${TEXT_LABELS[role]} tracking`,valid)} onchange={value=>{draft.typography[role].letterSpacing=value;custom();}}/>
            </div>
          </fieldset>{/each}
          <details class="color-details" use:uiDisclosure><summary>More color roles</summary><div class="color-role-fields">
          {#each COLOR_ROLES.filter(role=>!['background','ink','accent'].includes(role)) as role}<div class="style-color-row"><span>{COLOR_LABELS[role]}</span><ColorField label={`${COLOR_LABELS[role]} custom color`} value={draft.colors[role]} opaque allowClear={false} onvaliditychange={valid=>fieldValidity(`${COLOR_LABELS[role]} color`,valid)} onchange={value=>{draft.colors[role]=value;custom();}}/></div>{/each}
          </div></details>
          {#if draft.pattern.kind!=='none'}<NumberField label="Pattern spacing" preset="spacing" prefix="Spacing" unit="px" value={draft.pattern.spacing} min={12} max={160} step="any" onvaliditychange={valid=>fieldValidity('Pattern spacing',valid)} onchange={value=>{draft.pattern.spacing=value;custom();}}/>{/if}
        <label class="scope-toggle"><input type="checkbox" bind:checked={adopt}/><span>Match existing styles</span></label>
        <p class="hint">Custom styles and imported content stay unchanged.</p>
          <div class="save-style-group"><h3>Save and reuse</h3>
          <label class="field-label">Style name<input aria-label="Style name" aria-invalid={invalidField('name')} aria-describedby={invalidField('name')?validationErrorId:undefined} maxlength="80" bind:value={draft.name} oninput={()=>savedId=''}/></label>
          <Button variant="secondary" disabled={Boolean(preview.error)||invalidDraft} onclick={saveStyle}><Save size={14}/>Save style</Button><p class="hint">Saved in this browser.</p>
          <div class="style-file-actions"><Button variant="quiet" disabled={Boolean(preview.error)||invalidDraft} onclick={exportStyle}>Download style</Button><Button variant="quiet" onclick={()=>styleFile.click()}>Import style</Button></div><input class="style-file-input" type="file" accept=".json" aria-label="Import document style file" bind:this={styleFile} onchange={importStyle}/>
          {#if libraryAction==='save'}{#if libraryNotice}<p class="hint" role="status">{libraryNotice}</p>{/if}{#if libraryError}<Notice tone="error" title="Style library could not update" message={libraryError}/>{/if}{/if}
          {#if fileError}<Notice tone="error" title="Style file could not be read" message={fileError}/>{/if}
          <p class="hint">Style files keep font names. Add custom fonts in Document fonts.</p>
          </div>
        </div>
      </details>
      <section class="style-section scope-section">
        <p class="scope-result" role="status">{scopeSummary}{#if coverage.overrides} · {coverage.overrides} with custom formatting{/if}</p>
        {#if !coverage.objects&&!coverage.slides}<p class="hint">Applies to new objects and slides.</p>{/if}
        {#if preview.error||stale}<div id={validationErrorId}><Notice tone={stale ? 'warning' : 'error'} title={stale ? 'Document changed' : 'Check document styles'} message={stale?'Close and reopen Document styles to use the current version.':preview.error}/></div>{/if}
      </section>
    </div>
    <div class="style-preview" inert={compact&&!mobilePreview} role="region" aria-label="Style preview" tabindex="-1" bind:this={previewPane}>
      <div class="preview-heading"><div><strong>{draft.name || 'Custom'}</strong><span>Preview · Not applied</span></div><Button variant="quiet" aria-label="Reset document style changes" onclick={reset}><RotateCcw size={14}/>Reset</Button></div>
      <div class="style-preview-canvas"><SlideCanvas deck={preview.deck} slide={preview.deck.slides[previewIndex]}/></div>
      <div class="preview-navigation"><button class="icon-btn" aria-label="Previous style preview slide" disabled={previewIndex===0} onclick={()=>previewIndex--}><ArrowLeft size={16}/></button><span>{previewIndex+1} / {base.slides.length}</span><button class="icon-btn" aria-label="Next style preview slide" disabled={previewIndex===base.slides.length-1} onclick={()=>previewIndex++}><ArrowRight size={16}/></button></div>
      <div class="preview-thumbnails">{#each preview.deck.slides.slice(Math.max(0,previewIndex-1),Math.max(0,previewIndex-1)+3) as slide}<button aria-pressed={slide.id===preview.deck.slides[previewIndex].id} onclick={()=>previewIndex=preview.deck.slides.indexOf(slide)}><span class="sr-only">Preview styles on </span><div aria-hidden="true"><SlideCanvas deck={preview.deck} {slide}/></div><span>{slideLabel(preview.deck.slides.findIndex(s=>s.id===slide.id))}</span></button>{/each}</div>
      <p class="hint">Custom formatting stays unchanged.</p>
    </div>
  </div>
  {#snippet footer()}<DialogFooter>
    {#snippet info()}<div class="style-footer-info"><p role={artworkError?'alert':'status'}>{artworkError?artworkError:preparingArtwork?'Preparing illustration colors…':preview.error||invalidDraft?'Check style values':stale?'Document changed':'All slides · One undo step'}</p><span class="mobile-preview-action"><Button variant="quiet" onclick={showPreview}>{mobilePreview?'Edit styles':'Preview'}</Button></span></div>{/snippet}
    {#snippet actions()}<Button variant="secondary" onclick={onclose}>Cancel</Button><Button variant="primary" disabled={!changed||stale||Boolean(preview.error)||invalidDraft||preparingArtwork} onclick={apply}>Apply styles</Button>{/snippet}
  </DialogFooter>{/snippet}
</Dialog>
<style>
  .deck-style-workspace{display:grid;grid-template-columns:300px minmax(0,1fr);width:100%;min-height:0;overflow:hidden;scroll-padding-block:32px}
  .style-controls{container-type:inline-size;min-width:0;overflow:auto;overscroll-behavior:contain;padding:0 var(--dialog-gutter);scroll-padding-block:32px;border-right:1px solid var(--border-subtle);scrollbar-gutter:stable;}
  .style-section{display:flex;flex-direction:column;gap:12px;padding:16px 0;border-bottom:1px solid var(--border-subtle)}
  .style-controls input,.style-controls select{scroll-margin-block:32px}.style-controls input[aria-invalid='true']{border-color:var(--danger)}.style-section:last-child{border:0}.style-section h3{font-size:var(--ui-label);font-weight:var(--ui-weight-semibold)}
  .style-presets{display:grid;grid-template-columns:1fr 1fr;gap:8px}.style-preset{display:grid;grid-template-columns:1fr auto;gap:8px;text-align:left;padding:8px;border:1px solid var(--border-default);border-radius:var(--r-control);font-size:var(--ui-label);min-width:0}.style-preset[aria-pressed='true']{background:var(--state-selected);border-color:var(--accent)}
  .preset-specimen{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;min-height:40px;padding:8px 12px;border-radius:var(--r-sm)}.preset-specimen>span{font-size:32px;line-height:1.2}.preset-specimen i{width:16px;height:16px;border-radius:50%}
  .paired-fonts{display:grid;grid-template-columns:1fr 1fr;gap:8px}.paired-fonts label,.paired-fonts select{min-width:0;width:100%}.color-role-fields,.save-style-group{display:flex;flex-direction:column;gap:12px}.color-role-fields{padding-top:12px}.save-style-group{border-top:1px solid var(--border-subtle);padding-top:16px}.pattern-strength>span{display:flex;justify-content:space-between}.pattern-strength output{font-variant-numeric:tabular-nums}.style-footer-info{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px}.style-footer-info>p{flex:1 1 9rem;min-width:0}.style-footer-info .mobile-preview-action{flex:none}.mobile-preview-action :global(button){min-inline-size:max-content;white-space:nowrap}.mobile-preview-action{display:none}
  .basic-colors{display:flex;flex-direction:column;gap:12px}.style-color-row{display:flex;flex-direction:column;gap:4px;min-width:0}.style-color-row>span{font-size:var(--ui-label);color:var(--text-secondary)}
  .style-section :global(.property-choice){width:100%}.style-section :global(.property-choice button){flex:1;min-width:0}.pattern-strength{gap:4px}.pattern-strength input{width:100%;padding:0}
  details.advanced{display:block}summary{font-size:var(--ui-label);font-weight:var(--ui-weight-semibold);padding-block:4px;cursor:pointer}.advanced-content{display:flex;flex-direction:column;gap:12px;padding-top:16px}.advanced-content h3{margin-top:8px}.type-style{border:0;padding:8px 0;min-width:0;display:flex;flex-direction:column;gap:8px}.type-style legend{font-size:var(--ui-label);font-weight:var(--ui-weight-semibold)}.type-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.type-grid select{width:100%;min-width:0}
  .scope-toggle{display:flex;gap:8px;align-items:center;font-size:var(--ui-label)}.scope-toggle input{width:16px;height:16px;padding:0}.scope-section p,.style-preview>.hint{line-height:var(--ui-line-reading)}
  .style-file-actions{display:flex;flex-wrap:wrap;gap:8px}.style-file-input{display:none}
  .saved-style-row{display:flex;align-items:end;gap:8px}.saved-style-row label{flex:1;min-width:0}.saved-style-row select{width:100%;min-width:0}.saved-style-row>.icon-btn{flex:none}.scope-result{font-size:var(--ui-label);line-height:var(--ui-line-reading);color:var(--text-primary)}.contrast-note :global(button){margin-top:8px;width:100%;justify-content:center}
  .style-preview{min-width:0;overflow:auto;display:flex;flex-direction:column;gap:16px;padding:20px var(--dialog-gutter);background:var(--surface-sunken);scrollbar-gutter:stable;}.preview-heading{display:flex;justify-content:space-between;align-items:center;gap:8px}.preview-heading>div{display:flex;flex-direction:column;gap:4px}.preview-heading strong{font-size:var(--ui-reading)}.preview-heading span{font-size:var(--ui-label);color:var(--text-secondary)}.style-preview-canvas{border:1px solid var(--border-default);flex:none}.preview-navigation{display:flex;align-items:center;gap:8px}.preview-navigation>span{flex:1;text-align:center;font-size:var(--ui-label);color:var(--text-secondary);overflow-wrap:anywhere}.preview-thumbnails{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.preview-thumbnails>button{display:flex;flex-direction:column;gap:8px;text-align:left;min-width:0;padding:4px;border:1px solid transparent;border-radius:var(--r-sm)}.preview-thumbnails>button[aria-pressed='true']{--text-secondary:var(--text-primary);background:var(--state-selected);border-color:var(--accent)}.preview-thumbnails span{font-size:var(--ui-meta);color:var(--text-secondary);overflow-wrap:anywhere}.contrast-note{padding:12px;background:var(--surface-top);border:1px solid var(--border-default);border-radius:var(--r-control);font-size:var(--ui-label);line-height:var(--ui-line-reading)}
  .style-preview:focus-visible{outline:2px solid var(--accent-line);outline-offset:-2px}
  .preview-thumbnails>button>div{width:100%;min-width:0;pointer-events:none}
  @media(max-width:760px){.mobile-preview-action{display:block}.mobile-preview-action :global(button){min-height:44px}.deck-style-workspace{display:flex;flex-direction:column;overflow:auto;scrollbar-gutter:stable;}.deck-style-workspace:not(.mobile-preview) .style-preview{display:none}.deck-style-workspace.mobile-preview .style-controls{display:none}.style-controls{overflow:visible;border:0}.style-preview{overflow:visible;gap:12px;padding:16px var(--dialog-gutter)}.preview-thumbnails{display:none}.style-preview>.hint{display:none}.style-section{padding:16px 0}.style-controls select,.style-controls input:not([type='checkbox']):not([type='range']),summary{min-height:44px}.scope-toggle{min-height:44px}.style-presets{grid-template-columns:1fr 1fr}}
  @container(max-width:15rem){.paired-fonts,.type-grid,.style-presets{grid-template-columns:minmax(0,1fr)}}
</style>
