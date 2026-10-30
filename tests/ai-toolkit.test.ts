import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankSlide,element,newDeck} from '../src/core/model';
import {applyOperations,OperationSchema} from '../src/core/operations';
import {EditMedia,readAIContext,validateAIProposal} from '../src/core/ai-editing';
import {editingToolkit,strictToolSchema,type EditingServices} from '../src/core/ai-tools';
import {proposeAI,providerBase} from '../server/ai';
import {requestAI} from '../src/core/ai-client';
const fixture=()=>{const slide=blankSlide();slide.elements=[element('text',{id:'title',text:'Original'}),element('rect',{id:'locked',locked:true})];return newDeck('AI fixture',[slide,blankSlide()]);};
const invoke=(kit:ReturnType<typeof editingToolkit>,name:string,args:any={})=>{const tool=kit.tools.find(t=>t.name===name)!;return tool.run(tool.schema.parse(args)) as Promise<any>;};

for(const partial of ['tool','final'] as const)test(`model combines prepared page changes with typed edits after rejecting a partial ${partial} submission`,async()=>{
 const deck=fixture();let turn=0,repaired=false;
 const transport:typeof fetch=async(_url,init)=>{
  const body=JSON.parse(init!.body as string);turn++;
  const call=(name:string,args:unknown,id:string)=>({type:'function_call',call_id:id,name,arguments:JSON.stringify(args)});
  if(turn===1)return Response.json({output:[
   call('prepare_elements',{slideId:deck.slides[1].id,elements:[{type:'text',text:'A prepared takeaway',box:{x:80,y:80,w:600,h:80}}]},'prepare-a'),
   call('prepare_elements',{slideId:deck.slides[1].id,elements:[{type:'rect',box:{x:80,y:200,w:400,h:120}}]},'prepare-b')
  ]});
  const updates=[{slideId:deck.slides[0].id,elementId:'title',text:'Complete proposal'}];
  if(turn===2)return Response.json({output:partial==='tool'?[call('propose_updates',{baseRevision:0,summary:'Partial',updates},'partial')]:[{type:'message',content:[{type:'output_text',text:JSON.stringify({proposalJson:JSON.stringify({baseRevision:0,summary:'Partial',operations:[{op:'update_element',slideId:deck.slides[0].id,elementId:'title',patch:{text:'Complete proposal'}}]})})}]}]});
  repaired=JSON.stringify(body.input).includes('Prepared changes would be omitted');
  const recipeIds=body.input.filter((item:any)=>item.type==='function_call_output').map((item:any)=>JSON.parse(item.output).recipeId).filter(Boolean);
  return Response.json({output:[call('propose_updates',{baseRevision:0,summary:'Combined',recipeIds,updates},'complete')]});
 };
 const proposal=await proposeAI(deck,'Update both pages together',{slideIds:deck.slides.map(s=>s.id),elementIds:[]},{provider:'openai',baseUrl:'',model:'fixture',apiKey:'fixture-key'},{transport});
 assert.equal(turn,3);assert(repaired);assert.equal(proposal.operations.length,3);
 const after=applyOperations(deck,proposal.operations,0,'ai');assert.equal(after.slides[0].elements[0].text,'Complete proposal');assert.equal(after.slides[1].elements.length,2);assert.equal(deck.slides[1].elements.length,0);
});

test('discovery uses the complete canonical operation schema and strictly typed tool inputs',async()=>{
 const deck=fixture(),kit=editingToolkit(async()=>deck),caps=await invoke(kit,'get_capabilities');
 assert.deepEqual(caps.operations,OperationSchema.def.options.map(s=>s.shape.op.def.values[0]));
 for(const op of caps.operations)assert(await invoke(kit,'get_edit_schema',{operation:op}));
 const elementSchema=JSON.stringify(await invoke(kit,'get_edit_schema',{operation:'update_element'}));for(const field of ['cells','shape','crop','runs','paragraphs','prototype','animation','chart'])assert(elementSchema.includes(`"${field}"`));
 const inspect=(schema:any)=>{if(schema.type==='object'){assert.equal(schema.additionalProperties,false);assert.deepEqual(schema.required,Object.keys(schema.properties));}for(const [k,v] of Object.entries(schema)){if(k==='properties')Object.values(v as any).forEach(inspect);else if(Array.isArray(v))v.forEach(x=>typeof x==='object'&&x&&inspect(x));else if(v&&typeof v==='object')inspect(v);}};
 for(const tool of kit.tools)inspect(strictToolSchema(tool.schema));
});

test('context pagination keeps original font/image/source bytes out of model input and reusable media intact',()=>{
 const deck=fixture(),media=new EditMedia();deck.fonts=[{family:'Test font',name:'fixture',weight:'400',style:'normal',data:'data:font/woff2;base64,AAAA'}];deck.slides[0].elements.push(element('image',{id:'image',src:'data:image/png;base64,AAAA'}));
 const before=JSON.stringify(deck),context=readAIContext(deck,media,{limit:1});const json=JSON.stringify(context);
 assert(!json.includes('base64'));assert.equal(context.nextOffset,1);assert(json.includes('deck-studio-media:'));
 const restored=media.hydrate(context);assert.equal((restored.slides[0] as any).elements.find((e:any)=>e.id==='image').src,deck.slides[0].elements.at(-1)!.src);assert.equal(JSON.stringify(deck),before);
 assert.throws(()=>media.hydrate('deck-studio-media:missing'),/expired/);
});

test('AI page outlines identify the authored heading instead of the page number',()=>{
 const deck=fixture(),slide=deck.slides[1];slide.elements=[element('text',{name:'Page number',text:'02',pageElement:{kind:'page-number'}}),element('text',{name:'Slide heading',text:'Actual delivery page'})];
 const outline=readAIContext(deck,new EditMedia(),{detail:'outline',slideIds:[slide.id]});assert.equal(outline.slides[0].number,2);assert.equal(outline.slides[0].heading,'Actual delivery page');
 const content=readAIContext(deck,new EditMedia(),{slideIds:[slide.id]});assert.equal(content.slides[0].heading,'Actual delivery page');
});

test('scope validation protects selection, global operations, locked objects and sources atomically',()=>{
 const deck=fixture(),slide=deck.slides[0],scope={slideIds:[slide.id],elementIds:['title']};
 const p=(operations:any[])=>({baseRevision:0,summary:'Fixture',operations});
 assert.throws(()=>validateAIProposal(deck,p([{op:'delete_element',slideId:slide.id,elementId:'locked'}]),scope),/outside/);
 assert.throws(()=>validateAIProposal(deck,p([{op:'set_page_elements',settings:{header:'x',footer:'',date:'',pageNumbers:false,numberFormat:'number',startAt:1,hideOnCover:true,divider:false}}]),scope),/scope/);
 assert.throws(()=>validateAIProposal(deck,p([{op:'update_element',slideId:slide.id,elementId:'title',patch:{sourceId:'fake'}}]),scope),/source metadata/);
 assert.throws(()=>validateAIProposal(deck,p([{op:'update_element',slideId:slide.id,elementId:'locked',patch:{text:'x'}}])),/locked/);
 assert.throws(()=>validateAIProposal(deck,{...p([{op:'rename_deck',title:'x'}]),baseRevision:99}),/changed/);
 assert.equal(deck.slides[0].elements[0].text,'Original');
});

test('prepared resources preserve attribution, hydrate locally and allow one atomic image insertion',async()=>{
 const deck=fixture(),resource={id:'iconify:lucide:circle',kind:'icon' as const,provider:'Lucide',title:'Circle',creator:'Lucide',sourceUrl:'https://lucide.dev/icons/circle',license:'ISC',licenseUrl:'https://lucide.dev/license',attribution:'Lucide',attributionRequired:false};
 const services:EditingServices={searchResources:async()=>({items:[],page:1,hasMore:false}),resourceCatalog:async()=>({}),importResource:async()=>({src:'data:image/svg+xml;base64,PHN2Zy8+',resource})};
 const kit=editingToolkit(async()=>deck,services),prepared=await invoke(kit,'prepare_resource',{id:resource.id});assert(!JSON.stringify(prepared).includes('base64'));
 const proposal=await invoke(kit,'propose_edit',{proposalJson:JSON.stringify({baseRevision:0,summary:'Add icon',operations:[{op:'add_element',slideId:deck.slides[0].id,element:{id:'new-icon',type:'image',name:'Circle',x:10,y:10,w:40,h:40,...prepared}}]})});
 const next=applyOperations(deck,proposal.operations,0,'ai');assert.deepEqual(next.slides[0].elements.at(-1)?.resource,resource);assert.equal(next.slides[0].elements.at(-1)?.src,'data:image/svg+xml;base64,PHN2Zy8+');assert.equal(deck.slides[0].elements.length,2);
});

test('resource placement preserves credits directly and an incompatible icon style offers explicit alternatives',async()=>{
 const deck=fixture(),resource={id:'iconify:lucide:file-code',kind:'icon' as const,provider:'Lucide',title:'File code',creator:'Lucide',sourceUrl:'https://lucide.dev/icons/file-code',license:'ISC',licenseUrl:'https://lucide.dev/license',attribution:'Lucide',attributionRequired:false};
 const services:EditingServices={resourceCatalog:async()=>({}),searchResources:async params=>({items:params.get('style')==='solid'?[]:[{...resource,previewUrl:'/preview'}],page:1,hasMore:false}),importResource:async()=>({src:'data:image/svg+xml;base64,PHN2Zy8+',resource})};
 const kit=editingToolkit(async()=>deck,services,{slideIds:[deck.slides[1].id],elementIds:[]});
 const found=await invoke(kit,'search_resources',{kind:'icon',query:'file-code',set:'lucide',style:'solid'});assert.equal(found.items.length,0);assert.equal(found.alternatives.items[0].id,resource.id);assert.match(found.alternatives.guidance,/outline/);
 const recipe=await invoke(kit,'prepare_resource',{id:resource.id,placement:{slideId:deck.slides[1].id,box:{x:80,y:320,w:64,h:64}}});assert.equal(recipe.changes,1);assert(!JSON.stringify(recipe).includes('base64'));
 const proposal=await invoke(kit,'propose_prepared_edits',{baseRevision:0,summary:'Insert icon',recipeIds:[recipe.recipeId]});const after=applyOperations(deck,proposal.operations,0,'ai');const image=after.slides[1].elements[0];assert.deepEqual(image.resource,resource);assert.equal(image.src,'data:image/svg+xml;base64,PHN2Zy8+');assert.equal(image.x,80);assert.equal(image.w,64);assert.equal(deck.slides[1].elements.length,0);
 await assert.rejects(()=>invoke(kit,'prepare_resource',{id:resource.id,placement:{slideId:deck.slides[0].id,box:{x:0,y:0,w:64,h:64}}}),/scope/);
});

test('prepared submission combines typed copy updates and deletions in one reviewable transaction',async()=>{
 const deck=fixture();deck.slides[0].elements.push(element('text',{id:'remove-me',text:'Old number'}));const kit=editingToolkit(async()=>deck);
 const recipe=await invoke(kit,'prepare_elements',{slideId:deck.slides[1].id,elements:[{type:'rect',box:{x:80,y:100,w:64,h:64}}]});
 const proposal=await invoke(kit,'propose_prepared_edits',{baseRevision:0,summary:'Complete change',recipeIds:[recipe.recipeId],updates:[{slideId:deck.slides[0].id,elementId:'title',text:'Updated'}],removeElements:[{slideId:deck.slides[0].id,elementId:'remove-me'}]});
 const after=applyOperations(deck,proposal.operations,0,'ai');assert.equal(proposal.operations.length,3);assert.equal(after.slides[0].elements[0].text,'Updated');assert(!after.slides[0].elements.some(e=>e.id==='remove-me'));assert.equal(after.slides[1].elements.length,1);assert(deck.slides[0].elements.some(e=>e.id==='remove-me'));
});

test('prepared slide duplication remaps all IDs, retains source content and can be refined in the same proposal',async()=>{
 const deck=fixture();deck.slides[0].groups=[{id:'g',name:'Group'}];deck.slides[0].elements[0].group='g';const kit=editingToolkit(async()=>deck);
 const recipe=await invoke(kit,'prepare_duplicate_slide',{slideId:deck.slides[0].id}),slide=recipe.slides[0];
 const p=await invoke(kit,'propose_edit',{proposalJson:JSON.stringify({baseRevision:0,summary:'Duplicate and edit',prepared:[recipe.recipeId],operations:[{op:'update_element',slideId:slide.id,elementId:slide.objects[0].id,patch:{text:'New state'}}]})});
 const after=applyOperations(deck,p.operations,0,'ai');assert.equal(after.slides.length,3);assert.equal(after.slides[1].elements[0].text,'New state');assert.notEqual(after.slides[1].groups?.[0].id,'g');assert.equal(after.slides[1].elements[0].group,after.slides[1].groups?.[0].id);
 assert.throws(()=>validateAIProposal(deck,p,{slideIds:[deck.slides[0].id],elementIds:[]}),/entire document/);
});

test('native template preparation uses authored content and target dimensions without applying it',async()=>{
 const deck=fixture();deck.width=720;deck.height=405;const kit=editingToolkit(async()=>deck);
 const recipe=await invoke(kit,'prepare_template',{collection:'minimal',layout:'statement',contentJson:JSON.stringify({heading:'A user supplied insight',body:'Real evidence'})});
 const p=await invoke(kit,'propose_edit',{proposalJson:JSON.stringify({baseRevision:0,summary:'Add a statement',prepared:[recipe.recipeId],operations:[]})});
 const after=applyOperations(deck,p.operations,0,'ai');assert.equal(after.slides.length,3);assert(after.slides.at(-1)!.elements.some(e=>e.text==='A user supplied insight'));assert.equal(deck.slides.length,2);
});

test('model loop feeds canonical tool results back, repairs invalid revisions and never stores provider keys',async()=>{
 const deck=fixture();let turn=0;const bodies:any[]=[];const progress:string[]=[];
 const transport:typeof fetch=async(_url,init)=>{const body=JSON.parse(init!.body as string);bodies.push(body);turn++;
 const op={op:'update_element',slideId:deck.slides[0].id,elementId:'title',patch:{text:'Updated'}};
 if(turn===1)return Response.json({output:[{type:'function_call',call_id:'schema-call',name:'get_edit_schema',arguments:JSON.stringify({operation:'update_element'})}]});
 if(turn===2)return Response.json({output:[{type:'function_call',call_id:'bad-call',name:'propose_edit',arguments:JSON.stringify({proposalJson:JSON.stringify({baseRevision:99,summary:'Fixture',operations:[op]})})}]});
 return Response.json({output:[{type:'function_call',call_id:'valid-call',name:'propose_edit',arguments:JSON.stringify({proposalJson:JSON.stringify({baseRevision:0,summary:'Fixture',operations:[op]})})}]});};
 const p=await proposeAI(deck,'Edit title',{slideIds:[deck.slides[0].id],elementIds:['title']},{provider:'openai',baseUrl:'',model:'configured-fixture',apiKey:'secret-fixture'},{transport,onprogress:p=>progress.push(p.stage)});
 assert.equal(turn,3);assert.equal(p.operations.length,1);assert(!JSON.stringify(bodies).includes('secret-fixture'));assert.equal(bodies[0].store,false);assert(bodies[2].input.some((o:any)=>o.type==='function_call_output'&&o.output.includes('changed')));assert(progress.includes('validate'));assert.equal(deck.slides[0].elements[0].text,'Original');
});

test('independent discovery executes concurrently and input cancellation aborts provider work',async()=>{
 const deck=fixture(),controller=new AbortController();let arrived=0,resolveBoth:()=>void=()=>{};const both=new Promise<void>(ok=>resolveBoth=ok);
 const services:EditingServices={resourceCatalog:async()=>{if(++arrived===2)resolveBoth();await both;return {};},searchResources:async()=>{if(++arrived===2)resolveBoth();await both;return {items:[],page:1,hasMore:false};},importResource:async()=>{throw new Error('unused');}};
 let turn=0;const transport:typeof fetch=async()=>{if(++turn===1)return Response.json({output:[{type:'function_call',call_id:'catalog',name:'get_resource_catalog',arguments:'{}'},{type:'function_call',call_id:'search',name:'search_resources',arguments:JSON.stringify({kind:'icon',query:'circle'})}]});return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({baseRevision:0,summary:'Fixture',operations:[{op:'rename_deck',title:'Updated'}]})}]}]});};
 await proposeAI(deck,'Rename',{slideIds:deck.slides.map(s=>s.id),elementIds:[]},{provider:'openai',baseUrl:'',model:'fixture',apiKey:'fixture'},{services,transport,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(2000)])});assert.equal(arrived,2);
 controller.abort();await assert.rejects(()=>proposeAI(deck,'Rename',{slideIds:deck.slides.map(s=>s.id),elementIds:[]},{provider:'openai',baseUrl:'',model:'fixture',apiKey:'fixture'},{transport,signal:controller.signal}),{name:'AbortError'});
 for(const baseUrl of ['http://remote.example/v1','https://user:password@example.com/v1','https://example.com/v1?token=secret'])assert.throws(()=>providerBase({provider:'compatible',baseUrl,model:'fixture'}),/HTTPS/);
});

test('streamed client reconstructs chunked events, preserves Unicode and detects interrupted results',async()=>{
 const deck=fixture(),proposal={baseRevision:0,summary:'Fixture',operations:[{op:'update_element',slideId:deck.slides[0].id,elementId:'title',patch:{text:'清晰'}}]},encoder=new TextEncoder();
 const bytes=encoder.encode(`data: ${JSON.stringify({type:'progress',data:{stage:'model',message:'Planning…'}})}\n\ndata: ${JSON.stringify({type:'proposal',data:proposal})}\n\n`);
 const transport:typeof fetch=async()=>new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.slice(i,i+7));c.close();}}),{headers:{'Content-Type':'text/event-stream'}});
 let status='';const p=await requestAI({deck,prompt:'Edit',settings:{provider:'compatible',baseUrl:'',model:'fixture'},scope:{slideIds:[deck.slides[0].id],elementIds:[]}},{onprogress:event=>status=event.message},transport);assert.equal(status,'Planning…');assert('operations' in p);assert.equal((p.operations[0] as any).patch.text,'清晰');
 await assert.rejects(()=>requestAI({deck,prompt:'Edit',settings:{provider:'compatible',baseUrl:'',model:'fixture'},scope:{slideIds:[deck.slides[0].id],elementIds:[]}}, {},async()=>new Response('data: {"type":"progress","data":{}}\n\n',{headers:{'Content-Type':'text/event-stream'}})),/closed before/);
});

test('prepared object defaults have a direct submit path and reject duplicate echoes',async()=>{
 const deck=fixture(),kit=editingToolkit(async()=>deck),r=await invoke(kit,'prepare_element',{slideId:deck.slides[0].id,type:'text',propertiesJson:JSON.stringify({text:'One object',x:120,y:120,w:900,h:100,fontSize:48})});
 const p=await invoke(kit,'propose_prepared_edits',{baseRevision:0,summary:'Add one object',recipeIds:[r.recipeId]});assert.equal(p.operations.length,1);assert.equal(applyOperations(deck,p.operations,0,'ai').slides[0].elements.length,3);
 const prepared=await invoke(kit,'read_prepared_edit',{recipeId:r.recipeId});const repeated={...prepared.operations[0],element:{...prepared.operations[0].element,id:'other-id'}};
 await assert.rejects(()=>invoke(kit,'propose_edit',{proposalJson:JSON.stringify({baseRevision:0,summary:'Duplicate echo',prepared:[r.recipeId],operations:[repeated]})}),/already included/);
});

test('stopping an in-flight run closes the provider connection and preserves the document',async()=>{
 const {createServer}=await import('node:http');const deck=fixture(),controller=new AbortController();let arrive:()=>void=()=>{},close:()=>void=()=>{};const arrived=new Promise<void>(r=>arrive=r),closed=new Promise<void>(r=>close=r);let calls=0;
 const server=createServer(async(req,res)=>{for await(const _ of req){}calls++;res.on('close',close);arrive();});await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));
 const baseUrl=`http://127.0.0.1:${(server.address() as any).port}/v1`;
 try{const run=proposeAI(deck,'Edit title',{slideIds:[deck.slides[0].id],elementIds:['title']},{provider:'compatible',baseUrl,model:'fixture'},{signal:controller.signal});await arrived;controller.abort();await assert.rejects(run,{name:'AbortError'});await closed;assert.equal(calls,1);assert.equal(deck.revision,0);assert.equal(deck.slides[0].elements[0].text,'Original');}
 finally{server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));}
});
