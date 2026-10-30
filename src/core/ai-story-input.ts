import {z} from './schema';
import {templateContract} from './template-contracts';
import {ChartSchema} from './chart-schema';
import {StorySchema} from './ai-story';
import {deckDesignSystem} from './deck-design-system';
import type {Deck} from './model';

// The model authors evidence. Native design defaults own chart presentation.
const ChartDataSchema=z.strictObject(z.extend(z.pick(ChartSchema, {type:true,labels:true,series:true,source:true}), {source:z.string().check(z.trim()).check(z.minLength(1)).check(z.maxLength(300)),prefix:z.optional(z.string().check(z.maxLength(12))),suffix:z.optional(z.string().check(z.maxLength(12)))}).shape);
const common=z.extend(z.omit(StorySchema.shape.slides.def.element, {layout:true,chart:true,cells:true,dates:true,points:true,block:true}), {notes:z.optional(z.string().check(z.maxLength(5000))),body:z.optional(z.string().check(z.maxLength(700))).clone().register(z.globalRegistry,{description:'One COMPLETE concise subtitle or recommendation, preferably under 100 characters. Never truncate a sentence to satisfy a length limit. Put longer background in notes.'})});
const plainSlide=z.extend(common, {layout:z.enum(['cover','statement','split','quote','section','close','freeform']),coverResourceId:z.optional(z.string().check(z.maxLength(200))).clone().register(z.globalRegistry,{description:'For an illustrated cover only: choose an exact ID from coverArtwork in the creation context. Omit when no suitable choice exists.'})});
const points=StorySchema.shape.slides.def.element.shape.points.def.innerType.check(z.minLength(1));
const itemSlide=z.extend(common, {layout:z.enum(['content','insights','agenda','team','process','solution','summary','appendix','case-study','columns','closing','risks']),points});
const decisionSlide=z.extend(common, {layout:z.literal('decision'),body:common.shape.body.def.innerType,points:points.check(z.minLength(2))});
const timelineSlide=z.extend(common, {layout:z.literal('timeline'),points:StorySchema.shape.slides.def.element.shape.points.def.innerType,dates:StorySchema.shape.slides.def.element.shape.dates.def.innerType});
const tableSlide=z.extend(common, {layout:z.enum(['table','comparison','action-plan']),cells:StorySchema.shape.slides.def.element.shape.cells.def.innerType});
const chartSlide=z.extend(common, {layout:z.enum(['category-chart','trend','composition','metrics']),chart:ChartDataSchema.clone().register(z.globalRegistry,{description:'Actual data only. trend=line/area; category-chart=bar/column; composition=pie/donut.'})});
const block=StorySchema.shape.slides.def.element.shape.block.def.innerType,node=block.shape.items.def.element;
const treeSlide=z.extend(common, {layout:z.enum(['architecture','hierarchy']),block:z.extend(z.omit(block, {periodLabels:true}), {items:z.array(z.extend(z.omit(node, {meta:true}), {parent:node.shape.parent.def.innerType})).check(z.minLength(2)).check(z.maxLength(8))})});
const scheduleSlide=z.extend(common, {layout:z.enum(['gantt','workstreams']),block:z.extend(block, {items:z.array(z.extend(z.omit(node, {parent:true}), {meta:z.string().check(z.regex(/^\d{1,2}[-–]\d{1,2}$/)).clone().register(z.globalRegistry,{description:'Only an inclusive numeric period range: "1–2", "2–3", or "3–4". Never "Week 1–2" or an owner. Put the owner in detail; actual period names go in periodLabels.'})})).check(z.minLength(1)).check(z.maxLength(6)),periodLabels:block.shape.periodLabels.def.innerType})});
const metricSlide=z.extend(common, {layout:z.enum(['dashboard','funnel','roadmap']),block:z.extend(z.omit(block, {periodLabels:true}), {items:z.array(z.extend(z.omit(node, {parent:true}), {meta:node.shape.meta.def.innerType})).check(z.minLength(1)).check(z.maxLength(6))})});
const boardSlide=z.extend(common, {layout:z.enum(['kanban','swot']),block:z.extend(z.omit(block, {periodLabels:true}), {items:z.array(z.omit(node, {parent:true,meta:true})).check(z.minLength(2)).check(z.maxLength(4))})});
export const CreationStorySchema=z.extend(StorySchema, {slides:z.array(z.union([plainSlide,itemSlide,decisionSlide,timelineSlide,tableSlide,chartSlide,treeSlide,scheduleSlide,metricSlide,boardSlide])).check(z.minLength(2)).check(z.maxLength(12))});

/** A planned page exposes only the fields its native layout can actually use. */
export function creationSlideSchema(layout:string,flexible=false){
 const option=CreationStorySchema.shape.slides.def.element.def.options.find(schema=>schema.shape.layout.safeParse(layout).success);
 if(!option)throw new Error('Choose an authored native layout for this page.');
 let schema:z.ZodMiniObject=z.extend((option as z.ZodMiniObject), {layout:z.literal(layout)});
 // These layouts share authored fields and parallel relationships. The author
 // can adapt composition to actual copy without changing the page's meaning.
 if(flexible&&['content','insights','summary'].includes(layout))schema=z.extend(schema, {layout:z.enum(['content','insights','summary'])});
 if('points' in option.shape){const counts=templateContract(layout).counts;schema=z.extend(schema, {points:option.shape.points.check(z.maxLength(counts.length?Math.max(...counts):5))});}
 return schema;
}

export async function authoredCreationStory(raw:unknown,deck:Deck){
 const value=raw as {slides?:unknown[];collection?:string};
 const system=value?.collection?(await import('./template-collections')).COLLECTIONS.find(c=>c.id===value.collection)?.system??deckDesignSystem(deck):deckDesignSystem(deck);
 return StorySchema.parse({...value,slides:value?.slides?.map(rawSlide=>{
  let slide=rawSlide as {chart?:unknown;layout?:string;source?:string;notes?:string};
  // Covers and several text compositions have no visible source slot. Keep
  // attribution in notes rather than failing the whole story or dropping it.
  if(slide.source&&!['table','comparison','action-plan','appendix','case-study'].includes(slide.layout??'')){
   const {source,...rest}=slide;slide={...rest,notes:[rest.notes,`Source: ${source}`].filter(Boolean).join('\n\n')};
  }
  if(!slide.chart)return slide;
  // Preserve complete charts from existing clients; compact data cannot borrow
  // sample values or require the model to invent colors and rendering settings.
  const full=ChartSchema.safeParse(slide.chart);if(full.success)return {...slide,chart:full.data};
  const data=ChartDataSchema.parse(slide.chart);
  return {...slide,chart:{title:'',subtitle:'',colors:[system.colors.accent,system.colors.ink,system.colors.muted],textColor:system.colors.ink,legend:data.series.length>1,grid:true,showValues:true,stacked:false,categoryTitle:'',valueTitle:'',prefix:'',suffix:'',...data}};
 })});
}
