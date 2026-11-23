import type {CollectionId,LayoutId} from './template-collections';
import {uid,type Slide,type SlideElement,type GroupLayout} from './model';
import {selectionBounds} from './interactions';
import {ancestorIds,descendants,slideGroups} from './container-tree';
import {resolveGroupLayouts} from './object-layout';
import {blockFingerprint} from './block-fingerprint';

import {templatePageGrid,type TemplatePageGrid} from './template-grid-metrics';
export {templatePageGrid,type TemplatePageGrid} from './template-grid-metrics';
type Horizontal={x:number;w:number};
type Unit={id:string;name:string;box:{x:number;y:number;w:number;h:number};elements:SlideElement[];layouts:GroupLayout[];block?:boolean};
export type TemplateGridBinding={id:string;name:string;start:number;span:number;inset:number;kind:'columns'|'local'|'bleed'};

/** Explicit region roles shared by all six visual collections. */
function region(name:string,page:LayoutId,collection:CollectionId,box:Horizontal,wideTitle:boolean):[number,number,number?]|undefined{
  const last=Number(name.match(/(\d+)$/)?.[1]??1)-1;
  if(/^Study caption \d+$/.test(name)||/^Insight \d+$/.test(name)&&page==='insights'||/^Discussion question \d+$/.test(name)||/^Capability \d+$/.test(name)||/^Decision commitment \d+$/.test(name)||/^Next-step field \d+$/.test(name))return[last%3*4,4];
  if(name==='Page introduction')return[8,4];
  if(name==='Quotation context')return[9,3];
  if(name==='Reading quotation')return[0,8];
  if(/^Insight explanation \d+$/.test(name))return[4,8];
  if(['Point label'].some(p=>name.startsWith(p+' '))||/^Chapter \d+$/.test(name))return[1,3];
  if(['Point explanation','Contents'].some(p=>name.startsWith(p+' ')))return[4,8];
  if(/^Callout \d+$/.test(name))return[6,6];
  if(name==='Audience focus')return collection==='minimal'?[0,4]:[0,4,28];
  if(name.startsWith('Audience detail '))return[5,2];
  if(name.startsWith('Audience context '))return[7,5];
  if(name==='Problem narrative')return[0,6];
  if(/^Problem \d+$/.test(name))return[7,5];
  if(/^Takeaway \d+$/.test(name))return[6,6];
  if(['Summary context','Decision recommendation'].includes(name))return[0,5];
  if(name.startsWith('Decision reason '))return[6,6];
  if(['Chapter number'].includes(name))return[0,3];
  if(['Chapter introduction'].includes(name))return[4,8];
  if(/^Risk \d+$/.test(name))return[0,3];
  if(/^Response \d+$/.test(name))return[4,5];
  if(/^Risk response \d+$/.test(name))return[3,9];
  if(/^Risk owner \d+$/.test(name))return[10,2];
  if(['Project introduction','Review problem','Executive finding','Context introduction'].includes(name))return[0,6];
  if(['Project facts','Review scope','Report implications'].includes(name)||/^Context \d+$/.test(name))return[7,5];
  if(name==='Proposal objective')return[3,9];
  if(name.startsWith('Scope boundary '))return last===0?[3,4]:[8,4];
  if(['Research rationale'].includes(name))return[4,8];
  if(['Direction rationale','Product introduction','Finding and response','Evidence explanation','Visual explanation','Text-only explanation'].includes(name))return[0,page==='split'?5:10];
  if(name==='Review decision')return[0,12];
  if(['Research introduction','Research method'].includes(name))return[0,5];
  if(name.startsWith('Research observation '))return[6,6,40];
  if(page==='annotation'&&name.startsWith('Form detail '))return[8,4];
  if(name==='Project showcase detail')return[4,8];
  if(name==='Evidence ladder')return[6,6];
  if(['Project showcase introduction','Evidence context','Metric context','Performance measure','Success measure','Traction measure','Primary result'].includes(name))return[0,4];
  if(['Type specimen'].includes(name))return[4,8];
  if(/^Comparison metric \d+$/.test(name))return[0,3];
  if(name==='Product distinction')return[9,3,30];
  if(/^Comparison explanation \d+$/.test(name))return[last===0?0:6,6];
  if(name==='Result context')return[0,2];
  if(['Reflection','Decision introduction'].includes(name))return[0,7];
  if(['Contact details','Decision record'].includes(name))return[8,4];
  if(name==='Next-step introduction')return[0,9];
  if(name==='The ask')return[0,8];
  if(name.startsWith('Ask detail '))return[2,7];
  if(['Cover introduction','Cover context','Review introduction','Proposal author','Pitch promise','Report introduction','Minimalist introduction'].includes(name)){
    if(wideTitle)return[0,name==='Cover context'?8:12];
    return[0,collection==='pitch'?8:collection==='proposal'?7:6];
  }
  if(['Design principle'].includes(name))return[0,9];
  if(['Closing introduction','Discussion introduction'].includes(name))return[0,10];
  if(['Audience quotation','Qualitative observation','Design challenge','Customer problem','Central message','Content foundation','Text-only explanation'].includes(name))return[0,12];
  if(['Page title','Page heading','Heading frame'].includes(name)){
    if(page==='cover')return[0,wideTitle?10:collection==='proposal'?7:6];
    if(page==='summary')return[0,5];
    if(page==='facts'&&collection==='minimal')return[0,6];
    if(page==='table'&&collection==='report'&&box.x>200)return[2,10];
    if(page==='evidence'&&box.w<900)return collection==='proposal'?[4,8]:[0,4];
    if(page==='metrics'&&box.w<900)return[0,4];
    if(page==='split'&&box.w<900)return[0,5];
    if(page==='before-after'&&collection==='pitch')return[0,9];
    if(page==='facts'&&collection==='proposal'&&box.w<200)return[0,2];
    return[0,12];
  }
  if(name==='Visual source')return[6,6];
  // A saved grid parent is the page region; its children own the local grid.
  if(['Insight','Step','Metric'].includes(name))return[0,12];
  return undefined;
}

/** Compile authored local regions into the page grid. Glyphs are never stretched;
 * the saved flow frames and width limits are resized, then the normal text/layout
 * resolver remeasures them. This runs only while creating native templates. */
export function placeTemplateOnGrid(slide:Slide,collection:CollectionId,page:LayoutId,grid=templatePageGrid(collection,page)):Slide{
  const s:Slide={...slide,elements:slide.elements.map(e=>({...e,layoutItem:e.layoutItem?{...e.layoutItem}:undefined})),autoLayouts:slide.autoLayouts?.map(l=>({...l,padding:{...l.padding},order:[...l.order]})),groups:slide.groups?.map(g=>({...g})),layout:grid.layout};
  const groups=slideGroups(s).map(g=>({...g})),layouts=s.autoLayouts??[];s.groups=groups;
  for(const g of groups)if(g.name==='Group'){const mount=s.elements.find(e=>e.group===g.id&&e.type==='rect'&&/sample interface$/.test(e.name));if(mount)g.name=mount.name;}
  const groupIds=new Set(groups.map(g=>g.id));
  const roots=groups.filter(g=>!g.parent),rootIds=new Set(roots.map(g=>g.id));
  const units:Unit[]=roots.map<Unit|undefined>(g=>{const elements=descendants(s,g.id),ids=new Set([g.id,...groups.filter(h=>ancestorIds(s,h.id).includes(g.id)).map(h=>h.id)]);const root=layouts.find(l=>l.id===g.id),box=root?{x:root.x,y:root.y,w:root.w,h:root.h}:selectionBounds(elements);return box?{id:g.id,name:g.name,box,elements,layouts:layouts.filter(l=>ids.has(l.id)),block:!!g.block}:undefined;}).filter((u):u is Unit=>!!u);
  for(const e of s.elements.filter(e=>!e.group||!groupIds.has(e.group)))units.push({id:e.id,name:e.name,box:{x:e.x,y:e.y,w:e.w,h:e.h},elements:[e],layouts:[]});
  const bindings:TemplateGridBinding[]=[];
  const move=(u:Unit,start:number,count:number,inset=0,kind:TemplateGridBinding['kind']='columns',destination?:Horizontal)=>{
    const area=destination??grid.span(start,count),target={x:area.x+inset,w:area.w-2*inset},scale=target.w/u.box.w;
    for(const e of u.elements){e.x=target.x+(e.x-u.box.x)*scale;e.w=Math.max(1,e.w*scale);if(e.layoutItem){for(const k of ['maxWidth','minWidth','basisW'] as const)if(e.layoutItem[k]!==undefined)e.layoutItem[k]=Math.max(1,e.layoutItem[k]!*scale);}}
    for(const l of u.layouts){l.x=target.x+(l.x-u.box.x)*scale;l.w=Math.max(1,l.w*scale);if(l.direction==='horizontal'||l.direction==='grid')l.gap*=scale;l.padding.left*=scale;l.padding.right*=scale;const available=grid.bottom-l.y;if(available>0&&l.textFitHeight!==undefined)l.textFitHeight=Math.min(l.textFitHeight,available);}
    // Group-local native blocks preserve their recipe fingerprint after geometry changes.
    const group=groups.find(g=>g.id===u.id);if(group?.block)group.block={...group.block,fingerprint:blockFingerprint(u.elements)};
    bindings.push({id:u.id,name:u.name,start,span:count,inset,kind});
  };
  const wideTitle=s.template?.variant==='no-image'||s.template?.variant==='reading'||s.template?.variant==='long-title'||s.elements.some(e=>e.name==='Cover context');
  const rootLayouts=units.filter(u=>u.layouts.some(l=>l.id===u.id));
  for(const u of rootLayouts){
    if(page==='cover'&&s.template?.variant==='no-image'&&u.name==='Cover context'){move(u,0,12);continue;}
    if(s.template?.variant==='reading-details'){if(u.name==='Audience focus'){move(u,0,12,collection==='minimal'?0:28);continue;}if(/^Audience detail \d+$/.test(u.name)){move(u,0,3);continue;}if(/^Audience context \d+$/.test(u.name)){move(u,3,9);continue;}if(u.name==='Discussion introduction'||/^Discussion question \d+$/.test(u.name)){move(u,0,12);continue;}}
    if(s.template?.variant==='full-width-data'){if(u.elements.some(e=>e.name==='Current result')){move(u,10,2);continue;}if(u.name==='Result context'){move(u,10,2);continue;}if(['Page title','Heading frame'].includes(u.name)){move(u,0,s.elements.some(e=>e.name==='Current result')?9:12);continue;}}
    if(u.name==='Adaptive introduction'){move(u,0,s.template?.variant==='no-image'?12:8);continue;}
    if(u.name==='Page title'&&rootLayouts.some(v=>v.name==='Page introduction')){move(u,0,8);continue;}
    if(page==='insights'&&s.template?.variant.startsWith('list-')&&/^Insight \d+$/.test(u.name)){move(u,1,3);continue;}
    const plan=region(u.name,page,collection,u.box,wideTitle);if(plan)move(u,...plan);
  }
  if(page==='matrix'){
    const local=units.filter(u=>!bindings.some(b=>b.id===u.id)&&u.box.y>=280&&u.box.y<700);
    const box=selectionBounds(local.flatMap(u=>u.elements));
    if(box){const id=uid('region');groups.push({id,name:'Priority matrix region'});for(const u of local){const g=groups.find(g=>g.id===u.id);if(g)g.parent=id;else for(const e of u.elements)e.group=id;}move({id,name:'Priority matrix region',box,elements:local.flatMap(u=>u.elements),layouts:local.flatMap(u=>u.layouts)},0,12,0,'local');}
  }
  const mapped=new Set(bindings.map(b=>b.id));
  const visualUnits=units.filter(u=>!mapped.has(u.id)&&u.elements.some(e=>['image','table','chart'].includes(e.type)||/sample interface$|comparison panel$/.test(e.name))&&u.box.y>=110);
  if(page==='gallery'&&rootLayouts.some(u=>u.name.startsWith('Visual caption '))){
    const captions=rootLayouts.filter(u=>u.name.startsWith('Visual caption ')),n=captions.length;
    for(const u of captions){const i=Number(u.name.split(' ').at(-1))-1;if(n===1)move(u,8,4);else if(n===4)move(u,i%2*6+3,3);else move(u,i*12/n,12/n);}
    for(const [i,u] of visualUnits.sort((a,b)=>a.box.y-b.box.y||a.box.x-b.box.x).entries()){if(n===1)move(u,0,7);else if(n===4)move(u,i%2*6,3);else move(u,i*12/n,12/n);}
  }
  else if(page==='gallery')visualUnits.sort((a,b)=>a.box.x-b.box.x).forEach((u,i)=>move(u,i%3*4,4));
  else if(page==='facts'&&collection==='pitch')for(const [i,u] of visualUnits.sort((a,b)=>a.box.x-b.box.x).entries())move(u,i*4,4,0,'local',{x:grid.span(i*4,4).x,w:u.box.w});
  else if(page==='cover')for(const u of units.filter(u=>!mapped.has(u.id)&&u.elements.some(e=>e.type==='image'))){if(wideTitle){move(u,9,3);}else if(collection==='portfolio'){const x=grid.span(6,6).x;move(u,6,6,0,'bleed',{x,w:1440-x});}else move(u,collection==='pitch'?8:7,collection==='pitch'?4:5);}
  else if(page==='split')for(const u of visualUnits){
    if(collection==='minimal'||collection==='proposal')move(u,5,7);
    else move(u,collection==='review'?0:6,collection==='review'?5:6);
  }
  else if(page==='metrics')for(const u of visualUnits)move(u,4,8);
  else if(page==='table'&&collection==='report')for(const u of visualUnits)move(u,s.template?.variant==='full-width-data'?0:2,s.template?.variant==='full-width-data'?12:10);
  else if(page==='statement'&&collection==='proposal')for(const u of visualUnits){const x=grid.span(9,3).x;move(u,9,3,0,'bleed',{x,w:1440-x});}
  else if(page==='close')for(const u of visualUnits){if(collection==='pitch'){const x=grid.span(9,3).x;move(u,9,3,0,'bleed',{x,w:1440-x});}else if(collection==='proposal')move(u,9,3);else if(collection==='portfolio')move(u,8,4,0,'local',{x:grid.span(8,4).x,w:u.box.w});}
  else if(page==='quote'&&collection==='proposal')for(const u of visualUnits)move(u,0,3,0,'bleed',{x:0,w:grid.span(0,3).x+grid.span(0,3).w});
  else if(page==='evidence'&&collection==='proposal')for(const u of visualUnits)move(u,0,4,0,'bleed',{x:0,w:grid.span(0,4).x+grid.span(0,4).w});
  else if(['category-chart','trend','composition','comparison','table','action-plan'].includes(page))for(const u of visualUnits)move(u,0,12);
  else if(page==='evidence')for(const u of visualUnits)move(u,rootLayouts.some(u=>u.name==='Evidence context'||u.name==='Project showcase introduction')?4:0,rootLayouts.some(u=>u.name==='Evidence context'||u.name==='Project showcase introduction')?8:12);
  else if(page==='before-after'){
    if(collection==='pitch'&&visualUnits.some(u=>u.elements.some(e=>e.type==='table')))for(const u of visualUnits)move(u,0,9);
    else visualUnits.sort((a,b)=>a.box.x-b.box.x).forEach((u,i)=>move(u,i*6,6));
  }
  // Native blocks are authored against one content region, not selected by their old edges.
  for(const u of units.filter(u=>u.block&&!bindings.some(b=>b.id===u.id)))move(u,0,12,0,'local');
  const done=new Set(bindings.map(b=>b.id));
  for(const u of units.filter(u=>!done.has(u.id)&&!u.layouts.length)){
    const e=u.elements.length===1?u.elements[0]:undefined;
    if(e?.pageElement)continue;
    if(e&&e.y<116){if(e.x<140)move(u,0,12);continue;}
    if(page==='split'&&(collection==='minimal'||collection==='proposal')&&e?.type==='text'&&e.y>=670&&e.x>500){move(u,5,7);continue;}
    if(e?.type==='text'&&e.y>=700&&e.w>800){move(u,0,12);e.y=Math.min(e.y,grid.bottom-e.fontSize*e.lineHeight);continue;}
    if(['gallery','insights','q-and-a'].includes(page)&&e?.type==='line'&&e.w<700){move(u,Math.max(0,Math.min(2,Math.floor((u.box.x-84)/432)))*4,4);continue;}
    if(page==='gallery')continue;
    if(page==='facts'&&e?.type==='line'){if(collection==='pitch')move(u,Math.max(0,Math.min(2,Math.floor((u.box.x-84)/432)))*4,4);else if(u.box.x>600)move(u,7,5);else if(u.box.w<900)move(u,0,6);else move(u,0,12);continue;}
    if(page==='quote'&&e?.type==='text'&&u.box.y>=620){move(u,u.box.x>1000?9:collection==='proposal'?4:0,u.box.x>1000?3:collection==='proposal'?5:8);continue;}
    if(page==='metrics'&&e?.type==='text'&&u.box.y>=680){move(u,4,8);continue;}
    if(page==='evidence'&&e?.type==='text'&&u.box.y>=690&&u.box.x>400){move(u,4,8);continue;}
    if(page==='facts'&&e?.name==='Executive finding panel'){const edge=grid.span(0,6);move(u,0,6,0,'bleed',{x:0,w:edge.x+edge.w+24});continue;}
    if(page==='facts'&&e?.name==='Scope column'){const edge=grid.span(7,5);move(u,7,5,0,'bleed',{x:edge.x-48,w:1440-edge.x+48});continue;}
    if(page==='before-after'&&e?.name==='Product distinction'&&e.type==='rect'){move(u,9,3);continue;}
    if(page==='audience'){
      if(e?.name==='Audience context')move(u,0,s.template?.variant==='reading-details'?12:4);
      else if(e?.type==='line')move(u,5,7);
    }else if(page==='problem'&&e?.type==='line')move(u,7,5);
    else if(page==='summary'&&e?.type==='line')move(u,6,6);
    else if(['content','case-study','appendix'].includes(page)){
      if(e?.type==='line')move(u,0,12);else if(e?.type==='text'&&/^\d{2}$/.test(e.text))move(u,0,1);
    }else if(page==='risks'){
      if(e?.type==='line')move(u,0,12);
      else if(e?.text==='UNCERTAINTY'){move(u,0,3);e.y=284;}else if(e?.text==='RESPONSE'){move(u,4,5);e.y=284;}else if(e?.text==='OWNER / CHECK'){move(u,10,2);e.y=284;}
    }else if(page==='decision'&&e?.type==='line')move(u,6,6);
    else if(page==='before-after'&&e){
      if(collection==='report'){if(e.type==='line')move(u,0,12);else if(e.type==='text')move(u,e.x>=1100?9:e.x>=700?6:e.x>=400?3:0,3);continue;}
      const i=e.x<600?0:1;if(e.type==='text'||e.name==='Comparison header')move(u,i*6,6,e.name==='Comparison header'?0:e.x>100&&e.x<800&&e.y<650?24:0);
    }else if(page==='cover'&&collection==='review'&&e?.type==='text'&&/^0[123] \/ /.test(e.text))move(u,(Number(e.text[1])-1)*4,4);
    else if(e?.type==='line'&&e.w>900)move(u,0,12);
  }
  // Repeated reading units belong to one saved parent. A longer row pushes its
  // neighbours through the normal core resolver instead of overlapping fixed y's.
  const flowRows=(name:string,children:GroupLayout[],start:number,count:number,y:number,bottom:number,gap=12)=>{
    if(!children.length)return;
    const id=uid('flow'),area=grid.span(start,count);groups.push({id,name});
    if(name==='Problem fields'||name==='Decision reasons')for(const child of children){const rule=s.elements.find(e=>e.type==='line'&&!e.group&&Math.abs(e.x-child.x)<.1&&e.y<child.y&&e.y>=child.y-32);if(rule){rule.group=child.id;rule.layoutItem={widthMode:'fill',heightMode:'fixed'};child.order=[rule.id,...child.order];child.y=rule.y;child.gap=12;}}
    for(const child of children){const group=groups.find(g=>g.id===child.id)!;group.parent=id;group.layoutItem={widthMode:'fill',heightMode:'fixed'};}
    layouts.push({id,name,direction:'vertical',columns:1,gap,padding:{top:0,right:0,bottom:0,left:0},align:'start',justify:'space-between',...area,y,h:bottom-y,textFitHeight:bottom-y,widthMode:'fixed',heightMode:'fixed',order:children.map(l=>l.id)});
    bindings.push({id,name,start,span:count,inset:0,kind:'columns'});
  };
  if(page==='problem')flowRows('Problem fields',layouts.filter(l=>/^Problem \d+$/.test(l.name)),7,5,330,grid.bottom);
  if(page==='decision')flowRows('Decision reasons',layouts.filter(l=>/^Decision reason \d+$/.test(l.name)),6,6,308,700);
  if(s.template?.variant.startsWith('list-')){
    const titles=layouts.filter(l=>/^Insight \d+$/.test(l.name)).sort((a,b)=>a.y-b.y),rows:GroupLayout[]=[];
    for(const title of titles){
      const index=Number(title.name.split(' ').at(-1)),body=layouts.find(l=>l.name===`Insight explanation ${index}`),rule=s.elements.find(e=>e.type==='line'&&!e.group&&Math.abs(e.y-(title.y-14))<1),number=s.elements.find(e=>e.type==='text'&&!e.group&&e.text===String(index).padStart(2,'0')&&Math.abs(e.y-title.y)<4);
      if(!body||!rule||!number)continue;
      const rowId=uid('flow'),contentId=uid('flow');groups.push({id:rowId,name:`Insight row ${index}`},{id:contentId,name:`Insight row contents ${index}`,parent:rowId,layoutItem:{widthMode:'fill',heightMode:'fixed'}});
      for(const [child,start,count] of [[title,1,3],[body,4,8]] as const){const group=groups.find(g=>g.id===child.id)!;group.parent=contentId;group.layoutItem={widthMode:'fixed',heightMode:'fixed'};const area=grid.span(start,count);child.x=area.x;child.w=area.w;for(const e of s.elements.filter(e=>child.order.includes(e.id))){e.x=area.x;e.w=area.w;}}
      Object.assign(number,grid.span(0,1),{group:contentId,layoutItem:{widthMode:'fixed',heightMode:'fixed'}});rule.group=rowId;rule.layoutItem={widthMode:'fill',heightMode:'fixed'};
      layouts.push({id:contentId,name:`Insight row contents ${index}`,direction:'horizontal',columns:1,gap:grid.layout.gutter,padding:{top:0,right:0,bottom:0,left:0},align:'start',justify:'start',...grid.full,y:title.y,h:title.h,widthMode:'fixed',heightMode:'hug',order:[number.id,title.id,body.id]});
      const row:GroupLayout={id:rowId,name:`Insight row ${index}`,direction:'vertical',columns:1,gap:14,padding:{top:0,right:0,bottom:0,left:0},align:'start',justify:'start',...grid.full,y:rule.y,h:title.h+16,widthMode:'fixed',heightMode:'hug',order:[rule.id,contentId]};layouts.push(row);rows.push(row);
    }
    flowRows('Insight rows',rows,0,12,300,grid.bottom,12);
  }
  if(page==='risks'){
    const title=layouts.find(l=>l.name==='Page title');if(title)title.h=title.textFitHeight=134;
    s.elements=s.elements.filter(e=>!(e.type==='line'&&e.y>=330&&e.y<700&&e.w>1000));
    const children=layouts.filter(l=>/^Risk \d+$|^Response \d+$|^Risk response \d+$|^Risk owner \d+$/.test(l.name)).sort((a,b)=>Number(a.name.match(/(\d+)$/)![1])-Number(b.name.match(/(\d+)$/)![1])||a.x-b.x);
    if(children.length){const owners=children.some(l=>l.name.startsWith('Risk owner ')),columns=owners?3:2,rowY=owners?328:304,rows:GroupLayout[]=[];
      for(let i=0;i<children.length;i+=columns){const cells=children.slice(i,i+columns),id=uid('flow'),y=rowY+rows.length*120;
        groups.push({id,name:`Risk row ${rows.length+1}`});
        for(const [column,child]of cells.entries()){const group=groups.find(g=>g.id===child.id)!;group.parent=id;group.layoutItem={widthMode:'fixed',heightMode:'fixed'};
          if(!owners){const area=grid.span(column?4:0,column?8:3);child.x=area.x;child.w=area.w;for(const e of s.elements.filter(e=>child.order.includes(e.id))){e.x=area.x;e.w=area.w;}}
          child.textFitHeight=Math.max(80,child.textFitHeight??80);
        }
        const gap=cells[1].x-cells[0].x-cells[0].w;
        const row:GroupLayout={id,name:`Risk row ${rows.length+1}`,direction:'horizontal',columns:1,gap,padding:{top:0,right:0,bottom:0,left:0},align:'start',justify:'start',...grid.full,y,h:80,widthMode:'fixed',heightMode:'hug',order:cells.map(l=>l.id)};layouts.push(row);rows.push(row);
      }
      flowRows('Risk rows',rows,0,12,rowY,690,24);
    }
  }
  if(page==='annotation'){
    const copies=layouts.filter(l=>/^Callout \d+$/.test(l.name)).sort((a,b)=>a.y-b.y),rows:GroupLayout[]=[];
    for(const copy of copies){const index=Number(copy.name.split(' ').at(-1)),tag=s.elements.find(e=>e.name===`Callout ${index}`&&e.type==='ellipse'),number=tag&&s.elements.find(e=>e.type==='text'&&e.x>=tag.x&&e.x<tag.x+tag.w&&Math.abs(e.y-tag.y)<4);if(!tag||!number)continue;
      const rowId=uid('flow'),tagId=uid('tag'),area=grid.span(5,7);groups.push({id:rowId,name:`Callout row ${index}`},{id:tagId,name:`Callout marker ${index}`,parent:rowId});tag.group=tagId;number.group=tagId;const group=groups.find(g=>g.id===copy.id)!;group.parent=rowId;group.layoutItem={widthMode:'fill',heightMode:'fixed'};
      const row:GroupLayout={id:rowId,name:`Callout row ${index}`,direction:'horizontal',columns:1,gap:24,padding:{top:0,right:0,bottom:0,left:52},align:'start',justify:'start',...area,y:copy.y,h:copy.h,widthMode:'fixed',heightMode:'hug',order:[tagId,copy.id]};layouts.push(row);rows.push(row);
    }
    flowRows('Evidence callouts',rows,5,7,286,700);
  }
  // Tighten every authored reading frame to the actual bottom margin. Its normal
  // text-fit budget handles long copy; vertical offsets remain part of art direction.
  for(const l of layouts.filter(l=>rootIds.has(l.id))){const available=grid.bottom-l.y;if(available>0&&l.textFitHeight!==undefined)l.textFitHeight=Math.min(l.textFitHeight,available);}
  Object.assign(s,resolveGroupLayouts(s));
  gridBindings.set(s,bindings);return s;
}
const gridBindings=new WeakMap<Slide,TemplateGridBinding[]>();
export const templateGridBindings=(slide:Slide)=>gridBindings.get(slide)??[];
