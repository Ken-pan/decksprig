import {abortable} from '../async-abort';
import {validateDeck} from '../model';
import {ProposalSchema,applyOperations} from '../operations';
import {listWebDecks,readWebLibraryPreview,readWebDeck,saveWebDeck,webHistory} from './store';

const unavailable = (message:string,status=409) => Object.assign(new Error(message),{status});
export async function browserJson(url:string,method='GET',body?:any,aiOptions:import('../../../server/ai').AIRunOptions={},signal:AbortSignal|undefined=aiOptions.signal):Promise<any> {
  signal?.throwIfAborted();
  const target=new URL(url,globalThis.location?.href || 'https://deck-studio.kens-toolbox.com'),path=target.pathname;
  if(path.startsWith('/api/workflows'))return (await import('./workflows')).browserWorkflow(path,method,body,target.searchParams);
  if(path.startsWith('/api/publishing/'))throw unavailable('Website hosting connections require the local edition. Export the HTML presentation here and publish it with your hosting provider.');
  if(path==='/api/health')return {ok:true,runtime:'browser',storage:'indexeddb',converters:{keynote:false,libreoffice:false},ai:{configured:false,model:''}};
  if(path==='/api/decks'){
    if(method==='GET')return listWebDecks(target.searchParams.get('view')!=='summary');
    if(method==='POST')return saveWebDeck(body,null);
  }
  const preview=path.match(/^\/api\/decks\/([\w.:-]+)\/preview$/);
  if(preview&&method==='GET')return readWebLibraryPreview(preview[1],target.searchParams.has('revision')?Number(target.searchParams.get('revision')):undefined);
  const document=path.match(/^\/api\/decks\/([\w.:-]+)$/);
  if(document){
    if(method==='GET')return readWebDeck(document[1]);
    if(method==='PUT'){if(body?.deck?.id!==document[1]||!Number.isSafeInteger(body?.expectedRevision))throw unavailable('Invalid document revision.',422);return saveWebDeck(body.deck,body.expectedRevision);}
  }
  const history=path.match(/^\/api\/decks\/([\w.:-]+)\/history(?:\/(\d+))?$/);
  if(history&&method==='GET')return webHistory(history[1],history[2]===undefined?undefined:Number(history[2]));
  if(/^\/api\/decks\/[\w.:-]+\/proposals$/.test(path))return [];
  if(path==='/api/proposal/preview'&&method==='POST'){const deck=validateDeck(body.deck),proposal=ProposalSchema.parse(body.proposal);return {deck:applyOperations(deck,proposal.operations,proposal.baseRevision,'ai')};}
  if(path.startsWith('/api/ai/')){
    const settings=path.endsWith('/models')?body:body?.settings;
    if(settings?.provider==='openai'&&!settings.apiKey?.trim())throw unavailable('Enter your session API key in AI settings.');
    if(settings?.provider==='compatible'&&!settings?.baseUrl?.startsWith('https://'))throw unavailable('Use an HTTPS provider that allows browser access. Local model servers are available in the local edition.');
    try{
      const ai=await import('../../../server/ai');
      if(path.endsWith('/models'))return ai.availableModels(settings);
      const resources=await import('./resources');
      const services:import('../ai-tools').EditingServices={
        searchResources:params=>resources.browserResourceJson('/api/resources/search',params,'GET',undefined,signal),
        resourceCatalog:()=>resources.browserResourceJson('/api/resources/catalog',new URLSearchParams(),'GET',undefined,signal),
        importResource:input=>resources.browserResourceJson('/api/resources/import',new URLSearchParams(),'POST',input,signal),
      };
      return await ai.runAI(validateDeck(body.deck),body.prompt,body.scope,settings,{...aiOptions,services,workflowServices:body.creation?undefined:(await import('../workflow-client')).workflowServices,creation:body.creation,reviewEvidence:Boolean(body.creation),activeSlideId:body.activeSlideId,history:body.history});
    }
    catch(error){if(error instanceof TypeError)throw unavailable('The provider could not be reached from this browser. Check its browser access settings, or use the local edition.',502);throw error;}
  }
  if(path.startsWith('/api/resources/'))return (await import('./resources')).browserResourceJson(path,target.searchParams,method,body,signal);
  if(path.startsWith('/api/characters/'))return (await import('./characters')).browserCharacterJson(path,method,body,signal);
  if(path==='/api/import/google/source')return (await import('./google')).preserveBrowserGoogleSource(body);
  if(path.startsWith('/api/import/'))return (await import('./cloud-import')).browserCloudImport(path,body);
  if(path.startsWith('/api/export/google'))return (await import('./google')).browserGoogleExport(path,body);
  if(path==='/api/convert'||path==='/api/export/keynote')throw unavailable('Keynote and desktop conversion require the local Mac edition. Import PowerPoint or PDF here instead.');
  throw unavailable('This action is unavailable in the browser edition.',404);
}
export async function browserResponse(url:URL,method:string,body?:unknown,signal?:AbortSignal):Promise<Response> {
  signal?.throwIfAborted();
  try {
    if(url.pathname==='/api/resources/preview')return await abortable(import('./resources').then(module=>{signal?.throwIfAborted();return module.browserResourcePreview(url.searchParams,signal);}),signal);
    if(url.pathname==='/api/characters/preview'||/^\/api\/characters\/variants\/[\da-f-]+\/image$/.test(url.pathname))return await abortable(import('./characters').then(module=>{signal?.throwIfAborted();return module.browserCharacterPreview(url.pathname,url.searchParams,signal);}),signal);
    return Response.json(await abortable(browserJson(url.href,method,body,{},signal),signal));
  }catch(error){if(signal?.aborted)throw signal.reason;const failure=error as Error&{status?:number};if(failure.name==='AbortError')throw failure;return Response.json({error:failure.message||'Could not complete the action.'},{status:failure.status||400});}
}
