import type {SlideElement,TextRun,TextParagraph} from './model';
import {isTextShape,shapeTextElement} from './shape-text';
const words=new Intl.Segmenter('en',{granularity:'word'});
// CSS capitalize uses simple titlecase, without lowercasing the rest of a word
// or expanding ligatures. Preserve word boundaries across differently styled runs.
const digraphs:Record<string,string>={'Ǆ':'ǅ','ǆ':'ǅ','Ǉ':'ǈ','ǉ':'ǈ','Ǌ':'ǋ','ǌ':'ǋ','Ǳ':'ǲ','ǳ':'ǲ'};
function titleStarts(text:string){
 const starts=new Map<number,string>();
 for(const word of words.segment(text))if(word.isWordLike){
  for(const match of word.segment.matchAll(/(?:^|[^\p{L}\p{N}\p{M}_'’])(\p{L})/gu)){
   const letter=match[1],upper=digraphs[letter]??letter.toUpperCase();
   const index=word.index+match.index!+match[0].length-letter.length;
   // ICU versions differ on apostrophes; CSS keeps a contraction together.
   if(/[\p{L}\p{N}\p{M}]['’]$/u.test(text.slice(Math.max(0,index-3),index)))continue;
   starts.set(index,upper.length===letter.length?upper:letter);
  }
 }
 return starts;
}
const expands=(text:string)=>text.toUpperCase().length>text.length;
function transformMode(r:TextRun,base:SlideElement['textCase']){
 const mode=r.textCase==='small-caps'?base:r.textCase??base;
 return mode==='small-caps'?undefined:mode;
}
function transforms(r:TextRun,base:SlideElement['textCase']){const mode=transformMode(r,base);return mode==='lower'||mode==='title'||mode==='upper'&&(r.textCase==='small-caps'||expands(r.text));}
function caseRuns(runs:TextRun[],base:SlideElement['textCase']):TextRun[]{
 if(!runs.some(r=>transforms(r,base)))return runs;
 const starts=runs.some(r=>transformMode(r,base)==='title')?titleStarts(runs.map(r=>r.text).join('')):new Map<number,string>();let offset=0;
 return runs.map(r=>{const mode=transformMode(r,base),start=offset;offset+=r.text.length;
  if(mode==='upper')return r.textCase==='small-caps'?{...r,text:r.text.toUpperCase()}:expands(r.text)?{...r,text:Array.from(r.text,c=>c.toUpperCase().length>c.length?c.toUpperCase():c).join('')}:r;
  if(mode!=='lower'&&mode!=='title')return r;
  const text=mode==='lower'?r.text.toLowerCase():r.text.replace(/\p{L}/gu,(letter,index)=>starts.get(start+index)??letter);
  return {...r,text,textCase:r.textCase==='small-caps'?'small-caps':'none'};
 });
}
export function textParagraphs(e:SlideElement):TextParagraph[]{
 return e.paragraphs??[{runs:e.runs??[{text:e.text}],align:e.align,lineHeight:e.lineHeight,spaceBefore:0,spaceAfter:0,indent:0,firstLineIndent:0}];
}
/** A reversible native representation; never rewrite the authored document. */
export function renderedPptxTextStyles(e:SlideElement):SlideElement{
 if(e.type!=='text'&&!isTextShape(e))return e;
 const source=e.type==='text'?e:shapeTextElement(e),paragraphs=textParagraphs(source);
 const transformedCase=paragraphs.some(p=>p.runs.some(r=>transforms(r,e.textCase)));
 const before=source.paragraphSpacingAtEdges===false?0:paragraphs[0]?.spaceBefore??0,after=source.paragraphSpacingAtEdges===false?0:paragraphs.at(-1)?.spaceAfter??0;
 if(!transformedCase&&!before&&!after)return e;
 const transformed=paragraphs.map((p,i)=>({...p,runs:caseRuns(p.runs,e.textCase),...(before&&i===0?{spaceBefore:0}:{}),...(after&&i===paragraphs.length-1?{spaceAfter:0}:{})}));
 const padding=source.padding??{left:0,right:0,top:0,bottom:0};
 return {...e,...(transformedCase?{text:transformed.map(p=>p.runs.map(r=>r.text).join('')).join('\n'),textCase:e.textCase==='lower'||e.textCase==='title'?'none':e.textCase,runs:e.runs?caseRuns(e.runs,e.textCase):e.runs}:{}),paragraphs:transformed,
  ...(before||after?{paragraphSpacingAtEdges:false,padding:{...padding,top:padding.top+before,bottom:padding.bottom+after}}:{})};
}
export function needsPptxTextMetadata(e:SlideElement){
 return Boolean(e.maxLines!==undefined||e.nativeTextLayout||e.textCase&&e.textCase!=='none'||textParagraphs(e).some(p=>p.runs.some(r=>r.textCase&&r.textCase!=='none')||e.paragraphSpacingAtEdges!==false&&(p===e.paragraphs?.[0]&&p.spaceBefore||p===e.paragraphs?.at(-1)&&p.spaceAfter)));
}
