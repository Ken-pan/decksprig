import names from 'color-name';
import type {TableEdge,TableInsets,TableEdges,TableTextRun} from './table-schema';
export type HtmlTextStyle=Omit<TableTextRun,'text'>;
type Border={width:number;color:string;style:TableEdge['style']|'none'};
export type HtmlStyle=HtmlTextStyle&{whiteSpace:string;hidden:boolean;visible:boolean;fill?:string;width?:number;height?:number;align?:'left'|'center'|'right';verticalAlign?:'top'|'middle'|'bottom';insets?:TableInsets;edges?:TableEdges;borders?:Partial<Record<'top'|'right'|'bottom'|'left',Border>>};
export const htmlStyle:HtmlStyle={fontWeight:400,italic:false,underline:false,strikethrough:false,baseline:'normal',whiteSpace:'normal',hidden:false,visible:true};
const bound=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const number=(raw:string)=>/^[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?$/i.test(raw)?Number(raw):NaN;
/** Only static color values; partial alpha is not representable by cell styles. */
export function htmlColor(value:string):string|undefined{
  const raw=value.trim().toLowerCase();if(raw==='transparent')return raw;
  if(Object.hasOwn(names,raw)){const rgb=names[raw as keyof typeof names];return '#'+rgb.map(n=>n.toString(16).padStart(2,'0')).join('');}
  const hex=raw.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i);if(hex){let s=hex[1];if(s.length<5)s=[...s].map(c=>c+c).join('');if(s.length===8){if(s.slice(6)==='00')return 'transparent';if(s.slice(6)!=='ff')return;}return '#'+s.slice(0,6);}
  const match=raw.match(/^(rgba?|hsla?)\(([^()]*)\)$/);if(!match)return;
  const parts=match[2].trim().replace(/\s*[,/]\s*/g,' ').split(/\s+/);if(parts.length<3||parts.length>4)return;
  if(parts[3]!==undefined){const alpha=parts[3].endsWith('%')?number(parts[3].slice(0,-1))/100:number(parts[3]);if(alpha<=0)return 'transparent';if(!Number.isFinite(alpha)||alpha<1)return;}
  let rgb:number[];
  if(match[1].startsWith('rgb'))rgb=parts.slice(0,3).map(s=>s.endsWith('%')?number(s.slice(0,-1))*2.55:number(s));
  else{
    const hue=parts[0].match(/^([-+\d.e]+)(deg|turn|rad|grad)?$/i);if(!hue||!parts[1].endsWith('%')||!parts[2].endsWith('%'))return;
    let h=number(hue[1]);h*=hue[2]==='turn'?360:hue[2]==='rad'?180/Math.PI:hue[2]==='grad'?.9:1;h=((h%360)+360)%360/360;
    const s=bound(number(parts[1].slice(0,-1))/100,0,1),l=bound(number(parts[2].slice(0,-1))/100,0,1),a=s*Math.min(l,1-l);
    rgb=[0,8,4].map(n=>{const k=(n+h*12)%12;return 255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)));});
  }
  return rgb.every(Number.isFinite)?'#'+rgb.map(n=>Math.round(bound(n,0,255)).toString(16).padStart(2,'0')).join(''):undefined;
}
/** HTML pixels and print units share the editor's authored pixel coordinate system. */
export function htmlLength(raw:string,parent=16):number|undefined{
  const m=raw.trim().toLowerCase().match(/^([-+]?(?:\d*\.)?\d+)(px|pt|pc|in|cm|mm|q|em|rem|%)?$/);if(!m)return;
  const scale:Record<string,number>={px:1,pt:96/72,pc:16,in:96,cm:96/2.54,mm:96/25.4,q:96/101.6,em:parent,rem:16,'%':parent/100};
  const n=Number(m[1])*(scale[m[2]??'px']);return Number.isFinite(n)?n:undefined;
}
function family(raw:string){const first=raw.match(/^(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|([^,]+))/)?.slice(1).find(x=>x!==undefined)?.trim();if(!first||first.length>100||/[\u0000-\u001f]/.test(first)||/^(inherit|initial|unset|revert)$/i.test(first))return;return first.replace(/\\([\da-f]{1,6})\s?|\\(.)/gi,(_,hex,letter)=>hex?String.fromCodePoint(bound(parseInt(hex,16),1,0x10ffff)):letter);}
const sides=['top','right','bottom','left']as const;
function edge(raw:string,ink='#000000'):Border|undefined{
  const tokens=raw.match(/(?:rgba?|hsla?)\([^)]*\)|[^\s]+/g)??[];let style:Border['style']='none',width=3,color=ink,has=false;
  for(const token of tokens){if(token==='none'||token==='hidden'){style='none';has=true;continue;}if(['solid','dashed','dotted','double'].includes(token)){style=token as TableEdge['style'];has=true;continue;}const c=token==='currentcolor'?ink:htmlColor(token);if(c){color=c;has=true;continue;}const n=token==='thin'?1:token==='medium'?3:token==='thick'?5:htmlLength(token);if(n!==undefined&&n>=0&&n<=100){width=n;has=true;}else return;}
  return has?{width,color,style}:undefined;
}
export function inheritHtmlStyle(parent:HtmlStyle):HtmlStyle{
  const {insets:_insets,edges:_edges,borders:_borders,verticalAlign:_valign,width:_width,height:_height,...rest}=parent;return {...rest};
}
function setBorder(style:HtmlStyle,side:typeof sides[number],b:Border){style.borders={...style.borders,[side]:b};style.edges={...style.edges,[side]:{width:b.style==='none'?0:b.width,color:b.color,style:b.style==='none'?'solid':b.style}};}
/** Apply an allowlist of model-backed properties, never source CSS or URLs. */
export function htmlDeclaration(style:HtmlStyle,property:string,value:string,parent:HtmlStyle){
  const raw=value.trim(),v=raw.toLowerCase();if(v==='revert'||v==='revert-layer')return;
  if(v==='inherit'||v==='initial'||v==='unset'){
    const keys:Record<string,keyof HtmlStyle>={'font-family':'fontFamily','font-size':'fontSize','font-weight':'fontWeight','font-style':'italic',color:'color','text-align':'align','letter-spacing':'letterSpacing','white-space':'whiteSpace',visibility:'visible','background-color':'fill',background:'fill','vertical-align':'baseline','text-decoration':'underline','text-decoration-line':'underline',width:'width',height:'height',padding:'insets',border:'borders'};
    const key=keys[property];if(!key)return;
    const inherited=['fontFamily','fontSize','fontWeight','italic','color','align','letterSpacing','whiteSpace','visible'].includes(key),from=v==='inherit'||v==='unset'&&inherited?parent:{...htmlStyle,fontFamily:'serif',fontSize:16,color:'#000000',align:'left',letterSpacing:0,fill:parent.fill};
    Object.assign(style,{[key]:structuredClone(from[key])});
    if(property==='text-decoration'||property==='text-decoration-line')style.strikethrough=v==='inherit'?parent.strikethrough:false;
    if(property==='border'){style.edges=v==='inherit'?structuredClone(parent.edges):undefined;}
    return;
  }
  if(property==='font-family'){const f=family(raw);if(f)style.fontFamily=f;}
  else if(property==='font-size'){const relative:Record<string,number>={smaller:.8333333333,larger:1.2,'xx-small':.6,'x-small':.75,small:.8888888889,medium:1,large:1.2,'x-large':1.5,'xx-large':2};const n=v in relative?(v==='smaller'||v==='larger'?parent.fontSize??16:16)*relative[v]:htmlLength(v,parent.fontSize);if(n!==undefined&&n>=1&&n<=1000)style.fontSize=n;}
  else if(property==='font-weight'){const n=v==='normal'?400:v==='bold'?700:v==='bolder'?(parent.fontWeight??400)<350?400:(parent.fontWeight??400)<550?700:900:v==='lighter'?(parent.fontWeight??400)<550?100:(parent.fontWeight??400)<750?400:700:number(v);if(Number.isFinite(n)&&n>=100&&n<=900)style.fontWeight=n;}
  else if(property==='font-style'){if(/^(italic|oblique)(\s|$)/.test(v))style.italic=true;else if(v==='normal')style.italic=false;}
  else if(property==='color'){const c=v==='currentcolor'?parent.color:htmlColor(v);if(c)style.color=c;}
  else if(property==='background'||property==='background-color'){const c=v==='currentcolor'?style.color:htmlColor(v);if(c&&c!=='transparent')style.fill=c;}
  else if(property==='text-decoration'||property==='text-decoration-line'){if(v==='none'){style.underline=false;style.strikethrough=false;}else{style.underline=v.includes('underline');style.strikethrough=v.includes('line-through');}}
  else if(property==='text-align'){if(['left','center','right'].includes(v))style.align=v as HtmlStyle['align'];else if(v==='start')style.align='left';else if(v==='end')style.align='right';}
  else if(property==='vertical-align'){if(['super','sub','baseline'].includes(v))style.baseline=v==='baseline'?'normal':v as 'super'|'sub';else if(['top','middle','bottom'].includes(v))style.verticalAlign=v as HtmlStyle['verticalAlign'];}
  else if(property==='letter-spacing'){const n=v==='normal'?0:htmlLength(v,style.fontSize);if(n!==undefined&&n>=-50&&n<=100)style.letterSpacing=n;}
  else if(property==='white-space'){if(['normal','nowrap','pre','pre-wrap','pre-line','break-spaces'].includes(v))style.whiteSpace=v;}
  else if(property==='width'||property==='height'){if(!v.endsWith('%')){const n=htmlLength(v,style.fontSize);if(n!==undefined&&n>0&&n<=20000)style[property]=n;}}
  else if(property==='mso-spacerun'&&v==='yes')style.whiteSpace='pre-wrap';
  else if(property==='display'&&v==='none')style.hidden=true;
  else if(property==='visibility'&&['visible','hidden','collapse'].includes(v))style.visible=v==='visible';
  else if(property==='padding'||/^padding-(top|right|bottom|left)$/.test(property)){
    const values=v.split(/\s+/).map(x=>htmlLength(x,style.fontSize));if(values.some(n=>n===undefined||n<0||n>1000))return;
    const which=property.slice(8) as typeof sides[number];if(property!=='padding'&&values.length===1)style.insets={...style.insets,[which]:values[0]};
    else if(property==='padding'&&values.length>=1&&values.length<=4)style.insets={top:values[0],right:values[1]??values[0],bottom:values[2]??values[0],left:values[3]??values[1]??values[0]};
  }else if(property==='border'||/^border-(top|right|bottom|left)$/.test(property)){
    const b=edge(v,style.color);if(!b)return;const selected=property==='border'?sides:[property.slice(7) as typeof sides[number]];for(const side of selected)setBorder(style,side,{...b});
  }else if(/^border(?:-(top|right|bottom|left))?-(width|color|style)$/.test(property)){
    const m=property.match(/^border(?:-(top|right|bottom|left))?-(width|color|style)$/)!,tokens=v.match(/(?:rgba?|hsla?)\([^)]*\)|[^\s]+/g)??[];
    if(!tokens.length||tokens.length>4||m[1]&&tokens.length!==1)return;const expanded=[tokens[0],tokens[1]??tokens[0],tokens[2]??tokens[0],tokens[3]??tokens[1]??tokens[0]];
    const selected=m[1]?[m[1] as typeof sides[number]]:sides;for(const side of selected){const token=(m[1]?tokens[0]:expanded[sides.indexOf(side)])!,before=style.borders?.[side]??{width:3,color:style.color??'#000000',style:'none' as const};let patch:Partial<Border>|undefined;
      if(m[2]==='width'){const n=token==='thin'?1:token==='medium'?3:token==='thick'?5:htmlLength(token);if(n!==undefined&&n>=0&&n<=100)patch={width:n};}
      else if(m[2]==='color'){const c=token==='currentcolor'?style.color??'#000000':htmlColor(token);if(c)patch={color:c};}
      else if(token==='none'||token==='hidden')patch={style:'none'};else if(['solid','dashed','dotted','double'].includes(token))patch={style:token as TableEdge['style']};
      if(patch)setBorder(style,side,{...before,...patch});
    }
  }else if(property==='font'){
    const m=raw.match(/(?:^|\s)([-+]?(?:\d*\.)?\d+(?:px|pt|pc|in|cm|mm|em|rem|%))(?:\s*\/\s*[^\s]+)?\s+(.+)$/i);if(!m)return;
    htmlDeclaration(style,'font-size',m[1],parent);htmlDeclaration(style,'font-family',m[2],parent);const prefix=raw.slice(0,m.index).toLowerCase();style.italic=/\b(italic|oblique)\b/.test(prefix);const weight=prefix.match(/\b(bold|[1-9]00)\b/)?.[1];htmlDeclaration(style,'font-weight',weight??'normal',parent);
  }
}
