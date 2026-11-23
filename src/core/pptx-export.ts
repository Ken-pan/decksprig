import {nativePaint,nativeColor} from './pptx-color';
import {BRAND_NAME} from '../brand-name.js';
import {readableChartRange} from './chart-range';
import {chartLabelLayout} from './chart-layout';
import {tableAppearance,tablePresentation,tableCellStyle,tableCellBox,tableCellSpan,tableCellRuns} from './table-rendering';
import type {Deck} from './model';
import { chartFromElement, chartDescription, displayedChartSeries, isRoundChart,presentationChart } from './charts';
import {fitTableElement,tableRowHeights} from './table-fit';
import type {PptxFontLoader} from './pptx-fonts';
import {nativePptxUnits} from './pptx-units';
import {renderedPptxText} from './native-text-layout';
import {renderedPptxTextStyles} from './pptx-text-styles';
import {prepareTextSizing} from './text-layout-fonts';
import {prepareRegionFills} from './region-fill';
import {resourceCredits} from './resources';
import {yieldForInput} from './text-layout';
import {nativeImageFrame} from './image-framing';
import {lineLabelElement} from './line-label';
export type ImageDimensions = (src: string, name: string, id?: string) => Promise<{w:number;h:number}>;
const browserImageDimensions: ImageDimensions = (src,name) => new Promise((ok,no)=>{
  const image=new Image();image.onload=()=>ok({w:image.naturalWidth,h:image.naturalHeight});image.onerror=()=>no(new Error(`Cannot read image: ${name}`));image.src=src;
});
export async function buildPptx(deck: Deck, original = false, imageDimensions: ImageDimensions = browserImageDimensions,template=false,fontLoader?:PptxFontLoader,options:{nativeTextGeometry?:boolean}={}): Promise<Uint8Array> {
  if (!original&&!options.nativeTextGeometry) deck = await prepareTextSizing(deck);
  const authored=deck;
  const lineLabelIds=new Set<string>();
  if(!original)deck={...deck,slides:deck.slides.map(s=>({...s,elements:s.elements.flatMap(e=>{
    if(e.type!=='line'||!e.text||e.hidden)return [e];
    const id=e.id+':label';lineLabelIds.add(id);return [e,{...lineLabelElement(e),id,name:`${e.name} text`}];
  })}))};
  if (!original) deck = prepareRegionFills(deck);
  if(!original){
    const sizes=new Map<string,Promise<{w:number;h:number}>>();
    const slides=[];
    for(const slide of deck.slides){
      const elements=[];
      for(const e of slide.elements){
        if(e.type==='image'&&!e.hidden&&!e.sourceRegion&&e.src&&(e.fit==='crop'||e.imagePosition||e.imageZoom||e.imageSize)){
          if(!e.imageSize&&!sizes.has(e.src))sizes.set(e.src,imageDimensions(e.src,e.name,`${slide.id}:${e.id}`));
          const framed=nativeImageFrame(e,e.imageSize??await sizes.get(e.src)!);
          if(framed.w>0&&framed.h>0)elements.push(framed);
        }else elements.push(e);
      }
      slides.push({...slide,elements});
    }
    deck={...deck,slides};
  }
  if(!original)deck={...deck,slides:deck.slides.map(s=>({...s,elements:s.elements.map(e=>renderedPptxTextStyles(renderedPptxText(e)))}))};
  deck = nativePptxUnits(deck);
  if(deck.slides.some(s=>s.elements.some(e=>e.sourceRegion&&!s.source?.render&&!e.src)))throw new Error('Attach a source PDF to complete complex shape references before exporting.');
  deck={...deck,slides:deck.slides.map(s=>({...s,elements:s.elements.map(e=>e.sourceRegion&&s.source?.render?{...e,src:s.source.render,crop:e.sourceRegion}:e)}))};
  const {default: PptxGenJS} = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  const rasterPaths = new Map<string,string>();
  const imageData = (src:string) => {
    if (!src.startsWith('data:')) return {path:src};
    // PptxGenJS deduplicates by public path identity before generating its ZIP.
    // Data stays supplied, so this identity never causes file/network loading.
    // SVG has a separate preview path in the library and keeps its existing flow.
    const mime = /^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.exec(src)?.[1].toLowerCase();
    if (!mime) return {data:src};
    let path = rasterPaths.get(src);
    if (!path) { path = `deck-studio-embedded-${rasterPaths.size+1}.${mime}`; rasterPaths.set(src,path); }
    return {data:src,path};
  };
  pptx.defineLayout({name: 'DECK', width: deck.width / 96, height: deck.height / 96}); pptx.layout = 'DECK'; pptx.title = deck.title; pptx.subject = BRAND_NAME; pptx.author = BRAND_NAME;
  const c = (color: string) => nativeColor(color).color;
  const sourceSizes=new Map<string,Promise<{w:number;h:number}>>();
  let deadline = performance.now() + 8;
  for (const s of deck.slides) {
    if (performance.now() >= deadline) { await yieldForInput(); deadline = performance.now() + 8; }
    const slide = pptx.addSlide(); slide.background = nativePaint(s.background);
    slide.hidden = Boolean(s.hidden);
    const credits = original ? '' : resourceCredits({...deck, slides: [s]});
    const prototypeLinks = original ? [] : s.elements.filter(e => !e.hidden && e.type === 'prototype' && e.prototype).map(e => `Interactive prototype: ${e.prototype!.url}`);
    slide.addNotes([s.notes, credits ? `Sources and licenses\n${credits}` : '', ...prototypeLinks].filter(Boolean).join('\n\n'));
    if (original && s.source?.render) {
      const src=s.source.render;
      if(!sourceSizes.has(src))sourceSizes.set(src,imageDimensions(src,'Source reference',`${s.id}:source`));
      const size=await sourceSizes.get(src)!;
      if(!Number.isFinite(size.w)||!Number.isFinite(size.h)||size.w<=0||size.h<=0)throw new Error('Cannot read the source reference image. Attach the source PDF again before exporting.');
      const scale=Math.min(deck.width/size.w,deck.height/size.h),w=size.w*scale,h=size.h*scale;
      slide.addImage({...imageData(src),x:(deck.width-w)/192,y:(deck.height-h)/192,w:w/96,h:h/96});continue;
    }
    for (const raw of s.elements.filter(e => !e.hidden)) {
      const e=fitTableElement(raw);
      if (performance.now() >= deadline) { await yieldForInput(); deadline = performance.now() + 8; }
      const base = {x: e.x / 96, y: e.y / 96, w: e.w / 96, h: e.h / 96, rotate: e.rotation, objectName: e.id,altText:e.name, transparency: Math.round((1 - e.opacity) * 100)};
      if (e.type === 'text') {
        const text = e.runs?.length ? e.runs.map(r => ({text: r.text, options: {bold: r.bold, italic: r.italic, color: r.color ? c(r.color) : c(e.fill), fontSize: r.fontSize ? r.fontSize * .75 : e.fontSize * .75, fontFace: r.fontFamily || e.fontFamily}})) : e.text;
        slide.addText(text, {...base, fill:lineLabelIds.has(e.id)?{color:c(s.background)}:undefined, fontFace: e.fontFamily, fontSize: e.fontSize * .75, bold: e.fontWeight >= 600, italic: e.italic, strike:e.strikethrough, underline: e.underline ? {style: 'sng'} : undefined, color: c(e.fill), align: e.align, margin: 0, breakLine: false, valign: 'top', charSpacing: e.letterSpacing * .75, lineSpacingMultiple: e.lineHeight});
      } else if (e.type === 'image' && e.src) {
        const data = imageData(e.src);
        if (e.fit === 'contain' && !e.crop) {
          const dimensions = await imageDimensions(e.src,e.name,`${s.id}:${e.id}`);
          const scale = Math.min(base.w / dimensions.w, base.h / dimensions.h), w = dimensions.w * scale, h = dimensions.h * scale;
          slide.addImage({...data, ...base, x: base.x + (base.w - w) / 2, y: base.y + (base.h - h) / 2, w, h});
        } else if (e.fit === 'cover' && !e.crop) slide.addImage({...data, ...base, sizing:{type:'cover',w:base.w,h:base.h}});
        else slide.addImage({...data, ...base});
      } else if (e.type === 'rect' || e.type === 'ellipse' || e.type === 'diamond' || e.type === 'line') {
        const geometry=e.type==='line'&&e.h===1&&!e.line?{y:base.y+.5/96,h:0}:{};
        slide.addShape(e.type === 'ellipse' ? pptx.ShapeType.ellipse : e.type === 'diamond' ? pptx.ShapeType.diamond : e.type === 'line' ? pptx.ShapeType.line : e.radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {...base,...geometry, fill:nativePaint(e.type==='line'&&e.line?(e.stroke==='transparent'?e.fill:e.stroke):e.fill,e.opacity),line:{...nativePaint(e.stroke,e.opacity),width:e.strokeWidth*.75}});
      } else if (e.type === 'prototype' && e.prototype) {
        slide.addText(`${e.name}\n${e.prototype.url}`, {...base, fontFace: 'Arial', fontSize: 18, color: c(e.fill), hyperlink: {url: e.prototype.url}, margin: 12});
      } else if (e.type === 'table') {
        const p=tablePresentation(e,deck.designSystem);
        const rows=(e.cells??[]).map((row,i)=>Array.from({length:p.widths.length},(_,j)=>j).filter(j=>!tableCellSpan(p,i,j).covered).map(j=>{
          const span=tableCellSpan(p,i,j);
          const style=tableCellStyle(p,i,j),fill=nativePaint(style.background);
          type CellBorder={type:'none'|'dash'|'solid';pt:number;color:string};
          const box=tableCellBox(p,i,j),border=[box.edges.top,box.edges.right,box.edges.bottom,box.edges.left].map(edge=>({type:edge.width<=0||edge.color==='transparent'?'none':edge.style==='dashed'?'dash':'solid',pt:edge.width*.75,color:nativePaint(edge.color).color})) as [CellBorder,CellBorder,CellBorder,CellBorder],margin:[number,number,number,number]=[box.insets.top*.75,box.insets.right*.75,box.insets.bottom*.75,box.insets.left*.75];
          const rich=p.cellStyleIndex.get(`${i}:${j}`)?.runs;
          const content=rich?tableCellRuns(p,i,j,row[j]??'').flatMap(run=>run.text.replace(/\r\n?/g,'\n').split('\n').map((text,index,parts)=>({text,options:{breakLine:index<parts.length-1,fontFace:run.fontFamily,fontSize:run.fontSize===undefined?undefined:run.fontSize*.75,bold:run.fontWeight===undefined?undefined:run.fontWeight>=600,italic:run.italic,underline:run.underline?{style:'sng' as const}:run.underline===false?{style:'none' as const}:undefined,strike:run.strikethrough,...nativePaint(run.color??style.color),charSpacing:run.letterSpacing===undefined?undefined:run.letterSpacing*.75,subscript:run.baseline==='sub',superscript:run.baseline==='super'}}))):row[j]??'';
          return {text:content,options:{fill,fontFace:style.fontFamily,fontSize:parseFloat(style.fontSize)*.75,underline:style.textDecoration.includes('underline')?{style:'sng' as const}:undefined,strike:style.textDecoration.includes('line-through'),bold:style.fontWeight>=600,italic:style.fontStyle==='italic',...nativePaint(style.color),align:style.textAlign,valign:style.verticalAlign,border,margin,rowspan:span.rowSpan,colspan:span.columnSpan}};
        }));
        slide.addTable(rows,{...base,fontFace:e.fontFamily,fontSize:e.fontSize*.75,...nativePaint(p.text),colW:p.widths.map(w=>e.w*w/96),margin:p.padding*.75,rowH:p.heights?p.heights.map(h=>h*e.h/96):e.tableFit?tableRowHeights(e).map(h=>h/96):undefined,autoPage:false});
      } else if (e.type === 'chart') {
        const chart = presentationChart(e), series = displayedChartSeries(chart), heading = chart.title, size = Math.max(18, Math.min(28, e.fontSize)*.75);
        const type = chart.type === 'pie' ? pptx.ChartType.pie : chart.type === 'donut' ? pptx.ChartType.doughnut : chart.type === 'line' ? pptx.ChartType.line : chart.type === 'area' ? pptx.ChartType.area : pptx.ChartType.bar;
        const visibleSource=chart.sourceDisplay!=='caption'&&chart.source;
        const decimals=chart.numberFormat?.decimals,numberFormat=(chart.numberFormat?.grouping?'#,##':'')+'0'+(decimals!==undefined?(decimals?'.'+'0'.repeat(decimals):''):series.some(s=>s.values.some(v=>Math.abs(v-Math.round(v))>1e-8))?'.0#':'');
        const format = `${chart.prefix ? '"' + chart.prefix.replace(/"/g, '""') + '"' : ''}${numberFormat}${chart.numberFormat?.percent?'%':''}${chart.suffix ? '"' + chart.suffix.replace(/"/g, '""') + '"' : ''}`;
        const range=chart.axisRange?{...chart.axisRange,step:chart.axisRange.min!==undefined&&chart.axisRange.max!==undefined?readableChartRange([chart.axisRange.min,chart.axisRange.max]).step:undefined}:readableChartRange(series.flatMap(s=>s.values));
        const colors=[c((/^(?:#[\da-fA-F]{6}(?:[\da-fA-F]{2})?|transparent)$/.test(e.fill))?e.fill:chart.colors[0]),...chart.colors.slice(1).map(c)];
        const forecast=chart.forecastFrom!==undefined&&['line','area'].includes(chart.type);
        const data=series.map(s=>({name:s.name,labels:chart.labels,values:s.values}));
        const plotted=forecast?[
          ...data.map(s=>({...s,values:(s.values.map((v,i)=>i<chart.forecastFrom!?v:null) as number[])})),
          ...data.map(s=>({...s,name:s.name+' (forecast)',values:(s.values.map((v,i)=>i>=chart.forecastFrom!-1?v:null) as number[])})),
        ]:data;
        // Actual and forecast share one native line-chart and one pair of axes.
        // Series styling is applied in the fidelity pass, without combo-chart axes.
        slide.addChart(forecast?pptx.ChartType.line:type, plotted, {
          ...base, altText:chartDescription(chart), h: Math.max(.1, base.h - (visibleSource ? size * 1.8 / 72 : 0)),
          barDir: chart.type === 'bar' ? 'bar' : 'col', barGrouping: chart.stacked ? 'stacked' : ['line','area'].includes(chart.type)?'standard':'clustered', holeSize: chart.visual?.donutHole??60,firstSliceAng:chart.visual?.pieRotation??0,
          // The installed writer types list only minMax; OOXML and its writer support both orientations.
          catAxisOrientation:((chart.type==='bar'?!chart.categoryReverse:chart.categoryReverse)?'maxMin':'minMax') as 'minMax',valAxisOrientation:(chart.valueReverse?'maxMin':'minMax') as 'minMax',
          showValue: chart.showValues&&(!isRoundChart(chart)||chart.dataLabels?.valueMode==='value'||chart.dataLabels?.valueMode==='both'), showPercent: isRoundChart(chart)&&chart.showValues&&chart.dataLabels?.valueMode!=='value',
          showLegend: chart.legend, legendPos: chart.legendPosition==='top'?'t':chart.legendPosition==='right'?'r':chart.legendPosition==='left'?'l':'b', legendFontFace: e.fontFamily, legendFontSize: size, legendColor: c(chart.textColor),
          showTitle: Boolean(heading || chart.subtitle), title: [heading, chart.subtitle].filter(Boolean).join('\n'), titleFontFace: e.fontFamily, titleFontSize: size * 1.3, titleColor: c(chart.textColor),
          catAxisLabelFontFace: e.fontFamily, catAxisLabelFontSize: (chart.axisStyle?.fontSize??e.fontSize)*.75,catAxisLabelRotate:chart.axisStyle?.rotation,catAxisLabelColor: c(chart.textColor),catAxisLabelPos:chart.axisStyle?.showLabels===false?'none':undefined,
          catAxisLabelFrequency:String(chartLabelLayout(e,chart).step),
          valAxisLabelFontFace: e.fontFamily, valAxisLabelFontSize: (chart.axisStyle?.fontSize??e.fontSize)*.75,valAxisLabelPos:chart.axisStyle?.showLabels===false?'none':undefined, valAxisLabelColor: c(chart.textColor),
          fontSize:size,fontFace:e.fontFamily,dataLabelFontSize:chart.dataLabels?.fontSize?chart.dataLabels.fontSize*.75:size,dataLabelFontFace:e.fontFamily,dataLabelFormatCode:isRoundChart(chart)&&chart.dataLabels?.valueMode!=='value'&&chart.dataLabels?.valueMode!=='both'?'0'+((chart.dataLabels?.percentDecimals??chart.numberFormat?.decimals??2)?'.'+'0'.repeat(chart.dataLabels?.percentDecimals??chart.numberFormat?.decimals??2):'')+'%':format,dataLabelColor:c(chart.dataLabels?.color??chart.textColor),dataLabelFontBold:chart.dataLabels?.bold,dataLabelPosition:chart.dataLabels?.position==='inside'?(['line','area'].includes(chart.type)?'b':'ctr'):chart.dataLabels?.position==='outside'?(['line','area'].includes(chart.type)?'t':'outEnd'):chart.stacked?'ctr':'bestFit',
          valAxisMajorUnit:chart.type==='bar'?range.step:undefined,
          showLabel:false,showSerName:false,
          catAxisTitle: chart.categoryTitle, showCatAxisTitle: Boolean(chart.categoryTitle),
          valAxisTitle: chart.valueTitle, showValAxisTitle: Boolean(chart.valueTitle),
          valAxisMinVal:chart.axisRange?chart.axisRange.min:chart.type==='bar'?range.min:series.some(s=>s.values.some(v=>v<0))?undefined:0,valAxisMaxVal:chart.type==='bar'?range.max:chart.axisRange?.max,
          valAxisLabelFormatCode: format,
          valGridLine: {color: 'DDE4E1', style: chart.grid ? 'solid' : 'none'},
          chartColors:isRoundChart(chart)?colors:forecast?[...colors.slice(0,series.length),...colors.slice(0,series.length)]:colors.slice(0,series.length),
          lineDataSymbol: chart.visual?.pointSize===0?'none':'circle', lineSize: (chart.visual?.lineWidth??2.67)*.75, lineDataSymbolSize: Math.max(2,(chart.visual?.pointSize??6.67)*.75), lineSmooth: chart.visual?.smooth??false,
        });
        if (visibleSource) slide.addText(chart.source, {...base,objectName:e.id+':source', y: base.y + base.h - size * 1.8 / 72, h: size * 1.8 / 72, margin: 0, fontFace: e.fontFamily, fontSize: size * .8, ...nativePaint(chart.textColor,e.opacity)});
      }
    }
  }
  // JPEG bytes already carry compression. Deflating them twice adds CPU and
  // temporary buffers without a useful size reduction. Keep PNG/SVG handling,
  // then compress editable XML in the fidelity pass as before.
  const images=deck.slides.flatMap(s=>original&&s.source?.render?[s.source.render]:s.elements.filter(e=>!e.hidden&&e.type==='image'&&e.src).map(e=>e.src!));
  const jpegOnly=images.length>0&&images.every(src=>/^data:image\/jpe?g;/i.test(src)||(!src.startsWith('data:')&&/\.jpe?g$/i.test(src.split(/[?#]/,1)[0])));
  const bytes = await pptx.write({outputType:'uint8array',compression:!jpegOnly}) as Uint8Array;
  if (original) return bytes;
  const { preservePptxFidelity } = await import('./pptx-fidelity');
  const {enhancePptxTemplate}=await import('./pptx-template-structure');
  return enhancePptxTemplate(await preservePptxFidelity(bytes, deck, authored),deck,template,authored,fontLoader);
}
