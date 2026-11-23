import parseCss from 'css-tree/parser';
import generate from 'css-tree/generator';
import type {CssNode,Declaration} from 'css-tree';
import {compile,type Options} from 'css-select';
import type {DefaultTreeAdapterTypes as Html} from 'parse5';
import {htmlStyle,inheritHtmlStyle,htmlDeclaration,htmlLength,type HtmlStyle} from './html-clipboard-values';
export type HtmlNode=Html.Node;
export type HtmlElement=Html.Element;
export const isHtmlElement=(node:HtmlNode):node is HtmlElement=>'tagName'in node;
export const htmlChildren=(node:HtmlNode):HtmlNode[]=>'childNodes'in node?node.childNodes:[];
export const htmlAttribute=(node:HtmlElement,name:string)=>node.attrs.find(a=>a.name===name)?.value;
const parent=(node:HtmlNode)=>'parentNode'in node?node.parentNode:null;
const text=(node:HtmlNode):string=>'value'in node?node.value:htmlChildren(node).map(text).join('');
const adapter:NonNullable<Options<HtmlNode,HtmlElement>['adapter']>={isTag:isHtmlElement,getAttributeValue:htmlAttribute,getChildren:htmlChildren,getName:n=>n.tagName,getParent:parent,getSiblings:n=>{const p=parent(n);return p?htmlChildren(p):[n];},getText:text,hasAttrib:(n,key)=>htmlAttribute(n,key)!==undefined,removeSubsets:nodes=>{const all=new Set(nodes);return [...all].filter(n=>{for(let p=parent(n);p;p=parent(p))if(all.has(p))return false;return true;});}};
type Specificity=[number,number,number];
type Entry={property:string;value:string;important:boolean};
type Rule={match:(node:HtmlNode)=>boolean;declarations:Entry[];specificity:Specificity;order:number};
const children=(node:CssNode):CssNode[]=>'children'in node&&node.children?node.children.toArray():[];
const compare=(a:Specificity,b:Specificity)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2];
function specificity(node:CssNode):Specificity{
  if(node.type==='IdSelector')return [1,0,0];
  if(node.type==='ClassSelector'||node.type==='AttributeSelector')return [0,1,0];
  if(node.type==='TypeSelector')return node.name==='*'?[0,0,0]:[0,0,1];
  if(node.type==='PseudoElementSelector')return [0,0,1];
  if(node.type==='PseudoClassSelector'){
    if(node.name==='where')return [0,0,0];
    const nested=children(node).map(specificity).sort(compare).at(-1)??[0,0,0];
    if(['is','not','has'].includes(node.name))return nested;
    return [nested[0],nested[1]+1,nested[2]];
  }
  if(node.type==='Nth')return node.selector?specificity(node.selector):[0,0,0];
  const values=children(node).map(specificity);
  if(node.type==='SelectorList')return values.sort(compare).at(-1)??[0,0,0];
  return values.reduce<Specificity>((a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],[0,0,0]);
}
function entries(node:CssNode):Entry[]{return children(node).filter((n):n is Declaration=>n.type==='Declaration').map(n=>({property:n.property.toLowerCase(),value:generate(n.value),important:Boolean(n.important)}));}
function boundedSelector(root:CssNode){
  const permitted=new Set(['root','empty','first-child','last-child','only-child','first-of-type','last-of-type','only-of-type','nth-child','nth-last-child','nth-of-type','nth-last-of-type','is','not','where']);
  const stack=[{node:root,depth:0}];let count=0,combinators=0;
  while(stack.length){const {node,depth}=stack.pop()!;if(++count>64||depth>8)return false;
    if(node.type==='Combinator'&&++combinators>8)return false;
    if(node.type==='PseudoElementSelector')return false;
    if(node.type==='PseudoClassSelector'){const name=node.name.replace(/\\([\da-f]{1,6})\s?|\\(.)/gi,(_,hex,letter)=>hex?String.fromCodePoint(Math.min(0x10ffff,parseInt(hex,16))):letter).toLowerCase();if(!permitted.has(name))return false;}
    for(const child of children(node))stack.push({node:child,depth:depth+1});
    if(node.type==='Nth'&&node.selector)stack.push({node:node.selector,depth:depth+1});
  }return true;
}
function ruleKey(selector:CssNode){
  const parts=children(selector);let start=0;parts.forEach((n,i)=>{if(n.type==='Combinator')start=i+1;});const tail=parts.slice(start);
  const id=tail.find(n=>n.type==='IdSelector');if(id?.type==='IdSelector')return '#'+id.name;
  const cls=tail.find(n=>n.type==='ClassSelector');if(cls?.type==='ClassSelector')return '.'+cls.name;
  const tag=tail.find(n=>n.type==='TypeSelector');return tag?.type==='TypeSelector'?tag.name.toLowerCase():'*';
}
/** A static tree and selector engine; no DOM attachment, scripts, URLs or font loading. */
export function clipboardCss(elements:HtmlElement[]){
  const index=new Map<string,Rule[]>(),cache=new WeakMap<HtmlElement,HtmlStyle>();let count=0,attempts=0;
  for(const sheet of elements.filter(e=>e.tagName==='style')){
    let ast:CssNode;try{ast=parseCss(text(sheet),{context:'stylesheet'});}catch{continue;}
    for(const node of children(ast)){
      // @import, @font-face and conditional styles never cause external I/O.
      if(node.type!=='Rule'||node.prelude?.type!=='SelectorList')continue;
      const declarations=entries(node.block);if(declarations.length>1000)throw Error('This clipboard has too much formatting. Copy a smaller range.');
      for(const selector of children(node.prelude)){
        if(++count>1000)throw Error('This clipboard has too much formatting. Copy a smaller range.');
        const source=generate(selector);if(source.length>512||!boundedSelector(selector))continue;
        let match:(node:HtmlNode)=>boolean;try{match=compile<HtmlNode,HtmlElement>(source,{adapter,xmlMode:false,relativeSelector:false});}catch{continue;}
        const key=ruleKey(selector),rule={match,declarations,specificity:specificity(selector),order:count};index.set(key,[...index.get(key)??[],rule]);
      }
    }
  }
  function style(node:HtmlElement):HtmlStyle{
    const prior=cache.get(node);if(prior)return prior;
    const p=parent(node),inherited=p&&isHtmlElement(p)?style(p):htmlStyle,result=inheritHtmlStyle(inherited),tag=node.tagName;
    if(tag==='b'||tag==='strong'||/^h[1-6]$/.test(tag)||tag==='th')result.fontWeight=700;
    if(tag==='i'||tag==='em'||tag==='cite'||tag==='var')result.italic=true;
    if(tag==='u'||tag==='ins')result.underline=true;
    if(tag==='s'||tag==='strike'||tag==='del')result.strikethrough=true;
    if(tag==='pre')result.whiteSpace='pre';
    if(tag==='sub'||tag==='sup'){result.baseline=tag==='sub'?'sub':'super';result.fontSize=(inherited.fontSize??16)*.8333333333;}
    if(tag==='small')result.fontSize=(inherited.fontSize??16)*.8333333333;
    if(tag==='th')result.align='center';
    const hints:Entry[]=[];
    for(const [attr,property]of [['face','font-family'],['color','color'],['bgcolor','background-color'],['align','text-align'],['valign','vertical-align'],['width','width'],['height','height']]as const){const value=htmlAttribute(node,attr);if(value!==undefined)hints.push({property,value,important:false});}
    if(tag==='font'){const size=Number(htmlAttribute(node,'size'));if(Number.isInteger(size)&&size>=1&&size<=7)hints.push({property:'font-size',value:[10,13,16,18,24,32,48][size-1]+'px',important:false});}
    if(tag==='td'||tag==='th'){
      let table=parent(node);while(table&&(!isHtmlElement(table)||table.tagName!=='table'))table=parent(table);
      if(table&&isHtmlElement(table)){const padding=htmlAttribute(table,'cellpadding'),border=Number(htmlAttribute(table,'border'));if(padding!==undefined&&htmlLength(padding)!==undefined)hints.push({property:'padding',value:padding,important:false});if(Number.isFinite(border)&&border>0&&border<=100)hints.push({property:'border',value:`${border}px solid`,important:false});}
    }
    const keys=['*',tag,...(htmlAttribute(node,'class')??'').split(/\s+/).filter(Boolean).map(c=>'.'+c)];const id=htmlAttribute(node,'id');if(id)keys.push('#'+id);
    const candidates=new Set(keys.flatMap(key=>index.get(key)??[])),matches:Rule[]=[];
    for(const rule of candidates){if(++attempts>200000)throw Error('This clipboard has too much formatting. Copy a smaller range.');if(rule.match(node))matches.push(rule);}
    matches.sort((a,b)=>compare(a.specificity,b.specificity)||a.order-b.order);
    let inline:Entry[]=[];const attr=htmlAttribute(node,'style');if(attr){try{inline=entries(parseCss(attr,{context:'declarationList'}));}catch{/* Keep visible text when an optional inline declaration is malformed. */}}
    const declarations=[...hints,...matches.flatMap(r=>r.declarations.filter(d=>!d.important)),...inline.filter(d=>!d.important),...matches.flatMap(r=>r.declarations.filter(d=>d.important)),...inline.filter(d=>d.important)];
    // Relative spacing and currentColor use the final font/color, independently
    // of where those declarations appeared in a source rule.
    for(const d of declarations)if(d.property==='font'||d.property.startsWith('font-')||d.property==='color')htmlDeclaration(result,d.property,d.value,inherited);
    for(const d of declarations)if(d.property!=='font'&&!d.property.startsWith('font-')&&d.property!=='color')htmlDeclaration(result,d.property,d.value,inherited);
    if(htmlAttribute(node,'hidden')!==undefined)result.hidden=true;
    cache.set(node,result);return result;
  }
  return style;
}
