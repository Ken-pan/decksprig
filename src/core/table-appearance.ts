import type {SlideElement} from './model';
import type {TableStyle} from './table-schema';
export const tablePresets=[{id:'editorial',label:'Editorial',hint:'Quiet rows and clear headings'},{id:'banded',label:'Banded',hint:'Easy to scan longer tables'},{id:'grid',label:'Grid',hint:'Precise rows and columns'},{id:'contrast',label:'Contrast',hint:'A strong header for presentations'}] as const;
export * from './table-rendering';
import {tablePresetStyle} from './table-rendering';
/** Changing a preset keeps authored structure, sizing and local cell overrides. */
export function tablePresetForElement(e:SlideElement,id:NonNullable<TableStyle['preset']>):TableStyle{
  const s=e.tableStyle;return {...tablePresetStyle(id),columnWidths:s?.columnWidths,columnAlign:s?.columnAlign,rowHeights:s?.rowHeights,merges:s?.merges,cellStyles:s?.cellStyles};
}
export function tablePresetMatches(style:TableStyle|undefined,id:NonNullable<TableStyle['preset']>){
  if(style?.preset!==id)return false;const base=tablePresetStyle(id);
  return Object.entries(base).every(([key,value])=>style[key as keyof TableStyle]===value)&&!['headerFill','headerText','bodyFill','stripeFill','lineColor'].some(key=>style[key as keyof TableStyle]!==undefined);
}
