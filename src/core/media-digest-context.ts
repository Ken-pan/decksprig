// Opaque, process-local memoization: serialized flags cannot authorize a digest.
declare const brand:unique symbol;
export type MediaDigestContext={readonly [brand]:true};
type Entry={promise:Promise<string>;bytes:number};
type State={entries:Map<string,Entry>;bytes:number};
const contexts=new WeakMap<MediaDigestContext,State>(),budget=8*1024*1024;
export function createMediaDigestContext():MediaDigestContext {
 const context=Object.freeze({}) as MediaDigestContext;contexts.set(context,{entries:new Map(),bytes:0});return context;
}
async function calculate(value:string):Promise<string>{return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(b=>b.toString(16).padStart(2,'0')).join('');}
/** Memoize only an actually computed digest of the same immutable string value. */
export async function digestMedia(value:string,context?:MediaDigestContext):Promise<string>{
 if(!context)return calculate(value);
 const state=contexts.get(context);if(!state)throw new Error('Invalid media digest context.');
 const old=state.entries.get(value);if(old){state.entries.delete(value);state.entries.set(value,old);return old.promise;}
 const bytes=value.length*2;if(bytes>budget)return calculate(value);
 while(state.bytes+bytes>budget){const first=state.entries.entries().next().value;if(!first)break;state.entries.delete(first[0]);state.bytes-=first[1].bytes;}
 const entry={promise:calculate(value),bytes};state.entries.set(value,entry);state.bytes+=bytes;
 void entry.promise.catch(()=>{if(state.entries.get(value)===entry){state.entries.delete(value);state.bytes-=bytes;}});
 return entry.promise;
}
