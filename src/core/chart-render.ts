import {compositeColor} from './color-contrast';
import { init, use, type EChartsCoreOption } from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TitleComponent, GraphicComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import {LabelLayout} from 'echarts/features';
import { chartFromElement, chartDescription, displayedChartSeries,presentationChart } from './charts';
import {formatChartValue} from './chart-style';
import {chartLabelLayout} from './chart-layout';
import {renderEditableChartText,renderStaticChartSvg} from './chart-text-render';
import {interactiveChartSvg} from './chart-points';
import type {ChartDragGeometry} from './chart-drag';
import type { SlideElement } from './model';
import { fontStack } from './fonts';
use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TitleComponent, GraphicComponent, SVGRenderer,LabelLayout]);
const cache = new Map<string, string>();
function labelColor(hex: string,background:string) {
  hex=compositeColor(hex,compositeColor(background,'#ffffff'));
  const components = hex.replace('#', '').match(/../g)!.map(v => {const n = parseInt(v, 16) / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;});
  const luminance = components[0] * .2126 + components[1] * .7152 + components[2] * .0722;
  return luminance > .179 ? '#000000' : '#FFFFFF';
}
export function chartOption(e: SlideElement,fontCategory?:string,background='#ffffff'): EChartsCoreOption {
  const c = presentationChart(e), series = displayedChartSeries(c), round = c.type === 'pie' || c.type === 'donut', horizontal = c.type === 'bar';
  const fontSize = Math.max(18, Math.min(28,e.fontSize));
  const family = fontStack(e.fontFamily,fontCategory),axisSize=c.axisStyle?.fontSize??fontSize,labelSize=c.dataLabels?.fontSize??fontSize;
  const compact = e.w < 420 || e.h < 250, pad = compact ? 12 : 24;
  const format = (v: string | number) => formatChartValue(c,Number(v));
  const visibleSource=c.sourceDisplay!=='caption'&&c.source;const showLegend=c.legend&&(round||c.series.length>1||c.legendPosition!==undefined);const heading=c.title;
  const legendPosition=c.legendPosition??'auto',sideLegend=showLegend&&['left','right'].includes(legendPosition),legendWidth=sideLegend?Math.min(e.w*.32,Math.max(100,fontSize*8)):0,legendHeight=showLegend&&(!sideLegend)?fontSize*2:0;
  const top = (legendPosition==='top'?legendHeight:0) + pad + (heading ? fontSize * 1.8 : 0) + (c.subtitle ? fontSize * 1.6 : 0);
  const bottom = pad + (visibleSource ? fontSize * 1.8 : 0) + (legendPosition!=='top'&&!sideLegend ? legendHeight : 0);
  const colors = [/^#[\da-fA-F]{6}$/.test(e.fill) ? e.fill : c.colors[0], ...c.colors.slice(1)];
  const layout=chartLabelLayout({...e,fontSize:axisSize},c);
  const common = {animation: false, backgroundColor: 'transparent', color: colors, textStyle: {fontFamily: family, fontSize, color: c.textColor},
    title: {triggerEvent:true,text: heading, subtext: c.subtitle, left: pad, top: pad, textStyle: {fontSize: fontSize * 1.3, fontWeight: 600, color: c.textColor, width: e.w - pad * 2, overflow: 'truncate'}, subtextStyle: {fontWeight:400,fontSize, color: c.textColor, width: e.w - pad * 2, overflow: 'truncate'}},
    legend: {show:showLegend, selectedMode: false, itemGap:Math.max(24,fontSize*1.5), orient:sideLegend?'vertical':'horizontal',top:legendPosition==='top'?top-legendHeight:sideLegend?top:undefined,bottom:legendPosition==='top'||sideLegend?undefined:pad + (visibleSource ? fontSize * 1.8 : 0), left:legendPosition==='left'?pad:legendPosition==='right'?undefined:'center',right:legendPosition==='right'?pad:undefined,width:sideLegend?legendWidth-pad:undefined,height:sideLegend?Math.max(40,e.h-top-bottom):undefined, itemWidth: fontSize*.75, itemHeight: fontSize * .5, textStyle: {fontSize, color: c.textColor}, data: round ? c.labels : c.series.map(s => s.name)},
    graphic: visibleSource ? [{name:'deck-chart-source',type: 'text', left: pad, bottom: pad, style: {text: c.source, fill: c.textColor, fontFamily:family,fontSize:Math.max(18,fontSize*.8), width: e.w - pad * 2, overflow: 'truncate'}}] : []};
  if (round) {
    const total=series[0].values.reduce((a,b)=>a+b,0),footer=pad+(visibleSource?axisSize*1.8:0),plotTop=top+fontSize*.5;
    const valueIsShare=Boolean(c.numberFormat?.percent)&&Math.abs(total-1)<1e-8||!c.prefix&&c.suffix.trim()==='%'&&Math.abs(total-100)<1e-8;
    const detail=(value:number)=>valueIsShare?format(value):format(value)+' · '+(value/total*100).toFixed(1)+'%';
    const side=c.legend&&e.w>=480&&legendPosition==='auto',plotBottom=e.h-footer-(c.legend&&!side&&!sideLegend&&legendPosition!=='top'?fontSize*3:0),plotHeight=Math.max(80,plotBottom-plotTop);
    const chartWidth=side?e.w*.54:e.w-legendWidth,cx=chartWidth/2+(legendPosition==='left'?legendWidth:0),cy=plotTop+plotHeight/2,radius=Math.max(24,Math.min(plotHeight*.43,chartWidth*.38));
    const rowHeight=fontSize*2.5,capacity=Math.max(1,Math.floor((plotHeight-fontSize)/rowHeight)),visible=c.labels.slice(0,capacity),legendX=e.w*.57;
    const details=side?visible.flatMap((name,i)=>{const y=plotTop+i*rowHeight;return [{type:'rect',left:legendX,top:y+4,shape:{width:12,height:12,r:2},style:{fill:colors[i%colors.length]}},{name:`deck-chart-category-${i}`,type:'text',left:legendX+24,top:y,style:{text:name,fill:c.textColor,fontFamily:family,fontSize,width:e.w-legendX-pad-24,overflow:'truncate'}},{type:'text',left:legendX+24,top:y+fontSize*1.25,style:{text:detail(series[0].values[i]),fill:c.textColor,fontFamily:family,fontSize:Math.max(16,fontSize*.8)}}];}):[];
    if(side&&visible.length<c.labels.length)details.push({type:'text',left:legendX+24,top:plotTop+visible.length*rowHeight,style:{text:`+ ${c.labels.length-visible.length} more categories`,fill:c.textColor,fontFamily:family,fontSize:Math.max(16,fontSize*.8)}});
    const hole=(c.visual?.donutHole??58)/100;
    return {...common,legend:side?{show:false}:{...common.legend,show:c.legend,bottom:legendPosition==='auto'||legendPosition==='bottom'?footer:undefined,width:sideLegend?legendWidth-pad:e.w-pad*2,itemGap:16},graphic:[...(common.graphic as unknown[]),...details,...(c.type==='donut'?[{type:'text',x:cx,y:cy,style:{text:'Total\n'+format(total),align:'center',verticalAlign:'middle',fill:c.textColor,fontFamily:family,fontSize,lineHeight:fontSize*1.35,width:radius*hole*2,overflow:'truncate'}}]:[])],series:[{type:'pie',percentPrecision:c.dataLabels?.percentDecimals??c.numberFormat?.decimals??2,startAngle:90-(c.visual?.pieRotation??0),center:[cx,cy],radius:c.type==='donut'?[radius*hole,radius]:radius,silent:true,avoidLabelOverlap:true,label:{show:c.showValues,position:c.dataLabels?.position&&c.dataLabels.position!=='auto'?c.dataLabels.position:c.legend?'inside':'outside',formatter:c.dataLabels?.valueMode?((p:{name:string;value:number;percent:number})=>{const share=formatChartValue({...c,prefix:'',suffix:'%',numberFormat:{...c.numberFormat,percent:false,decimals:c.dataLabels?.percentDecimals??c.numberFormat?.decimals}},p.percent);return c.dataLabels?.valueMode==='value'?format(p.value):c.dataLabels?.valueMode==='both'?`${format(p.value)} (${share})`:share;}):c.legend?'{d}%':'{b}: {d}%',fontSize:c.dataLabels?.fontSize??(c.legend?Math.max(14,fontSize*.7):fontSize),fontWeight:c.dataLabels?.bold?700:400,color:c.dataLabels?.color??c.textColor},data:c.labels.map((name,i)=>({name,value:series[0].values[i],label:c.legend&&c.dataLabels?.position!=='outside'?{color:c.dataLabels?.color??labelColor(colors[i%colors.length],background)}:undefined})),itemStyle:{borderWidth:c.visual?0:2,borderColor:c.textColor}}]};
  }
  const categoryAxis = {triggerEvent:true,inverse:Boolean(c.categoryReverse),type: 'category', data: c.labels, name: c.categoryTitle, nameLocation: 'middle', nameGap: fontSize * 2.8+(c.axisStyle?.rotation?axisSize:0), nameTextStyle: {color: c.textColor, fontSize},
    axisLabel: {show:c.axisStyle?.showLabels??true,color: c.textColor, fontSize:axisSize,rotate:c.axisStyle?.rotation??0, interval:layout.step>1?(index:number)=>index===0||index===c.labels.length-1||index%layout.step===0&&(c.labels.length-1-index>=layout.step):0,lineHeight:axisSize*1.2,width:layout.automatic?layout.labelWidth:horizontal?layout.leftLabelWidth:Math.max(32,(e.w-pad*3)/c.labels.length-8),height:layout.automatic?axisSize*1.2*(horizontal?1:3):undefined,overflow:horizontal&&layout.automatic?'truncate':'break',hideOverlap:layout.automatic,margin:8+layout.negativeLabelGutter+(c.axisStyle?.rotation?axisSize:0),showMinLabel:layout.automatic?true:undefined,showMaxLabel:layout.automatic?true:undefined}, axisTick: {show: false}, axisLine: {lineStyle: {color: c.textColor, opacity: .3}}, boundaryGap: c.type === 'column' || horizontal};
  const valueAxis = {triggerEvent:true,inverse:Boolean(c.valueReverse),type: 'value',min:c.axisRange?.min,max:c.axisRange?.max, name: c.valueTitle,nameLocation:'middle',nameGap:fontSize*2.4, nameTextStyle: {color: c.textColor, fontSize},splitNumber:horizontal?2:4, scale: false, axisLabel: {show:c.axisStyle?.showLabels??true,color: c.textColor, fontSize:axisSize, formatter: format,hideOverlap:true}, splitLine: {show: c.grid, lineStyle: {color: c.textColor, opacity: c.visual?.preset==='report'?.14:.1,type:'dashed'}}, axisLine: {show: false}, axisTick: {show: false}};
  const line=c.type==='line'||c.type==='area';
  const categoryPaint = c.colorCategories && c.series.length === 1 && (horizontal || c.type === 'column');
  const labelWidth=layout.leftLabelWidth;
  const labelLines=horizontal?1:Math.min(3,Math.max(...c.labels.map(l=>Math.ceil(l.length*axisSize*.55/Math.max(32,(e.w-140)/c.labels.length)))));
  const nativeSeries=c.series.flatMap((s,i)=>c.forecastFrom!==undefined&&['line','area'].includes(c.type)?[{...s,name:s.name,values:s.values.map((v,j)=>j<c.forecastFrom!?v:null),forecast:false,color:colors[i%colors.length]},{...s,name:s.name+' (forecast)',values:s.values.map((v,j)=>j>=c.forecastFrom!-1?v:null),forecast:true,color:colors[i%colors.length]}]:[{...s,forecast:false,color:colors[i%colors.length]}]);
  return {...common, grid: {left:pad+(horizontal&&c.axisStyle?.rotation?axisSize:0)+(legendPosition==='left'?legendWidth:0)+labelWidth+(c.valueTitle&&!horizontal?fontSize*2:0), right: pad + (legendPosition==='right'?legendWidth:0) + (c.showValues ? labelSize * 2.5 : 0), top: top + Math.max(fontSize,c.showValues?labelSize:0), bottom: bottom + axisSize*1.4*labelLines+(Math.abs(c.axisStyle?.rotation??0)>0?axisSize*1.8:0)+(c.categoryTitle||c.valueTitle&&horizontal?fontSize*2.5:0),containLabel:false},
    xAxis: horizontal ? valueAxis : categoryAxis, yAxis: horizontal ? {...categoryAxis, inverse: !c.categoryReverse} : valueAxis,
    series: nativeSeries.map((s, i) => ({name: s.name, type: c.type === 'line' || c.type === 'area' ? 'line' : 'bar', data: s.values.map((value,index)=>{
        if(value===null)return value;
        if(line)return c.showValues&&(index===0||index===s.values.length-1)
          ? {value,label:{align:index===0?'left':'right'}} : value;
        const paletteIndex=categoryPaint?c.colorCategories!.indexOf(c.labels[index]):-1;
        const color=paletteIndex>=0?colors[paletteIndex%colors.length]:undefined;
        const outline=paletteIndex>=0&&(c.colorRoles?.[paletteIndex]==='background'||color==='transparent');
        const itemStyle=outline?{color:'transparent',borderColor:c.textColor,borderWidth:2.5}:color?{color}:undefined;
        const label=c.dataLabels?.position==='inside'&&!c.dataLabels.color&&color?{color:labelColor(outline?'transparent':color,background)}:undefined;
        if(value<0&&!c.stacked&&(!c.dataLabels?.position||c.dataLabels.position==='auto')){
          const r=c.visual?.cornerRadius;
          return {value,label:{position:horizontal?'left':'bottom'},itemStyle:{...itemStyle,borderRadius:r?(horizontal?[r,0,0,r]:[0,0,r,r]):undefined}};
        }
        return itemStyle?{value,itemStyle,label}:value;
      }), silent: true, stack: c.stacked ? 'total' : undefined,
      barMaxWidth: 64, barMinHeight: 0, symbol: 'circle', symbolSize: c.visual?.pointSize??7, showSymbol:(c.visual?.pointSize??7)>0, smooth: c.visual?.smooth??false, lineStyle: {width: c.visual?.lineWidth??3,type:s.forecast?'dashed':'solid',color:s.color},itemStyle:{color:s.color,borderRadius:c.stacked?0:c.type==='bar'?[0,c.visual?.cornerRadius??0,c.visual?.cornerRadius??0,0]:[c.visual?.cornerRadius??0,c.visual?.cornerRadius??0,0,0]}, areaStyle: c.type === 'area' ? {opacity: c.visual?.areaOpacity??.2} : undefined,
      labelLayout:line&&c.showValues
        ? ({dataIndex}:{dataIndex:number})=>({hideOverlap:layout.automatic,dx:dataIndex===0?20:0})
        : {hideOverlap:layout.automatic},
      label: {show: c.showValues, position: c.dataLabels?.position==='inside'?(['line','area'].includes(c.type)?'bottom':'inside'):c.dataLabels?.position==='outside'?(horizontal?'right':'top'):c.stacked ? 'inside' : horizontal ? 'right' : 'top', color:c.dataLabels?.color??(!['line','area'].includes(c.type)&&(c.dataLabels?.position==='inside'||c.stacked&&c.dataLabels?.position!=='outside')?labelColor(colors[i % colors.length],background):c.textColor),fontSize:c.dataLabels?.fontSize??fontSize,fontWeight:c.dataLabels?.bold?700:400,formatter: (p: {value: number}) => format(p.value)}}))};
}
export function renderChartSvg(element: SlideElement,interactive=false,fontCategory?:string,background='#ffffff'): string {
  // Bound render work independently of canvas geometry; SVG scales back to the object's size.
  const scale = Math.min(1, 2400 / element.w, 1600 / element.h);
  const e = {...element, w: Math.max(160, element.w * scale), h: Math.max(120, element.h * scale)};
  const key = JSON.stringify([e.chart, e.values, e.w, e.h, e.fontSize, e.fontFamily, e.fill, e.name,interactive,fontCategory,background]);
  if (cache.has(key)) return cache.get(key)!;
  const chart = init(null, undefined, {renderer: 'svg', ssr: true, width: e.w, height: e.h});
  try {
    const option=chartOption(e,fontCategory,background),data=chartFromElement(e);
    if(interactive&&['line','area'].includes(data.type)&&(data.visual?.pointSize??7)===0){
      for(const series of option.series as {showSymbol?:boolean;symbolSize?:number;itemStyle?:Record<string,unknown>}[]){series.showSymbol=true;series.symbolSize=6;series.itemStyle={...series.itemStyle,opacity:0};}
    }
    chart.setOption(option);
    let svg = interactive?renderEditableChartText(chart,data):renderStaticChartSvg(chart);
    const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    // Currency labels may contain $1 or $&; a callback keeps them literal.
    svg = svg.replace(/<svg\b/, '<svg role="img"').replace(/(<svg[^>]*>)/, (_match,opening:string)=>`${opening}<title>${escape(chartDescription(chartFromElement(e)))}</title>`);
    if(interactive){
      let geometry:ChartDragGeometry;
      if(data.type==='pie'||data.type==='donut'){
        const s=(option.series as {center:number[];radius:number|number[]}[])[0];geometry={kind:'radial',cx:s.center[0],cy:s.center[1],radius:Array.isArray(s.radius)?s.radius[1]:s.radius,total:data.series[data.pieSeries??0].values.reduce((a,b)=>a+b,0)};
      }else{
        const horizontal=data.type==='bar',grid=option.grid as {left:number;right:number;top:number;bottom:number},finder=horizontal?{xAxisIndex:0}:{yAxisIndex:0},pixelMin=horizontal?grid.left:e.h-grid.bottom,pixelMax=horizontal?e.w-grid.right:grid.top;
        const a=Number(chart.convertFromPixel(finder,pixelMin)),b=Number(chart.convertFromPixel(finder,pixelMax));
        geometry=a<=b?{kind:'axis',horizontal,min:a,max:b,pixelMin,pixelMax}:{kind:'axis',horizontal,min:b,max:a,pixelMin:pixelMax,pixelMax:pixelMin};
      }
      svg=interactiveChartSvg(svg,data).replace('<svg ',()=>`<svg data-chart-drag="${escape(JSON.stringify(geometry))}" `);
    }
    cache.set(key, svg); if (cache.size > 48) cache.delete(cache.keys().next().value!);
    return svg;
  } finally { chart.dispose(); }
}
export const chartSvgUrl = (e: SlideElement) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderChartSvg(e))}`;

export const chartAlt = (e: SlideElement) => chartDescription(chartFromElement(e));
