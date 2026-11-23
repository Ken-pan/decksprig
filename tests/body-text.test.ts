import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from 'prosemirror-state';
import {history,undo,redo,closeHistory} from 'prosemirror-history';
import {element,blankSlide,newDeck,validateDeck} from '../src/core/model';
import {bodyTextSchema,bodyDocument,bodyElement,bodySelection,selectBodyText,bodyFormat,bodyTextContent,bodyCaretContext} from '../src/core/body-text-model';
import {bodyTextClipboard,readBodyTextClipboard,pasteBodyText,externalBodyClipboard} from '../src/core/body-text-clipboard';
import {readHtmlClipboard} from '../src/core/html-clipboard';
import {bodyTextPatch} from '../src/core/body-text-patch';
import {applyImmutableOperations} from '../src/core/operations';
const source=()=>element('text',{fontFamily:'Arial',fontSize:32,text:'Hello 中文🙂\nSecond',runs:[{text:'Hello ',fontWeight:700,color:'#123456'},{text:'中文🙂\n',italic:true,baseline:'normal'},{text:'Second',textCase:'small-caps',letterSpacing:1.25}]});
function editor(e=source()){const schema=bodyTextSchema(()=>e);let state=EditorState.create({schema,doc:bodyDocument(schema,e),plugins:[history()]});return {get state(){return state;},apply:(tr:any)=>{state=state.apply(tr);},source:e};}
test('unchanged flat and paragraph documents round-trip all original authored attributes',()=>{
  const flat=source(),rich=element('text',{text:'First\n\nLast',paragraphSpacingAtEdges:false,paragraphs:[{runs:[{text:'First',fontFamily:'Georgia',fontSize:21.5,bold:true}],align:'center',spaceBefore:12,spaceAfter:5,indent:10,firstLineIndent:-3,bullet:'•',endStyle:{text:'',fontSize:28},lineSpacing:40},{runs:[{text:''}],align:'left',spaceBefore:0,spaceAfter:0,indent:0,firstLineIndent:0},{runs:[{text:'Last',strikethrough:true,textCase:'upper'}],align:'right',spaceBefore:0,spaceAfter:6,indent:0,firstLineIndent:0}]});
  for(const e of [flat,rich]){const x=editor(e);assert.deepEqual(bodyElement(x.state.doc,e),e);assert.equal(bodyTextContent(x.state.doc),e.text);for(let offset=0;offset<=e.text.length;offset++){x.apply(selectBodyText(x.state,{start:offset,end:offset}));const range=bodySelection(x.state);const split=offset>0&&/[\uD800-\uDBFF]/.test(e.text[offset-1])&&/[\uDC00-\uDFFF]/.test(e.text[offset]??'');assert.equal(range.start,offset+(split?1:0));assert.equal(range.end,range.start);}}
});
test('selection formatting retains unrelated run fields; local Undo/Redo also retains typing',()=>{
 const x=editor();x.apply(selectBodyText(x.state,{start:6,end:10}));x.apply(closeHistory(bodyFormat(x.state,{fill:'#ff0000',fontWeight:600})));let e=bodyElement(x.state.doc,x.source);assert.equal(e.text,x.source.text);assert(e.runs?.some(r=>r.text==='中文🙂'&&r.italic&&r.fontWeight===600&&r.color==='#ff0000'));assert.deepEqual(e.runs?.[0],x.source.runs![0]);
 assert(undo(x.state,x.apply));assert.deepEqual(bodyElement(x.state.doc,x.source),x.source);assert(redo(x.state,x.apply));x.apply(closeHistory(x.state.tr.insertText('Typed')));assert(bodyTextContent(x.state.doc).includes('Typed'));assert(undo(x.state,x.apply));assert.equal(bodyElement(x.state.doc,x.source).text,x.source.text);assert(undo(x.state,x.apply));assert.deepEqual(bodyElement(x.state.doc,x.source),x.source);
});
test('caret formatting changes future typing while retaining the previous text and source style',()=>{
 const x=editor();x.apply(selectBodyText(x.state,{start:6,end:6}));x.apply(bodyFormat(x.state,{fontSize:18,fill:'#663399',italic:true}));assert.deepEqual(bodyElement(x.state.doc,x.source),x.source);x.apply(x.state.tr.insertText('Next'));const e=bodyElement(x.state.doc,x.source);assert(e.runs?.some(r=>r.text==='Next'&&r.fontSize===18&&r.color==='#663399'&&r.italic));assert.equal(e.text,'Hello Next中文🙂\nSecond');
});
test('typed clipboard retains partial rich paragraphs and empty lines without document metadata',()=>{
 const e=element('text',{text:'Start\n\nEnd',paragraphs:[{runs:[{text:'Start',fontWeight:700}],align:'center',spaceBefore:12,spaceAfter:4,indent:0,firstLineIndent:0},{runs:[{text:''}],align:'left',spaceBefore:0,spaceAfter:0,indent:0,firstLineIndent:0},{runs:[{text:'End',italic:true}],align:'right',spaceBefore:3,spaceAfter:5,indent:0,firstLineIndent:0}]}),x=editor(e);x.apply(selectBodyText(x.state,{start:2,end:e.text.length-1}));const payload=bodyTextClipboard(x.state,e)!;assert.equal(payload.text,'art\n\nEn');assert.equal(payload.paragraphs?.length,3);assert.equal(payload.paragraphs?.[0].spaceBefore,12);assert(!JSON.stringify(payload).includes(e.id));assert.deepEqual(readBodyTextClipboard(JSON.stringify(payload)),payload);
 const target=editor(element('text',{text:'Before After',fontSize:48}));target.apply(selectBodyText(target.state,{start:7,end:7}));target.apply(pasteBodyText(target.state,payload));assert.equal(bodyTextContent(target.state.doc),'Before art\n\nEnAfter');
});
test('external inert HTML runs enter the same bounded transaction and the canonical manual/AI patch',()=>{
 const x=editor(),html=readHtmlClipboard('<p><b style="color:blue">Pasted 中文</b><i> end</i></p>')!;x.apply(selectBodyText(x.state,{start:0,end:x.source.text.length}));x.apply(pasteBodyText(x.state,externalBodyClipboard(html)));const next=bodyElement(x.state.doc,x.source);assert.equal(next.text,'Pasted 中文 end');assert(next.runs?.some(r=>r.text==='Pasted 中文'&&r.color==='#0000ff'&&r.fontWeight===700));
 const slide=blankSlide();slide.elements=[x.source];const d=newDeck('Body text',[slide]),patch=bodyTextPatch(x.source,next)!;for(const origin of ['manual','ai'] as const){const result=applyImmutableOperations(d,[{op:'update_element',slideId:slide.id,elementId:x.source.id,patch}],d.revision,origin);validateDeck(result);assert.equal(result.slides[0].elements[0].text,next.text);assert.equal(d.slides[0].elements[0].text,x.source.text);}
});
test('malformed or oversized clipboard fails before modifying the editor or its original source',()=>{
 const x=editor(),before=x.state.doc.toJSON();assert.equal(readBodyTextClipboard(JSON.stringify({kind:'deck-studio/text/1',text:'Other',runs:[{text:'Wrong'}]})),undefined);assert.throws(()=>pasteBodyText(x.state,{kind:'deck-studio/text/1',text:'A'.repeat(50001),runs:[{text:'A'.repeat(50001)}]}));assert.deepEqual(x.state.doc.toJSON(),before);assert.equal(x.source.text,source().text);
});
test('valid paragraphs retain more than 5,000 combined styles without imposing a smaller editor schema',()=>{
 const runs=Array.from({length:3000},(_,i)=>({text:String(i%10),fontWeight:i%2?700:400})),paragraphs=Array.from({length:2},()=>({runs,align:'left' as const,spaceBefore:0,spaceAfter:0,indent:0,firstLineIndent:0})),e=element('text',{paragraphs,text:paragraphs.map(p=>p.runs.map(r=>r.text).join('')).join('\n')}),x=editor(e);
 x.apply(selectBodyText(x.state,{start:0,end:e.text.length}));const copy=bodyTextClipboard(x.state,e)!;assert.equal(copy.paragraphs?.flatMap(p=>p.runs).length,6000);assert.equal(readBodyTextClipboard(JSON.stringify(copy))?.text,e.text);x.apply(selectBodyText(x.state,{start:1,end:1}));x.apply(x.state.tr.insertText('X'));const next=bodyElement(x.state.doc,e);assert.equal(next.text,e.text.slice(0,1)+'X'+e.text.slice(1));assert.equal(next.paragraphs?.length,2);assert.equal(next.paragraphs?.[1].runs.length,3000);
});
test('partial paragraph copy snapshots its actual inherited font size before the larger run leaves the selection',()=>{
 const e=element('text',{fontSize:26,text:'First line',paragraphs:[{runs:[{text:'First '},{text:'line',fontSize:32}],align:'left',spaceBefore:0,spaceAfter:0,indent:0,firstLineIndent:0}]}),x=editor(e);x.apply(selectBodyText(x.state,{start:0,end:5}));const copy=bodyTextClipboard(x.state,e)!;assert.equal(copy.text,'First');assert.equal(copy.paragraphs?.[0].runs[0].fontSize,32);assert.deepEqual(e.paragraphs?.[0].runs[0],{text:'First '});
});

test('empty text reports pending caret style without authoring placeholder content',()=>{
 const x=editor(element('text',{text:''}));x.apply(bodyFormat(x.state,{fontWeight:700,fontFamily:'Arial',fill:'#663399',baseline:'super',letterSpacing:1.25}));const context=bodyCaretContext(x.state,x.source);assert.equal(context.text,'');assert.equal(context.fontWeight,700);assert.equal(context.fill,'#663399');assert.equal(context.letterSpacing,1.25);assert.equal(context.runs?.[0].baseline,'super');assert.equal(bodyElement(x.state.doc,x.source).text,'');x.apply(bodyFormat(x.state,{fontWeight:400}));assert.equal(bodyCaretContext(x.state,x.source).fontWeight,400);x.apply(x.state.tr.insertText('A'));assert.equal(bodyElement(x.state.doc,x.source).runs?.[0].fontWeight,400);
});
test('a styled 2,000-cell table retains every row and style inside body text within the original paragraph schema',()=>{
 const rows=Array.from({length:100},(_,r)=>Array.from({length:20},(_,c)=>`A${r*20+c}B`)),html='<style>td{font:16px Arial}</style><table>'+rows.map(row=>'<tr>'+row.map(s=>'<td><b>'+s.slice(0,-1)+'</b><i>B</i></td>').join('')+'</tr>').join('')+'</table>',parsed=readHtmlClipboard(html)!;assert.equal(parsed.kind,'table');const payload=externalBodyClipboard(parsed);assert.equal(payload.text,rows.map(row=>row.join('\t')).join('\n'));assert.equal(payload.paragraphs?.length,100);assert(payload.paragraphs!.flatMap(p=>p.runs).length>5000);const x=editor(element('text',{text:''}));x.apply(pasteBodyText(x.state,payload));const result=bodyElement(x.state.doc,x.source);assert.equal(result.text,payload.text);assert.equal(result.paragraphs?.length,100);assert(result.paragraphs?.[99].runs.some(r=>r.text==='B'&&r.italic));
});
