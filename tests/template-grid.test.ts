import {test} from 'node:test';
import assert from 'node:assert/strict';
import {COLLECTIONS,LAYOUTS,createLayout,templateDeck,scaleTemplateSlide} from '../src/core/templates';
import {templatePageGrid,templateGridBindings,placeTemplateOnGrid} from '../src/core/template-page-grid';
import {columnBounds,pageLayoutOperations,contentBounds} from '../src/core/page-layout';
import {applyOperations} from '../src/core/operations';
import {newDeck,blankSlide,element,validateDeck} from '../src/core/model';
import {createLayoutCandidate} from '../src/core/auto-layout';
import {resolveDeckTextSizing,type TextSizeMeasure} from '../src/core/text-layout';
import {descendants} from '../src/core/container-tree';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<.02,`${a} ≠ ${b}`);
const measure:TextSizeMeasure=e=>({w:e.w,h:e.text.split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil([...line].length*e.fontSize*.54/e.w)),0)*e.fontSize*e.lineHeight});
test('nested interface rows stay inside their visual mount when the enclosing region moves',()=>{
 for(const collection of COLLECTIONS)for(const slide of templateDeck(collection.id).slides){for(const mount of slide.elements.filter(e=>e.type==='rect'&&/sample interface$/.test(e.name))){assert.ok(mount.group);for(const e of descendants(slide,mount.group!).filter(e=>e.id!==mount.id)){assert.ok(e.x>=mount.x-.1,`${collection.id}/${slide.template?.prototype}/${e.name} leaves its mount`);assert.ok(e.x+e.w<=mount.x+mount.w+.1,`${collection.id}/${e.name} exceeds its mount`);}}}
});
test('every native layout has placed root flows derived from the same column geometry as its guides',()=>{
 for(const c of COLLECTIONS)for(const layout of LAYOUTS){const s=createLayout(layout.id,1,c.id),g=templatePageGrid(c.id,layout.id),bindings=templateGridBindings(s);assert.deepEqual(s.layout,g.layout);
  for(const l of s.autoLayouts??[]){if(s.groups?.find(group=>group.id===l.id)?.parent)continue;const b=bindings.find(b=>b.id===l.id);assert.ok(b,`${c.id}/${layout.id}/${l.name} has no page region`);if(b.kind==='columns'){const box=g.span(b.start,b.span);near(l.x,box.x+b.inset);near(l.w,box.w-2*b.inset);}}
  validateDeck(newDeck('Grid',[s]));
 }
});
test('gallery frames and captions occupy three genuine spans, not coordinates fitted by changing the guides',()=>{
 for(const c of COLLECTIONS){const s=createLayout('gallery',1,c.id),g=templatePageGrid(c.id,'gallery'),captions=s.autoLayouts!.filter(l=>l.name.startsWith('Study caption')).sort((a,b)=>a.x-b.x);assert.equal(captions.length,3);for(const [i,l] of captions.entries()){const area=g.span(i*4,4);near(l.x,area.x);near(l.w,area.w);}
  const media=s.elements.filter(e=>e.type==='image').sort((a,b)=>a.x-b.x);for(const [i,e] of media.entries()){near(e.x,g.span(i*4,4).x);near(e.w,g.span(i*4,4).w);}
  near(captions[2].x+captions[2].w,1440-g.layout.margins.right);
 }
});
test('changing construction metrics moves actual content and saved auto layouts together; editing view guides remains non-destructive',()=>{
 const s=createLayout('gallery',1,'portfolio'),g=templatePageGrid('minimal','gallery'),moved=placeTemplateOnGrid(s,'portfolio','gallery',g),old=s.autoLayouts!.find(l=>l.name==='Study caption 2')!,next=moved.autoLayouts!.find(l=>l.name===old.name)!;assert.notEqual(next.x,old.x);near(next.x,g.span(4,4).x);near(moved.elements.find(e=>e.id===next.order[0])!.x,next.x);
 const d=newDeck('Grid',[s]),layout={...s.layout!,margins:{...s.layout!.margins,left:180,right:120}},control=applyOperations(d,[{op:'update_slide',slideId:s.id,patch:{layout:s.layout}}],d.revision,'manual'),changed=applyOperations(d,pageLayoutOperations(d,s.id,layout),d.revision,'manual');assert.deepEqual(changed.slides[0].elements,control.slides[0].elements);
});
test('cover metadata shares its content edge while page artwork retains deliberate bleed',()=>{
 for(const c of COLLECTIONS){const s=createLayout('cover',1,c.id),g=templatePageGrid(c.id,'cover');for(const l of s.autoLayouts??[])near(l.x,g.content.x);}
 const s=createLayout('cover',1,'portfolio'),image=s.elements.find(e=>e.type==='image')!;near(image.x,templatePageGrid('portfolio','cover').span(6,6).x);near(image.x+image.w,1440);
});
test('long cover artwork clears the persistent review and pitch footer rules',()=>{
 for(const collection of ['review','pitch']){const s=createLayout('cover',1,collection),d=resolveDeckTextSizing(newDeck('Cover',[s]),measure),title=s.elements.find(e=>e.type==='text'&&e.fontSize>=56&&e.y>110&&e.y<340)!,text='A coordinated release, grounded in evidence and an explicit next decision.';
  const changed=applyOperations(d,[{op:'update_element',slideId:s.id,elementId:title.id,patch:{text}}],d.revision,'manual',measure).slides[0],art=changed.elements.find(e=>e.type==='image')!,rule=changed.elements.find(e=>e.type==='line'&&e.y>600&&e.w>1000)!;assert.ok(art.y+art.h+24<=rule.y);}
});
test('a long CJK cover heading uses the full grid in both template creation and direct editing',()=>{
 const heading='为跨团队协作建立统一的交付节奏并通过真实用户反馈持续验证关键决策与项目成果的长期';
 for(const collection of COLLECTIONS){
  const initial=createLayout('cover',1,collection.id),d=newDeck('Cover',[initial]);
  const original=initial.elements.find(e=>e.design?.text==='title')!;
  const edited=applyOperations(d,[{op:'update_element',slideId:initial.id,elementId:original.id,patch:{text:heading}}],d.revision,'manual',measure).slides[0];
  const customized=createLayout('cover',1,collection.id,{heading});
  for(const slide of [edited,customized]){
   assert.equal(slide.template?.variant,'long-title',collection.id);
   const title=slide.elements.find(e=>e.text===heading)!;
   const art=slide.elements.find(e=>e.type==='image')!;
   near(title.w,templatePageGrid(collection.id,'cover').full.w);
   assert.ok(title.y+title.h<art.y,collection.id+' title clears artwork');
  }
  assert.equal(edited.elements.find(e=>e.type==='image')!.src,initial.elements.find(e=>e.type==='image')!.src);
 }
});
test('generic layout proposals use the saved content area instead of a separate percentage margin',()=>{
 const s=blankSlide();s.layout={margins:{left:160,right:120,top:150,bottom:100},columns:3,gutter:40};s.elements=[element('text',{text:'A clear point',x:10,y:20,w:450,h:90,fontSize:60}),element('text',{text:'Evidence for a coordinated decision',x:10,y:180,w:420,h:120,fontSize:30}),element('text',{text:'An explicit next action',x:10,y:380,w:420,h:120,fontSize:30})];const d=newDeck('Layout',[s]),a=createLayoutCandidate(d,s.id,'grid'),changed={...d,slides:[{...s,layout:{...s.layout,margins:{...s.layout.margins,left:240}}}]},b=createLayoutCandidate(changed,s.id,'grid');assert.ok(a.operations.length);assert.notDeepEqual(a.operations,b.operations);for(const e of b.slide.elements){assert.ok(e.x>=240-.01);assert.ok(e.x+e.w<=1320+.01);}
});
test('caption reading adaptation grows its real region and restores the image when short copy returns',()=>{
 const d=resolveDeckTextSizing(templateDeck('portfolio'),measure),slide=d.slides.find(s=>s.template?.prototype==='gallery')!,caption=slide.autoLayouts!.find(l=>l.name==='Study caption 2')!,body=slide.elements.find(e=>caption.order.includes(e.id)&&e.design?.text==='body')!,long='Compare the evidence, material and visual relationships before selecting a clear direction. Record the next decision and its owner.';
 const next=applyOperations(d,[{op:'update_element',slideId:slide.id,elementId:body.id,patch:{text:long}}],d.revision,'manual',measure),changed=next.slides.find(s=>s.id===slide.id)!;assert.equal(changed.template!.variant,'reading-gallery');assert.ok(changed.autoLayouts!.find(l=>l.id===caption.id)!.y<caption.y);assert.equal(changed.elements.find(e=>e.id===body.id)!.text,long);
 const short=applyOperations(next,[{op:'update_element',slideId:slide.id,elementId:body.id,patch:{text:'A clear direction.'}}],next.revision,'manual',measure).slides.find(s=>s.id===slide.id)!;assert.equal(short.template!.variant,'standard');assert.ok(short.elements.filter(e=>e.type==='image').every(e=>e.h===248));
});
test('repeated problem and decision rows grow together after a direct long-text edit',()=>{
 for(const collection of COLLECTIONS)for(const prototype of ['problem','decision'] as const){const s=createLayout(prototype,1,collection.id),d=resolveDeckTextSizing(newDeck('Reading',[s]),measure),slide=d.slides[0],parent=slide.autoLayouts!.find(l=>l.name===(prototype==='problem'?'Problem fields':'Decision reasons'))!;assert.ok(parent);const children=slide.autoLayouts!.filter(l=>parent.order.includes(l.id)),body=slide.elements.find(e=>children[0].order.includes(e.id)&&e.type==='text'&&e.design?.text==='body')!;const text='Review the evidence and context before choosing a direction, then record the next decision and its owner.';
  const next=applyOperations(d,[{op:'update_element',slideId:s.id,elementId:body.id,patch:{text}}],d.revision,'manual',measure).slides[0],frames=next.autoLayouts!.filter(l=>parent.order.includes(l.id)).sort((a,b)=>a.y-b.y);assert.equal(next.elements.find(e=>e.id===body.id)!.text,text);for(let i=1;i<frames.length;i++)assert.ok(frames[i].y>=frames[i-1].y+frames[i-1].h-.1);}
});
test('dense matrix labels become numbered details, and short labels return to their original points',()=>{
 const s=createLayout('matrix',1,'portfolio'),d=resolveDeckTextSizing(newDeck('Matrix',[s]),measure),flow=s.autoLayouts!.find(l=>l.name==='Priority 2')!,e=s.elements.find(e=>flow.order.includes(e.id))!,text='Compare the evidence and the working context before choosing a direction. Record the next decision, its owner and the review date.';
 const next=applyOperations(d,[{op:'update_element',slideId:s.id,elementId:e.id,patch:{text}}],d.revision,'manual',measure),slide=next.slides[0];assert.equal(slide.template!.variant,'matrix-details');assert.equal(slide.elements.find(t=>t.id===e.id)!.text,text);assert.ok(slide.elements.some(t=>t.name==='Priority reference 2'&&t.text==='02'));
 const short=applyOperations(next,[{op:'update_element',slideId:s.id,elementId:e.id,patch:{text:'Visible handoff'}}],next.revision,'manual',measure).slides[0];assert.ok(!short.elements.some(t=>t.name==='Priority reference 2'));near(short.autoLayouts!.find(l=>l.id===flow.id)!.x,flow.x);near(short.autoLayouts!.find(l=>l.id===flow.id)!.y,flow.y);
});
test('minimal comparison captions borrow space from panels and restore the original balance',()=>{
 const s=createLayout('before-after',1,'minimal'),d=resolveDeckTextSizing(newDeck('Compare',[s]),measure),flow=s.autoLayouts!.find(l=>l.name==='Comparison explanation 1')!,e=s.elements.find(e=>flow.order.includes(e.id))!,text='Compare the evidence and the working context before choosing a direction. Record the next decision, its owner and the review date.';
 const next=applyOperations(d,[{op:'update_element',slideId:s.id,elementId:e.id,patch:{text}}],d.revision,'manual',measure);assert.equal(next.slides[0].template!.variant,'reading-comparison');assert.ok(next.slides[0].autoLayouts!.find(l=>l.id===flow.id)!.y<flow.y);
 const restored=applyOperations(next,[{op:'update_element',slideId:s.id,elementId:e.id,patch:{text:'A clear baseline.'}}],next.revision,'manual',measure);assert.equal(restored.slides[0].template!.variant,'standard');near(restored.slides[0].elements.find(e=>e.name==='Current comparison panel')!.h,264);
});
