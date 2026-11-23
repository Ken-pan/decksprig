import {runInNewContext} from 'node:vm';
import test from 'node:test';import assert from 'node:assert/strict';
import {textLinkUrl,wholeTextLink} from '../src/core/text-link';
import {element,blankSlide,newDeck} from '../src/core/model';
import {serializeForDeck} from '../plugins/figma-export/capture';
import {importFigma} from '../src/importers/figma';
import {nativeTextSpans,textLayoutFingerprint} from '../src/core/native-text-render';
import {mergeFigmaDeck,projectFigmaChanges} from '../src/core/figma-sync';

test('presentation links accept web, email and telephone targets without script, credentials or header injection',()=>{
 for(const value of ['https://example.com/help','http://example.com','mailto:hello@example.com?subject=Hello','tel:+1-555-0100'])assert(textLinkUrl(value));
 for(const value of ['javascript:alert(1)','data:text/html,hi','file:///tmp/secret','https://me:secret@example.com/','https://example.com/?api_key=secret','https://example.com/?access_token=secret','mailto:hello@example.com%0D%0ABcc:private@example.com','mailto:not-an-address','tel:javascript(1)']){assert.equal(textLinkUrl(value),undefined,value);}
 assert.equal(runInNewContext('('+textLinkUrl.toString()+')(\"https://example.com/help\")'),'https://example.com/help');const serialized=eval('('+textLinkUrl.toString()+')');assert.equal(serialized('mailto:hello@example.com'),'mailto:hello@example.com');assert.equal(serialized('javascript:alert(1)'),undefined);
});
test('only a single URL on the whole nonblank text is promoted; mixed and native-node links remain partial',()=>{
 const a={characters:'Hello',hyperlink:{type:'URL',value:'https://example.com/'}},b={...a,characters:' world'};
 assert.equal(wholeTextLink([a,b,{characters:'\n'}]),'https://example.com/');assert.equal(wholeTextLink([a,{characters:' plain'}]),undefined);assert.equal(wholeTextLink([a,{...b,hyperlink:{type:'URL',value:'https://other.example/'}}]),undefined);assert.equal(wholeTextLink([{...a,hyperlink:{type:'NODE',value:'2:123'}}]),undefined);
});
test('capture and import preserve whole-text links while keeping partial and sensitive targets out of promoted metadata',()=>{
 const segment:any={start:0,end:5,characters:'Hello',fontName:{family:'Inter',style:'Regular'},fontSize:32,fontWeight:400,fills:[],lineHeight:{unit:'AUTO'},letterSpacing:{unit:'PIXELS',value:0},hyperlink:{type:'URL',value:'mailto:hello@example.com'}};
 const node:any={id:'text',type:'TEXT',name:'Link',characters:'Hello',absoluteBoundingBox:{x:10,y:20,width:300,height:50},getStyledTextSegments:()=>[segment]};
 const captured=serializeForDeck(node);assert.equal(captured.textLink,'mailto:hello@example.com');assert(!captured.hasHyperlinks);
 const bundle={slides:[{id:'slide',name:'Slide',type:'SLIDE',absoluteBoundingBox:{x:0,y:0,width:1920,height:1080},children:[captured]}]};const e=importFigma(bundle).slides[0].elements[0];assert.equal(e.link,'mailto:hello@example.com');
 segment.hyperlink.value='https://example.com/?token=private';const rejected=serializeForDeck(node);assert(!rejected.textLink);assert(rejected.hasHyperlinks);assert(!JSON.stringify(rejected).includes('private'));
});
test('link edits retain glyph geometry, merge with independent moves and conflict only on the link itself',()=>{
 const e=element('text',{id:'text',text:'Linked heading',link:'https://example.com/'});e.nativeTextLayout={fingerprint:textLayoutFingerprint(e),runs:[{text:e.text}]};const base=newDeck('Links',[{...blankSlide(),elements:[e]}]),local=structuredClone(base),remote=structuredClone(base);local.slides[0].elements[0].link='mailto:hello@example.com';remote.slides[0].elements[0].x+=20;
 assert(nativeTextSpans(local.slides[0].elements[0]));const merged=mergeFigmaDeck(base,local,remote);assert.equal(merged.conflicts.length,0);assert.equal(merged.deck!.slides[0].elements[0].link,'mailto:hello@example.com');assert.equal(merged.deck!.slides[0].elements[0].x,remote.slides[0].elements[0].x);const native=structuredClone(base);delete native.slides[0].elements[0].link;assert.equal(projectFigmaChanges(base,base,native).slides[0].elements[0].link,undefined);assert.equal(mergeFigmaDeck(base,local,native).conflicts[0].path.split('.').at(-1),'link');
});
