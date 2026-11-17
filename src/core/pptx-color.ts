import {normalizeColor} from './color-contrast';
/** DrawingML stores RGB and alpha separately; CSS hexadecimal alpha is not an RGB value. */
export function nativeColor(value:string,opacity=1){
  const hex=normalizeColor(value),alpha=value==='transparent'?0:opacity*(hex?.length===9?parseInt(hex.slice(7),16)/255:1);
  return {color:hex?.slice(1,7)??(value==='transparent'?'FFFFFF':value.replace('#','')),alpha};
}
export function nativeColorXml(value:string,opacity=1,scheme?:string,explicitAlpha=false){
  const paint=nativeColor(value,opacity),tag=scheme?'schemeClr':'srgbClr',color=scheme??paint.color;
  return paint.alpha===1&&!explicitAlpha?`<a:${tag} val="${color}"/>`:`<a:${tag} val="${color}"><a:alpha val="${Math.round(paint.alpha*100000)}"/></a:${tag}>`;
}
export function nativePaint(value:string,opacity=1){const paint=nativeColor(value,opacity);return {color:paint.color,transparency:(1-paint.alpha)*100};}
