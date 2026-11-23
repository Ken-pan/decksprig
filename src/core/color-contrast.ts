export function normalizeColor(value:string):string|undefined {
  if(!/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value))return;
  return value.length<6?'#'+value.slice(1).split('').map(c=>c+c).join(''):value;
}
export const mixColors=(a:string,b:string,t:number)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
export function compositeColor(value:string,background:string,opacity=1):string {
  const color=normalizeColor(value);if(!color)return background;
  return mixColors(background,color.slice(0,7),(color.length===9?parseInt(color.slice(7),16)/255:1)*opacity);
}
export function contrastRatio(a:string,b:string):number {
  const luminance=(hex:string)=>{const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
  const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}

/** Preserve authored alpha. Never make an invisible object visible to meet a target. */
export function readableTextColor(foreground:string,background:string,target=4.5,opacity=1,backdrop?:string):string {
  const color=normalizeColor(foreground);if(!color||opacity===0)return foreground;
  // A shape's group opacity applies after its fill and label are composited.
  const back=backdrop?compositeColor(background,backdrop,opacity):background;
  const ratio=(value:string)=>contrastRatio(backdrop?compositeColor(compositeColor(value,background),backdrop,opacity):compositeColor(value,background,opacity),back);
  if(ratio(color)>=target||color.slice(7)==='00')return foreground;
  const alpha=color.slice(7),black='#000000'+alpha,white='#ffffff'+alpha,end=ratio(black)>ratio(white)?black:white;
  if(ratio(end)<target)return end;
  // Binary search the same 1% steps, including integer RGB quantization.
  const blend=(step:number)=>mixColors(color,end,step/100)+alpha;
  let low=0,high=100;
  while(high-low>1){const mid=(low+high)>>1;if(ratio(blend(mid))>=target)high=mid;else low=mid;}
  return blend(high);
}
