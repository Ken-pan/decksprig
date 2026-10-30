import {patchSchema} from './patch-schema';
import {z} from './schema';
import {newDeck,type Deck,type Slide,type SlideElement} from './model';
import {applyOperations,type Operation} from './operations';
import {AI_TEMPLATE_LAYOUTS,TemplateContentSchema,StoryCollectionSchema} from './ai-story';
import {deckDesignSystem} from './deck-design-system';
import {formatChartValue} from './chart-style';
import {ChartSchema,validateChart} from './chart-schema';
import {ancestorIds} from './container-tree';
import {TYPE_PROPERTIES} from './design-system-schema';
import {templateSignature} from './template-ownership';
export {templateSignature} from './template-ownership';

export type TemplateContent=z.infer<typeof TemplateContentSchema>;
export const templatePrototype=(layout:string)=>layout==='columns'?'insights':layout==='closing'?'summary':layout;
import {itemLayouts,cellLayouts,chartLayouts,blockLayouts,authoredInputs,authoredRules,authoredBlockOptions,authoredContract} from './ai-template-contract';
export async function templateCatalog(collection?:string,query?:string){
 const {COLLECTIONS,templateLayouts}=await import('./templates');
 if(collection&&!COLLECTIONS.some(c=>c.id===collection))throw new Error('Unknown template collection. List collections first.');
 const layouts=templateLayouts(collection??'review').filter(l=>!query||`${l.id} ${l.name} ${l.description} ${l.contract.task}`.toLowerCase().includes(query.toLowerCase()));
 return {collections:COLLECTIONS.map(({id,name,caption})=>({id,name,caption})),collection:collection??'review',layouts:layouts.map(l=>({...l,contract:authoredContract(l.id),authoredContent:AI_TEMPLATE_LAYOUTS.includes(l.id as any),inputs:authoredInputs(l.id),rules:authoredRules(l.id),...(!AI_TEMPLATE_LAYOUTS.includes(l.id as any)?{limitation:'Requires user evidence or specialized visual placement. Use native object/resource tools; do not substitute sample content.'}:{})})),selectionGuide:'Match the reader task, relationship and evidence. insights=parallel; process=ordered; timeline=dated; comparison=equal criteria; trend=time series; composition=parts of a whole. In prepare_story use points:[{heading,body}] for item layouts, including one point per timeline date. In prepare_template/prepare_template_update use items:[[heading,body]]. cells are only for table/comparison/action-plan; do not put process steps in cells. Never substitute sample evidence. Read live fields before adapting mapped pages. Other native layouts remain editable through read_deck/propose_updates and canonical operations.'};
}
/** Content is authored; composition, fitting, groups and continuations use the manual template factory. */
export async function authoredTemplatePages(deck:Deck,layout:string,collection:string,raw:unknown,index=1,notes=''):Promise<Slide[]>{
 const content=TemplateContentSchema.parse(raw),prototype=templatePrototype(layout);
 if(!AI_TEMPLATE_LAYOUTS.includes(prototype as any))throw new Error('This layout needs specialized evidence. Use list_templates for authored-content layouts, or edit its existing objects with propose_updates.');
 const blockOptions=authoredBlockOptions(prototype,content);
 if(content.items&&!itemLayouts.has(prototype))throw new Error(`Layout ${prototype} cannot retain all supplied content: it does not accept items/points. Use its listed inputs or choose content/insights.`);
 const {createTemplatePages,scaleTemplateSlide,templateLayouts}=await import('./templates'),{styleTemplate}=await import('./template-styles');
 if(!templateLayouts(collection).some(l=>l.id===prototype))throw new Error('Unknown collection or layout. Use list_templates first.');
 if(content.cells&&!cellLayouts.has(prototype))throw new Error('This layout uses points/items, not cells. Keep every authored value in points/items, or choose a table layout.');
 if(content.chart&&!chartLayouts.has(prototype))throw new Error('Choose a chart layout for authored chart data.');
 if(content.dates&&prototype!=='timeline')throw new Error('Choose timeline for authored dates, with one point/item for each date.');
 if(itemLayouts.has(prototype)&&!content.items?.length){if(!content.body?.trim())throw new Error('Provide authored items or body; sample template copy cannot fill a slide.');content.items=[[content.heading,content.body]];delete content.body;}
 if(['insights','team','summary'].includes(prototype)&&content.items!.length<2)throw new Error('This parallel/summary layout needs at least two authored points/items. Use statement for a single takeaway, or supply the complete summary points.');
 if(prototype==='timeline'&&(!content.dates||content.dates.length!==content.items?.length))throw new Error('A timeline needs one actual date and one point/item for every event; dates.length must equal points/items.length. Supply both arrays and keep the dated timeline.');
 if(cellLayouts.has(prototype)&&!content.cells)throw new Error('Provide authored cells including a header row; template sample values are unavailable.');
 if(chartLayouts.has(prototype)){if(!content.chart?.source.trim())throw new Error('Provide real chart values and a source. Use a text layout when evidence is missing.');validateChart(content.chart);if(prototype==='trend'&&!['line','area'].includes(content.chart.type)||prototype==='composition'&&!['pie','donut'].includes(content.chart.type)||prototype==='category-chart'&&!['column','bar'].includes(content.chart.type))throw new Error('Choose a chart type that matches the layout: trend=line/area, composition=pie/donut, category-chart=column/bar.');}
 if(prototype==='quote'&&!content.body?.trim())throw new Error('An actual quote needs attribution in body. Use statement for an unattributed idea.');
 if(prototype==='decision'&&!content.body?.trim())throw new Error('A decision needs the authored recommendation in body and reasons in items.');
 // A sample screenshot cannot stand in for the user's evidence.
 if(prototype==='split')content.noImage=true;
 if(prototype==='freeform')content.noImage=false;
 const fields:[string,string][]=[['heading',content.heading],...(content.body?[['body',content.body] as [string,string]]:[]),...(content.items??[]).flatMap(([a,b],i)=>[[`items.${i}.heading`,a],[`items.${i}.body`,b]] as [string,string][]),...(content.dates??[]).map((value,i)=>[`dates.${i}`,value] as [string,string]),...(content.block?.items??[]).flatMap((item,i)=>(prototype==='dashboard'?['meta','label','detail']:prototype==='roadmap'?['label','meta','detail']:['label','detail','meta']).map(key=>[`block.items.${i}.${key}`,item[key as keyof typeof item]]).filter((pair):pair is [string,string]=>typeof pair[1]==='string'&&Boolean(pair[1]))),...(content.block?.periodLabels??[]).map((v,i)=>[`block.periodLabels.${i}`,v] as [string,string]),...(content.source?[['source',content.source] as [string,string]]:[])];
 const allowed=new Set(fields.map(([,value])=>value));
 if(prototype==='metrics'&&content.chart){const chart=content.chart,series=chart.series[0],last=series.values.length-1;for(const value of [series.name,formatChartValue(chart,series.values[last]),`${chart.labels[0]}: ${formatChartValue(chart,series.values[0])}\n${chart.labels[last]}: ${formatChartValue(chart,series.values[last])}`])allowed.add(value);}
 const pages=createTemplatePages(prototype as any,index,collection,{...content,block:undefined,...blockOptions}).map(page=>{
  page.notes=notes;
  const continuation=page.elements.find(e=>e.type==='text'&&e.text===`${content.heading} · Continued`);if(continuation)allowed.add(continuation.text);
  if(content.source&&!chartLayouts.has(prototype)){const caption=page.elements.find(e=>e.type==='text'&&/Illustrative|Sources are example|Recommendation: focused pilot/.test(e.text));if(caption){caption.text=content.source;caption.name='Source';}}
  if(content.source&&!page.elements.some(e=>e.type==='text'&&e.text===content.source)&&!chartLayouts.has(prototype))page.notes=[page.notes,...(page.notes.includes(`Source: ${content.source}`)?[]:[`Source: ${content.source}`])].filter(Boolean).join('\n\n');
  const remove=page.elements.filter(e=>e.type==='text'&&!allowed.has(e.text)&&!e.pageElement&&!(content.items?.length&&/^\d{1,3}$/.test(e.text)&&Number(e.text)<=content.items.length)&&e.name!=='Chart context');
  if(remove.length)page=applyOperations(newDeck('Authored template',[page]),remove.map(e=>({op:'delete_element' as const,slideId:page.id,elementId:e.id})),0,'manual').slides[0];
  const slots:NonNullable<Slide['template']>['slots']=[],used=new Set<string>();
  for(const [key,value] of fields){if(key.endsWith('.meta')&&['gantt','workstreams'].includes(prototype))continue;const actual=key==='heading'&&continuation?continuation.text:value;if(!actual)continue;const blockIndex=/^block\.items\.(\d+)\./.exec(key);const e=page.elements.find(e=>e.type==='text'&&!e.pageElement&&(!blockIndex||e.blockItem===Number(blockIndex[1]))&&e.text===actual&&!used.has(e.id));if(e){slots.push({key,elementId:e.id});used.add(e.id);if(key==='heading')e.name='Slide heading';}}
  for(const e of page.elements){if(e.type==='table'){if(!content.cells)throw new Error('The template retained sample table data. Choose table with authored cells.');slots.push({key:'cells',elementId:e.id});}if(e.type==='chart'){if(!content.chart)throw new Error('The template retained sample chart data. Supply actual chart data.');slots.push({key:'chart',elementId:e.id});}}
  page.template={...page.template!,slots};return scaleTemplateSlide(page,deck.width,deck.height);
 });
 const styled=styleTemplate(newDeck('Authored templates',pages,deck.width,deck.height),deckDesignSystem(deck),deck).slides;
 const visible=styled.flatMap(p=>p.elements).map(e=>e.type==='table'?e.cells?.flat().join('\n'):e.type==='chart'?JSON.stringify(e.chart):e.text).join('\n');
 for(const [key,value] of fields)if(value&&!(key.endsWith('.meta')&&['gantt','workstreams'].includes(prototype))&&!(key==='source'&&styled.some(p=>p.notes.includes(value)))&&!visible.includes(value))throw new Error(`This layout cannot retain the authored ${key} field: ${JSON.stringify(value.slice(0,180))}. Keep supporting source attribution in notes, or choose a layout with a compatible visible field.`);
 return styled.map(page=>({...page,template:{...page.template!,generated:page.elements.map(e=>({id:e.id,signature:templateSignature(e)})),generatedGroups:(page.groups??[]).map(g=>g.id)}}));
}
export function readTemplate(slide:Slide){
 const content:TemplateContent={heading:'',density:slide.template?.density??'presentation',noImage:slide.template?.variant==='no-image',mirror:slide.template?.variant==='image-left',...(slide.template?.variant==='illustrated'?{coverVisual:'illustration' as const}:{})},items=new Map<number,[string,string]>(),dates=new Map<number,string>();
 const missing:string[]=[];
 const nativeBlock=blockLayouts.has(slide.template?.prototype??'')?slide.groups?.find(g=>g.block)?.block:undefined;
 if(nativeBlock)content.block={items:nativeBlock.options.items.map(i=>({label:i.label,detail:i.detail,...(i.meta?{meta:i.meta}:{}),...(i.parent!==undefined?{parent:i.parent}:{})})),layout:nativeBlock.options.layout,...(['gantt','workstreams'].includes(slide.template!.prototype)?{periodLabels:[...nativeBlock.options.periodLabels]}:{})};
 for(const slot of slide.template?.slots??[]){const e=slide.elements.find(e=>e.id===slot.elementId);if(!e){missing.push(slot.key);continue;}const blockSlot=/^block\.items\.(\d+)\.(label|detail|meta)$/.exec(slot.key);if(blockSlot&&content.block){(content.block.items[Number(blockSlot[1])] as any)[blockSlot[2]]=e.text;continue;}const period=/^block\.periodLabels\.(\d+)$/.exec(slot.key);if(period&&content.block?.periodLabels){content.block.periodLabels[Number(period[1])]=e.text;continue;}const match=/^items\.(\d+)\.(heading|body)$/.exec(slot.key);if(match){const i=Number(match[1]),point=items.get(i)??['',''];point[match[2]==='heading'?0:1]=e.text;items.set(i,point);}else if(slot.key.startsWith('dates.'))dates.set(Number(slot.key.slice(6)),e.text);else if(slot.key==='cells')content.cells=structuredClone(e.cells);else if(slot.key==='chart')content.chart=structuredClone(e.chart);else if(['heading','body','source'].includes(slot.key))(content as any)[slot.key]=e.text;}
 if(items.size)content.items=[...items].sort(([a],[b])=>a-b).map(([,value])=>value);if(dates.size)content.dates=[...dates].sort(([a],[b])=>a-b).map(([,value])=>value);
 return {slideId:slide.id,layout:slide.template?.prototype,collection:slide.template?.collection,content,notes:slide.notes,mapped:Boolean(content.heading),missingSlots:missing,canReflow:Boolean(content.heading&&!slide.source&&!missing.length),guidance:content.heading?'Content reflects current objects, including manual text/data edits. Omitted update fields stay unchanged.':'This older template has no authored slot map. Use read_deck and propose_updates/canonical operations to modify it in place; prepare_template can add a new layout beside it.'};
}
export const TemplateUpdateSchema=z.strictObject({slideId:z.string(),layout:z.optional(z.enum(AI_TEMPLATE_LAYOUTS)),collection:z.optional(StoryCollectionSchema),density:z.optional(z.enum(['presentation','reading'])).clone().register(z.globalRegistry,{description:'Use reading when a reading or denser text layout is requested; changing layout alone preserves the existing density.'}),content:z.optional(z.extend(patchSchema(TemplateContentSchema), {chart:z.optional(patchSchema(ChartSchema)).clone().register(z.globalRegistry,{description:'Patch only requested chart fields. Omitted values, labels, source and display settings stay unchanged in merge mode.'})})),contentMode:z.optional(z.enum(['merge','replace'])),notes:z.optional(z.string().check(z.maxLength(5000)))});
export async function prepareTemplateUpdate(deck:Deck,input:z.infer<typeof TemplateUpdateSchema>){
 const slide=deck.slides.find(s=>s.id===input.slideId);if(!slide)throw new Error('Slide no longer exists.');
 if(input.notes!==undefined&&!input.layout&&!input.collection&&!input.density&&!input.content&&!input.contentMode)return {operations:[{op:'update_slide' as const,slideId:slide.id,patch:{notes:input.notes}}],retainedObjects:slide.elements.length,layout:slide.template?.prototype,collection:slide.template?.collection,preservation:'Only speaker notes change; every object stays intact.'};
 const current=readTemplate(slide);if(!current.canReflow)throw new Error(slide.source?'Keep the imported source intact. Edit its existing objects or prepare a native slide beside it.':current.guidance+' Resolve missing slots with object edits before reflowing.');
 const owned=new Set(slide.template?.generated?.map(e=>e.id)??[]),bound=new Set(slide.template?.slots?.map(s=>s.elementId)??[]),baseline=new Map(slide.template?.generated?.map(e=>[e.id,e.signature]));
 if(slide.elements.some(e=>owned.has(e.id)&&(e.sourceId||e.nativeTextLayout)))throw new Error('Keep imported source objects intact. Edit their existing objects or prepare a native page beside them.');
 if(slide.elements.some(e=>owned.has(e.id)&&e.locked))throw new Error('Unlock template objects before changing the template layout.');
 let retained=slide.elements.filter(e=>e.type==='image'&&input.content?.noImage!==true||!owned.has(e.id)||!bound.has(e.id)&&baseline.get(e.id)!==templateSignature(e));
 const content={...(input.contentMode==='replace'?input.content:{...current.content,...input.content}),...(input.density?{density:input.density}:{})},collection=input.collection??current.collection??deck.templateCollection??'review',layout=input.layout??current.layout!;
 if(content.chart){const chart={...(input.contentMode==='replace'?{}:current.content.chart),...content.chart};if(input.contentMode!=='replace')for(const key of ['visual','numberFormat','axisStyle','dataLabels'] as const)if(input.content?.chart?.[key])Object.assign(chart,{[key]:{...current.content.chart?.[key],...input.content.chart[key]}});content.chart=validateChart(chart);}
 if(!slide.elements.some(e=>e.type==='image'&&owned.has(e.id)))content.noImage=true;
 const pages=await authoredTemplatePages(deck,layout,collection,content,deck.slides.indexOf(slide)+1,input.notes??slide.notes);
 if(pages.length!==1)throw new Error('This content needs continuation slides. Use prepare_template to add them beside the original, or shorten the content before reflowing.');
 const replacement=pages[0],keys=new Map(slide.template!.slots!.map(s=>[s.key,s.elementId]));
 // Page fields are managed by the document. Refreshing their number/visibility
 // is not a custom decoration that should accumulate beside a new template copy.
 const pageFields=new Map<string,SlideElement>();
 for(const e of slide.elements)if(e.pageElement&&!pageFields.has(e.pageElement.kind))pageFields.set(e.pageElement.kind,e);
 retained=retained.filter(e=>!e.pageElement||pageFields.get(e.pageElement.kind)?.id===e.id);
 for(const e of pageFields.values())if(!retained.includes(e))retained.push(e);
 replacement.elements=replacement.elements.filter(e=>!e.pageElement||!pageFields.has(e.pageElement.kind));
 // Reflow chart frames, while keeping the supplied data and existing display
 // settings. A template factory's example title/settings cannot overwrite them.
 if(content.chart)for(const e of replacement.elements)if(e.type==='chart')e.chart=validateChart(content.chart);
 // A family/layout change never authorizes stock artwork on a previously
 // text-only page. Custom images keep their own frames, independent of templates.
 if(!slide.elements.some(e=>e.type==='image'&&owned.has(e.id))){const removed=new Set(replacement.elements.filter(e=>e.type==='image').map(e=>e.id));replacement.elements=replacement.elements.filter(e=>!removed.has(e.id));replacement.autoLayouts=replacement.autoLayouts?.map(l=>({...l,order:l.order.filter(id=>!removed.has(id))})).filter(l=>l.order.length);}
 // Reflow existing native artwork into the new art frame. A template change is
 // not permission to replace a chosen asset or add a second sample illustration.
 const artwork=slide.elements.filter(e=>e.type==='image'&&owned.has(e.id)),reused=new Set<string>(),imageIds=new Map<string,string>(),artGroups=new Map<string,string>();
 for(const [index,next] of replacement.elements.entries())if(next.type==='image'){
  const previous=artwork.find(e=>!reused.has(e.id)&&e.resource?.kind===next.resource?.kind)??artwork.find(e=>!reused.has(e.id));if(!previous)continue;
  reused.add(previous.id);imageIds.set(next.id,previous.id);if(next.group&&previous.group)artGroups.set(next.group,previous.group);replacement.elements[index]={...structuredClone(previous),x:next.x,y:next.y,w:next.w,h:next.h,group:next.group??previous.group,layoutItem:next.layoutItem};
  if(!next.group&&previous.group&&!replacement.groups?.some(g=>g.id===previous.group)){replacement.groups??=[];replacement.groups.push({id:previous.group,name:slide.groups?.find(g=>g.id===previous.group)?.name??'Artwork'});replacement.template!.generatedGroups=[...replacement.template!.generatedGroups??[],previous.group];}
 }
 for(const e of replacement.elements)if(e.group)e.group=artGroups.get(e.group)??e.group;
 for(const g of replacement.groups??[]){g.id=artGroups.get(g.id)??g.id;if(g.parent)g.parent=artGroups.get(g.parent)??g.parent;}
 for(const layout of replacement.autoLayouts??[]){layout.id=artGroups.get(layout.id)??layout.id;layout.order=layout.order.map(id=>imageIds.get(id)??artGroups.get(id)??id);}
 replacement.template!.generatedGroups=replacement.template!.generatedGroups?.map(id=>artGroups.get(id)??id);
 retained=retained.filter(e=>!reused.has(e.id));
 // Local type/color overrides follow their semantic content, without changing the document's theme.
 for(const slot of replacement.template!.slots!){const e=replacement.elements.find(e=>e.id===slot.elementId)!,old=slide.elements.find(e=>e.id===keys.get(slot.key));if(!old)continue;for(const key of old.design?.overrides??[])if(TYPE_PROPERTIES.includes(key))(e as any)[key]=old[key];if(old.design?.overrides?.length&&e.design)e.design.overrides=[...old.design.overrides];if(!old.design?.fill){e.fill=old.fill;if(e.design)delete e.design.fill;}if(!old.design?.stroke){e.stroke=old.stroke;if(e.design)delete e.design.stroke;}if(e.text===old.text){e.runs=structuredClone(old.runs);e.paragraphs=structuredClone(old.paragraphs);e.italic=old.italic;}e.animation=structuredClone(old.animation);e.motionKey=old.motionKey;e.motionMatch=old.motionMatch;}
 replacement.template!.generated=replacement.elements.map(e=>({id:e.id,signature:templateSignature(e)}));
 const protectedGroups=new Set(retained.flatMap(e=>e.group?[e.group,...ancestorIds(slide,e.group)]:[]));
 const removeGroups=(slide.template?.generatedGroups??[]).filter(id=>!protectedGroups.has(id));
 const ops:Operation[]=[];
 for(const groupId of removeGroups)if(slide.autoLayouts?.some(l=>l.id===groupId))ops.push({op:'remove_group_layout',slideId:slide.id,groupId});
 for(const e of slide.elements.filter(e=>!retained.includes(e)))ops.push({op:'delete_element',slideId:slide.id,elementId:e.id});
 for(const groupId of removeGroups.sort((a,b)=>ancestorIds(slide,b).length-ancestorIds(slide,a).length))if(slide.groups?.some(g=>g.id===groupId))ops.push({op:'remove_group',slideId:slide.id,groupId});
 for(const group of replacement.groups??[])ops.push({op:'set_group',slideId:slide.id,group});
 for(const e of replacement.elements)ops.push({op:'add_element',slideId:slide.id,element:e});
 for(const layout of replacement.autoLayouts??[])ops.push({op:'set_group_layout',slideId:slide.id,layout});
 const patch={template:replacement.template,layout:replacement.layout,notes:replacement.notes,...(slide.backgroundStyle?{background:replacement.background,backgroundStyle:replacement.backgroundStyle}:{})};
 ops.push({op:'update_slide',slideId:slide.id,patch});
 return {operations:ops,retainedObjects:retained.length,layout:replacement.template!.prototype,collection,preservation:'Same slide ID, notes, document theme and local type/color overrides. Merge preserves omitted fields; replace intentionally uses only the supplied authored content. Custom objects and modified artwork remain. Review overlap after reflow.'};
}
