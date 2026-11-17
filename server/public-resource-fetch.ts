import {BRAND_NAME} from '../src/brand-name.js';
import {lookup} from 'node:dns/promises';
import type {LookupAddress} from 'node:dns';
import {isIP, type LookupFunction} from 'node:net';
import {request} from 'node:https';
import type {IncomingMessage} from 'node:http';

export function publicAddress(address:string):boolean {
  if(isIP(address)===4){const [a,b,c]=address.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===88&&c===99))||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19||b===51&&c===100))||(a===203&&b===0&&c===113));}
  const ip=address.toLowerCase();return isIP(ip)===6&&ip.startsWith('2')&&!/^(?:2001:(?:db8|0|2|10|20):|2002:)/.test(ip);
}
export type PublicResolver=(hostname:string)=>Promise<LookupAddress[]>;
const resolveAddresses:PublicResolver=hostname=>lookup(hostname,{all:true});
export async function publicImageTarget(raw:string,resolver:PublicResolver=resolveAddresses){
  const url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443'))throw new Error('Resource links must use a public HTTPS URL.');
  const hostname=url.hostname.replace(/^\[|\]$/g,''),addresses=await resolver(hostname);
  if(!addresses.length||addresses.some(a=>!publicAddress(a.address)||isIP(a.address)!==a.family))throw new Error('The resource source is unavailable.');
  return {url,addresses};
}
export async function publicImageUrl(raw:string){return (await publicImageTarget(raw)).url;}
/** Socket lookup must reuse the checked addresses, never resolve the host twice. */
export function pinnedLookup(addresses:LookupAddress[]):LookupFunction {
  const approved=addresses.map(a=>({...a}));if(!approved.length||approved.some(a=>!publicAddress(a.address)||isIP(a.address)!==a.family))throw new Error('The resource source is unavailable.');
  return (_hostname,options,done)=>{const family=Number(options.family||0),available=approved.filter(a=>!family||a.family===family);if(!available.length){done(Object.assign(new Error('No public address in the requested family.'),{code:'ENOTFOUND'}),'');return;}if(options.all)done(null,available);else done(null,available[0].address,available[0].family);};
}
export async function readPublicBody(response:IncomingMessage,limit:number):Promise<Buffer>{
  if(Number(response.headers['content-length'])>limit){response.destroy();throw new Error('This resource is too large. Choose another resource.');}
  const parts:Buffer[]=[];let size=0;try{for await(const part of response){const chunk=Buffer.isBuffer(part)?part:Buffer.from(part);size+=chunk.length;if(size>limit)throw new Error('This resource is too large. Choose another resource.');parts.push(chunk);}return Buffer.concat(parts,size);}finally{response.destroy();}
}
export async function fetchPublicResource(raw:string,limit=12_000_000):Promise<{bytes:Buffer;type:string}>{
  let destination=raw;
  for(let hops=0;hops<4;hops++){
    const {url,addresses}=await publicImageTarget(destination);
    // Preserve normal TLS hostname/certificate checks; disable connection reuse.
    const response=await new Promise<IncomingMessage>((resolve,reject)=>{const req=request(url,{agent:false,lookup:pinnedLookup(addresses),signal:AbortSignal.timeout(15000),headers:{'User-Agent':`${BRAND_NAME}/0.1 (open-resource browser)`,'Accept-Encoding':'identity'}},resolve);req.once('error',reject);req.end();});
    const status=response.statusCode??502;
    if([301,302,303,307,308].includes(status)){const location=response.headers.location;response.destroy();if(!location)throw new Error('The resource source redirect failed.');destination=new URL(location,url).href;continue;}
    if(status<200||status>=300){response.destroy();throw Object.assign(new Error(status===429?'Too many resource requests. Try again later.':'The resource source is unavailable. Try again or choose another resource.'),{status:status===429?429:502});}
    return {bytes:await readPublicBody(response,limit),type:(response.headers['content-type']||'').split(';')[0]};
  }
  throw new Error('The resource source has too many redirects.');
}
