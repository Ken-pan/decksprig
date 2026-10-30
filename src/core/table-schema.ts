import {z} from './schema';
const color=z.string().check(z.regex(/^(#[\da-fA-F]{6}|transparent)$/));
export const TABLE_PRESETS=['editorial','banded','grid','contrast'] as const;
const address={row:z.number().check(z.int()).check(z.minimum(0)).check(z.maximum(99)),column:z.number().check(z.int()).check(z.minimum(0)).check(z.maximum(19))};
export const TableMergeSchema=z.strictObject({...address,rowSpan:z.number().check(z.int()).check(z.minimum(1)).check(z.maximum(100)),columnSpan:z.number().check(z.int()).check(z.minimum(1)).check(z.maximum(20))}).check(z.refine(m=>m.rowSpan*m.columnSpan>1, 'Merge at least two cells.'));
export const TableCellStyleSchema=z.strictObject({...address,fill:z.optional(color),color:z.optional(color),fontWeight:z.optional(z.number().check(z.int()).check(z.minimum(100)).check(z.maximum(900))),italic:z.optional(z.boolean()),align:z.optional(z.enum(['left','center','right'])),verticalAlign:z.optional(z.enum(['top','middle','bottom']))});
export type TableMerge=z.infer<typeof TableMergeSchema>;
export type TableCellStyle=z.infer<typeof TableCellStyleSchema>;
export const TableStyleSchema=z.strictObject({
  preset:z.optional(z.enum(TABLE_PRESETS)),headerRow:z.optional(z.boolean()),banded:z.optional(z.boolean()),
  borders:z.optional(z.enum(['rows','grid','none'])),padding:z.optional(z.number().check(z.minimum(0)).check(z.maximum(1000))),borderWidth:z.optional(z.number().check(z.minimum(0)).check(z.maximum(100))),
  numericAlign:z.optional(z.boolean()),verticalAlign:z.optional(z.enum(['top','middle','bottom'])),
  headerFill:z.optional(color),headerText:z.optional(color),bodyFill:z.optional(color),stripeFill:z.optional(color),lineColor:z.optional(color),
  columnAlign:z.optional(z.array(z.enum(['auto','left','center','right'])).check(z.maxLength(20))),columnWidths:z.optional(z.array(z.number().check(z.gt(0)).check(z.maximum(20000))).check(z.minLength(1)).check(z.maxLength(20))),
  rowHeights:z.optional(z.array(z.number().check(z.gt(0)).check(z.maximum(20000))).check(z.minLength(1)).check(z.maxLength(100))),
  merges:z.optional(z.array(TableMergeSchema).check(z.maxLength(1000))),cellStyles:z.optional(z.array(TableCellStyleSchema).check(z.maxLength(2000))),
});
export type TableStyle=z.infer<typeof TableStyleSchema>;

export function validateTableStyle(cells:string[][],style:TableStyle|undefined){
  const rows=cells.length,columns=Math.max(0,...cells.map(r=>r.length)),occupied=new Set<string>(),styled=new Set<string>();
  for(const m of style?.merges??[]){
    if(m.row+m.rowSpan>rows||m.column+m.columnSpan>columns)throw new Error('Merged cells must stay inside the table.');
    for(let r=m.row;r<m.row+m.rowSpan;r++)for(let c=m.column;c<m.column+m.columnSpan;c++){const key=`${r}:${c}`;if(occupied.has(key))throw new Error('Merged cells cannot overlap.');occupied.add(key);}
  }
  for(const s of style?.cellStyles??[]){const key=`${s.row}:${s.column}`;if(s.row>=rows||s.column>=columns)throw new Error('Cell styles must stay inside the table.');if(styled.has(key))throw new Error('Choose one style per cell.');styled.add(key);}
}

export function scaleTableStyle(style:TableStyle|undefined,scale:number):TableStyle|undefined {
  if(!style)return undefined;
  return {...style,padding:(style.padding??14)*scale,borderWidth:(style.borderWidth??(style.preset&&style.preset!=='grid'?.6:.75))*scale};
}
