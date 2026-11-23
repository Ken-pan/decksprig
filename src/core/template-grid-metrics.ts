import type {CollectionId,LayoutId} from './template-collections';
import type {PageLayout} from './model';
import {contentBounds,columnBounds} from './page-layout-geometry';

type Horizontal={x:number;w:number};
export type TemplatePageGrid=ReturnType<typeof templatePageGrid>;
/** A template's page grid is chosen BEFORE composition. Regions are column spans,
 * not nearest-edge snaps inferred from the finished artwork. Local diagrams and
 * interfaces retain their internal coordinates inside an explicitly placed region. */
export function templatePageGrid(collection:CollectionId,page:LayoutId){
  const margin=collection==='minimal'?96:84;
  const top=page==='cover'?174:page==='section'?166:page==='quote'?174:138;
  const gutter=['gallery','insights','q-and-a'].includes(page)?40:collection==='minimal'?32:24;
  const layout:PageLayout={margins:{left:margin,right:margin,top,bottom:74},columns:12,gutter};
  const size={width:1440,height:810},content=contentBounds(size,{layout}),columns=columnBounds(size,{layout});
  const span=(start:number,count:number):Horizontal=>{
    if(start<0||count<1||start+count>columns.length)throw new Error('Invalid template column span.');
    const a=columns[start],b=columns[start+count-1];return{x:a.x,w:b.x+b.w-a.x};
  };
  return {layout,content,columns,span,full:span(0,12),bottom:content.y+content.h};
}
