import test from 'node:test';import assert from 'node:assert/strict';
import {captureAlignedVisual} from '../plugins/figma-export/pixel-capture';
function fixture(){
 const made:any[]=[],exports:any[]=[],loaded:any[]=[];
 function node(){const n:any={children:[],parent:undefined,removed:false,appendChild(child:any){child.remove();child.parent=this;child.removed=false;this.children.push(child);},resize(w:number,h:number){this.width=w;this.height=h;},remove(){if(this.parent)this.parent.children=this.parent.children.filter((v:any)=>v!==this);this.parent=undefined;this.removed=true;},async exportAsync(options:any){exports.push({node:this,options});return new Uint8Array([1,2,3]);}};return n;}
 const slide:any={...node(),type:'SLIDE',absoluteBoundingBox:{x:100,y:200,width:1920,height:1080}};
 const source:any={...node(),type:'FRAME',blendMode:'LIGHTEN',opacity:1,fills:[],strokes:[],effects:[],absoluteRenderBounds:{x:99.75,y:201.4,width:790.3,height:692.23},absoluteTransform:[[-1,0,888.9],[0,1,-395]],findAllWithCriteria:()=>[],clone(){const c=node();slide.appendChild(c);return c;}};slide.appendChild(source);
 const host:any={createFrame(){const n=node();made.push(n);return n;},async loadFontAsync(f:any){loaded.push(f);}};return{host,slide,source,made,exports,loaded};
}
test('transparent native capture uses integer bounds relative to the slide and preserves the original scene',async()=>{
 const h=fixture(),original=structuredClone(h.source.absoluteTransform);const r=await captureAlignedVisual(h.host,h.source,h.slide);assert.deepEqual(r?.bounds,{x:100,y:201,width:791,height:693});assert.deepEqual(h.exports[0].options,{format:'PNG',constraint:{type:'SCALE',value:1}});assert.equal(h.exports[0].node.width,791);assert.deepEqual(h.slide.children,[h.source]);assert.deepEqual(h.source.absoluteTransform,original);assert(h.made[0].removed);
});
test('the bounded path excludes other blend modes, nested groups, effects and authored fills',async()=>{
 for(const patch of [{blendMode:'MULTIPLY'},{opacity:.5},{fills:[{type:'SOLID'}]},{effects:[{visible:true}]},{parent:{type:'FRAME'}},{isMask:true}]){const h=fixture();Object.assign(h.source,patch);assert.equal(await captureAlignedVisual(h.host,h.source,h.slide),undefined);assert.equal(h.made.length,0);}
});
test('all native fonts load before any temporary nodes are created',async()=>{
 const h=fixture();h.source.findAllWithCriteria=()=>[{getStyledTextSegments:()=>[{fontName:{family:'Missing',style:'Regular'}}]}];h.host.loadFontAsync=async()=>{throw Error('Font unavailable');};await assert.rejects(()=>captureAlignedVisual(h.host,h.source,h.slide),/Font unavailable/);assert.equal(h.made.length,0);assert.deepEqual(h.slide.children,[h.source]);
});
test('native export failure removes both the temporary frame and clone',async()=>{
 const h=fixture(),create=h.host.createFrame;h.host.createFrame=()=>{const n=create();n.exportAsync=async()=>{throw Error('Native export failure');};return n;};await assert.rejects(()=>captureAlignedVisual(h.host,h.source,h.slide),/Native export failure/);assert.deepEqual(h.slide.children,[h.source]);assert(h.made[0].removed);
});
