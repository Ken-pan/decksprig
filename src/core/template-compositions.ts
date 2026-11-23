import type {ColorRole,TextRole} from './design-system-schema';
import type {Slide,SlideElement} from './model';
import type {TemplateCollection,LayoutId} from './template-collections';
import type {TemplatePage} from './template-blueprints';
import {templatePageGrid} from './template-grid-metrics';
import {LEDGER_METRIC_CELLS,LEDGER_METRIC_STYLE} from './template-story-samples';

type Text=(value:string,x:number,y:number,w:number,h:number,role?:TextRole,size?:number,color?:ColorRole,extra?:Partial<SlideElement>)=>SlideElement;
type Shape=(x:number,y:number,w:number,h:number,color?:ColorRole,extra?:Partial<SlideElement>)=>SlideElement;
export interface TemplatePainter {
  s:Slide;text:Text;shape:Shape;
  label:(value:string,x:number,y:number,w?:number,color?:ColorRole,extra?:Partial<SlideElement>)=>SlideElement;
  rule:(x:number,y:number,w:number,color?:ColorRole,group?:string)=>unknown;
  photo:(x:number,y:number,w:number,h:number,key?:string)=>SlideElement;
  spot:(key:string,x:number,y:number,size?:number)=>SlideElement;
  image:(key:string,x:number,y:number,w:number,h:number,fit?:'cover'|'contain',opacity?:number)=>SlideElement;
  mockup:(x:number,y:number,w:number,h:number,variant?:'before'|'after'|'result')=>SlideElement;
  table:(cells:string[][],x?:number,y?:number,w?:number,h?:number)=>SlideElement;
  chart:(labels:string[],values:number[],type?:'column'|'bar'|'line'|'area',box?:{x:number;y:number;w:number;h:number},compare?:boolean)=>unknown;
}

/** The page's reader task determines its composition, rather than one shared grid. */
export function composeInterior(c:TemplateCollection,p:TemplatePage,id:LayoutId,d:TemplatePainter):boolean {
  const {s,text,shape,label,rule,photo,spot,image,mockup,table,chart}=d;
  const heading=(value=p.heading,x=80,y=138,w=1280,size=64,color:ColorRole='ink')=>text(value,x,y,w,180,'heading',size,color);
  const body=(value:string,x:number,y:number,w:number,size=30,color:ColorRole='muted')=>text(value,x,y,w,Math.max(1,Math.min(220,736-y)),'body',size,color);
  const note=(value:string,x=84,y=710,w=1196,color:ColorRole='muted')=>text(value,x,y,w,44,'caption',22,color);
  const number=(value:string,x:number,y:number,size=80,color:ColorRole='accent')=>text(value,x,y,240,140,'heading',size,color);
  const fields=p.fields??[];const steps=p.columns??[];
  if(c.id==='portfolio'){
    if(id==='facts'){
      heading('The project\nat a glance.',80,162,740,80);body(p.body,84,410,632,34);
      label('ROLE / TIME / OUTPUT',84,676,650);rule(84,650,632);
      fields.forEach(([a,b],i)=>{const y=166+i*164;rule(858,y,502);label(a.toUpperCase(),858,y+24,502);body(b,858,y+73,492,36,'ink');});
    }else if(id==='statement'){
      label('THE DESIGN CHALLENGE',84,174,1120,'onDark');heading('Make the next\nstep obvious.',76,278,1170,110,'onDark');
      rule(84,600,1276,'onDark');body(p.body,84,642,1010,30,'onDark');
    }else if(id==='split'){
      heading(p.heading,80,146,480,66);
      body('Observe the task before showing your answer.',84,342,470,34);
      rule(84,488,470);label('RESEARCH METHOD',84,520,470);
      body('Record the friction, its consequence, and what your design must change.',84,574,470,29);
      const rows=[['01','Where they stopped','They went back to search to resume the task.'],['02','What it cost','The same task had to be found twice.'],['03','What changed','The new entry kept the active task visible.']];
      rows.forEach(([i,title,detail],index)=>{
        const y=164+index*158;
        rule(656,y,704);label(i,656,y+28,72,'accent');
        text(title,752,y+24,608,56,'heading',40);
        body(detail,752,y+88,608,28);
      });
      note('Illustrative observation log · Add your research source',656,684,704);
    }else if(id==='before-after'){
      heading('A clearer path\nforward.',80,130,1120,68);
      [84,742].forEach((x,i)=>{label(i?'AFTER / PROPOSED':'BEFORE / CURRENT',x,306,614);mockup(x,358,614,306,i?'after':'before');body(i?'What improved, and how you know.':'What made the original difficult.',x,688,606,27);});
    }else if(id==='process'){
      heading('From questions\nto decisions.',80,126,1000,68);
      steps.forEach(([a,b],i)=>{
        const x=84+i*432,y=350+i*60,group=`decision-${s.id}-${i}`;
        (s.groups??=[]).push({id:group,name:a});rule(x,y,392,'line',group);
        number(`0${i+1}`,x,y+24,74).group=group;
        const mark=spot(['spot-01-search','spot-07-compare','spot-22-test'][i],x+280,y+16,112);
        if(mark.group)(s.groups??=[]).push({id:mark.group,name:'Decision illustration',parent:group});
        body(a,x,y+128,392,36,'ink').group=group;body(b,x,y+190,392,27).group=group;
      });
    }else if(id==='evidence'){
      heading('The work,\nin detail.',80,192,420,72);body('Give the finished work\nroom to be read.',84,460,340,30);
      mockup(500,116,940,354);
      const detail=templatePageGrid(c.id,id).span(4,8);
      rule(detail.x,510,detail.w);
      label('COMPLETED HANDOFF',detail.x,534,detail.w,'accent');
      text('Review scheduled',detail.x,577,detail.w,62,'heading',50);
      body('Owner confirmed. The source stays attached to the task.',detail.x,648,detail.w,28);
      note('Illustrative product state · Replace with your completed work',detail.x,710,detail.w);
    }else if(id==='close'){
      label('WHAT I LEARNED',84,160,720,'onDark');
      heading(p.heading,76,224,760,88,'onDark');
      body(p.body,84,540,686,32,'onDark');
      const contact=templatePageGrid(c.id,id).span(8,4);
      rule(contact.x,220,contact.w,'onDark');
      label('CONTACT',contact.x,254,contact.w,'onDark');
      body('Your name',contact.x,312,contact.w,42,'onDark');
      body('Email or portfolio URL',contact.x,398,contact.w,28,'onDark');
    }else return false;
  }else if(c.id==='review'){
    if(id==='facts'){
      heading('What we’re\nsolving.',80,154,684,80);body(p.body,84,426,614,32);
      shape(778,116,662,620,'surface',{name:'Scope column'});
      fields.forEach(([a,b],i)=>{const y=156+i*176;label(`0${i+1} / ${a.toUpperCase()}`,828,y,532);body(b,828,y+58,514,38,'ink');if(i<2)rule(828,y+136,532);});
    }else if(id==='split'){
      heading('What the evidence\ntells us.',80,132,1200,62);
      table([['Task','Observation'],['Find next task','Competing lists slow the choice'],['Review evidence','Source needs to stay visible'],['Hand off work','A named owner clarifies action']],84,340,550,338);note('Synthetic observation record · Replace with your research',84,697,550);
      ['One observation.','What it means for the design.','Which decision it informs.'].forEach((v,i)=>{const y=322+i*128;rule(744,y,616);label(['OBSERVATION','MEANING','DECISION'][i],744,y+18,616);body(v,744,y+60,600,31,'ink');});
    }else if(id==='process'){
      heading();steps.forEach(([a,b],i)=>{const y=310+i*130;rule(84,y,1276);number(`0${i+1}`,84,y+22,56);body(a,236,y+28,274,36,'ink');body(b,594,y+24,632,27);spot(['spot-01-search','spot-07-compare','spot-22-test'][i],1280,y+20,80);});
    }else if(id==='before-after'){
      heading('What changes\nfor people.',80,126,1120,68);
      [84,742].forEach((x,i)=>{shape(x,306,614,48,i?'ink':'surface',{name:'Comparison header'});label(i?'PROPOSED EXPERIENCE':'CURRENT EXPERIENCE',x+24,313,550,i?'background':'muted');mockup(x,366,614,296,i?'after':'before');body(i?'What improved, and how you know.':'What made the original difficult.',x,692,606,27);});
    }else if(id==='metrics'){
      heading('How we’ll\nmeasure success.',80,146,640,68);number('68%',84,390,132);
      body('Latest completion',84,559,434,32,'ink');body('70% release gate · 2 pp short\n42% baseline',84,632,454,26);
      chart(['Baseline','Latest','Release gate'],[42,68,70],'bar',{x:704,y:190,w:656,h:476},true);note('Example data · Replace before presenting',728,696,632);
    }else if(id==='roadmap'){
      heading();
      steps.forEach(([a,b],i)=>{const y=310+i*134;shape(110,y+48,2,i<2?134:1,'line',{name:'Timeline connector'});number(`0${i+1}`,84,y+18,48);body(a,218,y+18,256,34,'ink');body(b,518,y+20,542,29);text('Owner · Your team\nTiming · Target date',1090,y+20,270,72,'caption',23,'muted');if(i<2)rule(218,y+116,1142);});
    }else if(id==='close'){
      heading('The decision to make.',80,172,1276,88);body(p.body,84,342,1000,34);
      [['CHOICE','Agree the direction'],['OWNER','Who carries it forward?'],['NEXT TEST','What will you validate?']].forEach(([a,b],i)=>{const x=84+i*432;number(`0${i+1}`,x,498,56);label(a,x,578,392);body(b,x,631,392,30,'ink');rule(x,470,392);});
    }else return false;
  }else if(c.id==='proposal'){
    if(id==='statement'){
      photo(1032,116,408,620,'material');label('THE PRINCIPLE',84,174,842,'onDark');heading('A direction rooted\nin what matters.',76,284,926,90,'onDark');body(p.body,84,625,876,29,'onDark');
    }else if(id==='facts'){
      heading();number('01',84,340,128);
      label('OBJECTIVE',368,302,992);body(fields[0][1],368,354,950,46,'ink');rule(368,466,992);
      fields.slice(1).forEach(([a,b],i)=>{const x=368+i*512;label(a.toUpperCase(),x,526,480);body(b,x,590,480,34,'ink');});
    }else if(id==='split'){
      photo(624,116,816,570,'material');heading('Warmth.\nClarity.\nRoom to breathe.',80,150,510,66);body(p.body,84,447,460,28);
      ['surface','accent','ink'].forEach((color,i)=>{shape(84+i*156,650,140,36,color as ColorRole,{name:`Direction color ${i+1}`});text(color.toUpperCase(),84+i*156,704,140,28,'caption',20,'muted');});
      const art=templatePageGrid(c.id,id).span(5,7);
      note('Material study · Illustrative artwork',art.x,704,art.w);
    }else if(id==='quote'){
      photo(0,116,384,620,'paper');heading('“Add an actual quote\nthat supports\nthis direction.”',464,254,866,65);label('WHAT WE HEARD',468,166,828);rule(468,626,892);body('Participant / role',468,672,536,28,'ink');note('Date · Context',1114,676,246);
    }else if(id==='process'){
      heading();rule(84,428,1276,'accent');steps.forEach(([a,b],i)=>{const x=84+i*432;number(`0${i+1}`,x,278,82);body(a,x,374,386,32,'ink');shape(x,422,12,12,'accent',{type:'ellipse',name:'Milestone'});body(b,x,494,386,29);label('PHASE / ADD TIMING',x,659,386);});
    }else if(id==='evidence'){
      photo(0,116,496,582,'paper');heading('One coherent\ndirection.',564,144,788,70);label('TYPE / MESSAGE',568,362,764);heading('A clear point\nof view.',564,410,782,62);
      ['surface','accent','ink'].forEach((color,i)=>{const x=568+i*264;shape(x,634,240,54,color as ColorRole,{name:`Direction color ${i+1}`});label(['BACKGROUND','ACCENT','INK'][i],x,701,240);});note('AI artwork · Replace as needed',84,710,396);
    }else if(id==='close'){
      photo(1048,116,392,336,'material');heading('Let’s align on\nwhat comes next.',76,190,918,90);body(p.body,84,484,900,32);rule(84,590,1276);
      [['DIRECTION','Confirm the choice'],['SCOPE','Agree the deliverables'],['START','Set the first milestone']].forEach(([a,b],i)=>{const x=84+i*432;label(a,x,606,392);body(b,x,654,392,28,'ink');});
    }else return false;
  }else if(c.id==='pitch'){
    if(id==='statement'){
      label('THE CUSTOMER’S PROBLEM',84,174,1100,'onDark');heading('The work is harder\nthan it needs to be.',76,250,1260,88,'onDark');
      ['Find','Choose','Act'].forEach((v,i)=>{const x=84+i*432;rule(x,552,392,'onDark');label(`0${i+1} / ${v.toUpperCase()}`,x,580,392,'onDark');});body(p.body,84,664,1196,29,'onDark');
    }else if(id==='split'){
      heading('Your next task,\nmade simpler.',80,204,500,61);body(p.body,84,456,440,30);
      mockup(616,146,744,506);note('Sample interface · Replace with your evidence',616,688,744);
    }else if(id==='metrics'){
      heading();number('68%',84,330,132);body('Example adoption metric',84,510,418,31,'ink');
      chart(['Q1','Q2','Q3','Q4'],[29,42,53,68],'area',{x:518,y:244,w:842,h:412});
      rule(84,612,394);body('29% → 68% over four quarters.\nAdd your own data and source.',84,639,394,24);note('Example data · Replace before presenting',542,698,818);
    }else if(id==='before-after'){
      heading('Why choose\nthis approach.',80,126,980,66);table([['Criteria','Current approach','Your product'],['Customer value','Describe the limitation','Describe the benefit'],['Time and effort','What creates friction?','What becomes easier?'],['Reason to choose','What is missing?','What makes it distinct?']],84,344,954,332);
      shape(1080,344,280,332,'surface',{name:'Product distinction'});label('YOUR EDGE',1110,376,220);body('Describe why\nit matters.',1110,454,220,32,'ink');note('Add the evidence that supports the comparison.',84,711,1196);
    }else if(id==='process'){
      heading();
      const positions=[[84,312,588],[772,312,588],[428,526,588]];
      steps.forEach(([a,b],i)=>{const [x,y,w]=positions[i];rule(x,y,w,'accent');label(`0${i+1} / ${a.toUpperCase()}`,x,y+22,w);body(b,x,y+84,w-110,32,'ink');spot(['spot-01-search','spot-21-prototype','spot-04-complete'][i],x+w-88,y+84,88);});
      text('→',672,364,80,72,'body',46,'accent');
    }else if(id==='roadmap'){
      heading();steps.forEach(([a,b],i)=>{const x=84+i*82,y=310+i*122,w=1276-i*164;shape(x,y,w,102,'surface',{name:`Go-to-market stage ${i+1}`});label(`0${i+1} / ${a.toUpperCase()}`,x+24,y+34,258);body(b,x+312,y+25,w-348,32,'ink');});note('Owner · Your team                  Timing · Target date',248,714,980);
    }else if(id==='facts'){
      heading('The people behind\nthe work.',80,128,1220,66);
      fields.forEach(([a,b],i)=>{
        const column=templatePageGrid(c.id,id).span(i*4,4);
        rule(column.x,350,column.w,'line');
        number(String(i+1).padStart(2,'0'),column.x,390,34);
        text(a,column.x,528,column.w,66,'heading',44);
        body(b,column.x,608,column.w,28);
      });
    }else if(id==='close'){
      photo(1050,116,390,620,'glass');heading('Let’s take the\nnext step.',76,176,920,90);body(p.body,84,422,854,30);
      [['ASK','Funding or support needed'],['USE','What it makes possible'],['NEXT','The milestone to reach']].forEach(([a,b],i)=>{const y=526+i*72;label(a,84,y,154);body(b,302,y-3,644,28,'ink');rule(302,y+51,644);});
    }else return false;
  }else if(c.id==='report'){
    if(id==='facts'){
      shape(0,116,656,620,'dark',{name:'Executive finding panel'});heading('The period\nat a glance.',80,172,548,70,'onDark');body(p.body,84,388,484,42,'onDark');text('Report period\nAdd the scope and source.',84,624,484,100,'caption',25,'onDark');
      [['FINDING','What changed?'],['IMPLICATION','Why does it matter?'],['ACTION','What should happen next?']].forEach(([a,b],i)=>{const y=164+i*174;rule(744,y,616);label(a,744,y+28,616);body(b,744,y+88,610,35,'ink');});
    }else if(id==='metrics'){
      heading('Performance\nagainst target.',80,134,620,68);number('68%',84,385,132);body('Example completion rate',84,554,432,30,'ink');body('42% previous period\n70% target · 2 points to close',84,638,466,25);
      chart(['Previous','Current','Target'],[42,68,70],'column',{x:590,y:196,w:770,h:470},true);note('Example data · Replace before presenting',614,696,746);
    }else if(id==='table'){
      heading(p.heading,84,118,1276,64);
      number('68%',84,214,98).name='Current result';
      text('Completion\nthis quarter',84,350,198,100,'caption',24,'muted',{name:'Report result context'});
      const metrics=table(LEDGER_METRIC_CELLS,328,292,1032,382);
      metrics.tableStyle=LEDGER_METRIC_STYLE;
      note('Example data · Replace with your numbers and source.',328,710,952);
    }else if(id==='before-after'){
      heading();['METRIC','PREVIOUS','CURRENT','CHANGE'].forEach((v,i)=>label(v,[84,480,812,1142][i],298,[350,280,280,218][i]));
      [['Completion','42%','68%','+26 pp'],['Response time','9 min','6 min','−3 min'],['Active use','55%','62%','+7 pp']].forEach(([a,b,v,delta],i)=>{const y=364+i*108;rule(84,y-20,1276);body(a,84,y+6,350,31,'muted');text(b,480,y,280,70,'body',46,'ink');text(v,812,y,280,70,'body',46,'ink',{fontWeight:600});text(delta,1142,y+8,218,66,'body',30,'accent');});note('Example data · Compare the same population and period.',84,714,1196);
    }else if(id==='quote'){
      label('THE CONTEXT BEHIND THE RESULT',84,174,1000,'onDark');heading('“Add a real observation\nthat explains the result.”',80,300,1260,70,'onDark');
      rule(84,622,1276,'onDark');body('Source · Team, customer, or study',84,670,854,28,'onDark');note('Date · Context',1090,676,270,'onDark');
    }else if(id==='roadmap'){
      heading('Actions for\nthe next period.',80,180,550,68);body('Set a priority,\nan owner, and a due date.',84,482,446,30);
      ['Choose the priority','Assign the next test','Set the review date'].forEach((v,i)=>{const y=172+i*176;rule(656,y,704);label(`0${i+1} / ACTION`,656,y+20,704);body(v,656,y+66,686,36,'ink');text('Owner · Your team      Due · Target date',656,y+124,686,42,'caption',24,'muted');});
    }else if(id==='close'){
      heading('A clear\nnext decision.',80,198,700,96);body(p.body,84,540,686,34);
      shape(854,116,586,620,'surface',{name:'Decision record'});
      [['DECISION','Agree the priority'],['OWNER','Assign responsibility'],['REVIEW','Set the next review date']].forEach(([a,b],i)=>{const y=176+i*172;label(a,910,y,450);body(b,910,y+58,450,34,'ink');if(i<2)rule(910,y+132,450);});
    }else return false;
  }else return false;
  s.notes=`${p.purpose}. Replace sample copy and data. AI imagery is project-owned decorative artwork, not project evidence. Text, shapes, diagrams, charts and tables remain editable.`;
  return true;
}
