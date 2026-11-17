import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {fromBundle} from '../plugins/figma-export/pptx';

test('offline Figma export works when the sandbox omits crypto.randomUUID',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(crypto,'randomUUID');
  const globals=Object.fromEntries(['document','location','fetch'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  Object.defineProperty(crypto,'randomUUID',{configurable:true,writable:true,value:undefined});
  Object.defineProperty(globalThis,'document',{configurable:true,value:new Proxy({},{get(){throw new Error('Offline export must use native text geometry');}})});
  Object.defineProperty(globalThis,'location',{configurable:true,value:{origin:'null'}});
  Object.defineProperty(globalThis,'fetch',{configurable:true,value:()=>{throw new Error('Offline export must not request application fonts');}});
  try{
    const bytes=await fromBundle({title:'Native export',slides:[{id:'qa-slide',type:'SLIDE',name:'QA',width:1920,height:1080,fills:[{type:'SOLID',color:{r:1,g:1,b:1}}],children:[{id:'qa-shape',type:'RECTANGLE',name:'Editable shape',absoluteBoundingBox:{x:120,y:300,width:640,height:360},fills:[{type:'SOLID',color:{r:.05,g:.4,b:.28}}]},{id:'qa-text',type:'TEXT',characters:'Native measured text',absoluteBoundingBox:{x:120,y:120,width:680,height:68},style:{fontFamily:'Inter',fontSize:56,textAutoResize:'WIDTH_AND_HEIGHT'}}]}]});
    const zip=await JSZip.loadAsync(bytes),slide=await zip.file('ppt/slides/slide1.xml')!.async('string');
    assert.match(slide,/<p:sp>/);
    assert.match(slide,/0D6647/);
    assert.match(slide,/Native measured text/);
    assert.match(slide,/cx="6477000" cy="647700"/);
    assert.equal(Object.keys(zip.files).filter(path=>/^ppt\/slides\/slide\d+\.xml$/.test(path)).length,1);
  }finally{
    if(descriptor)Object.defineProperty(crypto,'randomUUID',descriptor);
    else delete (crypto as Partial<Crypto>).randomUUID;
    for(const [name,value] of Object.entries(globals)){
      if(value)Object.defineProperty(globalThis,name,value);
      else Reflect.deleteProperty(globalThis,name);
    }
  }
});
