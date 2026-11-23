import {XMLBuilder, XMLParser} from 'fast-xml-parser';
import {nativeColor} from './pptx-color';
import type {Chart} from './chart-schema';
import type {SlideElement} from './model';
import {presentationChart} from './charts';

type Node = Record<string, any>;
const parser = new XMLParser({ignoreAttributes:false,preserveOrder:true,trimValues:false,parseTagValue:false});
const builder = new XMLBuilder({ignoreAttributes:false,preserveOrder:true,suppressEmptyNode:true});
const child = (nodes:Node[], name:string):Node[]|undefined => nodes.find(node=>name in node)?.[name];
function descendants(nodes:Node[], name:string):Node[][] {
  return nodes.flatMap(node=>Object.entries(node).flatMap(([key,value])=>Array.isArray(value)?[...(key===name?[value]:[]),...descendants(value,name)]:[]));
}
function paint(properties:Node[], value:string, opacity=1, text=false) {
  const pigment=nativeColor(value,opacity);
  const color:Node={'a:srgbClr':pigment.alpha===1?[]:[{'a:alpha':[],':@':{'@_val':Math.round(pigment.alpha*100000)}}],':@':{'@_val':pigment.color}};
  const fill=value==='transparent'?{'a:noFill':[]}:{'a:solidFill':[color]}, index=properties.findIndex(node=>['a:solidFill','a:noFill','a:gradFill','a:pattFill','a:grpFill'].some(key=>key in node));
  if(index>=0)properties.splice(index,1,fill);
  else {const line=properties.findIndex(node=>'a:ln' in node);properties.splice(line<0?0:line+(text?1:0),0,fill);}
}
function shape(properties:Node[], value:string, fill=true, opacity=1, lineWidth?:number) {
  if(fill)paint(properties,value,opacity);
  let line=child(properties,'a:ln');
  if(!line&&lineWidth){line=[];const index=properties.findIndex(node=>['a:effectLst','a:effectDag','a:scene3d','a:sp3d','a:extLst'].some(key=>key in node));properties.splice(index<0?properties.length:index,0,{'a:ln':line,':@':{'@_w':Math.round(lineWidth*9525)}});}
  if(line&&!line.some(node=>'a:noFill' in node))paint(line,value);
}
function seriesProperties(nodes:Node[]) {
  let properties=child(nodes,'c:spPr');
  if(!properties){properties=[];let index=0;for(let i=0;i<nodes.length;i++)if(['c:idx','c:order','c:tx'].some(key=>key in nodes[i]))index=i+1;nodes.splice(index,0,{'c:spPr':properties});}
  return properties;
}

/** Native chart paints use separate RGB and alpha, including markers, points
 * and text roles. Authored chart data and unrelated native parts stay intact. */
export function preserveNativeChartPaint(source:string, chart:Chart, font?:{family:string;size:number}):string {
  const label=chart.dataLabels?.color??chart.textColor;
  const document=parser.parse(source) as Node[];
  // Native consumers inherit the chart-wide text role here. Writing only each
  // visible label loses the role when another editor reopens the document.
  const space=descendants(document,'c:chartSpace')[0];
  if(space){
    const properties:Node={'a:defRPr':font?[{'a:latin':[],':@':{'@_typeface':font.family}}]:[],...(font?{':@':{'@_sz':Math.round(font.size*75)}}:{})};
    const global={'c:txPr':[{'a:bodyPr':[]},{'a:lstStyle':[]},{'a:p':[{'a:pPr':[properties]}]}]};
    const index=space.findIndex(node=>'c:txPr' in node);
    if(index>=0)space.splice(index,1,global);
    else {const before=space.findIndex(node=>['c:externalData','c:printSettings','c:userShapes','c:extLst'].some(key=>key in node));space.splice(before<0?space.length:before,0,global);}
  }
  const categoryPaint=chart.colorCategories&&chart.series.length===1&&['bar','column'].includes(chart.type);
  for(const [index,series] of descendants(document,'c:ser').entries()) {
    const color=chart.colors[(index%chart.series.length)%chart.colors.length];
    shape(seriesProperties(series),color,chart.type!=='line',chart.type==='area'?(chart.visual?.areaOpacity??.2):1,chart.type==='area'?(chart.visual?.lineWidth??2.67):undefined);
    for(const marker of descendants(series,'c:marker')){
      const properties=child(marker,'c:spPr');if(properties)shape(properties,color);
    }
    const colorAt=(point:number)=>categoryPaint?chart.colorCategories!.indexOf(chart.labels[point]):-1;
    if(categoryPaint){
      const before=series.findIndex(node=>['c:dLbls','c:trendline','c:errBars','c:cat','c:val'].some(key=>key in node));
      const existing=new Set(descendants(series,'c:dPt').map(point=>Number(point.find(node=>'c:idx' in node)?.[':@']?.['@_val'])));
      const paints=chart.labels.flatMap((_,point)=>existing.has(point)||colorAt(point)<0?[]:[{'c:dPt':[
        {'c:idx':[],':@':{'@_val':point}}, {'c:spPr':[]},
      ]}]);
      series.splice(before<0?series.length:before,0,...paints);
    }
    for(const point of descendants(series,'c:dPt')){
      const index=Number(point.find(node=>'c:idx' in node)?.[':@']?.['@_val']??0);
      const paletteIndex=chart.type==='pie'||chart.type==='donut'?index:colorAt(index);
      const paintColor=paletteIndex>=0?chart.colors[paletteIndex%chart.colors.length]:color;
      const properties=child(point,'c:spPr');
      if(!properties)continue;
      const outline=Boolean(categoryPaint&&paletteIndex>=0&&(chart.colorRoles?.[paletteIndex]==='background'||paintColor==='transparent'));
      shape(properties,outline?'transparent':paintColor,true,chart.type==='area'?(chart.visual?.areaOpacity??.2):1);
      if(outline)shape(properties,chart.textColor,false,1,2.5);
    }
  }
  function text(nodes:Node[], labels=false) {
    for(const node of nodes)for(const [key,value]of Object.entries(node)){
      if(!Array.isArray(value))continue;
      const isLabel=labels||key==='c:dLbls';
      if(['a:rPr','a:defRPr','a:endParaRPr'].includes(key))paint(value,isLabel?label:chart.textColor,1,true);
      else text(value,isLabel);
    }
  }
  text(document);
  return builder.build(document);
}

export function paintNativeChart(source:string,element:SlideElement):string {
  return preserveNativeChartPaint(source,presentationChart(element),{family:element.fontFamily,size:element.fontSize});
}
