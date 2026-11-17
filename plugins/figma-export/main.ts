import {BRAND_NAME} from '../../src/brand-name.js';
import {captureFigma,collectSlides,serializeForDeck} from './capture';
import {applyDeckToFigma} from './native';
import {validateDeck,type Deck} from '../../src/core/model';
import {figmaSlideRange} from '../../src/core/figma-slide-range';
import {stableValue} from '../../src/core/figma-sync';
declare const figma: any;
declare const __html__: string;
const renderCache=new Map<string,any>();
let running=false,previous: Deck|undefined,linked: any[]|undefined,linkedScope:string[]|undefined,queued:any,activeRequest=0;
const watched=new Set<string>();let watching=false;
const signatureFor=(slides:any[])=>stableValue({captureVersion:3,title:figma.root.name,slides:slides.map(serializeForDeck)});
function watchSlides(){
  watched.clear();if(!linked)return;
  const visit=(n:any)=>{watched.add(n.id);for(const child of n.children??[])visit(child);};
  for(const slide of currentSlides()){visit(slide);for(let p=slide.parent;p&&p.type!=='PAGE';p=p.parent)watched.add(p.id);}
}
try{figma.currentPage.on('nodechange',(event:any)=>{
  if(!linked)return;
  if(event.nodeChanges.some((change:any)=>{let n=change.node;while(n){if(watched.has(n.id))return true;if(n.removed)return false;n=n.parent;}return false;}))figma.ui.postMessage({type:'native-change',requestId:activeRequest});
});watching=true;}catch{/* Older Figma hosts retain the periodic snapshot fallback. */}
function currentSlides(){
  const all=collectSlides(figma,false);if(!linked)return all;
  const ids=new Set(linked.filter(n=>!n.removed).map(n=>n.id));
  return all.filter(n=>ids.has(n.id)||previous&&n.getPluginData('deck-studio-document')===previous.id);
}
let uiHeight=213;
figma.showUI(__html__,{width:360,height:uiHeight,title:BRAND_NAME,themeColors:true});
async function handleMessage(message:any){
  // Layout messages must remain responsive while a native capture is running.
  if(message.type==='resize'){
    if(typeof message.height!=='number'||!Number.isFinite(message.height))return;
    const height=Math.max(120,Math.min(640,Math.ceil(message.height)));
    if(height!==uiHeight){uiHeight=height;figma.ui.resize(360,height);}return;
  }
  if(message.type==='close'){figma.closePlugin();return;}
  if(message.type==='connect'||message.type==='disconnect')activeRequest=message.requestId??0;
  if(message.type==='disconnect'){previous=undefined;linked=undefined;linkedScope=undefined;queued=undefined;watched.clear();return;}
  if(running){if(message.type==='connect')queued=message;return;}running=true;
  const requestId=message.requestId??0,respond=(m:any)=>figma.ui.postMessage({...m,requestId});let applySignature:string|undefined,nativeApplied=false;
  try{
    const scope=()=>{const all=collectSlides(figma,false),range=figmaSlideRange(message.range??'',all.length);return range?range.map(index=>all[index]):collectSlides(figma);};
    if(message.type==='export'){const bundle=await captureFigma(figma,scope(),true,renderCache);respond({type:'download',filename:`${figma.root.name}.deck.json`,json:JSON.stringify(bundle)});}
    if(message.type==='connect'){previous=undefined;linkedScope=undefined;linked=scope();watchSlides();respond({type:'connect-ready',fileKey:figma.fileKey,count:linked.length,watching});}
    if(message.type==='snapshot'){
      if(message.scope){if(message.scope.fileKey!==figma.fileKey)throw new Error('Open the original Figma file before reconnecting.');linkedScope=message.scope.slideIds;const wanted=new Set(linkedScope);linked=collectSlides(figma,false).filter(n=>wanted.has(n.id));}
      if(message.deck?.provenance?.provider==='Figma'&&message.deck.provenance.url?.split('/')[4]===figma.fileKey){const targets=new Set(message.deck.slides.map((s:any)=>s.source?.nodeId));const source=collectSlides(figma,false).filter(n=>targets.has(n.id)||n.getPluginData('deck-studio-document')===message.deck.id);if(source.length)linked=source;}
      const slides=currentSlides(),signature=signatureFor(slides);
      watchSlides();
      if(!slides.length)throw new Error('The linked Figma slides no longer exist. Both documents are preserved.');
      if(message.signature!==signature){const bundle=await captureFigma(figma,slides,true,renderCache);respond({type:'snapshot',signature,bundle:{...bundle,...(linkedScope?{scopeIds:linkedScope}:{})}});}
      else respond({type:'unchanged'});
    }
    if(message.type==='apply'){
      const deck=validateDeck(message.deck),slides=currentSlides(),signature=signatureFor(slides);
      if(message.signature&&message.signature!==signature){respond({type:'changed-before-apply'});return;}
      const nativeBase=message.baseDeck;applySignature=signature;
      const result=await applyDeckToFigma(figma,previous||nativeBase?deck:{...deck,provenance:undefined},nativeBase??previous,message.assets,()=>requestId===activeRequest&&signature===signatureFor(currentSlides()));
      nativeApplied=true;previous=deck;linked=collectSlides(figma,false).filter(n=>n.getPluginData('deck-studio-document')===deck.id);
      watchSlides();
      const bundle=await captureFigma(figma,linked,true,renderCache);respond({type:'applied',ack:message.seq,bundle:{...bundle,...(linkedScope?{scopeIds:linkedScope}:{})},signature:signatureFor(linked),warnings:result.warnings});
    }
  }catch(error){
    let reconnect=nativeApplied||(error as {reconnect?:boolean})?.reconnect===true;
    // Even a completed Undo must restore the captured native state before Retry.
    if(!reconnect&&(error as {nativeRollback?:boolean})?.nativeRollback===true&&applySignature!==undefined)try{reconnect=applySignature!==signatureFor(currentSlides());}catch{reconnect=true;}
    if(!reconnect&&(error as Error).message.startsWith('Figma changed during preparation'))respond({type:'changed-before-apply'});else respond({type:'error',text:(error as Error).message,...(reconnect?{reconnect:true}:{})});
  }finally{running=false;if(queued){const next=queued;queued=undefined;await handleMessage(next);}}
}
figma.ui.onmessage=handleMessage;
