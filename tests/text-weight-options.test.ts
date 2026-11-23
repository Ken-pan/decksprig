import {test} from 'node:test';
import assert from 'node:assert/strict';
import {element,type Deck} from '../src/core/model';
import {textWeightOptions} from '../src/core/text-weight-options';

const font=(family:string,weight:string):NonNullable<Deck['fonts']>[number]=>({family,weight,name:'fixture.woff2',style:'normal',data:'data:font/woff2;base64,AA=='});
const fonts=[font('Unused base','100'),font('Rendered family','400'),font('Rendered family','700'),font('Other family','900')];

test('rendered paragraph family supplies its weights instead of unused object and run families',()=>{
  const e=element('text',{fontFamily:'Unused base',fontWeight:100,runs:[{text:'Unused',fontFamily:'Other family'}],paragraphs:[{align:'left',spaceBefore:0,spaceAfter:0,indent:0,firstLineIndent:0,runs:[{text:'Visible',fontFamily:'Rendered family',fontWeight:400}]}]});
  assert.deepEqual(textWeightOptions([e],fonts),[400,700]);
});

test('mixed rendered families retain every used weight without claiming either family supports the other weights',()=>{
  const e=element('text',{fontFamily:'Unused base',fontWeight:100,runs:[{text:'A',fontFamily:'Rendered family',fontWeight:400},{text:'B',fontFamily:'Other family',fontWeight:500},{text:'',fontFamily:'Unused base',fontWeight:100}]});
  assert.deepEqual(textWeightOptions([e],fonts),[400,500]);
  const before=structuredClone(e);
  assert.deepEqual(textWeightOptions([e,element('text',{fontFamily:'Rendered family',fontWeight:700})],fonts),[400,500,700]);
  assert.deepEqual(e,before);
});

test('shape labels use their rendered run family and retain authored nonstandard weights',()=>{
  const label=element('rect',{text:'Label',fontFamily:'Unused base',fontWeight:100,runs:[{text:'Label',fontFamily:'Rendered family',fontWeight:450}]});
  assert.deepEqual(textWeightOptions([label],fonts),[400,450,700]);
});

test('editable selection ignores locked differences while locked-only and empty labels remain inspectable',()=>{
  const editable=element('text',{fontFamily:'Rendered family',fontWeight:400}),locked=element('text',{locked:true,fontFamily:'Other family',fontWeight:900});
  assert.deepEqual(textWeightOptions([editable,locked],fonts),[400,700]);
  assert.deepEqual(textWeightOptions([locked],fonts),[900]);
  assert.deepEqual(textWeightOptions([element('rect',{text:'',fontFamily:'Rendered family',fontWeight:400})],fonts),[400,700]);
});
