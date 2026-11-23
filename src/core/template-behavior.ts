import {uid,type Slide,type SlideElement,type GroupLayout,type SlideTransition} from './model';
import type {CollectionId,LayoutId} from './template-collections';
import {resolveGroupLayouts} from './object-layout';
import {templatePageGrid} from './template-grid-metrics';

type Frame={x:number;y:number;w:number;h:number};
type StackOptions=Partial<Frame>&{gap?:number;parent?:string;distributed?:boolean};

/** Authored content flows use the same persistent containers as manual Auto layout. */
export function configureTemplateBehavior(s:Slide,collection:CollectionId,page:LayoutId):Slide {
  const layouts=s.autoLayouts??=[],groups=s.groups??=[];
  s.autoLayouts=layouts;s.groups=groups;
  const region=(x:number,y:number,w:number,h:number,parent?:string)=>s.elements.filter(e=>e.type==='text'&&e.y>=y&&e.y<y+h&&e.x>=x&&e.x<x+w&&(!e.group||e.group===parent)).sort((a,b)=>a.y-b.y||a.x-b.x);
  // A compact seed keeps non-DOM construction valid; live rendering/editing measures the actual font.
  const seed=(e:SlideElement,width:number)=>Math.max(1,e.text.split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil([...line].reduce((n,c)=>n+(/[\u2e80-\uffff]/.test(c)?1:.55),0)*e.fontSize/width)),0)*e.fontSize*e.lineHeight);
  const stack=(name:string,es:SlideElement[],options:StackOptions={})=>{
    if(!es.length)return undefined;
    const id=uid('flow'),x=options.x??Math.min(...es.map(e=>e.x)),y=options.y??es[0].y;
    const w=options.w??Math.max(...es.map(e=>e.x+e.w))-x,h=Math.max(1,Math.min(736-y,options.h??Math.max(...es.map(e=>e.y+e.h))-y));
    groups.push({id,name,...(options.parent?{parent:options.parent}:{})});
    for(const e of es){e.group=id;const maximum=e.textSizing==='auto-width'?w:e.w;if(e.type==='text'){e.textSizing='auto-height';e.h=seed(e,Math.min(w,maximum));}e.layoutItem={widthMode:'fill',heightMode:'fixed',maxWidth:maximum,basisFontSize:e.fontSize};}
    const l:GroupLayout={id,name,direction:'vertical',gap:options.gap??22,padding:{top:0,right:0,bottom:0,left:0},align:'start',justify:options.distributed?'space-between':'start',columns:1,x,y,w,h,textFitHeight:h,widthMode:'fixed',heightMode:options.distributed?'fixed':'hug',order:es.map(e=>e.id)};
    layouts.push(l);return id;
  };
  const textStack=(name:string,x:number,y:number,w:number,h:number,gap=22,distributed=false)=>{const es=region(x,y,w,h);return stack(name,es,{w,gap,distributed,h:Math.max(1,y+h-(es[0]?.y??y))});};
  const textRow=(name:string,x:number,y:number,w:number,h:number)=>{
    const es=region(x,y,w,h).sort((a,b)=>a.x-b.x);if(!es.length)return;
    const id=uid('flow'),left=es[0].x,right=Math.max(...es.map(e=>e.x+e.w));
    const gap=es.length>1?Math.max(12,Math.min(...es.slice(1).map((e,i)=>e.x-es[i].x-es[i].w))):0;
    groups.push({id,name});for(const e of es){e.group=id;e.textSizing='auto-height';e.h=seed(e,e.w);e.layoutItem={widthMode:'fill',heightMode:'fixed',maxWidth:e.w,basisFontSize:e.fontSize};}
    layouts.push({id,name,direction:'horizontal',gap,padding:{top:0,right:0,bottom:0,left:0},align:'center',justify:'start',columns:1,x:left,y,w:right-left,h,textFitHeight:h,widthMode:'fixed',heightMode:'hug',order:es.map(e=>e.id)});
  };
  const fieldColumn=(name:string,x:number,y:number,w:number,h:number,starts:number[],rowSpan:number,gap=22)=>{
    const children=starts.map((start,i)=>{const es=[...region(x,start,w,rowSpan),...s.elements.filter(e=>e.type==='line'&&!e.group&&e.x===x&&e.y>=start-32&&e.y<start+rowSpan)].sort((a,b)=>a.y-b.y);return stack(`${name} ${i+1}`,es,{x,w,gap,h:rowSpan+start-(es[0]?.y??start)});}).filter((id):id is string=>!!id);
    if(!children.length)return;
    const id=uid('flow');groups.push({id,name});
    for(const child of children){const g=groups.find(g=>g.id===child)!;g.parent=id;g.layoutItem={widthMode:'fill',heightMode:'fixed'};}
    const top=Math.min(...children.map(id=>layouts.find(l=>l.id===id)!.y));
    layouts.push({id,name,direction:'vertical',gap:24,padding:{top:0,right:0,bottom:0,left:0},align:'start',justify:'space-between',columns:1,x,y:top,w,h:h+y-top,widthMode:'fixed',heightMode:'fixed',order:children});
  };
  // Interface rows keep labels and actions together; each row grows with its copy.
  for(const box of s.elements.filter(e=>e.type==='rect'&&/^(Updated|Original) sample interface$/.test(e.name)&&e.group)){
    const parent=box.group!,k=box.w/600,es=s.elements.filter(e=>e.group===parent&&e.type==='text'&&!['Project workspace','Continue'].includes(e.text));
    const children:string[]=[];
    for(let i=0;i<es.length;i+=2){
      const row=es.slice(i,i+2);if(row.length!==2)continue;
      const id=uid('flow'),x=box.x+32*k,y=Math.min(...row.map(e=>e.y)),w=box.w-64*k;
      groups.push({id,name:`Interface row ${i/2+1}`,layoutItem:{widthMode:'fill',heightMode:'fixed'}});
      row.forEach((e,j)=>{e.group=id;e.textSizing='auto-height';e.h=seed(e,e.w);e.layoutItem={widthMode:j?'fixed':'fill',heightMode:'fixed',basisFontSize:e.fontSize};});
      layouts.push({id,name:`Interface row ${i/2+1}`,direction:'horizontal',gap:16*k,padding:{top:0,right:0,bottom:0,left:0},align:'center',justify:'start',columns:1,x,y,w,h:42*k,textFitHeight:54*k,widthMode:'fixed',heightMode:'hug',order:row.map(e=>e.id)});children.push(id);
    }
    if(children.length){
      const id=uid('flow');groups.push({id,name:'Interface rows',parent});
      for(const child of children)groups.find(g=>g.id===child)!.parent=id;
      layouts.push({id,name:'Interface rows',direction:'vertical',gap:30*k,padding:{top:0,right:0,bottom:0,left:0},align:'start',justify:'start',columns:1,x:box.x+32*k,y:box.y+116*k,w:box.w-64*k,h:Math.max(1,box.h-160*k),widthMode:'fixed',heightMode:'hug',order:children});
    }
  }

  if(collection==='portfolio'){
    if(page==='cover')textStack('Cover introduction',76,200,660,470,126);
    else if(page==='facts'){textStack('Project introduction',80,150,750,480,64);fieldColumn('Project facts',858,190,502,462,[190,354,518],140,22);}
    else if(page==='statement')textStack('Design challenge',76,170,1284,564,32,true);
    else if(page==='split'){
      textStack('Research introduction',80,146,480,316,36);
      textStack('Research method',84,520,470,174,14);
      for(let i=0;i<3;i++)textStack(`Research observation ${i+1}`,752,188+i*158,608,124,10);
    }
    else if(page==='process')for(const g of [...groups].filter(g=>g.id.startsWith('decision-'))){const es=s.elements.filter(e=>e.group===g.id&&e.type==='text'&&e.fontSize<50);stack(`${g.name} explanation`,es,{gap:18,parent:g.id,h:726-es[0].y});}
    else if(page==='evidence'){
      textStack('Project showcase introduction',80,180,420,440,112);
      textStack('Project showcase detail',500,522,940,178,14);
    }
    else if(page==='close'){textStack('Reflection',76,190,770,520,90);textStack('Contact details',904,180,456,360,40);}
  }else if(collection==='review'){
    if(page==='cover')textStack('Review introduction',76,180,650,440,46);
    else if(page==='facts'){textStack('Review problem',80,150,700,510,92);fieldColumn('Review scope',828,156,532,536,[156,332,508],140,22);}
    else if(page==='split')fieldColumn('Evidence ladder',744,340,616,360,[340,468,596],110,18);
    else if(page==='process')for(let i=0;i<3;i++)textRow(`Option ${i+1}`,236,330+i*130,992,104);
    else if(page==='metrics')textStack('Success measure',84,390,434,330,20);
    else if(page==='roadmap')for(let i=0;i<3;i++)textRow(`Iteration ${i+1}`,218,328+i*134,842,104);
    else if(page==='close'){textStack('Review decision',80,165,1276,288,40);for(let i=0;i<3;i++)textStack(`Decision commitment ${i+1}`,84+i*432,490,392,230,20);}
  }else if(collection==='proposal'){
    if(page==='cover')textStack('Proposal author',84,520,680,185,52);
    else if(page==='statement')textStack('Design principle',76,170,926,564,32,true);
    else if(page==='facts'){textStack('Proposal objective',368,300,992,166,20);for(let i=0;i<2;i++)textStack(`Scope boundary ${i+1}`,368+i*512,520,480,196,20);}
    else if(page==='split')textStack('Direction rationale',80,145,510,468,56);
    else if(page==='quote')textStack('Research rationale',464,160,896,416,64);
    else if(page==='process')for(let i=0;i<3;i++){textStack(`Delivery stage ${i+1}`,84+i*432,278,386,138,12);textStack(`Delivery detail ${i+1}`,84+i*432,494,386,210,36);}
    else if(page==='evidence')textStack('Type specimen',564,356,788,260,20);
    else if(page==='close'){textStack('Next-step introduction',76,185,918,390,88);for(let i=0;i<3;i++)textStack(`Next-step field ${i+1}`,84+i*432,600,392,136,18);}
  }else if(collection==='pitch'){
    if(page==='cover')textStack('Pitch promise',76,200,800,430,88);
    else if(page==='statement')textStack('Customer problem',76,170,1264,360,42);
    else if(page==='split')textStack('Product introduction',80,200,500,438,100);
    else if(page==='metrics')textStack('Traction measure',84,326,418,280,28);
    else if(page==='before-after')textStack('Product distinction',1110,370,220,286,42);
    else if(page==='process')for(const [i,[x,y]] of [[84,334],[772,334],[428,548]].entries())textStack(`Business stage ${i+1}`,x,y,478,164,20);
    else if(page==='roadmap')for(let i=0;i<3;i++)textRow(`Market stage ${i+1}`,108+i*82,335+i*122,1188-i*164,82);
    else if(page==='facts'){
      const grid=templatePageGrid('pitch','facts');
      for(let i=0;i<3;i++){
        const column=grid.span(i*4,4);
        textStack(`Capability ${i+1}`,column.x,378,column.w,324,18);
      }
    }
    else if(page==='close'){textStack('The ask',76,170,920,322,42);for(let i=0;i<3;i++)textStack(`Ask detail ${i+1}`,302,523+i*72,644,50,0);}
  }else if(collection==='report'){
    if(page==='cover')textStack('Report introduction',84,170,614,494,56,true);
    else if(page==='facts'){textStack('Executive finding',80,165,548,520,40,true);fieldColumn('Report implications',744,192,616,482,[192,366,540],140,22);}
    else if(page==='metrics')textStack('Performance measure',84,380,432,336,24);
    else if(page==='table')textStack('Result context',84,148,212,288,30);
    else if(page==='before-after')for(let i=0;i<3;i++)textStack(`Comparison metric ${i+1}`,84,364+i*108,350,90,0);
    else if(page==='quote')textStack('Qualitative observation',80,170,1280,404,82);
    else if(page==='roadmap'){textStack('Action introduction',80,175,550,454,130);fieldColumn('Report actions',656,192,704,510,[192,368,544],146,14);}
    else if(page==='close'){textStack('Decision introduction',80,190,700,490,100);fieldColumn('Decision record',910,176,450,520,[176,348,520],140,22);}
  }
  if(collection==='minimal'&&page==='cover')textStack('Minimalist introduction',76,240,650,458,64);
  if(!layouts.length)textStack('Page heading',76,110,1284,190,24);
  // Uncontained headings also wrap inside a saved frame, rather than growing
  // sideways into a chart or picture when their copy changes.
  for(const e of s.elements.filter(e=>e.type==='text'&&e.fontSize>=56&&!e.group)){
    if(/^\d{2}$/.test(e.text))e.w=Math.min(e.w,116);
    const parallel=s.elements.filter(b=>b.id!==e.id&&['image','chart','table'].includes(b.type)&&b.x>e.x&&b.y<e.y+72&&b.y+b.h>e.y);
    if(parallel.length)e.w=Math.min(e.w,Math.min(...parallel.map(b=>b.x))-e.x-32);
    const next=s.elements.filter(b=>b.id!==e.id&&b.y>e.y+8&&b.x<e.x+e.w-16&&b.x+b.w>e.x+16).sort((a,b)=>a.y-b.y)[0];
    e.textSizing='auto-height';stack('Heading frame',[e],{w:e.w,h:Math.max(60,(next?.y??736)-e.y-16),gap:0});
  }
  const effects:Partial<Record<CollectionId,Partial<Record<LayoutId,SlideTransition['effect']>>>>={
    portfolio:{},
    review:{},
    // The principle changes from a light cover to an ink field. A dissolve
    // keeps that tonal handoff legible while the material photograph changes crop.
    proposal:{statement:'fade'},
    pitch:{},
    report:{table:'smart','before-after':'smart'},
  };
  const effect=effects[collection]?.[page]??'fade';
  s.transition={effect,duration:effect==='smart'?560:collection==='proposal'?380:300,easing:effect==='smart'?'cinematic':'linear'};
  s.elements.forEach((e,i)=>{const chrome=e.type==='line'||e.type==='text'&&e.fontSize<=22&&(e.y<116||e.y>=736);e.motionMatch=chrome?'off':'auto';if(!chrome)e.motionKey=`template:${collection}:${page}:part-${i}`;});
  const animate=(es:SlideElement[],order:number,trigger:'auto'|'click'='auto',entrance:'fade'|'rise'|'reveal'='fade')=>{
    for(const e of es)e.animation={effect:entrance,duration:entrance==='reveal'?420:trigger==='click'?240:260,delay:0,order,trigger,easing:entrance==='fade'?'linear':'smooth',...(trigger==='auto'?{withTransition:true}:{})};
  };
  const headline=s.elements.filter(e=>e.type==='text'&&e.fontSize>=56&&e.y>=110&&e.y<330).sort((a,b)=>a.y-b.y||b.fontSize-a.fontSize)[0];
  if(headline)animate([headline],0);
  const visual=s.elements.find(e=>['image','chart','table'].includes(e.type)&&e.w>=300&&e.h>=280);
  if(visual){const mount=visual.group?s.elements.filter(e=>e.group===visual.group):[visual];
    // Sparse photographs and a trend unfold along the reading direction.
    // Dense evidence tables and ink illustrations retain quiet opacity changes.
    const reveal=visual.resource?.kind==='photo'&&page!=='statement'&&collection!=='report'||visual.type==='chart'&&collection==='pitch';
    animate(mount,1,'auto',reveal?'reveal':'fade');
  }
  if(collection==='review'&&page==='facts')animate(s.elements.filter(e=>e.x>=778&&e.y>=116&&e.y<736),1);
  if(['portfolio','pitch'].includes(collection)&&page==='split'){
    const box=s.elements.find(e=>e.name==='Updated sample interface');
    if(box?.group){const ids=new Set([box.group]);for(let n=0;n<8;n++)for(const g of groups)if(g.parent&&ids.has(g.parent))ids.add(g.id);
      animate(s.elements.filter(e=>e.group&&ids.has(e.group)),1);
    }
  }
  const block=(x:number,y:number,w:number,h:number)=>s.elements.filter(e=>e.x>=x&&e.x<x+w&&e.y>=y&&e.y<y+h&&!(e.type==='text'&&e.fontSize<=22&&(e.y<116||e.y>=736)));
  if(collection==='portfolio'&&page==='process')for(let i=0;i<3;i++)animate(block(84+i*432,350+i*60,392,280),i,'click');
  if(collection==='review'&&page==='process')for(let i=0;i<3;i++)animate(block(84,310+i*130,1276,126),i,'click');
  if(collection==='proposal'&&page==='process')for(let i=0;i<3;i++)animate(block(84+i*432,278,392,436),i,'click');
  if(collection==='pitch'&&page==='process')for(const [i,[x,y]] of [[84,312],[772,312],[428,526]].entries())animate(block(x,y,588,202),i,'click');
  if(collection==='pitch'&&page==='process')animate(s.elements.filter(e=>e.type==='text'&&e.text==='→'),1,'click');
  if(collection==='pitch'&&page==='roadmap')for(let i=0;i<3;i++)animate(block(84+i*82,310+i*122,1276-i*164,110),i,'click');
  if(collection==='report'&&page==='roadmap')for(let i=0;i<3;i++)animate(block(656,172+i*176,704,172),i,'click');

  // Deliberate identities provide actual continuity, avoiding accidental matches on common labels.
  const keys=new Map<string,number>();
  const match=(e:SlideElement,key:string)=>{const n=keys.get(key)??0;keys.set(key,n+1);e.motionKey=`template:${collection}:${key}:${n}`;e.motionMatch='auto';};
  if(collection==='report'&&['metrics','table','before-after'].includes(page)){
    const metric=s.elements.find(e=>e.type==='text'&&e.text==='68%'&&(page==='before-after'?e.x===812:e.x===84));
    if(metric){match(metric,'current-result');animate([metric],1);}
    if(page==='table'){
      const context=s.elements.filter(e=>e.type==='text'&&e!==metric&&e.x<328&&e.y>=250&&e.y<700);
      animate(context,1);for(const e of context)e.animation!.withTransition=false;
    }
    if(page==='before-after'){
      const data=s.elements.filter(e=>e.type==='text'&&e!==metric&&e.y>=298&&e.y<700);
      animate(data,1);for(const e of data)e.animation!.withTransition=false;
    }
  }
  if(collection==='portfolio'&&['split','evidence','before-after'].includes(page)){
    const box=s.elements.find(e=>e.name==='Updated sample interface');
    if(box?.group){const ids=new Set([box.group]);for(let n=0;n<8;n++)for(const g of groups)if(g.parent&&ids.has(g.parent))ids.add(g.id);
      for(const e of s.elements.filter(e=>e.group&&ids.has(e.group)&&e.type!=='line').sort((a,b)=>a.y-b.y||a.x-b.x))match(e,`workspace-${e.type}-${e.name}`);
    }
  }
  if(collection==='proposal')for(const e of s.elements.filter(e=>e.type==='image'&&e.resource?.kind==='photo')){
    if(e.src?.includes('material'))match(e,'material-study');else if(e.src?.includes('paper-study'))match(e,'paper-study');
  }
  if(s.elements.some(e=>e.animation?.trigger==='click'))s.notes+=' Present the grouped points with Next or the right arrow; each click reveals one complete stage. Previous reverses the reveal.';
  return resolveGroupLayouts(s);
}
