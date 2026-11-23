<script lang="ts">
  import {fontFamilyKey,sameFontFamily} from '../core/font-stack';
 import {portalToBody} from '../ui-portal';
 import {onMount,tick,untrack} from 'svelte';
 import {Check,X} from '@lucide/svelte';
 import {Button} from './ui';
 import TextFormattingTools from './TextFormattingTools.svelte';
 import CellTextDetails from './CellTextDetails.svelte';
 import {editor} from '../core/editor.svelte';
 import {cellOwner,cellMerge,pasteTableRange} from '../core/table-structure';
 import {tableTabNavigation} from '../core/table-keyboard';
 import {tableCellTextElement,tableCellTextPatch,replaceCellText,cellTextHistory,cellTextFormatContext,cellTextClipboard,readCellTextClipboard,pasteCellText,type TableCellTextPatch,type CellTextSnapshot} from '../core/table-cell-text';
 import {editedTextStyle} from '../core/text-editing';
 import {textRangeStylePatch,textRangeTarget,type TextRange,type TextFormatPatch,type TextFormatState} from '../core/text-range-format';
 import {textToggleState} from '../core/text-properties';
 import {createTypography} from '../core/typography';
 import {fontStack} from '../core/font-stack';
 import {readTextRange,restoreTextRange} from '../text-range-dom';
 import {restoreFocus} from '../ui-focus';
 import {positionFloating,floatingPlacement,visualBounds} from '../ui-viewport';
 import type {SlideElement} from '../core/model';
 let {elementId,initialRow=0,initialColumn=0,initialValue,anchor,onpreview,onclose,onfull}:{elementId:string;initialRow?:number;initialColumn?:number;initialValue?:string;anchor:(row:number,column:number)=>HTMLElement|undefined;onpreview:(row:number,column:number,patch:TableCellTextPatch|null)=>void;onclose:()=>void;onfull:()=>void}=$props();
 const deckId=editor.deck!.id,slideId=editor.slide!.id,origin=untrack(()=>document.activeElement as HTMLElement|null),clearPreview=untrack(()=>onpreview),history=cellTextHistory();
 const {runStyle}=createTypography(family=>fontStack(family,editor.deck?.onlineFonts?.find(font=>sameFontFamily(font.family,family))?.category));
 let row=$state(untrack(()=>initialRow)),column=$state(untrack(()=>initialColumn)),draft=$state<SlideElement>(),shown=$state<SlideElement>(),pending=$state<TextFormatPatch>({}),error=$state(''),status=$state('');
 let popup=$state<HTMLDivElement>(),hint=$state<HTMLDivElement>(),input=$state<HTMLDivElement>(),version=$state(0),viewScale=$state(1),revision=$state(editor.deck!.revision);
 let pasteSequence=0;
 let closing=false,navigating=false,composing=false,restoring=false,frame=0,first=true,tabOrigin:number|undefined,saved:TextRange={start:0,end:0},beforeInput:CellTextSnapshot|undefined,composition:CellTextSnapshot|undefined,compositionFormat:TextFormatPatch={};
 const element=$derived(editor.slide?.elements.find(e=>e.id===elementId)),columns=$derived(Math.max(1,...(element?.cells??[]).map(r=>r.length))),rowCount=$derived(element?.cells?.length??0);
 const stale=$derived(editor.deck?.id!==deckId||editor.slide?.id!==slideId||editor.deck?.revision!==revision||!element||element.locked);
 const view=$derived(shown?{...shown,fontSize:shown.fontSize*viewScale,letterSpacing:shown.letterSpacing*viewScale,runs:shown.runs?.map(run=>({...run,...(run.fontSize!==undefined?{fontSize:run.fontSize*viewScale}:{}),...(run.letterSpacing!==undefined?{letterSpacing:run.letterSpacing*viewScale}:{})}))}:undefined);
 const name=$derived(`Table cell ${String.fromCharCode(65+column)}${row+1}`);
 const fingerprint=(e:SlideElement)=>JSON.stringify([e.text,e.runs,e.align]);
 function range(){return input&&readTextRange(input)||saved;}
 function snapshot():CellTextSnapshot{return {element:draft!,range:{...range()},pending:{...pending}};}
 function preview(){if(element&&draft&&!stale)onpreview(row,column,tableCellTextPatch(element,row,column,draft,editor.deck?.designSystem));}
 function selection(){if(restoring||composing||!input)return;const next=readTextRange(input);if(!next)return;if(next.start!==saved.start||next.end!==saved.end)pending={};saved=next;}
 function readInline():TextFormatState|null{if(!draft||stale)return null;const selected=range();saved=selected;return {element:Object.keys(pending).length&&selected.start===selected.end?cellTextFormatContext(draft,selected,pending):draft,range:selected};}
 function revealCaret(){
  if(!input||composing||saved.start!==saved.end||document.activeElement!==input)return;
  const selected=getSelection();if(!selected?.rangeCount||!input.contains(selected.focusNode))return;
  const caret=selected.getRangeAt(0).cloneRange();caret.collapse(false);const r=caret.getBoundingClientRect(),box=input.getBoundingClientRect();if(!r.height)return;
  const gap=6;if(r.bottom>box.bottom-gap)input.scrollTop+=r.bottom-box.bottom+gap;else if(r.top<box.top+gap)input.scrollTop-=box.top+gap-r.top;
  if(r.right>box.right-gap)input.scrollLeft+=r.right-box.right+gap;else if(r.left<box.left+gap)input.scrollLeft-=box.left+gap-r.left;
 }
 async function render(next:SlideElement,selected:TextRange,resetScroll=false){pasteSequence++;const scroll={top:resetScroll?0:input?.scrollTop??0,left:resetScroll?0:input?.scrollLeft??0};draft=next;shown=next;saved=selected;version++;await tick();if(closing)return;restoring=true;position();input?.focus({preventScroll:true});if(input){restoreTextRange(input,saved);input.scrollTop=scroll.top;input.scrollLeft=scroll.left;}restoring=false;revealCaret();window.dispatchEvent(new Event('deck-studio-text-format'));}
 async function change(next:SlideElement,selected:TextRange,before=snapshot()){if(fingerprint(next)===fingerprint(draft!))return;history.record(before);error='';pending={};draft=next;preview();await render(next,selected);}
 async function insert(text:string){if(stale||!draft||composing)return;try{const before=snapshot(),next=replaceCellText(draft,before.range,text,pending);await change(next.element,next.range,before);}catch(e){error=(e as Error).message;}}
 async function format(patch:TextFormatPatch,selected=range()){
  if(stale||!draft||composing)return;
  if(selected.start===selected.end){const {align,...characters}=patch;if(Object.keys(characters).length)history.record(snapshot());const typing={...pending,...characters};pending=typing;if(align!==undefined){await change({...draft,align},selected);pending=typing;}window.dispatchEvent(new Event('deck-studio-text-format'));return;}
  const next={...draft,...textRangeStylePatch(draft,patch,selected)};await change(next,selected);
 }
 async function undo(redo=false){if(!draft||stale||composing)return;const next=redo?history.redo(snapshot()):history.undo(snapshot());if(!next)return;pending=next.pending??{};error='';draft=next.element;preview();await render(next.element,next.range);}
 function position(){
  if(!popup?.matches(':popover-open'))return;const node=anchor(row,column);if(!node||!draft)return;
  const r=node.getBoundingClientRect(),css=getComputedStyle(node),paper=node.closest<HTMLElement>('.slide-render'),scale=Number(paper?.style.getPropertyValue('--canvas-scale'))||1,coarse=matchMedia('(pointer:coarse),(max-width:760px)').matches,rotated=Math.abs(element?.rotation??0)>.01;
  const bounds=visualBounds(),availableHeight=Math.max(1,bounds.height-24),width=rotated?node.offsetWidth*scale:r.width,height=rotated?node.offsetHeight*scale:r.height,compact=width<260||height<(coarse?72:44)||height>availableHeight-160,table=node.closest('table')?.getBoundingClientRect()??r;
  if(hint){hint.style.width=`${Math.max(1,Math.min(480,bounds.width-24))}px`;hint.style.maxHeight=`${Math.max(44,availableHeight-88)}px`;}
  popup.style.transform=compact?'':rotated?`rotate(${element!.rotation}deg) scale(${element!.flipX?-1:1},${element!.flipY?-1:1})`:'';
  if(compact){const w=Math.max(1,Math.min(420,bounds.width-24)),hintHeight=hint?.offsetHeight??80,h=Math.max(1,Math.min(160,Math.max(72,height),availableHeight-hintHeight-8)),total=h+hintHeight+8,placement=floatingPlacement(table,{width:Math.max(w,hint?.offsetWidth??0),height:total},bounds,{preferredHeight:total,minHeight:total});popup.style.width=`${w}px`;popup.style.height=`${h}px`;popup.style.left=`${placement.left}px`;popup.style.top=`${placement.top}px`;if(hint){hint.style.left=`${placement.left}px`;hint.style.top=`${placement.top+h+8}px`;}}
  else{const w=Math.min(width,bounds.width-24),h=Math.max(coarse?72:44,Math.min(height,availableHeight-160));popup.style.left=`${Math.max(bounds.left+12,Math.min(bounds.left+bounds.width-w-12,rotated?r.left+r.width/2-w/2:r.left))}px`;popup.style.top=`${Math.max(bounds.top+12,Math.min(bounds.top+bounds.height-h-12,r.top))}px`;popup.style.width=`${w}px`;popup.style.height=`${h}px`;if(hint)positionFloating(hint,table,{preferredHeight:hint.offsetHeight,minHeight:hint.offsetHeight});}
  const nextScale=Math.max(coarse?16:14,draft.fontSize*scale)/draft.fontSize;
  if(!composing&&Math.abs(nextScale-viewScale)>.00001){const top=input?.scrollTop??0,left=input?.scrollLeft??0;viewScale=nextScale;version++;void tick().then(()=>{if(!closing){position();restoring=true;input?.focus({preventScroll:true});if(input){restoreTextRange(input,saved);input.scrollTop=top;input.scrollLeft=left;}restoring=false;revealCaret();}});}
  if(input){const cellFill=(css.getPropertyValue('--table-cell-fill')||css.backgroundColor).trim(),transparent=(value:string)=>!value||value==='transparent'||/rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(value),paperFill=paper?getComputedStyle(paper).backgroundColor:'';input.style.background=transparent(cellFill)?transparent(paperFill)?'var(--field-surface)':paperFill:cellFill;input.style.color=transparent(cellFill)&&transparent(paperFill)?'var(--text-primary)':draft.fill;input.style.fontFamily=fontStack(draft.fontFamily,editor.deck?.onlineFonts?.find(f=>sameFontFamily(f.family,draft!.fontFamily))?.category);input.style.fontSize=`${draft.fontSize*viewScale}px`;input.style.fontWeight=String(draft.fontWeight);input.style.fontStyle=draft.italic?'italic':'normal';input.style.textAlign=draft.align;input.style.letterSpacing=`${draft.letterSpacing*viewScale}px`;input.style.padding=[css.paddingTop,css.paddingRight,css.paddingBottom,css.paddingLeft].map(value=>`${Math.max(6,parseFloat(value)*scale)}px`).join(' ');}
 }
 function schedule(event?:Event|ResizeObserverEntry[]|MutationRecord[]){if(event instanceof Event&&event.target===input)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{position();revealCaret();});}
 async function activate(){if(!element)return;const source=tableCellTextElement(element,row,column,editor.deck?.designSystem),replacing=first&&initialValue!==undefined;first=false;draft=replacing?{...source,...editedTextStyle(source,initialValue!,{normalizeNewlines:false})}:source;pending={};history.clear();if(replacing)history.record({element:source,range:{start:0,end:source.text.length}});error='';const selected=replacing?{start:draft.text.length,end:draft.text.length}:{start:0,end:draft.text.length};preview();await render(draft,selected,true);}
 function commit(){
  if(stale){error='The document changed. Close and reopen this cell.';return false;}if(!draft||!element)return false;
  if(fingerprint(draft)===fingerprint(tableCellTextElement(element,row,column,editor.deck?.designSystem))){onpreview(row,column,null);return true;}
  try{const patch=tableCellTextPatch(element,row,column,draft,editor.deck?.designSystem),before=editor.deck!.revision;editor.commit([{op:'update_element',slideId,elementId,patch}],'','manual',revision);if(editor.deck!.revision===before){error=editor.error;return false;}revision=editor.deck!.revision;onpreview(row,column,null);error='';status='Saved · Undo is available';return true;}catch(e){error=(e as Error).message;return false;}
 }
 function leaving(){queueMicrotask(()=>{const active=document.activeElement;if(closing||restoring||!document.hasFocus()||!active||active===document.body||popup?.contains(active)||hint?.contains(active))return;close(false,false);if(!closing)input?.focus({preventScroll:true});});}
 function close(cancel=false,focus=true){if(closing)return;if(composing&&!cancel){error='Finish composing text before saving.';return;}if(cancel){composing=false;composition=undefined;}if(!cancel&&!commit())return;const target=focus?anchor(row,column):undefined;closing=true;onpreview(row,column,null);popup?.hidePopover();onclose();if(focus)queueMicrotask(()=>restoreFocus(target,origin));}
 async function move(nextRow:number,nextColumn:number){if(!commit())return;row=Math.max(0,Math.min(rowCount-1,nextRow));column=Math.max(0,Math.min(columns-1,nextColumn));({row,column}=cellOwner(element?.tableStyle,{row,column}));await activate();}
 async function tab(backwards:boolean){
  if(navigating||stale||!element||!draft)return;navigating=true;
  try{const current={...element,...tableCellTextPatch(element,row,column,draft,editor.deck?.designSystem)},next=tableTabNavigation(current,{row,column},backwards);if(next.kind==='edge'){close();return;}if(next.kind==='limit'){error='Use up to 100 rows. Save this cell to finish editing.';return;}if(next.kind==='move'){await move(next.cell.row,next.cell.column);return;}const before=editor.deck!.revision;editor.commit([{op:'update_element',slideId,elementId,patch:next.patch}],'','manual',revision);if(editor.deck!.revision===before){error=editor.error;return;}revision=editor.deck!.revision;onpreview(row,column,null);row=next.cell.row;column=next.cell.column;status='Added row · Undo is available';await tick();await activate();}catch(e){error=(e as Error).message;}finally{navigating=false;}
 }
 function before(event:InputEvent){
  if(stale){event.preventDefault();return;}if(event.isComposing||composing)return;
  if(event.inputType==='historyUndo'||event.inputType==='historyRedo'){event.preventDefault();void undo(event.inputType==='historyRedo');return;}
  if(event.inputType==='insertText'&&event.data!==null){event.preventDefault();void insert(event.data);return;}
  if(event.inputType==='insertParagraph'||event.inputType==='insertLineBreak'){event.preventDefault();void insert('\n');return;}
  if(event.inputType.startsWith('format')){event.preventDefault();return;}beforeInput=snapshot();
 }
 async function sync(){if(!input||!draft||stale)return;const value=input.textContent??'';if(value.length>5000){error='Keep each cell under 5,000 characters.';if(!composing)await render(draft,saved);return;}const next={...draft,...editedTextStyle(draft,value,{normalizeNewlines:false})},selected=range();if(composing){draft=next;preview();return;}if(fingerprint(next)!==fingerprint(draft)){const old=beforeInput??snapshot();beforeInput=undefined;await change(next,selected,old);}}
 function composingStart(){composing=true;composition=snapshot();compositionFormat={...pending};}
 async function composingEnd(){if(!draft||!composition)return;composing=false;const source=composition,selected=range(),value=input?.textContent??draft.text;composition=undefined;let next={...source.element,...editedTextStyle(source.element,value,{normalizeNewlines:false})};const end=value.length-(source.element.text.length-source.range.end);if(end>source.range.start&&Object.keys(compositionFormat).length)next={...next,...textRangeStylePatch(next,compositionFormat,{start:source.range.start,end})};if(value.length>5000){error='Keep each cell under 5,000 characters.';draft=source.element;await render(draft,source.range);return;}if(fingerprint(next)!==fingerprint(source.element))history.record(source);pending={};draft=next;preview();await render(next,selected);schedule();}
 function key(event:KeyboardEvent){
  if(event.isComposing||event.keyCode===229||composing)return;event.stopPropagation();if(navigating){event.preventDefault();return;}
  const command=event.metaKey||event.ctrlKey,key=event.key.toLowerCase();
  if(command&&!event.altKey&&['b','i','u','x'].includes(key)&&(event.shiftKey?key==='x':key!=='x')){event.preventDefault();const state=readInline();if(!state)return;const target=[textRangeTarget(state.element,state.range)];void format(key==='b'?{fontWeight:textToggleState(target,'bold')===true?400:700}:key==='i'?{italic:textToggleState(target,'italic')!==true}:key==='u'?{underline:textToggleState(target,'underline')!==true}:{strikethrough:textToggleState(target,'strikethrough')!==true});}
  else if(command&&['z','y'].includes(key)){event.preventDefault();if(history.canUndo||history.canRedo)void undo(event.shiftKey||key==='y');else if(!Object.keys(pending).length){close(true);if(event.shiftKey||key==='y')editor.redo();else editor.undo();}}
  else if(event.key==='Escape'){event.preventDefault();close(true);}
  else if(event.key==='Enter'){event.preventDefault();if(event.altKey||command)void insert('\n');else{const next=row+(event.shiftKey?-1:cellMerge(element?.tableStyle,row,column)?.rowSpan??1);if(next<0||next>=rowCount)close();else{const c=tabOrigin??column;tabOrigin=undefined;void move(next,c);}}}
  else if(event.key==='F6'){event.preventDefault();hint?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});}
  else if(event.key==='Tab'){event.preventDefault();tabOrigin??=column;void tab(event.shiftKey);}
 }
 function copy(event:ClipboardEvent,cut=false){
  if(!draft||composing||!event.clipboardData)return;const selected=range();if(selected.start===selected.end)return;event.preventDefault();event.stopPropagation();const payload=cellTextClipboard(draft,selected),target=textRangeTarget(draft,selected),container=document.createElement('span');container.style.cssText=`font-family:${fontStack(draft.fontFamily,editor.deck?.onlineFonts?.find(font=>sameFontFamily(font.family,draft!.fontFamily))?.category)};font-size:${draft.fontSize}px;font-weight:${draft.fontWeight};font-style:${draft.italic?'italic':'normal'};color:${draft.fill};letter-spacing:${draft.letterSpacing}px;white-space:pre-wrap;text-decoration:none;`;for(const run of target.paragraphs?.flatMap(p=>p.runs)??target.runs??[]){const span=document.createElement('span');span.style.cssText=runStyle(run,draft);span.textContent=run.text;container.append(span);}event.clipboardData.setData('text/plain',draft.text.slice(selected.start,selected.end));event.clipboardData.setData('text/html',container.outerHTML);if(payload)event.clipboardData.setData('application/x-deck-studio-cell-text',JSON.stringify(payload));if(cut&&!stale)void insert('');
 }
 async function paste(event:ClipboardEvent){
  event.preventDefault();event.stopPropagation();if(stale||closing||composing||!element||!draft)return;
  const copied=readCellTextClipboard(event.clipboardData?.getData('application/x-deck-studio-cell-text')??''),text=event.clipboardData?.getData('text/plain')??'',html=event.clipboardData?.getData('text/html')??'';
  try{
   if(copied){const before=snapshot(),next=pasteCellText(draft,before.range,copied);await change(next.element,next.range,before);return;}
   let rich:import('../core/html-clipboard').HtmlClipboard|undefined,helpers:typeof import('../core/html-table-paste')|undefined;
   if(html){
    const token=++pasteSequence,captured={row,column,revision,draft:fingerprint(draft),range:JSON.stringify(range())};
    const parser=await import('../core/html-clipboard-reader');rich=await parser.prepareHtmlClipboard(html);if(rich)helpers=await import('../core/html-table-paste');
    if(token!==pasteSequence||closing||composing||stale||row!==captured.row||column!==captured.column||revision!==captured.revision||fingerprint(draft)!==captured.draft||JSON.stringify(range())!==captured.range||document.activeElement!==input){error='The cell changed. Paste again at the intended location.';return;}
   }
   const inline=rich?.kind==='text'?{kind:'deck-studio/cell-text/1' as const,text:rich.text,runs:rich.runs}:rich&&helpers?helpers.htmlCellText(rich):undefined;
   if(inline){const before=snapshot(),next=inline.text?pasteCellText(draft,before.range,inline):replaceCellText(draft,before.range,'');await change(next.element,next.range,before);return;}
   if(!rich){if(!text)return;if(!text.includes('\t')){await insert(text.replace(/\r\n?/g,'\n'));return;}}
   const current={...element,...tableCellTextPatch(element,row,column,draft,editor.deck?.designSystem)},selected={anchor:{row,column},head:{row,column}},result=rich&&helpers?helpers.pasteHtmlTable(current,helpers.htmlTableSource(rich),selected,editor.deck?.designSystem):pasteTableRange(current,text,selected),before=editor.deck!.revision;
   editor.commit([{op:'update_element',slideId,elementId,patch:{cells:result.cells,tableStyle:result.tableStyle}}],'','manual',revision);if(editor.deck!.revision===before){error=editor.error;return;}revision=editor.deck!.revision;onpreview(row,column,null);status=`Pasted ${result.rows} × ${result.columns} · Undo is available`;await activate();
  }catch(e){error=`${(e as Error).message} Current data is unchanged.`;}
 }

 $effect(()=>{if(stale)untrack(()=>clearPreview(row,column,null));});
 onMount(()=>{const p=popup!;p.showPopover();hint?.showPopover();void activate();const observer=new ResizeObserver(schedule);observer.observe(p);if(hint)observer.observe(hint);const surface=anchor(row,column)?.closest('.slide-render'),layout=new MutationObserver(schedule);if(surface)layout.observe(surface,{attributes:true,attributeFilter:['style']});window.addEventListener('resize',schedule);document.addEventListener('scroll',schedule,true);window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);document.addEventListener('selectionchange',selection);
  const outside=(event:PointerEvent)=>{if(event.button!==0||!(event.target instanceof Node)||p.contains(event.target)||hint?.contains(event.target))return;if(anchor(row,column)?.contains(event.target)){event.preventDefault();event.stopPropagation();input?.focus({preventScroll:true});return;}close(false,false);if(!closing){event.preventDefault();event.stopPropagation();input?.focus({preventScroll:true});}};document.addEventListener('pointerdown',outside,true);
  return()=>{closing=true;clearPreview(row,column,null);document.removeEventListener('pointerdown',outside,true);document.removeEventListener('selectionchange',selection);observer.disconnect();layout.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);document.removeEventListener('scroll',schedule,true);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);hint?.hidePopover();p.hidePopover();};
 });
</script>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div bind:this={popup} popover="manual" role="dialog" aria-label="Edit table cell" tabindex="-1" class="cell-editor" onfocusout={leaving} onkeydown={event=>{if(event.key==='Escape'&&!event.isComposing){event.preventDefault();event.stopPropagation();close(true);}}}>
 {#key version}<div bind:this={input} role="textbox" tabindex="0" aria-label={name} aria-multiline="true" aria-describedby="cell-text-help" contenteditable={!stale} spellcheck="false" class="cell-text" onbeforeinput={before} oninput={()=>void sync()} onkeydown={key} onpaste={paste} oncopy={event=>copy(event)} oncut={event=>copy(event,true)} oncompositionstart={composingStart} oncompositionend={()=>void composingEnd()} ondrop={event=>{event.preventDefault();const text=event.dataTransfer?.getData('text/plain');if(text)void insert(text);}}>{#if view}{#each view.runs??[{text:view.text}] as run}<span style={runStyle(run,view)}>{run.text}</span>{/each}{/if}</div>{/key}
 <div bind:this={hint} role="toolbar" aria-label="Table cell actions" tabindex="-1" use:portalToBody popover="manual" class="inline-hint" onfocusout={leaving} onkeydown={event=>{if(event.key==='Escape'&&!event.isComposing){event.preventDefault();event.stopPropagation();close(true);}else if(event.key==='F6'){event.preventDefault();event.stopPropagation();input?.focus({preventScroll:true});if(input)restoreTextRange(input,saved);}else if((event.metaKey||event.ctrlKey)&&['b','i','u','x','z','y'].includes(event.key.toLowerCase())&&!(event.target as HTMLElement).closest('input,select,textarea'))key(event);}}>
  <div class="cell-tools"><span class="cell-address">{String.fromCharCode(65+column)}{row+1}</span><TextFormattingTools inline allowCaret alignmentLabel="Cell alignment" readInline={readInline} onformat={format}/><CellTextDetails readInline={readInline} onformat={format}/><span class="cell-actions"><Button kind="icon" variant="quiet" aria-label="Cancel cell edit" onpointerdown={event=>event.preventDefault()} onclick={()=>close(true)}><X size={16}/></Button><Button kind="icon" variant="quiet" aria-label="Save cell" onpointerdown={event=>event.preventDefault()} onclick={()=>close()}><Check size={16}/></Button></span></div>
  <small id="cell-text-help"><span class="cell-keyboard-help">Enter ↓ · Tab → · Alt + Enter for a new line · F6 for formatting</span><span class="cell-touch-help">{String.fromCharCode(65+column)}{row+1} · Select text to format. Save to apply.</span></small>
  {#if stale||error}<p class="error" role="alert">{error||'The document changed. Reopen this cell.'}</p>{/if}<span class="sr-only" role="status">{status}</span>
 </div>
</div>
<style>
 .cell-editor{position:fixed;inset:auto;margin:0;padding:0;border:0;border-radius:0;background:transparent;color:var(--text-primary);overflow:visible;box-sizing:border-box}.cell-text{display:block;width:100%;height:100%;min-height:44px;overflow:auto;box-sizing:border-box;white-space:pre-wrap;overflow-wrap:anywhere;outline:2px solid var(--canvas-selection);outline-offset:-1px;box-shadow:var(--shadow-floating);line-height:1.4;text-decoration:none}.inline-hint{display:none;position:fixed;inset:auto;margin:0;box-sizing:border-box;background:var(--surface-overlay);border:1px solid var(--component-border);border-radius:var(--r-control);padding:8px;box-shadow:var(--shadow-floating);font:var(--ui-meta)/1.4 var(--font-ui);color:var(--text-secondary);overflow:auto}.inline-hint:popover-open{display:flex;flex-direction:column;gap:4px}.cell-tools{display:flex;align-items:center;flex-wrap:wrap;gap:4px;min-width:0}.cell-address{font-weight:500;color:var(--text-primary);padding-inline:4px}.cell-actions{display:flex;margin-left:auto;gap:4px}.cell-tools :global(button){min-width:36px;min-height:36px}.inline-hint small{font-size:var(--ui-meta);white-space:normal}.cell-touch-help{display:none}.error{color:var(--danger-text);margin:4px 0;white-space:normal}@media(pointer:coarse),(max-width:760px){.cell-text{min-height:72px}.cell-keyboard-help,.cell-tools>.cell-address{display:none}.cell-touch-help{display:inline}.cell-tools :global(button){min-width:44px;min-height:44px}}
</style>
