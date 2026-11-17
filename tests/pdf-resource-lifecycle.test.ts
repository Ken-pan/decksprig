import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readPdfPages,readPdfReferences} from '../src/importers/pdf';

test('PDF tasks and page buffers are released on success and every failure stage',async()=>{
  const previous=globalThis.document;
  try {
    for(const stage of ['success','load','limit','first','render','encode','text'] as const){
      let destroyed=0,cleaned=0;
      const canvases:{width:number;height:number}[]=[];
      globalThis.document={createElement(){const canvas={width:0,height:0,getContext:()=>({}),toDataURL(){if(stage==='encode')throw Error('encode failed');return 'data:image/png;base64,AQID';}};canvases.push(canvas);return canvas;}} as unknown as Document;
      const page={getViewport:()=>({width:720,height:405,transform:[1,0,0,1,0,0]}),render:()=>({promise:stage==='render'?Promise.reject(Error('render failed')):Promise.resolve()}),getTextContent:async()=>{if(stage==='text')throw Error('text failed');return {items:[{str:'Preserved text',transform:[20,0,0,20,10,30],width:60}]};},cleanup(){cleaned++;}};
      const task={promise:stage==='load'?Promise.reject(Error('load failed')):Promise.resolve({numPages:stage==='limit'?501:2,getPage:async()=>{if(stage==='first')throw Error('first failed');return page;}}),destroy:async()=>{destroyed++;}} as unknown as Parameters<typeof readPdfPages>[0];
      const work=readPdfPages(task,'source.pdf',()=>{},(_a,b)=>b);
      if(stage==='success') {const deck=await work;assert.equal(deck.slides.length,2);assert.equal(deck.slides[0].elements[0].text,'Preserved text');assert.equal(deck.slides[0].source?.render,'data:image/png;base64,AQID');assert.equal(cleaned,3);}
      else await assert.rejects(work,stage==='limit'?/500 pages/:new RegExp(stage+' failed'));
      assert.equal(destroyed,1,stage);
      assert(canvases.every(canvas=>canvas.width===0&&canvas.height===0),stage);
      if(['render','encode','text'].includes(stage))assert.equal(cleaned,2,stage);
    }
  }finally {globalThis.document=previous;}
});

test('converted PDF references use the same PNG render without extracting editable text',async()=>{
  const previous=globalThis.document;
  let destroyed=false,cleaned=false;
  const canvas={width:0,height:0,getContext:()=>({}),toDataURL:(type:string)=>{assert.equal(type,'image/png');return 'data:image/png;base64,AQID';}};
  const page={getViewport:()=>({width:720,height:405}),render:()=>({promise:Promise.resolve()}),getTextContent:()=>{throw Error('Text extraction was unnecessary');},cleanup(){cleaned=true;}};
  const task={promise:Promise.resolve({numPages:1,getPage:async()=>page}),destroy:async()=>{destroyed=true;}} as unknown as Parameters<typeof readPdfReferences>[0];
  try {
    globalThis.document={createElement:()=>canvas} as unknown as Document;
    assert.deepEqual(await readPdfReferences(task,()=>{}),['data:image/png;base64,AQID']);
    assert(cleaned&&destroyed);
    assert.equal(canvas.width+canvas.height,0);
  }finally{globalThis.document=previous;}
});

test('two source rasters settle before destroying the shared PDF task',async()=>{
  const previous=globalThis.document;
  const cleaned:number[]=[];
  const canvases:{width:number;height:number}[]=[];
  let rejectFirst!:(error:Error)=>void, releaseSecond!:()=>void, destroyed=false;
  const first=new Promise<void>((_,reject)=>{rejectFirst=reject;});
  const second=new Promise<void>(resolve=>{releaseSecond=resolve;});
  const task={promise:Promise.resolve({numPages:3,getPage:async(index:number)=>({
    getViewport:()=>({width:720,height:405}),
    render:()=>({promise:index===1?first:second}),
    cleanup(){cleaned.push(index);},
  })}),destroy:async()=>{destroyed=true;}} as unknown as Parameters<typeof readPdfReferences>[0];
  try {
    globalThis.document={createElement(){const canvas={width:0,height:0,getContext:()=>({}),toDataURL:()=> 'data:image/png;base64,AQID'};canvases.push(canvas);return canvas;}} as unknown as Document;
    const work=readPdfReferences(task,()=>{});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(canvases.length,2);
    rejectFirst(new Error('First render failed'));
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(destroyed,false);
    assert.deepEqual(cleaned,[1]);
    releaseSecond();
    await assert.rejects(work,/First render failed/);
    assert(destroyed&&canvases.every(canvas=>canvas.width+canvas.height===0));
    assert.deepEqual(cleaned,[1,2]);
  }finally {globalThis.document=previous;}
});
