import type {SlideElement} from './model';

/** Only the painted body invalidates the source snapshot; selection and position do not. */
export function nativeTableRendering(){
function tableLayoutFingerprint(e:SlideElement){
  return JSON.stringify([e.cells,e.tableStyle,e.w,e.h,e.fontFamily,e.fontSize,e.fontWeight,e.italic,e.align,e.lineHeight,e.letterSpacing,e.fill,e.stroke,e.strokeWidth,...(e.underline?['underline']:[]),...(e.strikethrough?['strike']:[])]);
}
function nativeTableImage(e:SlideElement){
  return e.nativeTableLayout?.fingerprint===tableLayoutFingerprint(e)?e.nativeTableLayout.src:undefined;
}
return {tableLayoutFingerprint,nativeTableImage};
}
export const {tableLayoutFingerprint,nativeTableImage}=nativeTableRendering();
