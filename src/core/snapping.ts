import type { Slide, SlideElement } from './model';
import { selectionBounds, resizeFromCorner, resizeHandlePoint, type ResizeHandle, type Bounds, type Point } from './interactions';
import {createContainerTree} from './container-tree';
import {selectionFrame} from './selection-transform';
import { contentBounds, columnBounds, type PageSize } from './page-layout-geometry';
import { SNAP_INCREMENT } from './numeric-increment';

export type Axis = 'x' | 'y';
export type SnapKind = 'page' | 'margin' | 'column' | 'object' | 'spacing' | 'gap' | 'grid' | 'size';
type Reference = {ids: string[]; box: Bounds; element?: SlideElement};
type ReferenceGap = {before: Reference; after: Reference; distance: number; key: string};
export type SnapSegment = {from: number; to: number; at?: number; reference?: boolean};
export type SnapMeasure = {from: Point; to: Point; label: Point; reference?: boolean};
type Target = {value: number; box: Bounds; kind: SnapKind; label: string; ids: string[]; key: string; center: boolean};
export type SnapGuide = {axis: Axis; value: number; from: number; to: number; kind: SnapKind; label: string; ids: string[]; token: string; segments?: SnapSegment[]; measures?: SnapMeasure[]};
export type SnapResult = {dx: number; dy: number; guides: SnapGuide[]};
export type SnapScene = {page: PageSize; moving: Bounds; references: Reference[]; targets: Record<Axis, Target[]>; gaps: Record<Axis, ReferenceGap[]>};
type Options = {scale: number; pointerType?: string; enabled?: boolean; constraint?: Axis; previous?: SnapGuide[]; spacing?: boolean; grid?: boolean; resize?: (dx:number,dy:number)=>Bounds};
type Choice = {delta: number; guide: SnapGuide; rank: number; proximity: number};
const ends = (b: Bounds, a: Axis) => a === 'x' ? [b.x, b.x + b.w] : [b.y, b.y + b.h];
const size = (b: Bounds, a: Axis) => a === 'x' ? b.w : b.h;
const other = (a: Axis): Axis => a === 'x' ? 'y' : 'x';
const cleanNumber = (value: number) => Math.round(value * 10) / 10;
const contains = (a: Bounds, b: Bounds) => a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h;
const separation = (a: Bounds, b: Bounds, axis: Axis) => Math.max(0, ends(a,axis)[0]-ends(b,axis)[1], ends(b,axis)[0]-ends(a,axis)[1]);
function sharedLane(a: Bounds, b: Bounds, axis: Axis) {
  const cross=other(axis),[a0,a1]=ends(a,cross),[b0,b1]=ends(b,cross);
  return Math.min(a1,b1)-Math.max(a0,b0) >= Math.max(.001,Math.min(size(a,cross),size(b,cross))*.25);
}
function obstructed(refs: Reference[], a: Bounds, b: Bounds, axis: Axis, excluded: Reference[]) {
  const cross=other(axis),from=ends(a,axis)[1],to=ends(b,axis)[0],lo=Math.max(...[ends(a,cross)[0],ends(b,cross)[0]]),hi=Math.min(...[ends(a,cross)[1],ends(b,cross)[1]]);
  return refs.some(r=>!excluded.includes(r)&&!contains(r.box,a)&&!contains(r.box,b)&&Math.min(ends(r.box,axis)[1],to)-Math.max(ends(r.box,axis)[0],from)>.001&&Math.min(ends(r.box,cross)[1],hi)-Math.max(ends(r.box,cross)[0],lo)>.001);
}
/** Index adjacent gaps once. The bounded sweep avoids all-pairs work on dense slides. */
function referenceGaps(refs: Reference[], axis: Axis): ReferenceGap[] {
  const sorted=[...refs].sort((a,b)=>ends(a.box,axis)[0]-ends(b.box,axis)[0]),gaps:ReferenceGap[]=[];
  for(let i=0;i<sorted.length;i++){
    const before=sorted[i],window=sorted.slice(Math.max(0,i-64),i+65);let found=0;
    for(let j=i+1;j<Math.min(sorted.length,i+65);j++){
      const after=sorted[j],distance=ends(after.box,axis)[0]-ends(before.box,axis)[1];
      if(distance<1||!sharedLane(before.box,after.box,axis))continue;
      if(!obstructed(window,before.box,after.box,axis,[before,after])){gaps.push({before,after,distance,key:`${before.ids.join(',')}:${after.ids.join(',')}`});if(++found===4)break;}
    }
  }
  return gaps;
}

/** Capture stable reference geometry once per gesture, including transformed visible bounds. */
export function createSnapScene(page: PageSize, slide: Slide, ids: string[], excludeIds = ids, context=''): SnapScene | null {
  if(!slide.elements.some(e=>ids.includes(e.id)&&!e.hidden&&!e.locked))return null;
  const tree=createContainerTree(slide),moving = selectionFrame(slide,ids,context,tree);
  if (!moving) return null;
  const excluded=new Set([...ids,...excludeIds]),partial=new Set<string>();
  for(const id of excluded)for(const ancestor of tree.ancestors(id))partial.add(ancestor);
  const buckets = new Map<string, SlideElement[]>();
  for (const e of slide.elements.filter(e => !excluded.has(e.id) && !e.hidden && e.opacity > 0)) {
    const key = [...tree.ancestors(e.id)].reverse().find(id=>!partial.has(id))??e.id, members = buckets.get(key);
    if (members) members.push(e); else buckets.set(key, [e]);
  }
  const references:Reference[] = [...buckets.entries()].map(([key,es]) => ({ids: es.map(e => e.id), box: tree.layouts.get(key)??selectionBounds(es)!,...(!tree.groupById.has(key)&&es.length===1?{element:es[0]}:{})}));
  const targets: Record<Axis, Target[]> = {x: [], y: []};
  const add = (axis: Axis, value: number, box: Bounds, kind: SnapKind, label: string, key: string, ids: string[] = [], center = false) => targets[axis].push({value, box, kind, label, key, ids, center});
  const full = {x: 0, y: 0, w: page.width, h: page.height}, content = contentBounds(page, slide);
  for (const axis of ['x','y'] as const) {
    const [start,end] = ends(full,axis), [innerStart,innerEnd] = ends(content,axis);
    add(axis,start,full,'page',axis==='x'?'Slide left edge':'Slide top edge','page-start');
    add(axis,(start+end)/2,full,'page',axis==='x'?'Slide horizontal center':'Slide vertical center','page-center',[],true);
    add(axis,end,full,'page',axis==='x'?'Slide right edge':'Slide bottom edge','page-end');
    add(axis,innerStart,content,'margin',axis==='x'?'Left margin':'Top margin','margin-start');
    add(axis,(innerStart+innerEnd)/2,content,'margin',axis==='x'?'Content horizontal center':'Content vertical center','margin-center',[],true);
    add(axis,innerEnd,content,'margin',axis==='x'?'Right margin':'Bottom margin','margin-end');
    for (const ref of references) {
      const [a,b] = ends(ref.box,axis);
      for (const [value,anchor] of [[a,'start'],[(a+b)/2,'center'],[b,'end']] as const) add(axis,value,ref.box,'object',anchor==='center'?(axis==='x'?'Align horizontal centers':'Align vertical centers'):'Align edges',`${ref.ids.join(',')}:${anchor}`,ref.ids,anchor==='center');
    }
  }
  const columns = columnBounds(page,slide);
  if(columns.length>1)for(const [i,box] of columns.entries()) {
    add('x',box.x,box,'column',`Column ${i+1}  left edge`,'column-'+i+'-start');
    add('x',box.x+box.w/2,box,'column',`Column ${i+1}  center`,'column-'+i+'-center',[],true);
    add('x',box.x+box.w,box,'column',`Column ${i+1}  right edge`,'column-'+i+'-end');
  }
  for(const axis of ['x','y'] as const)targets[axis].sort((a,b)=>a.value-b.value);
  return {page,moving,references,targets,gaps:{x:referenceGaps(references,'x'),y:referenceGaps(references,'y')}};
}
function nearby(targets: Target[], value: number, radius: number) {
  let lo=0,hi=targets.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(targets[mid].value<value-radius)lo=mid+1;else hi=mid;}
  const found:Target[]=[];for(let i=lo;i<targets.length&&targets[i].value<=value+radius;i++)found.push(targets[i]);return found;
}
function alignmentChoices(scene: SnapScene, box: Bounds, axis: Axis, radius: number): Choice[] {
  const [start,end] = ends(box,axis), cross = other(axis), crossEnds = ends(box,cross), choices:Choice[]=[];
  for(const [position,anchor] of [[start,'start'],[(start+end)/2,'center'],[end,'end']] as const) {
    for(const target of nearby(scene.targets[axis],position,radius)) {
      if(target.center !== (anchor==='center'))continue;
      const [a,b] = ends(target.box,cross);
      const proximity = Math.max(0,a-crossEnds[1],crossEnds[0]-b);
      const label = target.kind==='object'&&anchor!=='center' ? axis==='x' ? anchor==='start'?'Align left':'Align right' : anchor==='start'?'Align top':'Align bottom' : target.label;
      choices.push({delta:target.value-position,rank:target.kind==='margin'?0:target.kind==='column'?1:target.kind==='object'?2:3,proximity,
        guide:{axis,value:target.value,from:Math.min(a,crossEnds[0]),to:Math.max(b,crossEnds[1]),kind:target.kind,label,ids:target.ids,token:`${axis}:${target.kind}:${target.key}:${anchor}`}});
    }
  }
  return choices;
}
function spacingChoices(scene: SnapScene, box: Bounds, axis: Axis, radius: number, scale: number): Choice[] {
  const cross=other(axis),[start,end]=ends(box,axis),length=size(box,axis),choices:Choice[]=[];
  const local=scene.references.filter(r=>!contains(r.box,box)&&!contains(box,r.box)&&sharedLane(r.box,box,axis));
  const before=local.filter(r=>ends(r.box,axis)[1]<=start+radius).sort((a,b)=>ends(b.box,axis)[1]-ends(a.box,axis)[1])[0];
  const after=local.filter(r=>ends(r.box,axis)[0]>=end-radius).sort((a,b)=>ends(a.box,axis)[0]-ends(b.box,axis)[0])[0];
  const baseline=(boxes:Bounds[])=>{
    const lo=Math.min(...boxes.map(b=>ends(b,cross)[0])),hi=Math.max(...boxes.map(b=>ends(b,cross)[1])),available=cross==='x'?scene.page.width:scene.page.height;
    return hi+12/scale<=available-14/scale?hi+12/scale:Math.max(14/scale,lo-12/scale);
  };
  const add=(desired:number,distance:number,refs:Reference[],token:string,segments:SnapSegment[],value:number,matched=false,proximity=0)=>{
    if(distance<1||Math.abs(desired-start)>radius)return;
    const placed={...box,[axis]:desired};
    if(local.some(r=>!contains(r.box,placed)&&separation(r.box,placed,axis)===0&&Math.min(ends(r.box,axis)[1],desired+length)-Math.max(ends(r.box,axis)[0],desired)>.001))return;
    choices.push({delta:desired-start,rank:2,proximity,guide:{axis,value,from:Math.min(...segments.map(s=>s.from)),to:Math.max(...segments.map(s=>s.to)),kind:'spacing',label:`${matched?'Match':'Equal'} spacing ${cleanNumber(distance)}px`,ids:[...new Set(refs.flatMap(r=>r.ids))],token:`${axis}:spacing:${token}`,segments}});
  };
  // Balance the two nearest neighbours, even when other rows interleave in layer order.
  if(before&&after&&sharedLane(before.box,after.box,axis)){
    const a=ends(before.box,axis)[1],b=ends(after.box,axis)[0],distance=(b-a-length)/2,desired=a+distance,value=baseline([box,before.box,after.box]);
    if(!obstructed(local,before.box,after.box,axis,[before,after]))add(desired,distance,[before,after],`${before.ids.join(',')}:${after.ids.join(',')}:between`,[{from:a,to:desired},{from:desired+length,to:b}],value);
  }
  const reach=Math.max(180/scale,size(box,cross)*2);
  const anchors=[box,...[before,after].flatMap(r=>r?[r.box]:[])];
  const gaps=scene.gaps[axis].filter(g=>separation(g.before.box,box,cross)<=reach&&separation(g.after.box,box,cross)<=reach&&anchors.some(anchor=>Math.min(separation(g.before.box,anchor,axis),separation(g.after.box,anchor,axis))<=Math.max(240/scale,length*2)));
  for(const gap of gaps){
    const sourceFrom=ends(gap.before.box,axis)[1],sourceTo=ends(gap.after.box,axis)[0];
    for(const [neighbor,side] of [[before,'after'],[after,'before']] as const){
      if(!neighbor)continue;
      const edge=ends(neighbor.box,axis)[side==='after'?1:0],desired=side==='after'?edge+gap.distance:edge-gap.distance-length;
      if(Math.abs(desired-start)>radius)continue;
      const placed={...box,[axis]:desired},a=side==='after'?neighbor.box:placed,b=side==='after'?placed:neighbor.box;
      if(obstructed(local,a,b,axis,[neighbor]))continue;
      const same=neighbor===gap.before||neighbor===gap.after,common=same&&sharedLane(gap.before.box,box,axis)&&sharedLane(gap.after.box,box,axis);
      const value=baseline(common?[placed,neighbor.box,gap.before.box,gap.after.box]:[placed,neighbor.box]);
      const source:SnapSegment={from:sourceFrom,to:sourceTo,...(!common?{at:baseline([gap.before.box,gap.after.box]),reference:true}:{})};
      const target={from:side==='after'?edge:desired+length,to:side==='after'?desired:edge};
      // The source must remain a real gap; moving into it uses the balancing case above.
      if(sharedLane(gap.before.box,placed,axis)&&Math.min(sourceTo,desired+length)-Math.max(sourceFrom,desired)>.001)continue;
      add(desired,gap.distance,[gap.before,gap.after,neighbor],`${gap.key}:${neighbor.ids.join(',')}:${side}`,[source,target],value,!common,separation(gap.before.box,box,cross)+separation(gap.after.box,box,cross));
    }
  }
  return choices;
}
function choose(choices: Choice[], previous: SnapGuide|undefined, attach: number, release: number): Choice | undefined {
  const held=previous&&choices.find(c=>c.guide.token===previous.token&&Math.abs(c.delta)<=release);
  if(held)return held;
  return choices.filter(c=>Math.abs(c.delta)<=attach).sort((a,b)=>Math.abs(Math.abs(a.delta)-Math.abs(b.delta))>1e-6?Math.abs(a.delta)-Math.abs(b.delta):a.rank-b.rank||a.proximity-b.proximity||a.guide.token.localeCompare(b.guide.token))[0];
}

/** A dense grid is a quiet fallback: its hold range must never span several cells. */
function incrementChoice(value: number, axis: Axis, box: Bounds, label: string, prefix: string, previous: SnapGuide | undefined, options: Options): Choice | undefined {
  const scale = Math.max(.01, options.scale), touch = options.pointerType === 'touch';
  const attach = Math.min(2, (touch ? 3 : 2) / scale), release = Math.min(3, (touch ? 4 : 3) / scale);
  const rounded = Math.round(value / SNAP_INCREMENT) * SNAP_INCREMENT;
  const held = previous?.kind === 'grid' && previous.token.startsWith(prefix) ? Number(previous.token.slice(prefix.length)) : undefined;
  const choices = [...new Set([rounded, ...(held !== undefined ? [held] : [])])].map(n => ({
    delta: n - value, rank: 5, proximity: 0,
    guide: {axis, value: n, from: ends(box, other(axis))[0] - 8 / scale, to: ends(box, other(axis))[1] + 8 / scale,
      kind: 'grid' as const, label: `${label} ${cleanNumber(n)} px`, ids: [], token: `${prefix}${n}`},
  }));
  return choose(choices, previous, attach, release);
}

/** Measure the nearest unobstructed neighbour on each side, rather than arbitrary pairs. */
function incrementGapChoices(scene: SnapScene, box: Bounds, axis: Axis, scale: number, previous?: SnapGuide): Choice[] {
  const cross = other(axis), [start, end] = ends(box, axis), [crossStart, crossEnd] = ends(box, cross);
  const refs = scene.references.filter(r => {
    const [a, b] = ends(r.box, cross);
    return Math.min(b, crossEnd) - Math.max(a, crossStart) > 0;
  });
  const before = refs.filter(r => ends(r.box, axis)[1] <= start).sort((a,b) => ends(b.box,axis)[1] - ends(a.box,axis)[1])[0];
  const after = refs.filter(r => ends(r.box, axis)[0] >= end).sort((a,b) => ends(a.box,axis)[0] - ends(b.box,axis)[0])[0];
  return [before, after].flatMap((ref, i) => {
    if (!ref) return [];
    const edge = ends(ref.box, axis)[i === 0 ? 1 : 0], gap = i === 0 ? start - edge : edge - end;
    const prefix = `${axis}:gap:${ref.ids.join(',')}:${i}:`;
    const held = previous?.kind === 'gap' && previous.token.startsWith(prefix) ? Number(previous.token.slice(prefix.length)) : undefined;
    return [...new Set([Math.round(gap / SNAP_INCREMENT) * SNAP_INCREMENT, ...(held !== undefined ? [held] : [])])].filter(distance=>distance>=SNAP_INCREMENT).map(distance=>{
    const delta = (distance - gap) * (i === 0 ? 1 : -1);
    const segment = i === 0 ? {from: edge, to: start + delta} : {from: end + delta, to: edge};
    const crossMax = Math.max(crossEnd, ends(ref.box, cross)[1]), crossMin = Math.min(crossStart, ends(ref.box, cross)[0]);
    const available = cross === 'x' ? scene.page.width : scene.page.height;
    const baseline = crossMax + 12 / scale <= available - 14 / scale ? crossMax + 12 / scale : Math.max(14 / scale, crossMin - 12 / scale);
    return {delta, rank: 4, proximity: gap, guide: {axis, value: baseline, from: segment.from, to: segment.to,
      kind: 'gap' as const, label: `Gap ${distance} px`, ids: ref.ids, token: `${prefix}${distance}`, segments: [segment]}};
    });
  });
}
/** Snap in screen-pixel tolerance, with release hysteresis and a stable constrained axis. */
export function snapMove(scene: SnapScene, dx: number, dy: number, options: Options): SnapResult {
  const scale=Math.max(.01,options.scale),touch=options.pointerType==='touch',attach=(touch?10:6)/scale,release=(touch?14:9)/scale;
  if(options.constraint==='x')dy=0;else if(options.constraint==='y')dx=0;
  if(options.enabled===false)return{dx,dy,guides:[]};
  const box={...scene.moving,x:scene.moving.x+dx,y:scene.moving.y+dy},guides:SnapGuide[]=[];
  for(const axis of ['x','y'] as const) {
    if(options.constraint&&axis!==options.constraint)continue;
    const choices=[...alignmentChoices(scene,box,axis,release),...(options.spacing===false?[]:spacingChoices(scene,box,axis,release,scale))];
    const previous=options.previous?.find(g=>g.axis===axis);
    const incrementing=options.grid!==false&&Math.abs(axis==='x'?dx:dy)>.001;
    const gridAttach=Math.min(2,(touch?3:2)/scale),gridRelease=Math.min(3,(touch?4:3)/scale);
    const gap=incrementing&&options.spacing!==false?choose(incrementGapChoices(scene,box,axis,scale,previous),previous,gridAttach,gridRelease):undefined;
    let picked=choose(choices,previous,attach,release);
    // Keep intentional small gaps reachable, especially when zoomed out on touch.
    // A close edge match still wins; a distant edge must not collapse a 4 px gap.
    if(gap&&picked?.guide.kind==='object'&&!picked.guide.token.endsWith(':center')&&Math.abs(picked.delta)>gridAttach)picked=gap;
    // Only refine an axis the pointer actually moved; do not repair imported coordinates on a straight drag.
    if (!picked && incrementing) {
      picked=gap;
      picked??=incrementChoice(box[axis],axis,box,axis.toUpperCase(),`${axis}:grid:position:`,previous,options);
    }
    if(!picked)continue;
    if(axis==='x')dx+=picked.delta;else dy+=picked.delta;
    guides.push(picked.guide);
  }
  // Both axes can move in one frame. Draw measurements from the final geometry.
  const refresh=(guide:SnapGuide,final:Bounds)=>{
    const choices=guide.kind==='spacing'?spacingChoices(scene,final,guide.axis,.001,scale):guide.kind==='gap'?incrementGapChoices(scene,final,guide.axis,scale,guide):alignmentChoices(scene,final,guide.axis,.001);
    return choices.find(c=>c.guide.token===guide.token&&Math.abs(c.delta)<.001)?.guide;
  };
  const project=()=>{
    const final={...box,x:scene.moving.x+dx,y:scene.moving.y+dy};
    return guides.map(g=>g.kind==='grid'?{...g,from:ends(final,other(g.axis))[0]-8/scale,to:ends(final,other(g.axis))[1]+8/scale}:refresh(g,final));
  };
  let projected=project();
  if(projected.some(g=>!g)){
    guides.forEach((g,i)=>{if(!projected[i]){if(g.axis==='x')dx=box.x-scene.moving.x;else dy=box.y-scene.moving.y;}});
    projected=project();
  }
  return{dx,dy,guides:projected.filter((g):g is SnapGuide=>Boolean(g))};
}

/** Put equal-size measurements beside the actual local edge, including rotated objects. */
function dimensionMeasure(e:Bounds & {rotation?:number},axis:Axis,scale:number,page:PageSize,reference=false):SnapMeasure {
  const angle=(e.rotation??0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),cx=e.x+e.w/2,cy=e.y+e.h/2;
  const project=(x:number,y:number):Point=>({x:cx+c*x-s*y,y:cy+s*x+c*y});
  const draw=(side:number)=>{
    const offset=(axis==='x'?e.h:e.w)/2+12/scale;
    const from=axis==='x'?project(-e.w/2,side*offset):project(side*offset,-e.h/2),to=axis==='x'?project(e.w/2,side*offset):project(side*offset,e.h/2);
    const nx=side*(axis==='x'?-s:c),ny=side*(axis==='x'?c:s),text=String(cleanNumber(size(e,axis)));
    const clearance=(Math.abs(nx)*(text.length*6.5+6)/2+Math.abs(ny)*15/2+5)/scale;
    return{from,to,label:{x:(from.x+to.x)/2+nx*clearance,y:(from.y+to.y)/2+ny*clearance},reference};
  };
  const halfW=(String(cleanNumber(size(e,axis))).length*6.5+6)/2/scale,halfH=7.5/scale;
  const measure=draw(1),inside=(m:SnapMeasure)=>[m.from,m.to].every(p=>p.x>=4/scale&&p.y>=4/scale&&p.x<=page.width-4/scale&&p.y<=page.height-4/scale)&&m.label.x>=halfW+4/scale&&m.label.x<=page.width-halfW-4/scale&&m.label.y>=halfH+4/scale&&m.label.y<=page.height-halfH-4/scale;
  return inside(measure)?measure:draw(-1);
}
function dimensionChoices(scene:SnapScene,e:SlideElement,box:Bounds,axis:Axis,scale:number):Choice[] {
  const visible=selectionBounds([{...e,...box}])!,reach=Math.max(240/scale,box.w,box.h);
  return scene.references.flatMap(ref=>{
    const proximity=Math.hypot(separation(ref.box,visible,'x'),separation(ref.box,visible,'y'));
    if(proximity>reach)return[];
    const value=size(ref.element??ref.box,axis);
    return[{delta:value-size(box,axis),rank:2,proximity,guide:{axis,value,from:0,to:0,kind:'size' as const,label:`Match ${axis==='x'?'width':'height'} ${cleanNumber(value)} px`,ids:ref.ids,token:`${axis}:size:${ref.ids.join(',')}`}}];
  });
}

/** Match dimensions and edges using the same final geometry as the resize transaction. */
export function snapResize(scene: SnapScene, e: SlideElement, rawX: number, rawY: number, corner: ResizeHandle, proportional: boolean, options: Options): SnapResult {
  if(options.enabled===false)return{dx:rawX,dy:rawY,guides:[]};
  const scale=Math.max(.01,options.scale),touch=options.pointerType==='touch',attach=(touch?10:6)/scale,release=(touch?14:9)/scale;
  const sx=corner.includes('e')?1:corner.includes('w')?-1:0,sy=corner.includes('s')?1:corner.includes('n')?-1:0,fx=e.flipX?-1:1,fy=e.flipY?-1:1;
  const angle=e.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),resize=options.resize??((dx:number,dy:number)=>resizeFromCorner(e,dx,dy,corner,proportional));
  const requested=resize(rawX,rawY),point=(box:Bounds)=>resizeHandlePoint({...e,...box},corner),requestedPoint=point(requested);
  const vector=(w:number,h:number)=>{const x=sx*(w-e.w)*fx,y=sy*(h-e.h)*fy;return{dx:c*x-s*y,dy:s*x+c*y};};
  const localX=(c*rawX+s*rawY)*fx,localY=(-s*rawX+c*rawY)*fy,driver:Axis=!sx?'y':!sy?'x':Math.abs(localX/e.w)>=Math.abs(localY/e.h)?'x':'y';
  let rawW=e.w+sx*localX,rawH=e.h+sy*localY;
  if(proportional){if(driver==='x')rawH=e.h*rawW/e.w;else rawW=e.w*rawH/e.h;}
  const clamped=(axis:Axis)=>Math.abs((axis==='x'?rawW:rawH)-size(requested,axis))>release;
  if(proportional&&(clamped('x')||clamped('y')))return{dx:rawX,dy:rawY,guides:[]};
  type ResizeChoice=Choice & {vector:{dx:number;dy:number};box:Bounds};
  const candidate=(guide:SnapGuide,delta:number,rank:number,proximity:number):ResizeChoice|undefined=>{
    let w=requested.w,h=requested.h;
    if(guide.axis==='x')w+=delta;else h+=delta;
    if(proportional){if(guide.axis==='x')h=e.h*w/e.w;else w=e.w*h/e.h;}
    const v=vector(w,h),requestedVector=vector(requested.w,requested.h);
    const estimated=proportional?Math.hypot(v.dx-requestedVector.dx,v.dy-requestedVector.dy):Math.abs(delta);
    if(estimated>release&&guide.kind!=='grid')return;
    const box=resize(v.dx,v.dy),p=point(box);
    // A member limit or minimum size must never advertise an unreachable reference.
    const actual=guide.kind==='size'||guide.kind==='grid'?size(box,guide.axis):p[guide.axis];
    if(Math.abs(actual-guide.value)>.001)return;
    const distance=proportional?Math.hypot(p.x-requestedPoint.x,p.y-requestedPoint.y):Math.abs(size(box,guide.axis)-size(requested,guide.axis));
    if(distance>release&&guide.kind!=='grid')return;
    return{delta:distance,rank,proximity,guide,vector:v,box};
  };
  const choices:ResizeChoice[]=[];
  for(const axis of ['x','y'] as const){
    const active=axis==='x'?sx:sy;
    if(!proportional&&!active||clamped(axis)||Math.abs(size(requested,axis)-size(e,axis))<.001)continue;
    for(const choice of dimensionChoices(scene,e,requested,axis,scale)){
      const item=candidate(choice.guide,choice.delta,choice.rank,choice.proximity);if(item)choices.push(item);
    }
    if(active&&Math.abs(e.rotation%360)<.0001){
      const box={...requestedPoint,w:0,h:0};
      for(const choice of alignmentChoices(scene,box,axis,release)){
        const item=candidate(choice.guide,choice.delta*active*(axis==='x'?fx:fy),choice.rank,choice.proximity);if(item)choices.push(item);
      }
    }
  }
  const held=(pool:ResizeChoice[])=>options.previous?.find(g=>pool.some(c=>c.guide.token===g.token));
  const picked:ResizeChoice[]=[];
  if(proportional){const item=choose(choices,held(choices),attach,release) as ResizeChoice|undefined;if(item)picked.push(item);}
  else for(const axis of ['x','y'] as const){const pool=choices.filter(c=>c.guide.axis===axis),item=choose(pool,held(pool),attach,release) as ResizeChoice|undefined;if(item)picked.push(item);}
  // Keep 4 px size stepping as a quiet fallback, using the actual ratio driver.
  if(options.grid!==false)for(const axis of proportional?[driver]:['x','y'] as Axis[]){
    if(proportional&&picked.length||picked.some(c=>c.guide.axis===axis)||clamped(axis)||!(axis==='x'?sx:sy)||Math.abs(size(requested,axis)-size(e,axis))<.001)continue;
    const grid=incrementChoice(size(requested,axis),axis,requested,axis==='x'?'W':'H',`${axis}:grid:size:`,options.previous?.find(g=>g.axis===axis),options);
    if(grid){const item=candidate(grid.guide,grid.delta,grid.rank,grid.proximity);if(item)picked.push(item);}
  }
  let dx=rawX,dy=rawY;
  if(picked.length){
    if(proportional){({dx,dy}=picked[0].vector);}
    else{const w=picked.find(c=>c.guide.axis==='x')?.box.w??requested.w,h=picked.find(c=>c.guide.axis==='y')?.box.h??requested.h;({dx,dy}=vector(w,h));}
  }
  const final=resize(dx,dy),p=point(final),guides=picked.map(c=>c.guide);
  // A compatible second dimension is useful feedback; it never changes the ratio.
  if(proportional&&picked.length)for(const axis of ['x','y'] as const){
    if(guides.some(g=>g.axis===axis))continue;
    const exact=dimensionChoices(scene,e,final,axis,scale).filter(c=>Math.abs(c.delta)<.001).sort((a,b)=>a.proximity-b.proximity||a.guide.token.localeCompare(b.guide.token))[0];
    if(exact)guides.push(exact.guide);
  }
  return{dx,dy,guides:guides.flatMap(g=>{
    if(g.kind==='size'){
      if(Math.abs(size(final,g.axis)-g.value)>.001)return[];
      const ref=scene.references.find(r=>`${g.axis}:size:${r.ids.join(',')}`===g.token);if(!ref)return[];
      return[{...g,measures:[dimensionMeasure(ref.element??ref.box,g.axis,scale,scene.page,true),dimensionMeasure({...e,...final},g.axis,scale,scene.page)]}];
    }
    if(g.kind==='grid')return Math.abs(size(final,g.axis)-g.value)<.001?[{...g,value:p[g.axis],from:ends(final,other(g.axis))[0]-8/scale,to:ends(final,other(g.axis))[1]+8/scale}]:[];
    if(Math.abs(p[g.axis]-g.value)>.001)return[];
    const updated=alignmentChoices(scene,{...p,w:0,h:0},g.axis,.001).find(c=>c.guide.token===g.token)?.guide;
    return updated?[{...updated,label:updated.kind==='object'?'Align edge':updated.label}]:[];
  })};
}
