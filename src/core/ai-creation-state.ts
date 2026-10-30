import {z} from './schema';
import {CreationBriefSchema,type CreationBrief} from './ai-creation-schema';
import type {Deck} from './model';
import type {Proposal} from './operations';
export type AICreationState=CreationBrief&{base:Deck|null;proposal:Proposal|null;draftBrief:CreationBrief|null;page:number};
const key='deck-studio-ai-creation-brief';
const defaults=():CreationBrief=>({brief:'',audience:'',goal:'',delivery:'presentation',slideCount:6,collection:'review',templateMode:'auto',materials:''});
const draftSchema=z.extend(CreationBriefSchema, {brief:z.union([CreationBriefSchema.shape.brief, CreationBriefSchema.shape.audience])});
export function newAICreationState(storage?:Pick<Storage,'getItem'>):AICreationState{let brief=defaults();try{const raw=(storage??globalThis.localStorage)?.getItem(key);if(raw)brief={...brief,...draftSchema.parse(JSON.parse(raw))};}catch{/* A malformed draft does not block creation. */}return {...brief,base:null,proposal:null,draftBrief:null,page:0};}
export function saveAICreationBrief(value:CreationBrief,storage?:Pick<Storage,'setItem'>){try{const safe=draftSchema.parse({brief:value.brief,audience:value.audience,goal:value.goal,delivery:value.delivery,slideCount:value.slideCount,collection:value.collection,templateMode:value.templateMode,materials:value.materials});(storage??globalThis.localStorage)?.setItem(key,JSON.stringify(safe));}catch{/* Incomplete fields and storage failures keep the in-memory brief. */}}
export function clearAICreationBrief(storage?:Pick<Storage,'removeItem'>){try{(storage??globalThis.localStorage)?.removeItem(key);}catch{}}
