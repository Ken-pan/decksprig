import { uid, type Deck, type Slide, type SlideElement } from './model';
import type { Operation } from './operations';
import {resolveObjectMotion} from './motion-sequence';

export function createNextMotionState(deck: Deck, source: Slide): {slide: Slide; operations: Operation[]} {
  if(deck.slides.length>=500)throw new Error('This document has reached the 500-slide limit.');
  const operations:Operation[]=[],groups=new Map<string,string>(),ids=new Map(source.elements.map(e=>[e.id,uid()]));
  for(const id of new Set([...(source.groups??[]).flatMap(g=>[g.id,...(g.parent?[g.parent]:[])]),...(source.autoLayouts??[]).map(l=>l.id),...source.elements.flatMap(e=>e.group?[e.group]:[])]))groups.set(id,uid('group'));
  const elements=source.elements.map(e=>{
    let key=e.motionKey;
    if(!key && !e.locked && !e.hidden && e.motionMatch!=='off' && !e.sourceRegion && !['prototype','line'].includes(e.type)){
      key=uid('motion');operations.push({op:'update_element',slideId:source.id,elementId:e.id,patch:{motionKey:key}});
    }
    return {...JSON.parse(JSON.stringify(e)),id:ids.get(e.id)!,group:e.group?groups.get(e.group):undefined,motionKey:key,animation:e.animation?{...e.animation,effect:'none' as const}:undefined};
  });
  const slide:Slide={...JSON.parse(JSON.stringify(source)),id:uid('slide'),elements,transition:{effect:'smart',duration:650,easing:'cinematic'}};delete slide.title;
  slide.groups=source.groups?.map(g=>({...JSON.parse(JSON.stringify(g)),id:groups.get(g.id)!,parent:g.parent?groups.get(g.parent):undefined}));
  slide.autoLayouts=source.autoLayouts?.map(l=>({...JSON.parse(JSON.stringify(l)),id:groups.get(l.id)!,order:l.order.map(id=>ids.get(id)??groups.get(id)!)}));
  operations.push({op:'add_slide',slide,afterId:source.id});return {slide,operations};
}

export function entranceGroups(slide:Slide,trigger:'auto'|'click') {
  const groups=new Map<number,SlideElement[]>();
  for(const e of slide.elements)if(!e.hidden && e.animation?.effect!=='none' && e.animation?.trigger===trigger){
    const existing=groups.get(e.animation.order);if(existing)existing.push(e);else groups.set(e.animation.order,[e]);
  }
  return [...groups].sort(([a],[b])=>a-b).map(([order,elements])=>({order,elements}));
}
export function moveEntranceGroup(slide:Slide,trigger:'auto'|'click',order:number,direction:number):Operation[] {
  const groups=entranceGroups(slide,trigger),i=groups.findIndex(g=>g.order===order),a=groups[i],b=groups[i+direction];
  if(!a || !b || [...a.elements,...b.elements].some(e=>e.locked))return [];
  return [...a.elements.map(e=>({op:'update_element' as const,slideId:slide.id,elementId:e.id,patch:{animation:{...e.animation!,order:b.order}}})),...b.elements.map(e=>({op:'update_element' as const,slideId:slide.id,elementId:e.id,patch:{animation:{...e.animation!,order:a.order}}}))];
}

export function entranceSequence(slide:Slide,trigger:'auto'|'click') {
  const groups=entranceGroups(slide,trigger),locked=groups.map(group=>group.elements.some(item=>item.locked));
  return groups.map((group,index)=>({...group,
    canMoveEarlier:index>0&&!locked[index]&&!locked[index-1],
    canMoveLater:index<groups.length-1&&!locked[index]&&!locked[index+1],
  }));
}

/** One click block includes every dependent with/after-previous child. */
export function objectMotionSequence(slide:Slide){
  const plan=resolveObjectMotion(slide),cues=[...new Set(plan.entries.map(e=>e.cue))].sort((a,b)=>a-b);
  const groups=cues.map(cue=>{const entries=plan.entries.filter(e=>e.cue===cue),elements=entries.map(entry=>slide.elements.find(e=>e.id===entry.id)!);return {cue,order:Math.min(...entries.map(e=>e.order)),entries,elements};});
  const click=groups.filter(g=>g.cue>0);
  return groups.map(group=>{const index=click.indexOf(group),locked=group.elements.some(e=>e.locked);return {...group,canMoveEarlier:index>0&&!locked&&!click[index-1].elements.some(e=>e.locked),canMoveLater:index>=0&&index<click.length-1&&!locked&&!click[index+1].elements.some(e=>e.locked)};});
}

export function moveObjectMotionGroup(slide:Slide,cue:number,direction:number):Operation[]{
  if(direction!==-1&&direction!==1)return [];
  const groups=objectMotionSequence(slide).filter(g=>g.cue>0),index=groups.findIndex(g=>g.cue===cue),a=groups[index],b=groups[index+direction];
  if(!a||!b||[...a.elements,...b.elements].some(e=>e.locked))return [];
  const first=index<index+direction?a:b,second=first===a?b:a;
  const oldOrders=(group:typeof a)=>[...new Set(group.entries.map(e=>e.order))].sort((x,y)=>x-y),slots=[...oldOrders(first),...oldOrders(second)].sort((x,y)=>x-y);
  const mapping=new Map<number,number>();let slot=0;
  for(const group of [second,first])for(const order of oldOrders(group))mapping.set(order,slots[slot++]);
  return [...first.elements,...second.elements].filter(e=>mapping.get(e.animation!.order)!==e.animation!.order).map(e=>({op:'update_element',slideId:slide.id,elementId:e.id,patch:{animation:{...e.animation!,order:mapping.get(e.animation!.order)!}}}));
}
