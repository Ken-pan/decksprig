import {jsonRequest} from './json-request';
import type {WorkflowRequest,WorkflowReceipt,WorkflowServices} from './workflows';
import {workflowClientId} from './workflow-session';
export {workflowClientId} from './workflow-session';
export {workflowLabel} from './workflow-label';
const schemas=()=>import('./workflows');
export const workflowServices:WorkflowServices={list:async(deckId,input)=>{const params=new URLSearchParams({deckId});for(const [key,value] of Object.entries(input))if(value!==undefined)params.set(key,String(value));return (await schemas()).WorkflowPageSchema.parse(await jsonRequest('/api/workflows/history?'+params));},request:async(deck,action)=>(await schemas()).WorkflowRequestSchema.parse(await jsonRequest('/api/workflows','POST',{deckId:deck.id,baseRevision:deck.revision,action})),read:async id=>(await schemas()).WorkflowRequestSchema.parse(await jsonRequest(`/api/workflows/${id}`)),connections:()=>jsonRequest('/api/workflows/connections')};
export async function claimWorkflow(request:WorkflowRequest){return (await schemas()).WorkflowRequestSchema.parse(await jsonRequest(`/api/workflows/${request.id}/claim`,'POST',{clientId:workflowClientId}));}
export async function resolveWorkflow(request:WorkflowRequest,status:'completed'|'waiting_for_user'|'failed'|'dismissed',result?:WorkflowReceipt){return (await schemas()).WorkflowRequestSchema.parse(await jsonRequest(`/api/workflows/${request.id}/resolve`,'POST',{clientId:workflowClientId,status,result}));}
