import {z} from './schema';

export const COLOR_ROLES = ['background', 'ink', 'muted', 'accent', 'surface', 'line', 'dark', 'onDark'] as const;
export const TEXT_ROLES = ['title', 'heading', 'body', 'caption'] as const;
export const TYPE_PROPERTIES = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'] as const;
export type ColorRole = typeof COLOR_ROLES[number];
export type TextRole = typeof TEXT_ROLES[number];
export type TypeProperty = typeof TYPE_PROPERTIES[number];
const color = z.string().check(z.regex(/^#[\da-fA-F]{6}$/));
export const TypeStyleSchema = z.strictObject({
  fontFamily: z.string().check(z.trim()).check(z.minLength(1)).check(z.maxLength(100)).check(z.regex(/^[^";{}<>\\]+$/)),
  fontSize: z.number().check(z.minimum(4)).check(z.maximum(200)), fontWeight: z.number().check(z.int()).check(z.minimum(100)).check(z.maximum(900)),
  lineHeight: z.number().check(z.minimum(.5)).check(z.maximum(4)), letterSpacing: z.number().check(z.minimum(-30)).check(z.maximum(50)),
});
export const DesignSystemSchema = z.strictObject({
  name: z.string().check(z.trim()).check(z.minLength(1)).check(z.maxLength(80)),
  colors: z.strictObject({background:color,ink:color,muted:color,accent:color,surface:color,line:color,dark:color,onDark:color}),
  typography: z.strictObject({title:TypeStyleSchema,heading:TypeStyleSchema,body:TypeStyleSchema,caption:TypeStyleSchema}),
  pattern: z.strictObject({kind:z.enum(['none','dots','grid']),spacing:z.number().check(z.minimum(12)).check(z.maximum(160)),opacity:z.number().check(z.minimum(0)).check(z.maximum(.3))}),
});
export const StyleBindingSchema = z.strictObject({
  text: z.optional(z.enum(TEXT_ROLES)), textScale: z.optional(z.number().check(z.gt(0)).check(z.maximum(30))),
  font: z.optional(z.enum(TEXT_ROLES)),
  fill:z.optional(z.enum(COLOR_ROLES)), stroke:z.optional(z.enum(COLOR_ROLES)),
  overrides:z.optional(z.array(z.enum(TYPE_PROPERTIES)).check(z.maxLength(5))),
});
export type DesignSystem = z.infer<typeof DesignSystemSchema>;
export type StyleBinding = z.infer<typeof StyleBindingSchema>;

const typeStyle = (fontFamily:string,fontSize:number,fontWeight=400) => ({fontFamily,fontSize,fontWeight,lineHeight:1.25,letterSpacing:0});
export const DEFAULT_DESIGN_SYSTEM: DesignSystem = {
  name:'Editorial',
  colors:{background:'#f4f3ee',ink:'#26362c',muted:'#687168',accent:'#73856e',surface:'#e3e7db',line:'#c9cfc1',dark:'#26362c',onDark:'#eceee4'},
  typography:{title:typeStyle('Bodoni Moda',96),heading:typeStyle('Bodoni Moda',64),body:typeStyle('Manrope',32),caption:typeStyle('Manrope',20)},
  pattern:{kind:'none',spacing:40,opacity:.08},
};
