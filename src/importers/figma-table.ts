import {element,type SlideElement} from '../core/model';
import {inferNativeTableGeometry} from '../core/native-table-geometry';
import {tableLayoutFingerprint} from '../core/native-table-layout';
import {scaleTableStyle,type TableCellStyle} from '../core/table-schema';

export function importLayerTable(node:any,common:Partial<SlideElement>,src:string|undefined,scale:number){
 const data=node.deckStudioTable;
 if(!data||!src||Math.abs(common.rotation??0)>1e-7||common.flipX||common.flipY||node.effects?.some((v:any)=>v.visible!==false))return;
 const table=element('table',{...common,...data,fontSize:data.fontSize*scale,letterSpacing:data.letterSpacing*scale,tableStyle:scaleTableStyle(data.tableStyle,scale)}),fingerprint=tableLayoutFingerprint(table);
 if(fingerprint.length>200000)return;table.nativeTableLayout={fingerprint,src};return table;
}

/** Preserve native pixels and only retain actual per-cell deviations. Default
 * cells must continue following a whole-table font or size edit. */
export function importNativeTable(node:any,common:Partial<SlideElement>,src:string|undefined,scale:number){
 const rows=node.table?.cells;
 if(!src||!rows?.length||!rows[0]?.length||Math.abs(common.rotation??0)>1e-7||common.flipX||common.flipY)return undefined;
 const geometry=inferNativeTableGeometry(rows,common.w!/scale,common.h!/scale);if(!geometry)return undefined;
 const color=(fills:any[],fallback:string)=>{const p=fills?.find(p=>p.visible!==false);return p?.type==='SOLID'&&(p.opacity??1)===1?'#'+[p.color.r,p.color.g,p.color.b].map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join(''):fallback;};
 const first=rows[0][0],style=first.segments?.[0],ink=color(style?.fills??[],'#1e1e1e'),size=(v:number)=>Math.max(4,Math.min(500,v*scale));
 const fontFamily=style?.fontName?.family??first.fontName?.family??'Inter',fontSize=size(style?.fontSize??first.fontSize??16),fontWeight=style?.fontWeight??500,italic=/italic|oblique/i.test(style?.fontName?.style??''),underline=style?.textDecoration==='UNDERLINE',strikethrough=style?.textDecoration==='STRIKETHROUGH';
 const table=element('table',{...common,cells:rows.map((row:any[])=>row.map(cell=>cell.characters)),fontFamily,fontSize,fontWeight,italic,underline,strikethrough,fill:ink,lineHeight:Math.max(.5,Math.min(4,style?.lineHeight?.unit==='PERCENT'?style.lineHeight.value/100:style?.lineHeight?.unit==='PIXELS'?style.lineHeight.value/(style.fontSize??16):1.2)),letterSpacing:(style?.letterSpacing?.unit==='PIXELS'?style.letterSpacing.value:(style?.letterSpacing?.value??0)*(style?.fontSize??16)/100)*scale,tableStyle:{headerRow:false,numericAlign:false,borders:'grid',padding:12*scale,verticalAlign:'middle',bodyFill:'#ffffff',lineColor:'#cccccc',columnWidths:geometry.columnWidths,rowHeights:geometry.rowHeights,...(geometry.merges.length?{merges:geometry.merges}:{}),cellStyles:rows.flatMap((row:any[],r:number)=>row.flatMap((cell,c)=>{
   const s=cell.segments?.[0],actual={fill:color(cell.fills,'#ffffff'),color:color(s?.fills??[],ink),fontFamily:s?.fontName?.family??cell.fontName?.family??fontFamily,fontSize:size(s?.fontSize??cell.fontSize??16),fontWeight:s?.fontWeight??500,italic:/italic|oblique/i.test(s?.fontName?.style??''),underline:s?.textDecoration==='UNDERLINE',strikethrough:s?.textDecoration==='STRIKETHROUGH',align:cell.align==='CENTER'?'center' as const:cell.align==='RIGHT'?'right' as const:'left' as const,verticalAlign:cell.verticalAlign==='TOP'?'top' as const:cell.verticalAlign==='BOTTOM'?'bottom' as const:'middle' as const};
   const defaults={fill:'#ffffff',color:ink,fontFamily,fontSize,fontWeight,italic,underline,strikethrough,align:'left',verticalAlign:'middle'},patch:TableCellStyle={row:r,column:c};
   for(const k of Object.keys(actual)as(keyof typeof actual)[])if(actual[k]!==defaults[k])Object.assign(patch,{[k]:actual[k]});
   return Object.keys(patch).length>2?[patch]:[];
 }))}});
 const fingerprint=tableLayoutFingerprint(table);if(fingerprint.length>200000)return undefined;
 table.nativeTableLayout={fingerprint,src};return table;
}
