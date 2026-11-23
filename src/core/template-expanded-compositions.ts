import {element,uid,type SlideElement} from './model';
import type {ColorRole} from './design-system-schema';
import type {TemplateCollection,LayoutId} from './template-collections';
import type {TemplatePage} from './template-blueprints';
import type {TemplatePainter} from './template-compositions';

/** Additional reader tasks, authored as native objects and bounded content flows. */
export function composeExpanded(c:TemplateCollection,p:TemplatePage,id:LayoutId,d:TemplatePainter):boolean{
  const {s,text,shape,label,rule,photo,image,table,chart,mockup}=d;
  const minimal=c.id==='minimal',proposal=c.id==='proposal',pitch=c.id==='pitch',report=c.id==='report',review=c.id==='review';
  const dark=id==='section'||id==='statement',ink:ColorRole=dark?'onDark':'ink',muted:ColorRole=dark?'onDark':'muted';
  const headingSize=minimal?64:proposal?72:report?64:62;
  const seed=(e:SlideElement,w:number)=>Math.max(1,e.text.split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil([...line].reduce((n,c)=>n+(/[\u2e80-\uffff]/.test(c)?1:.55),0)*e.fontSize/w)),0)*e.fontSize*e.lineHeight);
  const flow=(name:string,es:SlideElement[],x:number,y:number,w:number,h:number,gap=20)=>{
    const group=uid('flow');(s.groups??=[]).push({id:group,name});
    for(const e of es){e.group=group;e.textSizing='auto-height';e.w=Math.min(e.w,w);e.h=seed(e,e.w);e.layoutItem={widthMode:'fill',heightMode:'fixed',maxWidth:e.w,basisFontSize:e.fontSize};}
    (s.autoLayouts??=[]).push({id:group,name,direction:'vertical',gap,padding:{top:0,right:0,bottom:0,left:0},align:'start',justify:'start',columns:1,x,y,w,h,textFitHeight:h,widthMode:'fixed',heightMode:'hug',order:es.map(e=>e.id)});
    return group;
  };
  const t=(v:string,x:number,y:number,w:number,size=30,color:ColorRole=ink)=>text(v,x,y,w,80,'body',size,color);
  const title=(x=84,y=138,w=1276,h=158,value=p.heading,size=headingSize)=>flow('Page title',[text(value,x,y,w,h,'heading',size,ink)],x,y,w,h,0);
  const pair=(name:string,a:string,b:string,x:number,y:number,w:number,h:number,size=36)=>flow(name,[t(a,x,y,w,size),t(b,x,y,w,27,muted)],x,y,w,h,20);
  const cue=(es:SlideElement[],order:number)=>{for(const e of es)e.animation={effect:'fade',duration:240,delay:0,order,trigger:'click',easing:'linear'};};
  const stage=(build:()=>unknown,order:number)=>{const from=s.elements.length;build();cue(s.elements.slice(from),order);};
  const fields=p.fields??p.columns??[],steps=p.columns??fields;
  const note=(v:string,x=84,y=710,w=1196)=>text(v,x,y,w,34,'caption',21,muted,{textSizing:'auto-height'});

  if(id==='agenda'){
    title(84,164,minimal?540:478,260,p.heading,minimal?72:80);
    pair('Contents introduction','A guide to the conversation.','Use these sections to orient the audience.',84,504,478,174,30);
    fields.forEach(([a,b],i)=>{const x=minimal?744:684,y=164+i*178;rule(x,y,1360-x);label(`0${i+1}`,x,y+25,76,'accent');pair(`Contents ${i+1}`,a,b,x+104,y+24,1256-x,144,42);});
  }else if(id==='section'){
    const n='01';
    flow('Chapter number',[text(n,84,166,360,180,'title',148,'onDark')],84,166,360,210,0);
    flow('Chapter introduction',[text(p.heading,570,268,790,230,'title',minimal?84:92,'onDark'),t(p.body,570,534,670,30,'onDark')],570,268,790,410,60);
    rule(84,710,1276,'onDark');
  }else if(id==='problem'){
    title(84,138,1276,156);
    const lead=fields[0]?.[1]??'Describe the current difficulty.';
    flow('Problem narrative',[text(p.body,84,334,674,170,'heading',minimal?54:58),t(lead,84,536,604,32,'muted')],84,334,674,340,44);
    fields.forEach(([a,b],i)=>{const y=330+i*126;rule(852,y,508);flow(`Problem ${i+1}`,[label(`0${i+1} / ${a.toUpperCase()}`,852,y+20,508,'accent'),t(b,852,y+66,508,30)],852,y+20,508,100,14);});
  }else if(id==='audience'){
    title();
    if(!minimal)shape(84,326,432,366,'surface',{name:'Audience context'});
    flow('Audience focus',[label(c.id==='pitch'?'FIRST CUSTOMER':report?'DATA SCOPE':'AT THE CENTER',minimal?84:112,350,376,'accent'),text(report?'Define the\npopulation.':'Name your\naudience.',minimal?84:112,422,376,170,'heading',56),t('Add the defining context.',minimal?84:112,626,376,25,'muted')],minimal?84:112,350,376,316,32);
    fields.forEach(([a,b],i)=>{const y=330+i*128;rule(600,y,760);flow(`Audience detail ${i+1}`,[label(a.toUpperCase(),600,y+18,218,'accent')],600,y+18,218,98,0);
      // Separate columns preserve the label and long description independently.
      flow(`Audience context ${i+1}`,[t(b,850,y+18,510,30)],850,y+18,510,98,0);
    });
  }else if(id==='insights'){
    title(84,138,1276,154);
    fields.forEach(([a,b],i)=>stage(()=>{const x=84+i*432,y=minimal?354:330+i*42;rule(x,y,392);flow(`Insight ${i+1}`,[text(`0${i+1}`,x,y+28,180,110,'heading',minimal?64:80,'accent'),t(a,x,y+150,392,36),t(b,x,y+222,392,28,'muted')],x,y+28,392,330-i*(minimal?0:42),26);},i));
  }else if(id==='solution'){
    title(84,138,1276,150);
    steps.forEach(([a,b],i)=>stage(()=>{const x=84+i*448,y=346;if(!minimal)shape(x,y,380,348,'surface',{name:`Solution stage ${i+1}`});
      flow(`Solution ${i+1}`,[label(`0${i+1} / ${a.toUpperCase()}`,x+(minimal?0:28),y+30,minimal?380:324,'accent'),text(b,x+(minimal?0:28),y+118,minimal?380:324,210,'heading',minimal?44:46)],x+(minimal?0:28),y+30,minimal?380:324,278,54);
      if(i<2)text('→',x+392,y+144,44,50,'body',32,'muted',{textSizing:'fixed'});
    },i));
  }else if(id==='gallery'){
    title();
    const keys=review?['work-03-usability-test','work-05-review','spot-21-prototype']:proposal?['material','paper','report-relief']:pitch?['glass','paper','coast']:minimal?['minimal-fold','minimal-balance','minimal-void']:report?['ledger-folio','ledger-binding','ledger-closed']:['coast','paper','report-relief'];
    fields.forEach(([a,b],i)=>{const x=84+i*432,y=312+(proposal&&i===1?24:0);
      if(pitch)mockup(x,y,392,248,i===0?'before':'after');
      else if(report)image(keys[i],x,y,392,248,'contain');
      else if(minimal)image(keys[i],x,y,392,248,'cover');
      else image(keys[i],x,y,392,248,review?'contain':'cover');
      flow(`Study caption ${i+1}`,[label(`0${i+1} / ${(pitch?a:report?['Open folio','Binding detail','Closed edition'][i]:review?['Context','Discussion','Iteration'][i]:minimal?a:['Light and color','Form and balance','Space and rhythm'][i]).toUpperCase()}`,x,y+270,392,'accent'),t(pitch?b:report?'AI print and material concept · Decorative study':review?['Illustrative scene for the working context.','Illustrative scene for a team review.','Illustrative concept for iteration.'][i]:minimal?b:['Study lighting, texture and the color relationship.','Compare proportions and visual weight.','Inspect rhythm, contrast and negative space.'][i],x,y+317,392,27,'muted')],x,y+270,392,132,16);
    });
  }else if(id==='timeline'){
    title();rule(84,446,1276);
    steps.forEach(([a,b],i)=>stage(()=>{const x=84+i*336;label(`MILESTONE 0${i+1}`,x,354,268,'accent');s.elements.push(element('ellipse',{x,y:438,w:16,h:16,fill:c.system.colors.accent,design:{fill:'accent'},name:`Milestone ${i+1}`}));pair(`Milestone ${i+1}`,a,b,x,500,268,208,32);},i));
  }else if(id==='team'){
    title();
    fields.forEach(([a,b],i)=>{const x=84+i*432;rule(x,330,392);flow(`Responsibility ${i+1}`,[label(a.toUpperCase(),x,358,392,'accent'),text('Your name',x,435,392,72,'heading',48),t(b,x,550,392,28,'muted'),t('Contact · Your details',x,662,392,23,'muted')],x,358,392,350,minimal?40:34);});
  }else if(id==='risks'){
    title();label('UNCERTAINTY',84,296,302);label('RESPONSE',460,296,590);label('OWNER / CHECK',1136,296,224);
    fields.forEach(([a,b],i)=>{const y=354+i*120;rule(84,y-20,1276);flow(`Risk ${i+1}`,[t(a,84,y,302,34)],84,y,302,96,0);pair(`Response ${i+1}`,b,'Add a mitigation or validation step.',460,y,590,96,27);flow(`Risk owner ${i+1}`,[t('Your team',1136,y,224,27),t('Target date',1136,y+42,224,23,'muted')],1136,y,224,96,10);});
  }else if(id==='summary'){
    title(84,162,minimal?486:480,290,p.heading,minimal?78:82);
    const x=minimal?744:688;
    fields.forEach(([a,b],i)=>{const y=164+i*176;rule(x,y,1360-x);flow(`Takeaway ${i+1}`,[label(`0${i+1} / ${a.toUpperCase()}`,x,y+22,1360-x,'accent'),t(b,x,y+70,1360-x,38)],x,y+22,1360-x,146,22);});
  }else if(id==='q-and-a'){
    flow('Discussion introduction',[text(p.heading,84,188,minimal?1120:1090,254,'title',minimal?92:96),t('Choose a question to start the conversation.',84,466,1000,30,'muted')],84,188,minimal?1120:1090,348,54);
    if(!minimal)label('Q&A',1190,174,170,'accent');
    fields.forEach(([a,b],i)=>{const x=84+i*432;rule(x,580,392);flow(`Discussion question ${i+1}`,[label(a.toUpperCase(),x,607,392,'accent'),t(b,x,656,392,27,'muted')],x,607,392,120,16);});
  }else if(id==='statement'){
    flow('Central message',[label('THE CENTRAL IDEA',84,176,1196,'onDark'),text(p.heading,84,294,1196,244,'title',minimal?110:100,'onDark'),t(p.body,84,644,1040,30,'onDark')],84,176,1196,540,52);
  }else if(id==='facts'){
    title(84,164,520,300,p.heading,80);
    flow('Context introduction',[t(p.body,84,512,478,34,'muted')],84,512,478,188,0);
    fields.forEach(([a,b],i)=>{const y=164+i*176;rule(744,y,616);flow(`Context ${i+1}`,[label(a.toUpperCase(),744,y+22,616,'accent'),t(b,744,y+70,616,38)],744,y+22,616,146,22);});
  }else if(id==='split'){
    title(84,162,478,230,p.heading,68);flow('Evidence explanation',[t(p.body,84,446,478,32,'muted')],84,446,478,250,0);
    if(minimal)photo(688,162,672,468,'minimal-fold');else if(report)chart(['Previous','Current'],[42,68],'bar',{x:688,y:162,w:672,h:468});else mockup(688,162,672,468);
    note(minimal?'Form study · Fold':'Synthetic example · Replace with your own source',688,674,672);
  }else if(id==='before-after'){
    title();
    [84,744].forEach((x,i)=>{label(i?'PROPOSED':'CURRENT',x,318,616,'accent');if(proposal)photo(x,368,616,264,i?'material':'paper');else if(minimal){const group=uid('comparison');(s.groups??=[]).push({id:group,name:i?'Proposed comparison panel':'Current comparison panel'});shape(x,368,616,264,i?'ink':'surface',{group,name:i?'Proposed comparison panel':'Current comparison panel'});text(i?'A clearer outcome.':'The current situation.',x+32,414,552,150,'heading',48,i?'background':'ink',{group});}else mockup(x,368,616,264,i?'after':'before');flow(`Comparison explanation ${i+1}`,[t(i?'Explain the improvement and its evidence.':'Describe the baseline and its context.',x,670,616,27,'muted')],x,670,616,58,0);});
  }else if(id==='process'||id==='roadmap'){
    title();steps.slice(0,3).forEach(([a,b],i)=>stage(()=>{const x=84+i*432;rule(x,330,392);flow(`Stage ${i+1}`,[text(`0${i+1}`,x,364,220,110,'heading',76,'accent'),t(a,x,494,392,38),t(b,x,576,392,28,'muted'),...(id==='roadmap'?[t('Owner · Your team',x,674,392,23,'muted')]:[])],x,364,392,354,24);},i));
  }else if(id==='evidence'){
    title(84,162,420,280,p.heading,72);flow('Evidence context',[t(p.body,84,506,372,30,'muted')],84,506,372,184,0);
    if(review)table([['Task','Observation','Decision'],['Find next task','Competing lists obscure context','Test a focused task list'],['Review a decision','Supporting record is detached','Link each source'],['Hand off work','Responsibility is implicit','Name the owner and date']],548,278,812,388);
    else if(pitch)mockup(548,138,812,528);
    else if(report)chart(['May','Jun','Jul','Aug'],[32,38,42,54],'line',{x:548,y:168,w:812,h:498});
    else photo(548,138,812,528,proposal?'material':minimal?'minimal-void':report?'report-relief':'coast');
    note(pitch?'Sample interface · Replace with your product evidence':report?'Synthetic data · Replace with verified values and source':review?'Synthetic observation record · Replace with verified research':'AI study · Replace with your evidence and source',548,704,812);
  }else if(id==='metrics'){
    title(84,162,464,200,p.heading,66);
    flow('Metric context',[text('68%',84,392,464,146,'title',116,'accent'),t(proposal?'Current completion rate':'Example completion rate',84,562,464,30),t(proposal?'80% target · 12 points to close':p.body,84,624,464,25,'muted')],84,392,464,328,20);
    chart(['Baseline','Current','Target'],[42,68,80],review?'bar':'column',{x:668,y:168,w:692,h:484},proposal);note('Example data · Replace before presenting',668,698,692);
  }else if(id==='table'){
    title();const cells=pitch?[['Measure','Now','Next','Context'],['Revenue','Add value','Add target','Per period'],['Cost','Add value','Add target','Per customer'],['Margin','Add value','Add target','Definition']]:proposal?[['Deliverable','Scope','Effort','Approval'],['Foundation','Type and color','Add estimate','Client'],['Applications','Key touchpoints','Add estimate','Client'],['Handoff','System and files','Add estimate','Lead']]:[['Criterion','Option A','Option B','Decision'],['Audience fit','Add evidence','Add evidence','Add rationale'],['Feasibility','Add evidence','Add evidence','Add rationale'],['Value','Add evidence','Add evidence','Add rationale']];
    table(cells,84,330,1276,328);note(pitch?'Illustrative structure · Add actual financial assumptions':'Add sources, definitions, or notes for this comparison');
  }else if(id==='quote'){
    flow('Audience quotation',[text(p.heading,proposal?464:84,196,proposal?896:1196,324,'title',minimal?72:proposal?76:74),t(p.body||'Source · Name, role, and context',proposal?464:84,610,proposal?896:1196,28,'muted')],proposal?464:84,196,proposal?896:1196,512,82);
    if(proposal)photo(84,164,292,494,'paper');else rule(84,710,1276);
  }else if(id==='close'){
    flow('Closing introduction',[text(p.heading,84,198,950,264,'title',110),t(p.body,84,522,950,32,'muted')],84,198,950,428,58);rule(84,680,1276);note('Your name · Your contact details',84,716,1160);
  }else return false;
  s.notes=`${p.purpose}. Replace illustrative copy and data. Text, diagrams, charts, tables, and content flows remain editable. Artwork is project-owned AI material and is not research or product evidence.`;
  return true;
}
