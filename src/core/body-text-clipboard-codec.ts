import {z} from './schema';
import {TextRunSchema,ParagraphSchema} from './model';
const base=z.strictObject({fontFamily:z.string().check(z.maxLength(100)),fontSize:z.number().check(z.minimum(4)).check(z.maximum(500)),fontWeight:z.number().check(z.minimum(100)).check(z.maximum(900)),italic:z.boolean(),underline:z.boolean(),strikethrough:z.boolean(),fill:TextRunSchema.shape.color,lineHeight:z.number().check(z.minimum(.5)).check(z.maximum(4)),letterSpacing:z.number().check(z.minimum(-30)).check(z.maximum(50)),align:z.enum(['left','center','right']),textCase:TextRunSchema.shape.textCase,paragraphSpacingAtEdges:z.boolean()});
export const BodyTextClipboardSchema=z.strictObject({kind:z.literal('deck-studio/text/1'),text:z.string().check(z.maxLength(50000)),base:z.optional(base),runs:z.optional(z.array(TextRunSchema).check(z.maxLength(5000))),paragraphs:z.optional(z.array(ParagraphSchema).check(z.minLength(1)).check(z.maxLength(5000)))}).check(z.refine(p=>{
  if(p.runs&&p.paragraphs)return false;
  if((p.paragraphs?.reduce((n,p)=>n+p.runs.length,0)??p.runs?.length??0)>55000)return false;
  return (p.paragraphs?p.paragraphs.map(p=>p.runs.map(r=>r.text).join('')).join('\n'):(p.runs??[]).map(r=>r.text).join(''))===p.text;
},'Clipboard text must match its formatting.'));
export type BodyTextClipboard=z.infer<typeof BodyTextClipboardSchema>;
export function readBodyTextClipboard(raw:string){if(!raw||raw.length>80_000_000)return;try{const result=BodyTextClipboardSchema.safeParse(JSON.parse(raw));return result.success?result.data:undefined;}catch{return;}}

/** Own HTML metadata is a fallback when the browser strips custom MIME types. */
export function readBodyHtmlClipboard(html:string){
  if(html.length>240_000_000)return;
  const encoded=html.match(/data-deck-studio-text="([^"]*)"/)?.[1];if(!encoded)return;
  try{return readBodyTextClipboard(decodeURIComponent(encoded));}catch{return;}
}
