import {BRAND_NAME} from '../brand-name.js';
import type {Deck} from './model';
type GoogleSource=NonNullable<Deck['googleSource']>;
export type GoogleExportPlan={source:GoogleSource;sourceFingerprint:string;requests:Record<string,any>[];edits:number};
export function googleFingerprint(presentation:any):string{
 // commentsViewMode describes this API read's comment visibility, not an
 // authored slide change. It differs between direct OAuth and connector reads.
 const canonical=(value:any):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).filter(k=>value[k]!=null&&!['revisionId','contentUrl','presentationId','title','url','presentation_url','commentsViewMode'].includes(k)).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
 return canonical(presentation);
}
type GoogleFetch=typeof fetch;
export function verifyGoogleExport(before:any,after:any,requests:Record<string,any>[]){
 const elements=(p:any)=>{const out=new Map<string,any>();const visit=(e:any)=>{out.set(e.objectId,e);for(const c of e.elementGroup?.children??[])visit(c);};for(const s of p.slides??[])for(const e of s.pageElements??[])visit(e);return out;};
 const source=elements(before),result=elements(after),expected=new Map<string,string>();
 if(before.slides?.length!==after.slides?.length||source.size!==result.size)throw new Error('The native export structure differs.');
 const visibility=new Map<string,boolean>((before.slides??[]).map((s:any)=>[s.objectId,Boolean(s.slideProperties?.isSkipped)]));
 for(const request of requests)if(request.updateSlideProperties){const r=request.updateSlideProperties;visibility.set(r.objectId,Boolean(r.slideProperties.isSkipped));}
 for(const [index,slide]of (after.slides??[]).entries()){
  if(slide.objectId!==before.slides[index].objectId||Boolean(slide.slideProperties?.isSkipped)!==visibility.get(slide.objectId))throw new Error('Native slide visibility verification failed.');
 }
 for(const [id,e]of source){const text=e.shape?.text?.textElements;if(text)expected.set(id,text.map((x:any)=>x.textRun?.content??x.autoText?.content??'').join(''));
  const out=result.get(id);if(!out||JSON.stringify(e.transform)!==JSON.stringify(out.transform)||JSON.stringify(e.size)!==JSON.stringify(out.size))throw new Error('The native export geometry differs.');
 }
 for(const request of requests){if(request.deleteText){const r=request.deleteText,t=expected.get(r.objectId)!;expected.set(r.objectId,t.slice(0,r.textRange.startIndex)+t.slice(r.textRange.endIndex));}if(request.insertText){const r=request.insertText,t=expected.get(r.objectId)!;expected.set(r.objectId,t.slice(0,r.insertionIndex)+r.text+t.slice(r.insertionIndex));}}
 for(const [id,text]of expected){const actual=result.get(id)?.shape?.text?.textElements?.map((x:any)=>x.textRun?.content??x.autoText?.content??'').join('');if(actual!==text)throw new Error('Native text verification failed.');}
}
async function request(url:string,token:string,body?:unknown,transport:GoogleFetch=fetch){
 const response=await transport(url,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw new Error(`Google returned ${response.status}. Use an OAuth token with presentations and Drive copy access.`);
 return response.json() as Promise<any>;
}
export async function exportGoogle(input:any,transport:GoogleFetch=fetch,planFactory:(source:unknown,state:unknown)=>Promise<GoogleExportPlan>,fingerprint=googleFingerprint){
 if(typeof input.token!=='string'||!input.token.trim()||input.token.length>10000)throw new Error('Enter an OAuth access token for this export.');
 const token=input.token.trim(),plan=await planFactory(input.source,input.state);
 const latest=await request(`https://slides.googleapis.com/v1/presentations/${plan.source.presentationId}`,token,undefined,transport);
 if(fingerprint(latest)!==plan.sourceFingerprint)throw new Error('The Google source changed after import. Import it again before exporting a native copy.');
 const title=typeof input.title==='string'?input.title.slice(0,300):`${BRAND_NAME} export`;
 const copy=await request(`https://www.googleapis.com/drive/v3/files/${plan.source.presentationId}/copy?fields=id,webViewLink`,token,{name:title,parents:['root']},transport);
 if(! /^[\w-]{10,200}$/.test(copy.id??''))throw new Error('Google did not return the exported copy.');
 const url=`https://docs.google.com/presentation/d/${copy.id}/edit`;
 try{
  if(plan.requests.length){const current=await request(`https://slides.googleapis.com/v1/presentations/${copy.id}?fields=revisionId`,token,undefined,transport);
   await request(`https://slides.googleapis.com/v1/presentations/${copy.id}:batchUpdate`,token,{requests:plan.requests,...(current.revisionId?{writeControl:{requiredRevisionId:current.revisionId}}:{})},transport);
  }
  const verified=await request(`https://slides.googleapis.com/v1/presentations/${copy.id}`,token,undefined,transport);
  verifyGoogleExport(latest,verified,plan.requests);
  return {url,presentationId:copy.id,nativeEdits:plan.edits,fidelity:'native-source'};
 }catch{throw new Error(`Google created a copy but could not complete the edits. The source is preserved. Review the copy at ${url}`);}
}
