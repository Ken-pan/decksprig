import {Schema,Slice,type Node as RichNode,type Mark,Fragment} from 'prosemirror-model';
import {TextSelection,type EditorState,type Transaction} from 'prosemirror-state';
import {ParagraphSchema,TextRunSchema,type SlideElement,type TextParagraph,type TextRun} from './model';
import {boundedTextRange,type TextRange,type TextFormatPatch} from './text-range-format';
import {createTypography} from './typography';
import {fontStack} from './font-stack';
type RunStyle=Omit<TextRun,'text'>;
type ParagraphFormat=Omit<TextParagraph,'runs'>;
const textOf=(node:RichNode)=>node.textBetween(0,node.content.size,'\n','\n');
export function bodyParagraphFontSize(paragraph:TextParagraph,source:SlideElement){const visible=paragraph.runs.filter(r=>r.text.length);return visible.length?Math.max(...visible.map(r=>r.fontSize??source.fontSize)):source.fontSize;}
/** A read-only toolbar/clipboard projection of the shared paragraph renderer. */
export function bodyDisplayContext(source:SlideElement):SlideElement{return source.paragraphs?.length?{...source,paragraphs:source.paragraphs.map(p=>{const size=bodyParagraphFontSize(p,source);return {...p,runs:p.runs.map(r=>({...r,fontSize:r.fontSize??size}))};})}:source;}
export function bodyCaretContext(state:EditorState,source:SlideElement):SlideElement{
  const at=state.selection.$from,p=source.paragraphs?.[at.index(0)],format=(state.storedMarks??at.marks()).find(m=>m.type.name==='style')?.attrs.format??{},fontSize=format.fontSize??(p?bodyParagraphFontSize(p,source):source.fontSize);
  return {...source,paragraphs:undefined,fontFamily:format.fontFamily??source.fontFamily,fontSize,fontWeight:format.fontWeight??(format.bold===undefined?source.fontWeight:format.bold?700:400),italic:format.italic??source.italic,underline:format.underline??source.underline,strikethrough:format.strikethrough??source.strikethrough,fill:format.color??source.fill,letterSpacing:format.letterSpacing??source.letterSpacing,align:at.parent.attrs.format?.align??source.align,runs:[{text:source.text,...format,fontSize}]};
}
function parseAttribute(raw:string|null,paragraph=false){
  if(!raw||raw.length>500_000)return null;
  try{const value=JSON.parse(raw),parsed=paragraph?ParagraphSchema.parse({...value,runs:[]}):TextRunSchema.parse({...value,text:''});const {text:_text,runs:_runs,...format}=parsed as TextRun&TextParagraph;return format;}catch{return null;}
}
/** Typed authored runs and paragraph attributes, without introducing a document schema. */
export function bodyTextSchema(source:()=>SlideElement,scale=()=>1,stack=fontStack){
  const {runStyle}=createTypography(stack);
  return new Schema({nodes:{
    doc:{content:'paragraph+'},
    paragraph:{content:'inline*',group:'block',whitespace:'pre',attrs:{format:{default:null}},
      parseDOM:[{tag:'div[data-text-paragraph]',getAttrs:node=>({format:parseAttribute(node.getAttribute('data-text-paragraph'),true)})},{tag:'div'},{tag:'p'}],
      toDOM:node=>{const format=node.attrs.format as ParagraphFormat|null;return ['div',{'data-text-paragraph':format?JSON.stringify(format):'',class:format?'text-paragraph':undefined,'data-bullet':format?.bullet,style:bodyParagraphStyle(node,source(),scale(),0,1,stack)},0];}},
    text:{group:'inline'},
    hard_break:{inline:true,group:'inline',selectable:false,linebreakReplacement:true,parseDOM:[{tag:'br'}],toDOM:()=>['br']},
  },marks:{style:{attrs:{format:{default:{}}},parseDOM:[{tag:'span[data-text-run]',getAttrs:node=>{const format=parseAttribute(node.getAttribute('data-text-run'));return format?{format}:false;}}],
    toDOM:mark=>{const format=mark.attrs.format as RunStyle,factor=scale();return ['span',{'data-text-run':JSON.stringify(format),style:runStyle({text:'',...format,...(format.fontSize!==undefined?{fontSize:format.fontSize*factor}:{}),...(format.letterSpacing!==undefined?{letterSpacing:format.letterSpacing*factor}:{})},source())},0];}},
  }});
}
export function bodyParagraphStyle(node:RichNode,e:SlideElement,factor=1,index=0,total=1,stack=fontStack){
  const format=(node.attrs.format??(total>1?{align:e.align,spaceBefore:0,spaceAfter:0,indent:0,firstLineIndent:0}:null)) as ParagraphFormat|null;if(!format)return '';
  const p={...format,runs:bodyRuns(node)} as TextParagraph,display={...e,fontSize:e.fontSize*factor,paragraphs:Array(total)};
  const shown={...p,runs:p.runs.map(r=>({...r,...(r.fontSize!==undefined?{fontSize:r.fontSize*factor}:{})})),spaceBefore:p.spaceBefore*factor,spaceAfter:p.spaceAfter*factor,indent:p.indent*factor,firstLineIndent:p.firstLineIndent*factor,...(p.lineSpacing!==undefined?{lineSpacing:p.lineSpacing*factor}:{}),...(p.endStyle?{endStyle:{...p.endStyle,...(p.endStyle.fontSize!==undefined?{fontSize:p.endStyle.fontSize*factor}:{})}}:{})};
  const {paragraphStyle}=createTypography(stack),style=paragraphStyle(shown,display,index);
  // A browser caret requires a trailing BR. An empty authored paragraph already
  // has a minimum line height; the BR must not add its padding a second time.
  const before=e.paragraphSpacingAtEdges===false&&index===0?0:shown.spaceBefore,after=e.paragraphSpacingAtEdges===false&&index===total-1?0:shown.spaceAfter,minimum=shown.lineSpacing??(shown.lineHeight??e.lineHeight)*display.fontSize;
  return style+(!node.content.size&&!p.endStyle?`height:${Math.max(minimum,before+after)}px;`:'height:auto;');
}
function inlineNodes(schema:Schema,runs:TextRun[]){return runs.filter(r=>r.text).map(run=>{const {text,...format}=run;return schema.text(text,Object.keys(format).length?[schema.marks.style.create({format})]:undefined);});}
export function bodyDocument(schema:Schema,e:Pick<SlideElement,'text'|'runs'|'paragraphs'>){
  if(e.text.length>50000)throw Error('Keep each text object under 50,000 characters.');
  if((e.runs?.length??0)>5000||(e.paragraphs?.length??0)>5000||e.paragraphs?.some(p=>p.runs.length>5000))throw Error('Use up to 5,000 paragraphs and 5,000 text styles per paragraph.');
  const paragraphs=e.paragraphs?.length?e.paragraphs.map(({runs,...format})=>schema.nodes.paragraph.create({format},inlineNodes(schema,runs))):[schema.nodes.paragraph.create(null,inlineNodes(schema,e.runs?.length?e.runs:[{text:e.text}]))];
  return schema.nodes.doc.create(null,paragraphs);
}
export function bodyRuns(paragraph:RichNode):TextRun[]{
  const runs:TextRun[]=[];
  paragraph.forEach(node=>{const text=node.isText?node.text!:'\n',format=node.marks.find(m=>m.type.name==='style')?.attrs.format??{},previous=runs.at(-1);
    if(previous){const {text:_old,...old}=previous;if(JSON.stringify(old)===JSON.stringify(format)){previous.text+=text;return;}}
    runs.push({text,...format});
  });return runs.length?runs:[{text:''}];
}
export function bodyElement(doc:RichNode,source:SlideElement,baseline:RichNode|null=bodyDocument(doc.type.schema,source)):SlideElement{
  if(baseline&&doc.eq(baseline))return source;
  const text=textOf(doc);if(text.length>50000)throw Error('Keep each text object under 50,000 characters.');
  if(doc.childCount>5000)throw Error('Use up to 5,000 paragraphs in one text object.');
  const paragraphs:TextParagraph[]=[];
  doc.forEach(p=>{const runs=bodyRuns(p);if(runs.length>5000)throw Error('This paragraph has too many style changes. Split it into smaller paragraphs.');paragraphs.push({...p.attrs.format??{align:source.align,spaceBefore:0,spaceAfter:0,indent:0,firstLineIndent:0},runs});});
  if(source.paragraphs?.length||doc.childCount>1||doc.firstChild?.attrs.format)return {...source,text,runs:undefined,paragraphs};
  const runs=paragraphs[0].runs,meaningful=runs.some(r=>Object.keys(r).length>1);return {...source,text,paragraphs:undefined,runs:meaningful||source.runs?runs:undefined};
}
export function bodyPosition(doc:RichNode,offset:number){
  let text=0,found=doc.content.size-1;doc.forEach((p,pos)=>{const length=textOf(p).length;if(offset>=text&&offset<=text+length)found=pos+1+offset-text;text+=length+1;});return Math.max(1,Math.min(doc.content.size-1,found));
}
function bodyOffset(doc:RichNode,position:number){let text=0,result=0;doc.forEach((p,pos)=>{const length=textOf(p).length;if(position>=pos+1)result=text+Math.min(length,position-pos-1);text+=length+1;});return result;}
export function bodySelection(state:EditorState):TextRange{return {start:bodyOffset(state.doc,state.selection.from),end:bodyOffset(state.doc,state.selection.to)};}
export function selectBodyText(state:EditorState,range:TextRange){
  const text=textOf(state.doc),selected=boundedTextRange(text,range);if(selected.start===selected.end&&selected.start>0&&/[\uD800-\uDBFF]/.test(text[selected.start-1])&&/[\uDC00-\uDFFF]/.test(text[selected.start]??''))selected.start=++selected.end;
  return state.tr.setSelection(TextSelection.create(state.doc,bodyPosition(state.doc,selected.start),bodyPosition(state.doc,selected.end)));
}
export function bodyFormat(state:EditorState,patch:TextFormatPatch,range=bodySelection(state)){
  const tr=selectBodyText(state,range),{from,to,$from}=tr.selection,{align,fill,fontWeight,...rest}=patch,characters:RunStyle={...rest,...(fill!==undefined?{color:fill}:{}),...(fontWeight!==undefined?{fontWeight}:{})};
  const patched=(marks:readonly Mark[])=>{const before=marks.find(m=>m.type.name==='style')?.attrs.format??{},next={...before,...characters};if(fontWeight!==undefined)delete next.bold;return state.schema.marks.style.create({format:next});};
  if(Object.keys(characters).length){if(from===to)tr.setStoredMarks([patched(state.storedMarks??$from.marks())]);else state.doc.nodesBetween(from,to,(node,pos)=>{if(node.isInline)tr.addMark(Math.max(from,pos),Math.min(to,pos+node.nodeSize),patched(node.marks));});}
  if(align!==undefined)state.doc.nodesBetween(from,to,(node,pos)=>{if(node.type.name==='paragraph')tr.setNodeMarkup(pos,undefined,{...node.attrs,format:{...node.attrs.format??{spaceBefore:0,spaceAfter:0,indent:0,firstLineIndent:0},align}});});
  return tr;
}
export function bodyTextContent(doc:RichNode){return textOf(doc);}
export function bodyInsertSlice(tr:Transaction,content:RichNode){return tr.replaceSelection(new Slice(content.content,1,1));}
export {Fragment};
