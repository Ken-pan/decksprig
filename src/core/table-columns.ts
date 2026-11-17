import type {SlideElement} from './model';
import {tablePresentation,tableCellStyle,tableCellBox,tableCellRuns} from './table-rendering';
import {inlineTextWidth} from './inline-text-width';
import type {TableStyle} from './table-schema';
import type {DesignSystem} from './design-system-schema';

export function resizeTableColumns(element:SlideElement,boundary:number,delta:number):number[]{
  const p=tablePresentation(element),widths=p.widths.map(w=>w*element.w);
  if(!Number.isInteger(boundary)||boundary<0||boundary>=widths.length-1||!Number.isFinite(delta))throw new Error('Choose an existing column boundary.');
  const total=widths[boundary]+widths[boundary+1],minimum=Math.min(total/2,Math.max(24,p.padding*2+Math.min(32,element.fontSize*1.2)));
  return resizeColumnWidths(widths,boundary,delta,minimum);
}
export function resizeColumnWidths(widths:number[],boundary:number,delta:number,minimum:number):number[]{
  if(!Number.isInteger(boundary)||boundary<0||boundary>=widths.length-1||!Number.isFinite(delta))throw new Error('Choose an existing column boundary.');
  const next=[...widths],total=next[boundary]+next[boundary+1],limit=Math.min(total/2,minimum),minLeft=Math.min(next[boundary],limit),minRight=Math.min(next[boundary+1],limit),left=Math.max(minLeft,Math.min(total-minRight,next[boundary]+delta));
  next[boundary]=left;next[boundary+1]=total-left;return next;
}

/** Adding widths alone must not opt a legacy table into a different appearance. */
export function tableColumnStyle(element:SlideElement,widths:number[],system?:DesignSystem):TableStyle{
  if(element.tableStyle)return {...element.tableStyle,columnWidths:widths};
  const p=tablePresentation(element,system);
  return {headerRow:p.headerRow,banded:p.banded,borders:p.borders,borderWidth:p.borderWidth,padding:p.padding,verticalAlign:p.verticalAlign,numericAlign:false,headerFill:p.header,headerText:p.headerText,bodyFill:p.background,stripeFill:p.stripe,lineColor:p.line,columnWidths:widths};
}

/** Explicit content sizing keeps the table's total width and authored cell values. */
export function contentTableColumns(element:SlideElement):number[]{
  const p=tablePresentation(element),count=p.widths.length;
  if(count===1)return [element.w];
  const minimum=Math.min(element.w/count,Math.max(48,p.padding*2+element.fontSize*2));
  const preferred=p.widths.map((_,column)=>{
    const measured=(element.cells??[]).reduce((width,row,index)=>{
      const style=tableCellStyle(p,index,column),box=tableCellBox(p,index,column),inset=box.insets.left+box.insets.right+box.edges.left.width+box.edges.right.width;let line=0,largest=0;
      for(const run of tableCellRuns(p,index,column,row[column]??'')){const parts=run.text.split('\n');for(const [i,text] of parts.entries()){if(i){largest=Math.max(largest,line);line=0;}line+=inlineTextWidth(text,run.fontSize??parseFloat(style.fontSize),run.fontFamily??style.fontFamily)+(run.letterSpacing??0)*text.length;}}
      return Math.max(width,Math.max(largest,line)+inset);
    },0);
    return Math.max(minimum,Math.min(element.w*.65,measured+2));
  });
  const total=preferred.reduce((a,b)=>a+b,0);
  if(total<=element.w)return preferred.map(width=>width*element.w/total);
  const extra=preferred.map(width=>width-minimum),weight=extra.reduce((a,b)=>a+b,0),space=Math.max(0,element.w-count*minimum);
  return extra.map(width=>minimum+(weight?space*width/weight:space/count));
}
