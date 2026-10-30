import {reorderedSelection,type StackDirection} from './stack-order';
import {savedDocumentLabel} from './runtime';
import { applyImmutableOperations, type Operation, type Proposal, type AlignmentReference } from './operations';
import { uid, type Deck, type SlideElement, type Slide, type GroupLayout, type SlideGroup } from './model';
import { selectedLayout,dragLayoutMember } from './object-layout';
import { draftRecord, readDraft, resolveDraft, saveImmutableDraft } from './drafts';
import {slideGroups,descendants,ancestorIds,treeSelection,selectionRoots,selectionTarget,editingSelectionScope,individualSelectionScope,createContainerTree,type ContainerTree} from './container-tree';
import { resolveDeckTextSizing, resolveDeckTextSizingAsync, resolveSlideTextSizing,textSizeEpoch } from './text-layout';
import { cloneDocumentData as clone } from './document-data';
import {adoptDeckRevision,takeDeckRevision,validateDeckRevision} from './document-revision';
import { jsonRequest } from './json-request';
import type {LayerDrop} from './layer-move';
import type {NoticeTone} from '../notification-lifetime';
import {captureClipboardContent,clipboardContent,clipboardSlides,clipboardFonts,portableMembers,pasteOffset,detachClipboardStyles,type ClipboardContent,type PastePlacement} from './clipboard';
import {orderedSlideSelection,selectSlideRange,type SlideSelectionIntent} from './slide-selection';
import {slideVisibilityOperations} from './slide-visibility';
import {deleteSelection} from './delete-selection';
import {editorCommands} from './clipboard-queue';
import {selectedSlideOrder,reorderSelectedSlides,moveSelectedSlides,type SlideMove} from './slide-order';

type EditorContext = {activeId: string; selected: string[]; selectedGroup?:string; editingGroup?:string; individualSelection?:boolean; sourceMode: boolean; selectedSlides?:string[]; slideAnchor?:string; slideSelectionMode?:boolean};

export async function api<T = any>(url: string, method = 'GET', body?: unknown): Promise<T> {
  return jsonRequest<T>(url, method, body);
}
export class Editor {
  // Model operations replace the whole document. Nested proxying is unnecessary
  // and expensive for large media documents; never mutate these values in place.
  deck = $state.raw<Deck | null>(null);
  activeId = $state('');
  selectedSlides = $state<string[]>([]);
  slideAnchor = $state('');
  slideSelectionMode = $state(false);
  get selectingSlides():boolean {return Boolean(this.deck)&&(this.slideSelectionMode||this.selectedSlides.length!==1||!this.selectedSlides.includes(this.activeId));}
  selected = $state<string[]>([]);
  private selectedIds = $derived(new Set(this.selected));
  selectedGroup=$state('');
  individualSelection=$state(false);
  editingGroupId=$state('');
  hovered = $state('');
  editingId = $state('');
  croppingId = $state('');
  additiveSelection = $state(false);
  layerPickerId = $state('');
  snapping = $state(true);
  snapToIncrement = $state(true);
  layoutGuides = $state(false);
  alignmentReference = $state<AlignmentReference>('auto');
  sourceMode = $state(false);
  past = $state.raw<Deck[]>([]);
  future = $state.raw<Deck[]>([]);
  pastContext: EditorContext[] = [];
  futureContext: EditorContext[] = [];
  futureBeforeContext: EditorContext[] = [];
  saveState = $state(savedDocumentLabel);
  error = $state('');
  notice = $state('');
  noticeTone = $state<NoticeTone>('info');
  noticeSequence = $state(0);
  noticeHistory = $state<Array<{id:number; message:string; tone:NoticeTone; time:number}>>([]);
  saveFailed = $state(false);
  private backupFailed = false;
  notify(message: string, tone: NoticeTone = 'success') {
    this.noticeTone = tone; this.notice = message; this.noticeSequence++;
    this.noticeHistory = [{id:this.noticeSequence, message, tone, time:Date.now()}, ...this.noticeHistory].slice(0, 20);
  }
  saving = $state(false);
  savedRevision = $state(0);
  recoveries = $state.raw<Deck[]>([]);
  recoveryIndex = $state(0);
  pending = $state<Proposal | null>(null);
  pendingId = $state('');
  clipboard = $state.raw<SlideElement[]>([]);
  clipboardLayouts: GroupLayout[] = [];
  clipboardGroups:SlideGroup[]=[];
  clipboardContent?:ClipboardContent;
  private pastedCopies:{deckId:string;slideId:string;ids:string[];step:number}[]=[];
  timer: ReturnType<typeof setTimeout> | undefined;
  private flushPromise: Promise<void> | undefined;
  lastMerge = ''; lastMergeTime = 0;
  propertyGesture = '';
  private measuredView?:{onlineFonts:Deck['onlineFonts'];source:Slide;elements:Slide['elements'];groups:Slide['groups'];layouts:Slide['autoLayouts'];epoch:number;value:Slide};
  private containerView?:{slide:Slide;tree:ContainerTree};
  get slide(): Slide | undefined {
    const deck=this.deck,source=deck?.slides.find(s=>s.id===this.activeId)??deck?.slides[0];if(!source||!deck){this.measuredView=undefined;return source;}
    const epoch=textSizeEpoch(),cached=this.measuredView;
    // Editor revisions are immutable. Repeated inspector reads share the measured
    // page; edits, history, page changes and font completion invalidate this view.
    if(cached&&cached.onlineFonts===deck.onlineFonts&&cached.source===source&&cached.elements===source.elements&&cached.groups===source.groups&&cached.layouts===source.autoLayouts&&cached.epoch===epoch)return cached.value;
    const value=resolveSlideTextSizing(source,deck);this.measuredView={onlineFonts:deck.onlineFonts,source,elements:source.elements,groups:source.groups,layouts:source.autoLayouts,epoch,value};return value;
  }
  // This cache belongs only to the editor's immutable measured revision. Mutable
  // import/transaction callers continue to build their own short-lived index.
  private get containerTree():ContainerTree|undefined {
    const slide=this.slide;if(!slide){this.containerView=undefined;return;}
    if(this.containerView?.slide!==slide)this.containerView={slide,tree:createContainerTree(slide)};
    return this.containerView.tree;
  }
  get selectedContainer():string {const id=this.selectedGroup;if(!id)return '';const es=this.containerTree?.descendants(id)??[],visible=es.filter(e=>!e.hidden),leaves=visible.length?visible:es;return leaves.length&&leaves.length===this.selected.length&&leaves.every(e=>this.selectedIds.has(e.id))?id:'';}
  get editingGroup():string {const id=this.editingGroupId;return id&&this.containerTree?.groupById.has(id)?id:'';}
  get selectionScope():string {return this.selectedContainer||(this.individualSelection?individualSelectionScope:this.selected.length===1?this.selected[0]:this.editingGroup?editingSelectionScope(this.editingGroup):'');}
  get selection(): SlideElement[] { const ids=this.selectedIds;return this.slide?.elements.filter(e => ids.has(e.id)) ?? []; }
  get dirty(): boolean { return Boolean(this.deck && this.deck.revision > this.savedRevision); }
  get recovery(): Deck | undefined { return this.recoveries[this.recoveryIndex]; }
  snapshot(): Deck { return clone(resolveDeckTextSizing(this.deck!)); }
  // Capture one immutable revision before yielding. Export/copy readers need
  // measured geometry, but do not need a mutable clone of all embedded assets.
  async readDocument(): Promise<Deck> {
    const captured=this.deck!;
    if(!captured.fonts?.length)return resolveDeckTextSizingAsync(captured);
    return (await import('./document-fonts')).withDocumentFonts(captured.fonts,()=>resolveDeckTextSizingAsync(captured));
  }
  // Read-only input for operation derivation; use snapshot() for mutable copies.
  operationDocument(): Deck {
    const base=takeDeckRevision(this.deck!);
    if(base!==this.deck)this.deck=base;
    const index=Math.max(0,base.slides.findIndex(s=>s.id===this.activeId)),slide=this.slide!;
    if(slide===base.slides[index])return base;
    const slides=[...base.slides];slides[index]=slide;
    return validateDeckRevision(base,{...base,slides});
  }
  context(): EditorContext { return {activeId:this.activeId,selected:[...this.selected],selectedGroup:this.selectedContainer,editingGroup:this.editingGroup,individualSelection:this.individualSelection,sourceMode:this.sourceMode,selectedSlides:[...this.selectedSlides],slideAnchor:this.slideAnchor,slideSelectionMode:this.slideSelectionMode}; }
  restoreContext(context?: EditorContext) {
    if(context&&this.deck?.slides.some(s=>s.id===context.activeId))this.activeId=context.activeId;
    else if(!this.deck?.slides.some(s=>s.id===this.activeId))this.activeId=this.deck?.slides[0].id||'';
    this.selectedSlides=context?.selectedSlides??[this.activeId];this.slideAnchor=context?.slideAnchor??this.activeId;this.slideSelectionMode=context?.slideSelectionMode??false;this.pruneSlideSelection();
    this.selectedGroup=context?.selectedGroup??'';this.individualSelection=context?.individualSelection??false;this.editingGroupId=context?.editingGroup??'';if(!this.editingGroup)this.editingGroupId='';
    this.selected=(context?.selected||[]).filter(id=>this.slide?.elements.some(e=>e.id===id));
    this.sourceMode=Boolean(context?.sourceMode&&this.slide?.source?.render);
    this.editingId='';this.hovered='';this.layerPickerId='';this.lastMerge='';this.lastMergeTime=0;
  }
  async open(id: string) {
    if (this.deck) { await this.flush(); if (this.deck.revision > this.savedRevision) throw new Error('These changes have not been saved to the document library. Export a copy or retry saving.'); }
    // Disk transport and the local recovery read are independent. Recovery read
    // failures stay recoverable and never hide a failed document request.
    const [d, draftRead] = await Promise.all([
      api<Deck>(`/api/decks/${id}`),
      readDraft(id).then(value => ({value, failed: false}), () => ({value: undefined, failed: true})),
    ]);
    let draft: ReturnType<typeof resolveDraft> = {}, draftError = '';
    try { if (draftRead.failed) throw new Error('Recovery read failed'); draft = resolveDraft(draftRead.value, d); } catch { draftError = 'Could not read the browser recovery draft. The saved document is open. Try reopening it or export a copy before leaving.'; }
    this.deck = adoptDeckRevision(draft.restore ?? d); this.recoveries = draft.conflicts ?? []; this.recoveryIndex = 0;
    this.savedRevision = d.revision; this.activeId = this.deck.slides[0].id;
    this.selectedSlides=[this.activeId];this.slideAnchor=this.activeId;this.slideSelectionMode=false;
    this.selected = []; this.selectedGroup=''; this.individualSelection=false; this.editingGroupId=''; this.hovered = ''; this.editingId = ''; this.past = []; this.future = []; this.pending = null; this.pendingId = ''; this.error = ''; this.notice = draftError; this.saveState = savedDocumentLabel;
    try{const modes=JSON.parse(localStorage.getItem('deck-studio-view-modes')||'{}');this.sourceMode=typeof modes[this.deck!.id]==='boolean'?modes[this.deck!.id]:Boolean(this.slide?.source?.render);}catch{this.sourceMode=Boolean(this.slide?.source?.render);}
    this.pastContext=[];this.futureContext=[];this.futureBeforeContext=[];this.additiveSelection=false;this.layerPickerId='';this.lastMerge='';this.lastMergeTime=0;
    this.saveFailed = false;
    if (draftError) this.notify(draftError, 'warning');
    if (draft.restore) { this.notify('Recovered unsaved changes from this browser'); this.scheduleSave(); }
    const opened = this.deck;
    if (opened.slides.some(s => s.elements.some(e => e.type === 'text' && e.textSizing && e.textSizing !== 'fixed'))) void import('./text-layout-fonts').then(({prepareTextSizing}) => prepareTextSizing(opened, () => this.deck === opened)).then(measured => { if (this.deck === opened) this.deck = validateDeckRevision(opened,measured); }).catch(() => { /* Keep the document usable with the current font fallback. */ });
  }
  async create(d: Deck) {
    await this.flush();
    if (this.deck && this.deck.revision > this.savedRevision) throw new Error('Export the current recovery draft before continuing.');
    await (await import('./background-document-save')).createDocumentInBackground('/api/decks',d,true); await this.open(d.id);
  }
  replace(next: Deck) {
    if (!this.deck) return;
    next = adoptDeckRevision({...next,id:this.deck.id,revision:this.deck.revision+1,updatedAt:new Date().toISOString()});
    this.past = [...this.past.slice(-49), this.operationDocument()]; this.future = [];
    this.pastContext=[...this.pastContext.slice(-49),this.context()];this.futureContext=[];this.futureBeforeContext=[];
    this.lastMerge='';this.lastMergeTime=0;
    this.deck = next; this.pruneSlideSelection(); this.scheduleSave();
  }
  chooseSlide(id: string, preserveSlideSelection = false) {
    if(!this.deck?.slides.some(slide=>slide.id===id))return;
    this.activeId = id; this.selected = []; this.selectedGroup=''; this.individualSelection=false;this.editingGroupId=''; this.hovered = ''; this.editingId = ''; this.additiveSelection=false;this.layerPickerId='';
    if(!preserveSlideSelection){this.selectedSlides=[id];this.slideAnchor=id;this.slideSelectionMode=false;}
  }
  selectSlide(id:string, intent:SlideSelectionIntent & {focusOnly?:boolean}={}) {
    if(!this.deck?.slides.some(slide=>slide.id===id))return;
    if(!intent.focusOnly){
      const next=selectSlideRange(this.deck.slides.map(slide=>slide.id),{ids:this.selectedSlides,anchor:this.slideAnchor||this.activeId},id,{...intent,toggle:intent.toggle||this.slideSelectionMode&&!intent.range});
      this.selectedSlides=next.ids;this.slideAnchor=next.anchor;
    }
    this.chooseSlide(id,true);
  }
  selectAllSlides(){if(!this.deck)return;this.selectedSlides=this.deck.slides.map(slide=>slide.id);this.slideAnchor=this.slideAnchor||this.activeId;}
  duplicateSlides(ids:readonly string[]=this.selectedSlides):string[] {
    if(!this.deck)return [];
    try{
      const order=selectedSlideOrder(this.deck.slides.map(slide=>slide.id),ids);if(!order.length)return [];
      if(this.deck.slides.length+order.length>500)throw new Error('A document can contain up to 500 slides.');
      const originals=new Map(this.deck.slides.map(slide=>[slide.id,slide])),copies=order.map(id=>({...clone(originals.get(id)!),id:uid('slide')}));
      let afterId=order.at(-1)!;const ops:Operation[]=copies.map(slide=>{const op:Operation={op:'add_slide',slide,afterId};afterId=slide.id;return op;});
      const revision=this.deck.revision,sourceMode=this.sourceMode;this.commit(ops);if(this.deck.revision===revision)return [];
      this.chooseSlide(copies[0].id,true);this.selectedSlides=copies.map(slide=>slide.id);this.slideAnchor=copies[0].id;this.sourceMode=Boolean(sourceMode&&this.slide?.source?.render);
      this.notify(`${copies.length===1?'Slide':`${copies.length} slides`} duplicated · Undo available`);return this.selectedSlides;
    }catch(error){this.error=(error as Error).message;return [];}
  }
  deleteSlides(ids:readonly string[]=this.selectedSlides):boolean {
    if(!this.deck)return false;
    try{
      const order=this.deck.slides.map(slide=>slide.id),selected=selectedSlideOrder(order,ids);if(!selected.length)return false;
      if(selected.length===order.length){this.notify('Keep at least one slide. Deselect a slide before deleting.','warning');return false;}
      const removed=new Set(selected),active=order.indexOf(this.activeId),remaining=order.filter(id=>!removed.has(id));
      const next=removed.has(this.activeId)?order.slice(Math.max(0,active)).find(id=>!removed.has(id))??remaining.at(-1)!:this.activeId;
      const revision=this.deck.revision,sourceMode=this.sourceMode;this.commit(selected.map(slideId=>({op:'delete_slide',slideId})));if(this.deck.revision===revision)return false;
      this.chooseSlide(next,true);this.selectedSlides=[next];this.slideAnchor=next;this.sourceMode=Boolean(sourceMode&&this.slide?.source?.render);
      this.notify(`${selected.length===1?'Slide':`${selected.length} slides`} deleted · Undo available`);return true;
    }catch(error){this.error=(error as Error).message;return false;}
  }
  moveSlides(ids:readonly string[],direction:SlideMove):boolean {
    if(!this.deck)return false;
    try{return this.commitSlideOrder(moveSelectedSlides(this.deck.slides.map(slide=>slide.id),ids,direction));}
    catch(error){this.error=(error as Error).message;return false;}
  }
  dropSlides(ids:readonly string[],target:string,after=false,revision=this.deck?.revision):boolean {
    if(!this.deck)return false;
    try{return this.commitSlideOrder(reorderSelectedSlides(this.deck.slides.map(slide=>slide.id),ids,target,after),revision);}
    catch(error){this.error=(error as Error).message;return false;}
  }
  private commitSlideOrder(ids:string[],revision=this.deck?.revision):boolean {
    if(!this.deck||ids.every((id,index)=>id===this.deck!.slides[index].id))return false;
    const before=this.deck.revision;this.commit([{op:'reorder_slides',ids}],'','manual',revision);if(this.deck.revision===before)return false;
    this.notify('Slides moved · Undo available');return true;
  }
  setSlidesHidden(ids:readonly string[],hidden:boolean):number {
    if(!this.deck)return 0;
    try{const operations=slideVisibilityOperations(this.deck,ids,hidden),revision=this.deck.revision;this.commit(operations);return this.deck.revision!==revision?operations.length:0;}
    catch(error){this.error=(error as Error).message;return 0;}
  }
  beginSlideSelection(){this.slideSelectionMode=true;if(!this.selectedSlides.length)this.selectedSlides=[this.activeId];}
  endSlideSelection(){this.slideSelectionMode=false;this.selectedSlides=this.activeId?[this.activeId]:[];this.slideAnchor=this.activeId;}
  private pruneSlideSelection(){
    const order=this.deck?.slides.map(slide=>slide.id)??[];
    this.selectedSlides=orderedSlideSelection(order,this.selectedSlides);
    if(!this.selectedSlides.length&&!this.slideSelectionMode&&order.includes(this.activeId))this.selectedSlides=[this.activeId];
    if(!order.includes(this.slideAnchor))this.slideAnchor=this.activeId;
  }
  choose(id: string, multiple = false, individual = false) {
    if(!this.slide)return;
    void import('./group-commands').catch(()=>{});
    const slide=this.slide,tree=this.containerTree!,group=tree.groupById.get(id),parent=group?.parent??tree.elements.get(id)?.group;
    if(individual)this.editingGroupId=parent??'';
    else if(this.editingGroup&&id!==this.editingGroup&&!tree.ancestors(id).includes(this.editingGroup))this.editingGroupId='';
    const target=selectionTarget(slide,id,this.editingGroup,individual,tree),unit=treeSelection(slide,target,true,tree);
    this.individualSelection=individual;
    this.selected=multiple?(unit.every(id=>this.selected.includes(id))?this.selected.filter(id=>!unit.includes(id)):[...new Set([...this.selected,...unit])]):unit;
    this.selectedGroup=!multiple&&tree.groupById.has(target)?target:'';
  }
  chooseGroup(id:string,multiple=false){this.choose(id,multiple);}
  enterGroup(id=this.selectedContainer):boolean {
    if(!this.slide||!id||!slideGroups(this.slide).some(g=>g.id===id))return false;
    this.editingGroupId=id;this.selected=[];this.selectedGroup='';this.individualSelection=false;this.hovered='';this.editingId='';this.additiveSelection=false;return true;
  }
  drillInto(id:string):boolean {
    const container=this.selectedContainer;
    if(container&&container!==this.editingGroup){this.enterGroup(container);this.choose(id);return true;}
    return false;
  }
  exitGroup(all=false):boolean {
    if(!this.slide||!this.editingGroup)return false;
    const id=this.editingGroup,chain=ancestorIds(this.slide,id),target=all?chain.at(-1)??id:id;
    this.editingGroupId=all?'':chain[0]??'';this.selected=treeSelection(this.slide,target,true);this.selectedGroup=target;this.individualSelection=false;this.editingId='';this.hovered='';this.additiveSelection=false;return true;
  }
  selectParent():boolean {
    if(!this.slide)return false;
    if(this.editingGroup)return this.exitGroup();
    const roots=selectionRoots(this.slide,this.selected,this.selectionScope),parents=roots.map(id=>ancestorIds(this.slide!,id)[0]);
    const parent=parents[0];if(!parent||!parents.every(id=>id===parent))return false;
    this.chooseGroup(parent);return true;
  }
  selectAll(){if(!this.slide)return;const scope=this.editingGroup;this.selected=(scope?descendants(this.slide,scope):this.slide.elements).filter(e=>!e.hidden&&!e.designPattern).map(e=>e.id);this.selectedGroup='';this.individualSelection=false;}

  commit(operations: Operation[], mergeKey = '', actor: 'manual' | 'ai' = 'manual', revision?: number) {
    if (!this.deck || !operations.length) return;
    try {
      // Transactions never mutate their input. Keep that revision for undo;
      // exports/clipboard still receive independently mutable snapshots.
      const before = this.operationDocument();
      const after = applyImmutableOperations(before, operations, revision ?? before.revision, actor);
      const merge = actor === 'manual' && this.propertyGesture ? this.propertyGesture : mergeKey;
      const scopeKey=merge?`${this.activeId}:${this.selected.join(',')}:${merge}`:'';
      if (!(scopeKey && this.lastMerge === scopeKey && (this.propertyGesture === merge || Date.now() - this.lastMergeTime < 700))) {
        this.past = [...this.past.slice(-49), before];this.pastContext=[...this.pastContext.slice(-49),this.context()];
      }
      this.lastMerge = scopeKey; this.lastMergeTime = Date.now();
      this.future = []; this.deck = after; if(operations.some(op=>!['rename_deck','register_local_font','register_online_font','reorder_slides'].includes(op.op)&&!(op.op==='update_slide'&&Object.keys(op.patch).every(key=>key==='hidden'))))this.sourceMode = false;
      this.futureContext=[];this.futureBeforeContext=[];
      if(this.editingGroupId&&!this.editingGroup)this.editingGroupId=ancestorIds(before.slides.find(s=>s.id===this.activeId)!,this.editingGroupId).find(id=>slideGroups(this.slide!).some(g=>g.id===id))??'';
      this.selected = this.selected.filter(id => this.slide?.elements.some(e => e.id === id));
      if (!this.deck.slides.some(s => s.id === this.activeId)) this.activeId = this.deck.slides[0].id;
      this.pruneSlideSelection();
      this.scheduleSave();
    } catch (e: any) { this.error = e.message; }
  }
  patch(patch: Partial<SlideElement>, merge = '') {
    const members=this.selectedContainer&&this.slide?descendants(this.slide,this.selectedContainer):this.selection;
    this.commit(members.filter(e => !e.locked || Object.keys(patch).every(k => k === 'locked')).map(e => ({op: 'update_element', slideId: this.slide!.id, elementId: e.id, patch})), merge);
  }
  async group(ungroup=false,wrap=false) {
    await this.containerCommand('group',ungroup,wrap);
  }
  async autoLayout() { await this.containerCommand('auto'); }
  async moveOutOfGroup(toSlide=false):Promise<boolean> {
    const ids=[...this.selected],scope=this.selectionScope,revision=this.deck?.revision,slideId=this.activeId,deckId=this.deck?.id;
    try{return (await import('./group-exit-command')).exitGroup(this,toSlide,ids,scope,revision,slideId,deckId);}catch(e:any){this.error=e.message||'Could not move the selection out of its group.';return false;}
  }
  private async containerCommand(action:'group'|'auto',ungroup=false,wrap=false) {
    if(!this.slide)return;
    await editorCommands.run(this.commandContext(),()=>this.commandContext(),async current=>{
      const {editContainer}=await import('./group-edit-command');
      if(this.commandContext()!==current)throw Error('The document changed. Try the command again.');
      editContainer(this,action,ungroup,wrap,this.activeId,this.selected.join(','));
      return this.commandContext();
    }).catch(e=>this.notify(e.message,'warning'));
  }
  commandContext(){return `${this.deck?.id}:${this.activeId}:${this.deck?.revision}:${this.editingGroup}:${this.selected.join(',')}:${this.sourceMode}:${this.editingId}:${this.selectedContainer}:${this.selectedSlides.join(',')}:${this.slideSelectionMode}`;}
  add(e: SlideElement, revision?: number) {
    const layout = this.slide && selectedLayout(this.slide, this.selected,this.editingGroup||this.selectedContainer);
    if(this.editingGroup)e={...e,group:this.editingGroup};
    if (layout && descendants(this.slide!,layout.id).filter(v=>!v.hidden).every(v=>this.selected.includes(v.id))) e={...e,group:layout.id};
    const ops:Operation[]=[{op:'add_element',slideId:this.slide!.id,element:e}];
    if(layout&&e.group===layout.id){
      const next={...layout,order:[...layout.order,e.id]},slide={...this.slide!,elements:[...this.slide!.elements,e],autoLayouts:this.slide!.autoLayouts!.map(l=>l.id===layout.id?next:l)};
      const reordered=dragLayoutMember(slide,[e.id],-e.w/2,-e.h/2,e.id);
      const moved=reordered?.find(op=>op.op==='set_group_layout');
      if(moved?.op==='set_group_layout'){
        const visible=moved.layout.order.filter(id=>!slide.elements.find(v=>v.id===id)?.hidden),anchor=visible[visible.indexOf(e.id)+1];
        const order=[...layout.order],at=anchor?order.indexOf(anchor):order.length;order.splice(at<0?order.length:at,0,e.id);
        ops.push({op:'set_group_layout',slideId:slide.id,layout:{...next,order}});
      }else ops.push({op:'set_group_layout',slideId:slide.id,layout:next});
    }
    this.commit(ops, '', 'manual', revision);
    if(this.slide?.elements.some(v=>v.id===e.id)){this.selected = [e.id];this.selectedGroup='';}
  }
  private copyMembers() {
    if(!this.slide)return[];
    const selected=new Set(this.selected);
    const tree=this.containerTree!;
    for(const id of selectionRoots(this.slide,this.selected,this.selectionScope))if(tree.groupById.has(id))for(const e of tree.descendants(id))selected.add(e.id);
    return this.slide.elements.filter(e=>selected.has(e.id));
  }
  private duplicateObjects(source:SlideElement[],layouts:GroupLayout[],containers:SlideGroup[],offset:number|{x:number;y:number}=24,preserveParent=false,extra:Operation[]=[],detach=false) {
    if(!this.slide||!source.length)return;
    const complete=containers,targetParent=this.editingGroup||undefined;
    const ids=new Map([...source.map(e=>[e.id,uid()] as const),...complete.map(g=>[g.id,uid('group')] as const)]);
    const delta=typeof offset==='number'?{x:offset,y:offset}:offset;
    const es=source.map(e=>{const parent=preserveParent?e.group:targetParent,v={...(detach?detachClipboardStyles(e):e),id:ids.get(e.id)!,x:e.x+delta.x,y:e.y+delta.y,locked:false,group:e.group?ids.get(e.group)??parent:parent};if(!v.group)delete v.group;if(!preserveParent&&(!e.group||!ids.has(e.group)))delete v.layoutItem;return v;});
    const ops:Operation[]=[...extra,...complete.map(g=>({op:'set_group' as const,slideId:this.slide!.id,group:{...g,id:ids.get(g.id)!,parent:g.parent?ids.get(g.parent)??(preserveParent?g.parent:targetParent):preserveParent?undefined:targetParent,...(!preserveParent&&(!g.parent||!ids.has(g.parent))?{layoutItem:undefined}:{})}}))];
    ops.push(...es.map(element=>({op:'add_element' as const,slideId:this.slide!.id,element})));
    for(const l of layouts)if(ids.has(l.id)&&l.order.every(id=>ids.has(id)))ops.push({op:'set_group_layout',slideId:this.slide.id,layout:{...l,id:ids.get(l.id)!,x:l.x+delta.x,y:l.y+delta.y,order:l.order.map(id=>ids.get(id)!)}});
    const revision=this.deck!.revision;this.commit(ops);if(this.deck!.revision===revision)return;
    const root=complete.find(g=>!g.parent||!ids.has(g.parent));
    const visible=es.filter(e=>!e.hidden);this.selected=(visible.length?visible:es).map(e=>e.id);this.selectedGroup=root?ids.get(root.id)!:'';
    if(preserveParent&&complete.some(g=>g.id===this.editingGroup))this.editingGroupId=root?.parent??'';
    return es.map(e=>e.id);
  }
  private copiedContent() {
    const members=this.copyMembers(),copied=new Set(members.map(e=>e.id)),tree=this.containerTree;
    const roots=new Set(this.slide?selectionRoots(this.slide,this.selected,this.selectionScope):[]);
    const groups=tree?tree.groups.filter(g=>(roots.has(g.id)||tree.ancestors(g.id).some(id=>roots.has(id)))&&tree.descendants(g.id).every(e=>copied.has(e.id))):[];
    const groupIds=new Set(groups.map(g=>g.id)),layouts=(this.slide?.autoLayouts??[]).filter(l=>groupIds.has(l.id));
    return {members,groups,layouts};
  }
  duplicateSelection() { const c=this.copiedContent();this.duplicateObjects(c.members,c.layouts,c.groups,24,true); }
  copy(slideId?:string,announce=true) {
    if(!this.deck||!this.slide)return;
    const slide=slideId?this.deck.slides.find(s=>s.id===slideId):this.slide;if(!slide)return;
    const c=slideId?{members:slide.elements,groups:slideGroups(slide),layouts:slide.autoLayouts??[]}:this.copiedContent();
    if(!slideId&&!c.members.length)return;
    const content=clipboardContent(this.deck,slide,c,Boolean(slideId));this.acceptClipboard(content,true);
    if(announce)this.notify(slideId?'Slide copied':'Selected objects copied');return content;
  }
  acceptClipboard(content:ClipboardContent,reset=false){
    content=captureClipboardContent(content);if(reset||content!==this.clipboardContent)this.pastedCopies=[];
    this.clipboardContent=content;this.clipboard=content.members;this.clipboardGroups=content.groups;this.clipboardLayouts=content.layouts;
  }
  copySlides(ids:readonly string[]=this.selectedSlides,announce=true){
    if(!this.deck)return;
    const content=clipboardSlides(this.deck,ids);if(!content)return;this.acceptClipboard(content,true);
    if(announce)this.notify(`${content.slides!.length} slides copied`);return content;
  }
  get canCut(){const members=this.copyMembers();return members.length>0&&members.every(e=>!e.locked);}
  pasteContent(content:ClipboardContent,placement:PastePlacement={}) {
    if(!this.deck||!this.slide)return;
    this.acceptClipboard(content);
    if(content.kind==='objects'){this.paste(placement);return;}
    const prepared=clipboardFonts(content,this.deck),sources=prepared.content.kind==='slides'?prepared.content.slides!:[prepared.content.slide!];
    if(this.deck.slides.length+sources.length>500){this.notify('A document can contain up to 500 slides.','warning');return;}
    const slides=sources.map(source=>{
      const slide=clone(source);slide.id=uid('slide');
      if(content.deckId!==this.deck!.id){
        slide.elements=portableMembers(slide.elements,slide).map(detachClipboardStyles);delete slide.backgroundStyle;delete slide.template;slide.patternStyle='none';
        slide.pageElements={header:'',footer:'',date:'',pageNumbers:false,numberFormat:'number',startAt:1,hideOnCover:false,hideOnBreaks:false,divider:false};
      }
      return slide;
    });
    const selected=orderedSlideSelection(this.deck.slides.map(slide=>slide.id),this.selectedSlides);
    let afterId=selected.at(-1)??this.slide.id;
    const operations:Operation[]=slides.map(slide=>{const op:Operation={op:'add_slide',slide,afterId};afterId=slide.id;return op;});
    const revision=this.deck.revision,sourceMode=this.sourceMode;this.commit([...prepared.operations,...operations]);
    if(this.deck.revision!==revision){this.chooseSlide(slides[0].id,true);this.selectedSlides=slides.map(slide=>slide.id);this.slideAnchor=slides[0].id;this.sourceMode=Boolean(sourceMode&&this.slide?.source?.render);this.notify(`${slides.length===1?'Slide':`${slides.length} slides`} pasted · Undo available`);}
  }
  paste(placement:PastePlacement={}){
    if(!this.deck||!this.slide||!this.clipboard.length&&(!this.clipboardContent||this.clipboardContent.kind==='objects'))return;
    if(this.clipboardContent&&this.clipboardContent.kind!=='objects'){this.pasteContent(this.clipboardContent,placement);return;}
    const present=new Set(this.slide.elements.map(e=>e.id));
    const alive=this.pastedCopies.filter(p=>p.deckId===this.deck!.id&&p.slideId===this.slide!.id&&p.ids.every(id=>present.has(id)));
    this.pastedCopies=[...this.pastedCopies.filter(p=>p.deckId===this.deck!.id&&p.slideId!==this.slide!.id),...alive];
    const c=this.clipboardContent,prepared=c?clipboardFonts(c,this.deck):undefined;
    const originalHere=!c||c.deckId===this.deck.id&&c.slideId===this.slide.id&&this.clipboard.some(e=>present.has(e.id));
    const step=Math.max(originalHere?0:-1,...alive.map(p=>p.step))+1;
    const members=prepared?.content.members??this.clipboard;
    const offset=pasteOffset(members,this.clipboardLayouts,this.deck,step,placement);
    const ids=this.duplicateObjects(members,this.clipboardLayouts,this.clipboardGroups,offset,false,prepared?.operations,c?.deckId!==this.deck.id);
    if(ids?.length){if(!placement.inPlace&&!placement.point)this.pastedCopies.push({deckId:this.deck.id,slideId:this.slide.id,ids,step});this.notify('Objects pasted · Undo is available');}
  }
  reorderSelection(direction:StackDirection) { if(!this.slide)return;const ids=reorderedSelection(this.slide,this.selected,direction,this.selectionScope);if(ids.some((id,i)=>id!==this.slide!.elements[i].id))this.commit([{op:'reorder_elements',slideId:this.slide.id,ids}]); }
  async moveLayers(ids:string[],drop:LayerDrop,revision=this.deck?.revision,slideId=this.activeId,deckId=this.deck?.id):Promise<boolean> {
    try{return (await import('./layer-move-command')).moveLayers(this,ids,drop,revision,slideId,deckId);}catch(e:any){this.error=e.message||'Layer controls could not load. Try moving again.';return false;}
  }
  remove() {
    if(!this.slide)return;
    const {operations,blocked}=deleteSelection(this.slide,this.selected,this.selectionScope),revision=this.deck?.revision;
    this.commit(operations);
    if(blocked)this.notify(this.deck?.revision!==revision?'Unlocked objects deleted. Locked objects were kept.':'Unlock the selection before deleting.','warning');
  }
  private redoContext(before:Deck,context:EditorContext):EditorContext {
    if(this.deck&&(before.slides.some(slide=>!this.deck!.slides.some(value=>value.id===slide.id))||this.deck.slides.some(slide=>!before.slides.some(value=>value.id===slide.id))))return this.context();
    if(this.activeId===context.activeId)return this.context();
    if(this.deck?.slides.some(s=>s.id===this.activeId)&&!before.slides.some(s=>s.id===this.activeId))return this.context();
    const slide=this.deck!.slides.find(s=>s.id===context.activeId),old=before.slides.find(s=>s.id===context.activeId);
    if(!slide)return context;
    const added=slide.elements.filter(e=>!e.hidden&&!old?.elements.some(v=>v.id===e.id)).map(e=>e.id),selected=added.length?added:context.selected.filter(id=>slide.elements.some(e=>e.id===id));
    const group=added.length?slideGroups(slide).filter(g=>descendants(slide,g.id).filter(e=>!e.hidden).length===selected.length&&descendants(slide,g.id).filter(e=>!e.hidden).every(e=>selected.includes(e.id))).find(g=>!g.parent||!added.some(id=>ancestorIds(slide,id).includes(g.parent!)))?.id:context.selectedGroup;
    return {...context,selected,selectedGroup:group};
  }
  undo() {
    if (!this.deck || !this.past.length) return;
    const previousBase = this.past[this.past.length - 1], previous = {...previousBase};
    const context=this.pastContext.at(-1)??this.context();
    this.future = [...this.future, this.operationDocument()]; this.past = this.past.slice(0, -1);
    this.futureContext=[...this.futureContext,this.redoContext(previous,context)];this.futureBeforeContext=[...this.futureBeforeContext,context];this.pastContext=this.pastContext.slice(0,-1);
    previous.revision = this.deck.revision + 1; previous.updatedAt = new Date().toISOString(); this.deck = validateDeckRevision(previousBase,previous); this.restoreContext(context); this.scheduleSave();
  }
  redo() {
    if (!this.deck || !this.future.length) return;
    const nextBase = this.future[this.future.length - 1], next = {...nextBase};
    const context=this.futureContext.at(-1);
    this.past = [...this.past, this.operationDocument()]; this.future = this.future.slice(0, -1);
    this.pastContext=[...this.pastContext,this.futureBeforeContext.at(-1)??this.context()];this.futureBeforeContext=this.futureBeforeContext.slice(0,-1);this.futureContext=this.futureContext.slice(0,-1);
    next.revision = this.deck.revision + 1; next.updatedAt = new Date().toISOString(); this.deck = validateDeckRevision(nextBase,next); this.restoreContext(context); this.scheduleSave();
  }
  scheduleSave() {
    this.saveState = 'Saving…';
    void this.backup();
    clearTimeout(this.timer); this.timer = setTimeout(() => void this.flush(), 450);
  }
  async backup() {
    if (!this.deck) return;
    try { await saveImmutableDraft(draftRecord(this.operationDocument(), this.savedRevision, this.recoveries)); this.backupFailed = false; }
    catch {
      if (!this.backupFailed) this.notify('Browser backup unavailable. Retry saving or export a copy before closing this tab.', 'warning');
      this.backupFailed = true;
    }
  }
  async recoverAsCopy() {
    if (!this.recovery) return;
    const recovered = clone(this.recovery);
    recovered.id = uid('deck'); recovered.title += ' · Recovery draft'; recovered.revision = 0; recovered.updatedAt = new Date().toISOString();
    await this.create(recovered);
  }
  flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.flushPromise) return this.flushPromise;
    if (!this.deck || this.deck.revision <= this.savedRevision) return Promise.resolve();
    const pending = this.persistChanges(); this.flushPromise = pending;
    const clear = () => { if (this.flushPromise === pending) this.flushPromise = undefined; };
    void pending.then(clear, clear);
    return pending;
  }
  private async persistChanges(): Promise<void> {
    if (!this.deck || this.deck.revision <= this.savedRevision) return;
    this.saving = true;
    try {
      while (this.deck && this.deck.revision > this.savedRevision) {
        try {
          const baseRevision = this.savedRevision;
          const captured = this.deck;
          const d = validateDeckRevision(captured,await resolveDeckTextSizingAsync(captured));
          await (await import('./background-document-save')).saveDocumentInBackground(`/api/decks/${d.id}`,{deck:d,expectedRevision:baseRevision},true);
          // The durable draft must agree with the fully measured disk revision.
          // Never replace edits made while measurement or transport was pending.
          if (this.deck.id === d.id && this.deck.revision === d.revision) this.deck = d;
          this.savedRevision = d.revision;
          this.saveState = this.deck.revision > d.revision ? 'Saving…' : savedDocumentLabel; this.error = ''; this.saveFailed = false;
          await this.backup();
        } catch (e: any) { this.error = e.message; this.saveFailed = true; this.saveState = 'Not saved'; break; }
      }
    } finally { this.saving = false; }
  }
  async acceptProposal() {
    if (!this.pending || !this.deck) return;
    const revision = this.deck.revision;
    this.commit(this.pending.operations, '', 'ai', this.pending.baseRevision);
    if (this.deck.revision === revision) return;
    const id = this.pendingId; this.pending = null; this.pendingId = '';
    await this.flush();
    if (id && !this.error) await api(`/api/proposals/${id}`, 'POST', {status: 'applied'});
  }
  async dismissProposal() { if (this.pendingId) await api(`/api/proposals/${this.pendingId}`, 'POST', {status: 'dismissed'}); this.pending = null; this.pendingId = ''; }
}
export const editor = new Editor();
