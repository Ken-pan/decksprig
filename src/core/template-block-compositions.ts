import type {TemplateCollection,LayoutId} from './template-collections';
import type {TemplatePage} from './template-blueprints';
import type {TemplatePainter} from './template-compositions';
import {templateBlockId} from './template-block-map';
import {createDeckBlock,defaultBlockOptions,placeDeckBlock,blockFingerprint} from './deck-blocks';
import {DEFAULT_DASHBOARD_ITEMS,defaultTemplateCount,templateContract,type TemplateOptions} from './template-contracts';
import {uid} from './model';
import {resolveGroupLayouts} from './object-layout';
import {templatePageGrid} from './template-page-grid';
import {TEMPLATE_STORY_SAMPLES} from './template-story-samples';

/** Manual insertion and template pages share the same native layout and style contract. */
export function composeTemplateBlock(c:TemplateCollection,p:TemplatePage,id:LayoutId,d:TemplatePainter,o:TemplateOptions={}):boolean {
  const kind=templateBlockId(id);if(!kind||o.structure==='designed')return false;
  const page={width:1440,height:810,designSystem:c.system},options=defaultBlockOptions(kind),contract=templateContract(id);
  const count=o.items?.length??o.count??defaultTemplateCount(id);
  const fields=o.items??(id==='dashboard'?(o.count===undefined?TEMPLATE_STORY_SAMPLES[c.id].dashboard:undefined)??DEFAULT_DASHBOARD_ITEMS:p.fields??p.columns);
  const seeded=kind==='architecture'||['gantt','kanban','swot','funnel'].includes(id);
  let items=Array.from({length:count},(_,index)=>{
    const seed=options.items[index%options.items.length],field=seeded&&!o.items?undefined:fields?.[index];
    return {...seed,...(field?{label:field[0],detail:field[1]}:{})};
  });
  if(id==='hierarchy'&&!o.items){const nodes=['Pilot outcome','Research','Design','Delivery','Task evidence','Flow decisions','Release gates','Pilot metrics'];items=Array.from({length:count},(_,i)=>({label:nodes[i]??`Deliverable ${i+1}`,detail:i===0?'Shared delivery outcome':i<4?'Responsible team':'Evidence and acceptance',meta:'',...(i>0?{parent:i<4?0:i===4?1:i===5?2:3}:{})}));}
  if(id==='hierarchy'&&o.items)items=items.map((item,i)=>({...item,parent:i===0?-1:i<4?0:1+(i-4)%Math.min(3,count-1)}));
  if(id==='dashboard')items=items.map((item,i)=>{const [value,...context]=(fields?.[i]?.[1]??item.detail).split(/[\n\t]/);return {...item,meta:value,detail:context.join('\n')};});
  if(kind==='agenda')items=items.map((item,i)=>({...item,meta:o.dates?.[i]??String((o.itemOffset??0)+i+1).padStart(2,'0')}));
  if(kind==='timeline')items=items.map((item,i)=>({...item,meta:o.dates?.[i]??new Date(Date.UTC(2026,9,6+((o.itemOffset??0)+i)*14)).toLocaleDateString('en-US',{month:'short',day:'2-digit',timeZone:'UTC'})}));
  if(id==='workstreams'){options.periods=4;options.periodLabels=['Q1','Q2','Q3','Q4'];items=items.map((item,i)=>({label:o.items?.[i]?.[0]??['Research','Product design','Delivery','Measurement'][i],detail:o.items?.[i]?.[1]??['Research · Scope confirmed','Design · Prototype reviewed','Engineering · Release gates','Product · Matched cohort'][i],meta:o.dates?.[i]??`${Math.min(4,i+1)}–${Math.min(4,i+2)}`}));}
  else if(kind==='gantt')items=items.map((item,i)=>({...item,meta:o.dates?.[i]??item.meta}));
  else if(['roadmap','funnel'].includes(kind))items=items.map((item,i)=>({...item,meta:o.dates?.[i]??item.meta}));
  const layout=id==='team'?'grid':id==='hierarchy'?'auto':kind==='process'&&(o.density==='reading'||count>4||items.some(i=>i.label.length>30||i.detail.length>90)||count===4&&items.some(i=>i.label.length>24||i.detail.length>55))?'vertical':kind==='timeline'&&count>4?'vertical':'auto';
  const tone=['portfolio','report','minimal'].includes(c.id)?'plain':c.id==='proposal'?'outline':'surface';
  Object.assign(options,{title:'',items,layout,tone,showTitle:false,stagger:id==='process'&&c.id==='portfolio'&&!Object.keys(o).length,density:o.density==='reading'||items.some(i=>i.detail.length>80||[...i.detail].filter(c=>/[\u2e80-\uffff]/.test(c)).length>25)?'compact':'comfortable',...o.block});
  const {s,text}=d;s.groups??=[];s.autoLayouts??=[];
  const heading=o.heading??p.heading,body=o.body??p.body;
  const title=text(heading,84,138,body?800:1276,134,'heading',c.id==='proposal'?64:58,'ink',{textSizing:'auto-height',clipText:false}),titleGroup=uid('flow');
  title.animation={effect:'fade',trigger:'auto',delay:0,duration:300,order:0,easing:'linear'};
  title.group=titleGroup;title.layoutItem={widthMode:'fill',heightMode:'fixed',basisFontSize:title.fontSize};s.groups.push({id:titleGroup,name:'Page title'});
  s.autoLayouts.push({id:titleGroup,name:'Page title',direction:'vertical',gap:0,padding:{top:0,right:0,bottom:0,left:0},align:'start',justify:'start',columns:1,x:84,y:138,w:body?800:1276,h:134,textFitHeight:134,widthMode:'fixed',heightMode:'hug',order:[title.id]});
  if(body){const e=text(body,924,138,436,134,'body',24,'muted',{textSizing:'auto-height'}),g=uid('flow');e.group=g;e.layoutItem={widthMode:'fill',heightMode:'fixed',basisFontSize:24};s.groups.push({id:g,name:'Page introduction'});s.autoLayouts.push({id:g,name:'Page introduction',direction:'vertical',gap:0,padding:{top:0,right:0,bottom:0,left:0},align:'start',justify:'start',columns:1,x:924,y:138,w:436,h:134,textFitHeight:134,widthMode:'fixed',heightMode:'hug',order:[e.id]});}
  const reading=templatePageGrid(c.id,id);
  const frame={...reading.full,y:282,h:426},block=createDeckBlock(kind,options,page,s,frame),placed=placeDeckBlock(block,frame,s.id);
  if(block.fitIssues.length)throw new Error(`${block.fitIssues[0]} Choose Reading density or continue on another slide.`);
  for(const op of placed.operations){if(op.op==='set_group')s.groups.push(op.group);else if(op.op==='add_element')s.elements.push(op.element);}
  const group=s.groups.find(g=>g.id===placed.groupId)!;
  title.animation={effect:'fade',duration:260,delay:0,order:0,trigger:'auto',easing:'linear',withTransition:true};
  const staged=['process','solution','timeline'].includes(id);
  for(const e of s.elements.filter(e=>e.group===placed.groupId)){e.motionMatch='off';if(staged&&e.blockItem!==undefined)e.animation={effect:'fade',duration:240,delay:0,order:e.blockItem,trigger:'click',easing:'linear'};}

  group.block!.fingerprint=blockFingerprint(s.elements.filter(e=>e.group===placed.groupId));
  const source=o.source??(id==='dashboard'?'Illustrative example · Update values, context and source':kind==='timeline'?'Dated milestones · Spacing shows sequence, not proportional time':kind==='funnel'?'Illustrative values · Stage widths do not represent numeric proportions':kind==='gantt'?'Planned periods · Confirm owners, dates and dependencies':'Editable example · Replace with your project content');
  text(source,84,716,1196,32,'caption',20,'muted',{textSizing:'auto-height'});
  s.template={prototype:id,variant:`block-${kind}-${options.layout}`,density:o.density??'presentation',collection:c.id};
  s.transition={effect:'fade',duration:300,easing:'linear'};
  s.notes=`${p.purpose}. ${contract.capacity}. ${contract.fallback} Native ${kind} block; use Edit block to change layout, content and appearance. ${o.items||o.dates?'Review supplied values, sources and assumptions before presenting.':'All values are illustrative.'}`;
  Object.assign(s,resolveGroupLayouts(s));return true;
}
