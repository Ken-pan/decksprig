/** Bounded SFNT metadata handling. Outline/layout tables remain opaque byte arrays. */
export const MAX_FONT_BYTES=64_000_000;
const invalid=()=>new Error('This font file is invalid or unsupported. Import another font file.');
const view=(bytes:Uint8Array)=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
export const fontTag=(bytes:Uint8Array,offset=0)=>String.fromCharCode(...bytes.subarray(offset,offset+4));
export type Sfnt={signature:number;tables:Map<string,Uint8Array>};
export function readSfnt(bytes:Uint8Array):Sfnt{
  if(bytes.length<12||bytes.length>MAX_FONT_BYTES)throw invalid();
  const data=view(bytes),signature=data.getUint32(0),count=data.getUint16(4);
  if(![0x00010000,0x4f54544f,0x74727565].includes(signature)||!count||count>1024||12+count*16>bytes.length)throw invalid();
  const tables=new Map<string,Uint8Array>();
  for(let i=0;i<count;i++){
    const p=12+i*16,tag=fontTag(bytes,p),offset=data.getUint32(p+8),length=data.getUint32(p+12);
    if(tables.has(tag)||(length>0&&offset<12+count*16)||offset+length>bytes.length)throw invalid();
    tables.set(tag,new Uint8Array(bytes.buffer,bytes.byteOffset+offset,length));
  }
  for(const [tag,size]of [['head',54],['OS/2',78],['name',6],['maxp',6],['cmap',4]]as const)if((tables.get(tag)?.length??0)<size)throw invalid();
  return {signature,tables};
}
function checksum(bytes:Uint8Array){
  let sum=0;for(let i=0;i<bytes.length;i+=4)sum=(sum+((bytes[i]*0x1000000+(bytes[i+1]??0)*0x10000+(bytes[i+2]??0)*256+(bytes[i+3]??0))>>>0))>>>0;return sum;
}
export function writeSfnt(font:Sfnt):Uint8Array<ArrayBuffer>{
  const entries=[...font.tables].filter(([tag])=>tag!=='DSIG').sort(([a],[b])=>a<b?-1:a>b?1:0);
  const size=12+entries.length*16+entries.reduce((sum,[,b])=>sum+Math.ceil(b.length/4)*4,0);
  if(size>MAX_FONT_BYTES)throw invalid();const bytes=new Uint8Array(size),data=view(bytes),power=2**Math.floor(Math.log2(entries.length));
  data.setUint32(0,font.signature);data.setUint16(4,entries.length);data.setUint16(6,power*16);data.setUint16(8,Math.log2(power));data.setUint16(10,entries.length*16-power*16);
  let offset=12+entries.length*16,head=0;
  for(const [i,[tag,source]]of entries.entries()){
    const block=tag==='head'?source.slice():source;if(tag==='head')view(block).setUint32(8,0);
    const p=12+i*16;for(let j=0;j<4;j++)bytes[p+j]=tag.charCodeAt(j);
    data.setUint32(p+4,checksum(block));data.setUint32(p+8,offset);data.setUint32(p+12,block.length);bytes.set(block,offset);
    if(tag==='head')head=offset;offset+=Math.ceil(block.length/4)*4;
  }
  data.setUint32(head+8,(0xb1b0afba-checksum(bytes))>>>0);return bytes;
}
function utf16(value:string){const bytes=new Uint8Array(value.length*2),v=view(bytes);for(let i=0;i<value.length;i++)v.setUint16(i*2,value.charCodeAt(i));return bytes;}
function decodeName(bytes:Uint8Array,platform:number,encoding:number){
  if(platform===0||platform===3){if(bytes.length%2)return '';const v=view(bytes);let text='';for(let i=0;i<bytes.length;i+=2)text+=String.fromCharCode(v.getUint16(i));return text;}
  return platform===1&&encoding===0?new TextDecoder('macintosh').decode(bytes):'';
}
type Name={platform:number;encoding:number;language:number;id:number;bytes:Uint8Array};
function names(table:Uint8Array){
  const v=view(table),format=v.getUint16(0),count=v.getUint16(2),storage=v.getUint16(4);if(format>1||6+count*12>storage||storage>table.length)throw invalid();
  const records:Name[]=[],languages:Uint8Array[]=[];
  const string=(length:number,offset:number)=>{if(storage+offset+length>table.length)throw invalid();return table.subarray(storage+offset,storage+offset+length);};
  for(let i=0;i<count;i++){const p=6+i*12;records.push({platform:v.getUint16(p),encoding:v.getUint16(p+2),language:v.getUint16(p+4),id:v.getUint16(p+6),bytes:string(v.getUint16(p+8),v.getUint16(p+10))});}
  if(format===1){const p=6+count*12;if(p+2>storage)throw invalid();const total=v.getUint16(p);if(p+2+total*4>storage)throw invalid();for(let i=0;i<total;i++)languages.push(string(v.getUint16(p+2+i*4),v.getUint16(p+4+i*4)));}
  return {format,records,languages};
}
function writeNames(original:ReturnType<typeof names>,records:Name[]){
  records.sort((a,b)=>a.platform-b.platform||a.encoding-b.encoding||a.language-b.language||a.id-b.id);
  const header=6+records.length*12+(original.format===1?2+original.languages.length*4:0),strings:Uint8Array[]=[],offsets:number[]=[];let length=0;
  const seen=new Map<string,number>();
  for(const bytes of [...records.map(r=>r.bytes),...original.languages]){const key=bytes.join(',');let offset=seen.get(key);if(offset===undefined){offset=length;seen.set(key,offset);strings.push(bytes);length+=bytes.length;}if(offset>65535||bytes.length>65535)throw invalid();offsets.push(offset);}
  if(header>65535)throw invalid();const table=new Uint8Array(header+length),v=view(table);v.setUint16(0,original.format);v.setUint16(2,records.length);v.setUint16(4,header);
  for(const [i,r]of records.entries()){const p=6+i*12;[r.platform,r.encoding,r.language,r.id,r.bytes.length,offsets[i]].forEach((n,j)=>v.setUint16(p+j*2,n));}
  if(original.format===1){const p=6+records.length*12;v.setUint16(p,original.languages.length);original.languages.forEach((b,i)=>{v.setUint16(p+2+i*4,b.length);v.setUint16(p+4+i*4,offsets[records.length+i]);});}
  let cursor=header;for(const b of strings){table.set(b,cursor);cursor+=b.length;}
  return table;
}
export function withFontName(font:Sfnt,id:number,text:string):Sfnt{
  const original=names(font.tables.get('name')!),records=original.records.filter(r=>!(r.platform===3&&r.encoding===1&&r.language===0x409&&r.id===id));
  records.push({id,platform:3,encoding:1,language:0x409,bytes:utf16(text)});const tables=new Map(font.tables);tables.set('name',writeNames(original,records));return {signature:font.signature,tables};
}
export function fontNames(font:Sfnt){
  const records=names(font.tables.get('name')!).records,result=new Map<number,string>();
  for(const r of [...records].sort((a,b)=>Number(a.platform===3)-Number(b.platform===3))){const text=decodeName(r.bytes,r.platform,r.encoding);if(text)result.set(r.id,text);}
  return result;
}
/** Replace only family/style identity. Copyright and license records stay intact. */
export function renameSfnt(font:Sfnt,family:string,weight:number,italic:boolean):Sfnt{
  const original=names(font.tables.get('name')!),changed=new Set([1,2,4,6,16,17]),records=original.records.filter(n=>!changed.has(n.id));
  const style=weight>=600?(italic?'Bold Italic':'Bold'):(italic?'Italic':'Regular');
  let hash=2166136261;for(const c of family+':'+weight+':'+italic)hash=Math.imul(hash^c.codePointAt(0)!,16777619)>>>0;
  let postscript=(family.replace(/[^A-Za-z0-9]/g,'').slice(0,38)||'DocumentFont')+'-'+hash.toString(16)+'-'+style.replaceAll(' ','');
  for(const [id,text]of [[1,family],[2,style],[4,family+' '+style],[6,postscript],[16,family],[17,style]]as const)records.push({id,platform:3,encoding:1,language:0x409,bytes:utf16(text)});
  const table=writeNames(original,records);
  const tables=new Map(font.tables),os=font.tables.get('OS/2')!.slice(),head=font.tables.get('head')!.slice(),o=view(os),h=view(head);
  o.setUint16(4,weight);o.setUint16(62,(o.getUint16(62)&~(1|32|64))|(italic?1:0)|(weight>=600?32:0)|(!italic&&weight<600?64:0));
  h.setUint16(44,(h.getUint16(44)&~3)|(weight>=600?1:0)|(italic?2:0));tables.set('name',table);tables.set('OS/2',os);tables.set('head',head);return {signature:font.signature,tables};
}
export function editableEmbedding(font:Sfnt){
  const os=view(font.tables.get('OS/2')!),version=os.getUint16(0),flags=os.getUint16(8),permission=flags&15;
  if((version>=2&&(flags&0x200))||(permission!==0&&permission!==8&&!(version<=2&&(permission&8))))throw new Error('This font does not allow editable embedding. Choose another font for PowerPoint.');
  return flags;
}
export function hasHanGlyphs(font:Sfnt){
  const bytes=font.tables.get('cmap')!,v=view(bytes),count=v.getUint16(2);if(4+count*8>bytes.length)throw invalid();
  for(let i=0;i<count;i++){
    const offset=v.getUint32(8+i*8);if(offset+2>bytes.length)throw invalid();const format=v.getUint16(offset);
    if(format===12||format===13){if(offset+16>bytes.length)throw invalid();const groups=v.getUint32(offset+12);if(offset+16+groups*12>bytes.length)throw invalid();for(let j=0;j<groups;j++){const p=offset+16+j*12,start=v.getUint32(p),end=v.getUint32(p+4),glyph=v.getUint32(p+8);if(glyph&&((start<=0x9fff&&end>=0x3400)||(start<=0xfaff&&end>=0xf900)||(start<=0x3347f&&end>=0x20000)))return true;}}
    if(format===4){if(offset+14>bytes.length)throw invalid();const n=v.getUint16(offset+6)/2,end=offset+14,start=end+n*2+2,delta=start+n*2,range=delta+n*2;if(!Number.isInteger(n)||range+n*2>bytes.length)throw invalid();for(let j=0;j<n;j++){const lo=Math.max(0x3400,v.getUint16(start+j*2)),hi=Math.min(0x9fff,v.getUint16(end+j*2));if(lo>hi)continue;const r=v.getUint16(range+j*2),d=v.getInt16(delta+j*2);for(let cp=lo;cp<=hi;cp++){if(!r){if((cp+d)&65535)return true;}else{const p=range+j*2+r+(cp-v.getUint16(start+j*2))*2;if(p+2>bytes.length)throw invalid();const glyph=v.getUint16(p);if(glyph&&((glyph+d)&65535))return true;}}}}
  }
  return false;
}
export function makeEot(bytes:Uint8Array):Uint8Array<ArrayBuffer>{
  const font=readSfnt(bytes),os=font.tables.get('OS/2')!,o=view(os),head=view(font.tables.get('head')!),names=fontNames(font);
  const strings=[names.get(1)||'Document font',names.get(2)||'Regular',names.get(5)||'Version 1.0',names.get(4)||names.get(1)||'Document font'].map(text=>utf16(text));
  const header=80+strings.reduce((n,s)=>n+4+s.length,0)+4,result=new Uint8Array(header+bytes.length),v=view(result);
  v.setUint32(0,result.length,true);v.setUint32(4,bytes.length,true);v.setUint32(8,0x00020001,true);result.set(os.subarray(32,42),16);result[26]=1;result[27]=Number(Boolean(o.getUint16(62)&1));v.setUint32(28,o.getUint16(4),true);v.setUint16(32,o.getUint16(8),true);v.setUint16(34,0x504c,true);
  for(let i=0;i<4;i++)v.setUint32(36+i*4,o.getUint32(42+i*4),true);if(os.length>=86){v.setUint32(52,o.getUint32(78),true);v.setUint32(56,o.getUint32(82),true);}v.setUint32(60,head.getUint32(8),true);
  let p=80;for(const s of strings){v.setUint16(p,0,true);v.setUint16(p+2,s.length,true);for(let i=0;i<s.length;i+=2){result[p+4+i]=s[i+1];result[p+5+i]=s[i];}p+=4+s.length;}result.set(bytes,header);return result;
}
