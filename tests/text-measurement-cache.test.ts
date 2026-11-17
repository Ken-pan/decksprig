import test from 'node:test';
import assert from 'node:assert/strict';
import {element,type Deck} from '../src/core/model';
import {browserTextSize,clearTextSizeCache,textSizeEpoch} from '../src/core/text-layout';

test('measurement cache invalidates rendered case, paragraph edges, fallback category and loaded fonts for mutable callers',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'document'),render=browserTextSize.render;
  let measures=0,loaded:(()=>void)|undefined;
  const host={isConnected:true,setAttribute(){},getBoundingClientRect:()=>({width:200,height:80})};
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>host,body:{append(){}},fonts:{addEventListener:(_type:string,callback:()=>void)=>loaded=callback}}});
  browserTextSize.render=()=>{measures++;return {scrollHeight:80} as HTMLDivElement;};
  const e=element('text',{text:'Mutable text',fontFamily:'Arial',textSizing:'auto-height',w:200,runs:[{text:'Mutable text',fontFamily:'QA unknown face'}]}),deck:Pick<Deck,'onlineFonts'>={onlineFonts:[]};
  try{
    clearTextSizeCache();const before=JSON.stringify(e);browserTextSize(e,deck);browserTextSize(e,deck);assert.equal(measures,1);assert.equal(JSON.stringify(e),before);
    e.textCase='upper';browserTextSize(e,deck);assert.equal(measures,2,'Root case changes are measured again');
    e.paragraphSpacingAtEdges=false;browserTextSize(e,deck);assert.equal(measures,3,'Paragraph edge policy is part of geometry');
    deck.onlineFonts=[{id:'qa-unknown-face',family:'QA unknown face',version:'1.0.0',category:'serif',chinese:false,weights:[400],styles:['normal'],license:'OFL-1.1',licenseNotice:'Controlled test font metadata only.'}];browserTextSize(e,deck);assert.equal(measures,4,'A run fallback category changes independently of the root face');
    e.runs![0].fontSize=40;browserTextSize(e,deck);assert.equal(measures,5,'Nested in-place edits cannot hit a stale identity cache');
    browserTextSize(e,deck);assert.equal(measures,5);const epoch=textSizeEpoch();assert(loaded);loaded();assert(textSizeEpoch()>epoch);browserTextSize(e,deck);assert.equal(measures,6,'Loaded fonts invalidate previous metrics');
    e.textSizing='fixed';assert.equal(browserTextSize(e,deck),null);assert.equal(measures,6);
  }finally{
    browserTextSize.render=render;clearTextSizeCache();if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else Reflect.deleteProperty(globalThis,'document');
  }
});

test('oversized valid styled objects remain measurable without retaining an oversized result key',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'document'),render=browserTextSize.render;let measures=0;
  const host={isConnected:true,setAttribute(){},getBoundingClientRect:()=>({width:200,height:80})};
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>host,body:{append(){}},fonts:{addEventListener(){}}}});
  browserTextSize.render=()=>{measures++;return {scrollHeight:80} as HTMLDivElement;};
  const paragraphs=Array.from({length:9},()=>({runs:Array.from({length:5000},()=>({text:'x',fontFamily:'Long font family for bounded measurement transport',fontSize:24,fontWeight:400,italic:false,underline:false,strikethrough:false,color:'#123456',letterSpacing:1,baseline:'normal' as const})),align:'left' as const,spaceBefore:0,spaceAfter:0,indent:0,firstLineIndent:0}));
  const e=element('text',{text:paragraphs.map(p=>p.runs.map(r=>r.text).join('')).join('\n'),paragraphs,textSizing:'auto-height',w:200});
  try{clearTextSizeCache();assert(browserTextSize(e,{}));assert(browserTextSize(e,{}));assert.equal(measures,2,'The 4 MB key budget applies without lowering supported content limits');}
  finally{browserTextSize.render=render;clearTextSizeCache();if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else Reflect.deleteProperty(globalThis,'document');}
});
