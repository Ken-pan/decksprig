import {test} from 'node:test';
import assert from 'node:assert/strict';
import {element, blankSlide, newDeck, validateDeck} from '../src/core/model';
import {applyOperations, type Operation} from '../src/core/operations';
import {type TextSizeMeasure} from '../src/core/text-layout';
import {createLayout} from '../src/core/templates';
import {createLayoutCandidate, layoutProposal} from '../src/core/auto-layout';
import {nativeTextSpans,textLayoutFingerprint} from '../src/core/native-text-render';
import {textMetricsFingerprint,renderedPptxText} from '../src/core/native-text-layout';

const measure: TextSizeMeasure = e => ({w: e.text.length * e.fontSize, h: Math.ceil(e.text.length * e.fontSize / e.w) * e.fontSize * e.lineHeight});
function fixture(mode: 'fixed' | 'auto-width' | 'auto-height') {
  const s = blankSlide(); s.elements.push(element('text', {text: 'Evidence', w: 300, h: 160, textSizing: mode}));
  return newDeck('Text sizing', [s]);
}
function change(d: ReturnType<typeof fixture>, patch: Partial<ReturnType<typeof element>>, actor: 'ai'|'manual' = 'manual') {
  const s = d.slides[0]; return applyOperations(d, [{op: 'update_element', slideId: s.id, elementId: s.elements[0].id, patch}], d.revision, actor, measure);
}
test('old documents and fixed text keep authored dimensions after content and typography edits', () => {
  const d = fixture('fixed'); delete (d.slides[0].elements[0] as Partial<ReturnType<typeof element>>).textSizing;
  assert.equal(validateDeck(d).slides[0].elements[0].textSizing, 'fixed');
  const e = change(validateDeck(d), {text: 'Longer evidence', fontSize: 44}).slides[0].elements[0];
  assert.deepEqual([e.w,e.h], [300,160]);
});
test('automatic text geometry is part of the same manual/AI transaction and leaves source untouched', () => {
  for (const actor of ['manual','ai'] as const) for (const mode of ['auto-width','auto-height'] as const) {
    const d = fixture(mode), before = JSON.stringify(d);
    const result = change(d, {text: 'Updated evidence', fontSize: 40}, actor), e = result.slides[0].elements[0];
    assert.equal(e.w, mode === 'auto-height' ? 300 : 640); assert.equal(e.h, 150);
    assert.equal(result.revision, d.revision + 1); assert.equal(JSON.stringify(d), before);
  }
});
test('authored width keeps automatic height; authored height/corner sizes switch to fixed and moves preserve mode', () => {
  const d = fixture('auto-width');
  assert.equal(change(d, {x: 50}).slides[0].elements[0].textSizing, 'auto-width');
  const narrowed = change(d, {w: 60}).slides[0].elements[0];
  assert.equal(narrowed.textSizing,'auto-height'); assert.equal(narrowed.w,60); assert(narrowed.h > 160);
  const manual = change(d,{w:250,h:70}).slides[0].elements[0]; assert.deepEqual([manual.textSizing,manual.w,manual.h], ['fixed',250,70]);
  assert.equal(change(d,{textSizing:'auto-height',w:250,h:70}).slides[0].elements[0].textSizing,'auto-height');
});
test('invalid measurement and stale/locked AI changes roll back atomically', () => {
  const d = fixture('auto-height'), s=d.slides[0], e=s.elements[0], before=JSON.stringify(d);
  const ops: Operation[]=[{op:'update_element',slideId:s.id,elementId:e.id,patch:{text:'New'}}];
  assert.throws(()=>applyOperations(d,ops,0,'manual',()=>({w:300,h:NaN})));
  assert.equal(JSON.stringify(d),before);
  assert.throws(()=>applyOperations(d,ops,99,'ai',measure));
  e.locked=true; assert.throws(()=>applyOperations(d,ops,0,'ai',measure));
});
test('content-and-evidence templates wrap headings and body in persistent responsive frames', () => {
  const s=createLayout('split'),frame=s.autoLayouts!.find(layout=>layout.name==='Research introduction')!;
  const [title,body]=frame.order.map(id=>s.elements.find(element=>element.id===id)!);
  assert.ok(title.text.includes('broke down'));
  assert.equal(title.textSizing,'auto-height');assert.equal(title.layoutItem?.widthMode,'fill');assert.equal(title.layoutItem?.maxWidth,frame.w);
  assert.equal(body.textSizing,'auto-height');assert.equal(body.layoutItem?.widthMode,'fill');assert.ok(body.w<=frame.w);
});
test('automatic layout retains authored text sizing modes while repositioning text', () => {
  const d=fixture('auto-height'), s=d.slides[0];
  const candidate=createLayoutCandidate(d,s.id,'story');
  const proposal=layoutProposal(d,[candidate]);
  assert(proposal);
  const after=applyOperations(d,proposal.operations,proposal.baseRevision);
  assert.equal(after.slides[0].elements[0].textSizing,'auto-height');
});


test('case and paragraph-edge policy resize automatic text atomically for manual and AI edits',()=>{
  for(const actor of ['manual','ai'] as const)for(const policy of ['case','paragraph-edges']){
    const d=fixture(policy==='case'?'auto-width':'auto-height'),s=d.slides[0],e=s.elements[0];e.paragraphs=[{runs:[{text:e.text}],align:'left',spaceBefore:26,spaceAfter:22,indent:0,firstLineIndent:0}];const before=JSON.stringify(d),patch=policy==='case'?{textCase:'upper' as const}:{paragraphSpacingAtEdges:false};let measured=0;
    const result=applyOperations(d,[{op:'update_element',slideId:s.id,elementId:e.id,patch}],d.revision,actor,()=>{measured++;return {w:777,h:78};});
    assert(measured>0);assert.equal(result.revision,d.revision+1);assert.equal(result.slides[0].elements[0].w,policy==='case'?777:e.w);assert.equal(result.slides[0].elements[0].h,78);assert.equal(JSON.stringify(d),before);
    assert.throws(()=>applyOperations(d,[{op:'update_element',slideId:s.id,elementId:e.id,patch}],99,actor,()=>({w:777,h:78})));assert.equal(JSON.stringify(d),before);
  }
});

test('changing paragraph-edge policy invalidates native positions while preserving source metrics and untouched snapshots',()=>{
  for(const actor of ['manual','ai'] as const)for(const mode of ['fixed','auto-height'] as const){
    const d=fixture(mode),s=d.slides[0],e=s.elements[0];
    e.paragraphSpacingAtEdges=false;
    e.paragraphs=[{runs:[{text:e.text}],align:'left',spaceBefore:26,spaceAfter:22,indent:0,firstLineIndent:0}];
    e.nativeTextLayout={fingerprint:textLayoutFingerprint(e),metricsFingerprint:textMetricsFingerprint(e),runs:[{text:'Source wrapping'}],lineSpacing:42,intrinsicLineHeight:1.25};
    const before=JSON.stringify(d),snapshot=structuredClone(e.nativeTextLayout);
    for(const patch of [{paragraphSpacingAtEdges:false},{x:50}]){
      const same=applyOperations(d,[{op:'update_element',slideId:s.id,elementId:e.id,patch}],0,actor,()=>{throw Error('Untouched native geometry must survive');});
      assert.deepEqual(nativeTextSpans(same.slides[0].elements[0]),snapshot);
    }
    let measured=0;
    const patch={paragraphSpacingAtEdges:true},result=applyOperations(d,[{op:'update_element',slideId:s.id,elementId:e.id,patch}],0,actor,()=>{measured++;return {w:300,h:208};}),changed=result.slides[0].elements[0];
    assert.equal(nativeTextSpans(changed),undefined);
    assert.deepEqual(changed.nativeTextLayout,{...snapshot,fingerprint:''});
    assert.equal(renderedPptxText(changed).text,e.text);
    assert.equal(renderedPptxText(changed).lineHeight,1.25);
    assert.equal(measured>0,mode==='auto-height');assert.equal(changed.h,mode==='fixed'?160:208);
    assert.equal(result.revision,1);assert.equal(JSON.stringify(d),before);
    assert.throws(()=>applyOperations(d,[{op:'update_element',slideId:s.id,elementId:e.id,patch}],99,actor));
    assert.equal(JSON.stringify(d),before);
  }
});
