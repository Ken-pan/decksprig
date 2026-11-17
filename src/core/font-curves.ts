export type FontPoint={x:number;y:number;onCurve?:boolean};
type Point=Pick<FontPoint,'x'|'y'>;
const middle=(a:Point,b:Point):Point=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const rounded=(p:Point,onCurve:boolean):FontPoint=>({x:Math.round(p.x),y:Math.round(p.y),onCurve});
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
/** Degree elevation plus the Bezier convex hull bounds the error, including rounding. */
export function quadraticContour(source:FontPoint[],tolerance=1):FontPoint[]{
  if(!source.length)return [];
  const result:FontPoint[]=[rounded(source[0],true)];
  function curve(p0:Point,p1:Point,p2:Point,p3:Point,depth=0){
    const q=rounded({x:(3*p1.x+3*p2.x-p0.x-p3.x)/4,y:(3*p1.y+3*p2.y-p0.y-p3.y)/4},false),start=rounded(p0,true),end=rounded(p3,true);
    const c1={x:(start.x+2*q.x)/3,y:(start.y+2*q.y)/3},c2={x:(end.x+2*q.x)/3,y:(end.y+2*q.y)/3};
    if(Math.max(distance(p0,start),distance(p1,c1),distance(p2,c2),distance(p3,end))<=tolerance){result.push(q,end);return;}
    if(depth>=16||result.length>65530)throw new Error('This CFF outline cannot be converted within the native font accuracy limit.');
    const a=middle(p0,p1),b=middle(p1,p2),c=middle(p2,p3),d=middle(a,b),e=middle(b,c),m=middle(d,e);curve(p0,a,d,m,depth+1);curve(m,e,c,p3,depth+1);
  }
  let previous=source[0];
  for(let i=1;i<source.length;i++){
    const point=source[i];
    if(point.onCurve){result.push(rounded(point,true));previous=point;}
    else{const second=source[i+1],end=i===source.length-2?source[0]:source[i+2];if(!second||second.onCurve||!end||!end.onCurve)throw new Error('This CFF contour is invalid.');curve(previous,point,second,end);previous=end;i+=2;}
  }
  if(result.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x< -32768||p.x>32767||p.y< -32768||p.y>32767))throw new Error('The CFF outline is too large for a native TrueType face.');
  return result;
}
