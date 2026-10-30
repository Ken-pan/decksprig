import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {requestBytes} from './request-body';
import {sendDocumentJson} from './document-json-response';
import { access } from 'node:fs/promises';
import { serveStatic } from './static';
import { resolve, extname } from 'node:path';
import { initStore, listDecks, readLibraryPreview, readDeck, saveDeck, proposals, resolveProposal, listHistory, readHistory } from './store';
import { validateDeck, NativeSourceSchema } from '../src/core/model';
import { ProposalSchema, applyOperations } from '../src/core/operations';
import { runAI, availableModels } from './ai';
import {workflowServices} from './ai-workflows';
import {workflows} from './workflows';
import {editorContexts} from './editor-context';
import {workspaceIdentity} from './mcp-workflows';
import {publishing} from './publishing';
import {z} from '../src/core/schema';
import {WorkflowActionSchema,WorkflowListInputSchema} from '../src/core/workflows';
import {editingServices} from './ai-services';
import { convertUpload, converters, exportKeynote } from './convert';
import { figmaImport, googleImport } from './cloud-import';
import {preserveGoogleSource,googleExportPlan,exportGoogle} from './google-export';
import {googleOAuth,oauthCookie,sessionCookie,GOOGLE_COOKIE,GOOGLE_PENDING_COOKIE} from './google-oauth';
import { searchResources, loadResource, resourceCatalog } from './resources';
import { photoProviders } from './photo-providers';
import {characterCatalog,renderCharacter,characterEmbedded,savedCharacterEmbedded,saveCharacterVariant,savedCharacterImage,saveCharacterRequest,characterRequests} from './characters';

const port = Number(process.env.PORT || 4310);
const prod = process.env.NODE_ENV === 'production';
await initStore();
const vite = prod ? null : await (await import('vite')).createServer({cacheDir: resolve('node_modules/.vite', `deck-studio-${port}`), optimizeDeps: {include: ['pptxgenjs']}, server: {middlewareMode: true, hmr: false, ws: false, watch: {ignored: ['**/output/**', '**/.data/**', '**/dist/**']}}, appType: 'spa'});
const bytes=requestBytes;
const json = async (req: IncomingMessage) => JSON.parse((await bytes(req)).toString('utf8'));
function send(res: ServerResponse, value: unknown, status = 200) { if (res.headersSent || res.destroyed || res.writableEnded) return; if((value as any)?.schema==='deck-studio/1')return sendDocumentJson(res,value as any,status);res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(value)); }
function sendSaved(req:IncomingMessage,res:ServerResponse,deck:Awaited<ReturnType<typeof saveDeck>>) {
  const preference=Array.isArray(req.headers.prefer)?req.headers.prefer.join(','):req.headers.prefer;
  if(preference?.split(',').some(p=>p.trim().toLowerCase()==='return=minimal')){
    res.setHeader('Preference-Applied','return=minimal');return send(res,{id:deck.id,revision:deck.revision,updatedAt:deck.updatedAt});
  }
  return send(res,deck);
}
const server = createServer(async (req, res) => {
  const host = req.headers.host || '';
  if (![`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(host)) return send(res, {error: 'Local host only'}, 403);
  const origin = req.headers.origin;
  if (origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin)) return send(res, {error: 'Same-origin requests only'}, 403);
  const requestUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`);
  const path = requestUrl.pathname;
  try {
    const googleSession=oauthCookie(req.headers.cookie,GOOGLE_COOKIE),googlePending=oauthCookie(req.headers.cookie,GOOGLE_PENDING_COOKIE);
    if(path==='/api/agent/context'&&req.method==='POST')return send(res,editorContexts.update(await json(req)));
    if(path==='/api/agent/context'&&req.method==='GET')return send(res,{...await editorContexts.read(requestUrl.searchParams.get('deckId')||undefined),workspaceId:workspaceIdentity});
    if(path==='/api/workflows/connections'&&req.method==='GET')return send(res,{...await workflowServices(googleSession).connections() as object,workspaceId:workspaceIdentity,editorReachable:true});
    if(path==='/api/workflows/history'&&req.method==='GET'){const deckId=requestUrl.searchParams.get('deckId')||'';await readDeck(deckId);const input=WorkflowListInputSchema.parse({status:requestUrl.searchParams.get('status')||undefined,offset:requestUrl.searchParams.has('offset')?Number(requestUrl.searchParams.get('offset')):undefined,limit:requestUrl.searchParams.has('limit')?Number(requestUrl.searchParams.get('limit')):undefined});return send(res,await workflows.page(deckId,input));}
    if(path==='/api/workflows'&&req.method==='GET'){const deckId=requestUrl.searchParams.get('deckId')||'';await readDeck(deckId);return send(res,await workflows.list(deckId));}
    if(path==='/api/workflows'&&req.method==='POST'){const input=z.strictObject({deckId:z.string(),baseRevision:z.number().check(z.int()).check(z.minimum(0)),action:WorkflowActionSchema}).parse(await json(req)),deck=await readDeck(input.deckId);if(deck.revision!==input.baseRevision)throw new Error('Save the current document before requesting an action.');return send(res,await workflows.request(deck,input.action));}
    const workflow=path.match(/^\/api\/workflows\/([\da-f-]{36})(?:\/(claim|resolve))?$/);
    if(workflow){if(req.method==='GET'&&!workflow[2])return send(res,await workflowServices(googleSession).read(workflow[1]));if(req.method!=='POST'||!workflow[2])throw new Error('Unsupported workflow operation.');const input=await json(req);return send(res,workflow[2]==='claim'?await workflows.claim(workflow[1],input.clientId):await workflows.resolve(workflow[1],input.clientId,input.status,input.result));}
    if(path==='/api/publishing/connection'&&req.method==='GET')return send(res,publishing.connection());
    if(path==='/api/publishing/connection'&&req.method==='PUT')return send(res,await publishing.connect((await json(req)).token));
    if(path==='/api/publishing/prepare'&&req.method==='POST'){const input=await json(req);return send(res,await publishing.prepare(input.deckId,input.revision,input.html));}
    const publication=path.match(/^\/api\/publishing\/([\da-f-]{36})(?:\/(html|publish))?$/);
    if(publication){if(publication[2]==='html'&&req.method==='GET'){const html=await publishing.html(publication[1]);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"sandbox allow-scripts; default-src 'self' data: blob: https:; connect-src 'none'",'X-Content-Type-Options':'nosniff'});res.end(html);return;}if(publication[2]==='publish'&&req.method==='POST')return send(res,await publishing.publish(publication[1],(await json(req)).confirmation));if(req.method==='GET')return send(res,await publishing.status(publication[1]));}
    if(path==='/api/google/oauth/status'&&req.method==='GET')return send(res,await googleOAuth.status(googleSession));
    if(path==='/api/google/oauth/start'&&req.method==='POST'){
      const input=await json(req);if(typeof input.presentationId!=='string')throw new Error('Choose the native Google source to connect.');const started=await googleOAuth.begin(`http://${host}`,googlePending,input.presentationId);res.setHeader('Set-Cookie',sessionCookie(GOOGLE_PENDING_COOKIE,started.browser,600));return send(res,{url:started.url});
    }
    if(path==='/api/google/oauth/callback'&&req.method==='GET'){
      try{const connected=await googleOAuth.complete(requestUrl.searchParams,googlePending);
        res.writeHead(303,{'Location':'/google-authorized.html','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Set-Cookie':[sessionCookie(GOOGLE_COOKIE,connected.session,connected.ttl),sessionCookie(GOOGLE_PENDING_COOKIE,'',0)]});
      }catch{res.writeHead(303,{'Location':'/google-authorized.html?error=authorization_failed','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Set-Cookie':sessionCookie(GOOGLE_PENDING_COOKIE,'',0)});}
      res.end();return;
    }
    if(path==='/api/google/oauth/disconnect'&&req.method==='POST'){googleOAuth.disconnect(googleSession,googlePending);res.setHeader('Set-Cookie',[sessionCookie(GOOGLE_COOKIE,'',0),sessionCookie(GOOGLE_PENDING_COOKIE,'',0)]);return send(res,{connected:false});}
    if(path==='/api/characters/catalog'&&req.method==='GET')return send(res,await characterCatalog());
    if(path==='/api/characters/preview'&&req.method==='GET'){
      const data=await renderCharacter(JSON.parse(requestUrl.searchParams.get('recipe')||'{}'),true);
      res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data.bytes);return;
    }
    if(path==='/api/characters/render'&&req.method==='POST'){const input=await json(req);return send(res,input.savedId?await savedCharacterEmbedded(input.savedId):await characterEmbedded(input.recipe));}
    if(path==='/api/characters/variants'&&req.method==='POST')return send(res,await saveCharacterVariant(await json(req)));
    const characterImage=path.match(/^\/api\/characters\/variants\/([\da-f-]+)\/image$/);
    if(characterImage&&req.method==='GET'){const data=await savedCharacterImage(characterImage[1]);res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'});res.end(data.bytes);return;}
    if(path==='/api/characters/requests'&&req.method==='GET')return send(res,await characterRequests());
    if(path==='/api/characters/requests'&&req.method==='POST')return send(res,await saveCharacterRequest(await json(req)));
    if (path === '/api/resources/providers' && req.method === 'GET') return send(res, photoProviders.status());
    if (path === '/api/resources/providers' && req.method === 'PUT') return send(res, await photoProviders.configure(await json(req)));
    if (path === '/api/resources/catalog' && req.method === 'GET') return send(res, await resourceCatalog());
    if (path === '/api/resources/search' && req.method === 'GET') return send(res, await searchResources(requestUrl.searchParams));
    if (path === '/api/resources/preview' && req.method === 'GET') {
      if (String(requestUrl.searchParams.get('id')).startsWith('unsplash:')) { const photo = await photoProviders.photo(requestUrl.searchParams.get('id')!); res.writeHead(302, {'Location': photo.thumbnailUrl, 'Cache-Control': 'no-store'}); res.end(); return; }
      const recipe=requestUrl.searchParams.get('recipe');
      const data = await loadResource(requestUrl.searchParams.get('id') || '', requestUrl.searchParams.get('color') || undefined, true,recipe?JSON.parse(recipe):undefined,requestUrl.searchParams.get('detail')==='1');
      res.writeHead(200, {'Content-Type': data.type, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox"}); res.end(data.bytes); return;
    }
    if (path === '/api/resources/import' && req.method === 'POST') {
      const b = await json(req);
      if (String(b.id || '').startsWith('unsplash:')) return send(res, await photoProviders.importUnsplash(String(b.id)));
      if(b.characterRecipe && String(b.id||'').startsWith('character:'))return send(res,await characterEmbedded(b.characterRecipe));
      const data = await loadResource(String(b.id || ''), b.color || undefined,false,b.graphicRecipe);
      return send(res, {src: `data:${data.type};base64,${data.bytes.toString('base64')}`, resource: data.resource});
    }
    if (path === '/api/health') return send(res, {ok: true, converters: await converters(), ai: {configured: Boolean(process.env.OPENAI_API_KEY || process.env.DECK_AI_KEY), model: process.env.DECK_AI_MODEL || ''}});
    if (path === '/api/decks' && req.method === 'GET') return send(res, await listDecks(requestUrl.searchParams.get('view') !== 'summary'));
    if (path === '/api/decks' && req.method === 'POST') return sendSaved(req,res,await saveDeck(validateDeck(await json(req)),null));
    const preview = path.match(/^\/api\/decks\/([\w.:-]+)\/preview$/);
    if (preview && req.method === 'GET') return send(res, await readLibraryPreview(preview[1], requestUrl.searchParams.has('revision') ? Number(requestUrl.searchParams.get('revision')) : undefined));
    const historyList = path.match(/^\/api\/decks\/([\w.:-]+)\/history$/);
    if (historyList && req.method === 'GET') return send(res, await listHistory(historyList[1]));
    const historyVersion = path.match(/^\/api\/decks\/([\w.:-]+)\/history\/(\d+)$/);
    if (historyVersion && req.method === 'GET') return send(res, await readHistory(historyVersion[1], Number(historyVersion[2])));
    const match = path.match(/^\/api\/decks\/([\w.:-]+)$/);
    if (match && req.method === 'GET') return send(res, await readDeck(match[1]));
    if (match && req.method === 'PUT') {
      const {deck, expectedRevision} = await json(req);
      if (deck.id !== match[1]) throw new Error('ID mismatch');
      return sendSaved(req,res,await saveDeck(validateDeck(deck),expectedRevision));
    }
    if (path === '/api/ai/propose' && req.method === 'POST') {
      const b = await json(req), deck = validateDeck(b.deck);
      const runOptions={services:editingServices,workflowServices:b.creation?undefined:workflowServices(googleSession),creation:b.creation,reviewEvidence:Boolean(b.creation),activeSlideId:b.activeSlideId,history:b.history};
      const controller=new AbortController();
      const abort=()=>{if(!res.writableEnded)controller.abort();};res.once('close',abort);
      try {
        if(req.headers.accept?.includes('text/event-stream')){
          res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'});
          const emit=(type:string,data:unknown)=>{if(!res.destroyed&&!res.writableEnded)res.write(`data: ${JSON.stringify({type,data})}\n\n`);};
          try{const proposal=await runAI(deck,b.prompt,b.scope,b.settings,{signal:controller.signal,...runOptions,onprogress:event=>emit('progress',event)});emit('kind' in proposal?'workflow':'proposal',proposal);}
          catch(error){if(!controller.signal.aborted)emit('error',{message:(error as Error).name==='TimeoutError'?'The model took too long. Reduce the scope and try again.':(error as Error).message});}
          if(!res.destroyed)res.end();return;
        }
        return send(res,await runAI(deck,b.prompt,b.scope,b.settings,{signal:controller.signal,...runOptions}));
      }finally{res.off('close',abort);}
    }
    if (path === '/api/ai/models' && req.method === 'POST') return send(res, await availableModels(await json(req)));
    if (path === '/api/proposal/preview' && req.method === 'POST') {
      const b = await json(req), deck = validateDeck(b.deck), proposal = ProposalSchema.parse(b.proposal);
      return send(res, {deck: applyOperations(deck, proposal.operations, proposal.baseRevision, 'ai')});
    }
    const proposalList = path.match(/^\/api\/decks\/([\w.:-]+)\/proposals$/);
    if (proposalList) return send(res, await proposals(proposalList[1]));
    const proposalResolve = path.match(/^\/api\/proposals\/([\w-]+)$/);
    if (proposalResolve && req.method === 'POST') {
      const b = await json(req); if (!['applied', 'dismissed'].includes(b.status)) throw new Error('Invalid proposal status');
      await resolveProposal(proposalResolve[1], b.status); return send(res, {ok: true});
    }
    if (path === '/api/export/keynote' && req.method === 'POST') {
      if(String(req.headers['content-type']).startsWith('application/json')){
        const raw=JSON.parse((await bytes(req,100_000_000)).toString());
        const nativeSource=NativeSourceSchema.parse(raw.nativeSource);
        if(typeof raw.pptx!=='string'||raw.pptx.length>135_000_000)throw new Error('Invalid PowerPoint export.');
        return send(res,await exportKeynote(Buffer.from(raw.pptx,'base64'),{nativeSource,state:raw.state}));
      }
      return send(res,await exportKeynote(await bytes(req,100_000_000)));
    }
    if (path === '/api/convert' && req.method === 'POST') {
      const filename = decodeURIComponent(String(req.headers['x-filename'] || ''));
      return send(res, await convertUpload(await bytes(req, 100_000_000), filename, req.headers['x-native'] === 'true'));
    }
    if (path === '/api/import/figma' && req.method === 'POST') { const b = await json(req); return send(res, await figmaImport(b.url, b.token)); }
    if (path === '/api/import/google' && req.method === 'POST') { const b = await json(req),bundle=await googleImport(b.url,b.token); return send(res,{...bundle,googleSource:await preserveGoogleSource(bundle)}); }
    if (path === '/api/import/google/source' && req.method === 'POST') return send(res,{googleSource:await preserveGoogleSource(await json(req))});
    if (path === '/api/export/google/plan' && req.method === 'POST') {const b=await json(req);return send(res,await googleExportPlan(b.source,b.state));}
    if (path === '/api/export/google' && req.method === 'POST') {const input=await json(req);return send(res,await exportGoogle({...input,token:input.authorization==='google-oauth'?googleOAuth.token(googleSession):input.token}));}
    if (path.startsWith('/api/')) return send(res, {error: 'Not found'}, 404);
    if (vite) { vite.middlewares(req, res, () => { res.writeHead(404); res.end(); }); return; }
    const root = resolve(process.env.DECK_STUDIO_DIST || 'dist'), requested = resolve(root, `.${decodeURIComponent(path)}`);
    if (!requested.startsWith(root + '/') && requested !== root) return send(res, {error: 'Not found'}, 404);
    let file = requested;
    if (path === '/') file = resolve(root, 'index.html');
    try { await access(file); } catch { if (extname(path) && path !== '/') return send(res, {error: 'File not found.'}, 404); file = resolve(root, 'index.html'); }
    if (res.destroyed) return;
    await serveStatic(req, res, file);
  } catch (error: any) { if (res.headersSent) { res.destroy(); return; } send(res, {error: error.code === 'ENOENT' ? 'File not found.' : error.message || 'Could not complete the action. Try again.'}, error.status || (error.code === 'ENOENT' ? 404 : 400)); }
});
server.listen(port, '127.0.0.1', () => console.log(`Decksprig · http://127.0.0.1:${port}`));
process.once('SIGTERM', () => server.close(() => process.exit()));
process.once('SIGINT', () => server.close(() => process.exit()));
