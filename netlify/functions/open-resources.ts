import {searchResources, loadResource} from '../../server/resources';

// Netlify enforces this at the edge per IP/domain on all plans. Verify the
// deployment's post-processing log: local tests cannot prove edge enforcement.
export const config = {path: '/.netlify/functions/open-resources', rateLimit: {windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain']}};
let active = 0;
const headers = {'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'};
const fail = (statusCode: number, error: string) => ({statusCode, headers: {...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store'}, body: JSON.stringify({error})});
export const handler = async (event: {httpMethod: string; queryStringParameters: Record<string, string> | null}) => {
  if (event.httpMethod !== 'GET') return {...fail(405, 'Use GET for photo requests.'), headers: {...headers, Allow: 'GET'}};
  if (process.env.DECKLEAF_PHOTO_SEARCH_ENABLED !== 'true') return fail(503, 'Online photos are temporarily disabled. Upload a photo from your device.');
  const params = new URLSearchParams(event.queryStringParameters || {}), action = params.get('action');
  if ([...params].length > 12 || [...params].some(([key, value]) => key.length > 30 || value.length > 200 || /[\u0000-\u001f]/.test(value))) return fail(400, 'Photo search parameters are too long.');
  if (action && (!['preview', 'import'].includes(action) || !/^openverse:[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(params.get('id') || ''))) return fail(400, 'Invalid photo request.');
  if (!action && (params.get('kind') !== 'photo' || ['unsplash', 'pexels'].includes(params.get('source') || '') || !/^(?:[1-9]|[1-4]\d|50)$/.test(params.get('page') || '1'))) return fail(400, 'Only open photo search, up to page 50, is supported.');
  if (active >= 4) return fail(429, 'Photo search is busy. Try again shortly or upload a photo.');
  active++;
  try {
    if (action) {
      const data = await loadResource(params.get('id')!, undefined, action === 'preview');
      if (data.bytes.length > 4_000_000) return fail(413, 'This photo is too large for online import. Download it from its source and upload it here.');
      if (action === 'preview') return {statusCode: 200, headers: {...headers, 'Content-Type': data.type}, isBase64Encoded: true, body: data.bytes.toString('base64')};
      return {statusCode: 200, headers: {...headers, 'Content-Type': 'application/json'}, body: JSON.stringify({src: `data:${data.type};base64,${data.bytes.toString('base64')}`, resource: data.resource})};
    }
    return {statusCode: 200, headers: {...headers, 'Content-Type': 'application/json'}, body: JSON.stringify(await searchResources(params))};
  } catch {
    return fail(502, 'The photo source is unavailable. Try again later or upload a photo from your device.');
  } finally { active--; }
};
