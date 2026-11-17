import {AnimationSchema,type Deck,type ElementAnimation} from './model';
import type {Operation} from './operations';
import type {NativeDeckMotionAction,NativeDeckMotionCapture} from './native-deck-motion';

export interface NativeMotionImportPlan {baseRevision:number;operations:Operation[];issues:{slideId?:string;targetId?:string;message:string}[];source:'figma-native-deck';liveSync:false}
const nativeActionFields=['animationPhase','animationType','connectionType','easingFunction','easingType','transitionDuration','transitionNodeID'];
function nativeAnimation(action:NativeDeckMotionAction,order:number):ElementAnimation|string {
 if(action.connectionType!=='OBJECT_ANIMATION')return 'This native action is not a Slides object animation.';
 if(action.nativeFields.some(field=>!nativeActionFields.includes(field)))return 'This native animation has additional timing or behavior fields that need review.';
 if(action.phase!=='IN'&&action.phase!=='OUT')return 'This native animation phase is unavailable.';
 if(action.nativeType!=='FADE')return `Native ${action.nativeType??'unknown'} motion was captured, but its trajectory is not supported by the local player.`;
 if(action.durationMs===undefined||action.durationMs<100||action.durationMs>2000)return 'This native duration is outside the supported local range.';
 const animation:ElementAnimation={effect:'fade',phase:action.phase==='OUT'?'out':'in',duration:action.durationMs,delay:0,trigger:'click',order,easing:'linear'};
 if(action.easingType==='CUSTOM_CUBIC'){
  const curve=action.easingCubic;if(!curve||curve.length!==4||curve.some(n=>!Number.isFinite(n))||curve[0]<0||curve[0]>1||curve[2]<0||curve[2]>1)return 'This native cubic easing cannot be represented safely.';
  Object.assign(animation,{easing:'smooth',easingBezier:[...curve]});
 }else if(action.easingType!=='LINEAR')return `Native ${action.easingType??'unknown'} easing was captured but is not supported locally.`;
 const parsed=AnimationSchema.safeParse(animation);return parsed.success?parsed.data:'The local document schema cannot retain this native motion configuration.';
}

/** A reviewable supplement only: never replaces geometry or clears unknown cues. */
export function planNativeDeckMotion(deck:Deck,capture:NativeDeckMotionCapture,options:{linkedFileKey:string;archiveSourceConfirmed:boolean}):NativeMotionImportPlan {
 const plan:NativeMotionImportPlan={baseRevision:deck.revision,operations:[],issues:[],source:'figma-native-deck',liveSync:false};
 let linked:string|undefined;try{const url=new URL(deck.provenance?.url??'');if(['figma.com','www.figma.com'].includes(url.hostname))linked=url.pathname.match(/^\/(?:slides|deck|design)\/([\w-]+)/)?.[1];}catch{}
 if(!options.archiveSourceConfirmed||deck.provenance?.provider!=='Figma'||!linked||linked!==options.linkedFileKey){plan.issues.push({message:'Confirm this saved native .deck belongs to the connected Figma file before applying its motion.'});return plan;}
 for(const native of capture.slides){
  const matches=deck.slides.filter(slide=>slide.source?.provider==='Figma'&&slide.source.nodeId===native.id);if(matches.length!==1){plan.issues.push({slideId:native.id,message:'The native slide is missing or ambiguous in this linked document.'});continue;}
  const slide=matches[0],issues:NativeMotionImportPlan['issues']=capture.issues.filter(issue=>!issue.slideId||issue.slideId===native.id),operations:Operation[]=[],targets=new Set<string>();
  for(const cue of native.cues){
   if(cue.trigger!=='ON_CLICK'||cue.clickOrder===undefined||(cue.stateManagementVersion!==undefined&&cue.stateManagementVersion!==1)||cue.eventFields.some(field=>field!=='interactionType')||cue.nativeFields.some(field=>!['id','event','actions','isDeleted','stateManagementVersion'].includes(field))||cue.actions.length!==1){issues.push({slideId:native.id,message:'This native trigger or grouped sequence needs review; the existing local sequence is preserved.'});continue;}
   const action=cue.actions[0],targetId=action.targetId,elements=slide.elements.filter(element=>element.sourceId===targetId);
   if(!targetId||!action.withinSlide||elements.length!==1||elements[0].locked||targets.has(targetId)){issues.push({slideId:native.id,targetId,message:'The native animation target is missing, locked, duplicated, or outside its source slide.'});continue;}
   targets.add(targetId);const translated=nativeAnimation(action,cue.clickOrder-1);
   if(typeof translated==='string'){issues.push({slideId:native.id,targetId,message:translated});continue;}
   if(JSON.stringify(elements[0].animation)!==JSON.stringify(translated))operations.push({op:'update_element',slideId:slide.id,elementId:elements[0].id,patch:{animation:translated}});
  }
  if(slide.elements.some(element=>element.animation&&element.animation.effect!=='none'&&!element.hidden&&!targets.has(element.sourceId??'')))issues.push({slideId:native.id,message:'Other local object cues would alter this native sequence. Review the complete slide before applying motion.'});
  // Do not apply a partial click sequence when even one native cue is unknown.
  if(issues.length)plan.issues.push(...issues);else plan.operations.push(...operations);
 }
 for(const issue of capture.issues)if(!plan.issues.includes(issue))plan.issues.push(issue);
 return plan;
}
