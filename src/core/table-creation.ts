import {uid,type Deck,type SlideElement} from './model';
import {cloneDocumentData} from './document-data';
import {pasteOffset} from './clipboard';
import type {Editor} from './editor.svelte';

/** An explicit style source, never an arbitrary table elsewhere in a deck. */
export function blankTableWithStyle(source:SlideElement,page:Pick<Deck,'width'|'height'>):SlideElement{
 if(source.type!=='table'||!source.cells?.length)throw new Error('Select a table to use its style.');
 const copy=cloneDocumentData(source),offset=pasteOffset([source],[],page,1);
 copy.id=uid();copy.name='Blank table';copy.x+=offset.x;copy.y+=offset.y;copy.locked=false;copy.hidden=false;
 copy.cells=source.cells.map(row=>row.map(()=>''));
 // A style-based table is independent of the source object's placement,
 // interactions and matching identity. Existing native provenance is retained.
 for(const key of ['group','layoutItem','blockItem','link','animation','motionKey','motionMatch','pageElement'] as const)delete copy[key];
 return copy;
}

export function createBlankTableWithStyle(editor:Editor,sourceId:string):string|undefined{
 const deck=editor.deck,slide=editor.slide,selected=editor.selection;
 if(!deck||!slide||selected.length!==1||selected[0].id!==sourceId||selected[0].type!=='table'||selected[0].locked)return;
 const copy=blankTableWithStyle(selected[0],deck),revision=deck.revision;
 editor.commit([{op:'add_element',slideId:slide.id,element:copy}],'','manual',revision);
 if(editor.deck?.revision===revision)return;
 editor.choose(copy.id,false,true);editor.notify('Blank table created · Undo available');return copy.id;
}
