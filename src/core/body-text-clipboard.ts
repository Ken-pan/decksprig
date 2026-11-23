import type {EditorState} from 'prosemirror-state';
import {bodyDocument,bodyElement,bodyInsertSlice,bodyParagraphFontSize} from './body-text-model';
import type {SlideElement,TextRun} from './model';
import {BodyTextClipboardSchema as schema,type BodyTextClipboard} from './body-text-clipboard-codec';
export {readBodyTextClipboard,type BodyTextClipboard} from './body-text-clipboard-codec';
import type {HtmlClipboard} from './html-clipboard';
function resolvedRun(run:TextRun,e:SlideElement):TextRun{
  const {bold:_bold,...rest}=run;return {...rest,fontFamily:run.fontFamily??e.fontFamily,fontSize:run.fontSize??e.fontSize,fontWeight:run.fontWeight??(run.bold===undefined?e.fontWeight:run.bold?700:400),italic:run.italic??e.italic,underline:run.underline??e.underline,strikethrough:run.strikethrough??e.strikethrough??false,color:run.color??e.fill,letterSpacing:run.letterSpacing??e.letterSpacing,baseline:run.baseline??'normal',textCase:run.textCase??e.textCase??'none'};
}
export function bodyTextClipboard(state:EditorState,source:SlideElement):BodyTextClipboard|undefined{
  if(state.selection.empty)return;const slice=state.doc.slice(state.selection.from,state.selection.to,true),doc=state.schema.nodes.doc.create(null,slice.content),selected=bodyElement(doc,source,null);
  const first=state.selection.$from.index(0),paragraphs=(selected.paragraphs??[{runs:selected.runs??[{text:selected.text}],align:source.align,spaceBefore:0,spaceAfter:0,indent:0,firstLineIndent:0}]).map((p,index)=>{
    const original=source.paragraphs?.[first+index],context=original?{...source,fontSize:bodyParagraphFontSize(original,source)}:source;
    return {...p,lineHeight:p.lineHeight??source.lineHeight,...(source.paragraphSpacingAtEdges===false&&first+index===0?{spaceBefore:0}:{}),...(source.paragraphSpacingAtEdges===false&&first+index===(source.paragraphs?.length??1)-1?{spaceAfter:0}:{}),runs:p.runs.map(r=>resolvedRun(r,context)),...(p.endStyle?{endStyle:resolvedRun(p.endStyle,source)}:{})};
  });
  const {fontFamily,fontSize,fontWeight,italic,underline,fill,lineHeight,letterSpacing,align}=source,base={fontFamily,fontSize,fontWeight,italic,underline,fill,lineHeight,letterSpacing,align,strikethrough:source.strikethrough??false,textCase:source.textCase??'none',paragraphSpacingAtEdges:true};
  return schema.parse({kind:'deck-studio/text/1',text:selected.text,base,paragraphs});
}
export function externalBodyClipboard(source:HtmlClipboard):BodyTextClipboard{
  if(source.kind==='text')return schema.parse({kind:'deck-studio/text/1',text:source.text,runs:source.runs});
  const styles=new Map((source.tableStyle.cellStyles??[]).map(s=>[`${s.row}:${s.column}`,s]));
  const paragraphs=source.cells.map((row,r)=>{const runs:TextRun[]=[];let previous:TextRun|undefined;
    for(let column=0;column<row.length;column++){
      if(column)runs.push({...previous,text:'\t'});const cell=styles.get(`${r}:${column}`),fallback={fontFamily:cell?.fontFamily,fontSize:cell?.fontSize,fontWeight:cell?.fontWeight,italic:cell?.italic,underline:cell?.underline,strikethrough:cell?.strikethrough,color:cell?.color},items=cell?.runs??[{text:row[column],...fallback}];runs.push(...items);previous=items.at(-1)??{text:'',...fallback};
    }return {runs:runs.filter(r=>r.text),align:'left' as const,spaceBefore:0,spaceAfter:0,indent:0,firstLineIndent:0};
  }),text=source.cells.map(row=>row.join('\t')).join('\n');if(text.length>50000)throw Error('Keep each text object under 50,000 characters.');
  const result=schema.safeParse({kind:'deck-studio/text/1',text,paragraphs});if(!result.success)throw Error('This text has too many style changes. Copy a smaller range or paste as plain text.');return result.data;
}
export function pasteBodyText(state:EditorState,payload:BodyTextClipboard){
  if(payload.text.length>50000)throw Error('Keep each text object under 50,000 characters.');
  const parsed=schema.safeParse(payload);if(!parsed.success)throw Error('The copied text has invalid or excessive formatting. Copy a smaller range or paste as plain text.');
  const data=parsed.data,source=bodyDocument(state.schema,data);return bodyInsertSlice(state.tr,source);
}
