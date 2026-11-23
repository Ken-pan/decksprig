import test from 'node:test';
import assert from 'node:assert/strict';
import {importFigma} from '../src/importers/figma';
import {validateDeck} from '../src/core/model';
import {buildHtml} from '../src/core/export';

const white={type:'SOLID',color:{r:1,g:1,b:1}};
function source(type='SLIDE',fills:any=[]){return {id:'transparent-source',name:'No fill',type,fills,absoluteBoundingBox:{x:0,y:0,width:803,height:54},children:[{id:'white-label',type:'TEXT',name:'White label',characters:'Visible on the stage',fills:[white],style:{fontFamily:'Arial',fontSize:36},absoluteBoundingBox:{x:10,y:5,width:700,height:44}}]};}

test('explicit native Slides no-fill stays transparent without losing white text or inventing a background layer',()=>{
 for(const fills of [[],[{...white,visible:false}]]){
  const deck=importFigma({slides:[source('SLIDE',fills)]}),slide=deck.slides[0];assert.equal(slide.background,'transparent');assert.equal(slide.elements.length,1);assert.equal(slide.elements[0].fill,'#ffffff');assert.equal(slide.elements[0].text,'Visible on the stage');assert.equal(slide.elements[0].sourceId,'white-label');assert.equal(JSON.stringify(validateDeck(JSON.parse(JSON.stringify(deck)))),JSON.stringify(deck));
 }
});

test('missing Slides paints and ordinary no-fill Design frames retain their existing white fallback',()=>{
 const missing=source();delete (missing as any).fills;
 for(const node of [missing,{...source(),fills:null},source('FRAME'),source('FRAME',[{...white,visible:false}])])assert.equal(importFigma({slides:[node]}).slides[0].background,'#ffffff');
 assert.equal(importFigma({slides:[source('SLIDE',[{type:'SOLID',color:{r:.2,g:.4,b:.6}}])]}).slides[0].background,'#336699');
});

test('portable presentation keeps transparent document data separate from its black playback backing',async()=>{
 const deck=importFigma({slides:[source()]}),before=JSON.stringify(deck),html=await(await buildHtml(deck)).text();
 const exported=JSON.parse(html.match(/<script type="application\/json" id="deck">([\s\S]*?)<\/script>/)![1]);assert.equal(exported.slides[0].background,'transparent');assert.equal(exported.slides[0].elements[0].fill,'#ffffff');assert.match(html,/\.page-shell\{[^}]*background:#000/);assert.match(html,/@media print\{\.page-shell\{[^}]*background:transparent/);assert.equal(JSON.stringify(deck),before);
});
