import {test} from 'node:test';import assert from 'node:assert/strict';
import {localImageElements} from '../src/core/local-images';import {newDeck,blankSlide} from '../src/core/model';
import {acquireThumbnail} from '../src/core/thumbnail-image';

test('local image batches read serially and release metadata URLs on success or failure',async()=>{
 const original={Image:globalThis.Image,FileReader:globalThis.FileReader,create:URL.createObjectURL,revoke:URL.revokeObjectURL};
 const urls=new Map<string,Blob>();let next=0,live=0,peak=0,reads=0,activeReads=0,peakReads=0;
 URL.createObjectURL=blob=>{const id='blob:test-'+next++;urls.set(id,blob as Blob);peak=Math.max(peak,++live);return id;};URL.revokeObjectURL=url=>{assert(urls.delete(url));live--;};
 class Probe {naturalWidth=4000;naturalHeight=3000;onload?:()=>void;onerror?:()=>void;set src(url:string){queueMicrotask(()=>{if((urls.get(url) as File)?.name==='bad.png')this.onerror?.();else this.onload?.();});}removeAttribute(){}}
 class Reader {result='';error=null;onload?:()=>void;onerror?:()=>void;readAsDataURL(blob:Blob){reads++;peakReads=Math.max(peakReads,++activeReads);void blob.arrayBuffer().then(data=>{this.result=`data:${blob.type};base64,${Buffer.from(data).toString('base64')}`;activeReads--;this.onload?.();});}}
 globalThis.Image=Probe as unknown as typeof Image;globalThis.FileReader=Reader as unknown as typeof FileReader;
 try{
  const files=Array.from({length:4},(_,i)=>new File([new Uint8Array([i,2,3])],`${i}.png`,{type:'image/png'}));const deck=newDeck('Photos',[blankSlide()]),images=await localImageElements(files,deck);assert.equal(images.length,4);assert.equal(reads,4);assert.equal(peak,1);assert.equal(peakReads,1);assert.equal(live,0);assert.equal(images[2].name,'2.png');assert.equal(images[2].src,'data:image/png;base64,AgID');
  await assert.rejects(localImageElements([files[0],new File(['invalid'],'bad.png',{type:'image/png'}),files[1]],deck),/bad.png/);assert.equal(reads,5);assert.equal(live,0);assert.equal(deck.slides[0].elements.length,0);
 }finally{globalThis.Image=original.Image;globalThis.FileReader=original.FileReader;URL.createObjectURL=original.create;URL.revokeObjectURL=original.revoke;}
});

test('thumbnail leases share work, bound decoding, cancel queues and release every bitmap/URL',async()=>{
 const original={Image:globalThis.Image,Canvas:globalThis.OffscreenCanvas,bitmap:globalThis.createImageBitmap,create:URL.createObjectURL,revoke:URL.revokeObjectURL};
 const urls=new Set<string>(),canvases:{width:number;height:number}[]=[];let next=0,decodes=0,closed=0,active=0,peak=0,throwCanvas=false,wait:Promise<void>|undefined;
 URL.createObjectURL=()=>{const url='blob:thumbnail-'+next++;urls.add(url);return url;};URL.revokeObjectURL=url=>{assert(urls.delete(url));};
 class Probe {naturalWidth=4000;naturalHeight=3000;onload?:()=>void;onerror?:()=>void;set src(_url:string){queueMicrotask(()=>this.onload?.());}removeAttribute(){}}
 class Canvas {constructor(public width:number,public height:number){if(throwCanvas)throw Error('Synthetic canvas failure');canvases.push(this);}getContext(){return {drawImage(){}};}async convertToBlob(){return new Blob(['preview'],{type:'image/png'});}}
 globalThis.Image=Probe as unknown as typeof Image;globalThis.OffscreenCanvas=Canvas as unknown as typeof OffscreenCanvas;
 globalThis.createImageBitmap=(async()=>{decodes++;peak=Math.max(peak,++active);await wait;return {close(){active--;closed++;}};}) as unknown as typeof createImageBitmap;
 const leases:ReturnType<typeof acquireThumbnail>[]=[];const lease=(src:string)=>{const item=acquireThumbnail(src);leases.push(item);return item;};
 try{
  const src='data:image/png;base64,AQID',a=lease(src),b=lease(src),cancelled=lease('data:image/png;base64,BAUG');cancelled.release();
  assert.equal(await cancelled.ready,undefined);const url=await a.ready;assert.equal(await b.ready,url);assert.equal(decodes,1);assert.equal(closed,1);assert.equal(peak,1);assert.equal(urls.size,1);a.release();assert.equal(urls.size,1);b.release();b.release();assert.equal(urls.size,0);
  let resume!:()=>void;wait=new Promise<void>(ok=>resume=ok);const c=lease('data:image/png;base64,BwgJ'),d=lease('data:image/png;base64,CgsM'),queued=lease('data:image/png;base64,DQ4P');queued.release();while(decodes<2)await new Promise(ok=>setTimeout(ok,0));c.release();resume();await c.ready;await d.ready;d.release();assert.equal(peak,2);assert.equal(decodes,3);assert.equal(closed,3);assert.equal(urls.size,0);wait=undefined;
  throwCanvas=true;const failure=lease(src);assert.equal(await failure.ready,undefined);failure.release();assert.equal(closed,4);assert.equal(urls.size,0);throwCanvas=false;
  const gif=lease('data:image/gif;base64,AQID');assert.equal(await gif.ready,'data:image/gif;base64,AQID');gif.release();assert.equal(decodes,4);assert(canvases.every(c=>c.width===0&&c.height===0));
 }finally{for(const item of leases)item.release();globalThis.Image=original.Image;globalThis.OffscreenCanvas=original.Canvas;globalThis.createImageBitmap=original.bitmap;URL.createObjectURL=original.create;URL.revokeObjectURL=original.revoke;}
});
