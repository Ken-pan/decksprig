import type {Deck} from './model';
import {fontFamilyKey,sameFontFamily} from './font-stack';
type DocumentFont=NonNullable<Deck['fonts']>[number];
type Entry={font:DocumentFont;face:FontFace;ready:Promise<void>;pins:number;removed:boolean};

// Own only imported document faces, never browser/UI/library fonts. Equality
// includes the original bytes, so equal-length replacement files load correctly.
export class DocumentFontRegistry {
  private entries=new Set<Entry>();
  private current=new Set<Entry>();
  private deferred=false;
  constructor(private faces:Pick<FontFaceSet,'add'|'delete'>,private create:(font:DocumentFont)=>FontFace=font=>new FontFace(font.family,`url(${font.data})`,{weight:font.weight,style:font.style})){}
  private get(font:DocumentFont):Entry {
    const existing=[...this.entries].find(e=>sameFontFamily(e.font.family,font.family)&&e.font.weight===font.weight&&e.font.style===font.style&&e.font.data===font.data);
    if(existing)return existing;
    const face=this.create(font),entry:Entry={font,face,ready:Promise.resolve(),pins:0,removed:false};
    this.entries.add(entry);this.faces.add(face);
    entry.ready=face.load().then(()=>{},error=>{this.remove(entry);throw new Error(`Cannot load font: ${font.family}`,{cause:error});});
    // Active sync/lease callers still receive the error; no abandoned face load
    // may create an unhandled rejection after its document is closed.
    void entry.ready.catch(()=>{});
    return entry;
  }
  private remove(entry:Entry){entry.removed=true;this.faces.delete(entry.face);this.entries.delete(entry);}
  private cleanup(){if(!this.deferred)for(const entry of this.entries)if(!this.current.has(entry)&&!entry.pins)this.remove(entry);}
  sync(fonts:DocumentFont[]=[],deferRelease=false):Promise<void>{
    this.deferred=deferRelease;this.current=new Set(fonts.map(font=>this.get(font)));this.cleanup();
    return Promise.all([...this.current].map(entry=>entry.ready)).then(()=>{});
  }
  retain(fonts:DocumentFont[]=[]){
    const entries=fonts.map(font=>this.get(font));for(const entry of entries)entry.pins++;
    let released=false;
    return {ready:Promise.all(entries.map(entry=>entry.ready)).then(()=>{}),release:()=>{if(released)return;released=true;for(const entry of entries)entry.pins--;this.cleanup();}};
  }
  dispose(){this.current.clear();this.deferred=false;this.cleanup();}
}
let registry:DocumentFontRegistry|undefined;
function browserRegistry(){return typeof document==='undefined'?undefined:registry??=new DocumentFontRegistry(document.fonts);}
export function syncDocumentFonts(fonts:Deck['fonts'],deferRelease=false):Promise<void>{return browserRegistry()?.sync(fonts,deferRelease)??Promise.resolve();}
export async function withDocumentFonts<T>(fonts:Deck['fonts'],read:()=>Promise<T>):Promise<T>{
  if(!fonts?.length)return read();
  const lease=browserRegistry()?.retain(fonts);
  try { await lease?.ready.catch(()=>{});return await read(); } finally {lease?.release();}
}
