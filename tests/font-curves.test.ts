import test from 'node:test';
import assert from 'node:assert/strict';
import {quadraticContour,type FontPoint} from '../src/core/font-curves';
const cubic=(a:FontPoint,b:FontPoint,c:FontPoint,d:FontPoint,t:number)=>({x:(1-t)**3*a.x+3*(1-t)**2*t*b.x+3*(1-t)*t*t*c.x+t**3*d.x,y:(1-t)**3*a.y+3*(1-t)**2*t*b.y+3*(1-t)*t*t*c.y+t**3*d.y});
function distance(p:FontPoint,a:FontPoint,b:FontPoint){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}

test('CFF degree elevation returns the exact original integer quadratic',()=>{
  const result=quadraticContour([{x:0,y:0,onCurve:true},{x:500/3,y:2000/3},{x:500,y:2000/3},{x:1000,y:0,onCurve:true}]);
  assert.deepEqual(result,[{x:0,y:0,onCurve:true},{x:250,y:1000,onCurve:false},{x:1000,y:0,onCurve:true}]);
});

test('adaptive CFF curves remain within one font unit of independent dense cubic reference paths',()=>{
  const curves=[[[0,0],[0,1800],[1600,-1800],[1600,0]],[[0,0],[1200,1200],[-1200,1200],[0,0]],[[-800,-600],[1200,-900],[-1000,1800],[1000,1200]]];
  for(const coordinates of curves){
    const [a,b,c,d]=coordinates.map(([x,y],i)=>({x,y,onCurve:i===0||i===3})),reference=Array.from({length:8193},(_,i)=>cubic(a,b,c,d,i/8192)),result=quadraticContour([a,b,c,d]);
    for(let i=1;i<result.length;i+=2){const p0=result[i-1],q=result[i],p1=result[i+1];for(let j=0;j<=8;j++){const t=j/8,p={x:(1-t)**2*p0.x+2*(1-t)*t*q.x+t*t*p1.x,y:(1-t)**2*p0.y+2*(1-t)*t*q.y+t*t*p1.y};let error=Infinity;for(let k=1;k<reference.length;k++)error=Math.min(error,distance(p,reference[k-1],reference[k]));assert(error<=1.01,`Curve error ${error}`);}}
  }
});

test('invalid and unrepresentable contours fail instead of emitting corrupt glyphs',()=>{
  assert.throws(()=>quadraticContour([{x:0,y:0,onCurve:true},{x:1,y:1},{x:2,y:2,onCurve:true}]),/invalid/);
  assert.throws(()=>quadraticContour([{x:100000,y:0,onCurve:true},{x:100100,y:0,onCurve:true}]),/too large/);
});
