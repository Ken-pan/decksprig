import type {SlideElement} from './model';
import type {Chart} from './chart-schema';
import {inlineTextWidth} from './inline-text-width';
import {formatChartValue} from './chart-style';

/** Shared label spacing for professional charts; legacy authored layout is unchanged. */
export function chartLabelLayout(e:SlideElement,c:Chart){
  const fontSize=Math.max(18,Math.min(28,e.fontSize)),horizontal=c.type==='bar';
  const pad=e.w<420||e.h<250?12:24,automatic=Boolean(c.visual);
  const categoryWidth=Math.max(...c.labels.map(label=>inlineTextWidth(label,fontSize,e.fontFamily)));
  const values=[0,...c.series.flatMap(series=>series.values),...[c.axisRange?.min,c.axisRange?.max].filter((v):v is number=>v!==undefined)];
  const valueWidth=Math.max(...values.map(value=>inlineTextWidth(formatChartValue(c,value),fontSize,e.fontFamily)));
  const negativeLabelGutter=automatic&&horizontal&&c.showValues&&!c.stacked&&values.some(v=>v<0)?Math.min(e.w*.15,valueWidth+fontSize*.5):0;
  const baseLabelWidth=automatic?Math.min(e.w*(horizontal?.4:.34),Math.max(48,(horizontal?categoryWidth:valueWidth)+16)):horizontal?Math.min(e.w*.46,Math.max(200,categoryWidth+16)):80;
  const leftLabelWidth=baseLabelWidth+negativeLabelGutter;
  const availableWidth=Math.max(32,e.w-pad*2-leftLabelWidth-(c.showValues?fontSize*2.5:0));
  const availableHeight=Math.max(32,e.h-pad*2-(c.title?fontSize*1.8:0)-(c.subtitle?fontSize*1.6:0)-(c.source&&c.sourceDisplay!=='caption'?fontSize*1.8:0)-(c.legend&&c.series.length>1?fontSize*2:0)-fontSize*2.4);
  const capacity=horizontal?Math.max(1,Math.floor(availableHeight/(fontSize*1.5))):Math.max(1,Math.floor(availableWidth/Math.max(fontSize*1.6,Math.min(140,categoryWidth/2+12))));
  const step=automatic?Math.max(1,Math.ceil(c.labels.length/capacity)):1;
  const labelWidth=horizontal?baseLabelWidth-12:Math.max(32,availableWidth/Math.ceil(c.labels.length/step)-8);
  return {automatic,step,leftLabelWidth,labelWidth,negativeLabelGutter};
}
