/** A slide background is a visual layer, separate from its editable foreground. */
export function figmaBackgroundSvg(fills:any[],assets:Record<string,string>,width:number,height:number):string|undefined {
  const visible=fills.filter(p=>p.visible!==false);if(!visible.some(p=>p.type!=='SOLID'))return;
  const color=(c:any)=>`rgb(${[c.r,c.g,c.b].map(v=>Math.round(Math.min(1,Math.max(0,v))*255)).join(',')})`;
  const defs:string[]=[],layers:string[]=[];
  for(const [i,p]of visible.entries()){
    let fill='none';
    if(p.type==='SOLID')fill=color(p.color);
    else if(['GRADIENT_LINEAR','GRADIENT_RADIAL'].includes(p.type)){
      const m=p.gradientTransform??[[1,0,0],[0,1,0]],d=m[0][0]*m[1][1]-m[0][1]*m[1][0];if(Math.abs(d)<1e-9)return;
      const matrix=[m[1][1]/d,-m[1][0]/d,-m[0][1]/d,m[0][0]/d,(m[0][1]*m[1][2]-m[1][1]*m[0][2])/d,(m[1][0]*m[0][2]-m[0][0]*m[1][2])/d].join(' '),tag=p.type==='GRADIENT_LINEAR'?'linearGradient':'radialGradient',coords=p.type==='GRADIENT_LINEAR'?'x1="0" y1="0.5" x2="1" y2="0.5"':'cx="0.5" cy="0.5" r="0.5"';
      defs.push(`<${tag} id="g${i}" ${coords} gradientTransform="matrix(${matrix})">${p.gradientStops.map((s:any)=>`<stop offset="${s.position}" stop-color="${color(s.color)}" stop-opacity="${s.color.a??1}"/>`).join('')}</${tag}>`);fill=`url(#g${i})`;
    }else if(p.type==='IMAGE'){
      const src=assets[p.imageHash??p.imageRef];if(!src||!/^data:image\//.test(src))return;
      const filters=p.filters??{},filter=`saturate(${Math.max(0,1+(filters.saturation??0))}) brightness(${Math.pow(2,filters.exposure??0)}) contrast(${Math.max(0,1+(filters.contrast??0))})`,blend=(p.blendMode??'NORMAL').toLowerCase().replaceAll('_','-');
      layers.push(`<image style="mix-blend-mode:${blend};filter:${filter}" width="${width}" height="${height}" href="${src.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" preserveAspectRatio="${p.scaleMode==='FIT'?'xMidYMid meet':'xMidYMid slice'}" opacity="${p.opacity??1}"/>`);continue;
    }else return;
    layers.push(`<rect width="${width}" height="${height}" fill="${fill}" opacity="${(p.opacity??1)*(p.type==='SOLID'?(p.color.a??1):1)}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${defs.join('')}</defs>${layers.join('')}</svg>`;
}
