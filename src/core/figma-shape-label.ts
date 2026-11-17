import {z} from './schema';
import {ElementSchema,type SlideElement} from './model';

export const SHAPE_LABEL_KEY='deck-studio-shape-label-v1';
export const SHAPE_LABEL_PART_KEY='deck-studio-shape-part';
export const ShapeLabelDataSchema=z.strictObject(z.pick(ElementSchema, {type:true,shape:true,radius:true,shapeText:true,padding:true,clipText:true,textFit:true,wrap:true,maxLines:true,line:true,fontFamily:true,fontSize:true,fontWeight:true,italic:true,underline:true,strikethrough:true,textCase:true,lineHeight:true,letterSpacing:true}).shape).check(z.refine(value=>['rect','ellipse','diamond','line'].includes(value.type)));
export type ShapeLabelData=ReturnType<typeof ShapeLabelDataSchema.parse>;
export type ShapeLabelCapture={version:1;data:ShapeLabelData;bodyId:string;paintId:string;labelFrameId:string;textId:string};

export function shapeLabelData(e:SlideElement):ShapeLabelData{
 const {type,shape,radius,shapeText,padding,clipText,textFit,wrap,maxLines,line,fontFamily,fontSize,fontWeight,italic,underline,strikethrough,textCase,lineHeight,letterSpacing}=e;
 return ShapeLabelDataSchema.parse({type,shape,radius,shapeText,padding,clipText,textFit,wrap,maxLines,line,fontFamily,fontSize,fontWeight,italic,underline,strikethrough,textCase,lineHeight,letterSpacing});
}
/** The native children, not stored metadata, remain the text/paint authority. */
export function decodeShapeLabelCapture(value:unknown):ShapeLabelCapture|undefined{
 if(!value||typeof value!=='object')return;
 const v=value as Record<string,unknown>,parsed=ShapeLabelDataSchema.safeParse(v.data);
 if(v.version!==1||!parsed.success||['bodyId','paintId','labelFrameId','textId'].some(key=>typeof v[key]!=='string'||!(v[key] as string).length||(v[key] as string).length>200))return;
 if(v.bodyId===v.labelFrameId||v.labelFrameId===v.textId||v.bodyId===v.textId)return;
 return {version:1,data:parsed.data,bodyId:v.bodyId as string,paintId:v.paintId as string,labelFrameId:v.labelFrameId as string,textId:v.textId as string};
}
