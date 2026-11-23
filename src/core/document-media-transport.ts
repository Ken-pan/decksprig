import type {Deck} from './model';

export type MediaLocation = {slide:number;element:number;field:'render'|'src'|'poster'};
type MediaReference = MediaLocation & {asset:number};
export type PackedDocumentMedia = {deck:Deck;assets:string[];references:MediaReference[]};

export function forEachDocumentImage(deck: Deck, visit: (value: string, location: MediaLocation) => void, minimumLength: number) {
  const add = (slide: number, element: number, field: MediaLocation['field'], value?: string) => {
    if (value?.startsWith('data:image/') && value.length >= minimumLength) visit(value, {slide, element, field});
  };
  deck.slides.forEach((slide, index) => {
    add(index, -1, 'render', slide.source?.render);
    slide.elements.forEach((element, position) => {
      add(index, position, 'src', element.src);
      add(index, position, 'poster', element.prototype?.poster);
    });
  });
}

// This is an internal transport envelope, never a saved document. Structured
// cloning repeats large primitive strings even when many objects use one image.
// Send repeated media once, then restore it before any builder or HTTP encoding.
export function packDocumentMedia(deck:Deck,minimumLength=65_536,minimumOccurrences=2):PackedDocumentMedia {
  const sites:{slide:number;element:number;field:MediaReference['field'];value:string}[]=[];
  const counts=new Map<string,number>();
  forEachDocumentImage(deck, (value, location) => {
    sites.push({...location, value});
    counts.set(value,(counts.get(value)??0)+1);
  }, minimumLength);
  const assets=[...counts].filter(([,count])=>count>=minimumOccurrences).map(([value])=>value);
  if(!assets.length)return {deck,assets:[],references:[]};
  const ids=new Map(assets.map((value,i)=>[value,i]));
  const slides=[...deck.slides],writable=new Set<number>(),references:MediaReference[]=[];
  for(const site of sites){
    const asset=ids.get(site.value);if(asset===undefined)continue;
    if(!writable.has(site.slide)){const s=slides[site.slide];slides[site.slide]={...s,elements:[...s.elements]};writable.add(site.slide);}
    const slide=slides[site.slide];
    if(site.field==='render')slide.source={...slide.source!,render:undefined};
    else {
      const element={...slide.elements[site.element]};slide.elements[site.element]=element;
      if(site.field==='src')element.src=undefined;
      else element.prototype={...element.prototype!,poster:undefined};
    }
    references.push({slide:site.slide,element:site.element,field:site.field,asset});
  }
  return {deck:{...deck,slides},assets,references};
}

// The envelope belongs to the receiving worker. Restored immutable strings are
// shared there; their original contents, geometry and provenance are unchanged.
export function restoreDocumentMedia(packed:PackedDocumentMedia):Deck {
  for(const ref of packed.references){
    const value=packed.assets[ref.asset],slide=packed.deck.slides[ref.slide];
    if(typeof value!=='string'||!slide)throw new Error('Could not read the document media transport.');
    if(ref.field==='render'){
      if(!slide.source)throw new Error('Could not read the source reference.');slide.source.render=value;
    }else{
      const element=slide.elements[ref.element];if(!element)throw new Error('Could not read the document image.');
      if(ref.field==='src')element.src=value;
      else {if(!element.prototype)throw new Error('Could not read the prototype poster.');element.prototype.poster=value;}
    }
  }
  return packed.deck;
}
