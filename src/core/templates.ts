import { element,uid, blankSlide, newDeck, type Deck, type Slide, type SlideElement } from './model';
import { type ColorRole, type TextRole } from './design-system-schema';
import {TEMPLATE_MEDIA} from './template-media';
import {TEMPLATE_PAGES} from './template-blueprints';
import {LEDGER_METRIC_CELLS,LEDGER_METRIC_SOURCE} from './template-story-samples';
import {composeInterior} from './template-compositions';
import {composeExpanded} from './template-expanded-compositions';
import {composeProfessional} from './template-professional-compositions';
import {templateBlockId} from './template-block-map';
import {composeTemplateBlock} from './template-block-compositions';
import {PROFESSIONAL_LAYOUTS} from './template-professional-blueprints';
import {templateContract,defaultTemplateCount,type TemplateOptions} from './template-contracts';
import {continueTable} from './table-fit';
import {continueChart} from './chart-continuation';
import {configureTemplateBehavior} from './template-behavior';
import {prepareThemeArtwork,type ThemeArtworkLoader} from './theme-artwork';
import { applyDeckDesignSystem } from './deck-design-system';
import {DEFAULT_PAGE_ELEMENTS,hidePageElements,refreshPageElements} from './page-elements';
import {matchSmartLayers} from './smart-motion';
import {portableTemplateOwnership} from './template-ownership';
import {inlineTextWidth} from './inline-text-width';
import {galleryCaptionParts} from './template-gallery-continuation';
import {templatePageGrid,placeTemplateOnGrid} from './template-page-grid';

import {COLLECTIONS,LAYOUTS,type LayoutId,type CollectionId} from './template-collections';
export {COLLECTIONS,LAYOUTS,PALETTE,TEMPLATE_ARTWORK,type LayoutId,type CollectionId} from './template-collections';
/** Explicit type/color roles keep template craft linked to editable document styles. */
export function createLayout(id: LayoutId, index = 1, collectionId: string = 'portfolio',options:TemplateOptions={}): Slide {
  const c=COLLECTIONS.find(c=>c.id===collectionId)??COLLECTIONS[0],system=c.system;
  const base=TEMPLATE_PAGES[c.id][id]??TEMPLATE_PAGES.portfolio[id];
  const p={...base,heading:options.heading??base.heading,body:options.body??base.body,fields:options.items??base.fields,columns:options.items??base.columns};
  const s=blankSlide();s.background=system.colors.background;s.backgroundStyle='background';
  const pageGrid=templatePageGrid(c.id,id);s.layout=pageGrid.layout;
  const finish=(slide:Slide)=>placeTemplateOnGrid(slide,c.id,id,pageGrid);
  const text=(value:string,x:number,y:number,w:number,h:number,role:TextRole='body',size=system.typography[role].fontSize,color:ColorRole='ink',extra:Partial<SlideElement>={})=>{
    const style=system.typography[role],e=element('text',{text:value,name:value.split('\n')[0].slice(0,60),x,y,w,h,...style,fontSize:size,fill:system.colors[color],textSizing:role==='title'||role==='heading'?'auto-width':'auto-height',...extra});
    e.design={text:role,textScale:size/style.fontSize,fill:color,overrides:(['fontFamily','fontWeight','lineHeight','letterSpacing'] as const).filter(key=>e[key]!==style[key])};s.elements.push(e);return e;
  };
  const shape=(x:number,y:number,w:number,h:number,color:ColorRole='surface',extra:Partial<SlideElement>={})=>{
    const e=element('rect',{x,y,w,h,fill:system.colors[color],design:{fill:color},...extra});s.elements.push(e);return e;
  };
  const rule=(x:number,y:number,w:number,color:ColorRole='line',group?:string)=>s.elements.push(element('line',{x,y,w,h:1,stroke:system.colors[color],strokeWidth:1.5,design:{stroke:color},name:'Divider',...(group?{group}:{})}));
  const label=(value:string,x:number,y:number,w=800,color:ColorRole='muted',extra:Partial<SlideElement>={})=>text(value,x,y,w,36,'caption',22,color,{letterSpacing:.8,textSizing:'fixed',...extra});
  const image=(key:string,x:number,y:number,w:number,h:number,fit:'contain'|'cover'='contain',opacity=1)=>{
    const media=TEMPLATE_MEDIA[key];
    if(!media)throw new Error(`Unknown template media: ${key}`);
    const themed=media.resource?.id.startsWith('blue-black:'),group=themed?`artwork-${s.id}-${s.elements.length}`:undefined;
    if(themed)shape(x,y,w,h,'onDark',{name:'Illustration mount',radius:12,group});
    const e=element('image',{x,y,w,h,src:media.src,fit,opacity,resource:media.resource,...(themed?{fill:system.colors.accent,design:{fill:'accent' as const},group}:{}),name:media.resource?.title??`${key} study · AI-generated artwork (replaceable)`});s.elements.push(e);return e;
  };
  const photo=(x:number,y:number,w:number,h:number,key='paper')=>image(key,x,y,w,h,'cover');
  const spot=(key:string,x:number,y:number,size=84)=>{
    // A grouped light mount preserves original black ink across document themes.
    return image(key,x,y,size,size);
  };
  const mockup=(x:number,y:number,w:number,h:number,variant:'before'|'after'|'result'='after')=>{
    const k=Math.min(w/600,h/300),g=`sample-${s.id}-${s.elements.length}`;
    const box=shape(x,y,w,h,'surface',{name:`${variant==='after'?'Updated':'Original'} sample interface`,group:g});
    text(variant==='result'?'Task completed':'Project workspace',x+32*k,y+26*k,w-64*k,50*k,'body',28*k,'ink',{fontWeight:600,group:g});rule(x+32*k,y+88*k,w-64*k,'line',g);
    const rows=variant==='before'?['Find a project','Find the next task','Choose an action']:variant==='result'?['Decision recorded','Handoff confirmed']:['Your next task','Review the design'];
    rows.forEach((v,i)=>{
      const step=Math.min(66*k,Math.max(32*k,(h-170*k)/Math.max(1,rows.length-1)));
      text(v,x+32*k,y+116*k+i*step,w-150*k,42*k,'body',25*k,'ink',{group:g});
      text(variant==='before'?'Open':'View',x+w-102*k,y+119*k+i*step,70*k,40*k,'caption',20*k,'muted',{align:'right',group:g});
    });
    if(h>=380*k){
      shape(x+32*k,y+h-104*k,w-64*k,60*k,'ink',{name:'Sample primary action',group:g});
      text('Continue',x+56*k,y+h-96*k,w-112*k,48*k,'body',25*k,'background',{fontWeight:600,group:g});
    }
    return box;
  };
  const table=(cells:string[][],x=84,y=320,w=1276,h=336)=>{if(id==='table'&&c.id!=='report'){y=286;h=412;}const table=element('table',{name:'Editable comparison table',x,y,w,h,fontFamily:system.typography.body.fontFamily,fontSize:28,fill:system.colors.ink,stroke:system.colors.line,strokeWidth:1,cells,tableFit:{minimumFontSize:24,padding:8},lineHeight:1.2,design:{text:'body',textScale:28/30,fill:'ink',stroke:'line',overrides:['lineHeight']}});s.elements.push(table);return table;};
  const chart=(labels:string[],values:number[],type:'column'|'bar'|'line'|'area'='column',box={x:524,y:292,w:836,h:424},compare=false)=>{
    const roles:ColorRole[]=compare?['line','accent','background']:['accent'];
    const fill=roles[0];
    s.elements.push(element('chart',{name:'Example results · editable data',...box,fontFamily:system.typography.body.fontFamily,fontSize:24,
      fill:system.colors[fill],stroke:system.colors.ink,design:{text:'body',textScale:24/30,fill,stroke:'ink'},
      chart:{type,adaptive:true,labels,series:[{name:'Completion',values}],title:'',subtitle:'',source:'',colors:roles.map(role=>system.colors[role]),
        ...(compare?{colorCategories:labels,colorRoles:roles}:{}),textColor:system.colors.ink,legend:false,grid:false,
        showValues:type==='column'||type==='bar',stacked:false,categoryTitle:'',valueTitle:'',prefix:'',suffix:'%'}}));
  };
  const columns=(items:[string,string][],roadmap=false)=>items.forEach(([title,body],i)=>{
    const x=84+i*432;rule(x,310,392);
    text(`0${i+1}`,x,344,260,108,'heading',72,'accent');
    spot((c.id==='proposal'?['spot-23-feedback','spot-21-prototype','spot-13-handoff']:c.id==='pitch'?['spot-01-search','spot-21-prototype','spot-04-complete']:['spot-01-search','spot-07-compare','spot-22-test'])[i],x+292,346,88);
    text(title,x,478,390,96,'body',36,'ink',{fontWeight:600});
    text(body,x,588,390,118,roadmap?'caption':'body',roadmap?24:28,'muted');
  });
  const dark=id==='statement'||id==='section'||(c.id==='portfolio'&&id==='close')||(c.id==='report'&&id==='quote');
  if(dark){s.background=system.colors.dark;s.backgroundStyle='dark';}
  s.pageSection=p.section;
  const hidden=hidePageElements({...s,template:{prototype:id,variant:'standard',density:options.density??'presentation'}},index-1,DEFAULT_PAGE_ELEMENTS);
  text(String(index).padStart(2,'0'),1300,764,60,30,'caption',16,dark?'onDark':'muted',{name:'Page number',align:'right',fontWeight:400,lineHeight:1.6,letterSpacing:0,textSizing:'fixed',wrap:false,clipText:true,maxLines:1,hidden,pageElement:{kind:'page-number',value:'{page:02}',coverHidden:hidden}});
  const serif=c.id==='proposal';
  const intro=(heading=p.heading,body='')=>{
    text(heading,80,132,1276,118,'heading',c.id==='report'?66:serif?76:68);
    if(body)text(body,84,250,1180,86,'body',30,'muted');
  };
  const painter={s,text,shape,label,rule,photo,spot,image,mockup,table,chart};
  if(composeTemplateBlock(c,p,id,painter,options))return finish(s);
  // Keep the collection's authored story as the default. Task-library pages and
  // explicitly chosen variants use the configurable professional composition.
  if((PROFESSIONAL_LAYOUTS.some(layout=>layout.id===id)||Object.keys(options).length>0)&&composeProfessional(c,p,id,painter,options)){s.template={...s.template!,collection:c.id};return finish(s);}
  if(id!=='cover'&&(composeInterior(c,p,id,painter)||composeExpanded(c,p,id,painter))){
    // Each collection owns its reading structure.
  }else if(id==='cover'){
    if(c.id==='portfolio'){
      photo(768,0,672,810);text(p.heading,76,210,650,278,'title',112,'ink',{lineHeight:1.06,letterSpacing:-2});
      text(p.body,84,574,660,108,'body',30);
    }else if(c.id==='review'){
      text(p.heading,76,188,724,254,'title',110);
      text(p.body,84,486,660,90,'body',32,'muted');
      image('work-05-review',760,156,600,420);
      text('Decision needed · Name the choice',84,566,650,54,'caption',25,'muted');
      rule(84,634,1276);['01 / Context','02 / Evidence','03 / Decision'].forEach((v,i)=>text(v,84+i*432,672,398,58,'body',28));
    }else if(c.id==='proposal'){
      text(p.heading,76,202,760,272,'title',104);
      text(p.body,84,526,680,76,'body',36);
      const group=uid('artwork');(s.groups??=[]).push({id:group,name:'Cover artwork'});
      shape(824,156,536,504,'surface',{name:'Artwork mount',group});photo(852,184,480,448,'material').group=group;
      text('Prepared by your name',84,644,680,58,'body',28,'muted');
    }else if(c.id==='pitch'){
      text(p.heading,76,204,790,150,'title',98);
      photo(922,198,438,438,'glass');
      text(p.body,84,405,772,194,'heading',62,'muted');
      rule(84,654,1276,'accent');text('Your name · Pitch date',84,699,1100,54,'body',28,'muted');
    }else if(c.id==='minimal'){
      text(p.heading,76,246,650,264,'title',120,'ink',{letterSpacing:-4});
      text(p.body,84,568,640,102,'body',32,'muted');
      photo(844,174,516,488,'minimal-orbit');
    }else{
      text(p.heading,84,170,574,256,'title',106);
      photo(724,192,636,424,'ledger-folio');
      text(p.body,84,528,614,60,'body',32,'ink');
      text('Team name · Report scope',84,602,614,42,'body',28,'muted');
    }
  }else if(id==='statement'){
    label(c.id==='pitch'?'THE PROBLEM':c.id==='proposal'?'THE PRINCIPLE':'THE DESIGN CHALLENGE',84,174,1080,'onDark');
    text(p.heading,76,270,1280,274,'title',c.id==='portfolio'?112:c.id==='proposal'?104:100,'onDark');
    text(p.body,84,625,1170,98,'body',30,'onDark');
  }else if(id==='facts'){
    intro();
    if(c.id==='report'){
      text(p.body,84,310,612,170,'body',46,'ink',{fontWeight:600,lineHeight:1.2});
      text('Report period\nAdd the scope and source.',84,556,590,110,'body',28,'muted');
      [['Finding','What changed?'],['Implication','Why does it matter?'],['Action','What should happen next?']].forEach(([a,b],i)=>{
        const y=308+i*132;rule(776,y,584);label(a.toUpperCase(),776,y+20,584);text(b,776,y+66,578,68,'body',30);
      });
    }else{
      text(p.body,84,282,1076,104,'body',32,'muted');
      (p.fields??TEMPLATE_PAGES.portfolio.facts.fields!).forEach(([a,b],i)=>{
        const x=84+i*432;rule(x,438,392);label(a.toUpperCase(),x,471,392);text(b,x,546,392,116,'body',34);
      });
    }
  }else if(id==='split'){
    text(p.heading,80,146,c.id==='review'?650:600,188,'heading',c.id==='review'?58:serif?72:64);
    text(p.body,84,c.id==='review'?400:374,470,238,'body',30,'muted');
    if(c.id==='proposal'){
      photo(708,146,652,436,'material');['surface','accent','ink'].forEach((color,i)=>shape(708+i*222,604,208,36,color as ColorRole,{name:`Direction color ${i+1}`}));
      text('AI-generated concept · Replace as needed',708,666,652,62,'caption',22,'muted');
    }else if(c.id==='review'){
      image('work-03-usability-test',708,160,652,462);
      text('Illustrative research scene · Add your evidence',708,666,652,64,'caption',22,'muted');
    }else{
      mockup(708,146,652,484);text('Sample interface · Replace with your evidence',708,666,652,64,'caption',22,'muted');
    }
  }else if(id==='before-after'){
    intro();
    if(c.id==='pitch'){
      table([['Criteria','Current approach','Your product'],['Customer value','Describe the limitation','Describe the benefit'],['Time and effort','What creates friction?','What becomes easier?'],['Reason to choose','What is missing?','What makes it distinct?']]);
      text('Add the evidence that supports the comparison.',84,690,1200,56,'caption',24,'muted');
    }else if(c.id==='report'){
      [84,742].forEach((x,i)=>{
        const g=`period-${s.id}-${i}`;label(i?'CURRENT PERIOD':'PREVIOUS PERIOD',x,292,614,'muted',{group:g});
        [['Completion',i?'68%':'42%'],['Response time',i?'6 min':'9 min'],['Active use',i?'62%':'55%']].forEach(([a,b],j)=>{
          const y=367+j*100;rule(x,y-22,614,'line',g);text(a,x,y,338,62,'body',30,'muted',{group:g});text(b,x+362,y-6,252,82,'body',46,'ink',{align:'right',fontWeight:600,group:g});
        });
      });
      text('Example data · Use the same metric, population, and period.',84,690,1200,56,'caption',24,'muted');
    }else{
      [84,742].forEach((x,i)=>{
        label(i?'AFTER / PROPOSED DESIGN':'BEFORE / CURRENT DESIGN',x,278,614);
        mockup(x,330,614,306,i?'after':'before');
        text(i?'What improved, and how you know.':'What made the original difficult.',x,668,606,68,'body',28,'muted');
      });
    }
    s.notes='The comparison is illustrative. Replace the examples with evidence at the same scale and update the context.';
  }else if(id==='process'){
    intro();columns(p.columns??TEMPLATE_PAGES.portfolio.process.columns!);
  }else if(id==='evidence'){
    intro();
    if(c.id==='proposal'){
      photo(84,282,494,416,'paper');
      label('TYPE / MESSAGE',636,282,724);text('A clear point\nof view.',632,352,724,170,'heading',68);
      text('Show how the direction feels\nwhen the parts work together.',636,545,710,98,'body',28,'muted');
      ['surface','accent','ink'].forEach((color,i)=>shape(636+i*244,676,224,36,color as ColorRole,{name:`Direction color ${i+1}`}));
      text('AI artwork · Replace as needed',84,714,494,40,'caption',22,'muted');
    }else{
      photo(84,266,1276,408,'coast');text('Source and context',84,697,370,42,'caption',22,'muted');
      text('AI artwork · Replace with your project',564,697,796,42,'caption',22,'muted',{align:'right'});
    }
    s.notes='The image is project-owned AI-generated decorative artwork. Replace it with your own project or direction study; update the visible caption and source.';
  }else if(id==='metrics'){
    intro();text('68%',84,340,386,150,'title',120,'accent');
    text(c.id==='review'?'Example target':c.id==='pitch'?'Example adoption metric':'Example completion rate',84,516,398,92,'body',30);
    text(c.id==='review'?'42% baseline\nDefine the target and test period.':c.id==='pitch'?'29% → 68% over four quarters.\nAdd your own data and source.':'42% previous period\nAdd the population and period.',84,624,390,92,'caption',25,'muted');
    if(c.id==='pitch')chart(['Q1','Q2','Q3','Q4'],[29,42,53,68],'line');
    else chart(c.id==='review'?['Baseline','Target']:['Previous','Current'],[42,68]);
    text('Example data · Replace before presenting',550,716,810,36,'caption',22,'muted');
    s.notes='Every number is illustrative. Replace the metric, headline, values, and labels; add sample size, period, and a source before presenting.';
  }else if(id==='table'){
    intro();table(c.id==='report'?[['Metric','Previous','Current','Change'],['Completion','42%','68%','+26 pp'],['Response time','9 min','6 min','−3 min'],['Active use','55%','62%','+7 pp']]:[['Criteria','Option A','Option B'],['Value to the audience','Describe the value','Describe the value'],['Effort and dependencies','Describe the effort','Describe the effort'],['Evidence and uncertainty','Add the evidence','Add the evidence']]);
    text(c.id==='report'?'Example data · Replace with the numbers and source for your report.':'Recommendation · State the choice and the reason.',84,690,1200,56,'caption',24,'muted');
    s.notes='The table is editable. Example report values are illustrative; replace them and add the source and measurement period.';
  }else if(id==='quote'){
    label(c.id==='report'?'THE CONTEXT BEHIND THE RESULT':'WHAT WE HEARD',84,186,1080);
    text(p.heading,80,310,1276,240,'heading',serif?68:62);
    rule(84,642,1276);text(c.id==='report'?'Source · Team, customer, or study':'Participant / role',84,680,754,66,'body',28);
    text('Date · Context',956,684,404,54,'caption',24,'muted',{align:'right'});
    s.notes='Replace the quote with an actual observation. Add context and a source; use anonymous attribution when the research requires it.';
  }else if(id==='roadmap'){
    intro();
    if(c.id==='report'){
      [['01','Choose the priority'],['02','Assign the next test'],['03','Set the review date']].forEach(([a,b],i)=>{
        const y=318+i*132;rule(84,y,1276);text(a,84,y+30,84,64,'body',32,'accent',{fontWeight:600});
        text(b,206,y+27,604,82,'body',34,'ink',{fontWeight:600});text('Owner · Your team\nDue · Target date',886,y+25,474,90,'caption',25,'muted');
      });
    }else{
      const items=(p.columns??TEMPLATE_PAGES.portfolio.roadmap.columns!).map(([a,b])=>[a,`${b}\n\nOwner · Your team`] as [string,string]);
      items.forEach(([a,b],i)=>{
        const x=84+i*432;rule(x,310,392);label(`0${i+1} / ${a.toUpperCase()}`,x,346,280);
        spot(['spot-20-priority','spot-22-test','spot-04-complete'][i],x+294,334,84);
        text(b.split('\n\n')[0],x,427,390,164,'body',36,'ink',{fontWeight:600});
        text('Owner · Your team\nTiming · Target date',x,628,390,90,'caption',25,'muted');
      });
    }
  }else{
    text(p.heading,76,198,c.id==='proposal'?1280:766,270,'title',c.id==='portfolio'?108:c.id==='proposal'?100:94);
    if(c.id==='portfolio'){
      text(p.body,84,520,740,124,'body',32,'muted');rule(906,304,454);label('KEEP THE CONVERSATION GOING',906,338,454);
      spot('spot-23-feedback',1204,144,144);text('Your name',906,419,446,80,'body',36);text('Your email or\nportfolio URL',906,533,446,116,'body',30,'muted');
    }else if(c.id==='proposal'){
      rule(84,516,1276);text(p.body,84,560,728,118,'body',32,'muted');
      text('Direction · Confirm the choice\nScope · Agree the deliverables\nStart · Set the first milestone',854,558,506,156,'caption',26);
    }else{
      text(p.body,84,536,740,134,'body',32,'muted');
      const fields=c.id==='pitch'?[['THE ASK','Funding or support needed'],['USE','What it makes possible'],['NEXT','The milestone to reach']]:c.id==='review'?[['CHOICE','Agree the direction'],['OWNER','Who carries it forward?'],['NEXT TEST','What will you validate?']]:[['DECISION','Agree the priority'],['OWNER','Assign responsibility'],['REVIEW','Set the next review date']];
      fields.forEach(([a,b],i)=>{const y=282+i*136;rule(874,y,486);label(a,874,y+18,486);text(b,874,y+62,480,72,'body',28);});
    }
  }
  if(options.heading){const primary=s.elements.filter(e=>e.type==='text'&&e.fontSize>=56&&e.y>110&&e.y<400&&!/^\d+$/.test(e.text)).sort((a,b)=>a.y-b.y)[0];if(primary)primary.text=options.heading;}
  if(!s.notes)s.notes=`${p.purpose}. Replace the example copy with your own content. Text, shapes, charts, and tables are editable; generated artwork is decorative and replaceable.`;
  const configured=configureTemplateBehavior(s,c.id,id);
  configured.template={prototype:id,variant:options.noImage?'no-image':'standard',density:options.density??'presentation',collection:c.id};
  if(id==='cover'&&options.noImage){configured.elements=configured.elements.filter(e=>e.type!=='image'&&e.name!=='Artwork mount');const flow=configured.autoLayouts?.find(l=>/introduction|author|promise/i.test(l.name));if(flow){flow.w=1276;for(const e of configured.elements.filter(e=>e.group===flow.id)){e.w=1100;if(e.layoutItem)e.layoutItem.maxWidth=1100;}}}
  return finish(configured);
}

export function templateLayouts(collectionId:string){
  const c=COLLECTIONS.find(c=>c.id===collectionId)??COLLECTIONS[0];
  return c.layouts.map(id=>{const layout=LAYOUTS.find(l=>l.id===id)!,p=TEMPLATE_PAGES[c.id][id];return {...layout,name:p.name,description:p.purpose,contract:templateContract(id)};});
}
/** Layout intent stays independent of the document's visual theme and brand name. */
export function deckTemplateCollection(deck:Pick<Deck,'slides'|'designSystem'|'templateCollection'>|null):CollectionId{
  if(deck?.templateCollection)return deck.templateCollection;
  const collection=deck?.slides.find(s=>!s.source&&s.template?.collection)?.template?.collection;
  if(collection)return collection;
  // Recover untouched native template stories without rewriting legacy documents.
  const legacy:Partial<Record<CollectionId,LayoutId[]>>={portfolio:['cover','facts','statement','split','before-after','process','evidence','close'],review:['cover','facts','split','process','before-after','metrics','roadmap','close'],proposal:['cover','statement','facts','split','quote','process','evidence','close'],pitch:['cover','statement','split','metrics','before-after','process','roadmap','facts','close'],report:['cover','facts','metrics','table','before-after','quote','roadmap','close']};
  // Legacy title metadata is read only for collection recovery, never page naming.
  const story=COLLECTIONS.find(c=>[c.layouts,c.legacyLayouts,legacy[c.id]].some(layouts=>layouts&&deck?.slides.length===layouts.length&&layouts.every((id,i)=>[TEMPLATE_PAGES[c.id][id].name,LAYOUTS.find(l=>l.id===id)!.name].includes(deck.slides[i].title??''))));
  const runningHead=deck?.slides.filter(s=>!s.source).flatMap(s=>s.elements).find(e=>e.type==='text'&&e.y<110&&e.text.includes(' / '))?.text;
  return story?.id??COLLECTIONS.find(c=>runningHead?.startsWith(c.category.toUpperCase()+' / '))?.id??COLLECTIONS.find(c=>c.system.name===deck?.designSystem?.name)?.id??'portfolio';
}
export function templateDeck(collectionId: string,options:Record<string,TemplateOptions>={},library=false,story?:readonly LayoutId[]) {
  const c=COLLECTIONS.find(c=>c.id===collectionId)??COLLECTIONS[0];
  const slides=(library?c.layouts:story??c.story??c.layouts).flatMap((id,i)=>{
    const option=options[id];
    const metricTable=!library&&c.id==='report'&&id==='table'&&!option?.cells&&!option?.count;
    return createTemplatePages(id,i+1,c.id,metricTable?{...option,cells:LEDGER_METRIC_CELLS,source:option?.source??LEDGER_METRIC_SOURCE}:option);
  });
  const deck=newDeck(c.title,slides);
  // Curated stories and the full task catalog can order pages differently from
  // the authored sequence. Only shared objects justify a smart handoff.
  for(let i=0;i<deck.slides.length;i++)if(deck.slides[i].transition?.effect==='smart'){
    const plan=i?matchSmartLayers(deck.slides[i-1],deck.slides[i]):undefined;
    if(!plan||plan.issues.length||!plan.pairs.some(pair=>pair.basis==='key'&&pair.changed.length))deck.slides[i].transition={effect:'fade',duration:300,easing:'linear'};
  }
  return refreshPageElements(applyDeckDesignSystem({...deck,templateCollection:c.id,pageElements:{...DEFAULT_PAGE_ELEMENTS}},c.system));
}
export const templateLibraryDeck=(collectionId:string,options:Record<string,TemplateOptions>={})=>templateDeck(collectionId,options,true);

/** A task can produce continuations without losing input or manually rebuilding the grid. */
export function createTemplatePages(id:LayoutId,index=1,collectionId='portfolio',options:TemplateOptions={}):Slide[]{
  const collection=COLLECTIONS.find(c=>c.id===collectionId)??COLLECTIONS[0];
  const sideIntro=templateBlockId(id)||['content','annotation','category-chart','trend','composition','comparison','matrix','case-study','action-plan','appendix','gallery','table','evidence','metrics','risks','insights','before-after'].includes(id);
  if(options.body&&sideIntro&&inlineTextWidth(options.body,24,collection.body)>436*3){
    const context=createLayout('content',index,collectionId,{heading:options.heading??TEMPLATE_PAGES[collectionId][id].heading,items:[['Context',options.body]],density:'reading',source:options.source});
    return [context,...createTemplatePages(id,index+1,collectionId,{...options,body:''})];
  }
  if(options.cells&&['table','action-plan'].includes(id)){
    const [header,...rows]=options.cells,capacity=Math.max(1,options.count??defaultTemplateCount(id));
    if(rows.length>capacity){const pages:Slide[]=[];const size=Math.ceil(rows.length/Math.ceil(rows.length/capacity));for(let offset=0;offset<rows.length;offset+=size)pages.push(...createTemplatePages(id,index+pages.length,collectionId,{...options,cells:[header,...rows.slice(offset,offset+size)],heading:offset?`${options.heading??TEMPLATE_PAGES[collectionId][id].heading} · Continued`:options.heading}));return pages;}
  }
  const contract=templateContract(id),values=options.items,limit=contract.counts.length?Math.max(...contract.counts):Infinity;
  if(id==='gallery'&&values){
    const width=templatePageGrid(collection.id,'gallery').span(8,4).w;
    const parts=values.map(([title,body])=>({title,parts:galleryCaptionParts(body,collection.body,width)}));
    if(parts.some(item=>item.parts.length>1)){
      const pages:Slide[]=[];
      parts.forEach((item,i)=>item.parts.forEach(part=>pages.push(createLayout(id,index+pages.length,collectionId,{...options,items:[[item.title,part]],itemOffset:(options.itemOffset??0)+i,heading:pages.length?`${options.heading??TEMPLATE_PAGES[collectionId][id].heading} · Continued`:options.heading}))));
      return pages;
    }
  }
  const capacity=values&&options.count?Math.max(1,Math.min(limit,options.count)):limit;
  let max=values&&id==='gallery'&&values.some(([a,b])=>a.length>24||b.length>70)?1:values&&id==='decision'&&values.some(([,body])=>body.length>70)?Math.min(capacity,2):values&&(['gantt','workstreams','funnel','roadmap','kanban'].includes(id)&&values.some(([,body])=>body.length>90||['gantt','workstreams'].includes(id)&&inlineTextWidth(body,1,collection.body)>24)||id==='dashboard'&&values.some(([,body])=>body.split(/[\n\t]/).length>2))?Math.min(capacity,3):values&&['process','solution','timeline','annotation'].includes(id)&&values.some(([a,b])=>a.length>24||b.length>(id==='timeline'?55:id==='annotation'?100:70))?Math.min(capacity,id==='annotation'?2:id==='timeline'?4:3):capacity;
  // Native process blocks measure their text and can fit four longer step labels.
  // Let that measured composition decide before falling back to continuation pages.
  if(values?.length===4&&capacity>=4&&['process','solution'].includes(id))max=4;
  try{
    if(values&&values.length>max){const pages=Math.ceil(values.length/max),balanced=Boolean(templateBlockId(id)),size=balanced?Math.floor(values.length/pages):max,extra=balanced?values.length%pages:0;return Array.from({length:pages},(_,i)=>{const offset=i*size+Math.min(i,extra),end=offset+size+(i<extra?1:0);return createLayout(id,index+i,collectionId,{...options,items:values.slice(offset,end),dates:options.dates?.slice(offset,end),itemOffset:(options.itemOffset??0)+offset,heading:i?`${options.heading??TEMPLATE_PAGES[collectionId][id].heading} · Continued`:options.heading});});}
    const s=createLayout(id,index,collectionId,options),table=s.elements.find(e=>e.tableFit),chart=s.elements.find(e=>e.chart?.adaptive);return table?continueTable(s,table.id):chart?continueChart(s,chart.id):[s];
  }catch(error){
    const kind=templateBlockId(id);
    if(error instanceof Error&&error.message.startsWith('Shorten “')&&kind==='process'&&values&&values.length<=6&&options.block?.layout!=='vertical')return createTemplatePages(id,index,collectionId,{...options,block:{...options.block,layout:'vertical'}});
    if(error instanceof Error&&error.message.startsWith('Shorten “')&&kind&&!['architecture','organization','swot'].includes(kind)&&values&&values.length>1&&max>1)return createTemplatePages(id,index,collectionId,{...options,count:Math.min(values.length-1,max-1)});
    throw error;
  }
}

/** Small-page insertion respects schema minimums; the caller keeps the slide style bindings. */
export {scaleTemplateSlide} from './template-scaling';

/** New documents carry project-owned AI media; previews can keep lightweight local URLs. */
export async function embedTemplateArtwork(deck:Deck,read:(src:string)=>Promise<Uint8Array>=async src=>{
  const response=await fetch(src);if(!response.ok)throw new Error('Template artwork could not load. Try again.');
  return new Uint8Array(await response.arrayBuffer());
},loadTheme?:ThemeArtworkLoader):Promise<Deck>{
  const urls=[...new Set(deck.slides.flatMap(s=>s.elements.map(e=>e.src).filter((src):src is string=>!!src?.startsWith('/examples/template-assets/'))))];
  if(!urls.length)return portableTemplateOwnership(deck,await prepareThemeArtwork(deck,loadTheme));
  const encoded=new Map<string,string>();
  await Promise.all(urls.map(async src=>{const bytes=await read(src);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const mime=src.endsWith('.png')?'image/png':src.endsWith('.svg')?'image/svg+xml':'image/jpeg';encoded.set(src,`data:${mime};base64,${btoa(binary)}`);
  }));
  return portableTemplateOwnership(deck,await prepareThemeArtwork({...deck,slides:deck.slides.map(s=>({...s,elements:s.elements.map(e=>e.src&&encoded.has(e.src)?{...e,src:encoded.get(e.src)}:e)}))},loadTheme));
}
