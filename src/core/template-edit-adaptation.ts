import {uid,type Slide} from './model';
import {inlineTextWidth} from './inline-text-width';
import {templatePageGrid} from './template-grid-metrics';
import {scaleTemplateSlide} from './template-scaling';
import type {LayoutId} from './template-collections';
function adaptNativeDetails(slide:Slide,changed:Set<string>,pageSize={width:1440,height:810}):Slide{
 const sx=pageSize.width/1440,sy=pageSize.height/810,k=Math.min(sx,sy),grid=templatePageGrid(slide.template?.collection??'portfolio',slide.template?.prototype as LayoutId);
 const frame=(value:{x?:number;y?:number;w?:number;h?:number;textFitHeight?:number})=>Object.fromEntries(Object.entries(value).map(([key,value])=>[key,value*(key==='x'||key==='w'?sx:sy)]));
 const page=slide.template?.prototype;if(!['audience','q-and-a'].includes(page??'')||slide.source||slide.elements.some(e=>e.locked))return slide;
 const relevant=slide.autoLayouts?.filter(l=>page==='audience'?l.name.startsWith('Audience context '):l.name.startsWith('Discussion question '))??[];
 const bodies=slide.elements.filter(e=>e.type==='text'&&relevant.some(l=>l.order.includes(e.id))&&e.design?.text==='body');
 if(!bodies.some(e=>changed.has(e.id)&&inlineTextWidth(e.text,e.layoutItem?.basisFontSize??e.fontSize,e.fontFamily)>e.w*2))return slide;
 const elements=slide.elements.map(e=>({...e,layoutItem:e.layoutItem?{...e.layoutItem}:undefined})),layouts=slide.autoLayouts!.map(l=>({...l,padding:{...l.padding},order:[...l.order]}));
 const fixed=(id:string,x:number,y:number,w:number)=>{const e=elements.find(e=>e.id===id);if(!e)return;e.x=x*sx;e.y=y*sy;e.w=w*sx;e.textSizing='auto-height';e.layoutItem={...e.layoutItem,widthMode:'fixed',heightMode:'fixed',maxWidth:w*sx,basisFontSize:e.layoutItem?.basisFontSize??e.fontSize};};
 const row=(l:typeof layouts[number],x:number,y:number,w:number,h:number,gap:number)=>Object.assign(l,{...frame({x,y,w,h}),gap:gap*k,direction:'horizontal',align:'start',justify:'start',widthMode:'fixed',heightMode:'hug',textFitHeight:h*sy});
 if(page==='audience'){
  const focus=layouts.find(l=>l.name==='Audience focus');if(focus){const inset=28,x=grid.full.x+inset,w=grid.full.w-inset*2,label=164,title=272;row(focus,x,298,w,112,24);focus.order.forEach((id,i)=>fixed(id,i===0?x:i===1?x+label+24:x+label+title+48,298,i===0?label:i===1?title:w-label-title-48));}
  const panel=elements.find(e=>e.name==='Audience context'&&e.type==='rect');if(panel)Object.assign(panel,frame({...grid.full,y:286,h:136}));
  relevant.forEach((l,i)=>{const index=Number(l.name.split(' ').at(-1))-1,label=layouts.find(label=>label.name===`Audience detail ${index+1}`),y=438+index*94;Object.assign(layouts.find(item=>item.id===l.id)!,frame({...grid.span(3,9),y,h:90,textFitHeight:90}));for(const id of l.order)fixed(id,grid.span(3,9).x,y,grid.span(3,9).w);if(label){Object.assign(label,frame({...grid.span(0,3),y,h:90,textFitHeight:90}));for(const id of label.order)fixed(id,grid.full.x,y,grid.span(0,3).w);}});
  elements.filter(e=>e.type==='line'&&e.y>=320*sy&&e.y<720*sy).forEach((e,i)=>Object.assign(e,frame({...grid.full,y:424+i*94})));
 }else{
  const intro=layouts.find(l=>l.name==='Discussion introduction');if(intro){Object.assign(intro,{...frame({...grid.full,y:138,h:196,textFitHeight:196}),gap:18*k});for(const id of intro.order){const e=elements.find(e=>e.id===id)!;e.w=grid.full.w*sx;if(e.layoutItem)e.layoutItem.maxWidth=grid.full.w*sx;}}
  relevant.forEach(l=>{const index=Number(l.name.split(' ').at(-1))-1,y=370+index*114,current=layouts.find(item=>item.id===l.id)!;row(current,grid.full.x,y,grid.full.w,104,24);l.order.forEach((id,i)=>fixed(id,i?grid.span(3,9).x:grid.full.x,y,i?grid.span(3,9).w:grid.span(0,3).w));});
  elements.filter(e=>e.type==='line'&&Math.abs(e.y-580*sy)<.1).forEach((e,i)=>Object.assign(e,frame({...grid.full,y:356+i*114})));
  const tag=elements.find(e=>e.text==='Q&A');if(tag)tag.y=84*sy;
 }
 return {...slide,elements,autoLayouts:layouts,template:{...slide.template!,variant:'reading-details'}};
}
/** A longer gallery caption trades image height for a larger reading region.
 * Only untouched template frames opt in; a manually cropped/resized picture stays put. */
function adaptGallery(slide:Slide,changed:Set<string>):Slide{
 if(slide.source||slide.template?.prototype!=='gallery'||!slide.template.collection||!['standard','reading-gallery'].includes(slide.template.variant)||slide.elements.some(e=>e.locked))return slide;
 const captions=(slide.autoLayouts??[]).filter(l=>/^Study caption \d+$/.test(l.name)).sort((a,b)=>a.x-b.x),photos=slide.elements.filter(e=>e.type==='image').sort((a,b)=>a.x-b.x);
 if(captions.length!==3||photos.length!==3)return slide;
 const bodies=slide.elements.filter(e=>e.type==='text'&&e.design?.text==='body'&&captions.some(l=>l.order.includes(e.id)));
 if(!bodies.some(e=>changed.has(e.id)))return slide;
 const g=templatePageGrid(slide.template.collection,'gallery'),wasReading=slide.template.variant==='reading-gallery';
 if(photos.some((e,i)=>Math.abs(e.x-g.span(i*4,4).x)>.1||Math.abs(e.w-g.span(i*4,4).w)>.1||Math.abs(e.h-(wasReading?176:248))>.1))return slide;
 const reading=bodies.some(e=>inlineTextWidth(e.text,e.layoutItem?.basisFontSize??e.fontSize,e.fontFamily)>e.w*2);
 if(reading===wasReading)return slide;
 const elements=slide.elements.map(e=>({...e})),layouts=slide.autoLayouts!.map(l=>({...l}));
 photos.forEach((photo,i)=>{const image=elements.find(e=>e.id===photo.id)!;image.h=reading?176:248;const flow=layouts.find(l=>l.id===captions[i].id)!,nextY=image.y+image.h+22,dy=nextY-flow.y;flow.y=nextY;flow.h=flow.textFitHeight=g.bottom-nextY;for(const e of elements.filter(e=>flow.order.includes(e.id)))e.y+=dy;});
 return {...slide,elements,autoLayouts:layouts,template:{...slide.template,variant:reading?'reading-gallery':'standard'}};
}
function adaptComparison(slide:Slide,changed:Set<string>):Slide{
 if(slide.source||slide.template?.prototype!=='before-after'||slide.template.collection!=='minimal'||slide.elements.some(e=>e.locked))return slide;
 const flows=(slide.autoLayouts??[]).filter(l=>/^Comparison explanation \d+$/.test(l.name));
 const bodies=slide.elements.filter(e=>flows.some(l=>l.order.includes(e.id)));
 if(!bodies.some(e=>changed.has(e.id)))return slide;
 const panels=slide.elements.filter(e=>e.type==='rect'&&/comparison panel$/.test(e.name)),was=slide.template.variant==='reading-comparison';if(panels.length!==2||panels.some(e=>Math.abs(e.h-(was?176:264))>.1))return slide;
 const reading=bodies.some(e=>inlineTextWidth(e.text,e.layoutItem?.basisFontSize??e.fontSize,e.fontFamily)>e.w*2);if(reading===was)return slide;
 const elements=slide.elements.map(e=>({...e})),layouts=slide.autoLayouts!.map(l=>({...l})),g=templatePageGrid('minimal','before-after');
 panels.sort((a,b)=>a.x-b.x).forEach((panel,i)=>{const box=elements.find(e=>e.id===panel.id)!;box.h=reading?176:264;for(const e of elements.filter(e=>e.group===box.group&&e.type==='text')){e.y=box.y+(reading?32:46);e.h=reading?112:150;}const l=layouts.find(l=>l.id===flows[i].id)!,y=box.y+box.h+(reading?24:38),dy=y-l.y;l.y=y;l.h=l.textFitHeight=g.bottom-y;for(const e of elements.filter(e=>l.order.includes(e.id)))e.y+=dy;});
 return {...slide,elements,autoLayouts:layouts,template:{...slide.template,variant:reading?'reading-comparison':'standard'}};
}
function adaptMatrixDetails(slide:Slide,changed:Set<string>):Slide{
 if(slide.source||slide.template?.prototype!=='matrix'||!slide.template.collection||slide.elements.some(e=>e.locked))return slide;
 const flows=(slide.autoLayouts??[]).filter(l=>/^Priority \d+$/.test(l.name)),field=slide.elements.find(e=>e.name==='Priority field'),was=slide.template.variant==='matrix-details';
 if(!field||Math.abs(field.h-(was?210:326))>.1||!flows.some(l=>l.order.some(id=>changed.has(id))))return slide;
 const textFor=(l:typeof flows[number])=>slide.elements.find(e=>l.order.includes(e.id)&&e.type==='text')!;
 const detailed=flows.filter(l=>{const e=textFor(l),ref=slide.elements.find(e=>e.name===`Priority reference ${l.name.split(' ').at(-1)}`);return inlineTextWidth(e.text,e.layoutItem?.basisFontSize??e.fontSize,e.fontFamily)>(ref?.w??l.w)*2;});
 if(detailed.length>2)return slide;
 if((detailed.length>0)===was)return slide;
 const elements=slide.elements.map(e=>({...e,layoutItem:e.layoutItem?{...e.layoutItem}:undefined})),layouts=slide.autoLayouts!.map(l=>({...l})),parent=slide.groups?.find(g=>g.name==='Priority matrix region')?.id;if(!parent)return slide;
 const member=(e:typeof elements[number])=>{let id=e.group,n=0;while(id&&n++<32){if(id===parent)return true;id=slide.groups?.find(g=>g.id===id)?.parent;}return false;};
 const ratio=210/326,g=templatePageGrid(slide.template.collection,'matrix'),mapY=(y:number)=>was?310+(y-286)/ratio:286+(y-310)*ratio;
 const references=new Map(flows.map(l=>[l.id,elements.find(e=>e.name===`Priority reference ${l.name.split(' ').at(-1)}`)]));
 for(const e of elements.filter(e=>member(e)&&!e.name.startsWith('Matrix detail number ')&&!e.name.startsWith('Priority reference '))){const l=flows.find(l=>l.order.includes(e.id));if(was&&references.get(l?.id??''))continue;e.y=mapY(e.y);if(e.type==='rect'||e.type==='line')e.h=Math.max(1,e.h*(was?1/ratio:ratio));if(e.text==='LOW EFFORT'||e.text==='HIGH EFFORT')e.y=was?658:518;}
 for(const l of layouts.filter(l=>/^Priority \d+$/.test(l.name)))l.y=mapY(l.y);
 if(!was)for(const [i,flow] of detailed.entries()){
  const l=layouts.find(l=>l.id===flow.id)!,e=elements.find(e=>flow.order.includes(e.id)&&e.type==='text')!,index=flow.name.split(' ').at(-1)!,area=g.span(1,11),y=566+i*68;
  elements.push({...e,id:uid('point-reference'),name:`Priority reference ${index}`,text:index.padStart(2,'0'),group:parent,layoutItem:undefined,textSizing:'fixed',h:32});
  const number={...e,id:uid('legend-number'),name:`Matrix detail number ${index}`,text:index.padStart(2,'0'),group:parent,layoutItem:undefined,textSizing:'fixed' as const,x:g.content.x,y,w:g.span(0,1).w,h:32};elements.push(number);
  Object.assign(l,{...area,y,h:64,textFitHeight:64});Object.assign(e,{...area,y,textSizing:'auto-height'});if(e.layoutItem)e.layoutItem.maxWidth=area.w;
 }else for(const flow of flows){const ref=references.get(flow.id);if(!ref)continue;const l=layouts.find(l=>l.id===flow.id)!,e=elements.find(e=>flow.order.includes(e.id)&&e.type==='text')!;Object.assign(l,{x:ref.x,y:mapY(ref.y),w:ref.w,h:46,textFitHeight:46});Object.assign(e,{x:l.x,y:l.y,w:l.w});if(e.layoutItem)e.layoutItem.maxWidth=l.w;}
 return {...slide,elements:was?elements.filter(e=>!e.name.startsWith('Priority reference ')&&!e.name.startsWith('Matrix detail number ')):elements,autoLayouts:layouts,template:{...slide.template,variant:was?String(flows.length):'matrix-details'}};
}

/** Adapt only opted-in native templates after content edits; references stay untouched. */
export function adaptTemplateText(slide:Slide,changed:Set<string>,deletedImage:boolean,pageSize={width:1440,height:810}):Slide{
  if(pageSize.width!==1440||pageSize.height!==810){const base=scaleTemplateSlide(slide,1440*1440/pageSize.width,810*810/pageSize.height),adapted=adaptTemplateText(base,changed,deletedImage);return adapted===base?slide:scaleTemplateSlide(adapted,pageSize.width,pageSize.height);}
  const comparison=adaptComparison(slide,changed);if(comparison!==slide)return comparison;
  const matrix=adaptMatrixDetails(slide,changed);if(matrix!==slide)return matrix;
  const gallery=adaptGallery(slide,changed);if(gallery!==slide)return gallery;
  const detailed=adaptNativeDetails(slide,changed);if(detailed!==slide)return detailed;
  if(!slide.template||slide.source||!['cover','split'].includes(slide.template.prototype))return slide;
  const title=slide.elements.find(e=>e.type==='text'&&e.fontSize>=56&&e.y>110&&e.y<340&&!/^\d+$/.test(e.text));
  const missing=deletedImage&&!slide.elements.some(e=>e.type==='image'),long=slide.template.prototype==='cover'&&title&&changed.has(title.id)&&(title.text.length>52||title.text.split('\n').some(line=>inlineTextWidth(line,title.layoutItem?.basisFontSize??title.fontSize,title.fontFamily)>title.w*2.5))&&slide.template.variant==='standard';
  if(!missing&&!long||slide.elements.some(e=>e.locked))return slide;
  const next={...slide,elements:slide.elements.map(e=>({...e,layoutItem:e.layoutItem?{...e.layoutItem}:undefined})),groups:slide.groups?.map(g=>({...g})),autoLayouts:slide.autoLayouts?.map(l=>({...l,padding:{...l.padding},order:[...l.order]})),template:{...slide.template,variant:missing?'no-image':'long-title'},layout:templatePageGrid(slide.template.collection??'portfolio',slide.template.prototype as LayoutId).layout};
  const removeGroups=new Set(next.autoLayouts?.filter(l=>missing&&l.name==='Visual source').map(l=>l.id));
  if(missing)next.elements=next.elements.filter(e=>!removeGroups.has(e.group??'')&&!['Artwork mount','Illustration mount'].includes(e.name));
  const introGroups=new Set(next.autoLayouts?.filter(l=>/introduction|author|promise|Heading frame/.test(l.name)).map(l=>l.id));
  const texts=next.elements.filter(e=>e.type==='text'&&!e.pageElement&&e.y>110&&e.y<736&&e.fontSize>=24&&e.x<950&&!/^0[123] \/ /.test(e.text)&&(slide.template!.prototype!=='cover'||!e.group||introGroups.has(e.group)));
  const grid=templatePageGrid(slide.template.collection??'portfolio',slide.template.prototype as LayoutId);
  const oldGroups=new Set(texts.flatMap(e=>e.group?[e.group]:[]));
  for(const id of oldGroups)if(!next.elements.some(e=>e.group===id&&!texts.includes(e)))removeGroups.add(id);
  next.groups=(next.groups??[]).filter(g=>!removeGroups.has(g.id));
  next.autoLayouts=(next.autoLayouts??[]).filter(l=>!removeGroups.has(l.id));
  const reflow=(name:string,members:typeof texts,area:{x:number;w:number},y:number,h:number,gap:number)=>{
    if(!members.length)return;
    const group=uid('flow'),{x,w}=area;
    for(const e of members){
      e.group=group;e.x=x;e.y=y;e.w=w;e.textSizing='auto-height';
      if(e.id===title?.id&&e.fontSize>76){
        if(e.design?.textScale)e.design={...e.design,textScale:e.design.textScale*76/e.fontSize};
        e.fontSize=76;
      }
      e.layoutItem={widthMode:'fill',heightMode:'fixed',maxWidth:w,basisFontSize:e.fontSize};
    }
    next.groups!.push({id:group,name});
    next.autoLayouts!.push({id:group,name,direction:'vertical',gap,padding:{top:0,right:0,bottom:0,left:0},align:'start',justify:'start',columns:1,x,y,w,h,textFitHeight:h,widthMode:'fixed',heightMode:'hug',order:members.map(e=>e.id)});
  };
  if(long){
    reflow('Adaptive title',texts.filter(e=>e.id===title.id),grid.full,132,322,0);
    reflow('Adaptive context',texts.filter(e=>e.id!==title.id),grid.span(0,8),502,174,10);
    for(const e of next.elements){
      if(e.type==='line'&&e.y>600&&e.w>1000)e.y=710;
      if(e.type==='text'&&/^0[123] \/ /.test(e.text))e.y=728;
    }
    const art=grid.span(9,3),mount=next.elements.find(e=>e.name==='Artwork mount');
    for(const e of next.elements)if(e.type==='image'||e.name==='Artwork mount'||e.name==='Illustration mount'){
      const inset=e.type==='image'&&mount?12:0;
      Object.assign(e,{x:art.x+inset,y:490+inset,w:art.w-inset*2,h:186-inset*2});
    }
  }else reflow('Adaptive introduction',texts,grid.full,176,slide.template.collection==='review'?472:504,32);
  return next;
}

/** Dense native tables use the whole page; imported and locked compositions stay intact. */
export function adaptTemplateTable(slide:Slide,changed:Set<string>,pageSize={width:1440,height:810}):Slide{
 if(pageSize.width!==1440||pageSize.height!==810){const base=scaleTemplateSlide(slide,1440*1440/pageSize.width,810*810/pageSize.height),adapted=adaptTemplateTable(base,changed);return adapted===base?slide:scaleTemplateSlide(adapted,pageSize.width,pageSize.height);}
 if(slide.source||slide.template?.prototype!=='table'||slide.elements.some(e=>e.locked))return slide;
 const table=slide.elements.find(e=>e.type==='table'&&e.tableFit&&changed.has(e.id));if(!table||Math.max(...(table.cells??[]).map(r=>r.length))<5)return slide;
 const elements=slide.elements.map(e=>({...e,layoutItem:e.layoutItem?{...e.layoutItem}:undefined,design:e.design?{...e.design}:undefined}));
 const removed=new Set(elements.filter(e=>e.x<328&&e.type==='text'&&!e.runs&&!e.paragraphs&&(e.name==='Current result'&&e.text==='68%'||(e.name==='Report result context'||e.text==='CURRENT RESULT\nExample completion.'))).map(e=>e.id));
 const nextElements=elements.filter(e=>!removed.has(e.id)),metric=nextElements.find(e=>e.name==='Current result');
 const title=nextElements.find(e=>e.type==='text'&&e.fontSize>=56&&e.y>110&&e.y<280&&e!==metric);
 const layouts=slide.autoLayouts?.map(l=>({...l,padding:{...l.padding},order:l.order.filter(id=>!removed.has(id))})).filter(l=>l.order.length);
 const position=(e:typeof nextElements[number],x:number,y:number,w:number,h:number)=>{Object.assign(e,{x,y,w,h});const l=layouts?.find(l=>l.order.includes(e.id));if(l)Object.assign(l,{x,y,w,h,textFitHeight:h});if(e.layoutItem)e.layoutItem={...e.layoutItem,maxWidth:w};};
 const grid=templatePageGrid(slide.template.collection??'portfolio','table');
 const full=nextElements.find(e=>e.id===table.id)!;Object.assign(full,{...grid.full,y:296,h:402,lineHeight:1.2});if(full.design)full.design.overrides=[...new Set([...(full.design.overrides??[]),'lineHeight' as const])];
 if(title)position(title,grid.full.x,138,grid.span(0,metric?9:12).w,134);
 if(metric){position(metric,grid.span(10,2).x,138,grid.span(10,2).w,78);metric.fontSize=56;if(metric.layoutItem)metric.layoutItem.basisFontSize=56;if(metric.design)metric.design.textScale=56/104;}
 const customContext=nextElements.filter(e=>e.type==='text'&&!e.pageElement&&e.x<328&&e.y>=280&&e.y<480&&e!==title&&e!==metric);
 for(const e of customContext)position(e,grid.span(10,2).x,222,grid.span(10,2).w,64);
 for(const e of nextElements.filter(e=>e.type==='text'&&e.y>=700&&e.y<736)){position(e,grid.full.x,e.y,grid.full.w,e.h);}
 const liveGroups=new Set(nextElements.flatMap(e=>e.group?[e.group]:[]));for(const l of layouts??[])liveGroups.add(l.id);
 const groups=slide.groups?.filter(g=>liveGroups.has(g.id)).map(g=>({...g,parent:g.parent&&liveGroups.has(g.parent)?g.parent:undefined}));
 return {...slide,elements:nextElements,autoLayouts:layouts,groups,template:{...slide.template,variant:'full-width-data'},layout:grid.layout};
}
