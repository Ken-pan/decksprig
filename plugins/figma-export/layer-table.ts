import {z} from '../../src/core/schema';
import {ElementSchema,type SlideElement} from '../../src/core/model';
import {tablePresentation,tableCellStyle,tableCellSpan} from '../../src/core/table-appearance';
import {textEditRanges} from '../../src/core/text-editing';
import {nativeTableDecoration,prepareTableDecorations} from './table';
import {validateTableStyle} from '../../src/core/table-schema';
import type {DesignSystem} from '../../src/core/design-system-schema';

const key='deck-studio-table-v1',cellKey='deck-studio-table-cell';
const dataSchema=z.strictObject(z.pick(ElementSchema, {cells:true,tableStyle:true,fontFamily:true,fontSize:true,fontWeight:true,italic:true,underline:true,strikethrough:true,align:true,lineHeight:true,letterSpacing:true,fill:true,stroke:true,strokeWidth:true}).shape);
export type LayerTableData=ReturnType<typeof dataSchema.parse>;
const json=(v:unknown)=>JSON.stringify(v);
const utf8Size=(value:string)=>{let size=0;for(const character of value){const code=character.codePointAt(0)!;size+=code>0xffff?4:code>0x7ff?3:code>0x7f?2:1;}return size;};
const paint=(value:string)=>value==='transparent'?[]:[{type:'SOLID',color:{r:parseInt(value.slice(1,3),16)/255,g:parseInt(value.slice(3,5),16)/255,b:parseInt(value.slice(5,7),16)/255},opacity:value.length===9?parseInt(value.slice(7,9),16)/255:1}];
const hex=(fills:any[],fallback:string)=>{const p=Array.isArray(fills)?fills.find(p=>p.visible!==false):undefined;return !p?'transparent':p.type==='SOLID'&&(p.opacity??1)===1?'#'+[p.color.r,p.color.g,p.color.b].map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join(''):fallback.slice(0,7);};

export function layerTableData(e:SlideElement,system?:DesignSystem):LayerTableData{
 const p=tablePresentation(e,system);
 return dataSchema.parse({cells:(e.cells??[]).map(row=>Array.from({length:p.widths.length},(_,c)=>row[c]??'')),tableStyle:{...e.tableStyle,headerRow:p.headerRow,headerFill:p.header,headerText:p.headerText,bodyFill:p.background,stripeFill:p.stripe,lineColor:p.line},fontFamily:e.fontFamily,fontSize:e.fontSize,fontWeight:e.fontWeight,italic:e.italic,underline:e.underline,strikethrough:e.strikethrough,align:e.align,lineHeight:e.lineHeight,letterSpacing:e.letterSpacing,fill:e.fill,stroke:e.stroke,strokeWidth:e.strokeWidth});
}
export function tableFontElements(e:SlideElement,system?:DesignSystem){
 const p=tablePresentation(e,system),seen=new Set<string>(),out:SlideElement[]=[];
 for(let r=0;r<(e.cells?.length??0);r++)for(let c=0;c<p.widths.length;c++){
  const s=tableCellStyle(p,r,c),weight=s.fontWeight,italic=s.fontStyle==='italic',key=json([s.fontFamily,weight,italic]);if(seen.has(key))continue;seen.add(key);
  out.push({...e,type:'text',fontFamily:s.fontFamily,fontWeight:weight,italic,text:'',runs:undefined,paragraphs:undefined});
 }return out;
}
/** Only our bounded data is read. Native child text remains the content authority. */
export function readLayerTable(n:any):LayerTableData|undefined{
 const raw=n.getPluginData?.(key);if(n.type!=='FRAME'||!raw||raw.length>100000||utf8Size(raw)>100000)return;
 let data:LayerTableData;try{data=dataSchema.parse(JSON.parse(raw));validateTableStyle(data.cells??[],data.tableStyle);}catch{return;}
 if(!data.cells?.length)return;
 const styles=new Map((data.tableStyle?.cellStyles??[]).map(s=>[`${s.row}:${s.column}`,s])),fonts:any[]=[],visible=new Set<string>(),presentation=tablePresentation(data as SlideElement);
 for(const frame of n.children??[]){const address=/^(\d+):(\d+)$/.exec(frame.getPluginData?.(cellKey)??'');if(!address||frame.type!=='FRAME')continue;
  const r=Number(address[1]),c=Number(address[2]),text=frame.children.find((v:any)=>v.type==='TEXT'&&v.getPluginData?.(cellKey)==='text');
  if(!text||!data.cells[r]||c>=data.cells[r].length||text.characters.length>5000)return;
  data.cells[r][c]=text.characters;visible.add(`${r}:${c}`);
  const segment=text.getStyledTextSegments(['fontName','fontWeight','fontSize','textDecoration','fills'])[0],prior=styles.get(`${r}:${c}`);
  const expected=tableCellStyle(presentation,r,c),actual={verticalAlign:frame.primaryAxisAlignItems==='CENTER'?'middle' as const:frame.primaryAxisAlignItems==='MAX'?'bottom' as const:'top' as const,fill:hex(frame.fills,prior?.fill??expected.background),color:hex(segment?.fills??text.fills,prior?.color??expected.color),fontFamily:segment?.fontName.family??expected.fontFamily,fontSize:segment?.fontSize??(typeof text.fontSize==='number'?text.fontSize:parseFloat(expected.fontSize)),underline:(segment?.textDecoration??text.textDecoration)==='UNDERLINE',strikethrough:(segment?.textDecoration??text.textDecoration)==='STRIKETHROUGH',fontWeight:segment?.fontWeight??prior?.fontWeight??expected.fontWeight,italic:segment?/italic|oblique/i.test(segment.fontName.style):prior?.italic??expected.fontStyle==='italic',align:text.textAlignHorizontal==='CENTER'?'center' as const:text.textAlignHorizontal==='RIGHT'?'right' as const:'left' as const};
  const patch={...prior,row:r,column:c};let changed=Boolean(prior);
  for(const k of ['fill','color','fontFamily','fontSize','underline','strikethrough','fontWeight','italic','align','verticalAlign'] as const){const value=actual[k],baseline=k==='fontSize'?parseFloat(expected.fontSize):k==='underline'?expected.textDecoration.includes('underline'):k==='strikethrough'?expected.textDecoration.includes('line-through'):k==='fill'?expected.background:k==='italic'?expected.fontStyle==='italic':k==='align'?expected.textAlign:expected[k];if(value!==baseline){Object.assign(patch,{[k]:value});changed=true;}}
  if(changed)styles.set(`${r}:${c}`,patch);
  if(typeof text.fontName!=='symbol'&&typeof text.fontSize==='number')fonts.push({family:text.fontName.family,size:text.fontSize});
 }
 data.tableStyle={...data.tableStyle,cellStyles:[...styles.values()]};
 const border=n.children?.find((v:any)=>v.getPluginData?.(cellKey)==='border');
 if(border)data.tableStyle={...data.tableStyle,lineColor:hex(border.strokes,data.tableStyle.lineColor??'#cccccc'),borderWidth:typeof border.strokeWeight==='number'?Math.round(border.strokeWeight*1e6)/1e6:data.tableStyle.borderWidth};
 else data.tableStyle.borders='none';
 if(fonts.length&&fonts.every(f=>f.family===fonts[0].family)){data.fontFamily=fonts[0].family;data.tableStyle.cellStyles=data.tableStyle.cellStyles?.map(({fontFamily,...s})=>visible.has(`${s.row}:${s.column}`)?s:{...s,fontFamily});}
 if(fonts.length&&fonts.every(f=>f.size===fonts[0].size)){data.fontSize=fonts[0].size;data.tableStyle.cellStyles=data.tableStyle.cellStyles?.map(({fontSize,...s})=>visible.has(`${s.row}:${s.column}`)?s:{...s,fontSize});}
 return data;
}
export function prepareLayerTable(e:SlideElement){
 prepareTableDecorations(e);
 if(!e.cells?.length||!e.cells[0]?.length)throw new Error('Add at least one table cell before syncing. No content was changed.');
 if(e.rotation||e.flipX||e.flipY||e.opacity!==1||e.hidden||e.shadow)throw new Error(`Keep “${e.name}” visible, unrotated, fully opaque and without an outer shadow for editable table-layer sync. No content was changed.`);
 const data=layerTableData(e);if(utf8Size(json(data))>90000)throw new Error('This table is too large for an editable Figma handoff. Split it into smaller tables. No content was changed.');
}
/** Fallback for hosts without createTable and for merged cells: editable native
 * frames/text with stable addresses, never a flattened substitute for TABLE. */
export function writeLayerTable(figma:any,n:any,e:SlideElement,fonts:Map<string,any>,prior?:SlideElement,system?:DesignSystem){
 prepareTableDecorations(e);
 const p=tablePresentation(e,system),rows=e.cells??[],data=layerTableData(e,system),created:string[]=[],kept=new Set<any>(),fresh=!n;
 n??=figma.createFrame();if(fresh){created.push(n.id);n.name=e.name;n.fills=[];n.strokes=[];n.clipsContent=true;}
 if(Math.abs(n.width-e.w)>1e-7||Math.abs(n.height-e.h)>1e-7)n.resize(e.w,e.h);const before=new Map<string,any>((n.children??[]).filter((v:any)=>v.getPluginData?.(cellKey)).map((v:any):[string,any]=>[v.getPluginData(cellKey),v]));
 const xs=[0],ys=[0];for(const w of p.widths)xs.push(xs.at(-1)!+w*e.w);for(let r=0;r<rows.length;r++)ys.push(ys.at(-1)!+(p.heights?.[r]??1/rows.length)*e.h);
 const edges=new Map<string,{axis:string;at:number;segments:number[][]}>();
 const edge=(axis:string,at:number,start:number,end:number)=>{const k=axis+':'+at.toFixed(8),v=edges.get(k)??{axis,at,segments:[]};v.segments.push([start,end]);edges.set(k,v);};
 for(let r=0;r<rows.length;r++)for(let c=0;c<p.widths.length;c++){
  const span=tableCellSpan(p,r,c);if(span.covered)continue;
  const address=`${r}:${c}`,s=tableCellStyle(p,r,c),w=xs[c+span.columnSpan]-xs[c],h=ys[r+span.rowSpan]-ys[r];
  let frame:any=before.get(address),text:any=frame?.children?.find((v:any)=>v.type==='TEXT'&&v.getPluginData?.(cellKey)==='text');
  if(!frame){frame=figma.createFrame();n.appendChild(frame);frame.setPluginData(cellKey,address);created.push(frame.id);}
  if(!text){text=figma.createText();frame.appendChild(text);text.setPluginData(cellKey,'text');created.push(text.id);}
  kept.add(frame);frame.name=`Cell ${String.fromCharCode(65+c)}${r+1}`;frame.resize(w,h);frame.x=xs[c];frame.y=ys[r];frame.fills=paint(s.background);frame.strokes=[];frame.clipsContent=true;
  frame.layoutMode='VERTICAL';frame.primaryAxisSizingMode='FIXED';frame.counterAxisSizingMode='FIXED';frame.primaryAxisAlignItems=s.verticalAlign==='middle'?'CENTER':s.verticalAlign==='bottom'?'MAX':'MIN';frame.counterAxisAlignItems='MIN';frame.paddingLeft=frame.paddingRight=p.padding;frame.paddingTop=frame.paddingBottom=p.padding;frame.constraints={horizontal:'SCALE',vertical:'SCALE'};
  const previous=prior?tableCellStyle(tablePresentation(prior,system),r,c):undefined,styleChanged=fresh||!previous||json(s)!==json(previous)||['fontFamily','fontSize','lineHeight','letterSpacing','underline','strikethrough'].some(k=>e[k as keyof SlideElement]!==prior?.[k as keyof SlideElement]);
  if(styleChanged||!text.characters){text.fontName=fonts.get(json([s.fontFamily,s.fontWeight,s.fontStyle==='italic']));text.fontSize=parseFloat(s.fontSize);text.fills=paint(s.color);text.textDecoration=nativeTableDecoration(s.textDecoration,e);text.lineHeight={unit:'PIXELS',value:parseFloat(s.fontSize)*e.lineHeight};text.letterSpacing={unit:'PIXELS',value:e.letterSpacing};text.textAlignHorizontal=s.textAlign.toUpperCase();}
  const value=rows[r][c]??'';for(const edit of textEditRanges(text.characters,value).reverse()){if(edit.text)text.insertCharacters(edit.start,edit.text,edit.useStyle);if(edit.end>edit.start)text.deleteCharacters(edit.start+edit.text.length,edit.end+edit.text.length);}
  text.resize(Math.max(1,w-p.padding*2),Math.max(1,text.height));text.textAutoResize='HEIGHT';text.layoutSizingHorizontal='FILL';
  frame.resize(w,h);frame.layoutSizingHorizontal='FIXED';frame.layoutSizingVertical='FIXED';frame.x=xs[c];frame.y=ys[r];
  if(p.borders==='grid'){edge('h',ys[r],xs[c],xs[c]+w);edge('v',xs[c],ys[r],ys[r]+h);edge('v',xs[c]+w,ys[r],ys[r]+h);}
  if(p.borders!=='none')edge('h',ys[r]+h,xs[c],xs[c]+w);
 }
 let border:any=before.get('border');
 if(p.borders!=='none'&&p.borderWidth>0){if(!border){border=figma.createVector();n.appendChild(border);border.setPluginData(cellKey,'border');created.push(border.id);}kept.add(border);const paths:string[]=[];
  const minX=Math.min(...[...edges.values()].flatMap(v=>v.axis==='h'?v.segments.map(s=>s[0]):[v.at])),minY=Math.min(...[...edges.values()].flatMap(v=>v.axis==='v'?v.segments.map(s=>s[0]):[v.at]));
  for(const {axis,at,segments}of edges.values()){segments.sort((a,b)=>a[0]-b[0]);const merged:number[][]=[];for(const [a,b]of segments){const last=merged.at(-1);if(last&&a<=last[1]+1e-7)last[1]=Math.max(last[1],b);else merged.push([a,b]);}for(const [a,b]of merged)paths.push(axis==='h'?`M ${a-minX} ${at-minY} L ${b-minX} ${at-minY}`:`M ${at-minX} ${a-minY} L ${at-minX} ${b-minY}`);}
  border.vectorPaths=[{windingRule:'NONZERO',data:paths.join(' ')}];border.fills=[];border.strokes=paint(p.line);border.strokeWeight=p.borderWidth;border.strokeCap='NONE';border.constraints={horizontal:'SCALE',vertical:'SCALE'};border.x=minX;border.y=minY;n.appendChild(border);
 }
 for(const child of before.values())if(!kept.has(child))child.remove();n.setPluginData(key,json(data));
 return {node:n,createdIds:created};
}
