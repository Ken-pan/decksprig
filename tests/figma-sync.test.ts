import {nativeTextSpans} from '../src/core/native-text-render';
import test from 'node:test';
import assert from 'node:assert/strict';
import {blankSlide,element,newDeck} from '../src/core/model';
import {mergeFigmaDeck,projectFigmaChanges} from '../src/core/figma-sync';
import {createSyncMedia} from '../src/core/figma-sync-media';
import {figmaSlideRange} from '../src/core/figma-slide-range';
import {importFigma} from '../src/importers/figma';
import {figmaBackgroundSvg} from '../src/importers/figma-background';
import {renderedNativeText,textLayoutFingerprint} from '../src/core/native-text-render';
import {lineMarkup} from '../src/core/lines';
import {Resvg} from '@resvg/resvg-js';
import {PNG} from 'pngjs';
import {figmaVisibleLayout} from '../src/core/native-text-layout';

const fixture=()=>newDeck('Original',[{...blankSlide(),elements:[element('text',{id:'title',text:'Original'}),element('rect',{id:'shape',x:200,fill:'#ff0000'})]}]);
test('simultaneous independent edits merge and conflicting text requires an explicit choice',()=>{
  const base=fixture(),local=structuredClone(base),remote=structuredClone(base);local.slides[0].elements[0].text='Local title';remote.slides[0].elements[1].x=320;
  const merged=mergeFigmaDeck(base,local,remote);assert.equal(merged.conflicts.length,0);assert.equal(merged.deck!.slides[0].elements[0].text,'Local title');assert.equal(merged.deck!.slides[0].elements[1].x,320);
  remote.slides[0].elements[0].text='Figma title';assert.equal(mergeFigmaDeck(base,local,remote).deck,undefined);
  const resolved=mergeFigmaDeck(base,local,remote,'remote');assert.equal(resolved.deck!.slides[0].elements[0].text,'Figma title');assert.equal(resolved.deck!.slides[0].elements[1].x,320);assert.equal(base.slides[0].elements[0].text,'Original');
});
test('remote insertions keep their native stacking position while local styling survives',()=>{
  const base=fixture(),local=structuredClone(base),remote=structuredClone(base);local.slides[0].elements[0].fill='#0000ff';remote.slides[0].elements.splice(1,0,element('ellipse',{id:'inserted'}));
  const result=mergeFigmaDeck(base,local,remote);assert.deepEqual(result.deck!.slides[0].elements.map(e=>e.id),['title','inserted','shape']);assert.equal(result.deck!.slides[0].elements[0].fill,'#0000ff');
});
test('native conversion differences never replace charts, metadata or unchanged typography',()=>{
  const sent=fixture();sent.slides[0].elements[0].animation={effect:'rise',duration:500,delay:0,trigger:'auto',order:1,easing:'smooth'};
  const before=structuredClone(sent);before.slides[0].elements[0].fontSize=31.8;const after=structuredClone(before);after.slides[0].elements[0].text='Native edit';
  const projected=projectFigmaChanges(sent,before,after);assert.equal(projected.slides[0].elements[0].fontSize,32);assert.equal(projected.slides[0].elements[0].animation!.effect,'rise');assert.equal(projected.slides[0].elements[0].text,'Native edit');
});
test('media is sent once after acknowledgment, and a failed transfer remains retryable',()=>{
  const sender=createSyncMedia(),receiver=createSyncMedia(),image='data:image/png;base64,'+'A'.repeat(512),value={src:image,source:{render:image},text:'hello'};
  const first=sender.encode(value);assert.equal(Object.keys(first.packet.media).length,1);assert.deepEqual(receiver.decode(first.packet),value);assert.equal(Object.keys(sender.encode(value).packet.media).length,1);
  sender.accept(first.packet);const second=sender.encode({...value,text:'edited'});assert.equal(Object.keys(second.packet.media).length,0);assert.deepEqual(receiver.decode(second.packet),{...value,text:'edited'});
  assert.throws(()=>createSyncMedia().decode(second.packet),/unavailable/);
});
test('slide ranges are bounded, de-duplicated and retain native reading order',()=>{
  assert.deepEqual(figmaSlideRange('4, 1–3, 2',10),[0,1,2,3]);assert.equal(figmaSlideRange('',10),undefined);for(const bad of ['0','5-2','151','all','1-101'])assert.throws(()=>figmaSlideRange(bad,150));
});
test('tiny native pages preserve their aspect ratio instead of failing the document schema',()=>{
  const d=importFigma({slides:[{id:'tiny',name:'Style strip',absoluteBoundingBox:{x:0,y:0,width:803,height:54},children:[]}]});assert.equal(d.height,100);assert(Math.abs(d.width/d.height-803/54)<1e-10);
});
test('native uppercase, hidden children and exact dash lengths remain editable',()=>{
  const d=importFigma({slides:[{id:'s',absoluteBoundingBox:{x:0,y:0,width:1920,height:1080},children:[{id:'t',type:'TEXT',visible:false,characters:'Design portfolio',absoluteBoundingBox:{x:10,y:10,width:400,height:60},style:{fontSize:40,fontFamily:'Inter',textCase:'UPPER'}},{id:'l',type:'LINE',dashPattern:[7,3],strokeCap:'NONE',absoluteBoundingBox:{x:10,y:100,width:100,height:0},strokes:[{type:'SOLID',color:{r:0,g:0,b:0}}],strokeWeight:1}]}]});
  const [text,line]=d.slides[0].elements;assert.equal(text.text,'Design portfolio');assert.equal(text.textCase,'upper');assert.equal(text.hidden,true);assert(lineMarkup(line).includes('stroke-dasharray="7 3"'));
});
test('native line breaks render until an authored edit invalidates them',()=>{
  const text=element('text',{text:'A long title',w:300,h:80});text.nativeTextLayout={fingerprint:textLayoutFingerprint(text),runs:[{text:'A long\ntitle'}],lineSpacing:36};
  assert.equal(renderedNativeText(text).text,'A long\ntitle');assert.equal(renderedNativeText({...text,text:'Edited title'}).text,'Edited title');assert.equal(text.text,'A long title');
});
test('native vertical gradient transform paints the original start and end colors',()=>{
  const svg=figmaBackgroundSvg([{type:'GRADIENT_LINEAR',gradientTransform:[[0,1,0],[-1,0,1]],gradientStops:[{position:0,color:{r:1,g:0,b:0,a:1}},{position:1,color:{r:0,g:0,b:1,a:1}}]}],{},100,100)!;
  const png=PNG.sync.read(new Resvg(svg).render().asPng());assert(png.data[0]>250);assert(png.data[2]<5);const end=(99*100)*4;assert(png.data[end]<5);assert(png.data[end+2]>250);
});
test('native SVG glyphs preserve named colors, fill alpha and per-span tracking',()=>{
 const e=element('text',{text:'Hello'}),layout=figmaVisibleLayout('<svg><text fill="white" fill-opacity="0.5"><tspan x="2" y="20" letter-spacing="1.5">Hello</tspan></text></svg>',e)!;
 assert.equal(layout.spans![0].color,'#ffffff80');assert.equal(layout.spans![0].letterSpacing,1.5);
});
test('a native text edit retains its new glyph layout and a native background remains separate',()=>{
 const sent=fixture(),after=structuredClone(sent),e=after.slides[0].elements[0];e.text='Native';e.nativeTextLayout={fingerprint:textLayoutFingerprint(e),runs:[{text:'Native'}],spans:[{text:'Native',x:0,y:24}]};
 assert.deepEqual(projectFigmaChanges(sent,sent,after).slides[0].elements[0].nativeTextLayout,e.nativeTextLayout);
 const image='data:image/png;base64,AAAA',d=importFigma({slides:[{id:'s',absoluteBoundingBox:{x:0,y:0,width:1920,height:1080},children:[]}],backgroundRenders:{s:image}});
 assert.equal(d.slides[0].elements[0].src,image);assert.equal(d.slides[0].elements[0].sourceId,'figma-background:s');
});

test('acknowledged native glyphs refresh after editing but never overwrite newer local text or mixed weights',async()=>{
 const {refreshFigmaTextRendering}=await import('../src/core/figma-sync'),sent=fixture(),native=structuredClone(sent);const n=native.slides[0].elements[0];n.nativeTextLayout={fingerprint:textLayoutFingerprint(n),runs:[{text:n.text}],outline:{src:'data:image/svg+xml,%3Csvg/%3E',x:2,y:3,w:100,h:30}};
 const accepted=refreshFigmaTextRendering(sent,sent,native);assert(accepted!==sent);assert.equal(accepted.slides[0].elements[0].nativeTextLayout!.outline!.w,100);assert.equal(refreshFigmaTextRendering(accepted,sent,native),accepted);
 const local=structuredClone(sent);local.slides[0].elements[0].text='Newer local text';assert.equal(refreshFigmaTextRendering(local,sent,native),local);
 const mixed=structuredClone(sent);mixed.slides[0].elements[0].runs=[{text:'Original',fontWeight:500}];assert.equal(refreshFigmaTextRendering(mixed,sent,native),mixed);
 const resized=structuredClone(sent);resized.slides[0].elements[0].w+=20;assert.equal(refreshFigmaTextRendering(resized,sent,native),resized);
});
test('render-only native glyph metadata does not create a content conflict',()=>{
 const base=fixture(),local=structuredClone(base),remote=structuredClone(base);const e=remote.slides[0].elements[0];e.nativeTextLayout={fingerprint:textLayoutFingerprint(e),runs:[{text:e.text}]};local.slides[0].elements[1].x+=20;assert.equal(mergeFigmaDeck(base,local,remote).conflicts.length,0);
});

test('a native visual edit does not multiply its baked alpha by an older relative opacity again',()=>{
 const s=blankSlide(),sent=newDeck('Mask',[{...s,elements:[element('image',{id:'mask',src:'data:image/png;base64,AAAA',opacity:.5})]}]),before=structuredClone(sent),after=structuredClone(sent);before.slides[0].elements[0].opacity=1;after.slides[0].elements[0].opacity=1;after.slides[0].elements[0].src='data:image/png;base64,BBBB';const projected=projectFigmaChanges(sent,before,after);assert.equal(projected.slides[0].elements[0].opacity,1);assert.equal(sent.slides[0].elements[0].opacity,.5);
});

test('Figma inside-aligned line strokes retain their painted center, including rotated lines',()=>{
 const native={id:'s',absoluteBoundingBox:{x:0,y:0,width:1920,height:1080},children:[{id:'l',type:'LINE',strokeAlign:'INSIDE',strokeWeight:6,absoluteBoundingBox:{x:0,y:140,width:1920,height:0},size:{x:1920,y:0},relativeTransform:[[1,0,0],[0,1,140]],strokes:[{type:'SOLID',color:{r:0,g:0,b:0}}]}]};const line=importFigma({slides:[native]}).slides[0].elements[0];assert.equal(line.y+line.h/2,137);assert.equal(line.strokeWidth,6);
});
test('native painted bounds override an inconsistent line alignment flag and retain image paint blending',()=>{
 const line={id:'l',type:'LINE',strokeAlign:'CENTER',strokeWeight:6,absoluteBoundingBox:{x:0,y:140,width:1920,height:0},absoluteRenderBounds:{x:0,y:134,width:1920,height:6},size:{x:1920,y:0},relativeTransform:[[1,0,0],[0,1,140]],strokes:[{type:'SOLID',color:{r:0,g:0,b:0}}]},image={id:'i',type:'RECTANGLE',blendMode:'PASS_THROUGH',absoluteBoundingBox:{x:0,y:0,width:1920,height:1080},fills:[{type:'IMAGE',blendMode:'SOFT_LIGHT',imageRef:'asset'}]};
 const slide=importFigma({slides:[{id:'s',absoluteBoundingBox:{x:0,y:0,width:1920,height:1080},children:[line,image]}],assets:{asset:'data:image/png;base64,AA=='}}).slides[0];assert.equal(slide.elements[0].y+slide.elements[0].h/2,137);assert.equal(slide.elements[1].blendMode,'soft-light');
});

test('rotated native glyph outlines undo the export viewport rotation inside the editable text box',()=>{
 const n={id:'t',type:'TEXT',characters:'A',style:{fontFamily:'Arial',fontSize:16},size:{x:100,y:20},relativeTransform:[[0,-1,100],[1,0,0]],absoluteBoundingBox:{x:80,y:0,width:20,height:100},absoluteRenderBounds:{x:81,y:10,width:14,height:80},fills:[{type:'SOLID',color:{r:0,g:0,b:0}}]},s={id:'s',absoluteBoundingBox:{x:0,y:0,width:1920,height:1080},children:[n]};
 const e=importFigma({slides:[s],textOutlines:{t:'<svg width="14" height="80" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h14v80H0Z"/></svg>'}}).slides[0].elements[0],v=e.nativeTextLayout!.outline!,m=v.transform!;assert.equal(e.rotation,90);assert.equal(v.x,41);assert.equal(v.y,-30);for(const [i,value]of [0,-1,1,0,40,60].entries())assert(Math.abs(m[i]-value)<1e-8);
});

test('native linked single-line text retains its glyph cache and editable content when SVG text spans are nested',()=>{
 const n={id:'t',type:'TEXT',characters:'name@email.com',style:{fontFamily:'Arial',fontSize:16},size:{x:180,y:20},relativeTransform:[[1,0,100],[0,1,100]],absoluteBoundingBox:{x:100,y:100,width:180,height:20},absoluteRenderBounds:{x:101,y:102,width:150,height:17},fills:[{type:'SOLID',color:{r:0,g:0,b:0}}]},s={id:'s',absoluteBoundingBox:{x:0,y:0,width:1920,height:1080},children:[n]};const e=importFigma({slides:[s],textSvgs:{t:'<svg><a href="https://example.com"><text>name@email.com</text></a></svg>'},textOutlines:{t:'<svg width="150" height="17" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h150v17H0Z"/></svg>'}}).slides[0].elements[0];assert.equal(e.type,'text');assert.equal(e.text,n.characters);assert(e.nativeTextLayout?.outline);assert.equal(nativeTextSpans({...e,text:'Edited link'}),undefined);
});
