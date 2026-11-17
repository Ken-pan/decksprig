import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {buildSync} from 'esbuild';
import {runInNewContext} from 'node:vm';

type Rect={left:number;top:number;right:number;bottom:number};
const source=readFileSync(new URL('../src/selection-toolbar-layout.ts',import.meta.url),'utf8');
const code=buildSync({stdin:{contents:source,resolveDir:resolve('src'),sourcefile:'selection-toolbar-layout.ts',loader:'ts'},bundle:true,write:false,format:'cjs',platform:'node',target:'es2022',loader:{'.css':'empty'}}).outputFiles[0].text;
function moduleWith(globals:Record<string,unknown>={}){const module={exports:{}};runInNewContext(code,{module,exports:module.exports,...globals});return module.exports as any;}
const api=moduleWith(),footer={left:0,top:210,right:320,bottom:342},slot={left:8,top:218,right:312,bottom:278},utilities=[{left:8,top:286,right:200,bottom:330},{left:240,top:286,right:312,bottom:330}];
const plain=(value:any)=>JSON.parse(JSON.stringify(value));

test('a65px toolbar uses free footer padding/gap around its60px slot without touching utilities',()=>{
 const before=JSON.stringify({slot,footer,utilities}),row=api.selectionDockRow(slot,footer,utilities),position=api.positionDockedSelection({width:288,height:65},row);
 assert.deepEqual(plain(row),{left:8,top:210,right:312,bottom:282});assert.equal(row.bottom-row.top,72);
 assert(position);assert.equal(position.x,16);assert(position.y>=footer.top);assert(position.y+65<=utilities[0].top-4);assert(position.y+65<=footer.bottom);
 assert.equal(JSON.stringify({slot,footer,utilities}),before,'selection changes never grow or mutate footer/slot geometry');
});
test('above and below utilities restrict only the actual available row; insufficient height still hides',()=>{
 const middle={...slot,top:258,bottom:318},both=[{left:8,top:210,right:312,bottom:254},{left:8,top:322,right:312,bottom:342}];
 const row=api.selectionDockRow(middle,footer,both);assert.deepEqual(plain(row),middle);assert.equal(api.positionDockedSelection({width:288,height:65},row),null);
 assert.equal(api.selectionDockRow(slot,footer,[{left:40,top:230,right:120,bottom:260}]),null,'a utility overlapping the slot cannot be covered');
 const outside=api.selectionDockRow(slot,footer,[{left:0,top:210,right:7,bottom:342}]);assert.deepEqual(plain(outside),{left:8,top:210,right:312,bottom:342},'horizontally separate controls do not consume this row');
});
test('viewport clipping is applied before fitting and oversize controls never escape the available rectangle',()=>{
 const row=api.selectionDockRow(slot,footer,utilities),clipped={...row,top:220,bottom:280};
 assert.equal(api.positionDockedSelection({width:288,height:65},clipped),null);
 assert.equal(api.positionDockedSelection({width:305,height:44},row),null);
 const fit=api.positionDockedSelection({width:288,height:65},{...row,bottom:280});assert(fit);assert(fit.y>=210&&fit.y+65<=280);
});

function actionFixture({zeroSlot=false,height=65,viewportBottom=568}: {zeroSlot?:boolean;height?:number;viewportBottom?:number}={}){
 const scheduled:{callback?:()=>void}={};
 const noop=()=>{},box=(r:Rect)=>({...r,x:r.left,y:r.top,width:r.right-r.left,height:r.bottom-r.top});
 const slotNode={getBoundingClientRect:()=>box(zeroSlot?{left:0,top:0,right:0,bottom:0}:slot)};
 const footerRect=zeroSlot?{left:0,top:210,right:700,bottom:290}:footer;
 const tools=zeroSlot?[{left:0,top:230,right:100,bottom:274},{left:600,top:230,right:700,bottom:274}]:utilities;
 const footerNode={getBoundingClientRect:()=>box(footerRect),querySelector:(s:string)=>s==='.canvas-dock-slot'?slotNode:{getBoundingClientRect:()=>box(s==='.canvas-utility-left'?tools[0]:tools[1])}};
 const column={querySelector:()=>footerNode},workspace={querySelector:()=>null},surface={querySelector:()=>null,querySelectorAll:()=>[]};
 const render={classList:{contains:()=>false},querySelectorAll:()=>[{dataset:{elementId:'selected'},getBoundingClientRect:()=>box({left:40,top:70,right:240,bottom:170})}]};
 const stage={parentElement:surface,clientLeft:0,clientTop:0,clientWidth:700,clientHeight:210,focus:noop,getBoundingClientRect:()=>box({left:0,top:0,right:700,bottom:210}),closest:(s:string)=>s==='.stage-column'?column:workspace,querySelector:(s:string)=>s==='.slide-render.editable'?render:null,querySelectorAll:()=>[]};
 const node={style:{} as Record<string,string>,dataset:{} as Record<string,string>,contains:()=>false,closest:()=>stage,getBoundingClientRect:()=>({width:288,height})};
 class Observer{observe(){}disconnect(){}}
 const win={addEventListener:noop,removeEventListener:noop,visualViewport:{offsetLeft:0,offsetTop:0,width:zeroSlot?700:320,height:viewportBottom,addEventListener:noop,removeEventListener:noop}};
 const runtime=moduleWith({window:win,document:{activeElement:null,addEventListener:noop,removeEventListener:noop},innerWidth:win.visualViewport.width,innerHeight:viewportBottom,ResizeObserver:Observer,MutationObserver:Observer,requestAnimationFrame:(fn:()=>void)=>{scheduled.callback=fn;return 1;},cancelAnimationFrame:noop,getComputedStyle:()=>({position:'static',getPropertyValue:()=> '66'}),matchMedia:()=>({matches:true})});
 const mounted=runtime.selectionToolbar(node,{ids:['selected'],editingId:'',scale:1,docked:true});scheduled.callback?.();return {node,mounted};
}
test('the real lazy layout action shows the65px mobile toolbar and retains desktop zero-slot fallback',()=>{
 const mobile=actionFixture();assert.equal(mobile.node.style.visibility,'visible');assert.equal(mobile.node.dataset.placement,'dock');assert.equal(mobile.node.style.top,'214px');mobile.mounted.destroy();
 const desktop=actionFixture({zeroSlot:true});assert.equal(desktop.node.style.visibility,'visible');assert.equal(desktop.node.style.left,'206px');assert.equal(desktop.node.style.top,'218px');desktop.mounted.destroy();
});
test('the real lazy action still hides an over-tall toolbar or a viewport-clipped footer row',()=>{
 for(const options of [{height:80},{viewportBottom:270}]){const fixture=actionFixture(options);assert.equal(fixture.node.style.visibility,'hidden');fixture.mounted.destroy();}
});
