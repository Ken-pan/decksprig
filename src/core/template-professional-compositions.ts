import {element,uid,type SlideElement,type GroupLayout} from './model';
import type {TemplatePainter} from './template-compositions';
import type {TemplatePage} from './template-blueprints';
import type {TemplateCollection,LayoutId} from './template-collections';
import type {ColorRole} from './design-system-schema';
import {templateContract,defaultTemplateCount,DEFAULT_DASHBOARD_ITEMS,type TemplateOptions} from './template-contracts';
import {sampleChart} from './charts';
import {inlineTextLines,inlineTextWidth} from './inline-text-width';
import {templateChartCaption} from './chart-caption';
import {formatChartValue} from './chart-style';
import {resolveGroupLayouts} from './object-layout';
import {templatePageGrid} from './template-page-grid';
import {LEDGER_METRIC_CELLS,LEDGER_METRIC_STYLE,TEMPLATE_STORY_SAMPLES} from './template-story-samples';

const supported=new Set(['cover','summary','evidence','content','annotation','dashboard','category-chart','trend','composition','comparison','workstreams','matrix','hierarchy','case-study','decision','action-plan','appendix','freeform','agenda','insights','team','process','solution','timeline','gallery','table','quote','split','close','before-after','roadmap','metrics','risks']);
export function composeProfessional(c:TemplateCollection,p:TemplatePage,id:LayoutId,d:TemplatePainter,o:TemplateOptions={}):boolean{
  if(!supported.has(id))return false;
  const coverWidths={portfolio:650,review:724,proposal:760,pitch:790,report:574,minimal:650};
  const coverHeading=o.heading??p.heading;
  const wideCover=id==='cover'&&(o.coverVisual==='illustration'
    ? inlineTextLines(coverHeading,64,c.display,724)>3
    : inlineTextWidth(coverHeading,c.system.typography.title.fontSize,c.display)>coverWidths[c.id]*2);
  if(id==='cover'&&!wideCover&&!o.noImage&&!o.coverVisual&&o.density!=='reading')return false;
  const {s,text,shape,rule,label,image,photo,mockup}=d,reading=o.density==='reading';
  const materialDecision=c.id==='proposal'&&id==='decision'&&!o.heading&&!o.body&&!o.items;
  if(materialDecision){
    s.background=c.system.colors.dark;s.backgroundStyle='dark';
    for(const e of s.elements.filter(e=>e.pageElement)){e.fill=c.system.colors.onDark;if(e.design)e.design.fill='onDark';}
  }

  if(id==='quote'){s.background=c.system.colors.background;s.backgroundStyle='background';for(const e of s.elements.filter(e=>e.pageElement?.kind==='page-number')){e.fill=c.system.colors.muted;if(e.design)e.design.fill='muted';}}
  const contract=templateContract(id),n=o.items?.length??o.count??defaultTemplateCount(id);
  if(contract.counts.length&&n>Math.max(...contract.counts)&&!['table','comparison','trend'].includes(id))throw new Error('Use a continuation for this amount of content.');
  const sample=TEMPLATE_STORY_SAMPLES[c.id];
  const heading=o.heading??(id==='decision'?sample.decision.title:p.heading),body=o.body??p.body;
  const fields=o.items??p.fields??p.columns??[];
  const items=Array.from({length:n},(_,i)=>fields[i]??[`Checkpoint ${i+1}`,'Confirm the outcome and record the next decision.'] as [string,string]);
  s.template={prototype:id,variant:o.noImage?'no-image':o.mirror?'image-left':String(n),density:reading?'reading':'presentation'};
  s.transition={effect:'fade',duration:c.id==='proposal'?380:300,easing:'linear'};
  const pageGrid=templatePageGrid(c.id,id);
  const layouts=s.autoLayouts??=[];s.groups??=[];
  const flow=(name:string,es:SlideElement[],x:number,y:number,w:number,h:number,gap=16,parent?:string)=>{
    const group=uid('flow');s.groups!.push({id:group,name,...(parent?{parent,layoutItem:{widthMode:'fill' as const,heightMode:'fixed' as const}}:{})});
    for(const e of es){e.group=group;e.textSizing='auto-height';e.layoutItem={widthMode:'fill',heightMode:'fixed',basisFontSize:e.fontSize};}
    layouts.push({id:group,name,direction:'vertical',gap,padding:{top:0,right:0,bottom:0,left:0},align:'start',justify:'start',columns:1,x,y,w,h,textFitHeight:h,widthMode:'fixed',heightMode:'hug',order:es.map(e=>e.id)});return group;
  };
  const t=(v:string,x:number,y:number,w:number,size=28,color:ColorRole='ink')=>text(v,x,y,w,Math.ceil(size*1.4),'body',size,color,{lineHeight:1.3});
  const title=(value=heading,x=84,y=138,w=1276,h=134,size=c.id==='proposal'?68:60)=>{
    if(o.body&&id==='summary'){flow('Summary context',[t(o.body,84,454,506,26,'muted')],84,454,506,232,0);}
    else if(id==='decision')return flow('Page title',[text(value,x,y,w,h,materialDecision?'body':'heading',materialDecision?34:size,materialDecision?'onDark':'ink')],x,y,w,h,0);
    else if(o.body&&!['cover','split','quote','freeform'].includes(id)){flow('Page title',[text(value,84,138,800,134,'heading',52,'ink')],84,138,800,134,0);flow('Page introduction',[t(o.body,924,138,436,24,'muted')],924,138,436,134,0);return;}
    return flow('Page title',[text(value,x,y,w,h,'heading',size,'ink')],x,y,w,h,0);
  };
  const note=(v='Illustrative Atlas example · Replace values, period and source',y=710)=>text(v,84,y,1196,32,'caption',21,'muted',{textSizing:'auto-height'});
  const stage=(build:()=>unknown,order:number)=>{const start=s.elements.length;build();for(const e of s.elements.slice(start))e.animation={effect:'fade',duration:240,delay:0,order,trigger:'click',easing:'linear'};};
  const grid=(name:string,values:[string,string][],kind:'parallel'|'steps'|'metrics'='parallel')=>{
    const start=s.elements.length;
    if(kind!=='metrics'&&values.length>=4&&values.some(([a,b])=>a.length>24||b.length>70)){
      s.template!.variant=`list-${values.length}`;
      const h=396/values.length;values.forEach(([a,b],i)=>stage(()=>{const y=300+i*h;rule(84,y,1276);label(String(i+1).padStart(2,'0'),84,y+16,90,'accent');flow(`Insight ${i+1}`,[t(a,220,y+14,292,30)],220,y+14,292,h-18,0);flow(`Insight explanation ${i+1}`,[t(b,552,y+14,808,26,'muted')],552,y+14,808,h-18,0);},i));return;
    }
    const count=values.length,cols=count===4?2:Math.min(count,3),rows=Math.ceil(count/cols),gap=pageGrid.layout.gutter,x=84,y=kind==='metrics'?286:310,w=1276,h=kind==='metrics'?412:382,cellW=(w-(cols-1)*gap)/cols,cellH=(h-(rows-1)*32)/rows;
    const parent=uid('flow');s.groups!.push({id:parent,name});const children:string[]=[];
    values.forEach(([a,b],i)=>stage(()=>{const px=x+i%cols*(cellW+gap),py=y+Math.floor(i/cols)*(cellH+32);rule(px,py,cellW);
      const [value,...context]=b.split(/[\n\t]/);
      const es=kind==='metrics'?[t(a,px,py+16,cellW,26,'muted'),text(value,px,py+60,cellW,80,'heading',rows>1?56:76,'accent'),...(context.length?[t(context.join('\n'),px,py+142,cellW,24,'muted')]:[])]:[text(String(i+1).padStart(2,'0'),px,py+16,cellW,64,'heading',rows>1?36:64,'accent'),t(a,px,py+82,cellW,rows>1?30:36),t(b,px,py+136,cellW,reading?26:28,'muted')];
      children.push(flow(kind==='parallel'?`Insight ${i+1}`:`${name} ${i+1}`,es,px,py+16,cellW,cellH-16,rows>1?10:22,parent));
    },i));
    layouts.push({id:parent,name,direction:'grid',columns:3,adaptiveColumns:true,gridSizing:'equal',gap,lineGap:32,padding:{top:0,right:0,bottom:0,left:0},align:'start',justify:'start',x,y:y+16,w,h:h-16,widthMode:'fixed',heightMode:'fixed',order:children});
    if(kind==='metrics')for(const e of s.elements.slice(start))if(e.animation)e.animation={...e.animation,trigger:'auto',order:1,duration:260,withTransition:false};
  };
  const nativeTable=(cells:string[][],y=286,h=412,box={x:84,w:1276})=>{
    const e=element('table',{name:'Editable detail table',...box,y,h,fontFamily:c.body,fontSize:reading?26:28,lineHeight:1.2,fill:c.system.colors.ink,stroke:c.system.colors.line,cells,tableFit:{minimumFontSize:24,padding:8},tableStyle:{preset:'editorial',headerRow:true,borders:'rows',padding:8,verticalAlign:'middle',numericAlign:true},design:{text:'body',textScale:(reading?26:28)/30,fill:'ink',stroke:'line',overrides:['lineHeight']}});s.elements.push(e);return e;
  };
  const fullChart=(type:'bar'|'line'|'donut',labels:string[],values:number[],suffix='')=>{
    const chart:NonNullable<SlideElement['chart']>=o.chart?{...o.chart,adaptive:true}:{...sampleChart(),type,adaptive:true,colorRoles:['accent','ink','muted','line','surface'],labels,series:[{name:type==='line'?'Actual':'Example',values}],legend:type==='donut',showValues:type!=='line',grid:type==='line',suffix,colors:[c.system.colors.accent,c.system.colors.ink,c.system.colors.muted,c.system.colors.line,c.system.colors.surface],textColor:c.system.colors.ink,source:'Illustrative values · Replace with your own data and source'};
    if(o.chart&&o.chartTheme!=='local'){chart.textColor=c.system.colors.ink;chart.colorRoles=['accent','ink','muted','line','surface'];chart.colors=chart.colorRoles.map(role=>c.system.colors[role]);}
    if(['trend','composition','category-chart'].includes(id))chart.sourceDisplay='caption';
    const e=element('chart',{name:p.name,x:84,y:284,w:1276,h:404,fontFamily:c.body,fontSize:26,fill:o.chartTheme==='local'?chart.colors[0]:c.system.colors.accent,stroke:o.chartTheme==='local'?chart.textColor:c.system.colors.ink,chart,design:{text:'body',textScale:26/30,...(o.chartTheme==='local'?{}:{fill:'accent',stroke:'ink'})}});s.elements.push(e);return e;
  };
  if(id==='cover'&&o.coverVisual==='illustration'&&!o.noImage&&!wideCover){
    s.template.variant='illustrated';
    flow('Cover introduction',[text(heading,84,220,724,280,'title',64),t(body,84,520,724,30,'muted')],84,220,724,440,30);
    image('work-03-usability-test',880,230,480,360,'contain');rule(84,710,1276);
  }else if(id==='close'){
    s.background=c.system.colors.dark;s.backgroundStyle='dark';
    flow('Closing takeaway',[text(heading,84,210,1150,244,'title',84,'onDark'),...(o.body?[text(o.body,84,490,1150,150,'body',32,'onDark')]:[])],84,210,1150,460,44);
    for(const e of s.elements.filter(e=>e.pageElement)){e.fill=c.system.colors.onDark;if(e.design)e.design.fill='onDark';}
  }else if(id==='cover'&&!wideCover&&!o.noImage){
    flow('Cover introduction',[text(heading,84,176,1040,306,'title',76)],84,176,1040,306,0);
    flow('Cover context',[t(body,84,526,870,32,'muted')],84,526,870,166,0);
    photo(1050,506,310,180,c.id==='minimal'?'minimal-orbit':c.id==='proposal'?'material':c.id==='pitch'?'glass':c.id==='report'?'ledger-folio':'paper');
    rule(84,710,1276);label('Author / team · Date',84,728,1000);
  }else if(id==='cover'){
    s.template.variant=o.noImage?'no-image':'long-title';
    const titleBox=pageGrid.full,contextBox=o.noImage?titleBox:pageGrid.span(0,8),art=pageGrid.span(9,3);
    flow('Cover introduction',[text(heading,titleBox.x,132,titleBox.w,322,'title',76)],titleBox.x,132,titleBox.w,322,0);
    if(body)flow('Cover context',[t(body,contextBox.x,502,contextBox.w,32,'muted')],contextBox.x,502,contextBox.w,174,0);
    if(!o.noImage){
      const artwork={portfolio:'paper',review:'work-05-review',proposal:'material',pitch:'glass',report:'ledger-folio',minimal:'minimal-orbit'};
      const key=o.coverVisual==='illustration'?'work-03-usability-test':artwork[c.id];
      image(key,art.x,490,art.w,186,key.startsWith('work-')?'contain':'cover');
    }
    rule(titleBox.x,710,titleBox.w);
    label('Author / team · Date',titleBox.x,728,titleBox.w);
  }else if(id==='summary'){
    title(heading,84,164,506,248,72);
    items.forEach(([a,b],i)=>{const y=164+i*(504/n);rule(684,y,676);flow(`Takeaway ${i+1}`,[label(a,684,y+18,676,'accent'),t(b,684,y+66,676,32)],684,y+18,676,504/n-32,18);});
  }else if(id==='agenda'){
    title(heading,84,138,1276,134,60);
    const h=404/n;items.forEach(([a,b],i)=>{const y=286+i*h;rule(84,y,1276);label(String(i+1).padStart(2,'0'),84,y+8,90,'accent');flow(`Chapter ${i+1}`,[t(a,220,y+2,280,30)],220,y+2,280,h-4,0);flow(`Contents ${i+1}`,[t(b,540,y+2,820,n>4?26:30,'muted')],540,y+2,820,h-4,0);});
  }else if(['insights','team','process','solution','roadmap'].includes(id)){
    title();grid(['process','solution'].includes(id)?'Step':'Insight',items,['process','solution'].includes(id)?'steps':'parallel');
    if(id==='roadmap')note('Priorities · Use Action plan for owners, dates and acceptance criteria');
  }else if(id==='metrics'){
    title();const e=fullChart('bar',['Previous','Current'],[42,68],'%');Object.assign(e,{x:524,y:286,w:836,h:412});e.chart!.sourceDisplay='caption';
    const chart=e.chart!,series=chart.series[0],last=series.values.length-1,value=(index:number)=>formatChartValue(chart,series.values[index]);
    flow('Primary result',[text(value(last),84,316,392,128,'heading',88,'accent'),t(series.name,84,470,392,30),t(`${chart.labels[0]}: ${value(0)}\n${chart.labels[last]}: ${value(last)}`,84,562,392,24,'muted')],84,316,392,370,24);
    note(chart.source||'Add source, population and reporting period').name='Chart context';
  }else if(id==='risks'){
    title();const h=404/items.length;
    items.forEach(([a,b],i)=>{const y=290+i*h;rule(84,y,1276);flow(`Risk ${i+1}`,[t(a,84,y+18,302,32)],84,y+18,302,h-28,0);flow(`Risk response ${i+1}`,[t(b,460,y+18,900,28,'muted')],460,y+18,900,h-28,0);});
    note(o.source??'Confirm mitigation, ownership and review dates');
  }else if(id==='dashboard'){
    const metrics=o.items??((o.count===undefined?sample.dashboard:undefined)??DEFAULT_DASHBOARD_ITEMS).slice(0,o.count??4);
    title(o.heading??(metrics.length===4?'Four signals from the quarter':'Performance signals at a glance'));grid('Metric',metrics,'metrics');note(o.items?'Add the source, population and reporting period':'Illustrative values · Update the context and source');
  }else if(id==='content'||id==='appendix'||id==='case-study'||id==='decision'||id==='action-plan'){
    title();
    if(id==='action-plan')nativeTable(o.cells??[['Action','Owner','Due','Done when'],['Test dispatch flow','Research','Oct 20','All priority tasks completed'],['Verify handoff','Engineering','Oct 27','No blocking issues remain'],['Review pilot data','Product','Nov 03','Baseline and target compared'],...(o.count&&o.count>3?Array.from({length:o.count-3},(_,i)=>[`Follow-up ${i+1}`,'Product',`Nov ${10+i*7}`,'Decision recorded']):[])],284,412);
    else if(id==='decision'){
      const paragraph=Boolean(o.body&&o.body.length>100);
      const color=materialDecision?'onDark':'ink',detailColor=materialDecision?'onDark':'muted';
      const leadY=materialDecision?245:310,leadSize=materialDecision?76:paragraph?30:54;
      flow('Decision recommendation',[text(o.body??sample.decision.lead,84,leadY,502,180,paragraph?'body':'heading',leadSize,color),
        ...(!o.body?[t(sample.decision.context,84,526,502,27,detailColor)]:[])],84,leadY,502,690-leadY,30);
      const reasons=o.items??sample.decision.points,h=396/reasons.length;
      reasons.forEach(([a,b],i)=>{
        const y=308+i*h;
        rule(686,y,674,materialDecision?'muted':'line');
        flow(`Decision reason ${i+1}`,[t(a,686,y+18,674,28,color),t(b,686,y+62,674,26,detailColor)],686,y+18,674,h-10,10);
      });
    }else{
      const values=o.items??(id==='case-study'?sample.caseStudy.slice(0,o.count??4):id==='appendix'?(o.items??[['Method','Compare the same tasks, cohort and time period. This example uses synthetic data.'],['Definition','Completion means a task reached the agreed final state within the pilot period.'],['References','Atlas sample research plan; pilot measurement sheet; release decision log.']]):items);
      const h=406/values.length;values.forEach(([a,b],i)=>stage(()=>{const y=288+i*h;rule(84,y,1276);label(String(i+1).padStart(2,'0'),84,y+18,90,'accent');flow(`Point label ${i+1}`,[t(a,220,y+16,280,30)],220,y+16,280,h-20,0);flow(`Point explanation ${i+1}`,[t(b,540,y+16,820,reading?26:28,'muted')],540,y+16,820,h-20,0);},i));
    }
    if(id!=='decision'||o.source)note(o.source??(id==='appendix'?'Sources are example internal records':'Illustrative example · Replace content and evidence'));
  }else if(id==='timeline'){
    title(o.heading??'From discovery to the pilot');
    if(n<=4){items.forEach(([a,b],i)=>stage(()=>{const w=(1276-40*(n-1))/n,x=84+i*(w+40);rule(x,388,w);flow(`Milestone ${i+1}`,[label(o.dates?.[i]??new Date(Date.UTC(2026,9,6+((o.itemOffset??0)+i)*14)).toLocaleDateString('en-US',{month:'short',day:'2-digit',timeZone:'UTC'}),x,318,w,'accent'),t(a,x,440,w,34),t(b,x,510,w,27,'muted')],x,318,w,370,42);},i));}
    else{items.forEach(([a,b],i)=>stage(()=>{const y=290+i*56;rule(84,y+48,1276);label(o.dates?.[i]??new Date(Date.UTC(2026,9,6+((o.itemOffset??0)+i)*14)).toLocaleDateString('en-US',{month:'short',day:'2-digit',timeZone:'UTC'}),84,y+8,170,'accent');flow(`Milestone ${i+1}`,[t(a,290,y,360,30)],290,y,360,48,0);flow(`Milestone output ${i+1}`,[t(b,700,y,660,26,'muted')],700,y,660,48,0);},i));}
    note('Dated milestones · Spacing shows sequence, not proportional time');
  }else if(id==='table'||id==='comparison'){
    title();
    const direction: string[][]=[
      ['Criterion','Warm editorial','Neutral system'],
      ['Material','Tactile paper and warm color','Smooth stock and gray'],
      ['Typography','Serif headlines with quiet body text','One sans-serif family'],
      ['Best use','Identity and editorial applications','Functional reference pages'],
      ['Recommendation','Test on cover and detail page','Keep as a control'],
    ];
    const cells=o.cells??(id==='comparison'&&c.id==='proposal'&&o.count===undefined?direction:id==='comparison'?[['Criterion','Focused pilot','Broad release',...(o.count===3?['Wait']:[])],['Audience value','Task flow tested','Broader access',...(o.count===3?['Unchanged']:[])],['Effort','2 weeks','6 weeks',...(o.count===3?['No delivery']:[])],['Risk','Limited cohort','More dependencies',...(o.count===3?['Delayed learning']:[])],['Recommendation','Proceed','Revisit after pilot',...(o.count===3?['Not recommended']:[])]]:[['Workstream','Owner','Progress','Deadline','Decision'],...Array.from({length:o.count??4},(_,i)=>[['Dispatch flow','Handoff clarity','Pilot learning','Release readiness','Training','Reporting','Support','Follow-up'][i%8],['Design','Product','Research','Engineering'][i%4],i===2?'Needs review':'On track',`Oct ${10+i*2}`,'Review milestone'])]);
    if(id==='table'&&c.id==='report'&&o.cells)s.template.variant='full-width-data';
    const rendered=nativeTable(cells,286,412);
    if(o.cells===LEDGER_METRIC_CELLS)rendered.tableStyle=LEDGER_METRIC_STYLE;
    note(o.source??(id==='comparison'?(c.id==='proposal'&&o.count===undefined?'Example direction study · Compare both at the same size':'Recommendation: focused pilot · Compare the same criteria'):'Illustrative status report · Q3 2026 · Internal sample records'));
  }else if(id==='category-chart'){
    title(o.heading??'Completion across eight pilot tasks');
    const e=fullChart('bar',['Decision review','Evidence intake','Cross-team handoff','Access validation','Release readiness','Reporting','Incident review','Partner onboarding'].slice(0,o.count??8),[42,53,68,61,74,82,79,91].slice(0,o.count??8),'%');
    if(!o.body&&!o.heading)Object.assign(e,{y:238,h:450});
    note(templateChartCaption(e.chart!,id)).name='Chart context';
  }else if(id==='trend'){
    const trend=sample.trend;
    title(o.heading??trend.title);
    const e=fullChart('line',trend.labels,trend.values,'%');
    if(c.id==='pitch'&&!o.chart&&!o.heading&&!o.body){
      Object.assign(e,{y:252,h:436});
      e.chart!.showValues=true;
      e.chart!.dataLabels={position:'outside',fontSize:24};
    }
    if(!o.chart){
      e.chart!.series=[{name:trend.series,values:trend.values}];
      e.chart!.forecastFrom=trend.forecastFrom;
      if((o.count??1)>1)e.chart!.series.push({name:'Comparison group',values:trend.values.map(value=>Math.max(0,value-9))});
      if(o.count===3)e.chart!.series.push({name:'Target',values:trend.values.map(()=>80)});
      e.chart!.legend=e.chart!.series.length>1;
    }
    note(templateChartCaption(e.chart!,id)).name='Chart context';
  }else if(id==='composition'){
    title(o.heading??'How the pilot budget is allocated');const parts=o.count??4,values=parts===2?[35,65]:parts===3?[30,35,35]:parts===4?[20,30,35,15]:[20,30,35,10,5];const e=fullChart('donut',['Research','Design','Delivery','Support','Measurement'].slice(0,parts),values,'%');if(!o.chart)e.chart!.series[0].name='Pilot budget';note(templateChartCaption(e.chart!,id)).name='Chart context';
  }else if(id==='workstreams'){
    title(o.heading??'Three teams, one coordinated release');const periods=['Oct','Nov','Dec','Jan'],rows=o.count??3,x=420,w=940,cell=w/4;
    periods.forEach((v,i)=>label(v,x+i*cell,284,cell,'accent'));
    for(let i=0;i<rows;i++)stage(()=>{const y=346+i*82;rule(84,y-18,1276);label(['Research','Design','Engineering','Enablement'][i],84,y+10,290);for(let j=0;j<4;j++)shape(x+j*cell,y-12,1,70,'line',{name:'Period guide'});const offset=i===0?0:i===1?1:2,span=i===0?1:i===1?2:2;
      shape(x+offset*cell,y-8,cell*span-16,66,'surface',{name:'Workstream activity'});flow(`Workstream ${i+1}`,[t(['Validate tasks','Refine and test','Pilot and release','Train the team'][i],x+offset*cell+16,y+6,cell*span-48,28)],x+offset*cell+16,y+6,cell*span-48,44,0);
    },i);note('Dependency: validated tasks → design approval → pilot release');
  }else if(id==='matrix'){
    title(o.heading??'Prioritize impact against delivery effort');const x=270,y=310,w=990,h=326;
    rule(x,y+h/2,w);shape(x+w/2,y,1,h,'line',{name:'Effort midpoint'});shape(x,y,w,h,'surface',{opacity:.35,name:'Priority field'});
    label('HIGH IMPACT',84,308,170,'accent');label('LOW IMPACT',84,586,170);label('LOW EFFORT',270,658,350);label('HIGH EFFORT',1010,658,350);
    const labels=['Task clarity','Visible handoff','Fast search','Pilot measures','Training','Custom reports','Bulk actions','Integrations'];
    Array.from({length:o.count??6},(_,i)=>{const px=x+[60,330,560,750,90,390,570,760][i],py=y+[36,90,40,120,216,238,218,248][i];shape(px,py,10,10,'accent',{type:'ellipse',name:labels[i]});flow(`Priority ${i+1}`,[t(labels[i],px+20,py-12,190,24)],px+20,py-12,190,46,0);});note('Impact: user task benefit · Effort: estimated delivery work');
  }else if(id==='hierarchy'){
    title(o.heading??'Ownership across the delivery system');const count=o.count??7;
    const node=(v:string,x:number,y:number,w=300)=>{shape(x,y,w,78,'surface',{name:v});flow(v,[t(v,x+20,y+18,w-40,28)],x+20,y+18,w-40,48,0);};
    node('Pilot outcome',570,286);shape(720,364,1,48,'line');rule(270,412,900);
    ['Research','Design','Delivery'].forEach((v,i)=>{shape(270+i*450,412,1,30,'line');node(v,120+i*450,442);});
    const leaves=['Task evidence','Flow decisions','Release gates','Pilot metrics'],parents=[270,720,1170,1170],leafCount=Math.max(0,count-4);for(let i=0;i<leafCount;i++){const x=leafCount<=3?120+i*450:84+i*340,w=leafCount<=3?300:264,cx=x+w/2;shape(parents[i],520,1,38,'line');rule(Math.min(cx,parents[i]),558,Math.max(1,Math.abs(cx-parents[i])));shape(cx,558,1,38,'line');node(leaves[i],x,596,w);}note('Parent → team → deliverable · Editable two- and three-level structure');
  }else if(id==='evidence'){
    title(o.heading??(c.id==='report'?'The result, in context':'Inspect the workflow evidence'));
    if(c.id==='report')fullChart('line',['May','Jun','Jul','Aug','Sep','Oct'],[32,38,42,54,62,68],'%');
    else if(c.id==='review')nativeTable(o.cells??[['Task','Observation','Interpretation','Decision'],['Find a task','Several competing lists','Context is fragmented','Test one focused list'],['Choose next action','Owner unclear','Handoff adds delay','Show the next owner'],['Complete the task','Outcome not visible','Progress is ambiguous','Confirm the result']]);
    else mockup(84,286,896,400);
    if(c.id!=='report')note(o.source??'Illustrative editable evidence structure · Replace with verified observations');
  }else if(id==='annotation'){
    title(o.heading??(c.id==='minimal'?'Look closer at the fold':'Keep context, ownership and evidence together'));
    const left=pageGrid.span(0,5),right=pageGrid.span(6,6);
    if(c.id==='minimal'&&!o.items&&!o.body){
      const artwork=pageGrid.span(0,8), detail=pageGrid.span(8,4);
      const study=image('minimal-fold',artwork.x,284,artwork.w,402,'cover');
      Object.assign(study,{fit:'crop',imageSize:{w:1536,h:1024},imagePosition:{x:.49,y:.31},imageZoom:1.46});
      const criteria=[['Contour','Follow the outer edge as the plane turns.'],['Shadow','The dark edge separates the two planes.'],['Space','The empty field makes the fold legible.']];
      criteria.forEach(([name,meaning],i)=>{
        const y=284+i*140;
        rule(detail.x,y,detail.w);
        flow(`Form detail ${i+1}`,[text(name,detail.x,y+18,detail.w,38,'body',32,'ink',{fontWeight:600,lineHeight:1.25}),
          t(meaning,detail.x,y+62,detail.w,26,'muted')],detail.x,y+18,detail.w,100,10);
      });
      note('Detail study · Fold',710);
      return true;
    }
    const start=s.elements.length;mockup(left.x,286,left.w,318);
    const full=s.elements.slice(start),group=full[0].group;
    const owner=full.find(e=>e.text==='Review the design');if(owner){owner.text='Owner: Maya · Due: Oct 20';owner.name='Handoff owner and date';}
    text('Evidence: pilot task record',left.x+27,484,left.w-60,32,'body',20,'muted',{group,textSizing:'fixed',name:'Evidence link'});
    const values=o.items??[['Task context','The active task stays visible.'],['Named owner','A person and a review date define the handoff.'],['Linked evidence','The recommendation retains its source.'],['Next action','Continue after checking the decision.']].slice(0,o.count??3) as [string,string][];
    const targets=[[left.x+left.w+24,383],[left.x+left.w+24,436],[left.x+left.w+24,484],[left.x+left.w+24,528]];const offset=o.itemOffset??0;
    values.forEach(([a,b],i)=>stage(()=>{const y=286+i*414/values.length;shape(right.x-56,y+4,32,32,'accent',{type:'ellipse',name:`Callout ${i+1}`});text(String(offset+i+1),right.x-54,y+5,28,30,'caption',22,'background',{align:'center',textSizing:'fixed'});flow(`Callout ${i+1}`,[t(a,right.x,y,right.w,26),t(b,right.x,y+42,right.w,24,'muted')],right.x,y,right.w,414/values.length-10,8);rule(left.x+left.w,targets[(offset+i)%4][1]+14,24);shape(targets[(offset+i)%4][0],targets[(offset+i)%4][1],28,28,'accent',{type:'ellipse',name:`Full view marker ${i+1}`});text(String(offset+i+1),targets[(offset+i)%4][0]+2,targets[(offset+i)%4][1]+1,24,26,'caption',19,'background',{align:'center',textSizing:'fixed'});},i));
    label('EVIDENCE / ENLARGED DETAIL',left.x,620,left.w,'accent');shape(left.x,658,left.w,48,'surface',{name:'Separate enlarged evidence detail'});text('Evidence: pilot task record',left.x+20,659,left.w-40,48,'body',30,'ink',{textSizing:'fixed'});
    note('Illustrative editable interface · Full view retained; detail is separate');
  }else if(id==='gallery'){
    title(o.heading??(c.id==='report'?'Report folio and material studies':c.id==='pitch'?heading:'Studies in light, form and rhythm'));
    const keys=c.id==='report'?['ledger-folio','ledger-binding','ledger-closed','ledger-leaf']:c.id==='minimal'?['minimal-fold','minimal-balance','minimal-void','minimal-orbit']:c.id==='proposal'?['material','paper','monograph-material','report-relief']:['coast','paper','report-relief','material'];
    items.forEach(([a,b],i)=>{
      const caption=o.items?a:c.id==='pitch'?['Entry','Core task','Feedback','Result'][i]:c.id==='report'?['Open folio','Binding detail','Closed edition','Turned leaf'][i]:['Light and color','Form and balance','Space and rhythm','Surface and detail'][i];
      const detail=o.items?b:c.id==='report'?'AI print and material concept · Decorative study':c.id==='pitch'?b:['AI concept study of light and color.','AI concept study of form and visual weight.','AI concept study of rhythm and negative space.','AI concept study of texture and detail.'][i];
      const paired=n===1||n===4;
      const cellW=n===1?780:n===4?622:(1276-32*(n-1))/n;
      const x=84+(n===4?i%2*(cellW+32):n===1?0:i*(cellW+32)),y=n===4?286+Math.floor(i/2)*212:286;
      const frameW=n===4?288:n===2?438:cellW,h=n===1?408:n===4?192:292;
      const imageW=o.imageShape==='portrait'?h*.75:frameW,imageX=x+(n===2?cellW:frameW)/2-imageW/2;
      const artworkIndex=(o.itemOffset??0)+i;
      if(c.id==='pitch')mockup(imageX,y,imageW,h,artworkIndex===0?'before':artworkIndex===1?'after':'result');
      else image(keys[artworkIndex%4],imageX,y,imageW,h,o.imageFit??(reading||n===1||n===4?'contain':'cover'));
      const cx=paired?(n===1?924:x+332):x,cy=paired?y+24:y+h+16,cw=paired?(n===1?436:290):cellW,ch=paired?h-40:112;
      if(paired)rule(cx,y,cw);
      flow(`Visual caption ${i+1}`,[t(caption,cx,cy,cw,n===1?36:26),t(detail,cx,cy+62,cw,n===1?28:24,'muted')],cx,cy,cw,ch,paired?24:10);
    });
    if(c.id!=='pitch')note('Project-owned AI concept studies · Visual direction and material, not task evidence',724);
  }else if(id==='split'){
    if(o.noImage){title(heading,84,160,1276,178,76);flow('Text-only explanation',[t(body,84,390,1020,reading?30:38)],84,390,1020,296,0);}
    else{const tx=o.mirror?776:84,ix=o.mirror?84:744;title(heading,tx,160,584,216,68);flow('Visual explanation',[t(body,tx,446,584,30,'muted')],tx,446,584,240,0);
      if(c.id==='report'){const e=fullChart('bar',['Previous','Current'],[42,68],'%');Object.assign(e,{x:ix,y:160,w:616,h:486});}
      else if(c.id==='review')nativeTable([['Task','Observation'],['Find a task','Competing lists obscure the next step.'],['Hand off work','The next owner needs to be visible.'],['Complete work','The outcome should be confirmed.']],160,486,{x:ix,w:616});
      else if(['portfolio','pitch'].includes(c.id))mockup(ix,160,616,486);
      else photo(ix,160,616,486,c.id==='minimal'?'minimal-balance':'material');
      flow('Visual source',[t(['minimal','proposal'].includes(c.id)?'AI concept study · Atmosphere and composition':'Editable sample · Replace with verified evidence',ix,668,616,21,'muted')],ix,668,616,36,0);}
  }else if(id==='before-after'){
    title();mockup(84,292,616,258,'before');mockup(744,292,616,258,'after');label('BEFORE',84,566,616);label('AFTER',744,566,616,'accent');
    [['Task focus','One task replaces competing choices.'],['Handoff','The next owner is explicit.'],['Evidence','Use matched tasks and cohorts.']].slice(0,o.count??3).forEach(([a,b],i)=>{const x=84+i*432;flow(`Change ${i+1}`,[t(a,x,620,392,28),t(b,x,662,392,24,'muted')],x,620,392,98,10);});
  }else if(id==='quote'){
    const value=o.heading??p.heading;
    if(reading){title('A voice from the pilot',84,138,1276,130,60);flow('Reading quotation',[t(value,84,312,924,36),t(o.body??'Atlas sample participant · Synthetic quotation, Oct 2026',84,634,924,25,'muted')],84,312,924,388,28);rule(1084,312,276);flow('Quotation context',[t('Context',1084,340,276,28),t('A matched-task interview after the pilot session.',1084,408,276,26,'muted')],1084,340,276,290,28);}
    else flow('Audience quotation',[text(value,84,196,1276,390,'heading',72),t(o.body??(p.body||'Source · Speaker, role and context'),84,634,1276,28,'muted')],84,196,1276,512,42);
  }else if(id==='freeform'){
    if(!o.noImage)title(o.heading??'A flexible foundation');note('Source and context');
    if(!o.noImage)flow('Content foundation',[t(o.body??'Use this themed space for a special diagram, external evidence or supporting material.',84,316,1040,32,'muted')],84,316,1040,380,0);
  }
  s.notes=`${p.purpose}. ${contract.capacity}. ${contract.fallback} ${o.items||o.chart||o.cells||o.body?'Review supplied content and retain verified data and media sources.':'Illustrative Atlas example; no real research or commercial results are claimed. Images are project-owned AI material.'} ${n} items. Next reveals a complete point; Previous reverses it.`;
  for(const [i,e] of s.elements.entries()){const chrome=e.y<110||e.y>=736;e.motionMatch=chrome?'off':'auto';e.motionKey=chrome?undefined:`template:${c.id}:${id}:${i}`;}
  if(c.id==='portfolio'&&['split','evidence','before-after'].includes(id)){
    const box=s.elements.find(e=>e.name==='Updated sample interface');if(box?.group){const groups=new Set([box.group]),keys=new Map<string,number>();for(let n=0;n<8;n++)for(const g of s.groups??[])if(g.parent&&groups.has(g.parent))groups.add(g.id);for(const e of s.elements.filter(e=>e.group&&groups.has(e.group)&&e.type!=='line').sort((a,b)=>a.y-b.y||a.x-b.x)){const key=`workspace-${e.type}-${e.name}`,n=keys.get(key)??0;keys.set(key,n+1);e.motionKey=`template:portfolio:${key}:${n}`;e.motionMatch='auto';}if(id==='before-after')s.transition={effect:'smart',duration:560,easing:'cinematic'};}
  }
  if(c.id==='report'&&id==='dashboard'){
    const value=s.elements.find(e=>e.type==='text'&&e.text==='68%');if(value){value.motionKey='template:report:current-result:0';value.motionMatch='auto';s.transition={effect:'smart',duration:560,easing:'cinematic'};}
  }
  const headline=s.elements.find(e=>e.type==='text'&&e.fontSize>=56&&e.y<280);if(headline)headline.animation={effect:'fade',duration:260,delay:0,order:0,trigger:'auto',easing:'linear',withTransition:true};
  Object.assign(s,resolveGroupLayouts(s));return true;
}
