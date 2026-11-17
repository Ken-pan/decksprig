import type { SlideElement, TextRun, TextParagraph } from './model';
import { fontStack } from './font-stack';
import { scaledTextStyle as resizeTextStyle } from './text-sizing';
export function createTypography(makeFontStack: (family: string) => string) {
function caseStyle(value:TextRun['textCase']) {return `text-transform:${value==='upper'?'uppercase':value==='lower'?'lowercase':value==='title'?'capitalize':value==='none'?'none':'inherit'};font-variant-caps:${value==='small-caps'?'small-caps':value?'normal':'inherit'};`;}
function runStyle(r: TextRun, base?: Pick<SlideElement,'underline'|'strikethrough'>) {
  const underline=r.underline??base?.underline,strike=r.strikethrough??base?.strikethrough;
  const decoration=underline===undefined&&strike===undefined?'inherit':`${underline?'underline ':''}${strike?'line-through':''}`.trim()||'none';
  return `${caseStyle(r.textCase)}font-family:${r.fontFamily ? makeFontStack(r.fontFamily) : 'inherit'};font-size:${r.fontSize ? r.fontSize + 'px' : 'inherit'};font-weight:${r.fontWeight ?? (r.bold === undefined ? 'inherit' : r.bold ? 700 : 400)};font-style:${r.italic === undefined ? 'inherit' : r.italic ? 'italic' : 'normal'};color:${r.color ?? 'inherit'};text-decoration:${decoration};letter-spacing:${r.letterSpacing === undefined ? 'inherit' : r.letterSpacing + 'px'};vertical-align:${r.baseline === 'super' ? 'super' : r.baseline === 'sub' ? 'sub' : 'baseline'};`;
}
function paragraphStyle(p: TextParagraph, e: SlideElement, index = e.paragraphs?.indexOf(p) ?? -1) {
  const visible = p.runs.filter(r=>r.text.length);
  const size = visible.length ? Math.max(...visible.map(r => r.fontSize ?? e.fontSize)) : e.fontSize;
  const before = e.paragraphSpacingAtEdges === false && index === 0 ? 0 : p.spaceBefore;
  const after = e.paragraphSpacingAtEdges === false && index === (e.paragraphs?.length ?? 0)-1 ? 0 : p.spaceAfter;
  const end=p.endStyle?`--deck-end-content:'\\200b';--deck-end-size:${p.endStyle.fontSize??e.fontSize}px;--deck-end-font:${makeFontStack(p.endStyle.fontFamily??e.fontFamily)};`:'';
  return `${end}font-size:${size}px;text-align:${p.align};line-height:${p.lineSpacing ? p.lineSpacing + 'px' : p.lineHeight ?? e.lineHeight};margin:0;padding-top:${before}px;padding-bottom:${after}px;margin-left:${p.indent}px;text-indent:${p.firstLineIndent}px;min-height:${p.lineSpacing ?? (p.lineHeight ?? e.lineHeight) * size}px;`;
}
function textBoxStyle(e: SlideElement) {
  const p = e.padding ?? {left: 0, right: 0, top: 0, bottom: 0};
  return `${caseStyle(e.textCase)}padding:${p.top}px ${p.right}px ${p.bottom}px ${p.left}px;display:flex;flex-direction:column;justify-content:${e.verticalAlign === 'middle' ? 'center' : e.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start'};white-space:${e.textSizing === 'auto-width' || !e.wrap ? 'pre' : 'pre-wrap'};overflow:${e.clipText === false ? 'visible' : 'hidden'};`;
}
function textFlowStyle(e: SlideElement) {
  const balanced=e.wrap&&e.textSizing!=='auto-width'&&!e.sourceId&&!e.nativeTextLayout&&!e.paragraphs?.length&&['title','heading'].includes(e.design?.text??'');
  return `width:100%;flex-shrink:0;${balanced?'text-wrap:balance;':''}${e.maxLines ? `display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:${e.maxLines};overflow:hidden;` : ''}`;
}

return {runStyle, paragraphStyle, textBoxStyle, textFlowStyle};
}
export const {runStyle, paragraphStyle, textBoxStyle, textFlowStyle} = createTypography(fontStack);
export { resizeTextStyle as scaledTextStyle };
