import {Undo2,Redo2,Scissors,Copy,ClipboardPaste,TextSelect} from '@lucide/svelte';
import {registeredContext,type ContextActions,type ContextMenuItem} from './context-menu';

export function textContext(target: HTMLElement, report: (message: string) => void): ContextActions | undefined {
  const managed=target.closest<HTMLElement>('.body-text-editor'),custom=managed&&registeredContext(managed);
  if(custom){const icons:Record<string,ContextMenuItem['icon']>={Undo:Undo2,Redo:Redo2,Cut:Scissors,Copy,Paste:ClipboardPaste,'Select all':TextSelect};return {...custom,items:custom.items.map(item=>({...item,icon:icons[item.label]??item.icon}))};}
  const field = target.closest<HTMLInputElement | HTMLTextAreaElement | HTMLElement>('input,textarea,[contenteditable="true"]');
  if (!field) return;
  const input = field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement ? field : undefined;
  if (input && (input.disabled || input instanceof HTMLInputElement && ['checkbox','radio','range','color','file','button','submit','reset'].includes(input.type))) return;
  const selection = window.getSelection(), candidate = !input && selection?.rangeCount ? selection.getRangeAt(0) : undefined;
  const range = candidate && field.contains(candidate.commonAncestorContainer) ? candidate.cloneRange() : undefined;
  const original = input?.value;
  const originalText = field.innerText;
  const start = input?.selectionStart, end = input?.selectionEnd;
  const selected = input ? start != null && end != null ? input.value.slice(start, end) : '' : range?.toString() ?? '';
  const writable = input ? !input.readOnly : field.isContentEditable;
  const secret = input instanceof HTMLInputElement && input.type === 'password';
  function restore() {
    if (!field?.isConnected) return;
    field.focus({preventScroll:true});
    if (input && start != null && end != null) input.setSelectionRange(start, end);
    else if (range && field.contains(range.commonAncestorContainer)) { selection?.removeAllRanges(); selection?.addRange(range); }
  }
  function replace(text: string) {
    restore();
    // Native insertText preserves the field's undo history and input lifecycle.
    if (document.execCommand('insertText', false, text)) return;
    if (input) {
      if (start != null && end != null) input.setRangeText(text, start, end, 'end');
      else input.value = text;
      input.dispatchEvent(new InputEvent('input', {bubbles:true, inputType:'insertText', data:text}));
    } else report('Text could not be inserted. Use the keyboard shortcut.');
  }
  async function copy(cut = false) {
    try { await navigator.clipboard.writeText(selected); if (cut && field?.isConnected && (input ? input.value === original : field.innerText === originalText)) replace(''); }
    catch { report('Clipboard access is unavailable. Use the keyboard shortcut.'); }
  }
  const items: ContextMenuItem[] = [
    {label:'Undo',icon:Undo2, shortcut:'⌘Z', disabled:!writable || !document.queryCommandEnabled('undo'), onselect:() => {restore(); document.execCommand('undo');}},
    {label:'Redo',icon:Redo2, shortcut:'⇧⌘Z', disabled:!writable || !document.queryCommandEnabled('redo'), onselect:() => {restore(); document.execCommand('redo');}},
    {label:'Cut',icon:Scissors, shortcut:'⌘X', divider:true, disabled:!writable || !selected || secret, onselect:() => copy(true)},
    {label:'Copy',icon:Copy, shortcut:'⌘C', disabled:!selected || secret, onselect:() => copy()},
    {label:'Paste',icon:ClipboardPaste, shortcut:'⌘V', disabled:!writable, onselect:async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (!field?.isConnected || input && input.value !== original || !input && (field.innerText !== originalText || range && !field.contains(range.commonAncestorContainer))) { report('The text changed. Open the menu again to paste.'); return; }
        replace(text);
      } catch { report('Clipboard access is unavailable. Use the keyboard shortcut.'); }
    }},
    {label:'Select all',icon:TextSelect, shortcut:'⌘A', divider:true, onselect:() => {
      field.focus({preventScroll:true});
      if (input) input.select();
      else { const all = document.createRange(); all.selectNodeContents(field); selection?.removeAllRanges(); selection?.addRange(all); }
    }},
  ];
  const available=items.filter(item=>!item.disabled&&(item.label!=='Select all'||Boolean(input?original:originalText)));
  if(!available.length)return;
  available.forEach((item,index)=>{if(index===0)item.divider=false;});
  return {label:field.getAttribute('aria-label') || 'Text', items:available, restore};
}
