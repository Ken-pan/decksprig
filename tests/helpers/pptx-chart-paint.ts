import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import {XMLParser,XMLBuilder} from 'fast-xml-parser';
import type {Chart} from '../../src/core/chart-schema';

/** A native producer fixture without Decksprig metadata or source snapshots. */
export async function nativeChartPaintSource(type:Chart['type']='column') {
  const p=new PptxGenJS();p.layout='LAYOUT_WIDE';const slide=p.addSlide();slide.background={color:'F8EBD8'};
  const round=type==='pie'||type==='donut',kind=type==='column'||type==='bar'?p.ChartType.bar:type==='donut'?p.ChartType.doughnut:type==='pie'?p.ChartType.pie:type==='area'?p.ChartType.area:p.ChartType.line;
  slide.addChart(kind,[{name:'Indigo',labels:['A','B','C'],values:[10,20,15]},...round?[]:[{name:'Rose',labels:['A','B','C'],values:[18,12,24]}]],{x:1,y:1,w:10,h:5,barDir:type==='bar'?'bar':'col',chartColors:['A11001','A11002','A11003'],fontFace:'Arial',fontSize:18,showLegend:true,legendColor:'C11001',showValue:true,dataLabelColor:'C11002',catAxisLabelColor:'C11001',valAxisLabelColor:'C11001',showTitle:true,title:'Native paint',titleColor:'C11001'});
  const background=p.addSlide();background.background={color:'B11001'};background.addShape(p.ShapeType.rect,{x:.5,y:.5,w:1,h:1,fill:{color:'FFFFFF'},line:{color:'FFFFFF'}});background.addNotes('Retain original source and alpha.');
  const zip=await JSZip.loadAsync(await p.write({outputType:'uint8array'}) as Uint8Array);
  const paints:Record<string,[string,string]>={A11001:['4F63E7','<a:alpha val="60000"/><a:alphaMod val="50000"/><a:alphaOff val="20000"/><a:alphaMod val="50000"/>'],A11002:['BF3584','<a:alpha val="0"/><a:alphaOff val="50000"/>'],A11003:['178161','<a:alpha val="0"/>'],B11001:['4F63E7','<a:alpha val="50000"/>'],C11001:['26362C','<a:alpha val="75000"/>'],C11002:['BF3584','<a:alpha val="50000"/>']};
  for(const file of Object.values(zip.files).filter(f=>/^ppt\/(slides|charts)\/.*\.xml$/.test(f.name))){
    let source=await file.async('string');
    if(file.name.startsWith('ppt/charts/')){
      const tx='<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1800"><a:solidFill><a:srgbClr val="C11001"/></a:solidFill><a:latin typeface="Arial"/></a:defRPr></a:pPr></a:p></c:txPr>';
      const parser=new XMLParser({ignoreAttributes:false,preserveOrder:true,trimValues:false,parseTagValue:false}),document=parser.parse(source),space=document.find((node:any)=>node['c:chartSpace'])['c:chartSpace'];
      const index=space.findIndex((node:any)=>'c:txPr' in node),text=parser.parse(tx)[0];
      if(index>=0)space.splice(index,1,text);else {const before=space.findIndex((node:any)=>'c:externalData' in node||'c:printSettings' in node);space.splice(before<0?space.length:before,0,text);}
      source=new XMLBuilder({ignoreAttributes:false,preserveOrder:true,suppressEmptyNode:true}).build(document);
    }
    for(const [marker,[rgb,operations]]of Object.entries(paints))source=source.replaceAll(new RegExp(`<a:srgbClr val="${marker}"(?:\\s*/>|>[\\s\\S]*?</a:srgbClr>)`,'g'),`<a:srgbClr val="${rgb}">${operations}</a:srgbClr>`);
    zip.file(file.name,source);
  }
  return zip.generateAsync({type:'uint8array'});
}
