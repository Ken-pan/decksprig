import {type Deck} from '../src/core/model';
import {EDITING_GUIDE, EditMedia, readAIContext, validateAIProposal, validateEditScope, type EditScope} from '../src/core/ai-editing';
import {editingToolkit, strictToolSchema, type EditingServices} from '../src/core/ai-tools';
import {omitNull} from './ai-schema';
import type {Proposal} from '../src/core/operations';
import {toolFailure} from '../src/core/tool-recovery';
import {CreationBriefSchema,validateCreationEvidence,requestsIllustratedCover,creationInstruction,type CreationBrief} from '../src/core/ai-story';
import {AIHistorySchema,aiFollowups,type AIHistory} from '../src/core/ai-session';
import {workflowTools,WorkflowOutcomeSchema,AIInformationSchema,validateWorkflow,type WorkflowServices,type WorkflowOutcome,type AIInformation} from '../src/core/workflows';
import {resolvePageRequest,validatePageRequest,usePageBatch,type PageRequest} from '../src/core/ai-page-request';
import {readTemplate,templateCatalog} from '../src/core/ai-templates';
import {readAssets} from '../src/core/ai-assets';
import {PageEditsSchema} from '../src/core/ai-page-edits';
import {z} from '../src/core/schema';
import {exactTextProposal} from './ai-exact-text';
import {arrangementIntent,validateArrangementIntent,notesOnlyOnAddedSlides,validateAddedSlideNotes} from '../src/core/ai-arrangement-intent';
import {pageBatchModelSchema,requestedChartPatch,requestedTextPatch} from './ai-page-schema';
import {validateStoryDesign,storyDesignInstruction,groundCreationClaims,normalizeCreationNotes,compactCreationIntros,placeQuizAnswersInNotes} from '../src/core/ai-story-quality';
import {CreationStorySchema,authoredCreationStory} from '../src/core/ai-story-input';

export type AISettings = {provider:'openai'|'compatible';baseUrl:string;model:string;apiKey?:string};
export type AIProgress = {stage:'context'|'model'|'tool'|'validate';message:string;tool?:string;round?:number};
export type AIRunOptions = {signal?:AbortSignal;onprogress?:(event:AIProgress)=>void;services?:EditingServices;transport?:typeof fetch;workflowServices?:WorkflowServices;creation?:CreationBrief;reviewEvidence?:boolean;activeSlideId?:string;history?:AIHistory};
const serverKey=(provider:AISettings['provider'])=>typeof process==='undefined'?undefined:provider==='openai'?process.env.OPENAI_API_KEY:process.env.DECK_AI_KEY;
export function providerBase(settings:AISettings) {
  if(!settings||!['openai','compatible'].includes(settings.provider))throw new Error('Choose a supported AI provider in Settings.');
  const base=settings.provider==='openai'?'https://api.openai.com/v1':settings.baseUrl.replace(/\/+$/,'');
  let u:URL;try{u=new URL(base);}catch{throw new Error('Enter a valid AI provider URL in Settings.');}
  if(!['https:','http:'].includes(u.protocol)||(u.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(u.hostname))||u.username||u.password||u.search||u.hash)throw new Error('Use HTTPS for the model provider URL. Local providers can use HTTP on localhost. Keep credentials out of URLs.');
  return base;
}
export async function availableModels(settings:AISettings) {
  const base=providerBase(settings),key=settings.apiKey||serverKey(settings.provider);
  const response=await fetch(`${base}/models`,{headers:key?{Authorization:`Bearer ${key}`}:{},signal:AbortSignal.timeout(20000),redirect:'error'});
  if(!response.ok)throw new Error(`Could not retrieve models (${response.status})`);
  const value:any=await response.json();return {models:(value.data??[]).map((v:any)=>v.id).filter((v:any)=>typeof v==='string'&&v.length<200).sort() as string[]};
}
const instruction=`You are Decksprig's document and workflow assistant. ${EDITING_GUIDE}
Use the tools to flexibly combine existing capabilities. Use authoredPages as the semantic content authority; decorative counters are not item headings. For additions use prepare_story or prepare_template, never nonexistent page numbers in pages. Finish with exactly one submission. After any preparation, use propose_prepared_edits with includeAllPrepared:true and optional updates plus slideUpdates for notes. Speaker notes are slide fields, never elements. Read the listed template rules before constructing structured content. For presentation quality requests, use review_presentation first, then read affected pages and propose improvements; its layout findings identify native fields and object IDs, with explicit measurement limits. After preparing substantial layout changes, use review_prepared_edit to inspect the composed pages. Fix concrete findings; do not rewrite content merely to satisfy optional rhythm advice. For chart edits, read the current chart and pass only requested fields as a patch; never reconstruct display defaults. For template selection read list_templates and match the reader task and available evidence. To modify a template read_template first, then prepare_template_update for content, layout or density changes; omitted fields preserve current authored values. Older unmapped templates use read_deck and propose_updates for in-place object edits. Preserve the document theme unless explicitly asked to change it. Common object changes should go straight to propose_updates with typed fields. Use prepare_elements for a text/shape batch, search_document to locate targets, and propose_edit for advanced canonical operations; discover schemas or helpers only when needed. Return an atomic proposal, never a claim that you applied it. proposalJson is JSON with baseRevision, concise English summary, operations, and optional prepared recipeIds. Include all intended prepared recipes. If a prepared alternative is superseded, discard_prepared_edits explicitly removes it before final submission. When using prepared recipes, do not repeat their add operations; use operations:[] or only separate adjustments. Keep existing content language unless translation is requested; use the user's language for newly authored content. Never invent URLs, credentials, font bytes, resource IDs or media references. Use respond_to_user for capability or status questions, using only observed tool results and actual request receipts. Use workflow tools for import, export, presentation, account connection, workspace commands and publishing. A queued workflow is not completed execution. Never claim a file was exported, an account connected or a site published before its receipt confirms it. Web publication prepares a concrete package and final user action; credentials are entered only in the native UI. Finish and apply document proposals before requesting workflows for the changed document. Scope is fixed for this run. On tool errors use the reported recovery action. For compatible models without tool calls, return the same JSON proposal as your final response. Null fields mean leave unchanged. Example update: {"baseRevision":0,"summary":"Shorten the selected title","operations":[{"op":"update_element","slideId":"actual-slide-id","elementId":"actual-element-id","patch":{"text":"New title"}}]}.`;
const toolMessages:Record<string,string>={review_presentation:'Checking presentation readiness…',propose_page_edits:'Checking every requested page…',prepare_story:'Building editable slides…',propose_updates:'Validating your changes…',prepare_element:'Preparing an object…',get_capabilities:'Checking editing capabilities…',read_deck:'Reading document context…',get_edit_schema:'Checking object settings…',search_resources:'Searching the resource library…',prepare_resource:'Preparing a resource…',read_assets:'Reading current artwork…',prepare_asset_replacements:'Preparing artwork replacements…',get_resource_catalog:'Checking resource collections…',search_fonts:'Finding available fonts…',list_templates:'Finding editable templates…',prepare_template:'Preparing template slides…',read_template:'Reading current template content…',prepare_template_update:'Adapting the native template…',prepare_arrangement:'Preparing the layout…',prepare_duplicate_slide:'Preparing a slide copy…',read_prepared_edit:'Checking prepared changes…',review_prepared_edit:'Checking the prepared layout…',propose_prepared_edits:'Validating prepared changes…',propose_edit:'Validating proposed changes…'};
const finalFormat={type:'json_schema',name:'deck_edit_result',strict:true,schema:{type:'object',properties:{proposalJson:{type:'string',description:'JSON containing the atomic proposal: baseRevision, summary, operations and optional prepared recipe IDs.'}},required:['proposalJson'],additionalProperties:false}};
const creationFinalFormat={type:'json_schema',name:'deck_story_result',strict:true,schema:{type:'object',properties:{storyJson:{type:'string',description:'JSON with title, replaceBlank:true and slides of layout, heading, body, points and notes. Content only: native templates create all objects.'}},required:['storyJson'],additionalProperties:false}};
const creationTools=new Set(['prepare_story']);
const workflowFinalFormat={type:'json_schema',name:'deck_ai_result',strict:true,schema:{type:'object',properties:{resultJson:{type:'string',description:'JSON for one result: a document proposal (baseRevision,summary,operations); an action request with action:{kind,...}; or information with kind:information,message and optional requestId. Never invent request receipts or completion.'}},required:['resultJson'],additionalProperties:false}};
export async function runAI(deck:Deck,prompt:string,scope:EditScope,settings:AISettings,options:AIRunOptions={}) :Promise<Proposal|WorkflowOutcome|AIInformation> {
  const base=providerBase(settings);
  if(!settings.model?.trim())throw new Error('Choose an AI model in Settings first.');
  if(typeof prompt!=='string'||!prompt.trim())throw new Error('Describe the changes you want to make.');
  validateEditScope(deck,scope);
  if(options.activeSlideId!==undefined&&!deck.slides.some(s=>s.id===options.activeSlideId))throw new Error('The active slide no longer exists. Reopen the document before requesting an action.');
  const fromCurrent=/(?:\bfrom\s+(?:the\s+)?current\s+slide\b|(?:从|在)(?:当前|本)(?:页|幻灯片))/i.test(prompt.replace(/(?:do not|don.t|never|不要|别)[^.;。；\n]*/gi,''));
  const presentationTarget=(raw:any)=>raw?.kind==='presentation'&&raw.command==='start'&&fromCurrent?{...raw,slideId:options.activeSlideId}:raw;
  const creation=options.creation?CreationBriefSchema.parse(options.creation):undefined;
  if(!creation){options.signal?.throwIfAborted();const exact=exactTextProposal(deck,prompt,scope);if(exact){options.onprogress?.({stage:'validate',message:'Preparing the exact text change…'});return exact;}}
  const pageRequest:PageRequest=creation?{pages:[],protectedIds:[],structural:false}:resolvePageRequest(deck,prompt),pageBatch=!creation&&usePageBatch(prompt,pageRequest);
  if(pageRequest.pages.some(p=>!scope.slideIds.includes(p.slideId))||pageRequest.deletedNumbers?.some(n=>!scope.slideIds.includes(deck.slides[n-1].id)))throw new Error('The request names pages outside the selected scope. Choose All slides to edit those pages.');
  if(pageRequest.additions?.length&&(scope.elementIds.length||scope.slideIds.length!==deck.slides.length))throw new Error('Choose All slides to insert pages in this batch.');
  if(creation&&(deck.slides.length!==1||deck.slides[0].elements.length||deck.slides[0].source))throw new Error('Start AI creation with a new empty draft.');
  const arrangements=creation?[]:arrangementIntent(deck,prompt,scope);
  const preserveExistingNotes=notesOnlyOnAddedSlides(prompt);
  const validateRequest=(proposal:Proposal)=>{if(preserveExistingNotes)validateAddedSlideNotes(deck,proposal);validatePageRequest(deck,proposal,pageRequest);validateArrangementIntent(deck,proposal,arrangements);};
  const history=aiFollowups(AIHistorySchema.parse(options.history??[]));
  const key=settings.apiKey||serverKey(settings.provider);
  if(settings.provider==='openai'&&!key)throw new Error('Enter an API key in Settings or configure OPENAI_API_KEY on the local server.');
  const signal=options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(creation?240000:120000)]):AbortSignal.timeout(creation?240000:120000);
  const progress=(event:AIProgress)=>{signal.throwIfAborted();options.onprogress?.(event);};
  progress({stage:'context',message:creation?'Reading your brief and sources…':'Reading the selected context…'});
  const media=new EditMedia(),kit=editingToolkit(async()=>deck,options.services,scope,media);
  if(options.workflowServices&&!creation)kit.tools.push(...workflowTools(async()=>deck,options.workflowServices));
  const compact=readAIContext(deck,media,{slideIds:scope.slideIds,elementIds:scope.elementIds,detail:pageBatch||scope.slideIds.length>10?'outline':'content',limit:pageBatch?40:10});
  const catalog=creation?await templateCatalog():undefined;
  const designOptions=catalog?{families:catalog.collections,layouts:catalog.layouts.filter(l=>l.authoredContent).map(l=>({id:l.id,task:l.contract.task,inputs:l.inputs,rules:l.rules,capacity:l.contract.capacity}))}:undefined;
  const transport=options.transport??fetch;
  let creationPlan:Awaited<ReturnType<typeof import('./ai-creation-plan').planCreation>>|undefined;
  if(creation&&options.reviewEvidence){
    progress({stage:'model',message:'Planning the story and choosing layouts…'});
    try{creationPlan=await (await import('./ai-creation-plan')).planCreation(creation,designOptions,{settings,base,key,signal,transport});}catch{signal.throwIfAborted();/* Author from the full brief if optional planning is unavailable. Source review still runs. */}
  }
  let coverArtwork:{id:string;title:string;tags?:string[]}[]=[];
  if(creation&&requestsIllustratedCover(creation.brief)&&creationPlan?.illustrationQuery){
    try{coverArtwork=await (await import('./ai-creation-artwork')).creationArtwork(creationPlan.illustrationQuery,options.services);}catch{signal.throwIfAborted();}
  }
  const sourceChecklist=creation?(await import('./ai-evidence-review')).sourceReviewChecklist(creation.materials??''):undefined;
  const input=JSON.stringify(creation?{creation,creationPlan,coverArtwork,sourceChecklist,designOptions,baseRevision:deck.revision,contract:'Author the complete story for this brief. Submit prepare_story once; native templates build the editable proposal for user review. Do not use editing operations or recipe IDs.'}:{request:prompt.slice(0,10000),requiredArrangements:arrangements,preserveExistingNotes,scope,activeSlide:options.activeSlideId?{id:options.activeSlideId,number:deck.slides.findIndex(s=>s.id===options.activeSlideId)+1}:undefined,history,editRequirements:pageRequest.pages.map(p=>({number:p.number,notesEditable:p.notesEditable,chartEditable:p.chart?.editable,keepOtherPages:true})),historyContract:'Earlier requests explain intent only. Use the current document, revision and scope as authority; queued actions need actual receipts before claiming completion.',...(creation?{creation}:{}),authoredPages:!pageBatch?deck.slides.filter(s=>scope.slideIds.includes(s.id)&&s.template?.slots?.length&&!scope.elementIds.length).slice(0,10).map(s=>({number:deck.slides.indexOf(s)+1,...readTemplate(s)})):undefined,pages:compact.slides.map(s=>({id:s.id,number:s.number,heading:s.heading,layout:'template' in s?s.template?.prototype:s.layout})),pageContract:'Resolve requested page numbers using this current pages map. Verify number and heading in read_template before preparing updates; never reuse a selected or historical page ID for another page.',...(pageBatch?{requiredPages:pageRequest.pages.map(p=>({number:p.number,instruction:p.instruction,artwork:p.replaceArtwork?'replace allowed':p.styleArtwork?'customize SAME resource':'preserve existing artwork',current:readTemplate(deck.slides.find(s=>s.id===p.slideId)!),assets:readAssets(deck,{slideIds:[p.slideId],limit:12}).items})),requiredDeletes:pageRequest.deletedNumbers,requiredInsertions:pageRequest.additions,batchContract:'Use propose_page_edits with ALL required edits, deletePages and additions in ONE call. All numbers and afterNumber anchors refer to the ORIGINAL baseRevision map, even when pages are added/deleted. Put only existing edited pages in pages; deletion targets belong in deletePages, new content belongs in additions. collection changes template family; chart patches existing data/display fields. Do not prepare separate recipes or submit a partial proposal. Omitted fields stay unchanged; assets.action:style NEVER changes the resource ID.'}:{}),deck:compact,responseFormat:options.workflowServices&&!creation?'Use editing tools for document proposals, request_* for editor actions, or respond_to_user for factual capability/status answers.':'Return a JSON proposal via propose_edit or as the final response.'});
  if(input.length>400_000)throw new Error('This scope contains too much text. Choose fewer slides or selected objects.');
  const openai=settings.provider==='openai';
  const batchTools=new Set(['propose_page_edits','read_deck','read_template','read_assets','search_document','search_resources','list_templates','get_resource_catalog','get_capabilities']);
  // Common template batches use semantic slots; free object edits retain the full toolkit.
  const batchSchema=z.extend(PageEditsSchema, {pages:z.array(z.omit(PageEditsSchema.shape.pages.def.element, {updates:true})).check(z.maxLength(12))});
  const definitions=kit.tools.filter(t=>(!creation||creationTools.has(t.name))&&(!pageBatch||batchTools.has(t.name))).map(t=>({type:'function',name:t.name,description:creation&&t.name==='prepare_story'?'Submit the complete authored story once. The system builds native editable slides, validates every page and returns the reviewable proposal directly. If validation fails, repair the full story using the error. No separate proposal call is needed.':pageBatch&&t.name==='propose_page_edits'?'Submit one complete batch using ORIGINAL page numbers. Each page exposes compatible authored fields. Preserve fields unless the request needs them changed; when correcting data, update dependent headings, captions and permitted notes on the requested pages so they stay consistent. heading/body are title/subtitle, items patch text points, replaceItems replaces the entire requested point list, cells are complete table rows including headers, chart is editable chart data. reflow:true refreshes a native layout. Never put chart series in items. deletePages/additions handle structure. Omitted fields preserve current content and artwork.':t.description,parameters:!creation&&t.name==='prepare_story'?strictToolSchema(CreationStorySchema):creation&&t.name==='prepare_story'?strictToolSchema(z.extend(CreationStorySchema, {slides:CreationStorySchema.shape.slides.check(z.length(creation.slideCount))})):pageBatch&&t.name==='propose_page_edits'?pageBatchModelSchema(deck,pageRequest,strictToolSchema(batchSchema)):strictToolSchema(t.schema),strict:true}));
const runInstruction=creation?creationInstruction(creation)+storyDesignInstruction(creation)+' If creationPlan is present, follow its per-page reader question and source allocation. Treat it as a design plan, not new evidence: the original brief wins. Use its selected collection. When coverArtwork offers a suitable subject, select its exact coverResourceId for the illustrated cover; choose by topic, not a generic business image. Improve a layout only when the actual content requires it. Retain every substantive source statement, including uncertainty, absent evidence, non-causal limits, owners and exception prohibitions. Map each to visible slide content or concrete speaker notes before submitting.'+' If returning final text without tools, return {storyJson:"JSON containing title, replaceBlank:true and slides"}; never return custom layout operations.':instruction+' When writing speaker notes, write the actual words a presenter can say, retaining the requested evidence, limitations and next action. Do not replace substantive notes with meta commentary such as this slide presents or 讲稿强调. For a named item edit, preserve all other items and their order.';
  const responses:any[]=[{role:'user',content:input}],messages:any[]=[{role:'system',content:runInstruction},{role:'user',content:input}];
  const redact=(message:string)=>key?message.replaceAll(key,'[redacted]'):message;
  let calls=0,failures=0,evidenceReviews=0;
  class SourceRepair extends Error{}
  let bestCreation:Proposal|undefined;
  const creationReviewCache=new Map<string,{slide:number;evidence:string;problem:string}[]>();
  const fallbackCreation=()=>bestCreation?{...bestCreation,reviewWarnings:[...(bestCreation.reviewWarnings??[]).slice(0,29),{slide:1,evidence:'',problem:'Automatic refinement stopped. This is the last valid draft; review the remaining findings before presenting.'}]}:undefined;
  const verifyRecipes=(ids:unknown)=>{const pending=kit.pendingRecipeIds(),included=Array.isArray(ids)?ids:[];const missing=pending.filter(id=>!included.includes(id));if(missing.length)throw new Error(`Prepared changes would be omitted. Include all intended recipeIds: ${missing.join(', ')}. Use discard_prepared_edits to explicitly discard superseded alternatives before submitting one complete proposal.`);};
  const submissions=new Set(['propose_edit','propose_prepared_edits','propose_updates','propose_page_edits',...(creation?['prepare_story']:[])]);
  const createProposal=async(raw:unknown)=>{
    const {prepareStory,creationPreview}=await import('../src/core/ai-story-builder');
    const clean=omitNull(raw as object) as {slides?:Record<string,unknown>[]};
    const coverResourceId=typeof clean.slides?.[0]?.coverResourceId==='string'?clean.slides[0].coverResourceId:requestsIllustratedCover(creation!.brief)?coverArtwork[0]?.id:undefined;
    const content={...clean,slides:clean.slides?.map(({coverResourceId,...slide})=>slide)};
    const authored=await authoredCreationStory({...content,...(creationPlan?{collection:creationPlan.collection}:{}),replaceBlank:true,...(creation!.templateMode!=='auto'?{collection:creation!.collection}:{})},deck);
    for(const [i,slide] of authored.slides.entries())if(['process','solution'].includes(slide.layout)&&creationPlan?.pages[i]?.relationship==='parallel')slide.layout='insights';
    (await import('./ai-creation-grounding')).groundStructuredPages(authored,creation!);groundCreationClaims(authored,creation!);normalizeCreationNotes(authored);compactCreationIntros(authored);placeQuizAnswersInNotes(authored,creation!,creationPlan?.pages.filter(p=>/(?:knowledge check|quiz|知识检查|小测|测验)/i.test(p.briefRequirement)).map(p=>p.number));
    validateStoryDesign(authored,creation!);if(requestsIllustratedCover(creation!.brief))authored.slides[0].coverVisual='illustration';
    (await import('./ai-creation-sources')).retainPlannedSources(authored,creation!,creationPlan);validateCreationEvidence(authored,creation!);
    const operations=await prepareStory(deck,authored);
    if(coverResourceId)await (await import('./ai-creation-artwork')).applyCreationArtwork(operations,coverResourceId,coverArtwork,options.services);
    const proposal=validateAIProposal(deck,{baseRevision:deck.revision,summary:'Create the deck with native templates',operations},scope).proposal;
    creationPreview(deck,proposal,creation!);
    if(options.reviewEvidence){
      progress({stage:'validate',message:'Checking source facts and instructions…'});const {reviewStoryEvidence}=await import('./ai-evidence-review');let issues:NonNullable<Proposal['reviewWarnings']>;
      try{issues=await reviewStoryEvidence(authored,creation!,{settings,base,key,signal,transport,pageIntents:creationPlan?.pages,reviewCache:creationReviewCache});}catch(error){signal.throwIfAborted();return {...(bestCreation??proposal),reviewWarnings:[...(bestCreation?.reviewWarnings??[]).slice(0,29),{slide:1,problem:'Source review could not complete. Compare the draft with your supplied material before presenting.',evidence:''}]};}
      if(!bestCreation||issues.length<(bestCreation.reviewWarnings?.length??Infinity))bestCreation={...proposal,...(issues.length?{reviewWarnings:issues}:{})};
      evidenceReviews++;if(issues.length&&evidenceReviews<3)throw new SourceRepair(`Repair the story against the supplied material: ${issues.map(i=>`Slide ${i.slide}: ${i.problem} Source: ${JSON.stringify(i.evidence)}`).join(' ')}. Keep the complete story and requested slide count; retain correct content while fixing these issues. Do not flag correct percentages merely because their unit appears in the column header.`);
      if(issues.length)return bestCreation;
    }
    return proposal;
  };
  if(creation&&creationPlan){
    let draft:unknown;
    try{draft=await (await import('./ai-creation-author')).authorPlannedStory(creation,creationPlan,coverArtwork,{settings,base,key,signal,transport},page=>progress({stage:'model',message:`Writing slide ${page} of ${creation.slideCount}…`}));}catch{signal.throwIfAborted();}
    if(draft){
      for(let attempt=0;attempt<3;attempt++)try{return await createProposal(draft);}catch(error){
        signal.throwIfAborted();if(!(error instanceof SourceRepair))failures++;
        const feedback=redact((error as Error).message),pages=[...new Set([...feedback.matchAll(/Slide (\d+)/g)].map(m=>Number(m[1])))].filter(n=>n>=1&&n<=creation.slideCount);
        if(attempt<2&&pages.length)try{
          draft=await (await import('./ai-creation-author')).authorPlannedStory(creation,creationPlan,coverArtwork,{settings,base,key,signal,transport},page=>progress({stage:'model',message:`Refining slide ${page}…`}),{draft:draft as {title:string;slides:Record<string,unknown>[]},pages,feedback});continue;
        }catch{signal.throwIfAborted();}
        const repair={role:'user',content:JSON.stringify({draft,repair:feedback,instruction:'Repair this complete draft using the original brief. Preserve correct pages and all supplied facts. Submit prepare_story with the complete corrected story.'})};responses.push(repair);messages.push(repair);break;
      }
    }
  }

  for(let round=1;round<=8;round++) {
    progress({stage:'model',message:round===1?'Planning your changes…':'Refining the proposal…',round});
    const body=openai?{model:settings.model,instructions:runInstruction+(pageBatch?' For this multi-page request submit ALL requiredPages, requiredDeletes and requiredInsertions through ONE propose_page_edits call. Its number field resolves targets deterministically. Use items objects, assets.action:style for color-only changes and replace only where requested. Do not prepare separate recipes.':creation?' Final text must use the storyJson envelope.':options.workflowServices?' Final text uses the resultJson envelope. For actions use request_* tools, for capability/status answers use respond_to_user. Do not submit an empty editing proposal.':' Final text must use the provided proposalJson envelope.')+(pageBatch||creation?'':' Submit prepared helpers through propose_prepared_edits using recipeIds, without repeating their operations.'),input:responses,store:false,tools:kit.pendingRecipeIds().length?definitions.filter(t=>!['propose_updates','propose_edit','propose_page_edits'].includes(t.name)):definitions,parallel_tool_calls:false,text:{format:creation?creationFinalFormat:options.workflowServices?workflowFinalFormat:finalFormat},...(creation?{tool_choice:{type:'function',name:'prepare_story'}}:failures&&pageBatch?{tool_choice:{type:'function',name:'propose_page_edits'}}:failures?{tool_choice:'required'}:{}),max_output_tokens:16000}:
      {model:settings.model,messages,tools:(kit.pendingRecipeIds().length?definitions.filter(t=>!['propose_updates','propose_edit','propose_page_edits'].includes(t.name)):definitions).map(({type,...fn})=>({type,function:fn})),response_format:{type:'json_object'}};
    const response=await transport(`${base}/${openai?'responses':'chat/completions'}`,{method:'POST',headers:{'Content-Type':'application/json',...(key?{Authorization:`Bearer ${key}`}:{})},body:JSON.stringify(body),signal,redirect:'error'});
    if(!response.ok){const detail:any=await response.json().catch(()=>({}));throw new Error(`The AI provider returned ${response.status}${detail.error?.message?`: ${redact(String(detail.error.message)).slice(0,500)}`:'. Check your model, account balance, and connection settings.'}`);}
    const result:any=await response.json();
    if(result.status==='incomplete'||result.error||result.choices?.[0]?.finish_reason==='length')throw new Error('The AI result is incomplete. Reduce the edit scope and try again.');
    const output=result.output??[],message=result.choices?.[0]?.message;
    if(output.some((o:any)=>o.content?.some((c:any)=>c.type==='refusal'))||message?.refusal)throw new Error('The model could not propose these changes. Rephrase the request and try again.');
    const toolCalls:any[]=openai?output.filter((o:any)=>o.type==='function_call').map((o:any)=>({id:o.call_id,name:o.name,arguments:o.arguments})): (message?.tool_calls??[]).map((o:any)=>({id:o.id,name:o.function?.name,arguments:o.function?.arguments}));
    if(openai)responses.push(...output);else if(message)messages.push(message);
    const text=openai?output.flatMap((o:any)=>o.content??[]).filter((c:any)=>c.type==='output_text').map((c:any)=>c.text).join(''):message?.content;
    if(!toolCalls.length) {
      if(typeof text!=='string'||!text.trim())throw new Error('The AI provider returned no valid changes. Try again.');
      try {
        progress({stage:'validate',message:'Validating proposed changes…'});
        const parsed=JSON.parse(text.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
        if(creation)return await createProposal(typeof parsed.storyJson==='string'?JSON.parse(parsed.storyJson):parsed);
        const raw=typeof parsed.resultJson==='string'?JSON.parse(parsed.resultJson):typeof parsed.proposalJson==='string'?JSON.parse(parsed.proposalJson):parsed;
        if(pageBatch)throw new Error('Submit all requested pages through propose_page_edits. Do not finalize a partial raw proposal.');
        if(raw.kind==='information'&&options.workflowServices)return AIInformationSchema.parse({kind:'information',message:raw.message,...(raw.requestId?{receipt:await options.workflowServices.read(raw.requestId)}:{})});
        if(raw.action&&options.workflowServices)return WorkflowOutcomeSchema.parse({kind:'workflow',request:await options.workflowServices.request(deck,validateWorkflow(deck,presentationTarget(omitNull(raw.action))))});
        verifyRecipes(raw.prepared);
        const proposal=await kit.tools.find(t=>t.name==='propose_edit')!.run({proposalJson:JSON.stringify(omitNull(raw))}) as Proposal;validateRequest(proposal);if(creation)(await import('../src/core/ai-story-builder')).creationPreview(deck,proposal,creation);return proposal;
      }catch(error){
        if(signal.aborted)throw signal.reason;
        if(!(error instanceof SourceRepair)&&++failures>=3){if(creation&&bestCreation)return fallbackCreation()!;throw new Error(`The proposal could not be validated. ${redact((error as Error).message).slice(0,500)}`);}
        const feedback={role:'user',content:`The proposal was rejected: ${redact((error as Error).message).slice(0,1000)}. Fix it using the original scope and current baseRevision. ${creation?'Return storyJson with the complete authored title/slides, or submit prepare_story. Do not submit custom layout operations or recipe IDs.':options.workflowServices?'Use the supported workflow or status tools for actions and questions; use propose_edit only for document edits.':'Return a valid JSON proposal.'}`};responses.push(feedback);messages.push(feedback);continue;
      }
    }
    if((calls+=toolCalls.length)>24||toolCalls.length>8)throw new Error('This request needs too many steps. Split it into smaller edits.');
    if(toolCalls.some(t=>submissions.has(t.name))&&toolCalls.some(t=>t.name.startsWith('request_')))throw new Error('Finish and apply the document proposal before requesting workflow actions.');
    if(toolCalls.filter(t=>submissions.has(t.name)).length>1){
      if(++failures>=3)throw new Error('The model repeatedly split this edit into competing proposals. No changes were made.');
      const feedback=JSON.stringify({error:pageBatch?'Multiple proposals were rejected without applying anything. Combine ALL required page numbers in ONE propose_page_edits call, using the current baseRevision. Keep the original request and scope.':'Multiple proposals were rejected without applying anything. Combine every requested change into ONE atomic submission with the current baseRevision. Prepare helpers if needed, then submit all intended recipeIds together.',documentUnchanged:true});
      for(const call of toolCalls){responses.push({type:'function_call_output',call_id:call.id,output:feedback});messages.push({role:'tool',tool_call_id:call.id,content:feedback});}
      continue;
    }
    const execute=async(call:any)=>{
      signal.throwIfAborted();
      const tool=kit.tools.find(t=>t.name===call.name);let value:unknown;
      try {
        if(creation&&!creationTools.has(call.name))throw new Error('Submit the complete story with prepare_story. It returns the reviewable draft directly; separate recipe submission and custom layout operations are unavailable during creation.');
        if(!tool)throw new Error('Unknown tool. Use get_capabilities for supported tools.');
        if(pageBatch&&!batchTools.has(call.name))throw new Error('Use propose_page_edits for ALL required pages, with typed content/layout/assets together. No separate prepared recipes are needed.');
        progress({stage:submissions.has(call.name)?'validate':'tool',message:toolMessages[call.name]??(call.name.startsWith('request_')?'Preparing the editor action…':call.name.includes('workflow')?'Checking action status…':'Preparing your changes…'),tool:call.name,round});
        const rawArgs=omitNull(JSON.parse(call.arguments));
        if(creation&&call.name==='prepare_story'){value=await createProposal(rawArgs);signal.throwIfAborted();return {call,value};}
        if(call.name==='request_presentation'&&rawArgs.command==='start'&&fromCurrent){if(options.activeSlideId)rawArgs.slideId=options.activeSlideId;else delete rawArgs.slideId;}
        const args:Record<string,any>=tool.schema.parse(call.name==='prepare_story'?await authoredCreationStory(rawArgs,deck):rawArgs);
        if(submissions.has(call.name)&&toolErrors.length)throw new Error(`A companion tool failed: ${toolErrors.map(e=>e.tool+': '+e.error).join('; ')}. Repair the complete requested change before submitting; do not drop failed work.`);
        if(pageBatch&&call.name==='propose_page_edits'){
          batchSchema.parse(args);
          for(const page of args.pages){const requirement=pageRequest.pages.find(p=>p.number===page.number);if(!requirement)continue;
            Object.assign(page,requestedTextPatch(requirement,page));
            if(requirement.itemCount===undefined)delete page.replaceItems;else delete page.items;
            if(requirement.reflow)page.reflow=true;else delete page.reflow;
            if(!requirement.notesEditable)delete page.notes;
            if(!requirement.layout&&!/(?:版式|布局|模板|layout|template|reflow)/i.test(requirement.instruction))delete page.layout;
            if(!requirement.collection)delete page.collection;
            if(!/(?:密度|阅读|reading|density)/i.test(requirement.instruction))delete page.density;
            if(!requirement.chart)delete page.chart;
            else if(page.chart){for(const key of Object.keys(page.chart))if(!requirement.chart.editable.includes(key))delete page.chart[key];for(const [key,fields]of Object.entries(requirement.chart.nested??{})){if(!page.chart[key])continue;for(const field of Object.keys(page.chart[key]))if(!fields.includes(field))delete page.chart[key][field];if(!Object.keys(page.chart[key]).length)delete page.chart[key];}}
            if(requirement.chart){const chart=requestedChartPatch(deck,requirement,page.chart);if(Object.keys(chart).length)page.chart=chart;}
          }
        }
        if(['propose_updates','propose_prepared_edits'].includes(call.name))verifyRecipes(args.includeAllPrepared?kit.pendingRecipeIds():args.recipeIds);
        if(call.name==='propose_edit')verifyRecipes(JSON.parse(args.proposalJson).prepared);
        if(call.name==='propose_page_edits')verifyRecipes([]);
        value=await tool.run(args);if(creation&&call.name==='list_templates'){const catalog=value as any;value={collections:catalog.collections,layouts:catalog.layouts.filter((l:any)=>l.authoredContent).map((l:any)=>({id:l.id,name:l.name,task:l.contract.task,inputs:l.inputs,rules:l.rules,capacity:l.contract.capacity})),selectionGuide:catalog.selectionGuide};}if(submissions.has(call.name)){validateRequest(value as Proposal);if(creation)(await import('../src/core/ai-story-builder')).creationPreview(deck,value as Proposal,creation);}signal.throwIfAborted();
        if(!submissions.has(call.name)&&JSON.stringify(value).length>160_000)throw new Error('This result is too large. Narrow the query or read fewer slides.');
      }catch(error){if(signal.aborted)throw signal.reason;value=toolFailure(error,{tool:call.name,deckId:deck.id});(value as any).error=redact((value as any).error);if(creation&&call.name==='prepare_story'){Object.assign(value as object,{retryable:true,recovery:'Repair the complete story using this error. Preserve the brief and supplied facts. Submit prepare_story again; do not use recipe IDs or custom layout operations.',next:{tool:'prepare_story',action:'repair_story'},documentUnchanged:true});progress({stage:'validate',message:'Refining slide content and layout…',round});}if(submissions.has(call.name)&&pageBatch){Object.assign(value as object,{next:{tool:'propose_page_edits',action:'repair_complete_batch'},baseRevision:deck.revision,documentUnchanged:true,requiredPages:pageRequest.pages.map(p=>({number:p.number,slideId:p.slideId,texts:p.texts,textFields:p.textFields,notesEditable:p.notesEditable,layout:p.layout,collection:p.collection,density:p.density,chart:p.chart,artwork:p.replaceArtwork?'replace requested':p.styleArtwork?'same-resource style only':'preserve'})),deletePages:pageRequest.deletedNumbers,additions:pageRequest.additions});progress({stage:'validate',message:'Correcting incomplete changes…',round});}if(submissions.has(call.name)&&!(error instanceof SourceRepair)&&++failures>=3){if(creation&&bestCreation)return {call,value:fallbackCreation()!};throw new Error(`The proposal could not be validated. ${(value as any).error}`);}}
      return {call,value};
    };
    const parallel=new Set(['get_capabilities','get_edit_schema','read_deck','read_assets','read_template','read_prepared_edit','review_prepared_edit','search_document','review_presentation','list_workflows','search_fonts','list_templates','get_resource_catalog','search_resources','get_workflow_capabilities','get_connection_status']);
    const workflowResults:WorkflowOutcome[]=[],toolErrors:{tool:string;error:string;code?:string}[]=[];let information:AIInformation|undefined;
    for(let i=0;i<toolCalls.length;){
      const start=i++;if(parallel.has(toolCalls[start].name))while(i<toolCalls.length&&parallel.has(toolCalls[i].name))i++;
      const completed=await Promise.all(toolCalls.slice(start,i).map(execute));
      for(const {call,value} of completed){
        if(submissions.has(call.name)&&!(value as any)?.error)return value as Proposal;
        if((value as any)?.error)toolErrors.push({tool:call.name,error:(value as any).error,code:(value as any).code});
        if((value as any)?.kind==='information')information=AIInformationSchema.parse(value);
        if((value as any)?.kind==='workflow')workflowResults.push(WorkflowOutcomeSchema.parse(value));
        const content=JSON.stringify(value);
        responses.push({type:'function_call_output',call_id:call.id,output:content});messages.push({role:'tool',tool_call_id:call.id,content});
      }
    }
    if(kit.pendingRecipeIds().length){const ledger={role:'user',content:JSON.stringify({preparedRecipeIds:kit.pendingRecipeIds(),next:'Finish all intended work through propose_prepared_edits with includeAllPrepared:true, plus updates for object copy and slideUpdates:[{slideId,notes}] for speaker notes. Discard only explicitly superseded alternatives. Do not recreate successful preparations or submit separate proposals.'})};responses.push(ledger);messages.push(ledger);}
    if(workflowResults.length)return {kind:'workflow',request:workflowResults[0].request,additionalRequests:workflowResults.slice(1).map(v=>v.request),...(toolErrors.length?{failures:toolErrors}: {})};
    // Let the model see failed companion calls before finalizing an answer.
    if(information&&!toolErrors.length)return information;
  }
  if(creation&&bestCreation)return fallbackCreation()!;
  throw new Error('The model did not finish a valid proposal. Narrow the request and try again.');
}

/** Backward-compatible edit-only API for integrations that expect a Proposal. */
export async function proposeAI(deck:Deck,prompt:string,scope:EditScope,settings:AISettings,options:AIRunOptions={}):Promise<Proposal>{const result=await runAI(deck,prompt,scope,settings,{...options,workflowServices:undefined});if('kind' in result)throw new Error('Use the workflow-enabled AI endpoint for editor actions.');return result;}
