import type {SlideElement} from '../../src/core/model';
import {inferNativeTableGeometry} from '../../src/core/native-table-geometry';
import {tableLayoutFingerprint} from '../../src/core/native-table-layout';
import {tablePresentation,tableCellStyle} from '../../src/core/table-appearance';
import type {TableCellStyle} from '../../src/core/table-schema';
import {textEditRanges} from '../../src/core/text-editing';

/** Tables are opaque nodes: cells live behind cellAt, not the ordinary TEXT tree. */
export function serializeNativeTable(n:any){
  if(!Number.isInteger(n.numRows)||!Number.isInteger(n.numColumns)||n.numRows<1||n.numRows>100||n.numColumns<1||n.numColumns>20)return undefined;
  const cells=Array.from({length:n.numRows},(_,r)=>Array.from({length:n.numColumns},(_,c)=>{
    const cell=n.cellAt(r,c),text=cell.text;
    let segments=text.getStyledTextSegments(['fontName','fontSize','fontWeight','textDecoration','fills','lineHeight','letterSpacing']);
    if(!text.characters&&segments.length===0){const weights:Record<string,number>={thin:100,extralight:200,ultralight:200,light:300,regular:400,normal:400,book:400,medium:500,semibold:600,demibold:600,bold:700,extrabold:800,ultrabold:800,black:900,heavy:900},name=typeof text.fontName==='symbol'?undefined:text.fontName;segments=[{start:0,end:0,fontName:name,fontSize:text.fontSize,fontWeight:'fontWeight'in text&&typeof text.fontWeight==='number'?text.fontWeight:weights[name?.style?.toLowerCase().replace(/italic|oblique|[^a-z]/g,'')],textDecoration:'textDecoration'in text?text.textDecoration:undefined,fills:text.fills,lineHeight:text.lineHeight,letterSpacing:text.letterSpacing}];}
    return {characters:text.characters,width:cell.width,height:cell.height,...('rowIndex'in cell?{rowIndex:cell.rowIndex}:{}),...('columnIndex'in cell?{columnIndex:cell.columnIndex}:{}),fills:cell.fills,fontName:typeof text.fontName==='symbol'?undefined:text.fontName,fontSize:typeof text.fontSize==='number'?text.fontSize:undefined,align:'textAlignHorizontal'in text?text.textAlignHorizontal:undefined,verticalAlign:'textAlignVertical'in text?text.textAlignVertical:undefined,
      segments};
  }));
  if(cells.some(row=>row.some(cell=>cell.characters.length>5000)))return undefined;
  return {cells};
}
/** Duplicate an explicit native source; this never chooses a template seed. */
export function cloneNativeTable(source:any){
  if(source?.type!=='TABLE'||!('clone'in source)||typeof source.clone!=='function')throw new Error('This Figma host cannot clone the native table. No content was changed.');
  const before=JSON.stringify(serializeNativeTable(source));if(!before)throw new Error('The native table source cannot be copied within the supported grid limits. No content was changed.');const copy=source.clone();
  if(!copy||copy===source||copy.id===source.id||copy.type!=='TABLE'||JSON.stringify(serializeNativeTable(copy))!==before||JSON.stringify(serializeNativeTable(source))!==before)throw new Error('The native table copy did not preserve its source cells. No table conversion was applied.');
  return copy;
}
const error=(e:SlideElement)=>new Error(`“${e.name}” can sync cell text, supported cell formatting, position and sizing. Edit other table properties in Figma, then sync again. No content was changed.`);
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function readNativeTableGeometry(n:any){
 if(n?.type!=='TABLE'||!Number.isInteger(n.numRows)||!Number.isInteger(n.numColumns)||n.numRows<1||n.numRows>100||n.numColumns<1||n.numColumns>20)return;
 const cells=Array.from({length:n.numRows},(_,r)=>Array.from({length:n.numColumns},(_,c)=>{const cell=n.cellAt(r,c);return{width:cell.width,height:cell.height,...('rowIndex'in cell?{rowIndex:cell.rowIndex}:{}),...('columnIndex'in cell?{columnIndex:cell.columnIndex}:{})};}));
 return inferNativeTableGeometry(cells,n.width,n.height);
}
const geometryError=(e:SlideElement)=>new Error(`“${e.name}” has a native cell grid that cannot be read safely. Keep its original table unchanged and sync a fresh Figma reference. No content was changed.`);
const mergedError=(e:SlideElement)=>new Error(`“${e.name}” has native merged cells. Keep their structure, sizes and covered cells unchanged; edit other table properties in Figma. No content was changed.`);
const orderedMerges=(merges:any[]=[])=>[...merges].sort((a,b)=>a.row-b.row||a.column-b.column);
const equalAxis=(a:number[],b:number[])=>a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<=.1)&&Math.abs(a.reduce((s,v)=>s+v,0)-b.reduce((s,v)=>s+v,0))<=.1;
function mergedTablePlan(n:any,e:SlideElement,prior?:SlideElement){
 const geometry=readNativeTableGeometry(n);if(!geometry)throw geometryError(e);
 const merged=Boolean(geometry.merges.length),covered=new Set<string>();
 if(merged||e.tableStyle?.merges?.length||prior?.tableStyle?.merges?.length){
  const p=tablePresentation(e),before=tablePresentation(prior??e);
  if(!same(geometry.merges,orderedMerges(e.tableStyle?.merges))||!same(geometry.merges,orderedMerges((prior??e).tableStyle?.merges))||!equalAxis(geometry.columnWidths,p.widths.map(v=>v*e.w))||!equalAxis(geometry.rowHeights,(p.heights??geometry.rowHeights.map(()=>1/n.numRows)).map(v=>v*e.h)))throw mergedError(e);
  for(const m of geometry.merges)for(let r=m.row;r<m.row+m.rowSpan;r++)for(let c=m.column;c<m.column+m.columnSpan;c++)if(r!==m.row||c!==m.column)covered.add(`${r}:${c}`);
  for(let r=0;r<n.numRows;r++)for(let c=0;c<n.numColumns;c++)if(n.cellAt(r,c).text.characters!==(prior??e).cells?.[r]?.[c]||covered.has(`${r}:${c}`)&&(e.cells?.[r]?.[c]!== (prior??e).cells?.[r]?.[c]||!same(tableCellStyle(p,r,c),tableCellStyle(before,r,c))))throw mergedError(e);
 }
 return{geometry,merged,covered};
}
/** An ambiguous TABLE may be imported as an image, but it is not an image node. */
export function prepareNativeTableVisual(n:any,e:SlideElement,prior?:SlideElement){if(n?.type==='TABLE'&&(!prior||!same(e,prior)))throw geometryError(e);}
const fontKey=(s:ReturnType<typeof tableCellStyle>)=>JSON.stringify([s.fontFamily,s.fontWeight,s.fontStyle==='italic']);
const paint=(hex:string)=>hex==='transparent'?[]:[{type:'SOLID',color:{r:parseInt(hex.slice(1,3),16)/255,g:parseInt(hex.slice(3,5),16)/255,b:parseInt(hex.slice(5,7),16)/255}}];
const cellChanges=(e:SlideElement,prior:SlideElement,row:number,column:number)=>{const a=e.tableStyle?.cellStyles?.find(s=>s.row===row&&s.column===column),b=prior.tableStyle?.cellStyles?.find(s=>s.row===row&&s.column===column);return (field:keyof TableCellStyle,after:unknown,before:unknown)=>!same(after,before)||!same(a?.[field],b?.[field]);};
const formatKeys=['fontFamily','fontSize','fontWeight','italic','underline','strikethrough','align','lineHeight','letterSpacing','fill'] as const;
const styleKeys=['columnWidths','rowHeights','headerRow','headerFill','headerText','bodyFill','banded','stripeFill','numericAlign','columnAlign','cellStyles','verticalAlign'] as const;
const structureError=(e:SlideElement)=>new Error(`“${e.name}” can sync one unambiguous final row or column at a time. Keep the existing cells unchanged; edit middle rows or columns and merged tables in Figma. No content was changed.`);
function requireRecoverableTail(n:any,axis:'row'|'column',index:number,e:SlideElement){
  const p=tablePresentation(e),reject=()=>{throw new Error(`“${e.name}” has native formatting or links in its final ${axis} that local Undo cannot restore. Delete that ${axis} in Figma to preserve native Undo. No content was changed.`);};
  const defaults:Record<string,unknown>={hyperlink:null,textCase:'ORIGINAL',openTypeFeatures:{},textStyleId:'',fillStyleId:'',listOptions:{type:'NONE'},listSpacing:0,indentation:0,paragraphIndent:0,paragraphSpacing:0,textWrapStyle:'AUTO',boundVariables:{},textStyleOverrides:[],leadingTrim:'NONE',hangingPunctuation:false,hangingList:false};
  const decorations:Record<string,unknown>={textDecorationStyle:'SOLID',textDecorationOffset:{unit:'AUTO'},textDecorationThickness:{unit:'AUTO'},textDecorationColor:{value:'AUTO'},textDecorationSkipInk:true};
  const neutral=(v:any)=>{for(const [key,value]of Object.entries(defaults))if(key in v&&v[key]!==undefined&&v[key]!==null&&(typeof v[key]==='symbol'||!same(v[key],value)))reject();for(const [key,value]of Object.entries(decorations))if(key in v&&v[key]!==undefined&&v[key]!==null&&(typeof v[key]==='symbol'||!same(v[key],value)))reject();};
  const solid=(fills:any,color:string)=>{if(!Array.isArray(fills)||fills.length!==1)reject();const fill=fills[0];if(fill.type!=='SOLID'||fill.visible===false||(fill.opacity??1)!==1||fill.blendMode&&fill.blendMode!=='NORMAL'||Object.keys(fill.boundVariables??{}).length||!fill.color||[1,3,5].some((at,i)=>Math.abs(fill.color[['r','g','b'][i]]-parseInt(color.slice(at,at+2),16)/255)>1e-6))reject();};
  const fields=['fontName','fontSize','fontWeight','fontStyle','textDecoration','fills','lineHeight','letterSpacing',...Object.keys(defaults).filter(k=>!['leadingTrim','hangingPunctuation','hangingList'].includes(k)),...Object.keys(decorations)];
  for(let i=0;i<(axis==='row'?n.numColumns:n.numRows);i++){
    const row=axis==='row'?index:i,c=axis==='row'?i:index;
    const cell=n.cellAt(row,c),text=cell.text,s=tableCellStyle(p,row,c);let segments:any[];try{segments=text.getStyledTextSegments(fields);}catch{reject();}
    if(segments!.length>1)reject();neutral(text);neutral(cell);const run=segments![0]??{};neutral(run);
    const name=run.fontName??text.fontName,size=run.fontSize??text.fontSize,leading=run.lineHeight??text.lineHeight,tracking=run.letterSpacing??text.letterSpacing,decoration=run.textDecoration??text.textDecoration;
    if(!name||typeof name==='symbol'||name.family!==s.fontFamily||Object.keys(name.variationSettings??{}).length||size!==parseFloat(s.fontSize)||(run.fontWeight!==undefined&&run.fontWeight!==s.fontWeight)||decoration!==nativeTableDecoration(s.textDecoration,e))reject();
    const named:Record<number,string>={100:'thin',200:'extralight',300:'light',400:'regular',500:'medium',600:'semibold',700:'bold',800:'extrabold',900:'black'},actual=name.style?.toLowerCase().replace(/[^a-z]/g,''),expected=named[s.fontWeight]+(s.fontStyle==='italic'?'italic':'');if(actual!==expected&&!(expected==='regularitalic'&&actual==='italic'))reject();
    // Slides can return the named instance instead of generic REGULAR/ITALIC.
    if(run.fontStyle!==undefined&&![s.fontStyle==='italic'?'ITALIC':'REGULAR',name.style?.trim().toUpperCase().replace(/\s+/g,'_'),expected.replace(/italic$/,'_italic').toUpperCase()].includes(run.fontStyle))reject();
    if(leading?.unit!=='PIXELS'||Math.abs(leading.value-size*e.lineHeight)>1e-6||tracking?.unit!=='PIXELS'||Math.abs(tracking.value-e.letterSpacing)>1e-6)reject();
    solid(cell.fills,s.background);solid(run.fills??text.fills,s.color);
  }
}
/** No operation provenance is guessed from shifted or repeated blank cells. */
function trailingStructure(n:any,e:SlideElement,prior?:SlideElement){
  const old=prior??e,rows=e.cells?.length??0,columns=e.cells?.[0]?.length??0,oldRows=old.cells?.length??0,oldColumns=old.cells?.[0]?.length??0;
  if(!rows||!columns||rows>100||columns>20||e.cells!.some(r=>r.length!==columns)||old.cells?.some(r=>r.length!==oldColumns)||n.numRows!==oldRows||n.numColumns!==oldColumns)throw structureError(e);
  if(rows===oldRows&&columns===oldColumns)return;
  if(!prior||e.tableStyle?.merges?.length||prior.tableStyle?.merges?.length||Math.abs(rows-oldRows)+Math.abs(columns-oldColumns)!==1||formatKeys.some(key=>!same(e[key],prior[key])))throw structureError(e);
  const axis=rows!==oldRows?'row':'column',insert=axis==='row'?rows>oldRows:columns>oldColumns,method=insert?(axis==='row'?'insertRow':'insertColumn'):(axis==='row'?'removeRow':'removeColumn');
  if(!(method in n)||typeof n[method]!=='function')throw structureError(e);
  // Inline last-cell editing and its Undo share the structural transaction.
  // Only that retained character range can differ, beside a blank trailing row.
  const draftRow=Math.min(rows,oldRows)-1,draftColumn=columns-1,draftChanged=axis==='row'&&e.cells![draftRow][draftColumn]!==prior.cells![draftRow][draftColumn];
  if(draftChanged&&(insert?e:prior).cells!.at(-1)!.some(value=>value!==''))throw structureError(e);
  const sequence=(v:SlideElement,restoreDraft=false)=>{const p=tablePresentation(v),at=(r:number,c:number)=>{const local=v.tableStyle?.cellStyles?.find(s=>s.row===r&&s.column===c),{row,column,...style}=local??{};return [restoreDraft&&draftChanged&&r===draftRow&&c===draftColumn?prior.cells![r][c]:v.cells![r][c],tableCellStyle(p,r,c),style];};return axis==='row'?v.cells!.map((row,r)=>row.map((_,c)=>at(r,c))):v.cells![0].map((_,c)=>v.cells!.map((_,r)=>at(r,c)));};
  const after=sequence(e,true),before=sequence(prior),long=insert?after:before,short=insert?before:after;
  if(!same(long.slice(0,-1),short)||long.filter((_,i)=>same(long.filter((_,j)=>j!==i),short)).length!==1)throw structureError(e);
  for(let r=0;r<oldRows;r++)for(let c=0;c<oldColumns;c++)if(n.cellAt(r,c).text.characters!==prior.cells![r][c])throw structureError(e);
  if(!insert)requireRecoverableTail(n,axis,axis==='row'?oldRows-1:oldColumns-1,prior);
  return {insert,method,rows,columns,oldRows,oldColumns,index:short.length};
}
const cellSnapshot=(cell:any)=>[cell.id,cell.text.id,cell.text.characters,cell.fills,cell.text.getStyledTextSegments(['fontName','fontSize','fontWeight','textDecoration','fills','lineHeight','letterSpacing'])];
function requireAuthoredVerticalAlignment(n:any,e:SlideElement,prior?:SlideElement){
  const whole=!same(e.tableStyle?.verticalAlign,(prior??e).tableStyle?.verticalAlign),fresh=((e.cells?.length??0)>n.numRows||(e.cells?.[0]?.length??0)>n.numColumns)&&e.tableStyle?.cellStyles?.some(s=>(s.row>=n.numRows||s.column>=n.numColumns)&&s.verticalAlign!==undefined);
  if(whole||fresh)for(let r=0;r<n.numRows;r++)for(let c=0;c<n.numColumns;c++)if(!('textAlignVertical'in n.cellAt(r,c).text))throw error(e);
}
export function nativeTableDecoration(value:string,e:SlideElement){
  if(value.includes('underline')&&value.includes('line-through'))throw new Error(`“${e.name}” uses underline and strikethrough together. Figma supports one decoration per character. Choose one before syncing. No content was changed.`);
  return value.includes('line-through')?'STRIKETHROUGH':value.includes('underline')?'UNDERLINE':'NONE';
}
/** Validate the complete deck before a different object can begin mutating. */
export function prepareTableDecorations(e:SlideElement){const p=tablePresentation(e);for(let r=0;r<(e.cells?.length??0);r++)for(let c=0;c<p.widths.length;c++)nativeTableDecoration(tableCellStyle(p,r,c).textDecoration,e);}
const verifyNativeSize=(e:SlideElement,axis:'row'|'column',index:number,requested:number,actual:number)=>{
  // Native TABLE resizing can silently clamp to its text-dependent minimum.
  if(!Number.isFinite(actual)||Math.abs(actual-requested)>.1)throw new Error(`Figma could not apply ${axis} ${index+1} ${axis==='row'?'height':'width'} for “${e.name}” (requested ${requested}px, actual ${actual}px). Increase the table ${axis==='row'?'height':'width'} or reduce the cell text size, then sync again.`);
};
export async function prepareNativeTable(figma:any,n:any,e:SlideElement,prior?:SlideElement){
  prepareTableDecorations(e);
  if(n?.type!=='TABLE'||typeof n.resizeRow!=='function'||typeof n.resizeColumn!=='function'||!e.nativeTableLayout||!e.cells)throw error(e);
  const structure=trailingStructure(n,e,prior);
  const plan=mergedTablePlan(n,e,prior);
  requireAuthoredVerticalAlignment(n,e,prior);
  const baseline=prior??e;
  for(const key of ['rotation','flipX','flipY','hidden','opacity','blendMode','radius','shadow','textCase','padding','verticalAlign','design'] as const)if(!same(e[key],baseline[key]))throw error(e);
  // Compare everything except the supported projection. Future table properties
  // remain rejected instead of being silently discarded.
  const body={...e,cells:baseline.cells,w:baseline.w,h:baseline.h,tableStyle:{...e.tableStyle}};
  for(const key of formatKeys)Object.assign(body,{[key]:baseline[key]});
  for(const key of styleKeys)Object.assign(body.tableStyle,{[key]:baseline.tableStyle?.[key]});
  if(tableLayoutFingerprint(body)!==tableLayoutFingerprint(baseline)||!prior&&tableLayoutFingerprint(e)!==e.nativeTableLayout.fingerprint)throw error(e);
  const after=tablePresentation(e),before=tablePresentation(baseline),sourceFonts=new Map<string,any>();
  for(let r=0;r<n.numRows;r++)for(let c=0;c<n.numColumns;c++){
    if(plan.covered.has(`${r}:${c}`))continue;
    const cell=n.cellAt(r,c),text=cell.text,a=tableCellStyle(after,r,c),b=tableCellStyle(before,r,c),delta=cellChanges(e,baseline,r,c);
    if(structure?.insert&&(['fontName','fontSize','fills','textDecoration','textAlignHorizontal','lineHeight','letterSpacing','characters'].some(property=>!(property in text))||!('fills'in cell)))throw error(e);
    for(const [changed,property,target]of [[delta('align',a.textAlign,b.textAlign),'textAlignHorizontal',text],[delta('verticalAlign',a.verticalAlign,b.verticalAlign),'textAlignVertical',text],[delta('underline',a.textDecoration,b.textDecoration)||delta('strikethrough',a.textDecoration,b.textDecoration),'textDecoration',text],[delta('fill',a.background,b.background),'fills',cell],[delta('color',a.color,b.color),'fills',text],[delta('fontSize',a.fontSize,b.fontSize)||e.lineHeight!==baseline.lineHeight,'lineHeight',text],[e.letterSpacing!==baseline.letterSpacing,'letterSpacing',text]] as const)if(changed&&!(property in target))throw error(e);
    const segments=text.getStyledTextSegments(['fontName']);
    if(!segments.length&&typeof text.fontName!=='symbol')sourceFonts.set(JSON.stringify(text.fontName),text.fontName);
    for(const s of segments)sourceFonts.set(JSON.stringify(s.fontName),s.fontName);
  }
  for(const font of sourceFonts.values())await figma.loadFontAsync(font);
}
export function writeNativeTable(n:any,e:SlideElement,fonts=new Map<string,any>(),prior?:SlideElement){
  prepareTableDecorations(e);
  requireAuthoredVerticalAlignment(n,e,prior);
  const plan=mergedTablePlan(n,e,prior),structure=trailingStructure(n,e,prior),prefix=structure?Array.from({length:Math.min(structure.rows,structure.oldRows)},(_,r)=>Array.from({length:Math.min(structure.columns,structure.oldColumns)},(_,c)=>cellSnapshot(n.cellAt(r,c)))):undefined;
  if(structure?.insert)for(let r=0;r<structure.rows;r++)for(let c=0;c<structure.columns;c++)if((r>=structure.oldRows||c>=structure.oldColumns)&&!fonts.has(fontKey(tableCellStyle(tablePresentation(e),r,c))))throw error(e);
  let changed=Boolean(structure);
  if(structure){n[structure.method](structure.index);if(n.numRows!==structure.rows||n.numColumns!==structure.columns||prefix!.some((row,r)=>row.some((cell,c)=>!same(cell,cellSnapshot(n.cellAt(r,c))))))throw new Error(`Figma could not preserve the existing cells while changing “${e.name}”. The table change was cancelled.`);}
  const sizes=(ratios:number[]|undefined,count:number,total:number)=>Array.from({length:count},(_,i)=>(ratios?.[i]??1/count)*total);
  const after=tablePresentation(e),before=tablePresentation(prior??e);
  if(!plan.merged)for(const [c,width]of sizes(after.widths,n.numColumns,e.w).entries()){if(Math.abs(n.cellAt(0,c).width-width)>.001){n.resizeColumn(c,width);changed=true;}verifyNativeSize(e,'column',c,width,n.cellAt(0,c).width);}
  for(let r=0;r<n.numRows;r++)for(let c=0;c<n.numColumns;c++){
    if(plan.covered.has(`${r}:${c}`))continue;
    const cell=n.cellAt(r,c),text=cell.text,value=e.cells![r][c],a=tableCellStyle(after,r,c),b=tableCellStyle(before,r,c),fresh=Boolean(structure?.insert&&(r>=structure.oldRows||c>=structure.oldColumns)),localDelta=cellChanges(e,prior??e,r,c),delta=(field:keyof TableCellStyle,after:unknown,before:unknown)=>fresh||localDelta(field,after,before);
    // Only the authored properties change. Content-only edits keep native rich
    // text runs, links, font axes and decoration variants intact.
    if(delta('fontFamily',a.fontFamily,b.fontFamily)||delta('fontWeight',a.fontWeight,b.fontWeight)||delta('italic',a.fontStyle,b.fontStyle)){const font=fonts.get(fontKey(a));if(!font)throw error(e);text.fontName=font;changed=true;}
    if(delta('fontSize',a.fontSize,b.fontSize)){text.fontSize=parseFloat(a.fontSize);changed=true;}
    if(delta('fill',a.background,b.background)){cell.fills=paint(a.background);changed=true;}
    if(delta('color',a.color,b.color)){text.fills=paint(a.color);changed=true;}
    if(delta('underline',a.textDecoration,b.textDecoration)||delta('strikethrough',a.textDecoration,b.textDecoration)){text.textDecoration=nativeTableDecoration(a.textDecoration,e);changed=true;}
    if(delta('align',a.textAlign,b.textAlign)){text.textAlignHorizontal=a.textAlign.toUpperCase();changed=true;}
    if((!fresh||'textAlignVertical'in text)&&delta('verticalAlign',a.verticalAlign,b.verticalAlign)){text.textAlignVertical=a.verticalAlign==='middle'?'CENTER':a.verticalAlign==='bottom'?'BOTTOM':'TOP';changed=true;}
    if(delta('fontSize',a.fontSize,b.fontSize)||Boolean(prior&&e.lineHeight!==prior.lineHeight)){text.lineHeight={unit:'PIXELS',value:parseFloat(a.fontSize)*e.lineHeight};changed=true;}
    if(fresh||prior&&e.letterSpacing!==prior.letterSpacing){text.letterSpacing={unit:'PIXELS',value:e.letterSpacing};changed=true;}
    if(fresh){text.characters=value;changed=true;}
    if(text.characters!==value){for(const edit of textEditRanges(text.characters,value).reverse()){if(edit.text)text.insertCharacters(edit.start,edit.text,edit.useStyle);if(edit.end>edit.start)text.deleteCharacters(edit.start+edit.text.length,edit.end+edit.text.length);}changed=true;}
  }
  // Width/content/style can grow a row; restore authored heights last, including Undo.
  if(!plan.merged)for(const [r,height]of sizes(after.heights,n.numRows,e.h).entries()){if(Math.abs(n.cellAt(r,0).height-height)>.001){n.resizeRow(r,height);changed=true;}verifyNativeSize(e,'row',r,height,n.cellAt(r,0).height);}
  if(plan.merged){const actual=readNativeTableGeometry(n);if(!actual||!same(actual.merges,plan.geometry.merges)||!equalAxis(actual.columnWidths,plan.geometry.columnWidths)||!equalAxis(actual.rowHeights,plan.geometry.rowHeights))throw new Error(`Figma could not preserve the merged cells and sizing of “${e.name}”. The table change must be rolled back.`);}
  return changed;
}
