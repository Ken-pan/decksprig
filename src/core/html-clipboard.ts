import {parse,parseFragment,type DefaultTreeAdapterTypes as Html} from 'parse5';
import {clipboardCss,htmlChildren,htmlAttribute,isHtmlElement,type HtmlNode,type HtmlElement} from './html-clipboard-css';
import {htmlStyle,type HtmlStyle} from './html-clipboard-values';
import {TableStyleSchema,validateTableStyle,type TableTextRun,type TableCellStyle,type TableStyle} from './table-schema';
import {tableCells} from './object-data';
export type HtmlClipboardText={kind:'text';text:string;runs:TableTextRun[]};
export type HtmlClipboardTable={kind:'table';cells:string[][];tableStyle:TableStyle};
export type HtmlClipboard=HtmlClipboardText|HtmlClipboardTable;
const ignored=new Set(['head','script','style','link','meta','base','iframe','frame','object','embed','svg','math','template','xml','noscript']);
const blocks=new Set(['p','div','section','article','main','header','footer','aside','blockquote','address','pre','h1','h2','h3','h4','h5','h6','li','dt','dd','dl','ul','ol']);
const textKeys=['fontFamily','fontSize','fontWeight','italic','underline','strikethrough','color','letterSpacing','baseline']as const;
function run(style:HtmlStyle,text:string):TableTextRun{return {text,...Object.fromEntries(textKeys.filter(k=>style[k]!==undefined).map(k=>[k,style[k]]))};}
function same(a:TableTextRun,b:TableTextRun){return textKeys.every(key=>a[key]===b[key]);}
class TextBuffer{
  runs:TableTextRun[]=[];length=0;automaticBreak=false;preservedTail=false;
  constructor(private limit:number){}
  append(text:string,style:HtmlStyle,preserve=false){
    text=text.replace(/\r\n?/g,'\n');
    if(!preserve&&!['pre','pre-wrap','break-spaces'].includes(style.whiteSpace)){
      text=style.whiteSpace==='pre-line'?text.replace(/[\t\f ]+/g,' ').replace(/ *\n */g,'\n'):text.replace(/[\t\n\f ]+/g,' ');
      if(!this.length||/[ \n]$/.test(this.runs.at(-1)?.text??''))text=text.replace(/^ +/,'');
    }
    if(!text)return;if(this.length+text.length>this.limit)throw Error(this.limit===5000?'Keep each cell under 5,000 characters.':'Paste up to 50,000 characters of text.');
    const next=run(style,text),last=this.runs.at(-1);if(last&&same(last,next))last.text+=text;else this.runs.push(next);this.length+=text.length;this.automaticBreak=false;
    this.preservedTail=preserve||['pre','pre-wrap','break-spaces'].includes(style.whiteSpace);
    if(this.runs.length>5000)throw Error('This clipboard has too many text styles. Copy a smaller range.');
  }
  trimSpace(){if(this.preservedTail)return;while(this.runs.length){const last=this.runs.at(-1)!,trimmed=last.text.replace(/ +$/,'');this.length-=last.text.length-trimmed.length;last.text=trimmed;if(last.text)break;this.runs.pop();}}
  line(style:HtmlStyle,explicit=false,empty=false){this.trimSpace();if(explicit||empty||this.length&&!this.runs.at(-1)?.text.endsWith('\n')){this.append('\n',style,true);this.automaticBreak=!explicit;}}
  finish():HtmlClipboardText{
    this.trimSpace();if(this.automaticBreak&&this.runs.at(-1)?.text.endsWith('\n')){this.runs.at(-1)!.text=this.runs.at(-1)!.text.slice(0,-1);this.length--;if(!this.runs.at(-1)!.text)this.runs.pop();}
    return {kind:'text',text:this.runs.map(r=>r.text).join(''),runs:this.runs};
  }
}
function cfHtml(raw:string){
  if(!/^\s*Version:\d/i.test(raw))return {html:raw,start:0,end:raw.length};
  const offset=(name:string)=>Number(raw.match(new RegExp(`(?:^|[\\r\\n])${name}:(\\d+)`))?.[1]),start=offset('StartHTML'),end=offset('EndHTML'),a=offset('StartFragment'),b=offset('EndFragment'),bytes=new TextEncoder().encode(raw);
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>bytes.length)throw Error('The clipboard HTML is incomplete. Copy the range again.');
  const decode=(x:number,y:number)=>new TextDecoder().decode(bytes.subarray(x,y)),html=decode(start,end);
  return {html,start:Number.isSafeInteger(a)&&a>=start&&a<=end?decode(start,a).length:0,end:Number.isSafeInteger(b)&&b>=a&&b<=end?decode(start,b).length:html.length};
}
/** Read visible clipboard data into typed values. Source markup never enters a DOM. */
export function readHtmlClipboard(raw:string):HtmlClipboard|undefined{
  if(!raw.trim())return;if(raw.length>2_000_000)throw Error('Paste up to 2 MB of formatted content. Copy a smaller range.');
  const source=cfHtml(raw),doc=parse(source.html,{sourceCodeLocationInfo:true}),sheets:HtmlElement[]=[],elements:HtmlElement[]=[],comments:Html.CommentNode[]=[];
  let count=0;const stack:{node:HtmlNode;depth:number;inert:boolean}[]=[{node:doc,depth:0,inert:false}];
  while(stack.length){const {node,depth,inert}=stack.pop()!;if(++count>30000||depth>128)throw Error('This clipboard is too complex. Copy a smaller range.');
    if(isHtmlElement(node)){elements.push(node);if(node.tagName==='style'&&!inert)sheets.push(node);}
    if(node.nodeName==='#comment')comments.push(node as Html.CommentNode);
    const template=isHtmlElement(node)&&node.tagName==='template';for(const child of htmlChildren(node))stack.push({node:child,depth:depth+1,inert:inert||template});
    if(template&&'content'in node)stack.push({node:node.content,depth:depth+1,inert:true});
  }
  const first=comments.find(n=>n.data.trim()==='StartFragment'),last=comments.find(n=>n.data.trim()==='EndFragment'&&(n.sourceCodeLocation?.startOffset??0)>(first?.sourceCodeLocation?.endOffset??0));
  if(first?.sourceCodeLocation&&last?.sourceCodeLocation){source.start=first.sourceCodeLocation.endOffset;source.end=last.sourceCodeLocation.startOffset;}
  const selected=(node:HtmlNode)=>{const loc=node.sourceCodeLocation;return !loc||loc.endOffset>source.start&&loc.startOffset<source.end;};
  const style=clipboardCss(sheets),tables=new Map<HtmlElement,HtmlClipboardTable>();
  const allowed=(node:HtmlElement)=>selected(node)&&!ignored.has(node.tagName)&&!style(node).hidden;
  function textValue(node:Html.TextNode){
    const loc=node.sourceCodeLocation;if(!loc||loc.startOffset>=source.start&&loc.endOffset<=source.end)return node.value;
    const raw=source.html.slice(Math.max(source.start,loc.startOffset),Math.min(source.end,loc.endOffset)),p=node.parentNode;
    const parsed=p&&isHtmlElement(p)?parseFragment(p,raw,{}):parseFragment(raw);const collect=(n:HtmlNode):string=>'value'in n?n.value:htmlChildren(n).map(collect).join('');return collect(parsed);
  }
  function readText(root:HtmlNode,limit=5000,excludeTables=false):HtmlClipboardText{
    const buffer=new TextBuffer(limit);
    function visit(node:HtmlNode,inherited:HtmlStyle){
      if(!selected(node))return;
      if('value'in node){if(inherited.visible)buffer.append(textValue(node),inherited);return;}
      if(!isHtmlElement(node)){for(const child of htmlChildren(node))visit(child,inherited);return;}
      if(!allowed(node))return;const own=style(node),tag=node.tagName;
      if(tag==='br'){if(own.visible)buffer.line(own,true);return;}
      if(tag==='table'){
        if(excludeTables)return;const table=readTable(node);buffer.line(own);
        for(let r=0;r<table.cells.length;r++){if(r)buffer.line(own,true);for(let c=0;c<table.cells[r].length;c++){if(c)buffer.append('\t',own,true);const runs=table.tableStyle.cellStyles?.find(s=>s.row===r&&s.column===c)?.runs??[{text:table.cells[r][c]}];for(const item of runs)buffer.append(item.text,{...own,...item},true);}}
        buffer.line(own);return;
      }
      const block=blocks.has(tag);if(block)buffer.line(own);const before=buffer.length;
      for(const child of htmlChildren(node))visit(child,own);
      if(block)buffer.line(own,false,buffer.length===before);
    }
    visit(root,isHtmlElement(root)?style(root):htmlStyle);return buffer.finish();
  }
  function readTable(table:HtmlElement):HtmlClipboardTable{
    const cached=tables.get(table);if(cached)return cached;
    const rows:HtmlElement[]=[],columnSizes:number[]=[];
    function collect(node:HtmlNode){for(const child of htmlChildren(node)){if(!isHtmlElement(child)||!allowed(child))continue;if(child.tagName==='caption'&&readText(child).text.trim())throw Error('Copy the table cells without the caption, or use Paste as text.');if(child.tagName==='table')throw Error('Nested tables are not supported. Copy one flat range at a time.');if(child.tagName==='tr'){if(style(child).visible)rows.push(child);}else if(child.tagName==='col'){if(style(child).width){const span=Number(htmlAttribute(child,'span')??1);if(!Number.isInteger(span)||span<1||span>20)throw Error('Use at most 20 columns.');columnSizes.push(...Array<number>(span).fill(style(child).width!));}}else collect(child);}}
    collect(table);if(rows.length>100)throw Error('Use at most 100 rows.');if(!rows.length)throw Error('Copy at least one visible table row.');
    const cells:string[][]=Array.from({length:rows.length},()=>[]),occupied=new Set<string>(),styles:TableCellStyle[]=[],merges:NonNullable<TableStyle['merges']>=[],rowSizes:number[]=[];
    let totalText=0,width=0;
    for(const [r,row]of rows.entries()){
      rowSizes.push(style(row).height??0);let c=0;
      for(const cell of htmlChildren(row).filter((n):n is HtmlElement=>isHtmlElement(n)&&(n.tagName==='td'||n.tagName==='th')&&allowed(n))){
        const descendants=[...htmlChildren(cell)];while(descendants.length){const child=descendants.pop()!;if(isHtmlElement(child)&&child.tagName==='table'&&allowed(child))throw Error('Nested tables are not supported. Copy one flat range at a time.');descendants.push(...htmlChildren(child));}
        while(occupied.has(`${r}:${c}`))c++;
        const span=(attr:string,maximum:number)=>{const raw=htmlAttribute(cell,attr);if(raw===undefined)return 1;if(!/^\d+$/.test(raw))return 1;const n=Number(raw);if(!Number.isSafeInteger(n)||n>maximum)throw Error('The pasted range exceeds 100 rows or 20 columns.');return n;};
        const colspan=Math.max(1,span('colspan',20)),requested=span('rowspan',100),sameGroup=rows.slice(r).filter(n=>n.parentNode===row.parentNode).length,rowspan=requested===0?sameGroup:Math.min(requested,sameGroup);
        if(c+colspan>20)throw Error('Use at most 20 columns.');
        for(let y=r;y<r+rowspan;y++)for(let x=c;x<c+colspan;x++){const key=`${y}:${x}`;if(occupied.has(key))throw Error('The copied merged cells overlap. Copy a rectangular range again.');occupied.add(key);cells[y][x]='';}
        if(rowspan>1||colspan>1)merges.push({row:r,column:c,rowSpan:rowspan,columnSpan:colspan});
        // Reading a cell's contents rather than the cell wrapper avoids an extra
        // block separator while preserving supplied child paragraph breaks.
        const value=readText(cell),s=style(cell);cells[r][c]=value.text;totalText+=value.text.length;if(totalText>250000)throw Error('Paste up to 250 KB of cell data.');
        const local:TableCellStyle={row:r,column:c,...(s.fill?{fill:s.fill}:{}),...(s.color?{color:s.color}:{}),...(s.fontFamily?{fontFamily:s.fontFamily}:{}),...(s.fontSize!==undefined&&s.fontSize>=4&&s.fontSize<=500?{fontSize:s.fontSize}:{}),...(s.fontWeight!==undefined?{fontWeight:Math.round(s.fontWeight)}:{}),italic:s.italic,underline:s.underline,strikethrough:s.strikethrough,...(s.align?{align:s.align}:{}),...(s.verticalAlign?{verticalAlign:s.verticalAlign}:{}),...(s.insets?{insets:{...s.insets}}:{}),...(s.edges?{edges:structuredClone(s.edges)}:{}),...(value.runs.length?{runs:value.runs}:{})};styles.push(local);
        c+=colspan;width=Math.max(width,c);
      }
      width=Math.max(width,c,cells[r].length);
    }
    if(!width)throw Error('Copy at least one visible table cell.');for(const row of cells)for(let c=0;c<width;c++)row[c]??='';
    const tableStyle=TableStyleSchema.parse({headerRow:false,borders:'none',bodyFill:'transparent',padding:0,numericAlign:false,cellStyles:styles,...(merges.length?{merges}:{}),...(columnSizes.length===width&&columnSizes.every(n=>n>0)?{columnWidths:columnSizes}:{}),...(rowSizes.every(n=>n>0)?{rowHeights:rowSizes}:{})});
    tableCells(cells);validateTableStyle(cells,tableStyle);const result:HtmlClipboardTable={kind:'table',cells,tableStyle};tables.set(table,result);return result;
  }
  const roots=elements.filter(e=>e.tagName==='table'&&allowed(e)&&!hasTableAncestor(e));
  function hasTableAncestor(node:HtmlElement){for(let p=node.parentNode;p;p='parentNode'in p?p.parentNode:null)if(isHtmlElement(p)&&p.tagName==='table'&&allowed(p))return true;return false;}
  if(roots.length===1&&!readText(doc,50000,true).text.trim())return readTable(roots[0]);
  const result=readText(doc,50000);return result.text?result:undefined;
}
