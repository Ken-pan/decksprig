/** Spring preset approximations checked against native Slides audience captures.
 * The public transition enum does not expose physical coefficients. Keep these
 * separate from authoritative source metadata and playback duration.
 * Self-contained because the portable HTML player serializes this function. */
export function nativeSpringEasing(curve:string):string|undefined{
 let stiffness:number,damping:number,seconds:number;
 switch(curve){
  case 'GENTLE':stiffness=100;damping=15;seconds=1.0220937728881836;break;
  case 'QUICK':stiffness=300;damping=20;seconds=.744255542755127;break;
  case 'BOUNCY':stiffness=600;damping=15;seconds=.9582165479660034;break;
  case 'SLOW':stiffness=80;damping=20;seconds=1.2501229047775269;break;
  default:return;
 }
 // Zero initial velocity. The native solver uses critical damping for the
 // non-oscillating preset; oscillating presets must retain values above one.
 const decay=damping/2,frequency=Math.sqrt(stiffness),oscillation=Math.sqrt(Math.max(0,stiffness-decay*decay));
 const values=Array.from({length:2049},(_,i)=>{
  if(i===0)return 0;if(i===2048)return 1;
  const t=seconds*i/2048,value=decay<frequency?1-Math.exp(-decay*t)*(Math.cos(oscillation*t)+decay/oscillation*Math.sin(oscillation*t)):1-(1+frequency*t)*Math.exp(-frequency*t);
  return +value.toFixed(6);
 });
 return `linear(${values.join(',')})`;
}
