import type {Deck,Slide,SlideElement,TextRun} from './model';
import {cjkFallback,fontFamilyKey} from './font-stack';
export type FontUse={family:string;weight:number;italic:boolean;text:string};
/** Collect rendered glyphs, preserving rich cell inheritance and ignoring nontext artwork. */
export function typographyUses(slides:Pick<Slide,'elements'>[],online:Deck['onlineFonts']=[],fallback=true):FontUse[]{
  const uses=new Map<string,FontUse>(),categories=new Map(online?.map(font=>[fontFamilyKey(font.family),font.category]));
  function add(e:Pick<SlideElement,'fontFamily'|'fontWeight'|'italic'>,run:Partial<TextRun>&{text:string}){
    if(!run.text)return;const family=run.fontFamily||e.fontFamily,weight=run.fontWeight??(run.bold===undefined?e.fontWeight:run.bold?700:400),italic=run.italic??e.italic;
    function record(family:string){const key=`${fontFamilyKey(family)}:${weight}:${italic}`,use=uses.get(key)??{family,weight,italic,text:''};use.text+=run.text;uses.set(key,use);}
    record(family);const other=cjkFallback(family,categories.get(fontFamilyKey(family)));if(fallback&&other&&fontFamilyKey(other)!==fontFamilyKey(family)&&/[\p{Script=Han}\u3000-\u303f\uff00-\uffef]/u.test(run.text))record(other);
  }
  for(const slide of slides)for(const e of slide.elements){
    if(e.hidden)continue;
    if(e.type==='table'){
      const styles=new Map(e.tableStyle?.cellStyles?.map(cell=>[`${cell.row}:${cell.column}`,cell]));
      for(const [row,cells]of (e.cells??[]).entries())for(const [column,text]of cells.entries()){
        if(e.tableStyle?.merges?.some(m=>row>=m.row&&row<m.row+m.rowSpan&&column>=m.column&&column<m.column+m.columnSpan&&(row!==m.row||column!==m.column)))continue;
        const cell=styles.get(`${row}:${column}`),base={fontFamily:cell?.fontFamily??e.fontFamily,fontWeight:cell?.fontWeight??((e.tableStyle?.headerRow??true)&&row===0?600:e.fontWeight),italic:cell?.italic??e.italic};
        const runs=cell?.runs&&cell.runs.map(r=>r.text).join('')===text?cell.runs:[{text}];for(const run of runs)add(base,run);
      }
    }else if(e.type==='chart')add(e,{text:(e.chart?JSON.stringify(e.chart):e.values?.map(v=>v.label+' '+v.value).join(' ')??'')+'0123456789.,%+−'});
    else if(e.type==='text'||(['rect','ellipse','diamond','line'].includes(e.type)&&!e.sourceRegion&&!e.designPattern)){
      if(e.paragraphs?.length)for(const p of e.paragraphs){for(const r of p.runs)add(e,r);if(p.endStyle)add(e,{...p.endStyle,text:'\u200b'});}
      else if(e.runs?.length)for(const r of e.runs)add(e,r);else add(e,{text:e.text});
    }
  }
  return [...uses.values()];
}
