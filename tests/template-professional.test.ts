import {test} from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {XMLValidator} from 'fast-xml-parser';
import {createTemplatePages,templateDeck} from '../src/core/templates';
import {applyOperations} from '../src/core/operations';
import {buildPptx} from '../src/core/pptx-export';
import {CORE_PROTOTYPES} from '../src/core/template-contracts';
import {sampleChart} from '../src/core/charts';
import {renderChartSvg} from '../src/core/chart-render';
import {fitTableElement} from '../src/core/table-fit';
import {applyDeckDesignSystem} from '../src/core/deck-design-system';
import {textBodyXml} from '../src/core/pptx-fidelity';
import {element} from '../src/core/model';
import {clickOrders} from '../src/core/motion';

test('custom dashboard values and context survive continuations without unrelated example data',()=>{
 const items:[string,string][]=Array.from({length:7},(_,i)=>[`Independent metric ${i+1}`,`${81+i}%\nTarget ${85+i}% · Source cohort ${i+1}`]);
 for(const collection of ['portfolio','review','proposal','pitch','report','minimal']){
  const pages=createTemplatePages('dashboard',1,collection,{heading:'Independent measures',items});
  assert.equal(pages.length,2);
  const text=pages.flatMap(s=>s.elements.filter(e=>e.type==='text').map(e=>e.text));
  for(const [label,body] of items){assert.equal(text.filter(v=>v===label).length,1);for(const part of body.split('\n'))assert.equal(text.filter(v=>v===part).length,1);}
  assert.ok(!text.includes('Completion'));assert.ok(!text.includes('Target 95% · +4 pp · On track'));
  for(const page of pages)assert.deepEqual(clickOrders(page),[]);
 }
 const pasted=createTemplatePages('dashboard',1,'minimal',{items:[['Retention','81%\tTarget 85% · Below target'],['Latency','420 ms\tTarget ≤500 ms · Met target'],['Coverage','92%']]} )[0];
 assert.ok(pasted.elements.some(e=>e.text==='81%'));assert.ok(pasted.elements.some(e=>e.text==='Target 85% · Below target'));
 assert.ok(!pasted.elements.some(e=>e.text==='Target 70% · +26 pp · Below target'));
 const limited=createTemplatePages('dashboard',1,'review',{items:items.slice(0,5),count:3});
 assert.equal(limited.length,2);for(const [label] of items.slice(0,5))assert.equal(limited.flatMap(s=>s.elements).filter(e=>e.text===label).length,1);
});
test('dashboard comparison and dividers appear together with explicit threshold status',()=>{
 for(const collection of ['portfolio','review','proposal','pitch','report','minimal']){
  const s=createTemplatePages('dashboard',1,collection,{count:6})[0];
  assert.deepEqual(clickOrders(s),[]);
  const text=s.elements.filter(e=>e.type==='text').map(e=>e.text);
  assert.ok(text.includes('Target 95% · +4 pp · Below target'));
  assert.ok(text.includes('Target ≤7 min · −3 min · Met target'));
  assert.ok(!text.includes('Four signals from the quarter'));
 }
});
test('a Ledger quotation on the light template keeps its page number readable',()=>{
 for(const density of ['presentation','reading'] as const){const s=createTemplatePages('quote',1,'report',{density,heading:'A complete, attributed observation'})[0],n=s.elements.find(e=>e.pageElement?.kind==='page-number')!;assert.notEqual(n.fill,s.background);assert.equal(n.design?.fill,'muted');}
});

test('professional tasks cover thirty-five reader needs and retain the optional intro and dated continuations',()=>{
 assert.equal(CORE_PROTOTYPES.length,36);
 const items:[string,string][]=Array.from({length:7},(_,i)=>['Gate '+i,'Confirm ownership, comparable evidence and the acceptance criteria before the release.']);
 const dates=items.map((_,i)=>'2026-11-'+String(i+1).padStart(2,'0'));
 const slides=createTemplatePages('timeline',1,'review',{items,dates});assert.ok(slides.length>1);
 for(const date of dates)assert.equal(slides.flatMap(s=>s.elements).filter(e=>e.text===date).length,1);
 const body='Atlas review · 项目决策';const s=createTemplatePages('content',1,'minimal',{body})[0];assert.ok(s.elements.some(e=>e.text===body));
});
test('a native table edit continues complete rows atomically without mutating the original or unrelated pages',()=>{
 const deck=templateDeck('review',{table:{count:4}},true),s=deck.slides.find(s=>s.template?.prototype==='table')!,table=s.elements.find(e=>e.type==='table')!,before=JSON.stringify(deck);
 const cells=[['Region','Completion','Period','Coverage'],...Array.from({length:14},(_,i)=>['Region '+i,'68%','Q3 2026','Comparable sample'])];
 const result=applyOperations(deck,[{op:'update_element',slideId:s.id,elementId:table.id,patch:{cells}}]);
 const tables=result.slides.filter(p=>p.id===s.id||p.notes.includes('Table continuation')).flatMap(p=>p.elements.filter(e=>e.type==='table'));
 assert.deepEqual(tables.flatMap(e=>e.cells!.slice(1)),cells.slice(1));assert.ok(tables.length>1);assert.ok(tables.every(e=>e.cells![0].join('|')===cells[0].join('|')));assert.equal(result.revision,deck.revision+1);assert.equal(JSON.stringify(deck),before);
 const content=(p:any)=>({...p,elements:p.elements.filter((e:any)=>!e.pageElement)});assert.deepEqual(result.slides.filter(p=>deck.slides.some(d=>d.id===p.id&&d.id!==s.id)).map(content),deck.slides.filter(p=>p.id!==s.id).map(content));
});
test('native template export is well-formed, reusable and preserves gaps, forecast styling and common chart range',async()=>{
 const chart={...sampleChart(),type:'line' as const,labels:['Jan','Feb','Mar','Apr'],series:[{name:'Completion',values:[0,-2,42,68]}],forecastFrom:2,source:'Synthetic Atlas QA'};
 const d=templateDeck('minimal');d.slides=[createTemplatePages('trend',1,'minimal',{chart})[0],createTemplatePages('table',2,'minimal',{})[0]];
 const bytes=await buildPptx(d,false,async()=>({w:1440,h:810})),zip=await JSZip.loadAsync(bytes);
 for(const path of Object.keys(zip.files).filter(p=>p.endsWith('.xml')||p.endsWith('.rels'))){const xml=await zip.file(path)!.async('string');assert.equal(XMLValidator.validate(xml),true,path);if(/^ppt\/(slides|slideLayouts)\//.test(path)){const ids=[...xml.matchAll(/<p:cNvPr[^>]* id="(\d+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,path+' unique native object IDs');}}
 const xml=await zip.file('ppt/slides/slide1.xml')!.async('string');assert.match(xml,/<p:ph type="chart"/);assert.match(xml,/<p:timing>/);
 const part=await zip.file('ppt/charts/chart1.xml')!.async('string');assert.match(part,/prstDash val="dash"/);assert.match(part,/<c:v>-2<\/c:v>/);assert.match(part,/<c:v>0<\/c:v>/);assert.doesNotMatch(part,/<c:v><\/c:v>/);assert.match(part,/typeface="\+mn-lt"/);
 const axes=new Set([...part.matchAll(/<c:(?:catAx|valAx|dateAx|serAx)>[\s\S]*?<c:axId val="(\d+)"\s*\/>/g)].map(m=>m[1]));for(const plot of part.matchAll(/<c:lineChart>[\s\S]*?<\/c:lineChart>/g))for(const ref of plot[0].matchAll(/<c:axId val="(\d+)"\s*\/>/g))assert.ok(axes.has(ref[1]),'Native chart axis must exist: '+ref[1]);
 assert.match(part,/<c:lineChart><c:grouping val="standard"\/>/);assert.doesNotMatch(part,/<c:invertIfNegative/);
 const workbook=await JSZip.loadAsync(await zip.file(Object.keys(zip.files).find(p=>p.endsWith('.xlsx'))!)!.async('uint8array'));const sheet=await workbook.file('xl/worksheets/sheet1.xml')!.async('string');assert.doesNotMatch(sheet,/<v>\s*<\/v>/);assert.match(sheet,/<v>-2<\/v>/);assert.match(sheet,/<v>0<\/v>/);
 const table=await zip.file('ppt/slides/slide2.xml')!.async('string');assert.match(table,/<p:ph type="tbl"/);assert.match(table,/schemeClr val="lt2"/);
});


test('five-column replacement removes the stock report result and preserves an explicitly edited result',()=>{
 const d=templateDeck('report',{},true),s=d.slides.find(s=>s.template?.prototype==='table')!,e=s.elements.find(e=>e.type==='table')!,metric=s.elements.find(e=>e.name==='Current result')!;
 const cells=[['Region','Baseline','Current','Period','Source'],...Array.from({length:8},(_,i)=>['Region '+i,'42%','53%','Q3','Matched cohort'])];
 const authored=createTemplatePages('table',1,'report',{cells});
 assert.ok(authored.every(page=>page.template?.variant==='full-width-data'&&page.elements.find(e=>e.type==='table')?.x===84));
 const next=applyOperations(d,[{op:'update_element',slideId:s.id,elementId:e.id,patch:{cells}}]);const first=next.slides.find(p=>p.id===s.id)!;const table=first.elements.find(t=>t.type==='table')!;assert.equal(table.x,84);assert.equal(table.w,1440-first.layout!.margins.left-first.layout!.margins.right);assert.ok(!first.elements.some(t=>t.id===metric.id));assert.equal(next.revision,d.revision+1);
 const custom=applyOperations(d,[{op:'update_element',slideId:s.id,elementId:metric.id,patch:{text:'72%'}}]);const after=applyOperations(custom,[{op:'update_element',slideId:s.id,elementId:e.id,patch:{cells}}]);assert.equal(after.slides.find(p=>p.id===s.id)!.elements.find(t=>t.id===metric.id)!.text,'72%');
});

test('changing chart inputs updates the authored caption while preserving an explicit custom annotation',()=>{
 const d=templateDeck('minimal'),s=createTemplatePages('composition',1,'minimal',{})[0];d.slides=[s];const e=s.elements.find(e=>e.type==='chart')!,cap=s.elements.find(e=>e.name==='Chart context')!;
 const chart={...e.chart!,source:'Matched cohort · 2026',series:[{name:'Hours',values:[20,20,20,20]}]};const next=applyOperations(d,[{op:'update_element',slideId:s.id,elementId:e.id,patch:{chart}}]);assert.match(next.slides[0].elements.find(t=>t.id===cap.id)!.text,/Hours.*80.*Matched cohort/);
 const manual=applyOperations(d,[{op:'update_element',slideId:s.id,elementId:cap.id,patch:{text:'Board-approved allocation note'}}]);const result=applyOperations(manual,[{op:'update_element',slideId:s.id,elementId:e.id,patch:{chart}}]);assert.equal(result.slides[0].elements.find(t=>t.id===cap.id)!.text,'Board-approved allocation note');
});


test('replacement chart data inherits dark-theme label contrast; explicit local colors remain local',()=>{
 const chart={...sampleChart(),textColor:'#202a33'};const inherited=createTemplatePages('trend',1,'pitch',{chart})[0].elements.find(e=>e.type==='chart')!;assert.equal(inherited.chart!.textColor,templateDeck('pitch').designSystem!.colors.ink);
 const local=createTemplatePages('trend',1,'pitch',{chart,chartTheme:'local'})[0].elements.find(e=>e.type==='chart')!;assert.equal(local.chart!.textColor,'#202a33');assert.equal(local.design!.stroke,undefined);assert.deepEqual(chart.colors,sampleChart().colors);
});

test('table fitting survives theme resolution and can grow back after a shorter edit',()=>{
 const d=templateDeck('proposal',{table:{count:4}},true),s=d.slides.find(s=>s.template?.prototype==='table')!,e=s.elements.find(e=>e.type==='table')!;
 const fitted=fitTableElement({...e,h:220},text=>({w:text.w,h:text.fontSize*1.2}));
 assert.ok(fitted.fontSize<e.fontSize);d.slides=[{...s,elements:[fitted]}];
 const styled=applyDeckDesignSystem(d,d.designSystem!).slides[0].elements[0];assert.ok(Math.abs(styled.fontSize-fitted.fontSize)<.001);
 const short=fitTableElement({...styled,cells:[['Short','Header'],['One','Row']]},text=>({w:text.w,h:text.fontSize*1.2}));assert.ok(Math.abs(short.fontSize-e.fontSize)<.001);
});

test('native absolute paragraph leading accommodates larger inline text and explicit spacing',()=>{
 const e=element('text',{fontSize:30,lineHeight:1.4,runs:[{text:'Large\ninline',fontSize:72}],textSizing:'auto-height'});
 assert.match(textBodyXml(e,{absoluteLineSpacing:true}),/<a:spcPts val="7560"\/>/);
 e.paragraphs=[{runs:e.runs!,align:'left',spaceBefore:0,spaceAfter:0,indent:0,firstLineIndent:0,lineSpacing:80}];
 assert.match(textBodyXml(e,{absoluteLineSpacing:true}),/<a:spcPts val="6000"\/>/);
});

test('native click cues initialize hidden content and reveal a complete point with unique timing IDs',async()=>{
 const d=templateDeck('minimal');d.slides=createTemplatePages('insights',1,'minimal',{count:4});
 const z=await JSZip.loadAsync(await buildPptx(d,false,async()=>({w:1440,h:810}))),xml=await z.file('ppt/slides/slide1.xml')!.async('string');
 assert.match(xml,/<p:strVal val="hidden"\/>/);assert.match(xml,/<p:strVal val="visible"\/>/);assert.match(xml,/presetClass="entr"/);
 const ids=[...xml.matchAll(/<p:cTn[^>]* id="(\d+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
});

test('default eight-row category charts label every bar',()=>{
 for(const collection of ['minimal','report']){
  const page=templateDeck(collection).slides.find(slide=>slide.template?.prototype==='category-chart')!;
  const chart=page.elements.find(element=>element.chart)!;
  assert.equal(chart.chart!.labels.length,8);
  const svg=renderChartSvg(chart);
  for(const label of chart.chart!.labels)assert.ok(svg.includes('>'+label+'</text>'),collection+' missing '+label);
 }
});
