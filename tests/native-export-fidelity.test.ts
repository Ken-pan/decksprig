import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {blankSlide,element,newDeck} from '../src/core/model';
import {keynoteState} from '../src/core/keynote-source';
import {googleTextEdits,googleEditRequests} from '../src/core/google-source';
import {googleFingerprint,exportGoogle,verifyGoogleExport} from '../server/google-export';
import {applyOperations} from '../src/core/operations';
import {figmaVisibleRuns,figmaVisibleLayout,textLayoutFingerprint,textMetricsFingerprint,renderedPptxText} from '../src/core/native-text-layout';
import {buildPptx} from '../src/core/pptx-export';
import {importPptx} from '../src/importers/pptx';
import {importGoogle} from '../src/importers/google';

test('Google import keeps native geometry hashes stable across runtime atan2 rounding',async()=>{
 const size={width:{magnitude:120,unit:'PT'},height:{magnitude:60,unit:'PT'}},transform={scaleX:1,scaleY:1,shearY:.2,translateX:24,translateY:36,unit:'PT'};
 const bundle={presentation:{presentationId:'source_google_123',pageSize:{width:{magnitude:720,unit:'PT'},height:{magnitude:405,unit:'PT'}},slides:[{objectId:'page1',pageElements:[{objectId:'line1',size,transform,line:{lineProperties:{}}},{objectId:'shape1',size,transform,shape:{shapeType:'RECTANGLE',shapeProperties:{shapeBackgroundFill:{solidFill:{color:{rgbColor:{red:1}}}}}}}]}]}};
 const before=await keynoteState(importGoogle(bundle)),atan2=Math.atan2;
 let after:typeof before;
 try{Math.atan2=(y,x)=>atan2(y,x)+Number.EPSILON;after=await keynoteState(importGoogle(bundle));}finally{Math.atan2=atan2;}
 assert.deepEqual(googleTextEdits(before,after),[]);
 const moved=importGoogle(bundle);moved.slides[0].elements[0].rotation+=.001;
 const movedState=await keynoteState(moved);assert.throws(()=>googleTextEdits(before,movedState),/Native Google export/);
});

test('native Google edits retain the original object, mixed typography and paragraph boundaries',async()=>{
 const s=blankSlide(),e=element('text',{sourceId:'native_title',text:'Hello!\nBody stays',fontFamily:'Arial',paragraphs:[{runs:[{text:'Hello!',fontSize:32,fontFamily:'Arial'}],align:'left',spaceBefore:0,spaceAfter:12,indent:0,firstLineIndent:0},{runs:[{text:'Body stays',fontSize:18,fontFamily:'Arial'}],align:'left',spaceBefore:12,spaceAfter:0,indent:0,firstLineIndent:0}]});s.elements=[e];const d=newDeck('Native',[s]),base=await keynoteState(d);
 const edited=applyOperations(d,[{op:'update_element',slideId:s.id,elementId:e.id,patch:{text:'Hello, team!\nBody stays'}}],0,'manual');
 const edits=googleTextEdits(base,await keynoteState(edited));assert.deepEqual(edits,[{objectId:'native_title',start:5,end:5,text:', team'}]);
 const native={slides:[{pageElements:[{objectId:'native_title',shape:{text:{textElements:[{startIndex:0,endIndex:7,textRun:{content:'Hello!\n',style:{fontFamily:'Arial',fontSize:{magnitude:24,unit:'PT'}}}}]}}}]}]};const requests=googleEditRequests(edits,native)as any[];
 assert.equal(requests.length,2);assert.equal(requests[1].updateTextStyle.style.fontSize.magnitude,24);
 const moved=applyOperations(d,[{op:'update_element',slideId:s.id,elementId:e.id,patch:{x:300}}],0,'manual'),movedState=await keynoteState(moved);assert.throws(()=>googleTextEdits(base,movedState),/Native Google export/);
 const extra=applyOperations(d,[{op:'update_element',slideId:s.id,elementId:e.id,patch:{text:'Hello!\nBody\nNew paragraph'}}],0,'manual'),extraState=await keynoteState(extra);assert.throws(()=>googleTextEdits(base,extraState),/Native Google export/);
 assert.throws(()=>googleTextEdits(base,{...base,slides:[{...base.slides[0],notes:'Changed'}]}),/Native Google export/);
});

test('Google UTF-16 text ranges never split an emoji surrogate pair',async()=>{
 const s=blankSlide(),e=element('text',{sourceId:'native_emoji',text:'Hi 😀',runs:[{text:'Hi 😀'}]});s.elements=[e];const d=newDeck('Emoji',[s]),base=await keynoteState(d);
 const edited=applyOperations(d,[{op:'update_element',slideId:s.id,elementId:e.id,patch:{text:'Hi 😁'}}],0,'manual');assert.deepEqual(googleTextEdits(base,await keynoteState(edited)),[{objectId:'native_emoji',start:3,end:5,text:'😁'}]);
});

test('native Google copy targets My Drive, checks source changes and verifies the resulting whole text',async()=>{
 const before={presentationId:'source_google_123',title:'Original',slides:[{objectId:'page1',pageElements:[{objectId:'text1',transform:{scaleX:1,scaleY:1,translateX:12,translateY:20,unit:'PT'},size:{width:{magnitude:300,unit:'PT'},height:{magnitude:80,unit:'PT'}},shape:{text:{textElements:[{textRun:{content:'Hello!\nBody stays\n'}}]}}}]}]};
 const requests=[{insertText:{objectId:'text1',insertionIndex:5,text:', team'}}],after=structuredClone(before);after.presentationId='copied_google_123';after.slides[0].pageElements[0].shape.text.textElements[0].textRun.content='Hello, team!\nBody stays\n';
 const plan={source:{id:crypto.randomUUID(),sha256:'a'.repeat(64),presentationId:before.presentationId},sourceFingerprint:googleFingerprint(before),sourcePresentation:before,requests,edits:1};const calls:{url:string;body:any}[]=[];
 assert.equal(googleFingerprint({...before,commentsViewMode:'COMMENTS_VIEW_MODE_OMITTED'}),googleFingerprint(before));
 assert.equal(googleFingerprint({...before,commentsViewMode:'COMMENTS_VIEW_MODE_INCLUDED'}),googleFingerprint(before));
 const transport=(async(url:any,options:any)=>{const body=options.body?JSON.parse(options.body):undefined;calls.push({url:String(url),body});let result:any=before;if(String(url).includes('/copy?'))result={id:after.presentationId};else if(String(url).includes('fields=revisionId'))result={revisionId:'revision'};else if(String(url).includes(':batchUpdate'))result={};else if(String(url).includes(after.presentationId))result=after;return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});})as typeof fetch;
 const result=await exportGoogle({token:'fake-unit-test-token',title:'Copy'},transport,async()=>plan);assert.equal(result.fidelity,'native-source');assert.equal(result.nativeEdits,1);assert.deepEqual(calls.find(c=>c.url.includes('/copy?'))!.body.parents,['root']);assert.equal(calls.filter(c=>c.url.includes(':batchUpdate')).length,1);
 const corrupted=structuredClone(after);corrupted.slides[0].pageElements[0].shape.text.textElements[0].textRun.content='Wrong';assert.throws(()=>verifyGoogleExport(before,corrupted,requests),/Native text verification failed/);
 let copied=false;const changed=(async(url:any)=>{if(String(url).includes('/copy?'))copied=true;const altered=structuredClone(before);altered.slides[0].pageElements[0].transform.translateY=99;return new Response(JSON.stringify(altered));})as typeof fetch;
 await assert.rejects(()=>exportGoogle({token:'fake-unit-test-token'},changed,async()=>plan),/source changed/);assert.equal(copied,false);
});

test('Figma native spans preserve the visible truncation and complete editable source through PPTX',async()=>{
 const s=blankSlide(),full='First row second row hidden remainder',e=element('text',{text:full,x:80,y:100,w:410,h:71,fontFamily:'Inter',fontSize:24,fill:'#303030',lineHeight:1.5,maxLines:2,runs:[{text:full,fontFamily:'Inter',fontSize:24,color:'#303030'}]});
 const svg='<svg><text font-family="Inter" font-size="24" fill="#303030"><tspan x="0" y="18">First row </tspan><tspan x="0" y="54">second row </tspan></text></svg>';
 const runs=figmaVisibleRuns(svg,e)!;assert.equal(runs.map(r=>r.text).join(''),'First row \nsecond row…');e.nativeTextLayout={fingerprint:textLayoutFingerprint(e),runs};s.elements=[e];const deck=newDeck('Native truncation',[s],1920,1080);
 const punctuation=element('text',{text:'joy — soul’s medicine',maxLines:2});assert.equal(figmaVisibleRuns('<svg><text font-size="24"><tspan y="18">joy &#x2014; soul&#x2019;s medicine</tspan></text></svg>',punctuation)!.map(r=>r.text).join(''),'joy — soul’s medicine');
 const bytes=await buildPptx(deck),z=await JSZip.loadAsync(bytes),xml=await z.file('ppt/slides/slide1.xml')!.async('string');assert(xml.includes('vertOverflow="ellipsis"'));assert(xml.includes('<a:noAutofit/>'));assert(xml.includes('sz="1800"'));assert(xml.includes('second row…'));assert(!xml.includes('hidden remainder'));assert(z.file('customXml/deck-studio-text.xml'));
 const returned=await importPptx(bytes,'native.pptx'),out=returned.slides[0].elements.find(e=>e.type==='text')!;assert.equal(returned.width,1920);assert.equal(out.fontSize,24);assert.equal(out.maxLines,2);assert.equal(out.text,full);assert.deepEqual(out.runs,e.runs);
 const changed={...e,text:'Edited full source'};assert.equal(renderedPptxText(changed).text,changed.text);const resized={...e,w:500};assert.equal(renderedPptxText(resized).text,full);
 z.file('ppt/slides/slide1.xml',xml.replace('First row','Edited row'));const nativeEdit=await importPptx(await z.generateAsync({type:'uint8array'}),'edited.pptx');assert(nativeEdit.slides[0].elements.find(e=>e.type==='text')!.text.startsWith('Edited row'));assert(!nativeEdit.slides[0].elements.find(e=>e.type==='text')!.text.includes('hidden remainder'));
});

test('single-line native labels keep their painted right anchor and authored editing box',async()=>{
 const s=blankSlide(),e=element('text',{x:1200,y:900,w:444,h:36,text:'A native single-line label',align:'right',fontFamily:'Arial',fontSize:24,fill:'#303030',runs:[{text:'A native single-line label',fontFamily:'Arial',fontSize:24,color:'#303030'}]});e.nativeTextLayout={fingerprint:textLayoutFingerprint(e),runs:e.runs!};s.elements=[e];
 const rendered=renderedPptxText(e);assert.equal(rendered.x+rendered.w,e.x+e.w);assert.equal(rendered.fontSize,24);assert.equal(rendered.wrap,false);assert(rendered.w>e.w);
 const bytes=await buildPptx(newDeck('Native label',[s],1920,1080)),d=await importPptx(bytes,'label.pptx'),out=d.slides[0].elements.find(v=>v.type==='text')!;assert.equal(out.x,e.x);assert.equal(out.w,e.w);assert.equal(out.wrap,true);assert.equal(out.text,e.text);
 const z=await JSZip.loadAsync(bytes),xml=await z.file('ppt/slides/slide1.xml')!.async('string');z.file('ppt/slides/slide1.xml',xml.replace(/<a:rPr([^>]*?) b="0"/, '<a:rPr$1 b="1"'));const edited=await importPptx(await z.generateAsync({type:'uint8array'}),'bold.pptx');assert.equal(edited.slides[0].elements.find(v=>v.type==='text')!.fontWeight,700);
 const caption=element('text',{text:'So create, create, create. Full remainder',fontSize:24,maxLines:1}),visible=figmaVisibleLayout('<svg><text font-size="24"><tspan y="18">So create, create, cr</tspan></text></svg>',caption)!;
 assert.equal(visible.runs.map(r=>r.text).join(''),'So create, create, c…');assert.equal(visible.wrapSlack,6);
 caption.nativeTextLayout={fingerprint:textLayoutFingerprint(caption),...visible};const painted=renderedPptxText(caption);assert.equal(painted.fontSize,24);assert.equal(painted.x,caption.x);assert.equal(painted.w,caption.w+6);
 const returnedCaption=await importPptx(await buildPptx(newDeck('Visible terminal',[{...s,elements:[caption]}],1920,1080)),'terminal.pptx');assert.equal(returnedCaption.slides[0].elements[0].w,caption.w);assert.equal(returnedCaption.slides[0].elements[0].text,caption.text);
});

test('Figma baseline spacing uses absolute points instead of destination-font percentage metrics',async()=>{
 const s=blankSlide(),e=element('text',{text:'First line second line',x:80,y:720,w:410,h:78,fontFamily:'Inter',fontSize:32,lineHeight:1.2});
 const native=figmaVisibleLayout('<svg><text font-family="Inter" font-size="32"><tspan x="0" y="24.1364">First line</tspan><tspan x="0" y="63.1364">second line</tspan></text></svg>',e)!;
 assert.equal(native.lineSpacing,39);e.nativeTextLayout={fingerprint:textLayoutFingerprint(e),...native};s.elements=[e];
 const rendered=renderedPptxText(e);assert.equal(rendered.paragraphs![0].lineSpacing,39);assert.equal(rendered.fontSize,32);
 const bytes=await buildPptx(newDeck('Native baseline',[s],1920,1080)),zip=await JSZip.loadAsync(bytes),xml=await zip.file('ppt/slides/slide1.xml')!.async('string');
 assert.match(xml,/<a:lnSpc><a:spcPts val="2925"\/>/);assert(!xml.includes('<a:spcPct'));
 const returned=await importPptx(bytes,'baseline.pptx'),out=returned.slides[0].elements[0];assert.equal(out.text,e.text);assert.equal(out.nativeTextLayout!.lineSpacing,39);assert.equal(out.lineHeight,1.2);
});

test('source intrinsic font leading survives PPTX conversion without accumulating padding or replacing native margin edits',async()=>{
 const s=blankSlide(),e=element('text',{text:'First row second row',x:80,y:720,w:410,h:95,fontFamily:'Inter',fontSize:24,lineHeight:1.5,padding:{top:2,bottom:3,left:4,right:5}});
 const native=figmaVisibleLayout('<svg><text font-family="Inter" font-size="24"><tspan y="18">First row</tspan><tspan y="54">second row</tspan></text></svg>',e)!;
 e.nativeTextLayout={fingerprint:textLayoutFingerprint(e),...native,intrinsicLineHeight:1.2394366455078125};s.elements=[e];
 const halfLeading=(36-36/1.2394366455078125)/2,rendered=renderedPptxText(e);
 assert.equal(rendered.paragraphs![0].lineHeight,1.2394366455078125);assert.equal(rendered.padding!.top,2+halfLeading);assert.equal(rendered.padding!.bottom,3);
 const bytes=await buildPptx(newDeck('Source font metrics',[s],1920,1080)),zip=await JSZip.loadAsync(bytes),xml=await zip.file('ppt/slides/slide1.xml')!.async('string');
 assert.match(xml,/<a:lnSpc><a:spcPct val="123944"\/>/);assert.match(xml,/<a:noAutofit\/>/);
 const once=await importPptx(bytes,'leading.pptx'),out=once.slides[0].elements[0];assert.deepEqual(out.padding,e.padding);assert.equal(out.lineHeight,1.5);assert.equal(out.fontSize,24);
 const twice=await importPptx(await buildPptx(once),'leading-again.pptx');assert.deepEqual(twice.slides[0].elements[0].padding,e.padding);assert.equal(twice.slides[0].elements[0].nativeTextLayout!.intrinsicLineHeight,e.nativeTextLayout.intrinsicLineHeight);
 zip.file('ppt/slides/slide1.xml',xml.replace(/tIns="\d+"/,'tIns="95250"'));
 const edited=await importPptx(await zip.generateAsync({type:'uint8array'}),'native-margin.pptx');assert.equal(edited.slides[0].elements[0].padding!.top,10);
 const middle={...e,verticalAlign:'middle' as const},bottom={...e,verticalAlign:'bottom' as const};
 middle.nativeTextLayout={...e.nativeTextLayout,fingerprint:textLayoutFingerprint(middle)};bottom.nativeTextLayout={...e.nativeTextLayout,fingerprint:textLayoutFingerprint(bottom)};
 assert.deepEqual(renderedPptxText(middle).padding,e.padding);assert.equal(renderedPptxText(bottom).padding!.bottom,3+halfLeading);
});

test('manual and AI wording edits keep source font leading while releasing old visible lines',async()=>{
 const s=blankSlide(),e=element('text',{text:'First line second line',fontFamily:'Inter',fontSize:24,lineHeight:1.5,maxLines:2,runs:[{text:'First line second line',fontFamily:'Inter',fontSize:24,fontWeight:400}]});
 const visible=figmaVisibleLayout('<svg><text font-family="Inter" font-size="24"><tspan y="18">First line</tspan><tspan y="54">second line</tspan></text></svg>',e)!;
 e.nativeTextLayout={fingerprint:textLayoutFingerprint(e),metricsFingerprint:textMetricsFingerprint(e),...visible,intrinsicLineHeight:1.2394366455078125};s.elements=[e];const d=newDeck('Editable source metrics',[s],1920,1080);
 for(const origin of ['manual','ai'] as const){
  const edited=applyOperations(d,[{op:'update_element',slideId:s.id,elementId:e.id,patch:{text:'New content remains editable'}}],0,origin),out=edited.slides[0].elements[0],painted=renderedPptxText(out);
  assert.equal(painted.text,out.text);assert(!painted.text.includes('First line'));assert.equal(painted.wrap,out.wrap);assert.equal(painted.w,out.w);assert.equal(painted.fontSize,24);assert.equal(painted.paragraphs![0].lineHeight,1.2394366455078125);assert(painted.padding!.top>0);
  const returned=await importPptx(await buildPptx(edited),'edited-source.pptx'),back=returned.slides[0].elements[0];assert.equal(back.text,out.text);assert.equal(back.lineHeight,1.5);assert.equal(back.fontSize,24);
  const resized={...out,fontSize:32};assert.equal(renderedPptxText(resized),resized);
 }
});


test('editable auto-height PowerPoint text keeps full content visible while explicit crops remain',async()=>{
 const slide=blankSlide(),base=element('text',{id:'growing-body',text:'Phone styled 中文🙂 next',fontFamily:'Arial',fontSize:32,h:40,textSizing:'auto-height',runs:[{text:'Phone ',fontWeight:700,color:'#663399'},{text:'styled',fontSize:18,color:'#0000ff'},{text:' 中文🙂 next'}]});
 slide.elements=[base,{...base,id:'fixed-body',textSizing:'fixed'},{...base,id:'clipped-body',clipText:true},{...base,id:'limited-body',maxLines:1}];
 const deck=newDeck('Text visibility',[slide]),snapshot=structuredClone(deck),zip=await JSZip.loadAsync(await buildPptx(deck)),xml=await zip.file('ppt/slides/slide1.xml')!.async('string'),shapes=new Map([...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].map(match=>[match[0].match(/name="([^"]+)"/)?.[1],match[0]]));
 assert.match(shapes.get('growing-body')!,/vertOverflow="overflow"/);assert.match(shapes.get('growing-body')!,/<a:spAutoFit\/>/);assert.match(shapes.get('growing-body')!,/Phone /);assert.match(shapes.get('growing-body')!,/sz="1350"/);assert.match(shapes.get('fixed-body')!,/vertOverflow="clip"/);assert.match(shapes.get('clipped-body')!,/vertOverflow="clip"/);assert.match(shapes.get('limited-body')!,/vertOverflow="ellipsis"/);assert.deepEqual(deck,snapshot);
});


test('legacy connector strokes use the same visible fallback as canvas and keep their endpoints',async()=>{
 const slide=blankSlide(),line=element('line',{id:'legacy-connector',x:900,y:440,w:350,h:120,fill:'#252b29',stroke:'transparent',strokeWidth:0,text:'Connector label',fontFamily:'Arial'});slide.elements=[line];const deck=newDeck('Connector',[slide]),before=structuredClone(deck),zip=await JSZip.loadAsync(await buildPptx(deck)),xml=await zip.file('ppt/slides/slide1.xml')!.async('string'),shape=[...xml.matchAll(/<p:cxnSp>[\s\S]*?<\/p:cxnSp>/g)].map(m=>m[0]).find(s=>s.includes('name="legacy-connector"'))!;
 assert.match(shape,/<a:ln w="19050" cap="rnd">/);assert.match(shape,/<a:srgbClr val="252b29"><a:alpha val="100000"/);assert.match(shape,/<a:off x="8572500" y="4191000"/);assert.match(shape,/<a:ext cx="3333750" cy="1143000"/);assert.match(xml,/Connector label/);assert.deepEqual(deck,before);
});
