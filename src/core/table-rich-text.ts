import type {SlideElement} from './model';
import type {TableStyle,TableTextRun} from './table-schema';
import {editedTextStyle} from './text-editing';

/** Plain cell strings are the content authority; ordinary edits preserve matching styled characters. */
export function reconcileTableText(e:SlideElement,cells:string[][],style=e.tableStyle):TableStyle|undefined {
  if(!style?.cellStyles?.some(s=>s.runs))return style;
  let changed=false;
  const cellStyles=style.cellStyles.map(cell=>{
    if(!cell.runs||cell.row>=cells.length||cell.column>=(cells[cell.row]?.length??0))return cell;
    const before=cell.runs.map(r=>r.text).join(''),text=cells[cell.row][cell.column];if(before===text)return cell;
    const patch=editedTextStyle({...e,type:'text',text:before,runs:cell.runs,paragraphs:undefined},text,{normalizeNewlines:false});changed=true;
    return {...cell,runs:patch.runs as TableTextRun[]};
  });
  return changed?{...style,cellStyles}:style;
}

/** Font-size controls scale authored text sizes, without changing table spacing or borders. */
export function scaleTableText(style:TableStyle|undefined,scale:number):TableStyle|undefined {
  if(!style||scale===1)return style;
  return {...style,cellStyles:style.cellStyles?.map(cell=>({...cell,...(cell.fontSize!==undefined?{fontSize:cell.fontSize*scale}:{}),...(cell.runs?{runs:cell.runs.map(run=>({...run,...(run.fontSize!==undefined?{fontSize:run.fontSize*scale}:{})}))}:{})}))};
}
