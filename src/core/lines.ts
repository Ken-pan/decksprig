import {createLinePaths} from './line-path';
export {lineGeometry,lineHit} from './line-path';
import {DEFAULT_LINE, type LineStyle} from './line-schema';
export {DEFAULT_LINE, type LineStyle} from './line-schema';
export const LINE_ROUTES: {value:LineStyle['route'];label:string}[] = [
  {value:'straight',label:'Straight'},{value:'elbow',label:'Elbow'},{value:'rounded',label:'Rounded elbow'},{value:'curve',label:'Curve'},
  {value:'arc',label:'Arc'},{value:'step',label:'Step'},{value:'zigzag',label:'Zigzag'},{value:'wave',label:'Wave'},
];
export const LINE_DASHES: {value:LineStyle['dash'];label:string}[] = [
  {value:'solid',label:'Solid'},{value:'dashed',label:'Dashed'},{value:'dotted',label:'Dotted'},{value:'short-dash',label:'Short dash'},
  {value:'long-dash',label:'Long dash'},{value:'dash-dot',label:'Dash dot'},{value:'dash-dot-dot',label:'Dash dot dot'},
];
export const LINE_ENDS: {value:LineStyle['end'];label:string}[] = [
  {value:'none',label:'None'},{value:'arrow',label:'Arrow'},{value:'open-arrow',label:'Open arrow'},{value:'stealth',label:'Stealth'},
  {value:'circle',label:'Dot'},{value:'circle-outline',label:'Ring'},{value:'square',label:'Square'},{value:'diamond',label:'Diamond'},{value:'bar',label:'Bar'},
];
type LinePreset={id:string;label:string;group:'Lines'|'Arrows'|'Connectors';style:LineStyle};
function presets():LinePreset[] { return [
  ['plain','Line','Lines',{}],['dash','Dashed','Lines',{dash:'dashed'}],['dot','Dotted','Lines',{dash:'dotted'}],
  ['dash-dot','Dash dot','Lines',{dash:'dash-dot'}],['long','Long dash','Lines',{dash:'long-dash'}],['wave','Wave','Lines',{route:'wave'}],
  ['zigzag','Zigzag','Lines',{route:'zigzag'}],['arc','Arc','Lines',{route:'arc'}],
  ['arrow','Arrow','Arrows',{end:'arrow'}],['double','Double arrow','Arrows',{start:'arrow',end:'arrow'}],
  ['open','Open arrow','Arrows',{end:'open-arrow'}],['stealth','Stealth arrow','Arrows',{end:'stealth'}],
  ['dashed-arrow','Dashed arrow','Arrows',{end:'arrow',dash:'dashed'}],['dot-arrow','Dot to arrow','Arrows',{start:'circle',end:'arrow'}],
  ['bar-arrow','Bar to arrow','Arrows',{start:'bar',end:'arrow'}],['curve-arrow','Curved arrow','Arrows',{route:'curve',end:'arrow'}],
  ['elbow','Elbow','Connectors',{route:'elbow',end:'arrow'}],['rounded','Rounded elbow','Connectors',{route:'rounded',end:'arrow'}],
  ['curve','Curve','Connectors',{route:'curve'}],['step','Step','Connectors',{route:'step',end:'open-arrow'}],
  ['two-way','Two-way elbow','Connectors',{route:'rounded',start:'arrow',end:'arrow'}],
  ['dependency','Dependency','Connectors',{route:'elbow',end:'open-arrow',dash:'dashed'}],
  ['association','Association','Connectors',{start:'circle-outline',end:'circle-outline'}],
  ['diamond','Diamond connector','Connectors',{route:'rounded',start:'diamond',end:'arrow'}],
].map(([id,label,group,style])=>({id,label,group,style:{...DEFAULT_LINE,...style as Partial<LineStyle>}})) as LinePreset[]; }
export const LINE_PRESETS=/* @__PURE__ */ presets();

/** Self-contained geometry shared by the editor, portable HTML and native PPTX paths. */
export function createLineGeometry(paths=createLinePaths()) {
  const {lineGeometry,lineHit}=paths;
  type Style = Partial<LineStyle>;
  type Line = {w:number;h:number;strokeWidth?:number;stroke?:string;fill?:string;line?:Style};
  type Point = {x:number;y:number};
  const n=(v:number)=>Math.round(v*1000)/1000;
  function lineDash(dash:Style['dash'],width=2):string {
    const patterns={solid:[],dashed:[4,3],dotted:[.01,2.5],'short-dash':[2,2],'long-dash':[8,3],'dash-dot':[5,2,.01,2],'dash-dot-dot':[5,2,.01,2,.01,2]};
    return (patterns[dash??'solid']??[]).map(v=>n(v*width)).join(' ');
  }
  function lineMarkup(e:Line,color?:string) {
    const g=lineGeometry(e),width=e.strokeWidth||2,ink=color??(e.stroke==='transparent'?e.fill:e.stroke)??'#26362c';
    // Colors originate in the validated document schema. Escape defensively for standalone callers.
    const safe=ink.replace(/[&<>"']/g,'');
    const s=e.line,size=Math.max(5,width*3)*(s?.markerSize??1);
    function marker(kind:Style['end'],p:Point,angle:number){
      if(!kind||kind==='none')return '';
      let d='';let fill=safe;
      if(kind==='arrow')d=`M 0 0 L ${-size} ${-size*.5} L ${-size} ${size*.5} Z`;
      if(kind==='open-arrow'){d=`M ${-size} ${-size*.5} L 0 0 L ${-size} ${size*.5}`;fill='none';}
      if(kind==='stealth')d=`M 0 0 L ${-size} ${-size*.5} L ${-size*.65} 0 L ${-size} ${size*.5} Z`;
      if(kind==='diamond')d=`M 0 0 L ${-size*.5} ${-size*.4} L ${-size} 0 L ${-size*.5} ${size*.4} Z`;
      if(kind==='square')d=`M 0 ${-size*.4} H ${-size*.8} V ${size*.4} H 0 Z`;
      if(kind==='bar'){d=`M 0 ${-size*.6} L 0 ${size*.6}`;fill='none';}
      const attrs=`stroke="${safe}" stroke-width="${Math.max(1,width*.8)}" stroke-linejoin="round"`;
      const body=kind==='circle'||kind==='circle-outline'?`<circle cx="${-size*.4}" cy="0" r="${size*.4}" fill="${kind==='circle'?safe:'none'}" ${attrs}/>`:`<path d="${d}" fill="${fill}" ${attrs}/>`;
      return `<g transform="translate(${n(p.x)} ${n(p.y)}) rotate(${n(angle)})">${body}</g>`;
    }
    return `<path d="${g.path}" fill="none" stroke="${safe}" stroke-width="${width}" stroke-linecap="${s?.dash==='dotted'?'round':s?.cap??'round'}" stroke-linejoin="round" stroke-dasharray="${s?.dashArray?.join(' ')??lineDash(s?.dash,width)}"/>${marker(s?.start,g.start,g.startAngle)}${marker(s?.end,g.end,g.endAngle)}`;
  }

  return {lineGeometry,lineDash,lineMarkup,lineHit};
}
export const {lineDash,lineMarkup}=/* @__PURE__ */ createLineGeometry();
