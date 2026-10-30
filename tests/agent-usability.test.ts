import {z} from 'zod';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {newDeck,blankSlide,element} from '../src/core/model';
import {editingToolkit} from '../src/core/ai-tools';
import {applyOperations} from '../src/core/operations';
import {EditorContextStore} from '../server/editor-context';
import {WorkflowStore} from '../server/workflows';
import {toolFailure,mcpInputSchema,omitNull} from '../src/core/tool-recovery';
import {SimpleUpdatesSchema,AgentBoxSchema} from '../src/core/agent-tools';
const fixture=()=>{const a=blankSlide(),b=blankSlide();a.elements=[element('text',{id:'title',text:'证据 Original title',runs:[{text:'证据 Original title',bold:true}],fontSize:28}),element('rect',{id:'locked',locked:true})];b.elements=[element('text',{id:'other',text:'证据 Outside scope'})];return newDeck('Agent fixture',[a,b]);};
const invoke=async(kit:ReturnType<typeof editingToolkit>,name:string,input:any)=>{const tool=kit.tools.find(t=>t.name===name)!;return await tool.run(tool.schema.parse(input)) as any;};

test('scoped search and typed updates locate targets without sending media and preserve rich text/atomic locks',async()=>{
 const deck=fixture(),before=JSON.stringify(deck),kit=editingToolkit(async()=>deck,undefined,{slideIds:[deck.slides[0].id],elementIds:['title']});
 const found=await invoke(kit,'search_document',{query:'证据'});assert.equal(found.total,1);assert.equal(found.items[0].elementId,'title');assert(!JSON.stringify(found).includes('base64'));
 const proposal=await invoke(kit,'propose_updates',{baseRevision:0,summary:'Refine title',updates:[{slideId:deck.slides[0].id,elementId:'title',text:'证据 Clear title',style:{fontSize:32}}]});const applied=applyOperations(deck,proposal.operations,0,'ai');assert.equal(applied.slides[0].elements[0].runs![0].bold,true);assert.equal(applied.slides[0].elements[0].text,'证据 Clear title');assert.equal(JSON.stringify(deck),before);
 await assert.rejects(()=>invoke(kit,'propose_updates',{baseRevision:0,summary:'Outside',updates:[{slideId:deck.slides[1].id,elementId:'other',text:'Bad'}]}),/scope/);
 const all=editingToolkit(async()=>deck);await assert.rejects(()=>invoke(all,'propose_updates',{baseRevision:0,summary:'Atomic',updates:[{slideId:deck.slides[0].id,elementId:'title',text:'First'},{slideId:deck.slides[0].id,elementId:'locked',style:{fill:'#000000'}}]}),/Locked|locked/);assert.equal(JSON.stringify(deck),before);
});

test('typed object batches create one reviewable recipe and cannot be rebased after document changes',async()=>{
 let deck=fixture();const kit=editingToolkit(async()=>deck);const batch=await invoke(kit,'prepare_elements',{slideId:deck.slides[0].id,elements:[{type:'text',text:'A',box:{x:20,y:30,w:400,h:90}},{type:'rect',box:{x:20,y:150,w:400,h:8},style:{fill:'#112233'}}]});assert.equal(batch.objects.length,2);assert.notEqual(batch.objects[0].id,batch.objects[1].id);assert.equal(batch.baseRevision,0);assert.equal(deck.slides[0].elements.length,2);
 const proposal=await invoke(kit,'propose_prepared_edits',{baseRevision:0,summary:'Add block',recipeIds:[batch.recipeId]});assert.equal(proposal.operations.length,2);
 deck={...deck,revision:1};await assert.rejects(()=>invoke(kit,'read_prepared_edit',{recipeId:batch.recipeId}),/changed/);await assert.rejects(()=>invoke(kit,'propose_prepared_edits',{baseRevision:1,summary:'Unsafe rebase',recipeIds:[batch.recipeId]}),/revision changed/);assert.equal(deck.slides[0].elements.length,2);
 assert.throws(()=>AgentBoxSchema.parse({x:0,y:0,w:100}),(error:unknown)=>error instanceof z.core.$ZodError&&error.issues.some(issue=>issue.code==='invalid_type'&&issue.path.join('.')==='h'));
});

test('discovery and projected schemas reduce irrelevant detail while keeping canonical required fields',async()=>{
 const kit=editingToolkit(async()=>fixture());const brief=await invoke(kit,'get_capabilities',{category:'editing'}),full=await invoke(kit,'get_capabilities',{detail:'full'});assert(Object.keys(brief.routes).every(k=>k==='editing'));assert(JSON.stringify(brief).length<JSON.stringify(full).length);
 const schema=await invoke(kit,'get_edit_schema',{operation:'update_element',fields:['text','fontSize']});assert.deepEqual(Object.keys(schema.properties.patch.properties).sort(),['fontSize','text']);assert(schema.required.includes('elementId'));await assert.rejects(()=>invoke(kit,'get_edit_schema',{operation:'update_element',fields:['notAField']}),/Available fields/);
});

test('editor bootstrap refuses stale/ambiguous windows and reports unsaved revisions without modifying documents',async()=>{
 let deck=fixture();let now=1000;const store=new EditorContextStore(async()=>deck,()=>now),base={deckId:deck.id,revision:0,activeSlideId:deck.slides[0].id,selectedIds:['title','missing'],focused:false,visible:true,dirty:false,sourceMode:false,presenting:false,pendingProposal:false};
 const a=crypto.randomUUID(),b=crypto.randomUUID();store.update({...base,clientId:a});const one=await store.read() as any;assert.equal(one.deckId,deck.id);assert.deepEqual(one.selectedIds,['title']);assert.equal(one.selectedObjects[0].text,'证据 Original title');
 store.update({...base,clientId:b});assert.equal((await store.read()).state,'ambiguous');store.update({...base,clientId:a,focused:true,dirty:true,revision:1});const current=await store.read() as any;assert.equal(current.requiresSave,true);assert.equal(current.revision,0);assert.equal(current.localRevision,1);assert.equal(deck.revision,0);
 store.update({...base,clientId:a,focused:true});deck={...deck,revision:2};const older=await store.read() as any;assert.equal(older.requiresReload,true);assert.equal(older.requiresSave,false);assert.match(older.next,/reopen/);
 now=20000;assert.equal((await store.read()).state,'no_open_document');assert.equal((await store.read(deck.id)).state,'saved_document');assert.throws(()=>store.update({...base,clientId:a,apiKey:'forbidden'}));
});

test('workflow history paginates active/all receipts independently of the editor queue',async()=>{
 const root=await mkdtemp(join(tmpdir(),'deck-history-')),deck=fixture();let now=0;const store=new WorkflowStore(root,async()=>deck,()=>++now);
 try{const a=await store.request(deck,{kind:'export',format:'json',version:'editable'}),b=await store.request(deck,{kind:'publish',target:'web',includeNotes:false}),client=crypto.randomUUID();await store.claim(a.id,client);await store.resolve(a.id,client,'completed',{message:'Download started'});const page=await store.page(deck.id,{status:'all',limit:1});assert.equal(page.total,2);assert.equal(page.nextOffset,1);assert.equal(page.items[0].id,a.id);assert.equal((await store.page(deck.id,{status:'active'})).items[0].id,b.id);assert.equal((await store.list(deck.id)).length,1);}finally{await rm(root,{recursive:true,force:true});}
});

test('MCP optional nulls are omitted, required values stay required, and recovery codes explain safe next steps',()=>{
 const facade=mcpInputSchema(SimpleUpdatesSchema);const input=facade.parse({baseRevision:0,summary:'Change',updates:[{slideId:'slide',elementId:'object',text:'New',box:null,style:{fontSize:30,fill:null}}]});const clean=SimpleUpdatesSchema.parse(omitNull(input));assert.equal(clean.updates[0].style!.fontSize,30);assert.equal(clean.updates[0].style!.fill,undefined);assert.throws(()=>facade.parse({baseRevision:null,summary:'Change',updates:[]}));
 const stale=toolFailure(new Error('The document revision changed'),{tool:'propose_updates',deckId:'fixture'});assert.equal(stale.code,'STALE_REVISION');assert.equal(stale.next.tool,'read_deck');assert.equal(toolFailure(new Error('Locked objects cannot change')).code,'LOCKED_CONTENT');assert.equal(toolFailure(new Error('Connect the provider first')).next.userActionRequired,true);
});

test('mixed workflow replies keep all queued requests and surface partial failures rather than ending on prose',async()=>{
 const {runAI}=await import('../server/ai');const deck=fixture(),date=new Date().toISOString();let queued=0;
 const value=await runAI(deck,'Describe availability then export HTML and create a Google copy',{slideIds:deck.slides.map(s=>s.id),elementIds:[]},{provider:'openai',baseUrl:'',model:'fixture',apiKey:'fixture'},{transport:async()=>Response.json({output:[{type:'function_call',call_id:'info',name:'respond_to_user',arguments:JSON.stringify({message:'Preparing requested actions'})},{type:'function_call',call_id:'html',name:'request_export',arguments:JSON.stringify({format:'html'})},{type:'function_call',call_id:'google',name:'request_publish',arguments:JSON.stringify({target:'google'})}]}),workflowServices:{request:async(_deck,action)=>{queued++;return {id:crypto.randomUUID(),deckId:deck.id,baseRevision:0,action,status:'pending',createdAt:date,updatedAt:date};},read:async()=>{throw Error('unused');},connections:async()=>({})}});
 assert('kind' in value&&value.kind==='workflow');assert.equal(queued,1);assert.equal(value.request.action.kind,'export');assert.equal(value.failures?.[0].tool,'request_publish');assert.equal(deck.revision,0);
});

test('an informational companion does not hide a failed action when nothing was queued',async()=>{
 const {runAI}=await import('../server/ai');const deck=fixture();let rounds=0;
 const result=await runAI(deck,'Prepare Google publication',{slideIds:deck.slides.map(s=>s.id),elementIds:[]},{provider:'openai',baseUrl:'',model:'fixture',apiKey:'fixture'},{transport:async(_url,init)=>{rounds++;if(rounds===1)return Response.json({output:[{type:'function_call',call_id:'info',name:'respond_to_user',arguments:JSON.stringify({message:'Preparing publication'})},{type:'function_call',call_id:'google',name:'request_publish',arguments:JSON.stringify({target:'google'})}]});const sent=JSON.parse(String(init?.body));assert(JSON.stringify(sent).includes('native Google Slides source'));return Response.json({output:[{type:'function_call',call_id:'final',name:'respond_to_user',arguments:JSON.stringify({message:'Import the native Google Slides source before creating a copy.'})}]});},workflowServices:{request:async()=>{throw Error('unexpected queue');},read:async()=>{throw Error('unused');},connections:async()=>({})}});
 assert.equal(rounds,2);assert('kind' in result&&result.kind==='information');assert.match(result.message,/Import the native Google/);
});


test('missing live documents keep the editor reachable and preserve draft recovery without guessing another window',async()=>{
 const store=new EditorContextStore(async()=>{throw Object.assign(Error('Missing'),{code:'ENOENT'});});store.update({clientId:crypto.randomUUID(),deckId:'gone',revision:2,activeSlideId:'gone-slide',selectedIds:[],focused:true,visible:true,dirty:true,sourceMode:false,presenting:false,pendingProposal:false});const value=await store.read();assert.equal(value.state,'document_unavailable');assert.equal(value.editorReachable,true);assert('requiresSave' in value&&value.requiresSave);assert.match(value.next,/Preserve.*local draft/);assert.match(value.next,/Do not guess/);
 const {mcpEditorContext}=await import('../server/mcp-workflows');const transport:typeof fetch=async input=>String(input).includes('/api/agent/context')?Response.json({error:'File not found.'},{status:404}):Response.json({workspaceId:'matching'});const context=await mcpEditorContext(undefined,transport,4310,'matching');assert.equal(context.state,'context_unavailable');assert.equal(context.editorReachable,true);const foreign=await mcpEditorContext(undefined,transport,4310,'other');assert.equal(foreign.editorReachable,false);
});
