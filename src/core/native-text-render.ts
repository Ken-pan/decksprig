import type {SlideElement} from './model';
/** Pure so the canvas, presentation and downloaded player share native line breaks. */
export function createNativeTextRendering(){
  function textLayoutFingerprint(e:SlideElement){return JSON.stringify({text:e.text,runs:e.runs,paragraphs:e.paragraphs,w:e.w,h:e.h,fontFamily:e.fontFamily,fontSize:e.fontSize,fontWeight:e.fontWeight,fill:e.fill,lineHeight:e.lineHeight,letterSpacing:e.letterSpacing,align:e.align,verticalAlign:e.verticalAlign,italic:e.italic,underline:e.underline,strikethrough:e.strikethrough||undefined,wrap:e.wrap,textSizing:e.textSizing,maxLines:e.maxLines,padding:e.padding,textCase:e.textCase});}
  function renderedNativeText(e:SlideElement):SlideElement{
    const native=nativeTextSpans(e);if(!native)return e;
    return {...e,text:native.runs.map(r=>r.text).join(''),runs:native.runs,paragraphs:undefined,wrap:false,textSizing:'fixed',maxLines:undefined,...(native.lineSpacing?{lineHeight:native.lineSpacing/e.fontSize}:{})};
  }
  function nativeTextSpans(e:SlideElement){const layout=e.nativeTextLayout;return layout&&layout.fingerprint===textLayoutFingerprint(e)?layout:undefined;}
  return {textLayoutFingerprint,renderedNativeText,nativeTextSpans};
}
export const {textLayoutFingerprint,renderedNativeText,nativeTextSpans}=createNativeTextRendering();
