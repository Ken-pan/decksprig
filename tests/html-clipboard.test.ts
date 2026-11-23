import test from 'node:test';
import assert from 'node:assert/strict';
import {readHtmlClipboard} from '../src/core/html-clipboard';
import {htmlColor,htmlLength} from '../src/core/html-clipboard-values';
import {pasteHtmlTable} from '../src/core/html-table-paste';
import {element,blankSlide,newDeck,validateDeck} from '../src/core/model';
import {applyImmutableOperations} from '../src/core/operations';

test('semantic emphasis can be reset or explicitly inherited and expensive selectors remain inert',()=>{
  const result=readHtmlClipboard(String.raw`<style>p:contains(A){color:red}p:h\61 s(span){color:red}p:is(.selected){color:blue}</style><p class="selected" style="font-size:24px;font-weight:500"><b style="font-weight:inherit">A</b><sup style="font-size:inherit;vertical-align:baseline">B</sup><i style="font-style:initial">C</i><strong style="font-weight:unset">D</strong></p>`);
  assert.equal(result?.kind,'text');if(result?.kind!=='text')return;
  assert.equal(result.text,'ABCD');assert(result.runs.every(r=>r.color==='#0000ff'&&r.fontSize===24&&r.fontWeight===500&&r.baseline==='normal'&&!r.italic));
});
test('a positive rowspan is clipped to its row group instead of covering a following body',()=>{
  const source=readHtmlClipboard('<table><tbody><tr><td rowspan="3">First group</td></tr><tr></tr></tbody><tbody><tr><td>Next group</td></tr></tbody></table>');assert.equal(source?.kind,'table');if(source?.kind!=='table')return;
  assert.deepEqual(source.cells,[['First group'],[''],['Next group']]);assert.deepEqual(source.tableStyle.merges,[{row:0,column:0,rowSpan:2,columnSpan:1}]);
});

test('external HTML table retains class cascade, merged cells, supplied typography and physical units',()=>{
  const parsed=readHtmlClipboard(`<html><head><style>table{font-family:Arial;font-size:12pt;color:#123456}td{padding:2pt 6px;border:1px solid red}.lead{font-weight:bold}tr:nth-child(even){background:#eef0e8}#special{color:blue!important}</style></head><body><table><colgroup><col width="80"><col style="width:120px"></colgroup><tr height="30"><td rowspan="2" class="lead">Q1 中文</td><td>A <em>clear</em> result</td></tr><tr height="60"><td id="special" style="color:red"><u>42</u><sup>2</sup></td></tr></table></body></html>`);
  assert.equal(parsed?.kind,'table');if(parsed?.kind!=='table')return;
  assert.deepEqual(parsed.cells,[['Q1 中文','A clear result'],['','422']]);assert.deepEqual(parsed.tableStyle.merges,[{row:0,column:0,rowSpan:2,columnSpan:1}]);
  assert.deepEqual(parsed.tableStyle.columnWidths,[80,120]);assert.deepEqual(parsed.tableStyle.rowHeights,[30,60]);
  const first=parsed.tableStyle.cellStyles![0],emphasis=parsed.tableStyle.cellStyles![1],last=parsed.tableStyle.cellStyles![2];
  assert.equal(first.fontFamily,'Arial');assert.equal(first.fontSize,16);assert.equal(first.fontWeight,700);assert.equal(first.color,'#123456');assert.deepEqual(first.insets,{top:8/3,right:6,bottom:8/3,left:6});assert.deepEqual(first.edges!.top,{width:1,color:'#ff0000',style:'solid'});
  assert(emphasis.runs!.some(r=>r.text==='clear'&&r.italic));assert.equal(last.fill,'#eef0e8');assert.equal(last.color,'#0000ff');assert(last.runs!.some(r=>r.text==='2'&&r.baseline==='super'));
});
test('inline HTML keeps Unicode, line breaks, adjacent emphasis and preformatted whitespace without markup',()=>{
  const result=readHtmlClipboard('<p>Hello <b>bold</b> 中文🙂 &amp; <s>old</s><br>Next</p><p><br></p><pre>  A\tB  </pre>');
  assert.equal(result?.kind,'text');if(result?.kind!=='text')return;
  assert.equal(result.text,'Hello bold 中文🙂 & old\nNext\n\n  A\tB  ');assert.equal(result.runs.map(r=>r.text).join(''),result.text);assert(result.runs.some(r=>r.text==='bold'&&r.fontWeight===700));assert(result.runs.some(r=>r.text==='old'&&r.strikethrough));
});
test('CF_HTML uses UTF-8 byte offsets and fragment selection retains ancestor styling without outside data',()=>{
  const html='<html><head><style>td{color:rgb(12, 34, 56)}</style></head><body>Before 中文<table><tr><td>outside</td><!--StartFragment--><td><b>选中🙂</b></td><!--EndFragment--></tr></table>After</body></html>';
  const header=(start:number,end:number,a:number,b:number)=>`Version:1.0\r\nStartHTML:${String(start).padStart(10,'0')}\r\nEndHTML:${String(end).padStart(10,'0')}\r\nStartFragment:${String(a).padStart(10,'0')}\r\nEndFragment:${String(b).padStart(10,'0')}\r\n`;
  const length=Buffer.byteLength(header(0,0,0,0)),a=html.indexOf('<!--StartFragment-->')+20,b=html.indexOf('<!--EndFragment-->'),value=header(length,length+Buffer.byteLength(html),length+Buffer.byteLength(html.slice(0,a)),length+Buffer.byteLength(html.slice(0,b)))+html;
  const result=readHtmlClipboard(value);assert.equal(result?.kind,'table');if(result?.kind!=='table')return;assert.deepEqual(result.cells,[['选中🙂']]);assert.equal(result.tableStyle.cellStyles![0].color,'#0c2238');
});
test('scripts, external assets, forms and event attributes never become executable or stored content',()=>{
  const html='<script>globalThis.__clipboardExecuted=true</script><link rel="stylesheet" href="https://example.invalid/asset"><style>@import url(https://example.invalid/css);p{color:rebeccapurple}</style><p onclick="alert(1)">Safe<img src="https://example.invalid/image" onerror="alert(1)"><iframe src="https://example.invalid/frame">Hidden</iframe><span style="display:none">Secret</span> text</p>';
  const result=readHtmlClipboard(html);assert.equal(result?.kind,'text');if(result?.kind!=='text')return;assert.equal(result.text,'Safe text');assert(result.runs.every(r=>r.color==='#663399'));assert.equal((globalThis as {__clipboardExecuted?:boolean}).__clipboardExecuted,undefined);assert(!JSON.stringify(result).includes('example.invalid'));assert(!JSON.stringify(result).includes('onclick'));
});
test('mixed text and multiple tables remain complete text rather than dropping context or choosing a table silently',()=>{
  const result=readHtmlClipboard('<p>Before</p><table><tr><td>A</td><td>B</td></tr></table><p>Between</p><table><tr><td>C</td></tr></table><p>After</p>');
  assert.equal(result?.kind,'text');if(result?.kind!=='text')return;assert.equal(result.text,'Before\nA\tB\nBetween\nC\nAfter');
});
test('empty cells, sparse rows and rowSpan zero retain a bounded rectangular model',()=>{
  const result=readHtmlClipboard('<table><tbody><tr><td rowspan="0">Keep</td><td></td></tr><tr><td>Last</td></tr></tbody></table>');assert.equal(result?.kind,'table');if(result?.kind!=='table')return;assert.deepEqual(result.cells,[['Keep',''],['','Last']]);assert.equal(result.tableStyle.merges![0].rowSpan,2);
  const empty=readHtmlClipboard('<table><tr><td></td></tr></table>');assert.equal(empty?.kind,'table');if(empty?.kind==='table')assert.deepEqual(empty.cells,[['']]);
});
test('malformed or excessive clipboard structures are rejected before an editable result exists',()=>{
  assert.throws(()=>readHtmlClipboard('<table><tr>'+('<td>x</td>'.repeat(21))+'</tr></table>'),/20 columns/);
  assert.throws(()=>readHtmlClipboard('<table>'+('<tr><td>x</td></tr>'.repeat(101))+'</table>'),/100 rows/);
  assert.throws(()=>readHtmlClipboard('<table><tr><td>'+('x'.repeat(5001))+'</td></tr></table>'),/5,000/);
  assert.throws(()=>readHtmlClipboard('<div>'.repeat(130)+'x'+'</div>'.repeat(130)),/complex/);
  assert.throws(()=>readHtmlClipboard('x'.repeat(2_000_001)),/2 MB/);
  assert.throws(()=>readHtmlClipboard('<table><tr><td><table><tr><td>Nested</td></tr></table></td></tr></table>'),/Nested tables/);
});
test('static CSS colors and print lengths convert without executing expressions or accepting partial alpha',()=>{
  assert.equal(htmlColor('rgb(100%, 0%, 0%)'),'#ff0000');assert.equal(htmlColor('hsl(120 100% 25%)'),'#008000');assert.equal(htmlColor('#0f08'),undefined);assert.equal(htmlColor('rgba(0 0 0 / 0)'),'transparent');assert.equal(htmlColor('rgba(0 0 0 / .5)'),undefined);assert.equal(htmlColor('url(https://example.invalid)'),undefined);assert.equal(htmlLength('12pt'),16);assert.equal(htmlLength('2em',20),40);assert.equal(htmlLength('calc(1px + 2px)'),undefined);
});

test('rich grid paste repeats source styles and merges atomically while preserving unrelated data and appearance',()=>{
  const source=readHtmlClipboard('<table><tr><td colspan="2" style="background:#ffeecc;color:blue"><b>Value</b></td></tr><tr><td>A</td><td><i>B</i></td></tr></table>');assert.equal(source?.kind,'table');if(source?.kind!=='table')return;
  const target=element('table',{cells:Array.from({length:5},(_,r)=>Array.from({length:5},(_,c)=>`Old ${r}:${c}`)),tableStyle:{bodyFill:'#fafafa',headerRow:false,cellStyles:[{row:4,column:4,color:'#abc123',runs:[{text:'Old 4:4',italic:true}]}],merges:[{row:0,column:0,rowSpan:1,columnSpan:2}]}}),before=JSON.stringify(target),copied=JSON.stringify(source);
  const patch=pasteHtmlTable(target,source,{anchor:{row:0,column:0},head:{row:3,column:3}});assert.equal(patch.rows,4);assert.equal(patch.columns,4);assert.equal(patch.cells[3][3],'B');assert.equal(patch.cells[4][4],'Old 4:4');assert.equal(patch.tableStyle.merges!.length,4);assert.deepEqual(patch.tableStyle.cellStyles!.find(s=>s.row===4&&s.column===4),target.tableStyle!.cellStyles![0]);assert(patch.tableStyle.cellStyles!.find(s=>s.row===3&&s.column===3)!.runs!.some(r=>r.italic));
  const s=blankSlide();s.elements=[target];const d=newDeck('HTML paste',[s]);for(const actor of ['manual','ai']as const){const next=applyImmutableOperations(d,[{op:'update_element',slideId:s.id,elementId:target.id,patch:{cells:patch.cells,tableStyle:patch.tableStyle}}],d.revision,actor);validateDeck(next);assert.equal(next.revision,1);assert.equal(next.slides[0].elements[0].cells![0][0],'Value');}assert.equal(JSON.stringify(target),before);assert.equal(JSON.stringify(source),copied);
});

test('pasting a formatted empty cell clears text, keeps unrelated formatting and updates only a shared boundary edge',()=>{
  const source=readHtmlClipboard('<table><tr><td style="background:yellow;border-left:2px dashed blue"></td></tr></table>');assert.equal(source?.kind,'table');if(source?.kind!=='table')return;
  const e=element('table',{cells:[['Neighbor','Old']],tableStyle:{headerRow:false,cellStyles:[{row:0,column:0,color:'#123456',edges:{right:{width:5,color:'#000000',style:'solid'}}},{row:0,column:1,runs:[{text:'Old',italic:true}]}]}}),next=pasteHtmlTable(e,source,{anchor:{row:0,column:1},head:{row:0,column:1}});
  assert.deepEqual(next.cells,[['Neighbor','']]);const neighbor=next.tableStyle.cellStyles!.find(s=>s.column===0)!,pasted=next.tableStyle.cellStyles!.find(s=>s.column===1)!;assert.equal(neighbor.color,'#123456');assert.deepEqual(neighbor.edges!.right,{width:2,color:'#0000ff',style:'dashed'});assert.equal(pasted.fill,'#ffff00');assert(!pasted.runs);
});

test('a rich range exceeding destination bounds or mismatching a selection leaves both inputs untouched',()=>{
  const source=readHtmlClipboard('<table><tr><td>A</td><td>B</td></tr></table>');assert.equal(source?.kind,'table');if(source?.kind!=='table')return;const e=element('table',{cells:[['Before']]}),a=JSON.stringify(e),b=JSON.stringify(source);
  assert.throws(()=>pasteHtmlTable(e,source,{anchor:{row:0,column:19},head:{row:0,column:19}}),/20 columns/);assert.throws(()=>pasteHtmlTable(e,source,{anchor:{row:0,column:0},head:{row:0,column:2}}),/matching/);assert.equal(JSON.stringify(e),a);assert.equal(JSON.stringify(source),b);
});

test('a visible table caption is rejected with recovery instead of silently discarding source text',()=>{assert.throws(()=>readHtmlClipboard('<table><caption>Important context</caption><tr><td>Data</td></tr></table>'),/without the caption/);});
