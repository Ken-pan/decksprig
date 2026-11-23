import {nativeColorXml} from './pptx-color';
import {lineGeometry,lineDash} from './lines';
import type {SlideElement} from './model';
import {shapePath} from './shape-geometry';

/** DrawingML paths remain editable and use the same cubic corners as the canvas. */
export function customShapeXml(e: SlideElement): string {
  const tokens = (e.type==='line'?lineGeometry(e).path:shapePath(e)).match(/[MLCZ]|-?\d+(?:\.\d+)?/g)!;
  let i = 0, path = '';
  const point = () => `<a:pt x="${Math.round(Number(tokens[i++])*1000)}" y="${Math.round(Number(tokens[i++])*1000)}"/>`;
  while (i < tokens.length) {
    const command = tokens[i++];
    if (command === 'M') path += `<a:moveTo>${point()}</a:moveTo>`;
    else if (command === 'L') path += `<a:lnTo>${point()}</a:lnTo>`;
    else if (command === 'C') path += `<a:cubicBezTo>${point()}${point()}${point()}</a:cubicBezTo>`;
    else if (command === 'Z') path += '<a:close/>';
  }
  const markers=e.type==='line'&&e.line?lineMarkerXml(e):'';
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="w" b="h"/><a:pathLst><a:path w="${Math.round(e.w*1000)}" h="${Math.round(e.h*1000)}"${e.type==='line'?' fill="none"':''}>${path}</a:path>${markers}</a:pathLst></a:custGeom>`;
}
export function shadowXml(e: SlideElement): string {
  const s = e.shadow;
  if (!s || !s.opacity) return '';
  const direction = (Math.atan2(s.y,s.x)*180/Math.PI+360)%360;
  return `<a:effectLst><a:outerShdw blurRad="${Math.round(s.blur*9525)}" dist="${Math.round(Math.hypot(s.x,s.y)*9525)}" dir="${Math.round(direction*60000)}" algn="ctr" rotWithShape="1">${nativeColorXml(s.color,s.opacity)}</a:outerShdw></a:effectLst>`;
}

/** Editable DrawingML routes, dash rhythm and standard arrowhead semantics. */
export function lineStyleXml(e:SlideElement):string {
  const s=e.line,width=e.strokeWidth||2,color=e.stroke==='transparent'?e.fill:e.stroke;
  const dash=lineDash(s?.dash,1).split(' ').filter(Boolean).map(Number);
  const dashXml=dash.length?`<a:custDash>${Array.from({length:dash.length/2},(_,i)=>`<a:ds d="${Math.max(1,Math.round(dash[i*2]*100000))}" sp="${Math.round(dash[i*2+1]*100000)}"/>`).join('')}</a:custDash>`:'<a:prstDash val="solid"/>';
  return `<a:ln w="${Math.round(width*9525)}" cap="${s?.dash==='dotted'||(s?.cap??'round')==='round'?'rnd':s?.cap==='square'?'sq':'flat'}"><a:solidFill>${nativeColorXml(color,e.opacity,undefined,true)}</a:solidFill>${dashXml}<a:round/><a:headEnd type="none"/><a:tailEnd type="none"/></a:ln>`;
}

/** Marker outlines are separate filled subpaths so a dashed shaft keeps solid ends. */
function lineMarkerXml(e:SlideElement):string {
  const g=lineGeometry(e),size=Math.max(5,(e.strokeWidth||2)*3)*(e.line?.markerSize??1),half=(e.strokeWidth||2)*.4;
  type P={x:number;y:number};
  function marker(kind:NonNullable<SlideElement['line']>['start'],origin:P,angle:number):string {
    if(kind==='none')return '';
    const polygons:P[][]=[];
    const poly=(pairs:number[][])=>polygons.push(pairs.map(([x,y])=>({x,y})));
    const segment=(a:P,b:P)=>{const length=Math.hypot(b.x-a.x,b.y-a.y)||1,dx=-(b.y-a.y)/length*half,dy=(b.x-a.x)/length*half;polygons.push([{x:a.x+dx,y:a.y+dy},{x:b.x+dx,y:b.y+dy},{x:b.x-dx,y:b.y-dy},{x:a.x-dx,y:a.y-dy}]);};
    if(kind==='arrow')poly([[0,0],[-size,-size*.5],[-size,size*.5]]);
    if(kind==='stealth')poly([[0,0],[-size,-size*.5],[-size*.65,0],[-size,size*.5]]);
    if(kind==='diamond')poly([[0,0],[-size*.5,-size*.4],[-size,0],[-size*.5,size*.4]]);
    if(kind==='square')poly([[0,-size*.4],[-size*.8,-size*.4],[-size*.8,size*.4],[0,size*.4]]);
    if(kind==='bar')segment({x:0,y:-size*.6},{x:0,y:size*.6});
    if(kind==='open-arrow'){segment({x:-size,y:-size*.5},{x:0,y:0});segment({x:0,y:0},{x:-size,y:size*.5});}
    if(kind==='circle'||kind==='circle-outline'){
      const circle=(r:number,reverse=false)=>Array.from({length:48},(_,i)=>{const a=(reverse?-1:1)*i/48*Math.PI*2;return {x:-size*.4+Math.cos(a)*r,y:Math.sin(a)*r};});
      polygons.push(circle(size*.4+half));if(kind==='circle-outline')polygons.push(circle(Math.max(.1,size*.4-half),true));
    }
    const a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),point=(p:P)=>`<a:pt x="${Math.round((origin.x+p.x*c-p.y*s)*1000)}" y="${Math.round((origin.y+p.x*s+p.y*c)*1000)}"/>`;
    const path=polygons.map(points=>`<a:moveTo>${point(points[0])}</a:moveTo>${points.slice(1).map(p=>`<a:lnTo>${point(p)}</a:lnTo>`).join('')}<a:close/>`).join('');
    return `<a:path w="${Math.round(e.w*1000)}" h="${Math.round(e.h*1000)}" fill="norm" stroke="0">${path}</a:path>`;
  }
  return marker(e.line!.start,g.start,g.startAngle)+marker(e.line!.end,g.end,g.endAngle);
}
