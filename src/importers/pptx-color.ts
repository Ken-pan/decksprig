type AlphaTransform={kind:string;value:unknown};
const alphaKinds=new Set(['alpha','alphaMod','alphaOff']);

/** Keep repeated alpha operations in source order, including interleaved kinds. */
export function orderedAlphaTransforms(children:any[]):AlphaTransform[]{
  return children.flatMap(child=>Object.keys(child).filter(key=>alphaKinds.has(key.replace(/^\w+:/,''))).map(key=>({kind:key.replace(/^\w+:/,''),value:child[':@']?.['@_val']})));
}

/** A run's explicit paint replaces inherited paint, including inherited noFill. */
export function pptxTextProperties(...sources:any[]):any{
  const result:any={};
  for(const source of sources){
    if(!source)continue;
    if(['solidFill','noFill','gradFill','pattFill','grpFill'].some(key=>source[key]!==undefined))for(const key of ['solidFill','noFill','gradFill','pattFill','grpFill'])delete result[key];
    Object.assign(result,source);
  }
  return result;
}

/** RGB-only consumers keep their existing contract; editable paints retain alpha. */
export function pptxColor(node:any,palette:Record<string,string>,mapping:Record<string,string>,fallback='transparent',keepAlpha=false):string{
  if(node?.noFill!==undefined)return 'transparent';
  node=node?.solidFill??node;
  const source=node?.srgbClr??node?.schemeClr??node?.sysClr;
  const value=node?.srgbClr?.val??palette[mapping[node?.schemeClr?.val]??node?.schemeClr?.val]??node?.sysClr?.lastClr;
  if(typeof value!=='string'||!/^([\da-f]{6})([\da-f]{2})?$/i.test(value))return fallback;
  const rgb='#'+value.slice(0,6);if(!keepAlpha)return rgb;
  let alpha=value.length===8?parseInt(value.slice(6),16)/255:1;
  const transforms:AlphaTransform[]=source?.__alphaTransforms??Object.entries(source??{}).filter(([kind])=>alphaKinds.has(kind)).flatMap(([kind,values])=>(Array.isArray(values)?values:[values]).map(value=>({kind,value:(value as any)?.val})));
  for(const transform of transforms){
    const raw=String(transform.value??'');if(!/^[+-]?\d+(?:\.\d+)?%?$/.test(raw))continue;
    const value=parseFloat(raw)/(raw.endsWith('%')?100:100000);
    if(!Number.isFinite(value))continue;
    alpha=Math.max(0,Math.min(1,transform.kind==='alpha'?value:transform.kind==='alphaMod'?alpha*value:alpha+value));
  }
  const byte=Math.round(alpha*255);return rgb+(byte===255?'':byte.toString(16).padStart(2,'0'));
}
