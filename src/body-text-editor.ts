import {EditorState,Plugin,TextSelection,type Transaction} from 'prosemirror-state';
import {EditorView,Decoration,DecorationSet} from 'prosemirror-view';
import {DOMSerializer} from 'prosemirror-model';
import {history,undo,redo,closeHistory} from 'prosemirror-history';
import {keymap} from 'prosemirror-keymap';
import {baseKeymap,splitBlock,chainCommands,deleteSelection,joinBackward,selectNodeBackward,joinForward,selectNodeForward} from 'prosemirror-commands';
import {bodyTextSchema,bodyDocument,bodyElement,bodySelection,selectBodyText,bodyFormat,bodyParagraphStyle,bodyTextContent,bodyDisplayContext,bodyCaretContext} from './core/body-text-model';
import {bodyTextClipboard,externalBodyClipboard,pasteBodyText,type BodyTextClipboard} from './core/body-text-clipboard';
import {prepareBodyTextClipboard} from './core/body-text-clipboard-reader';
import {readCellTextClipboard} from './core/table-cell-text';
import {textRangeTarget,type TextFormatState,type TextFormatPatch,type TextRange} from './core/text-range-format';
import {textToggleState} from './core/text-properties';
import {fontStack} from './core/font-stack';
import {textFlowStyle} from './core/typography';
import type {SlideElement} from './core/model';
import {bodyTextPatch,type BodyTextLayout} from './core/body-text-patch';
import {contextActions,type ContextActions,type ContextMenuItem} from './context-menu';
export type BodyTextEditor={element:()=>SlideElement;patch:(base:SlideElement,layout?:BodyTextLayout|null)=>Partial<SlideElement>|null;formatState:()=>TextFormatState;format:(patch:TextFormatPatch,range?:TextRange)=>Promise<void>;select:(range:TextRange)=>void;focus:()=>void;composing:()=>boolean;current:()=>boolean;refresh:()=>void;destroy:()=>void;dom:HTMLElement};
type Options={element:SlideElement;scale?:number;label?:string;placeholder?:string;autofocus?:boolean;stack?:typeof fontStack;prepareFont?:(element:SlideElement)=>Promise<void>;current:()=>boolean;onchange:(element:SlideElement)=>void;onselection:()=>void;onwarning:(message:string)=>void;onblur?:(event:FocusEvent)=>void};
/** Browser editing/history stays local. The owning canvas alone commits the model. */
export function createBodyTextEditor(mount:HTMLElement,options:Options):BodyTextEditor{
  const seed=options.element;let live=seed,disposed=false,pasteGeneration=0,plainPaste=-Infinity,cachedDoc:object|undefined,cachedModel=seed,caretFrame=0;
  const schema=bodyTextSchema(()=>live,()=>options.scale??1,options.stack??fontStack),baseline=bodyDocument(schema,seed);
  const contexts=new WeakMap<SlideElement,SlideElement>();
  const model=(doc=view.state.doc)=>{if(cachedDoc!==doc){cachedModel=bodyElement(doc,seed,baseline);cachedDoc=doc;}return cachedModel;};
  const flowStyle=()=>textFlowStyle({...live,maxLines:undefined})+(options.placeholder?`--body-placeholder:${JSON.stringify(options.placeholder)};`:'');
  const announce=()=>options.onselection();
  const allowed=()=>!disposed&&options.current();
  const canChange=()=>{if(!allowed()){options.onwarning('The document changed. Copy this text, then reopen it before saving.');return false;}if(view.composing){options.onwarning('Finish composing text before changing its format.');return false;}return true;};
  function revealCaret(){
    if(disposed||view.composing||document.activeElement!==view.dom)return;
    try{const caret=view.coordsAtPos(view.state.selection.head),modal=view.dom.closest('dialog:modal'),paper=view.dom.closest<HTMLElement>('.slide-render'),scale=modal?1:Number(paper?.style.getPropertyValue('--canvas-scale'))||1;
      for(let parent=view.dom.parentElement;parent&&!parent.matches('.canvas-wrap,.slide-render,.canvas-stage,body');parent=parent.parentElement){
        const css=getComputedStyle(parent),box=parent.getBoundingClientRect();
        if(/auto|scroll/.test(css.overflowY)&&parent.scrollHeight>parent.clientHeight){if(caret.bottom>box.bottom-6)parent.scrollTop+=(caret.bottom-box.bottom+6)/scale;else if(caret.top<box.top+6)parent.scrollTop-=(box.top+6-caret.top)/scale;}
        if(/auto|scroll/.test(css.overflowX)&&parent.scrollWidth>parent.clientWidth){if(caret.right>box.right-6)parent.scrollLeft+=(caret.right-box.right+6)/scale;else if(caret.left<box.left+6)parent.scrollLeft-=(box.left+6-caret.left)/scale;}
      }
    }catch{/* A composing DOM selection will be measured after its transaction. */}
  }
  function scheduleCaret(){cancelAnimationFrame(caretFrame);caretFrame=requestAnimationFrame(revealCaret);}
  function dispatch(tr:Transaction){if(disposed)return;const old=view.state,next=old.applyTransaction(tr);if(next.state===old)return;view.updateState(next.state);if(!next.state.doc.eq(old.doc)||!next.state.selection.eq(old.selection)||next.state.storedMarks!==old.storedMarks)pasteGeneration++;if(!next.state.doc.eq(old.doc)){live=model();view.dom.style.cssText=flowStyle();options.onchange(live);}announce();if(tr.scrolledIntoView||tr.docChanged)scheduleCaret();}
  function formatState():TextFormatState{
    const original=model();let element=contexts.get(original);if(!element){element=bodyDisplayContext(original);contexts.set(original,element);}const range=bodySelection(view.state);
    const shown=range.start===range.end?bodyCaretContext(view.state,original):element;
    return {element:allowed()?shown:{...shown,locked:true},range,capabilities:{caret:true,characters:true}};
  }
  async function format(patch:TextFormatPatch,range?:TextRange){
    if(!canChange())return;const focused=document.activeElement as HTMLElement|null,token=pasteGeneration;
    if(patch.fontFamily&&options.prepareFont){try{const state=formatState(),target=textRangeTarget(state.element,range??state.range),run=(r:import('./core/model').TextRun)=>({...r,fontFamily:patch.fontFamily,...(patch.fontWeight!==undefined?{fontWeight:patch.fontWeight}:{}),...(patch.italic!==undefined?{italic:patch.italic}:{})});await options.prepareFont({...target,fontFamily:patch.fontFamily,nativeTextLayout:undefined,runs:target.runs?.map(run),paragraphs:target.paragraphs?.map(p=>({...p,runs:p.runs.map(run)}))});}catch(error){options.onwarning((error as Error).message);return;}if(disposed||token!==pasteGeneration)return;if(!canChange())return;}
    dispatch(closeHistory(bodyFormat(view.state,patch,range)));view.focus();if(focused?.isConnected&&focused.matches('input')&&focused.closest('[data-text-formatting]'))focused.focus({preventScroll:true});
  }
  function toggle(key:'bold'|'italic'|'underline'|'strike'){
    const state=formatState(),on=textToggleState([textRangeTarget(state.element,state.range)],key==='strike'?'strikethrough':key);
    format(key==='bold'?{fontWeight:on===true?400:700}:key==='italic'?{italic:on!==true}:key==='underline'?{underline:on!==true}:{strikethrough:on!==true});return true;
  }
  async function paste(data:DataTransfer|null){
    if(!canChange()||!data)return;const hasFiles=data.files.length>0,text=data.getData('text/plain').replace(/\r\n?/g,'\n'),raw=data.getData('application/x-deck-studio-text'),cell=data.getData('application/x-deck-studio-cell-text'),html=data.getData('text/html'),plain=performance.now()-plainPaste<1000;plainPaste=-Infinity;
    const token=++pasteGeneration;
    try{
      let payload:BodyTextClipboard|undefined;
      if(!plain&&raw){payload=await prepareBodyTextClipboard(raw);if(!payload)throw Error('The copied text is incomplete. Copy it again or paste as plain text.');}
      if(!plain&&!payload&&cell){const parsed=readCellTextClipboard(cell);if(parsed)payload={...parsed,kind:'deck-studio/text/1'};}
      if(!plain&&!payload&&html.includes('data-deck-studio-text=')){const own=await prepareBodyTextClipboard(html,true);if(own?.text===text)payload=own;}
      if(!plain&&!payload&&html){const {prepareHtmlClipboard}=await import('./core/html-clipboard-reader'),value=await prepareHtmlClipboard(html);if(value)payload=externalBodyClipboard(value);}
      if(disposed||token!==pasteGeneration)return;
      if(!allowed()||document.activeElement!==view.dom){options.onwarning('The text or selection changed. Paste again at the intended location.');return;}
      if(payload)dispatch(closeHistory(pasteBodyText(view.state,payload)).scrollIntoView());
      else if(text)dispatch(closeHistory(view.state.tr.insertText(text)).scrollIntoView());
      else if(hasFiles)options.onwarning('Finish editing text, then paste the image onto the canvas.');
    }catch(error){if(!disposed&&token===pasteGeneration)options.onwarning(error instanceof Error?error.message:'Copy a smaller text selection and retry.');}
  }
  function clipboardData(state=view.state){
    const payload=bodyTextClipboard(state,model(state.doc));if(!payload)return;const raw=JSON.stringify(payload);if(raw.length>80_000_000)throw Error('This selection is too large for the clipboard. Copy less text.');
    const copiedSchema=bodyTextSchema(()=>({...seed,...payload.base}),()=>1,options.stack??fontStack),copied=bodyDocument(copiedSchema,payload),holder=document.createElement('div');holder.append(DOMSerializer.fromSchema(copiedSchema).serializeFragment(copied.content));holder.dataset.deckStudioText=encodeURIComponent(raw);return {raw,text:payload.text,html:holder.outerHTML};
  }
  function copy(event:ClipboardEvent,cut=false){
    if(view.composing||!event.clipboardData||view.state.selection.empty)return false;event.preventDefault();event.stopPropagation();
    try{const data=clipboardData();if(!data)return true;event.clipboardData.setData('application/x-deck-studio-text',data.raw);event.clipboardData.setData('text/plain',data.text);event.clipboardData.setData('text/html',data.html);if(cut&&canChange())dispatch(closeHistory(view.state.tr.deleteSelection()));}
    catch(error){options.onwarning(error instanceof Error?error.message:'Could not copy this selection. Copy less text and retry.');}return true;
  }
  function menuContext():ContextActions{
    const captured=view.state,token=pasteGeneration,writable=allowed()&&!view.composing,selected=!captured.selection.empty;
    const unchanged=()=>!disposed&&allowed()&&token===pasteGeneration;
    const failure=(error:unknown)=>options.onwarning((error as Error).name==='NotAllowedError'?'Clipboard access is unavailable. Use the keyboard shortcut.':(error as Error).message||'The text changed. Open the menu again.');
    const copyFromMenu=async(cut=false)=>{try{const data=clipboardData(captured);if(!data)return;await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([data.text],{type:'text/plain'}),'text/html':new Blob([data.html],{type:'text/html'})})]);if(cut){if(!unchanged())throw Error('The text changed. Copy the selection again.');view.focus();dispatch(closeHistory(view.state.tr.deleteSelection()));}}catch(error){failure(error);}};
    const pasteFromMenu=async()=>{try{
      const data=new DataTransfer();
      if(navigator.clipboard.read){const items=await navigator.clipboard.read();for(const item of items){for(const type of ['text/plain','text/html','application/x-deck-studio-text','application/x-deck-studio-cell-text'])if(item.types.includes(type))data.setData(type,await(await item.getType(type)).text());if(item.types.some(t=>t.startsWith('image/')))data.items.add(new File([],'Clipboard image',{type:'image/png'}));if(data.types.length)break;}}
      else data.setData('text/plain',await navigator.clipboard.readText());
      if(!unchanged())throw Error('The text changed. Open the menu again to paste.');view.focus();await paste(data);
    }catch(error){failure(error);}};
    const items:ContextMenuItem[]=[{label:'Undo',shortcut:'⌘Z',disabled:!writable||!undo(captured),onselect:()=>{if(unchanged())undo(view.state,dispatch);}},{label:'Redo',shortcut:'⇧⌘Z',disabled:!writable||!redo(captured),onselect:()=>{if(unchanged())redo(view.state,dispatch);}},{label:'Cut',shortcut:'⌘X',disabled:!writable||!selected,divider:true,onselect:()=>copyFromMenu(true)},{label:'Copy',shortcut:'⌘C',disabled:!selected,onselect:()=>copyFromMenu()},{label:'Paste',shortcut:'⌘V',disabled:!writable,onselect:pasteFromMenu},{label:'Select all',shortcut:'⌘A',divider:true,onselect:()=>{if(disposed)return;view.focus();dispatch(selectBodyText(view.state,{start:0,end:bodyTextContent(view.state.doc).length}));}}];
    const available=items.filter(i=>!i.disabled);if(available[0])available[0].divider=false;return {label:view.dom.getAttribute('aria-label')??'Text',returnFocus:view.dom,restore:()=>{if(!disposed)view.focus();},items:available};
  }
  const view=new EditorView(mount,{decorations:state=>{
    const nodes:Decoration[]=[],scale=options.scale??1;
    state.doc.forEach((p,pos,index)=>{
      if(p.attrs.format||state.doc.childCount>1)nodes.push(Decoration.node(pos,pos+p.nodeSize,{style:bodyParagraphStyle(p,seed,scale,index,state.doc.childCount,options.stack??fontStack)}));
      const end=p.attrs.format?.endStyle;
      if(end)nodes.push(Decoration.widget(pos+p.nodeSize-1,()=>{const node=document.createElement('span');node.dataset.bodyEnd='';node.setAttribute('aria-hidden','true');node.textContent='\u200b';node.style.cssText=`font-size:${(end.fontSize??seed.fontSize)*scale}px;font-family:${(options.stack??fontStack)(end.fontFamily??seed.fontFamily)};pointer-events:none;`;return node;},{side:1,key:JSON.stringify(end)+':'+scale}));
    });return DecorationSet.create(state.doc,nodes);
  },state:EditorState.create({schema,doc:baseline,plugins:[history(),new Plugin({filterTransaction:tr=>{if(!tr.docChanged)return true;if(!allowed())return false;try{model(tr.doc);return true;}catch(error){options.onwarning((error as Error).message);return false;}}}),keymap({...baseKeymap,
    'Mod-z':undo,'Shift-Mod-z':redo,'Mod-y':redo,'Mod-b':()=>toggle('bold'),'Mod-i':()=>toggle('italic'),'Mod-u':()=>toggle('underline'),'Mod-Shift-x':()=>toggle('strike'),
    Enter:splitBlock,'Shift-Enter':(state,dispatch)=>{dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break.create(),true).scrollIntoView());return true;},
    Backspace:chainCommands(deleteSelection,joinBackward,selectNodeBackward),Delete:chainCommands(deleteSelection,joinForward,selectNodeForward),
    'Mod-a':baseKeymap['Mod-a'],
  })]}),dispatchTransaction:dispatch,editable:()=>allowed(),attributes:state=>({class:'text-flow body-text-editor',role:'textbox',tabindex:'0','aria-label':options.label??`Edit ${seed.name}`,'aria-multiline':'true','aria-readonly':String(!allowed()),'data-empty':String(bodyTextContent(state.doc)===''),...(options.autofocus?{'data-dialog-autofocus':'true'}:{}),...(options.placeholder?{'data-placeholder':options.placeholder}:{})}),
    handleDOMEvents:{paste:(_view,event)=>{event.preventDefault();event.stopPropagation();void paste(event.clipboardData);return true;},copy:(_view,event)=>copy(event),cut:(_view,event)=>copy(event,true),
      blur:(_view,event)=>{if(!disposed)options.onblur?.(event);return false;},
      beforeinput:(_view,event)=>{if(event.inputType==='historyUndo'||event.inputType==='historyRedo'){event.preventDefault();(event.inputType==='historyUndo'?undo:redo)(view.state,dispatch);return true;}if(event.inputType.startsWith('format')){event.preventDefault();return true;}return false;},
      keydown:(_view,event)=>{if(event.isComposing||event.keyCode===229)return false;if((event.metaKey||event.ctrlKey)&&event.shiftKey&&event.key.toLowerCase()==='v')plainPaste=performance.now();return false;},
      // Internal moves keep the engine's typed slice. Foreign data uses the
      // same inert parser and target guard as clipboard paste.
      drop:(_view,event)=>{if(view.dragging)return false;event.preventDefault();event.stopPropagation();if(!canChange())return true;const target=view.posAtCoords({left:event.clientX,top:event.clientY});if(target){dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(target.pos))));view.focus();plainPaste=-Infinity;void paste(event.dataTransfer);}return true;},
    },handleScrollToSelection:()=>{scheduleCaret();return true;},
  });
  view.dom.style.cssText=flowStyle();
  const context=contextActions(view.dom,menuContext);
  return {element:()=>model(),patch:(base,layout)=>bodyTextPatch(base,model(),layout),formatState,format,select:range=>dispatch(selectBodyText(view.state,range)),focus:()=>view.focus(),composing:()=>view.composing,current:allowed,refresh:()=>view.setProps({editable:()=>allowed()}),destroy:()=>{disposed=true;pasteGeneration++;cancelAnimationFrame(caretFrame);context.destroy();view.destroy();},dom:view.dom};
}
