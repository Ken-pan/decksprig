import {z} from './schema';
const optionalBoolean=z.optional(z.boolean());
const color=z.string().check(z.regex(/^(#[\da-fA-F]{6}(?:[\da-fA-F]{2})?|transparent)$/));
const textColor=color;
export const TABLE_SIDES=['top','right','bottom','left'] as const;
const inset=z.optional(z.number().check(z.minimum(0),z.maximum(1000)));
export const TableInsetsSchema=z.strictObject({top:inset,right:inset,bottom:inset,left:inset});
export const TableEdgeSchema=z.strictObject({width:z.number().check(z.minimum(0),z.maximum(100)),color,style:z.enum(['solid','dashed','dotted','double'])});
export const TableEdgesSchema=z.strictObject({top:z.optional(TableEdgeSchema),right:z.optional(TableEdgeSchema),bottom:z.optional(TableEdgeSchema),left:z.optional(TableEdgeSchema)});
export type TableInsets=z.infer<typeof TableInsetsSchema>;
export type TableEdge=z.infer<typeof TableEdgeSchema>;
export type TableEdges=z.infer<typeof TableEdgesSchema>;
export const TableFontFamilySchema=z.string().check(z.maxLength(100)),TableFontSizeSchema=z.number().check(z.minimum(4),z.maximum(500));
export const TABLE_PRESETS=['editorial','banded','grid','contrast'] as const;
const address={row:z.number().check(z.int(),z.minimum(0),z.maximum(99)),column:z.number().check(z.int(),z.minimum(0),z.maximum(19))};
export const TableMergeSchema=z.strictObject({...address,rowSpan:z.number().check(z.int(),z.minimum(1),z.maximum(100)),columnSpan:z.number().check(z.int(),z.minimum(1),z.maximum(20))}).check(z.refine(m=>m.rowSpan*m.columnSpan>1, 'Merge at least two cells.'));
export const TableTextRunSchema=z.strictObject({text:z.string().check(z.maxLength(5000)),fontFamily:z.optional(TableFontFamilySchema),fontSize:z.optional(z.number().check(z.minimum(1),z.maximum(1000))),fontWeight:z.optional(z.number().check(z.minimum(100),z.maximum(900))),italic:optionalBoolean,underline:optionalBoolean,strikethrough:optionalBoolean,color:z.optional(textColor),letterSpacing:z.optional(z.number().check(z.minimum(-50),z.maximum(100))),baseline:z.optional(z.enum(['normal','super','sub']))});
export type TableTextRun=z.infer<typeof TableTextRunSchema>;
export const TableCellStyleSchema=z.strictObject({...address,insets:z.optional(TableInsetsSchema),edges:z.optional(TableEdgesSchema),runs:z.optional(z.array(TableTextRunSchema).check(z.minLength(1),z.maxLength(5000))),fill:z.optional(color),color:z.optional(textColor),fontFamily:z.optional(TableFontFamilySchema),fontSize:z.optional(TableFontSizeSchema),fontWeight:z.optional(z.number().check(z.int(),z.minimum(100),z.maximum(900))),italic:optionalBoolean,underline:optionalBoolean,strikethrough:optionalBoolean,align:z.optional(z.enum(['left','center','right'])),verticalAlign:z.optional(z.enum(['top','middle','bottom']))});
export type TableMerge=z.infer<typeof TableMergeSchema>;
export type TableCellStyle=z.infer<typeof TableCellStyleSchema>;
export const TableStyleSchema=z.strictObject({
  preset:z.optional(z.enum(TABLE_PRESETS)),headerRow:optionalBoolean,banded:optionalBoolean,
  borders:z.optional(z.enum(['rows','grid','none'])),padding:z.optional(z.number().check(z.minimum(0),z.maximum(1000))),borderWidth:z.optional(z.number().check(z.minimum(0),z.maximum(100))),
  numericAlign:optionalBoolean,verticalAlign:z.optional(z.enum(['top','middle','bottom'])),
  headerFill:z.optional(color),headerText:z.optional(textColor),bodyFill:z.optional(color),stripeFill:z.optional(color),lineColor:z.optional(color),
  columnAlign:z.optional(z.array(z.enum(['auto','left','center','right'])).check(z.maxLength(20))),columnWidths:z.optional(z.array(z.number().check(z.gt(0)).check(z.maximum(20000))).check(z.minLength(1),z.maxLength(20))),
  rowHeights:z.optional(z.array(z.number().check(z.gt(0)).check(z.maximum(20000))).check(z.minLength(1),z.maxLength(100))),
  merges:z.optional(z.array(TableMergeSchema).check(z.maxLength(1000))),cellStyles:z.optional(z.array(TableCellStyleSchema).check(z.maxLength(2000))),
});
export type TableStyle=z.infer<typeof TableStyleSchema>;

export function validateTableStyle(cells:string[][],style:TableStyle|undefined){
  const rows=cells.length,columns=Math.max(0,...cells.map(r=>r.length)),occupied=new Set<string>(),styled=new Set<string>();
  for(const m of style?.merges??[]){
    if(m.row+m.rowSpan>rows||m.column+m.columnSpan>columns)throw new Error('Merged cells must stay inside the table.');
    for(let r=m.row;r<m.row+m.rowSpan;r++)for(let c=m.column;c<m.column+m.columnSpan;c++){const key=`${r}:${c}`;if(occupied.has(key))throw new Error('Merged cells cannot overlap.');occupied.add(key);}
  }
  for(const s of style?.cellStyles??[]){const key=`${s.row}:${s.column}`;if(s.row>=rows||s.column>=columns)throw new Error('Cell styles must stay inside the table.');if(styled.has(key))throw new Error('Choose one style per cell.');styled.add(key);if(s.runs&&s.runs.map(r=>r.text).join('')!==(cells[s.row]?.[s.column]??''))throw new Error('Rich cell text must match its cell value.');}
}

export function scaleTableStyle(style:TableStyle|undefined,scale:number):TableStyle|undefined {
  if(!style)return undefined;
  return {...style,padding:(style.padding??14)*scale,borderWidth:(style.borderWidth??(style.preset&&style.preset!=='grid'?.6:.75))*scale,cellStyles:style.cellStyles?.map(s=>({...s,...(s.insets?{insets:Object.fromEntries(Object.entries(s.insets).filter(([,value])=>value!==undefined).map(([key,value])=>[key,value!*scale]))}:{}),...(s.edges?{edges:Object.fromEntries(Object.entries(s.edges).filter(([,value])=>value!==undefined).map(([key,value])=>[key,{...value!,width:value!.width*scale}]))}:{}),fontSize:s.fontSize===undefined?undefined:s.fontSize*scale,...(s.runs?{runs:s.runs.map(run=>({...run,...(run.fontSize!==undefined?{fontSize:run.fontSize*scale}:{}),...(run.letterSpacing!==undefined?{letterSpacing:run.letterSpacing*scale}:{})}))}:{})}))};
}
