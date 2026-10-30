import {z} from './schema';

export const ShapeVariantSchema = z.enum(['triangle', 'pentagon', 'hexagon', 'star', 'arrow', 'chevron']);
export type ShapeVariant = z.infer<typeof ShapeVariantSchema>;
export const ElementShadowSchema = z.strictObject({
  color: z.string().check(z.regex(/^#[\da-fA-F]{6}$/)),
  opacity: z.number().check(z.minimum(0)).check(z.maximum(1)),
  blur: z.number().check(z.minimum(0)).check(z.maximum(200)),
  x: z.number().check(z.minimum(-500)).check(z.maximum(500)),
  y: z.number().check(z.minimum(-500)).check(z.maximum(500)),
});
export type ElementShadow = z.infer<typeof ElementShadowSchema>;

export const DEFAULT_SHADOW: ElementShadow = {color: '#000000', opacity: .18, blur: 8, x: 0, y: 6};

export function shadowColorPatch(value: string): Partial<ElementShadow> {
  if(value==='transparent')return {opacity:0};
  let hex=value.replace('#','');
  if(hex.length===3||hex.length===4)hex=hex.split('').map(c=>c+c).join('');
  if(!/^[\da-fA-F]{6}(?:[\da-fA-F]{2})?$/.test(hex))throw new Error('Use a hex shadow color.');
  return {color:'#'+hex.slice(0,6),...(hex.length===8?{opacity:parseInt(hex.slice(6),16)/255}:{})};
}
