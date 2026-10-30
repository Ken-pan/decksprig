import {z} from './schema';

// Remove defaults only along the field's input wrappers. Supplied objects still
// receive their own canonical defaults; an omitted patch field stays omitted.
function withoutDefault(value:z.core.$ZodType):z.core.$ZodType{
 if(value instanceof z.ZodMiniDefault)return withoutDefault(value.def.innerType);
 if(value instanceof z.ZodMiniPipe)return value.clone({...value.def,in:withoutDefault(value.def.in)});
 if(value instanceof z.ZodMiniOptional)return value.clone({...value.def,innerType:withoutDefault(value.def.innerType)});
 if(value instanceof z.ZodMiniNullable)return value.clone({...value.def,innerType:withoutDefault(value.def.innerType)});
 return value;
}
/** Preserve sparse updates when a canonical field has a Zod4 default. */
export function patchSchema<S extends z.core.$ZodShape,C extends z.core.$ZodObjectConfig>(schema:z.ZodMiniObject<S,C>){
 const shape=Object.fromEntries(Object.entries(schema.shape).map(([key,value])=>[key,withoutDefault(value)])) as S;
 return z.partial(schema.clone({...schema.def,shape}));
}
