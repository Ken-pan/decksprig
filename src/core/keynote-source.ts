import {z} from './schema';
import {TextRunSchema,ParagraphSchema,type Deck} from './model';
const hash=z.string().check(z.regex(/^[a-f0-9]{64}$/));
export const KeynoteStateSchema=z.strictObject({width:z.number().check(z.gt(0)).check(z.maximum(20000)),height:z.number().check(z.gt(0)).check(z.maximum(20000)),fonts:hash,slides:z.array(z.strictObject({hidden:z.optional(z.boolean()),notes:z.string().check(z.maxLength(100000)),signature:hash,objects:z.array(z.strictObject({sourceId:z.optional(z.string().check(z.maxLength(200))),type:z.string().check(z.maxLength(30)),signature:hash,text:z.optional(z.string().check(z.maxLength(50000))),runs:z.optional(z.array(TextRunSchema).check(z.maxLength(5000))),paragraphs:z.optional(z.array(ParagraphSchema).check(z.maxLength(5000))),fontSize:z.optional(z.number().check(z.minimum(1)).check(z.maximum(1000))),fontFamily:z.optional(z.string().check(z.maxLength(100))),fill:z.optional(z.string())})).check(z.maxLength(3000))})).check(z.maxLength(500))});
export type KeynoteState=z.infer<typeof KeynoteStateSchema>;
function canonical(value:any):string {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
function styles(runs:any[]){const out:any[]=[];for(const {text,...style}of runs){if(out.length&&canonical(out.at(-1))===canonical(style))continue;out.push(style);}return out;}
/** A compact export contract. Images stay local; their bytes are hashed. */
export async function keynoteState(deck:Deck):Promise<KeynoteState>{
 const digest=async(value:any)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)))),b=>b.toString(16).padStart(2,'0')).join('');
 const slides=[];
 for(const slide of deck.slides){const objects=[];
  for(const e of slide.elements){const {id,name,text,runs,paragraphs,...structure}=e;
   const style=e.type==='text'?{...structure,runs:runs?styles(runs):undefined,paragraphs:paragraphs?.map(({runs,...p})=>({...p,runs:styles(runs)}))}:structure;
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(style)));
   const signature=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
   objects.push({sourceId:e.sourceId,type:e.type,signature,...(e.type==='text'?{text:e.text,runs:e.runs,paragraphs:e.paragraphs,fontSize:e.fontSize,fontFamily:e.fontFamily,fill:e.fill}:{})});
  }slides.push({hidden:Boolean(slide.hidden),notes:slide.notes,signature:await digest({background:slide.background,transition:slide.transition,layout:slide.layout}),objects});
 }return {width:deck.width,height:deck.height,fonts:await digest({fonts:deck.fonts,onlineFonts:deck.onlineFonts}),slides};
}
