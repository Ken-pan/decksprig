import {patchSchema} from './patch-schema';
import {isBlockSizingFrame} from './block-frame';
import {adaptSlideColors} from './slide-colors';
import {selectionMembers} from './selection-transform';
import {z} from './schema';
import { cloneDocumentData } from './document-data';
import { editedTextStyle } from './text-editing';
import { ElementSchema, SlideSchema, DeckSchema, PageElementsSchema, GroupLayoutSchema, GroupSchema, OnlineFontSchema, DocumentFontSchema, validateDeck, assertDeckInvariants, type Deck, type SlideElement } from './model';
import {setSlidePageElements, refreshPageElements} from './page-elements';
import { resolveGroupLayouts, dragLayoutMember, manualLayoutSizing } from './object-layout';
import {slideGroups,descendants,directMembers,selectionRoots,ancestorIds,groupBox} from './container-tree';
import { manualTextSizing, resolveTextElement, browserTextSize, type TextSizeMeasure } from './text-layout';
import { DesignSystemSchema } from './design-system-schema';
import { applyDeckDesignSystem, deckDesignSystem, styleOverrides, styleSlide } from './deck-design-system';
import {continueTable} from './table-fit';
import {adaptTemplateText,adaptTemplateTable} from './template-edit-adaptation';
import {continueChart} from './chart-continuation';
import {templateChartCaption} from './chart-caption';
import {formatChartValue} from './chart-format';
import {isShape} from './shapes';
import {createRevisionValidator} from './document-revision';

const patch = z.extend(patchSchema(z.omit(ElementSchema, {id: true, type: true})), {type:z.optional(ElementSchema.shape.type)});
export const OperationSchema = z.discriminatedUnion('op', [
  z.strictObject({op: z.literal('set_page_elements'), settings: PageElementsSchema, slideIds: z.optional(z.array(z.string()).check(z.minLength(1)).check(z.maxLength(500)))}),
  z.strictObject({op: z.literal('update_element'), slideId: z.string(), elementId: z.string(), patch, unset:z.optional(z.array(z.enum(['crop','resource'])).check(z.maxLength(2)))}),
  z.strictObject({op: z.literal('add_element'), slideId: z.string(), element: ElementSchema}),
  z.strictObject({op: z.literal('delete_element'), slideId: z.string(), elementId: z.string()}),
  z.strictObject({op: z.literal('update_slide'), slideId: z.string(), patch: patchSchema(z.omit(SlideSchema, {id: true, title: true, elements: true, source: true, autoLayouts: true, groups: true}))}),
  z.strictObject({op:z.literal('set_group'),slideId:z.string(),group:GroupSchema}),
  z.strictObject({op:z.literal('remove_group'),slideId:z.string(),groupId:z.string()}),
  z.strictObject({op: z.literal('set_group_layout'), slideId: z.string(), layout: GroupLayoutSchema}),
  z.strictObject({op: z.literal('remove_group_layout'), slideId: z.string(), groupId: z.string()}),
  z.strictObject({op: z.literal('reorder_elements'), slideId: z.string(), ids: z.array(z.string())}),
  z.strictObject({op: z.literal('add_slide'), slide: SlideSchema, afterId: z.optional(z.string()), templateCollection: DeckSchema.shape.templateCollection}),
  z.strictObject({op: z.literal('delete_slide'), slideId: z.string()}),
  z.strictObject({op: z.literal('reorder_slides'), ids: z.array(z.string())}),
  z.strictObject({op: z.literal('rename_deck'), title: z.string().check(z.minLength(1)).check(z.maxLength(300))}),
  z.strictObject({op: z.literal('set_illustration_accent'), color: z.string().check(z.regex(/^#[\da-fA-F]{6}$/))}),
  z.strictObject({op:z.literal('set_design_system'),system:DesignSystemSchema,adopt:z.optional(z.boolean()),templateCollection:DeckSchema.shape.templateCollection}),
  z.strictObject({op: z.literal('register_local_font'), font: DocumentFontSchema}),
  z.strictObject({op: z.literal('register_online_font'), font: OnlineFontSchema}),
]);
export type Operation = z.infer<typeof OperationSchema>;
export const ProposalSchema = z.strictObject({
  baseRevision: z.number().check(z.int()).check(z.minimum(0)), summary: z.string().check(z.maxLength(3000)),
  operations: z.array(OperationSchema).check(z.minLength(1)).check(z.maxLength(1000)),
  reviewWarnings:z.optional(z.array(z.strictObject({slide:z.number().check(z.int()).check(z.minimum(1)).check(z.maximum(3000)),problem:z.string().check(z.maxLength(1000)),evidence:z.string().check(z.maxLength(600))})).check(z.maxLength(30))),
});
export type Proposal = z.infer<typeof ProposalSchema>;
function reorder<T extends {id: string}>(items: T[], ids: string[]): T[] {
  const byId = new Map(items.map(item => [item.id, item]));
  if (ids.length !== items.length || byId.size !== items.length || new Set(ids).size !== ids.length || ids.some(id => !byId.has(id))) throw new Error('Order must contain each existing ID exactly once');
  return ids.map(id => byId.get(id)!);
}
export function applyOperations(deck: Deck, operations: Operation[], baseRevision = deck.revision, actor: 'manual' | 'ai' = 'manual', measure: TextSizeMeasure = browserTextSize): Deck {
  return executeOperations(deck, operations, baseRevision, actor, measure, assertDeckInvariants, validateDeck);
}
/** Editor-owned history shares frozen canonical pages; mutable SDK results stay independent. */
export function applyImmutableOperations(deck: Deck, operations: Operation[], baseRevision = deck.revision, actor: 'manual' | 'ai' = 'manual', measure: TextSizeMeasure = browserTextSize): Deck {
  const validator = createRevisionValidator(deck);
  return executeOperations(validator.base, operations, baseRevision, actor, measure, validator.assert, validator.validate);
}
function executeOperations(deck: Deck, operations: Operation[], baseRevision: number, actor: 'manual' | 'ai', measure: TextSizeMeasure, assert: (deck: Deck) => void, validate: (deck: Deck) => Deck): Deck {
  if (baseRevision !== deck.revision) throw new Error('The document has changed. Generate a new proposal from the current version.');
  // Copy only containers that an operation will modify. The final full-document
  // validator still owns schema/global invariants and returns independent data.
  const next: Deck = {...deck, slides: [...deck.slides]};
  const writable = new Set<Deck['slides'][number]>();
  const pageOnly = new Set<string>();
  function editableSlide(id: string) {
    const index = next.slides.findIndex(s => s.id === id);
    if (index < 0) throw new Error('Slide no longer exists');
    if (!writable.has(next.slides[index])) {
      const slide = next.slides[index];
      next.slides[index] = {...slide, elements: [...slide.elements]}; writable.add(next.slides[index]);
    }
    return next.slides[index];
  }
  const resize = new Set<string>();
  for (const raw of operations) {
    const op = OperationSchema.parse(raw);
    if (op.op === 'set_page_elements') {
      if (op.slideIds?.some(id => !next.slides.some(s => s.id === id))) throw new Error('Slide no longer exists');
      if (actor === 'ai' && next.slides.some(s => (!op.slideIds || op.slideIds.includes(s.id)) && s.elements.some(e => e.pageElement && e.locked))) throw new Error('AI cannot change locked page elements.');
      if (!op.slideIds) next.pageElements = op.settings;
      next.slides = next.slides.map((s, index) => {
        if (op.slideIds && !op.slideIds.includes(s.id)) return s;
        const updated = setSlidePageElements(next, s, op.settings, index);
        if (!op.slideIds) delete updated.pageElements;
        writable.add(updated); pageOnly.add(updated.id); return updated;
      });
      continue;
    }
    if (op.op === 'rename_deck') { next.title = op.title; continue; }
    if (op.op === 'set_design_system') {
      const styled=applyDeckDesignSystem(next,op.system,op.adopt);
      next.designSystem=styled.designSystem;next.slides=styled.slides;
      if(op.templateCollection)next.templateCollection=op.templateCollection;
      for(const slide of next.slides){writable.add(slide);for(const e of slide.elements)if(e.design?.text&&!e.locked)resize.add(e.id);}
      continue;
    }
    if (op.op === 'set_illustration_accent') { next.illustrationAccent = op.color; continue; }
    if (op.op === 'register_local_font') { next.fonts = [...(next.fonts || []).filter(f=>!(f.family===op.font.family&&f.weight===op.font.weight&&f.style===op.font.style)),op.font]; continue; }
    if (op.op === 'register_online_font') {
      next.onlineFonts = [...(next.onlineFonts ?? []).filter(f => f.family !== op.font.family), op.font];
      continue;
    }
    if (op.op === 'reorder_slides') { next.slides = reorder(next.slides, op.ids); continue; }
    if (op.op === 'add_slide') {
      if(op.templateCollection&&!next.templateCollection)next.templateCollection=op.templateCollection;
      if(!op.slide.source&&!op.slide.elements.length&&!op.slide.backgroundStyle)op.slide={...op.slide,backgroundStyle:'background'};
      if(next.designSystem)op.slide=styleSlide(op.slide,next,next.designSystem);
      const pageSettings=op.slide.pageElements??next.pageElements;
      if(pageSettings){const localSettings=op.slide.pageElements;op.slide=setSlidePageElements(next,op.slide,pageSettings,next.slides.length);if(!localSettings)delete op.slide.pageElements;}
      for (const e of op.slide.elements) resize.add(e.id);
      if (next.slides.some(s => s.id === op.slide.id)) throw new Error('Slide ID already exists');
      const after = op.afterId ? next.slides.findIndex(s => s.id === op.afterId) : next.slides.length - 1;
      if (op.afterId && after < 0) throw new Error('Slide no longer exists');
      next.slides.splice(after + 1, 0, op.slide); writable.add(op.slide); continue;
    }
    const slide = editableSlide(op.slideId);
    if(op.op==='set_group'||op.op==='remove_group') {
      const id=op.op==='set_group'?op.group.id:op.groupId,old=slideGroups(slide).find(g=>g.id===id);
      if(descendants(slide,id).some(e=>e.locked))throw new Error('Unlock all group members before changing the group.');
      if(op.op==='set_group') {
        if(op.group.parent&&(op.group.parent===id||ancestorIds(slide,op.group.parent).includes(id)))throw new Error('Groups cannot contain themselves or their ancestors.');
        const group={...op.group};if(!group.parent)delete group.parent;if(!group.layoutItem)delete group.layoutItem;
        slide.groups=[...(slide.groups??[]).filter(g=>g.id!==id),group];
      } else {
        if(!old)throw new Error('Group no longer exists.');
        // A native block's invisible sizing frame is chrome, not standalone artwork.
        // Keep frames that the author has turned into visible or interactive content.
        if(old.block)slide.elements=slide.elements.filter(e=>!(e.group===id&&isBlockSizingFrame(e)));
        const direct=directMembers(slide,id),order=slide.autoLayouts?.find(l=>l.id===id)?.order??direct.map(e=>e.id);
        slide.elements=slide.elements.map(e=>{if(e.group!==id)return e;const v={...e,group:old.parent};delete v.layoutItem;if(!v.group)delete v.group;return v;});
        slide.groups=(slide.groups??[]).filter(g=>g.id!==id).map(g=>{if(g.parent!==id)return g;const v={...g,parent:old.parent};delete v.layoutItem;if(!v.parent)delete v.parent;return v;});
        slide.autoLayouts=slide.autoLayouts?.filter(l=>l.id!==id).map(l=>l.id===old.parent?{...l,order:l.order.flatMap(v=>v===id?order:[v])}:l);
        if(!slide.groups.length)delete slide.groups;if(!slide.autoLayouts?.length)delete slide.autoLayouts;
      }
      continue;
    }
    if (op.op === 'set_group_layout' || op.op === 'remove_group_layout') {
      const groupId = op.op === 'set_group_layout' ? op.layout.id : op.groupId;
      const members = directMembers(slide,groupId);
      if (!members.length) throw new Error('Select a group before editing auto layout.');
      if (descendants(slide,groupId).some(e => e.locked)) throw new Error('Unlock all group members before changing auto layout.');
      if (op.op === 'set_group_layout' && (op.layout.order.length !== members.length || new Set(op.layout.order).size !== members.length || op.layout.order.some(id => !members.some(e => e.id === id)))) throw new Error('Auto layout order must include each group member exactly once.');
      slide.autoLayouts = (slide.autoLayouts ?? []).filter(l => l.id !== groupId);
      if (op.op === 'set_group_layout') slide.autoLayouts.push(op.layout);
      if (!slide.autoLayouts.length) delete slide.autoLayouts;
      if(op.op==='remove_group_layout')slide.groups=slide.groups?.map(g=>{if(g.parent!==groupId||!g.layoutItem)return g;const v={...g};delete v.layoutItem;return v;});
      if(op.op==='remove_group_layout')slide.elements=slide.elements.map(e=>{if(e.group!==groupId||!e.layoutItem)return e;const next={...e};delete next.layoutItem;return next;});
      continue;
    }
    if (op.op === 'delete_slide') {
      if (next.slides.length === 1) throw new Error('Keep at least one slide in the document.');
      if (actor === 'ai' && slide.elements.some(e => e.locked)) throw new Error('AI cannot delete a slide containing locked elements');
      next.slides = next.slides.filter(s => s.id !== op.slideId); continue;
    }
    if (op.op === 'update_slide') {
      if(op.patch.background!==undefined&&op.patch.backgroundStyle===undefined){delete slide.backgroundStyle;slide.elements=slide.elements.filter(e=>!e.designPattern);}
      Object.assign(slide, op.patch);
      if(op.patch.backgroundStyle==='dark')slide.adaptiveColors=true;
      if(op.patch.background!==undefined&&op.patch.backgroundStyle===undefined){
        slide.adaptiveColors=false;
        slide.elements=slide.elements.map(e=>{if(!e.contrastColors)return e;const v={...e};delete v.contrastColors;return v;});
      }
      if(op.patch.backgroundStyle||op.patch.patternStyle!==undefined)Object.assign(slide,styleSlide(slide,next,deckDesignSystem(next)));
      continue;
    }
    if (op.op === 'reorder_elements') { slide.elements = reorder(slide.elements, op.ids); continue; }
    if (op.op === 'add_element') { slide.elements.push(op.element); resize.add(op.element.id); continue; }
    const elementIndex = slide.elements.findIndex(e => e.id === op.elementId);
    if (elementIndex < 0) throw new Error('Element no longer exists');
    const e = cloneDocumentData(slide.elements[elementIndex]);
    slide.elements[elementIndex] = e;
    if (op.op === 'update_element' && op.patch.prototype && e.type !== 'prototype') throw new Error('Only prototype objects support embed links.');
    if(op.op==='update_element'&&op.patch.type){
      if(!isShape(e)||!isShape({type:op.patch.type}))throw new Error('Only shapes can change shape type.');
      if(op.patch.type!=='rect')op.patch.shape=undefined;
    }
    if (e.locked && (actor === 'ai' || op.op === 'delete_element' || Object.keys(op.patch).some(k => k !== 'locked'))) throw new Error('This layer is locked. Unlock it to edit.');
    if (actor === 'ai' && op.op === 'update_element' && op.patch.locked === false) throw new Error('AI cannot unlock layers');
    if (op.op === 'delete_element') slide.elements = slide.elements.filter(e => e.id !== op.elementId);
    else {
      const binding=styleOverrides(e,op.patch);if(binding)e.design=binding;
      op.patch = manualTextSizing(e, manualLayoutSizing(e, op.patch));
      if (Object.keys(op.patch).some(k => ['text', 'textSizing', 'w', 'h', 'fontFamily', 'fontSize', 'fontWeight', 'italic', 'lineHeight', 'letterSpacing', 'padding', 'runs', 'paragraphs', 'wrap', 'maxLines'].includes(k))) resize.add(e.id);
      if (op.patch.text !== undefined && !op.patch.paragraphs && !op.patch.runs) { const preserved=editedTextStyle(e,op.patch.text);Object.assign(e,preserved);if(preserved.text!==undefined)op.patch.text=preserved.text; }
      if (op.patch.runs && !op.patch.paragraphs) delete e.paragraphs;
      if (op.patch.fontSize !== undefined && op.patch.fontSize !== e.fontSize) {
        const ratio = op.patch.fontSize / e.fontSize;
        for (const r of [...(e.runs ?? []), ...(e.paragraphs?.flatMap(p => p.runs) ?? [])]) if (r.fontSize) r.fontSize *= ratio;
        for (const p of e.paragraphs ?? []) if (p.lineSpacing) p.lineSpacing *= ratio;
      }
      if (op.patch.fontFamily !== undefined) for (const r of [...(e.runs ?? []), ...(e.paragraphs?.flatMap(p => p.runs) ?? [])]) r.fontFamily = op.patch.fontFamily;
      // Source dimensions belong to the old pixels, never to the frame.
      if(op.patch.src&&op.patch.src!==e.src)e.imageSize=op.patch.imageSize;
      Object.assign(e, op.patch);
      for(const field of op.unset??[])e[field]=undefined;
      // A direct text edit becomes the field's new value, so numbering refresh
      // cannot silently overwrite the user's literal copy.
      if (e.pageElement && op.patch.text !== undefined && op.patch.pageElement === undefined) e.pageElement = {...e.pageElement, value: op.patch.text};
      if(e.layoutItem===undefined)delete e.layoutItem;
      else e.layoutItem=Object.fromEntries(Object.entries(e.layoutItem).filter(([,value])=>value!==undefined)) as typeof e.layoutItem;
    }
  }
  const textEdits=new Set(operations.flatMap(op=>op.op==='update_element'&&op.patch.text!==undefined?[op.elementId]:[]));
  next.slides=next.slides.map(s=>{if(!writable.has(s))return s;const deleted=operations.some(op=>op.op==='delete_element'&&op.slideId===s.id&&deck.slides.find(v=>v.id===s.id)?.elements.some(e=>e.id===op.elementId&&e.type==='image'));const result=adaptTemplateText(s,textEdits,deleted,next);writable.add(result);return result;});
  for(const s of next.slides)if(writable.has(s)) {
    // Remove empty containers bottom-up, then reconcile direct membership in one transaction.
    let groups=s.groups??[];
    for(let pass=0;pass<32;pass++){const retained=groups.filter(g=>s.elements.some(e=>e.group===g.id)||groups.some(child=>child.parent===g.id));if(retained.length===groups.length)break;groups=retained;}
    if(s.groups)s.groups=groups.length?groups:undefined;
    if(s.autoLayouts)s.autoLayouts=s.autoLayouts.map(l=>{const ids=directMembers(s,l.id).map(e=>e.id);return {...l,order:[...l.order.filter(id=>ids.includes(id)),...ids.filter(id=>!l.order.includes(id))]};}).filter(l=>l.order.length);
    if(!s.autoLayouts?.length)delete s.autoLayouts;
  }
  // Reject cycles and invalid references before recursive measurement.
  assert(next);
  for (const s of next.slides) if (writable.has(s)) s.elements = s.elements.map(e => resize.has(e.id) && !e.locked ? resolveTextElement(e, next, measure) : e);
  next.slides = next.slides.map(s => {
    if (!writable.has(s) || !s.autoLayouts?.length) return s;
    if (pageOnly.has(s.id) && !operations.some(op => ('slideId' in op && op.slideId === s.id) || op.op === 'set_design_system')) return s;
    const before = deck.slides.find(v => v.id === s.id);
    // Uniform movement of every visible child translates the group's frame.
    // Individual geometry edits are resolved back into the persistent flow.
    const autoLayouts = s.autoLayouts.map(l => {
      if (operations.some(op => op.op === 'set_group_layout' && op.slideId === s.id && op.layout.id === l.id)) return l;
      const previous = before?.autoLayouts?.find(v => v.id === l.id);
      const members = before?descendants(before,l.id).filter(e=>!e.hidden):[];
      if (!previous || !members.length) return l;
      // Native content adaptation has already positioned its saved frame.
      // Applying the child delta again would translate a one-item flow twice.
      if(Math.abs(l.x-previous.x)+Math.abs(l.y-previous.y)>.0001)return l;
      const first = s.elements.find(e => e.id === members[0].id);
      if (!first) return l;
      const dx = first.x - members[0].x, dy = first.y - members[0].y;
      if (Math.abs(dx) + Math.abs(dy) < .0001 || !members.every(e => {const v=s.elements.find(v=>v.id===e.id);return v&&v.group===e.group&&Math.abs(v.x-e.x-dx)<.0001&&Math.abs(v.y-e.y-dy)<.0001;})) return l;
      return {...l, x:l.x+dx, y:l.y+dy};
    });
    return resolveGroupLayouts({...s, autoLayouts}, true, e=>resolveTextElement(e,next,measure));
  });
  next.revision = deck.revision + 1;
  // Only deliberately edited native template data opts into continuation.
  // Imported tables and geometry-only layout proposals retain their source structure.
  const tableEdits=new Set(operations.flatMap(op=>op.op==='update_element'&&op.patch.cells?[op.elementId]:op.op==='add_slide'?op.slide.elements.filter(e=>e.tableFit).map(e=>e.id):[]));
  if(tableEdits.size){
    next.slides=next.slides.map(s=>adaptTemplateTable(s,tableEdits,next));
    next.slides=next.slides.flatMap(s=>{let slides=[s];for(const e of s.elements.filter(e=>e.type==='table'&&e.tableFit&&tableEdits.has(e.id)))slides=slides.flatMap(v=>continueTable(v,e.id,measure));return slides;});
  }
  const chartEdits=new Set(operations.flatMap(op=>op.op==='update_element'&&op.patch.chart?[op.elementId]:[]));
  if(chartEdits.size){
    const previousCharts=new Map<string,SlideElement>();
    for(const slide of deck.slides)for(const e of slide.elements)if(chartEdits.has(e.id)&&!previousCharts.has(e.id))previousCharts.set(e.id,e);
    next.slides=next.slides.map(s=>{const kind=s.template?.prototype;if(!kind||!['trend','composition','category-chart','metrics'].includes(kind))return s;const changed=s.elements.find(e=>e.chart&&chartEdits.has(e.id)),old=changed&&previousCharts.get(changed.id);if(!changed?.chart||!old?.chart)return s;
      const generated=new Set(s.template?.generated?.map(e=>e.id)),bound=new Set(s.template?.slots?.filter(slot=>slot.key!=='chart').map(slot=>slot.elementId));
      const metricCopy=(chart:NonNullable<SlideElement['chart']>)=>{const series=chart.series[0],last=series.values.length-1;return [formatChartValue(chart,series.values[last]),series.name,`${chart.labels[0]}: ${formatChartValue(chart,series.values[0])}\n${chart.labels[last]}: ${formatChartValue(chart,series.values[last])}`,chart.source||'Add source, population and reporting period'];};
      const previous=kind==='metrics'?metricCopy(old.chart):[],current=kind==='metrics'?metricCopy(changed.chart):[];
      return {...s,elements:s.elements.map(e=>{if(kind==='metrics'&&e.type==='text'&&!e.pageElement&&generated.has(e.id)&&!bound.has(e.id)){const i=previous.indexOf(e.text);if(i>=0)return resolveTextElement({...e,text:current[i]},next,measure);}return e.name==='Chart context'&&e.text===templateChartCaption(old.chart!,kind)?{...e,text:templateChartCaption(changed.chart!,kind)}:e;})};});
    next.slides=next.slides.flatMap(s=>{let slides=[s];for(const e of s.elements.filter(e=>e.chart?.adaptive&&chartEdits.has(e.id)))slides=slides.flatMap(v=>continueChart(v,e.id));return slides;});
  }
  next.slides=refreshPageElements(next).slides;
  const previousSlides=new Set(deck.slides),system=deckDesignSystem(next);
  next.slides=next.slides.map(s=>!previousSlides.has(s)&&s.adaptiveColors&&s.backgroundStyle==='dark'?adaptSlideColors(s,system):s);
  next.updatedAt = new Date().toISOString();
  return validate(next);
}
// Review copy lives in proposal-copy and loads with the AI panel; transactions
// must not pull that optional presentation layer into the editor startup graph.
export function moveElements(deck: Deck, slideId: string, ids: string[], dx: number, dy: number,context=''): Operation[] {
  ids=selectionMembers(deck.slides.find(s=>s.id===slideId)!,ids,false,context).map(e=>e.id);if(!ids.length)return[];
  const reorder = dragLayoutMember(deck.slides.find(s => s.id === slideId)!, ids, dx, dy,context);
  if (reorder) return reorder;
  const slide=deck.slides.find(s=>s.id===slideId)!;
  const selected=new Set(ids);for(const id of selectionRoots(slide,ids,context))for(const e of descendants(slide,id))selected.add(e.id);
  return slide.elements.filter(e=>selected.has(e.id)).map(e=>({op:'update_element',slideId,elementId:e.id,patch:{x:e.x+dx,y:e.y+dy}}));
}
export type {AlignmentReference,AlignmentDirection,ArrangementUnit} from './arrangement-operations';
