import {z} from '../src/core/schema';
import {strictToolSchema} from '../src/core/ai-tools';
import type {AISettings} from './ai';
import {omitNull} from './ai-schema';

export type StructuredOptions={settings:AISettings;base:string;key?:string;signal:AbortSignal;transport:typeof fetch};
/** Same provider/model as the author; no credentials or provider payloads in errors. */
export async function structuredResult<T extends z.ZodMiniObject>(name:string,schema:T,instructions:string,input:unknown,options:StructuredOptions){
 const openai=options.settings.provider==='openai',wire=strictToolSchema(schema),content=JSON.stringify(input);
 const body=openai?{model:options.settings.model,instructions,input:[{role:'user',content}],store:false,text:{format:{type:'json_schema',name,strict:true,schema:wire}},max_output_tokens:6000}:{model:options.settings.model,messages:[{role:'system',content:instructions+' Return JSON matching this schema: '+JSON.stringify(wire)},{role:'user',content}],response_format:{type:'json_object'},max_tokens:6000};
 const response=await options.transport(`${options.base}/${openai?'responses':'chat/completions'}`,{method:'POST',headers:{'Content-Type':'application/json',...(options.key?{Authorization:`Bearer ${options.key}`}:{})},body:JSON.stringify(body),signal:options.signal,redirect:'error'});
 if(!response.ok)throw new Error(`The draft check could not complete (${response.status}).`);
 const result:any=await response.json();
 if(result.status==='incomplete'||result.error||result.choices?.[0]?.finish_reason==='length')throw new Error('The draft check was incomplete.');
 const text=openai?(result.output??[]).flatMap((o:any)=>o.content??[]).filter((c:any)=>c.type==='output_text').map((c:any)=>c.text).join(''):result.choices?.[0]?.message?.content;
 try{return schema.parse(omitNull(JSON.parse(String(text).replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'')))) as z.infer<T>;}catch{throw new Error('The draft check returned an invalid result.');}
}
