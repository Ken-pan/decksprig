const key='deck-studio-speaker-notes';

// The MCP bridge exposes speakerNotes, while some desktop Plugin API versions
// do not. Plugin data is a portable Deck note, never native presenter content.
export function readSlideNotes(slide:any):string|undefined{
  if('speakerNotes'in slide&&typeof slide.speakerNotes==='string')return slide.speakerNotes;
  const saved=slide.getPluginData?.(key);return saved||undefined;
}
export function writeSlideNotes(slide:any,notes:string):boolean{
  if('speakerNotes'in slide){if(slide.speakerNotes===notes)return false;slide.speakerNotes=notes;return true;}
  if(typeof slide.setPluginData!=='function'||slide.getPluginData?.(key)===notes)return false;
  slide.setPluginData(key,notes);return true;
}
