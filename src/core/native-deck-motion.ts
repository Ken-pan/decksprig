/** Offline native .deck snapshots only. This is not the live Plugin Motion API. */
export interface NativeDeckSource {size:number;read:(offset:number,length:number)=>Promise<Uint8Array>}
export interface NativeDeckCodecs {deflateRaw:(bytes:Uint8Array,limit:number)=>Promise<Uint8Array>;zstd:(bytes:Uint8Array,limit:number)=>Promise<Uint8Array>}
export interface NativeDeckMotionAction {targetId?:string;targetType?:string;withinSlide:boolean;connectionType?:string;phase?:string;nativeType?:string;durationSeconds?:number;durationMs?:number;easingType?:string;easingCubic?:number[];nativeFields:string[]}
export interface NativeDeckMotionCue {id?:string;index:number;trigger?:string;clickOrder?:number;stateManagementVersion?:number;actions:NativeDeckMotionAction[];nativeFields:string[];eventFields:string[]}
export interface NativeDeckMotionCapture {kind:'figma-native-deck-motion';formatVersion:101|106;archiveBytes:number;canvasCrc32:number;schemaDefinitions:number;decodedNodeCount:number;archiveIdentityVerified:false;slides:{id:string;cues:NativeDeckMotionCue[]}[];issues:{slideId?:string;message:string}[]}
export const NATIVE_DECK_LIMITS={archive:1024*1024*1024,directory:2*1024*1024,entries:20000,canvas:2*1024*1024,schema:2*1024*1024,body:16*1024*1024,definitions:2048,fields:40000,array:1000000,values:5000000,depth:128,nodes:20000,ancestry:1000000} as const;
function invalid(detail:string):never {throw new Error(`Cannot read native .deck motion safely: ${detail}. Existing motion is unchanged.`);}
const decoder=new TextDecoder('utf-8',{fatal:true});
const u16=(b:Uint8Array,p:number)=>new DataView(b.buffer,b.byteOffset,b.byteLength).getUint16(p,true);
const u32=(b:Uint8Array,p:number)=>new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(p,true);
function crc32(bytes:Uint8Array){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1;}return (crc^0xffffffff)>>>0;}
async function read(source:NativeDeckSource,offset:number,length:number){if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset+length>source.size)invalid('invalid ZIP range');const bytes=await source.read(offset,length);if(bytes.length!==length)invalid('incomplete ZIP read');return bytes;}
async function canvasBytes(source:NativeDeckSource,codecs:Pick<NativeDeckCodecs,'deflateRaw'>){
 if(!Number.isSafeInteger(source.size)||source.size<22||source.size>NATIVE_DECK_LIMITS.archive)invalid('unsupported archive size');
 const tailOffset=Math.max(0,source.size-65557),tail=await read(source,tailOffset,source.size-tailOffset);let end=-1;
 for(let p=tail.length-22;p>=0;p--)if(u32(tail,p)===0x06054b50&&p+22+u16(tail,p+20)===tail.length){end=p;break;}
 if(end<0||u16(tail,end+4)||u16(tail,end+6)||u16(tail,end+8)!==u16(tail,end+10))invalid('unsupported ZIP directory');
 const count=u16(tail,end+10),size=u32(tail,end+12),offset=u32(tail,end+16);
 if(count===65535||count>NATIVE_DECK_LIMITS.entries||size>NATIVE_DECK_LIMITS.directory||offset+size>tailOffset+end)invalid('ZIP directory exceeds limits');
 const directory=await read(source,offset,size);let p=0,entry:{flags:number;method:number;crc:number;compressed:number;size:number;offset:number}|undefined;
 for(let i=0;i<count;i++){
  if(p+46>directory.length||u32(directory,p)!==0x02014b50)invalid('invalid ZIP entry');
  const nameLength=u16(directory,p+28),extra=u16(directory,p+30),comment=u16(directory,p+32),end=p+46+nameLength+extra+comment;
  if(end>directory.length||nameLength>4096)invalid('invalid ZIP entry length');
  const name=decoder.decode(directory.subarray(p+46,p+46+nameLength));
  if(name==='canvas.fig'){if(entry)invalid('duplicate canvas.fig');entry={flags:u16(directory,p+8),method:u16(directory,p+10),crc:u32(directory,p+16),compressed:u32(directory,p+20),size:u32(directory,p+24),offset:u32(directory,p+42)};}
  p=end;
 }
 if(p!==directory.length||!entry)invalid('missing or ambiguous canvas.fig');
 if(entry.flags&1||![0,8].includes(entry.method)||entry.compressed>NATIVE_DECK_LIMITS.canvas||entry.size>NATIVE_DECK_LIMITS.canvas)invalid('unsupported canvas.fig encoding or size');
 const local=await read(source,entry.offset,30);if(u32(local,0)!==0x04034b50||u16(local,8)!==entry.method||u16(local,6)!==entry.flags)invalid('inconsistent canvas.fig header');
 const nameLength=u16(local,26),extra=u16(local,28);if(nameLength>4096||decoder.decode(await read(source,entry.offset+30,nameLength))!=='canvas.fig')invalid('inconsistent canvas.fig name');
 const dataOffset=entry.offset+30+nameLength+extra;if(dataOffset+entry.compressed>offset)invalid('canvas.fig overlaps directory');
 const compressed=await read(source,dataOffset,entry.compressed),bytes=entry.method===0?compressed:await codecs.deflateRaw(compressed,NATIVE_DECK_LIMITS.canvas);
 if(bytes.length!==entry.size||crc32(bytes)!==entry.crc)invalid('canvas.fig integrity check failed');return {bytes,crc:entry.crc};
}
type Field={name:string;type:string|null;array:boolean;id:number};
type Definition={name:string;kind:number;fields:Field[];byId:Map<number,Field>};
class Reader {
 index=0;
 constructor(readonly bytes:Uint8Array){}
 byte(){if(this.index>=this.bytes.length)invalid('truncated Kiwi data');return this.bytes[this.index++];}
 uint(){let value=0;for(let shift=0;shift<35;shift+=7){const b=this.byte();if(shift===28&&b>15)invalid('oversized Kiwi integer');value+=(b&127)*2**shift;if(!(b&128))return value>>>0;}return invalid('oversized Kiwi integer');}
 sint(){const value=this.uint();return value&1?~(value>>>1):value>>>1;}
 string(keep=true,limit=4000000){let end=this.index;while(end<this.bytes.length&&end-this.index<=limit&&this.bytes[end])end++;if(end===this.bytes.length||end-this.index>limit)invalid('unterminated Kiwi string');const value=keep?decoder.decode(this.bytes.subarray(this.index,end)):undefined;this.index=end+1;return value;}
}
function schemaFrom(bytes:Uint8Array){
 const r=new Reader(bytes),count=r.uint(),definitions:Definition[]=[];let total=0;
 if(count>NATIVE_DECK_LIMITS.definitions)invalid('too many Kiwi definitions');
 for(let i=0;i<count;i++){
  const name=r.string(true,4096)!,kind=r.byte(),length=r.uint();if(kind>2||length>2048||(total+=length)>NATIVE_DECK_LIMITS.fields)invalid('Kiwi schema exceeds limits');
  const fields:Field[]=[];for(let j=0;j<length;j++)fields.push({name:r.string(true,4096)!,type:r.sint() as unknown as string,array:Boolean(r.byte()&1),id:r.uint()});
  definitions.push({name,kind,fields,byId:new Map()});
 }
 if(r.index!==bytes.length)invalid('unconsumed Kiwi schema');
 const primitives=['bool','byte','int','uint','float','string','int64','uint64'],map=new Map<string,Definition>();
 for(const d of definitions){if(map.has(d.name))invalid('duplicate Kiwi definition');map.set(d.name,d);const names=new Set<string>();for(const field of d.fields){const index=field.type as unknown as number,target=d.kind===0?null:index<0?primitives[~index]:definitions[index]?.name;if(target===undefined||d.byId.has(field.id)||names.has(field.name)||(d.kind===2&&field.id===0))invalid('invalid Kiwi field');field.type=target;d.byId.set(field.id,field);names.add(field.name);}}
 const requireField=(type:string,name:string,target:string,array:boolean,id:number)=>{const f=map.get(type)?.fields.find(f=>f.name===name);if(!f||f.type!==target||f.array!==array||f.id!==id)invalid(`unsupported native ${type}.${name} contract`);};
 for(const [type,kind]of [['Message',2],['NodeChange',2],['GUID',1],['ParentIndex',1],['PrototypeInteraction',2],['PrototypeEvent',2],['PrototypeAction',2],['NodeType',0],['InteractionType',0],['ConnectionType',0],['EasingType',0],['AnimationType',0],['AnimationPhase',0]] as const)if(map.get(type)?.kind!==kind)invalid(`unsupported native ${type} kind`);
 requireField('Message','nodeChanges','NodeChange',true,4);requireField('NodeChange','guid','GUID',false,1);requireField('NodeChange','objectAnimations','PrototypeInteraction',true,426);
 requireField('NodeChange','parentIndex','ParentIndex',false,3);requireField('NodeChange','type','NodeType',false,4);
 requireField('GUID','sessionID','uint',false,1);requireField('GUID','localID','uint',false,2);requireField('ParentIndex','guid','GUID',false,1);
 requireField('PrototypeInteraction','id','GUID',false,1);requireField('PrototypeInteraction','event','PrototypeEvent',false,2);requireField('PrototypeInteraction','actions','PrototypeAction',true,3);requireField('PrototypeInteraction','isDeleted','bool',false,4);
 requireField('PrototypeEvent','interactionType','InteractionType',false,1);
 for(const [name,target,array,id]of [['transitionNodeID','GUID',false,1],['transitionDuration','float',false,3],['easingType','EasingType',false,4],['connectionType','ConnectionType',false,7],['easingFunction','float',true,12],['animationType','AnimationType',false,30],['animationPhase','AnimationPhase',false,32]] as const)requireField('PrototypeAction',name,target,array,id);
 return map;
}
type RecordValue=Record<string,any>;
const guid=(value:any):string|undefined=>value&&Number.isInteger(value.sessionID)&&Number.isInteger(value.localID)&&value.sessionID>=0&&value.localID>=0?`${value.sessionID}:${value.localID}`:undefined;
class MessageReader extends Reader {
 values=0;nodes=new Map<string,RecordValue>();
 constructor(bytes:Uint8Array,readonly definitions:Map<string,Definition>){super(bytes);}
 value(type:string,keep:boolean,depth:number,node=false):any {
  if(++this.values>NATIVE_DECK_LIMITS.values||depth>NATIVE_DECK_LIMITS.depth)invalid('Kiwi decoding work limit');let result:any;
  if(type==='bool')result=Boolean(this.byte());else if(type==='byte')result=this.byte();else if(type==='uint')result=this.uint();else if(type==='int')result=this.sint();
  else if(type==='string')return this.string(keep);
  else if(type==='float'){const first=this.byte();if(!first)result=0;else{if(this.index+3>this.bytes.length)invalid('truncated Kiwi float');const bits=(first|this.byte()<<8|this.byte()<<16|this.byte()<<24)>>>0,rotated=((bits<<23)|(bits>>>9))>>>0,b=new ArrayBuffer(4);new DataView(b).setUint32(0,rotated,true);result=new DataView(b).getFloat32(0,true);}}
  else if(type==='int64'||type==='uint64'){let n=0n,done=false;for(let shift=0n;shift<70n;shift+=7n){const b=this.byte();if(shift===63n&&b>1)invalid('oversized Kiwi64 integer');n|=BigInt(b&127)<<shift;if(!(b&128)){done=true;break;}}if(!done)invalid('oversized Kiwi64 integer');result=type==='int64'?(n&1n?~(n>>1n):n>>1n):n;if(keep)result=String(result);}
  else{const d=this.definitions.get(type);if(!d)invalid('unknown Kiwi type');if(d.kind===0){const raw=this.uint();result=d.fields.find(f=>f.id===raw)?.name??`UNKNOWN_ENUM_${raw}`;}else return this.message(d,keep,depth+1,node);}
  return keep?result:undefined;
 }
 field(field:Field,keep:boolean,depth:number,node=false):any {
  if(!field.array)return this.value(field.type!,keep,depth,node);const count=this.uint();
  if(field.type==='byte'){if(this.index+count>this.bytes.length)invalid('truncated Kiwi bytes');this.index+=count;return keep?{byteLength:count}:undefined;}
  if(count>NATIVE_DECK_LIMITS.array)invalid('Kiwi array exceeds limits');const values:any[]|undefined=keep?[]:undefined;for(let i=0;i<count;i++){const value=this.value(field.type!,keep,depth,node);values?.push(value);}return values;
 }
 message(d:Definition,keep:boolean,depth:number,node:boolean):any {
  const result:RecordValue=Object.create(null);let index=0;
  while(true){let field:Field;if(d.kind===1){if(index===d.fields.length)break;field=d.fields[index++];}else{const id=this.uint();if(!id)break;const known=d.byId.get(id);if(!known)invalid('field absent from embedded Kiwi schema');field=known;}
   const captureRoot=d.name==='Message'&&depth===1&&field.name==='nodeChanges';
   const wanted=node?['guid','parentIndex','type','objectAnimations'].includes(field.name):keep;
   const value=this.field(field,wanted,depth,captureRoot);if(wanted)result[field.name]=value;
  }
  if(node){const id=guid(result.guid);if(id){if(this.nodes.has(id))invalid('duplicate native node identity');if(this.nodes.size>=NATIVE_DECK_LIMITS.nodes)invalid('too many native nodes');this.nodes.set(id,result);}}
  return keep?result:undefined;
 }
}
function canvasChunks(bytes:Uint8Array){
 if(bytes.length>NATIVE_DECK_LIMITS.canvas)invalid('canvas.fig exceeds limits');if(bytes.length<20||decoder.decode(bytes.subarray(0,8))!=='fig-deck'||![101,106].includes(u32(bytes,8)))invalid('only fig-deck version101 or version106 is supported');
 let offset=12;const chunks:Uint8Array[]=[];while(offset+4<=bytes.length){const size=u32(bytes,offset);offset+=4;if(size>bytes.length-offset)invalid('invalid native chunk length');chunks.push(bytes.subarray(offset,offset+size));offset+=size;}
 if(offset!==bytes.length||chunks.length!==2)invalid('unsupported native chunk layout');
 return {chunks,version:u32(bytes,8) as 101|106};
}
/** Browser-side random ZIP reads return only the bounded, CRC-verified canvas member. */
export async function readNativeDeckCanvas(source:NativeDeckSource,deflateRaw:NativeDeckCodecs['deflateRaw']):Promise<Uint8Array>{const {bytes}=await canvasBytes(source,{deflateRaw});canvasChunks(bytes);return bytes;}

/** The canvas-only transport is parsed again server-side; archive identity remains unverified. */
export async function decodeNativeDeckMotionCanvas(bytes:Uint8Array,archiveBytes:number,codecs:NativeDeckCodecs):Promise<NativeDeckMotionCapture>{
 if(!Number.isSafeInteger(archiveBytes)||archiveBytes<22||archiveBytes>NATIVE_DECK_LIMITS.archive)invalid('unsupported archive size');const {chunks,version}=canvasChunks(bytes);
 const schema=await codecs.deflateRaw(chunks[0],NATIVE_DECK_LIMITS.schema);if(schema.length>NATIVE_DECK_LIMITS.schema)invalid('native schema exceeds limits');const definitions=schemaFrom(schema);
 if(chunks[1].length<4||u32(chunks[1],0)!==0xfd2fb528)invalid('unsupported native body compression');const body=await codecs.zstd(chunks[1],NATIVE_DECK_LIMITS.body);if(body.length>NATIVE_DECK_LIMITS.body)invalid('native body exceeds limits');
 const reader=new MessageReader(body,definitions);reader.value('Message',false,0);if(reader.index!==body.length)invalid('unconsumed native body');
 const capture:NativeDeckMotionCapture={kind:'figma-native-deck-motion',formatVersion:version,archiveBytes,canvasCrc32:crc32(bytes),schemaDefinitions:definitions.size,decodedNodeCount:reader.nodes.size,archiveIdentityVerified:false,slides:[],issues:[]};
 let ancestrySteps=0;
 for(const [slideId,node]of reader.nodes){if(node.type!=='SLIDE'||!Array.isArray(node.objectAnimations))continue;let clicks=0;const cues:NativeDeckMotionCue[]=[],ownership=new Map<string,boolean>();
  for(const [index,interaction]of node.objectAnimations.entries()){
   if(interaction.isDeleted===true)continue;const trigger=interaction.event?.interactionType,actions:NativeDeckMotionAction[]=[];
   if(!Array.isArray(interaction.actions)){capture.issues.push({slideId,message:'Native object animation actions are unreadable.'});continue;}
   for(const action of interaction.actions){const targetId=guid(action.transitionNodeID),target=targetId?reader.nodes.get(targetId):undefined;let ancestor=target,withinSlide=targetId?ownership.get(targetId)??false:false;const visited=new Set<string>();
    if(targetId&&!ownership.has(targetId)){while(ancestor){if(++ancestrySteps>NATIVE_DECK_LIMITS.ancestry)invalid('native ancestry work limit');const id=guid(ancestor.guid);if(id===slideId){withinSlide=true;break;}if(!id||visited.has(id))break;visited.add(id);const parent=guid(ancestor.parentIndex?.guid);ancestor=parent?reader.nodes.get(parent):undefined;}ownership.set(targetId,withinSlide);}
    const seconds=action.transitionDuration,durationSeconds=typeof seconds==='number'&&Number.isFinite(seconds)?seconds:undefined;
    actions.push({targetId,targetType:target?.type,withinSlide,connectionType:action.connectionType,phase:action.animationPhase,nativeType:action.animationType,durationSeconds,durationMs:durationSeconds===undefined?undefined:Math.round(durationSeconds*1000000)/1000,easingType:action.easingType,easingCubic:Array.isArray(action.easingFunction)&&action.easingFunction.length===4&&action.easingFunction.every((n:any)=>typeof n==='number'&&Number.isFinite(n))?[...action.easingFunction]:undefined,nativeFields:Object.keys(action).sort()});
   }
   cues.push({id:guid(interaction.id),index,trigger,clickOrder:trigger==='ON_CLICK'?++clicks:undefined,stateManagementVersion:interaction.stateManagementVersion,actions,nativeFields:Object.keys(interaction).sort(),eventFields:Object.keys(interaction.event??{}).sort()});
  }
  capture.slides.push({id:slideId,cues});
 }
 return capture;
}

/** Extracts native cue metadata without loading images, names, text, or geometry. */
export async function extractNativeDeckMotion(source:NativeDeckSource,codecs:NativeDeckCodecs):Promise<NativeDeckMotionCapture>{return decodeNativeDeckMotionCanvas(await readNativeDeckCanvas(source,codecs.deflateRaw),source.size,codecs);}

export function nativeDeckBlobSource(blob:Pick<Blob,'size'|'slice'>):NativeDeckSource{return {size:blob.size,read:async(offset,length)=>new Uint8Array(await blob.slice(offset,offset+length).arrayBuffer())};}
