/** Session-only media references. No transport reference is stored in a document. */
export function createSyncMedia(){
  const media=new Map<string,string>(),ids=new Map<string,string>(),sent=new Set<string>();let next=0,bytes=0;
  const prefix=Math.random().toString(36).slice(2)+'-';
  const add=(id:string,value:string)=>{const prior=media.get(id);if(prior!==undefined){if(prior!==value)throw new Error('The sync media reference changed. Reconnect.');return;}if((bytes+=value.length)>256_000_000)throw new Error('This connection contains too much media. Connect fewer slides.');media.set(id,value);ids.set(value,id);};
  const encode=(value:unknown,known:ReadonlySet<string>=sent)=>{
    const added:Record<string,string>={},used=new Set<string>();
    const visit=(v:any):any=>{
      if(typeof v==='string'&&v.length>128&&/^data:(?:image|font)\//.test(v)){
        let id=ids.get(v);if(!id){id=prefix+(next++).toString(36);add(id,v);}used.add(id);if(!known.has(id))added[id]=v;return {$deckSyncMedia:id};
      }
      if(Array.isArray(v))return v.map(visit);
      if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,visit(x)]));return v;
    };
    return {packet:{kind:'deck-studio-sync/1',data:visit(value),media:added},used};
  };
  const decode=(packet:any):any=>{
    if(packet?.kind!=='deck-studio-sync/1')return packet;
    if(!packet.media||typeof packet.media!=='object'||Array.isArray(packet.media))throw new Error('The sync media packet is invalid.');
    for(const [id,value]of Object.entries(packet.media)){if(typeof value!=='string'||!/^data:(?:image|font)\//.test(value)||id.length>100)throw new Error('The sync media packet is invalid.');add(id,value);}
    const visit=(v:any):any=>{
      if(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===1&&typeof v.$deckSyncMedia==='string'){const value=media.get(v.$deckSyncMedia);if(value===undefined)throw new Error('A sync image is unavailable. Reconnect.');return value;}
      if(Array.isArray(v))return v.map(visit);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,visit(x)]));return v;
    };return visit(packet.data);
  };
  const accept=(packet:any)=>{if(packet?.kind==='deck-studio-sync/1')for(const id of Object.keys(packet.media??{}))sent.add(id);};
  return {encode,decode,accept};
}
export type SyncMedia=ReturnType<typeof createSyncMedia>;
