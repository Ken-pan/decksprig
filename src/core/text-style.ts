import type {SlideElement,TextRun} from './model';
export function textStylePatch(e: SlideElement, patch: Partial<SlideElement>) {
  const changeRun = (run: TextRun): TextRun => ({...run,
    ...(patch.fontFamily !== undefined ? {fontFamily: undefined} : {}),
    ...(patch.fontSize !== undefined ? {fontSize: undefined} : {}),
    ...(patch.fontWeight !== undefined ? {bold: undefined, fontWeight: undefined} : {}),
    ...(patch.italic !== undefined ? {italic: undefined} : {}),
    ...(patch.fill !== undefined ? {color: undefined} : {}),
    ...(patch.underline !== undefined ? {underline: undefined} : {}),
    ...(patch.strikethrough !== undefined ? {strikethrough: undefined} : {}),
    ...(patch.letterSpacing !== undefined ? {letterSpacing: undefined} : {}),
  });
  return {...patch, ...(e.runs ? {runs: e.runs.map(changeRun)} : {}),
    ...(e.paragraphs ? {paragraphs: e.paragraphs.map(p => ({...p, runs: p.runs.map(changeRun), ...(p.endStyle ? {endStyle:changeRun(p.endStyle)} : {}), ...(patch.align!==undefined?{align:patch.align}:{}), ...(patch.lineHeight!==undefined?{lineHeight:undefined,lineSpacing:undefined}:{})}))} : {})};
}
