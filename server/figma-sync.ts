import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {importFigma} from '../src/importers/figma';
import {createSyncMedia,type SyncMedia} from '../src/core/figma-sync-media';
import {validateDeck} from '../src/core/model';

type Wire={codec:SyncMedia;known:Set<string>;receipts:Map<number,Set<string>>};
const wire=():Wire=>({codec:createSyncMedia(),known:new Set(),receipts:new Map()});
function incoming(w:Wire,packet:any){const data=w.codec.decode(packet);if(packet?.kind==='deck-studio-sync/1')for(const id of Object.keys(packet.media??{}))w.known.add(id);return data;}
function outgoing(w:Wire,data:unknown,seq?:number){const encoded=w.codec.encode(data,w.known);if(seq!==undefined){w.receipts.set(seq,encoded.used);while(w.receipts.size>10)w.receipts.delete(w.receipts.keys().next().value!);}return encoded.packet;}
function acknowledge(w:Wire,seq:number){for(const id of w.receipts.get(seq)??[])w.known.add(id);}
type Scope={fileKey:string;slideIds:string[]};
type Session={editorWire:Wire;pluginWire:Wire;id:string;code:string;editorToken:string;pluginToken?:string;fileKey?:string;expires:number;paired:boolean;scope?:Scope;pluginSeen?:number;pluginPaused?:boolean;reconnect?:boolean;retry:number;revision:number;waiters:Set<()=>void>;commandReceipt?:string;nativeReceipt?:string;command?:{seq:number;seen:number;deck:unknown;assets:unknown;baseDeck?:unknown};native?:{seq:number;ack:number;bundle:unknown;warnings:string[];applied:boolean};error?:string};
export const FIGMA_PLUGIN_TIMEOUT=30_000;
const sessions=new Map<string,Session>(),ttl=30*60_000;
const failure=(message: string,status=400)=>Object.assign(new Error(message),{status});
const secret=()=>randomBytes(24).toString('base64url');
const matches=(a: string,b: string)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const receipt=(input:unknown)=>createHash('sha256').update(JSON.stringify(input)).digest('hex');
function changed(s:Session){s.revision++;for(const wake of [...s.waiters])wake();}
function prune(){for(const [id,s]of sessions)if(s.expires<Date.now()){sessions.delete(id);changed(s);}}
async function waitForChange(s:Session,req:IncomingMessage,since:number,ms:number){
  if(s.revision!==since||ms<=0)return;
  await new Promise<void>(resolve=>{
    const finish=()=>{clearTimeout(timer);s.waiters.delete(finish);req.socket?.off('close',finish);req.off?.('aborted',finish);resolve();};
    const timer=setTimeout(finish,ms);s.waiters.add(finish);req.socket?.once('close',finish);req.once?.('aborted',finish);
    if(s.revision!==since||req.aborted||req.socket?.destroyed)finish();
  });
}
function authorize(req: IncomingMessage,id: string,role: 'editor'|'plugin'){
  prune();const s=sessions.get(id),token=req.headers.authorization?.replace(/^Bearer /,'')??'',expected=role==='editor'?s?.editorToken:s?.pluginToken;
  if(!s||!expected||!matches(token,expected))throw failure('This Figma connection expired. Connect again.',401);s.expires=Date.now()+ttl;if(role==='plugin'){const offline=Date.now()-(s.pluginSeen??0)>=FIGMA_PLUGIN_TIMEOUT;s.pluginSeen=Date.now();if(offline)changed(s);}return s;
}
export function figmaSyncCors(req: IncomingMessage,res: ServerResponse,port: number): boolean {
  const origin=req.headers.origin,local=[`http://127.0.0.1:${port}`,`http://localhost:${port}`];
  if(!origin||local.includes(origin))return true;
  if(!['null','https://www.figma.com','https://figma.com'].includes(origin))return false;
  res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  // The plugin iframe may be an opaque origin. Possession of an expiring,
  // single-use pairing code is required before it receives a scoped capability.
  if(req.headers['access-control-request-private-network']==='true')res.setHeader('Access-Control-Allow-Private-Network','true');
  return true;
}
export async function figmaSyncRoute(req: IncomingMessage,path: string,body:()=>Promise<any>) {
  prune();
  if(path==='/api/figma-sync/start'&&req.method==='POST'){
    if(sessions.size>=12)throw failure('Disconnect an unused Figma session first.',429);
    const editorWire=wire(),input=incoming(editorWire,await body());validateDeck(input.deck);
    let scope:Scope|undefined;
    if(input.scope){const {fileKey,slideIds}=input.scope;if(input.direction!=='figma'||typeof fileKey!=='string'||!/^[-\w]{1,120}$/.test(fileKey)||!Array.isArray(slideIds)||!slideIds.length||slideIds.length>100||slideIds.some(id=>typeof id!=='string'||!/^[-\w:]{1,120}$/.test(id))||new Set(slideIds).size!==slideIds.length)throw failure('The Figma reconnect scope is invalid.');scope={fileKey,slideIds};}
    const s: Session={editorWire,pluginWire:wire(),id:randomUUID(),code:randomBytes(8).toString('hex'),editorToken:secret(),expires:Date.now()+ttl,paired:false,retry:0,revision:0,waiters:new Set(),scope};
    if(input.direction!=='figma')s.command={seq:1,seen:0,deck:input.deck,assets:input.assets??{}};
    sessions.set(s.id,s);return {id:s.id,code:s.code,token:s.editorToken,direction:input.direction==='figma'?'figma':'deck'};
  }
  if(path==='/api/figma-sync/pair'&&req.method==='POST'){
    const packet=await body(),input=createSyncMedia().decode(packet);if(typeof input.code!=='string'||typeof input.fileKey!=='string'||!input.fileKey)throw failure('Enter a connection code from Deck Studio.');
    const s=[...sessions.values()].find(v=>!v.paired&&matches(input.code.replace(/\s/g,''),v.code));
    if(!s)throw failure('This connection code is invalid or was already used.',401);
    if(s.scope&&s.scope.fileKey!==input.fileKey)throw failure('Open the original Figma file before reconnecting. This code is still valid.');
    incoming(s.pluginWire,packet);s.paired=true;s.code='';s.pluginToken=secret();s.fileKey=input.fileKey;s.pluginSeen=Date.now();changed(s);return outgoing(s.pluginWire,{id:s.id,token:s.pluginToken,command:s.command,scope:s.scope,revision:s.revision},s.command?.seq??0);
  }
  const route=path.match(/^\/api\/figma-sync\/([\da-f-]{36})\/(editor|plugin)$/);if(!route)throw failure('Figma connection route not found.',404);
  const s=authorize(req,route[1],route[2]as'editor'|'plugin');
  if(req.method==='DELETE'){sessions.delete(s.id);changed(s);return {disconnected:true};}
  const query=new URL(req.url??'/', 'http://localhost').searchParams;
  if(route[2]==='plugin'&&query.get('heartbeat')==='1'){
    if(req.method==='POST'){const before=[s.pluginPaused,s.reconnect,s.error],input=incoming(s.pluginWire,await body());if((input.retry??0)===s.retry){s.pluginPaused=input.paused===true;s.reconnect=input.reconnect===true;if(input.error)s.error=String(input.error).slice(0,2000);}if(before.some((v,i)=>v!==[s.pluginPaused,s.reconnect,s.error][i]))changed(s);}
    else if(req.method!=='GET')throw failure('Unsupported Figma heartbeat action.',405);
    return {retry:s.retry,revision:s.revision};
  }
  if(req.method==='POST'){
    const input=incoming(route[2]==='editor'?s.editorWire:s.pluginWire,await body());
    if(route[2]==='editor'){
      if(input.retry===true){s.error=undefined;s.retry++;changed(s);return {received:true,revision:s.revision};}
      // Confirm an accepted write whose response was lost. A reused sequence
      // with different content must still fail before any state is changed.
      const stamp=receipt(input);if(input.seq===s.command?.seq&&stamp===s.commandReceipt)return {received:true,revision:s.revision};
      if(!Number.isSafeInteger(input.seq)||input.seq!==(s.command?.seq??0)+1||!Number.isSafeInteger(input.seen)||input.seen!==(s.native?.seq??0))throw failure('Figma has a newer version. Read it before sending changes.',409);
      validateDeck(input.deck);s.command={seq:input.seq,seen:input.seen,deck:input.deck,assets:input.assets??{},...(input.baseDeck?{baseDeck:validateDeck(input.baseDeck)}:s.native?.ack===0?{baseDeck:importFigma(s.native.bundle)}:{})};s.error=undefined;
      s.commandReceipt=stamp;
    }else{
      if(input.retry===true){s.error=undefined;s.retry++;s.pluginPaused=false;changed(s);return {received:true,retry:s.retry,revision:s.revision};}
      if(input.error){if((input.retry??0)===s.retry){s.error=String(input.error).slice(0,2000);s.pluginPaused=true;s.reconnect=input.reconnect===true;changed(s);}return {received:true,revision:s.revision};}
      const stamp=receipt(input);if(input.seq===s.native?.seq&&stamp===s.nativeReceipt)return {received:true,revision:s.revision};
      if(!Number.isSafeInteger(input.seq)||input.seq!==(s.native?.seq??0)+1||!Number.isSafeInteger(input.ack)||input.ack<0||input.ack>(s.command?.seq??0))throw failure('The Figma connection is out of sequence. Reconnect.',409);
      if(input.bundle?.kind!=='figma-rest'||!Array.isArray(input.bundle.slides)||input.bundle.slides.length<1)throw failure('No Figma slides were received.');
      s.native={seq:input.seq,ack:input.ack,bundle:input.bundle,applied:input.applied===true,warnings:Array.isArray(input.warnings)?input.warnings.map(String).slice(0,100):[]};s.error=undefined;s.pluginPaused=s.reconnect=false;
      s.nativeReceipt=stamp;
    }
    changed(s);return {received:true,revision:s.revision};
  }
  if(req.method!=='GET')throw failure('Unsupported Figma connection action.',405);
  const after=Number(new URL(req.url??'/', 'http://localhost').searchParams.get('after')??-1),w=route[2]==='editor'?s.editorWire:s.pluginWire;
  acknowledge(w,after);
  const since=Number(query.get('since')),wait=Number(query.get('wait')??0);
  if((query.has('since')&&(!Number.isSafeInteger(since)||since<0))||!Number.isFinite(wait)||wait<0)throw failure('The Figma wait cursor is invalid.');
  const unread=(route[2]==='editor'?s.native?.seq:s.command?.seq)??-1;
  if(query.has('since')&&unread<=after){const untilOffline=route[2]==='editor'&&s.paired?(s.pluginSeen??0)+FIGMA_PLUGIN_TIMEOUT-Date.now():0;await waitForChange(s,req,since,Math.min(20_000,wait,untilOffline>0?untilOffline:Infinity));}
  if(sessions.get(s.id)!==s)throw failure('This Figma connection expired. Connect again.',401);
  if(route[2]==='editor'){const native=s.native&&s.native.seq>after?s.native:s.native?{seq:s.native.seq,ack:s.native.ack,applied:s.native.applied,warnings:s.native.warnings}:undefined;return outgoing(w,{revision:s.revision,paired:s.paired,pluginOnline:s.paired&&Date.now()-(s.pluginSeen??0)<FIGMA_PLUGIN_TIMEOUT,pluginPaused:s.pluginPaused,reconnect:s.reconnect,fileKey:s.fileKey,native,error:s.error,commandSeq:s.command?.seq??0},s.native?.seq??0);}
  return outgoing(w,{revision:s.revision,command:s.command&&s.command.seq>after?s.command:undefined,error:s.error},s.command?.seq??0);
}
