import type {DesignSystem} from './design-system-schema';
import {styleTableRange} from './table-structure';
import type {SlideElement} from './model';
import {z} from './schema';
import {TableTextRunSchema,type TableTextRun} from './table-schema';
import {tablePresentation,tableCellStyle,tableCellSpan,tableCellRuns} from './table-rendering';
import {tableCells} from './object-data';
import {textPropertyState} from './text-properties';
import {editedTextStyle} from './text-editing';
import {boundedTextRange,textRangeStylePatch,textRangeTarget,type TextRange,type TextFormatPatch} from './text-range-format';

/** The text editor borrows resolved cell typography without turning a table into a text object. */
export function tableCellTextElement(e:SlideElement,row:number,column:number,system?:DesignSystem):SlideElement{
  const p=tablePresentation(e,system),style=tableCellStyle(p,row,column),text=e.cells?.[row]?.[column];
  if(text===undefined||tableCellSpan(p,row,column).covered)throw new Error('Choose a visible cell to edit.');
  return {...e,type:'text',text,runs:tableCellRuns(p,row,column,text).map(run=>({...run})),paragraphs:undefined,fontFamily:style.fontFamily,fontSize:parseFloat(style.fontSize),fontWeight:style.fontWeight,italic:style.fontStyle==='italic',underline:style.textDecoration.includes('underline'),strikethrough:style.textDecoration.includes('line-through'),fill:style.color,align:style.textAlign};
}
export type TableCellTextPatch=Pick<SlideElement,'cells'|'tableStyle'>;
/** A reviewable cell draft becomes one canonical transaction, retaining unrelated data and style. */
export function tableCellTextPatch(e:SlideElement,row:number,column:number,draft:SlideElement,system?:DesignSystem):TableCellTextPatch{
  const before=tableCellTextElement(e,row,column,system);if(draft.text.length>5000)throw new Error('Keep each cell under 5,000 characters.');
  const cells=tableCells(e.cells??[]);cells[row][column]=draft.text;
  const runs=draft.runs?.map(run=>{const {text,fontFamily,fontSize,fontWeight,italic,underline,strikethrough,color,letterSpacing,baseline}=run;return {text,...(fontFamily!==undefined?{fontFamily}:{}),...(fontSize!==undefined?{fontSize}:{}),...(fontWeight!==undefined?{fontWeight}:{}),...(italic!==undefined?{italic}:{}),...(underline!==undefined?{underline}:{}),...(strikethrough!==undefined?{strikethrough}:{}),...(color!==undefined?{color}:{}),...(letterSpacing!==undefined?{letterSpacing}:{}),...(baseline!==undefined?{baseline}:{})} satisfies TableTextRun;});
  if(runs&&runs.map(run=>run.text).join('')!==draft.text)throw new Error('The text format does not match the cell. Reopen the cell and try again.');
  const meaningful=runs?.some(run=>Object.keys(run).length>1)?runs:undefined;
  if(!meaningful&&!e.tableStyle?.cellStyles?.find(cell=>cell.row===row&&cell.column===column)?.runs&&draft.align===before.align)return {cells,tableStyle:e.tableStyle};
  const {tableStyle}=styleTableRange(e,{anchor:{row,column},head:{row,column}},{runs:meaningful,...(draft.align!==before.align?{align:draft.align}:{})},system);
  return {cells,tableStyle};
}
export function replaceCellText(source:SlideElement,selection:TextRange,text:string,format:TextFormatPatch={}):{element:SlideElement;range:TextRange;pending?:TextFormatPatch}{
  const selected=boundedTextRange(source.text,selection);if(selected.start===selected.end&&selected.start>0&&/[\uD800-\uDBFF]/.test(source.text[selected.start-1])&&/[\uDC00-\uDFFF]/.test(source.text[selected.start]??''))selected.start=++selected.end;
  const value=source.text.slice(0,selected.start)+text+source.text.slice(selected.end);if(value.length>5000)throw new Error('Keep each cell under 5,000 characters.');
  let element={...source,...editedTextStyle(source,value,{normalizeNewlines:false})};
  if(text&&Object.keys(format).length)element={...element,...textRangeStylePatch(element,format,{start:selected.start,end:selected.start+text.length})};
  return {element,range:{start:selected.start+text.length,end:selected.start+text.length}};
}
/** Toolbar-only caret context combines inherited run styles with the next typed style. */
export function cellTextFormatContext(draft:SlideElement,selection:TextRange,pending:TextFormatPatch):SlideElement{
  if(selection.start!==selection.end||!Object.keys(pending).length)return draft;
  const target=textRangeTarget(draft,selection),keys=['fontFamily','fontSize','fontWeight','italic','underline','strikethrough','fill','letterSpacing','align'] as const;
  const effective=Object.fromEntries(keys.map(key=>[key,textPropertyState([target],key).value])),baseline=pending.baseline??(target.paragraphs?.flatMap(p=>p.runs)??target.runs)?.[0]?.baseline;
  return {...draft,...effective,...pending,paragraphs:undefined,runs:[{text:draft.text,...(baseline!==undefined?{baseline}:{})}]};
}
export type CellTextSnapshot={element:SlideElement;range:TextRange;pending?:TextFormatPatch};
export function cellTextHistory(limit=100){
  const undo:CellTextSnapshot[]=[],redo:CellTextSnapshot[]=[];
  const copy=(state:CellTextSnapshot):CellTextSnapshot=>({element:{...state.element,runs:state.element.runs?.map(run=>({...run}))},range:{...state.range},pending:state.pending?{...state.pending}:undefined});
  return {record(state:CellTextSnapshot){undo.push(copy(state));if(undo.length>limit)undo.shift();redo.length=0;},undo(current:CellTextSnapshot){const previous=undo.pop();if(previous)redo.push(copy(current));return previous;},redo(current:CellTextSnapshot){const next=redo.pop();if(next)undo.push(copy(current));return next;},clear(){undo.length=0;redo.length=0;},get canUndo(){return Boolean(undo.length);},get canRedo(){return Boolean(redo.length);}};
}

const CellTextClipboardSchema=z.strictObject({kind:z.literal('deck-studio/cell-text/1'),text:z.string().check(z.minLength(1)).check(z.maxLength(5000)),runs:z.array(TableTextRunSchema).check(z.minLength(1)).check(z.maxLength(5000))}).check(z.refine(value=>value.runs.every(run=>run.text.length>0)&&value.runs.map(run=>run.text).join('')===value.text,'Clipboard text must match its formatting.'));
export type CellTextClipboard=z.infer<typeof CellTextClipboardSchema>;
/** Clipboard transport contains selected text/style only, never document or media data. */
export function cellTextClipboard(draft:SlideElement,selection:TextRange):CellTextClipboard|undefined{
  const range=boundedTextRange(draft.text,selection);if(range.start===range.end)return;
  const target=textRangeTarget(draft,range),runs=(target.paragraphs?.flatMap(p=>p.runs)??target.runs??[]).filter(run=>run.text).map(run=>({text:run.text,fontFamily:run.fontFamily??draft.fontFamily,fontSize:run.fontSize??draft.fontSize,fontWeight:run.fontWeight??(run.bold===undefined?draft.fontWeight:run.bold?700:400),italic:run.italic??draft.italic,underline:run.underline??draft.underline,strikethrough:run.strikethrough??draft.strikethrough,color:run.color??draft.fill,letterSpacing:run.letterSpacing??draft.letterSpacing,baseline:run.baseline??'normal'}));
  const parsed=CellTextClipboardSchema.safeParse({kind:'deck-studio/cell-text/1',text:draft.text.slice(range.start,range.end),runs});return parsed.success?parsed.data:undefined;
}
export function readCellTextClipboard(value:string):CellTextClipboard|undefined{try{const result=CellTextClipboardSchema.safeParse(JSON.parse(value));return result.success?result.data:undefined;}catch{return;}}
export function pasteCellText(draft:SlideElement,selection:TextRange,clipboard:CellTextClipboard):{element:SlideElement;range:TextRange}{
  const payload=CellTextClipboardSchema.parse(clipboard),range=boundedTextRange(draft.text,selection);
  if(range.start===range.end&&range.start>0&&/[\uD800-\uDBFF]/.test(draft.text[range.start-1])&&/[\uDC00-\uDFFF]/.test(draft.text[range.start]??''))range.start=++range.end;
  const next=replaceCellText(draft,range,payload.text),runs=draft.runs??[{text:draft.text}];
  function slice(start:number,end:number){const result:typeof runs=[];let offset=0;for(const run of runs){const a=Math.max(0,start-offset),b=Math.min(run.text.length,end-offset);if(b>a)result.push({...run,text:run.text.slice(a,b)});offset+=run.text.length;}return result;}
  return {...next,element:{...next.element,runs:[...slice(0,range.start),...payload.runs.map(run=>({...run})),...slice(range.end,draft.text.length)]}};
}
