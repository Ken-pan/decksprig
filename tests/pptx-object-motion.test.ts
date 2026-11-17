import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {blankSlide,element,newDeck,type ElementAnimation,type Slide} from '../src/core/model';
import {enhancePptxTemplate} from '../src/core/pptx-template-structure';

const animation=(patch:Partial<ElementAnimation>={}):ElementAnimation=>({phase:'in',effect:'fade',duration:500,delay:0,trigger:'click',order:0,easing:'linear',...patch});
const list=(value:any):any[]=>value===undefined?[]:Array.isArray(value)?value:[value];
function descendants(value:any,key:string):any[]{return value&&typeof value==='object'?Object.entries(value).flatMap(([k,v])=>[...(k===key?list(v):[]),...list(v).flatMap(x=>descendants(x,key))]):[];}
async function fixture(s:Slide){
 s.template={prototype:'insights',variant:'editorial',density:'presentation'};
 const deck=newDeck('Authored motion export',[s]),pptx=new PptxGenJS(),slide=pptx.addSlide();
 for(const e of s.elements)slide.addShape(pptx.ShapeType.rect,{x:1,y:1,w:1,h:1,objectName:e.id});
 const original=await pptx.write({outputType:'uint8array'}) as Uint8Array,before=JSON.stringify(deck),bytes=await enhancePptxTemplate(original,deck);
 assert.equal(JSON.stringify(deck),before);
 const zip=await JSZip.loadAsync(bytes),xml=await zip.file('ppt/slides/slide1.xml')!.async('string');assert.equal(XMLValidator.validate(xml),true);
 const tree=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@'}).parse(xml),root=tree['p:sld']['p:timing']?.['p:tnLst']['p:par']['p:cTn'];
 const names=new Map(descendants(tree,'p:cNvPr').map(n=>[n['@id'],n['@name']]));
 const effects=descendants(root,'p:animEffect').map(n=>({id:names.get(n['p:cBhvr']['p:tgtEl']['p:spTgt']['@spid']),phase:n['@transition'],duration:Number(n['p:cBhvr']['p:cTn']['@dur'])}));
 return {deck,original,bytes,xml,tree,root,effects,names};
}
const cueBlocks=(root:any)=>list(root['p:childTnLst']['p:seq']['p:cTn']['p:childTnLst']['p:par']).map(p=>p['p:cTn']);
function entries(parent:any,names:Map<string,string>){return list(parent['p:childTnLst']['p:par']).map(p=>{const n=p['p:cTn'],fx=n['p:childTnLst']['p:animEffect'];return {id:names.get(fx['p:cBhvr']['p:tgtEl']['p:spTgt']['@spid']),phase:fx['@transition'],start:Number(n['p:stCondLst']['p:cond']['@delay']),duration:Number(fx['p:cBhvr']['p:cTn']['@dur']),nodeType:n['@nodeType']};});}

test('PPTX authored Out and relative cues retain each duration and resolved delay in the real slide timing XML',async()=>{
 const s=blankSlide();s.elements=[element('rect',{id:'click',animation:animation({order:2,delay:20,duration:500})}),element('rect',{id:'parallel',animation:animation({order:3,trigger:'with-previous',delay:50,duration:800})}),element('rect',{id:'exit',animation:animation({order:4,trigger:'after-previous',delay:10,duration:300,phase:'out'})}),element('rect',{id:'next-click',animation:animation({order:8,delay:40,duration:400})})];
 const {effects,root,names,xml}=await fixture(s);assert.deepEqual(effects.map(e=>[e.id,e.phase,e.duration]),[['click','in',500],['parallel','in',800],['exit','out',300],['next-click','in',400]]);
 const blocks=cueBlocks(root);assert.equal(blocks.length,2);assert(blocks.every(b=>b['p:stCondLst']['p:cond']['@delay']==='indefinite'));
 assert.deepEqual(entries(blocks[0],names),[{id:'click',phase:'in',start:20,duration:500,nodeType:'clickEffect'},{id:'parallel',phase:'in',start:70,duration:800,nodeType:'withEffect'},{id:'exit',phase:'out',start:880,duration:300,nodeType:'afterEffect'}]);
 assert.deepEqual(entries(blocks[1],names).map(e=>[e.id,e.start,e.duration]),[['next-click',40,400]]);assert.equal(Number(blocks[0]['@dur']),1180);
 const initial=list(root['p:childTnLst']['p:set']).map(n=>names.get(n['p:cBhvr']['p:tgtEl']['p:spTgt']['@spid']));assert.deepEqual(initial,['click','parallel','next-click']);
 const exit=blocks[0]['p:childTnLst']['p:par'][2]['p:cTn'];assert.equal(exit['@presetClass'],'exit');const settle=exit['p:childTnLst']['p:set'];assert.equal(settle['p:to']['p:strVal']['@val'],'hidden');assert.equal(Number(settle['p:cBhvr']['p:cTn']['p:stCondLst']['p:cond']['@delay']),300);
 const ids=[...xml.matchAll(/<p:cTn[^>]* id="(\d+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
});

test('PPTX automatic and orphan chains start with the slide and remain outside numbered click groups',async()=>{
 const s=blankSlide();s.elements=[element('rect',{id:'auto',animation:animation({trigger:'auto',duration:600,delay:100})}),element('rect',{id:'with',animation:animation({order:1,trigger:'with-previous',duration:200,delay:50})}),element('rect',{id:'after',animation:animation({order:2,trigger:'after-previous',duration:100,delay:30,phase:'out'})}),element('rect',{id:'hidden',hidden:true,animation:animation({order:3})}),element('rect',{id:'disabled',animation:animation({order:4,effect:'none'})})];
 const {root,names,effects}=await fixture(s),auto=root['p:childTnLst']['p:par']['p:cTn'];assert.deepEqual(entries(auto,names).map(e=>[e.id,e.start,e.duration]),[['auto',100,600],['with',150,200],['after',730,100]]);assert.equal(cueBlocks(root).length,0);assert.deepEqual(effects.map(e=>e.id),['auto','with','after']);
 const orphan=blankSlide();orphan.elements=[element('rect',{id:'orphan',animation:animation({trigger:'after-previous',delay:40})})];const other=await fixture(orphan);assert.equal(cueBlocks(other.root).length,0);assert.equal(entries(other.root['p:childTnLst']['p:par']['p:cTn'],other.names)[0].start,40);
});

test('PPTX legacy automatic staggering and equal-order click groups follow the shared local plan',async()=>{
 const s=blankSlide(),{phase:_phase,...legacy}=animation({trigger:'auto'});s.elements=[element('rect',{id:'auto1',animation:{...legacy,order:10,delay:20}}),element('rect',{id:'auto2',animation:{...legacy,order:20,delay:30}}),element('rect',{id:'click1',animation:{...legacy,trigger:'click',order:8,duration:250}}),element('rect',{id:'click2',animation:{...legacy,trigger:'click',order:8,duration:750}})];
 const {root,names}=await fixture(s);assert.deepEqual(entries(root['p:childTnLst']['p:par']['p:cTn'],names).map(e=>[e.id,e.start]),[['auto1',20],['auto2',100]]);const blocks=cueBlocks(root);assert.equal(blocks.length,1);assert.deepEqual(entries(blocks[0],names).map(e=>[e.id,e.duration]),[['click1',250],['click2',750]]);
});

test('PPTX source/provenance guards retain unknown original timing instead of generating motion from missing native data',async()=>{
 const s=blankSlide();s.elements=[element('rect',{id:'authored',animation:animation({phase:'out'})})];const result=await fixture(s),zip=await JSZip.loadAsync(result.original),path='ppt/slides/slide1.xml',unknown='<p:timing><p:extLst><p:ext uri="unknown-original-motion"/></p:extLst></p:timing>';
 zip.file(path,(await zip.file(path)!.async('string')).replace('</p:sld>',unknown+'</p:sld>'));const input=await zip.generateAsync({type:'uint8array'});
 result.deck.provenance={provider:'Figma'};assert.equal(await enhancePptxTemplate(input,result.deck),input);
 delete result.deck.provenance;result.deck.slides[0].source={provider:'Figma',warnings:[],fidelity:'converted'};const retained=await JSZip.loadAsync(await enhancePptxTemplate(input,result.deck));assert.equal(await retained.file(path)!.async('string'),await zip.file(path)!.async('string'));
});
