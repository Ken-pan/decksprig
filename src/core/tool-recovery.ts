import {z} from './schema';
export const ToolFailureSchema=z.strictObject({error:z.string(),code:z.string(),retryable:z.boolean(),recovery:z.string(),next:z.record(z.string(),z.unknown()),issues:z.optional(z.array(z.object({path:z.array(z.union([z.string(),z.number()])),code:z.string(),message:z.string()})))});
export function omitNull(value:any):any{return Array.isArray(value)?value.map(omitNull):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([,item])=>item!==null).map(([key,item])=>[key,omitNull(item)])):value;}
export function toolFailure(error:unknown,context:{tool?:string;deckId?:string}={}){
 const value=error as Error&{code?:string;status?:number},raw=value?.message||'The tool could not finish.',message=value?.code==='ENOENT'?'Document not found. List documents and choose a current ID.':raw;
 let code='TOOL_FAILED',recovery='Check the tool arguments and retry within the original scope.',retryable=false,next:any={tool:'get_capabilities',arguments:{category:'editing'}};
 if(value instanceof z.core.$ZodError){code='INVALID_ARGUMENTS';recovery='Correct only the reported fields. Omit optional values you are not changing.';next={tool:context.tool,action:'correct_arguments'};}
 else if(value?.code==='ENOENT'){code='NOT_FOUND';recovery=message;next={tool:'list_decks',arguments:{}};}
 else if(/revision|document changed|stale|updated in another|prepared.*changed/i.test(message)){code='STALE_REVISION';recovery='Read the current revision and prepare changes again; do not rebase an old recipe.';next={tool:'read_deck',arguments:{deckId:context.deckId,detail:'outline'}};}
 else if(/locked|unlock/i.test(message)){code='LOCKED_CONTENT';recovery='Keep locked evidence unchanged. Use editable objects within the requested scope.';next={action:'choose_editable_objects'};}
 else if(/scope|outside|select all slides|choose this slide/i.test(message)){code='SCOPE_REQUIRED';recovery='Keep the requested scope. Ask the user to change scope only if this task requires it.';next={action:'review_scope'};}
 else if(/expired|reference.*found/i.test(message)){code='EXPIRED_REFERENCE';recovery='Prepare this recipe or resource again, then use its new reference.';next={action:'prepare_again'};}
 else if(/another editor|already running/i.test(message)){code='ACTION_IN_PROGRESS';recovery='Read the existing receipt; do not resend a running action.';next={tool:'list_workflows',arguments:{deckId:context.deckId,status:'active'}};}
 else if(/connect|authorization|credentials|API key|sign.in/i.test(message)){code='CONNECTION_REQUIRED';recovery='Use the native connection UI. Never put credentials in tool arguments.';next={tool:'get_connection_status',arguments:{},userActionRequired:true};}
 else if(/resource/i.test(message)&&/not found|does not exist|unknown|unavailable/i.test(message)&&['prepare_resource','prepare_asset_replacements','propose_page_edits'].includes(context.tool??'')){code='RESOURCE_NOT_FOUND';recovery='Search the resource library for the intended kind and query. Use an actual returned resource ID, never a placeholder or guessed ID.';next={tool:'search_resources',action:'find_actual_resource_id'};}
 else if(/no longer exists|not found|does not exist/i.test(message)){code='NOT_FOUND';recovery='Read current IDs before retrying.';next={tool:'read_deck',arguments:{deckId:context.deckId,detail:'outline'}};}
 else if(/Unknown|Choose|Provide|Supply|Invalid|at least|Use each|duplicate|already included|already creates/i.test(message)){code='INVALID_ARGUMENTS';recovery='Correct the arguments using the indicated requirement; preserve the original scope.';next={tool:context.tool,action:'correct_arguments'};}
 else if(value?.status===429||/timed out|timeout|unavailable|network/i.test(message)){code='TEMPORARILY_UNAVAILABLE';retryable=true;recovery='Retry the read later. Check an existing write receipt before resending it.';next={action:'retry_read_or_check_receipt'};}
 return {error:message.slice(0,1500),code,retryable,recovery,next,...(value instanceof z.core.$ZodError?{issues:value.issues.slice(0,8).map(({path,code,message})=>({path,code,message}))}:{})};
}
/** Optional fields accept null on MCP wires; canonical validation still runs after omission. */
export function mcpInputSchema(schema:z.core.$ZodObject):z.ZodMiniObject {
 const map=(item:z.core.$ZodType):z.core.$ZodType=>{
  if(item instanceof z.core.$ZodOptional)return z.optional(z.nullable(map(item._zod.def.innerType)));
  if(item instanceof z.core.$ZodDefault)return z.optional(z.nullable(map(item._zod.def.innerType)));
  if(item instanceof z.core.$ZodObject)return z.strictObject(Object.fromEntries(Object.entries(item._zod.def.shape).map(([key,value])=>[key,map(value as z.core.$ZodType)])));
  if(item instanceof z.core.$ZodNullable)return z.nullable(map(item._zod.def.innerType));
  if(item instanceof z.core.$ZodUnion)return z.union(item._zod.def.options.map(map));
  if(item instanceof z.core.$ZodTuple)return new z.ZodMiniTuple({...item._zod.def,items:item._zod.def.items.map(map),rest:item._zod.def.rest?map(item._zod.def.rest):null});
  // Clone the array definition so every original length/check survives mapping.
  if(item instanceof z.core.$ZodArray)return new z.ZodMiniArray({...item._zod.def,element:map(item._zod.def.element)});
  return item;
 };return map(schema) as z.ZodMiniObject;
}
