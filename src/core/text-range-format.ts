import type { SlideElement, TextRun, TextParagraph } from './model';
import { textStylePatch } from './text-style';

export type TextFormatPatch = Pick<Partial<SlideElement>, 'fontFamily' | 'fontSize' | 'fontWeight' | 'italic' | 'underline' | 'strikethrough' | 'fill' | 'align' | 'letterSpacing'> & Pick<Partial<TextRun>,'baseline'>;
export interface TextRange { start: number; end: number }
export interface TextFormatState { element: SlideElement; range: TextRange; capabilities?: {caret:boolean;characters:boolean} }

export function boundedTextRange(text: string, range: TextRange): TextRange {
  let start = Math.max(0, Math.min(text.length, Math.min(range.start, range.end)));
  let end = Math.max(start, Math.min(text.length, Math.max(range.start, range.end)));
  const dividesPair = (i: number) => i > 0 && i < text.length && /[\uD800-\uDBFF]/.test(text[i - 1]) && /[\uDC00-\uDFFF]/.test(text[i]);
  if (start !== end) { if (dividesPair(start)) start--; if (dividesPair(end)) end++; }
  return {start, end};
}
function sourceParagraphs(e: SlideElement): TextParagraph[] {
  return e.paragraphs?.length ? e.paragraphs : [{runs: e.runs?.length ? e.runs : [{text: e.text}], align: e.align, spaceBefore: 0, spaceAfter: 0, indent: 0, firstLineIndent: 0}];
}
function styledRun(run: TextRun, patch: TextFormatPatch): TextRun {
  const next = {...run};
  if (patch.fontFamily !== undefined) next.fontFamily = patch.fontFamily;
  if (patch.fontSize !== undefined) next.fontSize = patch.fontSize;
  if (patch.fontWeight !== undefined) { next.fontWeight = patch.fontWeight; delete next.bold; }
  if (patch.italic !== undefined) next.italic = patch.italic;
  if (patch.underline !== undefined) next.underline = patch.underline;
  if (patch.strikethrough !== undefined) next.strikethrough = patch.strikethrough;
  if (patch.fill !== undefined) next.color = patch.fill;
  if(patch.letterSpacing!==undefined)next.letterSpacing=patch.letterSpacing;
  if(patch.baseline!==undefined)next.baseline=patch.baseline;
  return next;
}
function mergeRuns(runs: TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  for (const run of runs) {
    if (!run.text.length && runs.length > 1) continue;
    const {text, ...style} = run, previous = out.at(-1);
    if (previous) { const {text: _, ...oldStyle} = previous; if (JSON.stringify(style) === JSON.stringify(oldStyle)) { previous.text += text; continue; } }
    out.push({...run});
  }
  return out.length ? out : [{text: ''}];
}

// A text range changes only covered characters/paragraphs. No range means a
// whole-object operation using the same inheritance rules as the inspector.
export function textRangeStylePatch(e: SlideElement, patch: TextFormatPatch, selection?: TextRange): Partial<SlideElement> {
  if (e.type !== 'text' || e.locked) return {};
  if(!selection){const {baseline,...fields}=patch,result=textStylePatch(e,fields);return baseline===undefined?result:{...result,...textRangeStylePatch({...e,...result},{baseline},{start:0,end:e.text.length})};}
  const range = boundedTextRange(e.text, selection);
  if (range.start === range.end) return {};
  let offset = 0;
  const paragraphs = sourceParagraphs(e).map((p, index) => {
    const start = offset, runs: TextRun[] = [];
    for (const run of p.runs) {
      const end = offset + run.text.length;
      const a = Math.max(offset, range.start), b = Math.min(end, range.end);
      if (b <= a) runs.push({...run});
      else {
        if (a > offset) runs.push({...run, text: run.text.slice(0, a - offset)});
        runs.push(styledRun({...run, text: run.text.slice(a - offset, b - offset)}, patch));
        if (b < end) runs.push({...run, text: run.text.slice(b - offset)});
      }
      offset = end;
    }
    const touched = range.end > start && range.start < offset;
    const next = {...p, runs: mergeRuns(runs), ...(touched && patch.align !== undefined ? {align: patch.align} : {})};
    if (e.paragraphs && index < e.paragraphs.length - 1) offset++;
    return next;
  });
  return e.paragraphs?.length ? {paragraphs} : {runs: paragraphs[0].runs, ...(patch.align !== undefined ? {align: patch.align} : {})};
}

export function textRangeTarget(e: SlideElement, selection: TextRange): SlideElement {
  const range = boundedTextRange(e.text, selection);
  const start = range.start === range.end ? Math.max(0, range.start - 1) : range.start;
  const end = range.start === range.end ? Math.min(e.text.length, start + 1) : range.end;
  let offset = 0;
  const paragraphs: TextParagraph[] = [];
  for (const p of sourceParagraphs(e)) {
    const runs: TextRun[] = [];
    for (const run of p.runs) {
      const a = Math.max(0, start - offset), b = Math.min(run.text.length, end - offset);
      if (b > a) runs.push({...run, text: run.text.slice(a, b)});
      offset += run.text.length;
    }
    if (runs.length) paragraphs.push({...p, runs});
    if (e.paragraphs) offset++;
  }
  return {...e, text: e.text.slice(start, end), runs: undefined, paragraphs: paragraphs.length ? paragraphs : undefined};
}

export function textDraftPatch(e: SlideElement): Partial<SlideElement> {
  return {text: e.text, runs: e.runs, paragraphs: e.paragraphs, fontFamily:e.fontFamily,fontSize: e.fontSize, fontWeight: e.fontWeight, italic: e.italic, underline: e.underline, strikethrough:e.strikethrough, fill: e.fill, align: e.align};
}
