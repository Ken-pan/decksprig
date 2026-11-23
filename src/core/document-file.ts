import {z} from './schema';
import {validateDeck,DeckSchema,ElementSchema,SlideSchema,assertDeckInvariants,type Deck} from './model';
import {packDocumentMedia} from './document-media-transport';

/** Portable file/HTTP envelope only. Editor, disk and recovery decks keep schema 1. */
export const DOCUMENT_FILE_SCHEMA='deck-studio/file-1' as const;
export const DOCUMENT_MEDIA_TYPE='application/vnd.deck-studio+json';
export const DOCUMENT_FILE_IMAGE = /^data:image\/(?:png|jpeg|webp|gif|svg\+xml);/;
const invalid=()=>new Error('This Deck file has invalid or incomplete image references.');
const envelope=z.strictObject({
  schema:z.literal(DOCUMENT_FILE_SCHEMA),id:z.string().check(z.maxLength(120)),deck:z.unknown(),
  assets:z.array(z.string().check(z.maxLength(35_000_000)).check(z.regex(DOCUMENT_FILE_IMAGE))).check(z.minLength(1)).check(z.maxLength(4000)),
  references:z.array(z.strictObject({slide:z.number().check(z.int()).check(z.minimum(0)).check(z.maximum(499)),element:z.number().check(z.int()).check(z.minimum(-1)).check(z.maximum(2999)),field:z.enum(['render','src','poster']),asset:z.number().check(z.int()).check(z.minimum(0)).check(z.maximum(3999))})).check(z.minLength(1)).check(z.maxLength(100_000)),
});
// Validate restored values with the exact field schemas; parse the metadata
// once, then run every global invariant after all references are restored.
const mediaFields={src:ElementSchema.shape.src.def.innerType,render:SlideSchema.shape.source.def.innerType.shape.render.def.innerType,poster:ElementSchema.shape.prototype.def.innerType.shape.poster.def.innerType};
export type DocumentFile=Deck|{schema:typeof DOCUMENT_FILE_SCHEMA;id:string;deck:Deck;assets:string[];references:{slide:number;element:number;field:'render'|'src'|'poster';asset:number}[]};

export function documentFile(deck:Deck, minimumOccurrences = 2):DocumentFile {
  const packed=packDocumentMedia(deck,65_536,minimumOccurrences);
  // Unique/small media stays in its legacy shape, with no wrapper overhead.
  return packed.assets.length&&packed.assets.length<=4000&&packed.references.length<=100_000&&packed.references.reduce((n,r)=>n+packed.assets[r.asset].length,0)<=256_000_000?{schema:DOCUMENT_FILE_SCHEMA,id:deck.id,...packed}:deck;
}

/** Validate and restore into a new canonical deck; never modify the input. */
export function readDocumentFile(raw:unknown):Deck {
  if((raw as {schema?:string})?.schema!==DOCUMENT_FILE_SCHEMA)return validateDeck(raw);
  const packed=envelope.parse(raw),deck=DeckSchema.parse(packed.deck),seen=new Set<string>(),used=new Set<number>(),checked=new Map<string,string>();
  if(packed.id!==deck.id)throw invalid();
  let expanded=0;
  for(const ref of packed.references){
    let value=packed.assets[ref.asset];const slide=deck.slides[ref.slide],site=`${ref.slide}:${ref.element}:${ref.field}`;
    if(!value||!slide||seen.has(site)||(expanded+=value.length)>256_000_000)throw invalid();
    seen.add(site);used.add(ref.asset);
    const check=ref.field+':'+ref.asset;let verified=checked.get(check);if(verified===undefined){verified=mediaFields[ref.field].parse(value);checked.set(check,verified);}value=verified;
    if(ref.field==='render'){
      if(ref.element!==-1||!slide.source||slide.source.render!==undefined)throw invalid();
      slide.source.render=value;
    }else{
      const element=slide.elements[ref.element];if(!element)throw invalid();
      if(ref.field==='src'){if(element.src!==undefined)throw invalid();element.src=value;}
      else {if(!element.prototype||element.prototype.poster!==undefined)throw invalid();element.prototype.poster=value;}
    }
  }
  if(used.size!==packed.assets.length)throw invalid();
  assertDeckInvariants(deck);return deck;
}

