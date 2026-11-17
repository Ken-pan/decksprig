import test from 'node:test';
import assert from 'node:assert/strict';
import {captureFigma,serializeForDeck} from '../plugins/figma-export/capture';
import {importFigma} from '../src/importers/figma';
import {nativeTableImage,tableLayoutFingerprint} from '../src/core/native-table-layout';
import {prepareNativeTable,writeNativeTable,serializeNativeTable} from '../plugins/figma-export/table';
import {applyDeckToFigma} from '../plugins/figma-export/native';
import {tableHost} from './helpers/figma-table-host';
import {applyOperations} from '../src/core/operations';
import {blankSlide,newDeck,element} from '../src/core/model';
import {changeTableAxis} from '../src/core/table-structure';
import {tableTabNavigation} from '../src/core/table-keyboard';
import {prepareMergedTableCopy,mergedTableCopyOperations} from '../src/core/table-merge-copy';
import {mergeTableRange} from '../src/core/table-structure';
import {readLayerTable} from '../plugins/figma-export/layer-table';

function fixture(){
 const font={family:'Inter',style:'Medium'},fill=[{type:'SOLID',color:{r:1,g:1,b:1}}];
 const cells=[['Metric','Value'],['中文🙂','123.45']].map(row=>row.map(characters=>({width:192,height:64,fills:fill,text:{characters,fontName:font,fontSize:16,fills:[],textDecoration:'NONE',textAlignVertical:'CENTER',lineHeight:{unit:'PERCENT',value:150},letterSpacing:{unit:'PIXELS',value:0},textAlignHorizontal:'LEFT',getStyledTextSegments(){return this.characters?[{start:0,end:this.characters.length,fontName:this.fontName,fontSize:this.fontSize,fontWeight:this.fontName.style==='Bold'?700:this.fontName.style==='Regular'?400:500,textDecoration:this.textDecoration,fills:this.fills,lineHeight:this.lineHeight,letterSpacing:this.letterSpacing}]:[];},insertCharacters(start:number,value:string){this.characters=this.characters.slice(0,start)+value+this.characters.slice(start);},deleteCharacters(start:number,end:number){this.characters=this.characters.slice(0,start)+this.characters.slice(end);}}})));
 const table:any={id:'table',name:'Native table',type:'TABLE',numRows:2,numColumns:2,width:384,height:128,relativeTransform:[[1,0,100],[0,1,100]],absoluteTransform:[[1,0,100],[0,1,100]],absoluteBoundingBox:{x:100,y:100,width:384,height:128},opacity:1,fills:fill,cellAt:(r:number,c:number)=>cells[r][c],resizeRow(r:number,h:number){for(const cell of cells[r])cell.height=h;table.height=cells.reduce((sum,row)=>sum+row[0].height,0);table.absoluteBoundingBox.height=table.height;},resizeColumn(c:number,w:number){for(const row of cells)row[c].width=w;table.width=cells[0].reduce((sum,cell)=>sum+cell.width,0);table.absoluteBoundingBox.width=table.width;},exportAsync:async()=>new Uint8Array([1,2,3]),getPluginData:()=>'',setPluginData(){},motion:{exit:'fade'},children:[]};
 Object.defineProperty(table,'absoluteRenderBounds',{configurable:true,get(){throw Error('Not a TABLE property');}});
 // Native TABLE does not advertise this property; code must guard before access.
 const guarded=new Proxy(table,{has:(target,key)=>key==='absoluteRenderBounds'?false:Reflect.has(target,key)});
 const slide:any={id:'slide',name:'Table fixture',type:'SLIDE',width:1920,height:1080,absoluteBoundingBox:{x:0,y:0,width:1920,height:1080},absoluteTransform:[[1,0,0],[0,1,0]],relativeTransform:[[1,0,0],[0,1,0]],fills:[],children:[guarded],exportAsync:async()=>new Uint8Array([1,2,3]),getPluginData:()=>'',setPluginData(){},getSlideTransition:()=>({style:'NONE',duration:0,curve:'EASE_OUT',timing:{type:'ON_CLICK'}})};guarded.parent=slide;
 const figma:any={editorType:'slides',fileKey:'file',root:{name:'Table fixture'},currentPage:{children:[slide]},base64Encode:(v:Uint8Array)=>Buffer.from(v).toString('base64'),loadFontAsync:async()=>{},listAvailableFontsAsync:async()=>['Regular','Medium','Semi Bold','Bold'].map(style=>({fontName:{family:'Inter',style}})),getSlideGrid:()=>[[slide]],commitUndo(){}};
 return {table:guarded,slide,figma,cells};
}
function structuralFixture(){
 const env=fixture(),{table,cells}=env;let id=0;const calls:any[]=[];
 for(const row of cells)for(const cell of row){Object.assign(cell,{id:`cell-${++id}`});Object.assign(cell.text,{id:`text-${id}`,unknownNativeStyle:{axes:[.2,.8]}});}
 const fresh=():any=>{const cell=cells[0][0];return {...cell,id:`cell-${++id}`,text:{...cell.text,id:`text-${id}`,characters:'Native inherited text',fontName:{family:'Inherited face',style:'Bold'},fontSize:99,textDecoration:'UNDERLINE',fills:[{type:'GRADIENT_LINEAR'}],unknownNativeStyle:undefined}};};
 const size=()=>{table.width=cells[0].reduce((n,c)=>n+c.width,0);table.height=cells.reduce((n,row)=>n+row[0].height,0);Object.assign(table.absoluteBoundingBox,{width:table.width,height:table.height});};
 table.insertRow=(index:number)=>{calls.push(['insertRow',index]);cells.splice(index,0,Array.from({length:table.numColumns},fresh));table.numRows++;size();};
 table.removeRow=(index:number)=>{calls.push(['removeRow',index]);cells.splice(index,1);table.numRows--;size();};
 table.insertColumn=(index:number)=>{calls.push(['insertColumn',index]);for(const row of cells)row.splice(index,0,fresh());table.numColumns++;size();};
 table.removeColumn=(index:number)=>{calls.push(['removeColumn',index]);for(const row of cells)row.splice(index,1);table.numColumns--;size();};
 const resizeRow=table.resizeRow,resizeColumn=table.resizeColumn;table.resizeRow=(r:number,h:number)=>{resizeRow(r,h);size();};table.resizeColumn=(c:number,w:number)=>{resizeColumn(c,w);size();};return {...env,calls};
}
function recoverableFixture(){const env=structuralFixture();for(const cell of env.cells[1]){cell.text.fills=[{type:'SOLID',color:{r:30/255,g:30/255,b:30/255}}]as any;cell.text.lineHeight={unit:'PIXELS',value:24};}return env;}
function recoverableColumnFixture(){const env=structuralFixture();for(const row of env.cells){row[1].text.fills=[{type:'SOLID',color:{r:30/255,g:30/255,b:30/255}}]as any;row[1].text.lineHeight={unit:'PIXELS',value:24};}return env;}
function nativeCopyFixture(){
 const env=structuralFixture(),{figma,slide,table,cells}=env,clones:any[]=[],cloneCalls:string[]=[],data=new Map<any,Record<string,string>>();let serial=0;
 const value=(v:any):any=>Array.isArray(v)?v.map(value):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,v])=>[k,value(v)])):v;
 const tags=(n:any,initial:Record<string,string>={})=>{const record={...initial};data.set(n,record);n.getPluginData=(key:string)=>record[key]??'';n.setPluginData=(key:string,v:string)=>{record[key]=v;};};tags(table);tags(slide);
 slide.appendChild=function(n:any){n.remove?.();n.parent=this;this.children.push(n);};slide.insertChild=function(i:number,n:any){n.remove?.();n.parent=this;this.children.splice(i,0,n);};
 const clone=(source:any,sourceCells:any[][]):any=>{cloneCalls.push(source.id);const id=`native-copy-${++serial}`,copyCells=sourceCells.map((row,r)=>row.map((cell,c)=>({...value(cell),id:`${id}-cell-${r}-${c}`,text:{...value(cell.text),id:`${id}-text-${r}-${c}`}}))),skip=new Set(['parent','children','getPluginData','setPluginData','cellAt','resizeRow','resizeColumn','clone','remove']),n:any=Object.fromEntries(Object.entries(source).filter(([key])=>!skip.has(key)).map(([key,v])=>[key,value(v)]));n.id=id;n.children=[];tags(n,data.get(source));n.cellAt=(r:number,c:number)=>copyCells[r][c];n.remove=()=>{if(n.parent)n.parent.children=n.parent.children.filter((v:any)=>v!==n);n.parent=undefined;};const size=()=>{n.width=copyCells[0].reduce((w,c)=>w+c.width,0);n.height=copyCells.reduce((h,row)=>h+row[0].height,0);n.absoluteBoundingBox={...n.absoluteBoundingBox,width:n.width,height:n.height};};n.resizeRow=(r:number,h:number)=>{for(const c of copyCells[r])c.height=h;size();};n.resizeColumn=(c:number,w:number)=>{for(const row of copyCells)row[c].width=w;size();};n.clone=()=>clone(n,copyCells);n.parent=figma.currentPage;figma.currentPage.children.push(n);clones.push(n);return n;};table.clone=()=>clone(table,cells);return {...env,clones,cloneCalls};
}
async function namedStyleColumnFixture(italic:boolean,fontStyle:string){
 const env=structuralFixture(),{figma,table,slide,cells}=env;table.resizeColumn(0,144);table.resizeColumn(1,240);for(const cell of cells.flat())delete(cell.text as any).textAlignVertical;cells[1][1].text.textDecoration='STRIKETHROUGH';const catalog=figma.listAvailableFontsAsync;figma.listAvailableFontsAsync=async()=>[...await catalog(),{fontName:{family:'Inter',style:'Medium Italic'}}];
 const before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),e=after.slides[0].elements[0];Object.assign(e,changeTableAxis(e,'column',2,1,true));e.w=624;e.cells![0][2]='C1';e.cells![1][2]='C2';e.tableStyle!.cellStyles=[...e.tableStyle!.cellStyles??[],{row:0,column:2,underline:true,italic},{row:1,column:2,italic}];await applyDeckToFigma(figma,after,before);
 const unknownReads:PropertyKey[]=[];for(const row of cells){const text:any=row[2].text,segments=text.getStyledTextSegments.bind(text);text.getStyledTextSegments=(fields:string[]=[])=>segments().map((s:any)=>({...s,...(fields.includes('fontStyle')?{fontStyle}:{})}));row[2].text=new Proxy(text,{get(target,key,receiver){if(!(key in target)){unknownReads.push(key);throw Error(`node.${String(key)}: no such property on TEXT`);}return Reflect.get(target,key,receiver);}});}
 return {...env,before,after,unknownReads};
}
test('opaque tables capture editable cells, cache invalidation and native pixels without unsupported getters',async()=>{
 const {table,slide,figma,cells}=fixture(),cache=new Map();const bundle=await captureFigma(figma,[slide],true,cache);
 assert.equal(bundle.slides[0].children[0].children,undefined);assert.equal(bundle.slides[0].children[0].table.cells[1][0].characters,'中文🙂');assert(bundle.nodeRenders.table);
 const deck=importFigma(bundle),e=deck.slides[0].elements.find(e=>e.type==='table')!;assert(e);assert.equal(nativeTableImage(e),bundle.nodeRenders.table);
 const moved=applyOperations(deck,[{op:'update_element',slideId:deck.slides[0].id,elementId:e.id,patch:{x:180}}],deck.revision);assert.equal(nativeTableImage(moved.slides[0].elements.find(x=>x.id===e.id)!),nativeTableImage(e));
 assert.equal(nativeTableImage({...e,cells:[['Changed','Value'],['中文🙂','123.45']]}),undefined);assert.equal(nativeTableImage({...e,underline:true}),undefined);assert.equal(nativeTableImage({...e,tableStyle:{...e.tableStyle,padding:99}}),undefined);
 cells[1][0].text.characters='Incoming native edit';const next=await captureFigma(figma,[slide],true,cache);assert.equal(next.slides[0].children[0].table.cells[1][0].characters,'Incoming native edit');assert.notEqual(JSON.stringify(bundle.slides),JSON.stringify(next.slides));
 table.numColumns=21;assert.equal(serializeForDeck(table).table,undefined);
});
test('cell changes preserve native identity, styles, object animation and blank/unicode content',async()=>{
 const {table,slide,figma,cells}=fixture(),before=importFigma(await captureFigma(figma,[slide])),e=before.slides[0].elements[0],after=structuredClone(before),changed=after.slides[0].elements[0];changed.cells![1][0]='新🙂\nSecond line';changed.cells![0][1]='';
 const style=cells[1][0].text.fontName,motion=table.motion;await applyDeckToFigma(figma,after,before);
 assert.equal(cells[1][0].text.characters,'新🙂\nSecond line');assert.equal(cells[0][1].text.characters,'');assert.equal(cells[1][0].text.fontName,style);assert.equal(table.motion,motion);assert.equal(slide.children[0],table);
 await prepareNativeTable(figma,table,e,changed);writeNativeTable(table,e);assert.equal(cells[0][1].text.characters,'Value');assert.equal(cells[1][0].text.characters,'中文🙂');
});
test('unsupported native table changes reject before touching any linked content',async()=>{
 const {table,slide,figma,cells}=fixture(),before=importFigma(await captureFigma(figma,[slide]));
 for(const patch of [{cells:[['Only one row','']]},{rotation:20},{opacity:0},{hidden:true},{blendMode:'multiply'},{shadow:{color:'#000000',opacity:.5,blur:8,x:2,y:2}},{tableStyle:{...before.slides[0].elements[0].tableStyle,padding:40}}]){
  const after=structuredClone(before);Object.assign(after.slides[0].elements[0],patch);await assert.rejects(()=>applyDeckToFigma(figma,after,before),/other table properties|unambiguous final/);assert.equal(cells[0][0].text.characters,'Metric');
 }
 const e=before.slides[0].elements[0];assert.equal(tableLayoutFingerprint(e),e.nativeTableLayout?.fingerprint);await assert.rejects(()=>prepareNativeTable(figma,undefined,e),/No content was changed/);assert.equal(table.id,'table');
});

for(const axis of ['row','column'] as const)test(`native trailing ${axis} append and Undo keep original cells and explicitly format the new cells`,async()=>{
 const {figma,table,slide,cells,calls}=structuralFixture(),before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),e=after.slides[0].elements[0],original=cells.map(row=>[...row]),motion=table.motion;
 Object.assign(e,changeTableAxis(e,axis,2,1,true));if(axis==='row')assert.equal(e.h,192);else{e.w=576;assert.equal(e.h,128);}
 const newStyles=axis==='row'?[{row:2,column:0},{row:2,column:1}]:[{row:0,column:2},{row:1,column:2}];e.tableStyle!.cellStyles=[...e.tableStyle!.cellStyles??[],...newStyles.map(s=>({...s,fontWeight:700,fontSize:18,strikethrough:true,underline:false,color:'#123456',fill:'#fff4cc',align:'right' as const,verticalAlign:'bottom' as const}))];
 await applyDeckToFigma(figma,after,before);assert.deepEqual(calls,[[axis==='row'?'insertRow':'insertColumn',2]]);assert.equal(table.motion,motion);assert.equal(table.id,'table');assert.equal(slide.children[0],table);
 for(let r=0;r<2;r++)for(let c=0;c<2;c++){assert.equal(cells[r][c],original[r][c]);assert.equal((cells[r][c].text as any).unknownNativeStyle,(original[r][c].text as any).unknownNativeStyle);assert.equal(cells[r][c].text.characters,before.slides[0].elements[0].cells![r][c]);}
 for(const {row,column}of newStyles){const cell=cells[row][column];assert.equal(cell.text.characters,'');assert.deepEqual(cell.text.fontName,{family:'Inter',style:'Bold'});assert.equal(cell.text.fontSize,18);assert.equal(cell.text.textDecoration,'STRIKETHROUGH');assert.equal(cell.text.textAlignHorizontal,'RIGHT');assert.equal(cell.text.textAlignVertical,'BOTTOM');assert.deepEqual(cell.text.fills,[{type:'SOLID',color:{r:18/255,g:52/255,b:86/255}}]);assert.equal(cell.fills[0].type,'SOLID');assert.equal(cell.text.lineHeight.value,27);assert.equal(cell.text.letterSpacing.value,0);}
 const round=importFigma(await captureFigma(figma,[slide])).slides[0].elements[0];assert.deepEqual(round.cells,e.cells);assert.equal(round.tableStyle!.cellStyles!.find(s=>s.row===newStyles[0].row&&s.column===newStyles[0].column)?.strikethrough,true);
 await applyDeckToFigma(figma,before,after);assert.deepEqual(calls.at(-1),[axis==='row'?'removeRow':'removeColumn',2]);assert.equal(table.numRows,2);assert.equal(table.numColumns,2);for(let r=0;r<2;r++)for(let c=0;c<2;c++)assert.equal(cells[r][c],original[r][c]);
});

test('middle, repeated blank, merged and changed-prefix structural edits reject before native insertion',async()=>{
 for(const kind of ['middle','ambiguous','merged','prefix','stale','dual']as const){const {figma,slide,cells,calls}=structuralFixture();if(kind==='ambiguous')for(const cell of cells[1])cell.text.characters='';const before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),e=after.slides[0].elements[0];Object.assign(e,changeTableAxis(e,'row',kind==='middle'?1:2,1,true));if(kind==='dual')Object.assign(e,changeTableAxis(e,'column',2,1,true));e.h=192;
  if(kind==='merged')e.tableStyle!.merges=[{row:0,column:0,rowSpan:1,columnSpan:2}];if(kind==='prefix')e.cells![0][0]='Changed prefix';if(kind==='stale')cells[0][0].text.characters='Native concurrent edit';
  await assert.rejects(()=>applyDeckToFigma(figma,after,before),/unambiguous final/);assert.deepEqual(calls,[]);assert.equal(cells.length,2);
 }
});

test('append font and cell-capability failures occur before structural mutation',async()=>{
 for(const kind of ['font','cell-capability','insert-capability']as const){const {figma,slide,table,cells,calls}=structuralFixture(),before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),e=after.slides[0].elements[0];Object.assign(e,changeTableAxis(e,'row',2,1,true));e.h=192;
  if(kind==='font')e.tableStyle!.cellStyles=[{row:2,column:0,fontFamily:'Unavailable font'}];if(kind==='cell-capability')delete(cells[1][1].text as any).textDecoration;if(kind==='insert-capability')delete table.insertRow;
  await assert.rejects(()=>applyDeckToFigma(figma,after,before),/Install Unavailable font|other table properties|unambiguous final/);assert.deepEqual(calls,[]);assert.equal(table.numRows,2);
 }
});

test('native inline last-cell draft plus Tab append and Undo keep the edited cell identity and unknown styling',async()=>{
 const {figma,table,slide,cells,calls}=structuralFixture(),before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),e=after.slides[0].elements[0],last=cells[1][1].text,axes=(last as any).unknownNativeStyle,font=last.fontName,next=tableTabNavigation(e,{row:1,column:1},false,'123.45 中文🙂');assert.equal(next.kind,'append');if(next.kind!=='append')return;Object.assign(e,next.patch);
 await applyDeckToFigma(figma,after,before);assert.equal(table.numRows,3);assert.equal(e.h,192);assert.equal(cells[1][1].text,last);assert.equal(last.characters,'123.45 中文🙂');assert.equal(last.fontName,font);assert.equal((last as any).unknownNativeStyle,axes);assert.deepEqual(calls,[['insertRow',2]]);
 await applyDeckToFigma(figma,before,after);assert.equal(table.numRows,2);assert.equal(cells[1][1].text,last);assert.equal(last.characters,'123.45');assert.equal(last.fontName,font);assert.equal((last as any).unknownNativeStyle,axes);assert.deepEqual(calls.at(-1),['removeRow',2]);
});

test('native append without a vertical-alignment API preserves inherited native alignment and existing cell references',async()=>{
 const {figma,table,slide,cells,calls}=structuralFixture(),inherited=Object.freeze({nativeAlignment:'retained by host'});for(const cell of cells.flat()){delete(cell.text as any).textAlignVertical;(cell.text as any).nativeVerticalAlignment=inherited;}
 const before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),e=after.slides[0].elements[0],prefix=cells.map(row=>[...row]),next=tableTabNavigation(e,{row:1,column:1},false,'123.45 中文🙂');assert.equal(next.kind,'append');if(next.kind!=='append')return;Object.assign(e,next.patch);
 await applyDeckToFigma(figma,after,before);assert.equal(table.numRows,3);assert.deepEqual(calls,[['insertRow',2]]);assert.equal(cells[1][1].text.characters,'123.45 中文🙂');
 for(let r=0;r<3;r++)for(let c=0;c<2;c++){assert.equal('textAlignVertical'in cells[r][c].text,false);assert.equal((cells[r][c].text as any).nativeVerticalAlignment,inherited);if(r<2)assert.equal(cells[r][c],prefix[r][c]);}
 await applyDeckToFigma(figma,before,after);assert.equal(table.numRows,2);assert.equal(cells[1][1],prefix[1][1]);assert.equal((cells[1][1].text as any).nativeVerticalAlignment,inherited);
});

test('empty native cell proxies reject unknown getters while draft-append inverse Undo restores the baseline',async()=>{
 const {figma,table,slide,cells}=structuralFixture();for(const cell of cells.flat())delete(cell.text as any).textAlignVertical;cells[1][1].text.textDecoration='STRIKETHROUGH';const before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),e=after.slides[0].elements[0],prefix=cells.map(row=>[...row]),next=tableTabNavigation(e,{row:1,column:1},false,'123.45 revised 中文🙂');assert.equal(next.kind,'append');if(next.kind!=='append')return;Object.assign(e,next.patch);await applyDeckToFigma(figma,after,before);assert.equal(table.numRows,3);
 const unknownReads:PropertyKey[]=[];for(const cell of cells[2]){Object.assign(cell.text,{fontWeight:500});cell.text=new Proxy(cell.text,{get(target,key,receiver){if(!(key in target)){unknownReads.push(key);throw Error(`node.${String(key)}: no such property on TEXT`);}return Reflect.get(target,key,receiver);}});}
 await applyDeckToFigma(figma,before,after);assert.equal(table.numRows,2);assert.deepEqual(unknownReads,[]);for(let r=0;r<2;r++)for(let c=0;c<2;c++){assert.equal(cells[r][c],prefix[r][c]);assert.equal(cells[r][c].text.characters,before.slides[0].elements[0].cells![r][c]);}assert.equal(cells[1][1].text.textDecoration,'STRIKETHROUGH');
});

test('authored new-cell or whole-table vertical alignment needs a native API and rejects before structural or content writes',async()=>{
 for(const kind of ['top','middle','whole']as const){const {figma,table,slide,cells,calls}=structuralFixture();for(const cell of cells.flat())delete(cell.text as any).textAlignVertical;const before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),e=after.slides[0].elements[0];
  if(kind==='whole')e.tableStyle!.verticalAlign='top';else{Object.assign(e,changeTableAxis(e,'row',2,1,true));e.tableStyle!.cellStyles=[...e.tableStyle!.cellStyles??[],{row:2,column:0,verticalAlign:kind}];}
  let undo=0;figma.triggerUndo=()=>undo++;await assert.rejects(()=>applyDeckToFigma(figma,after,before),/other table properties/);assert.equal(undo,0);assert.equal(table.numRows,2);assert.deepEqual(calls,[]);assert.equal(cells[1][1].text.characters,'123.45');
  assert.throws(()=>writeNativeTable(table,e,new Map(),before.slides[0].elements[0]),/other table properties/);assert.deepEqual(calls,[]);
 }
});

test('a uniform projected native final row can be deleted and its content and formatting rebuilt by app Undo',async()=>{
 const {figma,table,slide,cells,calls}=recoverableFixture(),before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),e=after.slides[0].elements[0],prefix=[...cells[0]];Object.assign(e,changeTableAxis(e,'row',1,1,false));await applyDeckToFigma(figma,after,before);assert.equal(table.numRows,1);assert.deepEqual(calls,[['removeRow',1]]);assert.equal(cells[0][0],prefix[0]);
 await applyDeckToFigma(figma,before,after);assert.equal(table.numRows,2);assert.equal(cells[0][0],prefix[0]);assert.deepEqual(cells.map(row=>row.map(cell=>cell.text.characters)),before.slides[0].elements[0].cells);assert.equal(cells[1][0].text.fontName.style,'Medium');assert.equal(cells[1][0].text.lineHeight.unit,'PIXELS');assert.equal(cells[1][0].text.lineHeight.value,24);assert.equal((cells[1][0].text.fills as {type:string}[])[0].type,'SOLID');
});

test('native deletion rejects rich ranges, all hyperlink scopes and unprojected styles before any content or structure mutation',async()=>{
 for(const kind of ['mixed','link','range-link','gradient','transparent','style-binding','font-axes','opentype','paragraph','auto-leading']as const){
  const {figma,table,slide,cells,calls}=recoverableFixture(),text:any=cells[1][0].text,segments=text.getStyledTextSegments.bind(text);
  if(kind==='mixed')text.getStyledTextSegments=(fields:string[])=>{const first=segments(fields)[0];return [{...first,start:0,end:1},{...first,start:1,end:text.characters.length,fontSize:24}];};
  if(kind==='link')text.hyperlink={type:'URL',value:'https://example.com/native-link'};
  if(kind==='range-link'){text.hyperlink=null;text.getStyledTextSegments=(fields:string[])=>segments(fields).map((s:any)=>({...s,...(fields.includes('hyperlink')?{hyperlink:{type:'URL',value:'https://example.com/range-link'}}:{})}));}
  if(kind==='gradient')text.fills=[{type:'GRADIENT_LINEAR'}];if(kind==='transparent')cells[1][0].fills=[{type:'SOLID',color:{r:1,g:1,b:1},opacity:.5}]as any;if(kind==='style-binding')text.textStyleId='native-text-style';if(kind==='font-axes')text.fontName={...text.fontName,variationSettings:{wght:500}};if(kind==='opentype')text.openTypeFeatures={LIGA:false};if(kind==='paragraph')text.paragraphSpacing=12;if(kind==='auto-leading')text.lineHeight={unit:'AUTO'};
  const before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),e=after.slides[0].elements[0],nativeState=cells.map(row=>row.map(cell=>({characters:cell.text.characters,fontName:cell.text.fontName,fontSize:cell.text.fontSize,fills:cell.fills,textFills:cell.text.fills})));Object.assign(e,changeTableAxis(e,'row',1,1,false));let undos=0;figma.triggerUndo=()=>undos++;
  await assert.rejects(()=>applyDeckToFigma(figma,after,before),/local Undo cannot restore/);assert.equal(table.numRows,2);assert.deepEqual(calls,[]);assert.equal(undos,0);assert.deepEqual(cells.map(row=>row.map(cell=>({characters:cell.text.characters,fontName:cell.text.fontName,fontSize:cell.text.fontSize,fills:cell.fills,textFills:cell.text.fills}))),nativeState);
 }
});

test('native trailing-column append preserves variable rich prefix data, grows by the trailing width and inversely restores geometry',async()=>{
 const {figma,table,slide,cells,calls}=structuralFixture(),text=cells[1][0].text,segments=text.getStyledTextSegments.bind(text);table.resizeColumn(0,144);table.resizeColumn(1,240);text.getStyledTextSegments=()=>{const s=segments()[0];return [{...s,start:0,end:1,fontName:{...s.fontName,variationSettings:{wght:500,wdth:88}},hyperlink:{type:'URL',value:'https://example.com/native-range'}},{...s,start:1,end:text.characters.length,textDecoration:'STRIKETHROUGH',unmodeledNativeData:{axis:7}}];};
 const before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),e=after.slides[0].elements[0],prefix=cells.map(row=>row.map(cell=>({cell,text:cell.text,font:cell.text.fontName,leading:cell.text.lineHeight,paints:cell.text.fills}))),rich=JSON.stringify(text.getStyledTextSegments());Object.assign(e,changeTableAxis(e,'column',2,1,true));e.w=624;
 await applyDeckToFigma(figma,after,before);assert.equal(table.numColumns,3);assert.equal(table.width,624);assert.equal(table.height,128);assert.deepEqual(cells[0].map(c=>c.width),[144,240,240]);assert.deepEqual(calls,[['insertColumn',2]]);assert.equal(JSON.stringify(text.getStyledTextSegments()),rich);
 for(let r=0;r<2;r++)for(let c=0;c<2;c++){const saved=prefix[r][c];assert.equal(cells[r][c],saved.cell);assert.equal(cells[r][c].text,saved.text);assert.equal(cells[r][c].text.fontName,saved.font);assert.equal(cells[r][c].text.lineHeight,saved.leading);assert.equal(cells[r][c].text.fills,saved.paints);}
 await applyDeckToFigma(figma,before,after);assert.equal(table.numColumns,2);assert.equal(table.width,384);assert.equal(table.height,128);assert.equal(JSON.stringify(text.getStyledTextSegments()),rich);assert.deepEqual(calls.at(-1),['removeColumn',2]);
});

test('a supported uniform native final column can be dropped and its nonblank cells rebuilt by inverse application',async()=>{
 const {figma,table,slide,cells,calls}=recoverableColumnFixture(),before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),e=after.slides[0].elements[0],prefix=cells.map(row=>row[0]);Object.assign(e,changeTableAxis(e,'column',1,1,false));e.w=192;
 await applyDeckToFigma(figma,after,before);assert.equal(table.numColumns,1);assert.equal(table.width,192);assert.deepEqual(calls,[['removeColumn',1]]);for(let r=0;r<2;r++)assert.equal(cells[r][0],prefix[r]);
 await applyDeckToFigma(figma,before,after);assert.equal(table.numColumns,2);assert.equal(table.width,384);assert.equal(table.height,128);assert.deepEqual(cells.map(row=>row.map(c=>c.text.characters)),before.slides[0].elements[0].cells);for(let r=0;r<2;r++){assert.equal(cells[r][0],prefix[r]);assert.equal(cells[r][1].text.fontName.style,'Medium');assert.equal(cells[r][1].text.lineHeight.unit,'PIXELS');assert.equal(cells[r][1].text.lineHeight.value,24);}assert.deepEqual(calls.at(-1),['insertColumn',1]);
});

test('real-host named MEDIUM and MEDIUM_ITALIC segments remain recoverable without reading unknown TEXT getters',async()=>{
 for(const [italic,fontStyle]of [[false,'MEDIUM'],[true,'MEDIUM_ITALIC']]as const){const {figma,table,cells,calls,before,after,unknownReads}=await namedStyleColumnFixture(italic,fontStyle),prefix=cells.map(row=>row.slice(0,2));assert.equal(table.numColumns,3);assert.equal(cells[0][2].text.textDecoration,'UNDERLINE');assert.equal(cells[1][2].text.textDecoration,'NONE');await applyDeckToFigma(figma,before,after);assert.equal(table.numColumns,2);assert.equal(table.width,384);assert.equal(table.height,128);assert.deepEqual(unknownReads,[]);assert.deepEqual(calls.at(-1),['removeColumn',2]);for(let r=0;r<2;r++)for(let c=0;c<2;c++)assert.equal(cells[r][c],prefix[r][c]);assert.equal(cells[1][1].text.textDecoration,'STRIKETHROUGH');}
});

test('unknown or inconsistent native named font styles reject column inverse without changing the native grid',async()=>{
 for(const [italic,fontStyle]of [[false,'UNKNOWN_NATIVE_STYLE'],[false,'MEDIUM_ITALIC'],[true,'MEDIUM'],[true,'REGULAR']]as const){const {figma,table,cells,calls,before,after,unknownReads}=await namedStyleColumnFixture(italic,fontStyle),last=cells.map(row=>row[2]);let undos=0;figma.triggerUndo=()=>undos++;await assert.rejects(()=>applyDeckToFigma(figma,before,after),/local Undo cannot restore/);assert.equal(table.numColumns,3);assert.equal(table.width,624);assert.equal(undos,0);assert.deepEqual(calls,[['insertColumn',2]]);assert.deepEqual(unknownReads,[]);for(let r=0;r<2;r++)assert.equal(cells[r][2],last[r]);}
});

test('middle, ambiguous, changed-prefix and stale native column edits reject before structural writes',async()=>{
 for(const kind of ['middle','ambiguous','content','last-draft','style','stale','merged','dual']as const){const {figma,table,slide,cells,calls}=structuralFixture();if(kind==='ambiguous')for(const row of cells)row[1].text.characters='';const before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),e=after.slides[0].elements[0];Object.assign(e,changeTableAxis(e,'column',kind==='middle'?1:2,1,true));e.w=576;
  if(kind==='content')e.cells![0][0]='Changed';if(kind==='last-draft')e.cells![1][1]='Changed last cell';if(kind==='style')e.tableStyle!.cellStyles=[{row:0,column:0,color:'#ff0000'}];if(kind==='stale')cells[0][0].text.characters='Native concurrent edit';if(kind==='merged')e.tableStyle!.merges=[{row:0,column:0,rowSpan:1,columnSpan:2}];if(kind==='dual')Object.assign(e,changeTableAxis(e,'row',2,1,true));
  await assert.rejects(()=>applyDeckToFigma(figma,after,before),/unambiguous final/);assert.deepEqual(calls,[]);assert.equal(table.numColumns,2);assert.equal(table.numRows,2);
 }
});

test('native column insertion/removal capabilities and new-cell fonts are checked before any mutation',async()=>{
 for(const kind of ['insert','remove','font','format-capability']as const){const env=kind==='remove'?recoverableColumnFixture():structuralFixture(),{figma,table,slide,cells,calls}=env,before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),e=after.slides[0].elements[0];Object.assign(e,changeTableAxis(e,'column',kind==='remove'?1:2,1,kind!=='remove'));e.w=kind==='remove'?192:576;
  if(kind==='insert')delete table.insertColumn;if(kind==='remove')delete table.removeColumn;if(kind==='font')e.tableStyle!.cellStyles=[{row:0,column:2,fontFamily:'Unavailable column font'}];if(kind==='format-capability')delete(cells[1][1].text as any).textDecoration;
  await assert.rejects(()=>applyDeckToFigma(figma,after,before),/unambiguous final|Install Unavailable column font|other table properties/);assert.deepEqual(calls,[]);assert.equal(table.numColumns,2);
 }
 const {figma,table,slide,calls}=structuralFixture(),before=importFigma(await captureFigma(figma,[slide])),e=structuredClone(before.slides[0].elements[0]);Object.assign(e,changeTableAxis(e,'column',2,1,true));e.w=576;delete table.insertColumn;const reads:PropertyKey[]=[],proxy=new Proxy(table,{get(target,key,receiver){if(!(key in target)){reads.push(key);throw Error(`Unknown TABLE getter ${String(key)}`);}return Reflect.get(target,key,receiver);}});await assert.rejects(()=>prepareNativeTable(figma,proxy,e,before.slides[0].elements[0]),/unambiguous final/);assert.deepEqual(reads,[]);assert.deepEqual(calls,[]);
});

test('native new-column vertical alignment keeps inheritance when unavailable and rejects explicit requests before mutation',async()=>{
 for(const explicit of [undefined,'top','middle']as const){const {figma,table,slide,cells,calls}=structuralFixture(),inherited=Object.freeze({native:'inherited alignment'});for(const cell of cells.flat()){delete(cell.text as any).textAlignVertical;(cell.text as any).nativeVerticalAlignment=inherited;}const before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),e=after.slides[0].elements[0];Object.assign(e,changeTableAxis(e,'column',2,1,true));e.w=576;if(explicit)e.tableStyle!.cellStyles=[{row:0,column:2,verticalAlign:explicit}];
  if(explicit){await assert.rejects(()=>applyDeckToFigma(figma,after,before),/other table properties/);assert.deepEqual(calls,[]);assert.equal(table.numColumns,2);}else{await applyDeckToFigma(figma,after,before);assert.equal(table.numColumns,3);for(const row of cells){assert.equal('textAlignVertical'in row[2].text,false);assert.equal((row[2].text as any).nativeVerticalAlignment,inherited);}await applyDeckToFigma(figma,before,after);assert.equal(table.numColumns,2);}
 }
});

test('native last-column deletion refuses rich, linked and unprojected cell formatting before mutation',async()=>{
 for(const kind of ['mixed','link','range-link','gradient','transparent','font-axes','paragraph','auto-leading']as const){const {figma,table,slide,cells,calls}=recoverableColumnFixture(),text:any=cells[1][1].text,segments=text.getStyledTextSegments.bind(text);if(kind==='mixed')text.getStyledTextSegments=(fields:string[])=>{const s=segments(fields)[0];return [{...s,start:0,end:1},{...s,start:1,end:text.characters.length,fontSize:24}];};if(kind==='link')text.hyperlink={type:'URL',value:'https://example.com/column'};if(kind==='range-link'){text.hyperlink=null;text.getStyledTextSegments=(fields:string[])=>segments(fields).map((s:any)=>({...s,...(fields.includes('hyperlink')?{hyperlink:{type:'URL',value:'https://example.com/range'}}:{})}));}if(kind==='gradient')text.fills=[{type:'GRADIENT_LINEAR'}];if(kind==='transparent')cells[1][1].fills=[];if(kind==='font-axes')text.fontName={...text.fontName,variationSettings:{wght:500}};if(kind==='paragraph')text.paragraphSpacing=12;if(kind==='auto-leading')text.lineHeight={unit:'AUTO'};
  const before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),e=after.slides[0].elements[0];Object.assign(e,changeTableAxis(e,'column',1,1,false));e.w=192;let undos=0;figma.triggerUndo=()=>undos++;await assert.rejects(()=>applyDeckToFigma(figma,after,before),/local Undo cannot restore/);assert.deepEqual(calls,[]);assert.equal(table.numColumns,2);assert.equal(undos,0);assert.equal(cells[1][1].text.characters,'123.45');
 }
});

test('native column mutation and sizing failures enter one classic Undo boundary and restore the original grid',async()=>{
 for(const kind of ['throw','prefix','clamp']as const){const {figma,table,slide,cells,calls}=structuralFixture(),before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),e=after.slides[0].elements[0],prefix=cells.map(row=>[...row]),insert=table.insertColumn;Object.assign(e,changeTableAxis(e,'column',2,1,true));e.w=576;let undos=0;
  table.insertColumn=(i:number)=>{insert(i);if(kind==='throw')throw Error('Injected column insertion failure');if(kind==='prefix')cells[0][0].text.characters='Unexpected API mutation';if(kind==='clamp')for(const row of cells)row[2].width=200;};if(kind==='clamp')table.resizeColumn=(c:number,w:number)=>{for(const row of cells)row[c].width=c===2?Math.max(200,w):w;};
  figma.triggerUndo=()=>{undos++;for(let r=0;r<2;r++)cells[r].splice(0,cells[r].length,...prefix[r]);cells[0][0].text.characters='Metric';table.numColumns=2;table.width=384;table.absoluteBoundingBox.width=384;};await assert.rejects(()=>applyDeckToFigma(figma,after,before),/Injected column insertion failure|could not preserve the existing cells|could not apply column/);assert.equal(undos,1);assert.equal(table.numColumns,2);assert.equal(table.width,384);assert.deepEqual(calls,[['insertColumn',2]]);for(let r=0;r<2;r++)for(let c=0;c<2;c++)assert.equal(cells[r][c],prefix[r][c]);
 }
});

test('structural failure after insertion uses one classic Undo and restores the original prefix',async()=>{
 const {figma,table,slide,cells,calls}=structuralFixture(),before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),e=after.slides[0].elements[0],insert=table.insertRow,original=cells.map(row=>[...row]);Object.assign(e,changeTableAxis(e,'row',2,1,true));e.h=192;let undo=0;
 table.insertRow=(index:number)=>{insert(index);cells[0][0].text.characters='Unexpected API side effect';};figma.triggerUndo=()=>{undo++;cells.splice(0,cells.length,...original);cells[0][0].text.characters='Metric';table.numRows=2;table.height=128;table.absoluteBoundingBox.height=128;};
 await assert.rejects(()=>applyDeckToFigma(figma,after,before),/could not preserve the existing cells/);assert.equal(undo,1);assert.deepEqual(calls,[['insertRow',2]]);assert.equal(table.numRows,2);assert.equal(cells[0][0],original[0][0]);assert.equal(cells[0][0].text.characters,'Metric');
});

test('native row and column resizing preserves cells and restores sizes with Undo',async()=>{
 const {table,slide,figma,cells}=fixture(),before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),e=after.slides[0].elements[0];
 e.w=600;e.h=180;e.tableStyle!.columnWidths=[1,2];e.tableStyle!.rowHeights=[1,2];await applyDeckToFigma(figma,after,before);
 assert.equal(cells[0][0].width,200);assert.equal(cells[0][1].width,400);assert.equal(cells[0][0].height,60);assert.equal(cells[1][0].height,120);
 await applyDeckToFigma(figma,before,after);assert.equal(cells[0][0].width,192);assert.equal(cells[0][0].height,64);assert.equal(cells[1][0].text.characters,'中文🙂');
});

test('partial native TABLE sizing weights keep the same proportions as the local table and roundtrip',async()=>{
 const {table,slide,figma,cells}=fixture(),before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),e=after.slides[0].elements[0],motion=table.motion;
 e.tableStyle!.columnWidths=[2];e.tableStyle!.rowHeights=[3];await applyDeckToFigma(figma,after,before);
 assert.deepEqual(cells[0].map(c=>c.width),[192,192]);assert.deepEqual(cells.map(row=>row[0].height),[64,64]);
 const back=importFigma(await captureFigma(figma,[slide])).slides[0].elements[0];assert.deepEqual(back.tableStyle!.columnWidths,[192,192]);assert.deepEqual(back.tableStyle!.rowHeights,[64,64]);
 assert.equal(slide.children[0],table);assert.equal(table.motion,motion);
});

test('a native TABLE copy rejects when the host cannot clone it, without silently converting or changing the original',async()=>{
 const {table,slide,figma,cells}=fixture(),before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),e=after.slides[0].elements[0];
 const copy={...structuredClone(e),id:'table-copy',x:e.x+200};copy.cells![0][0]='Copy only';after.slides[0].elements.push(copy);
 await assert.rejects(()=>applyDeckToFigma(figma,after,before),/cannot duplicate the native table/);assert.equal(cells[0][0].text.characters,'Metric');assert.equal(table.relativeTransform[0][2],100);assert.equal(slide.children.filter((n:any)=>n.type==='TABLE').length,1);assert.equal(slide.children.filter((n:any)=>n.type==='FRAME').length,0);
});

test('copying a linked TABLE creates an independent native TABLE and preserves source rich ranges and unknown animation',async()=>{
 const {figma,table,slide,cells,clones,cloneCalls}=nativeCopyFixture(),rich:any=cells[0][0].text;rich.nativeRuns=[{start:0,end:1,fontName:{family:'Inter',style:'Medium'},fontSize:16,fontWeight:500,textDecoration:'NONE',fills:[],lineHeight:{unit:'PIXELS',value:24},letterSpacing:{unit:'PIXELS',value:0},hyperlink:{type:'URL',value:'https://example.com/native'},nativeAxes:{wdth:88}},{start:1,end:rich.characters.length,fontName:{family:'Inter',style:'Regular'},fontSize:22,fontWeight:400,textDecoration:'STRIKETHROUGH',fills:[],lineHeight:{unit:'AUTO'},letterSpacing:{unit:'PERCENT',value:2}}];rich.getStyledTextSegments=function(){return this.nativeRuns;};const before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),source=after.slides[0].elements[0],copy={...structuredClone(source),id:'table-copy',name:'Native copy',x:source.x+420};copy.cells![1][1]='Copy only 中文🙂';after.slides[0].elements.push(copy);const original=JSON.stringify(serializeNativeTable(table)),motion=table.motion,runs=rich.nativeRuns;
 const result=await applyDeckToFigma(figma,after,before);assert.equal(clones.length,1);const n=clones[0];assert.equal(n.type,'TABLE');assert.equal(n.parent,slide);assert.equal(n.name,'Native copy');assert(result.createdIds.includes(n.id));assert.equal(n.cellAt(1,1).text.characters,'Copy only 中文🙂');assert.equal(n.relativeTransform[0][2],copy.x);assert.deepEqual(n.cellAt(0,0).text.nativeRuns,runs);assert.notEqual(n.cellAt(0,0).text.nativeRuns,runs);assert.deepEqual(n.motion,motion);assert.equal(table.motion,motion);assert.equal(rich.nativeRuns,runs);assert.equal(JSON.stringify(serializeNativeTable(table)),original);assert.equal(table.id,'table');assert.deepEqual(cloneCalls,['table']);assert.equal(n.getPluginData('deck-studio-id'),'table-copy');assert.equal(n.getPluginData('deck-studio-native-id'),n.id);
 const edited=structuredClone(after);edited.slides[0].elements[1].cells![1][1]='Edited duplicate';await applyDeckToFigma(figma,edited,after);assert.equal(n.cellAt(1,1).text.characters,'Edited duplicate');assert.equal(JSON.stringify(serializeNativeTable(table)),original);assert.equal(clones.length,1);
 await applyDeckToFigma(figma,before,edited);assert.equal(slide.children.includes(n),false);assert.equal(JSON.stringify(serializeNativeTable(table)),original);
});

test('a native copy snapshots the acknowledged source before the original receives same-batch edits',async()=>{
 const {figma,table,slide,cells,clones}=nativeCopyFixture(),before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),source=after.slides[0].elements[0],copy={...structuredClone(source),id:'table-copy',x:source.x+420};after.slides[0].elements.push(copy);source.cells![0][0]='Original changed after copy';source.tableStyle!.cellStyles=[{row:1,column:1,color:'#ff0000',underline:true}];
 await applyDeckToFigma(figma,after,before);const n=clones[0];assert.equal(cells[0][0].text.characters,'Original changed after copy');assert.equal(n.cellAt(0,0).text.characters,'Metric');assert.equal(cells[1][1].text.textDecoration,'UNDERLINE');assert.equal(n.cellAt(1,1).text.textDecoration,'NONE');assert.notDeepEqual(n.cellAt(1,1).text.fills,cells[1][1].text.fills);assert.equal(table.id,'table');
});

test('an explicitly sourced blank table clones native cell styling, clears only its content and preserves the source',async()=>{
 const {figma,table,slide,cells,clones}=nativeCopyFixture();cells[0][1].text.textDecoration='UNDERLINE';cells[1][1].text.textDecoration='STRIKETHROUGH';cells[1][1].fills=[{type:'SOLID',color:{r:.7,g:.96,b:.92}}];table.setPluginData('native-style-marker','retain this style');const before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),source=after.slides[0].elements[0],blank={...structuredClone(source),id:'blank-from-style',name:'New blank table',x:source.x+420,cells:source.cells!.map(row=>row.map(()=>''))};after.slides[0].elements.push(blank);const original=JSON.stringify(serializeNativeTable(table));assert.notEqual(tableLayoutFingerprint(blank),blank.nativeTableLayout!.fingerprint);
 const result=await applyDeckToFigma(figma,after,before),n=clones[0];assert.equal(n.type,'TABLE');for(let r=0;r<2;r++)for(let c=0;c<2;c++)assert.equal(n.cellAt(r,c).text.characters,'');assert.equal(n.cellAt(0,1).text.textDecoration,'UNDERLINE');assert.equal(n.cellAt(1,1).text.textDecoration,'STRIKETHROUGH');assert.deepEqual(n.cellAt(1,1).fills,cells[1][1].fills);assert.equal(n.getPluginData('native-style-marker'),'retain this style');assert.equal(n.getPluginData('deck-studio-id'),'blank-from-style');assert.equal(JSON.stringify(serializeNativeTable(table)),original);assert.equal(result.warnings.filter(w=>w.includes('Figma-only animation settings')).length,1);
});

test('native table copies preserve source-only root opacity and pass-through blending instead of resetting local defaults',async()=>{
 const {figma,table,slide,clones}=nativeCopyFixture();table.opacity=.42;table.blendMode='PASS_THROUGH';const before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),source=after.slides[0].elements[0];assert.equal(source.opacity,1);after.slides[0].elements.push({...structuredClone(source),id:'table-copy',name:'Copied source appearance',x:source.x+420});await applyDeckToFigma(figma,after,before);assert.equal(clones[0].opacity,.42);assert.equal(clones[0].blendMode,'PASS_THROUGH');assert.equal(clones[0].relativeTransform[0][2],source.x+420);assert.equal(table.opacity,.42);assert.equal(table.blendMode,'PASS_THROUGH');
});

test('a new source-free table does not silently choose an existing native table as its creation seed',async()=>{
 const {figma,table,slide,cloneCalls}=nativeCopyFixture(),before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),fallback=tableHost();after.slides[0].elements.push(element('table',{id:'new-table',fontFamily:'Inter',fontWeight:400,cells:[['Authored','New']]}));Object.assign(figma,{createFrame:fallback.host.createFrame,createText:fallback.host.createText,createVector:fallback.host.createVector});const source=JSON.stringify(serializeNativeTable(table));
 const result=await applyDeckToFigma(figma,after,before);assert.deepEqual(cloneCalls,[]);assert.equal(slide.children.filter((n:any)=>n.type==='TABLE').length,1);assert.equal(slide.children.filter((n:any)=>n.type==='FRAME').length,1);assert.equal(JSON.stringify(serializeNativeTable(table)),source);assert(result.warnings.some(w=>w.includes('editable Figma layers')));
});

test('native-copy source guards leave repeated editable-layer table copying available',async()=>{
 const {host,slide}=tableHost(),empty=importFigma(await captureFigma(host,[slide])),authored=structuredClone(empty);authored.slides[0].elements=[element('table',{id:'layer-table',fontFamily:'Inter',fontWeight:400,cells:[['Name','Value'],['Local','1']]})];await applyDeckToFigma(host,authored,empty);const before=importFigma(await captureFigma(host,[slide])),after=structuredClone(before),first=after.slides[0].elements[0];after.slides[0].elements.push({...structuredClone(first),id:'layer-copy-1'});await applyDeckToFigma(host,after,before);const third=structuredClone(after);third.slides[0].elements.push({...structuredClone(first),id:'layer-copy-2'});await applyDeckToFigma(host,third,after);assert.equal(slide.children.filter((n:any)=>n.type==='FRAME').length,3);assert.equal(slide.children.some((n:any)=>n.type==='TABLE'),false);
});

test('a reviewed merge creates separate editable layers, retains covered native values through split and removes only the copy on Undo',async()=>{
 const {figma,table,slide,cells,cloneCalls}=nativeCopyFixture();cells[0][1].text.textDecoration='UNDERLINE';cells[1][1].text.textDecoration='STRIKETHROUGH';const fallback=tableHost();Object.assign(figma,{createFrame:fallback.host.createFrame,createText:fallback.host.createText,createVector:fallback.host.createVector});const before=importFigma(await captureFigma(figma,[slide])),source=before.slides[0].elements[0],review=prepareMergedTableCopy(before,before.slides[0].id,source.id,{anchor:{row:0,column:0},head:{row:0,column:1}}),after=applyOperations(before,mergedTableCopyOperations(before,review),review.baseRevision),original=JSON.stringify(serializeNativeTable(table)),motion=table.motion;
 await applyDeckToFigma(figma,after,before);assert.deepEqual(cloneCalls,[]);assert.equal(slide.children[0],table);assert.equal(table.motion,motion);assert.equal(JSON.stringify(serializeNativeTable(table)),original);const copy=slide.children.find((n:any)=>n!==table)!;assert.equal(copy.type,'FRAME');const data=readLayerTable(copy)!;assert.deepEqual(data.cells,source.cells);assert.deepEqual(data.tableStyle!.merges,[{row:0,column:0,rowSpan:1,columnSpan:2}]);assert.equal(copy.children.some((n:any)=>n.getPluginData('deck-studio-table-cell')==='0:1'),false);assert.equal(data.cells![0][1],source.cells![0][1]);
 const split=applyOperations(after,[{op:'update_element',slideId:after.slides[0].id,elementId:review.preview.id,patch:mergeTableRange(after.slides[0].elements[1],{anchor:{row:0,column:0},head:{row:0,column:0}},true)}]);await applyDeckToFigma(figma,split,after);const restoredCell=copy.children.find((n:any)=>n.getPluginData('deck-studio-table-cell')==='0:1');assert.equal(restoredCell.children[0].characters,source.cells![0][1]);assert.equal(restoredCell.children[0].textDecoration,'UNDERLINE');assert.equal(JSON.stringify(serializeNativeTable(table)),original);
 await applyDeckToFigma(figma,before,split);assert.deepEqual(slide.children,[table]);assert.equal(JSON.stringify(serializeNativeTable(table)),original);assert.equal(table.motion,motion);
});

test('native copy unsupported changes, unavailable fonts and ambiguous sources reject before any clone',async()=>{
 for(const kind of ['merge','padding','font','ambiguous']as const){const {figma,table,slide,clones,cloneCalls}=nativeCopyFixture(),before=importFigma(await captureFigma(figma,[slide]));if(kind==='ambiguous')before.slides[0].elements.push({...structuredClone(before.slides[0].elements[0]),id:'existing-alias'});const after=structuredClone(before),source=after.slides[0].elements[0],copy={...structuredClone(source),id:'table-copy'};after.slides[0].elements.push(copy);if(kind==='merge')copy.tableStyle!.merges=[{row:0,column:0,rowSpan:1,columnSpan:2}];if(kind==='padding')copy.tableStyle!.padding=24;if(kind==='font')copy.fontFamily='Unavailable native copy font';const original=JSON.stringify(serializeNativeTable(table));let undos=0;figma.triggerUndo=()=>undos++;
  await assert.rejects(()=>applyDeckToFigma(figma,after,before),/other table properties|Install Unavailable native copy font|ambiguous native table source/);assert.deepEqual(cloneCalls,[]);assert.deepEqual(clones,[]);assert.equal(undos,0);assert.equal(JSON.stringify(serializeNativeTable(table)),original);
 }
});

test('native copy failures use one classic Undo and leave the source and native slide intact',async()=>{
 for(const kind of ['clone','cells','write']as const){const {figma,table,slide,clones}=nativeCopyFixture(),before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),source=after.slides[0].elements[0],copy={...structuredClone(source),id:'table-copy'},clone=table.clone;copy.cells![1][1]='Desired copy';after.slides[0].elements.push(copy);const original=JSON.stringify(serializeNativeTable(table));let undos=0;
  table.clone=()=>{const n=clone();if(kind==='clone')throw Error('Injected native clone failure');if(kind==='cells')n.cellAt(0,0).text.characters='Corrupt clone';if(kind==='write')n.cellAt(1,1).text.insertCharacters=()=>{throw Error('Injected copied text failure');};return n;};figma.triggerUndo=()=>{undos++;for(const n of clones)n.remove();};
  await assert.rejects(()=>applyDeckToFigma(figma,after,before),/Injected native clone failure|did not preserve its source cells|Injected copied text failure/);assert.equal(undos,1);assert.equal(slide.children.length,1);assert.equal(slide.children[0],table);assert.equal(figma.currentPage.children.length,1);assert.equal(JSON.stringify(serializeNativeTable(table)),original);
 }
});

test('a copied-table write failure rolls back earlier same-batch original edits and the created native root together',async()=>{
 const {figma,table,slide,cells,clones}=nativeCopyFixture(),before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),source=after.slides[0].elements[0],copy={...structuredClone(source),id:'table-copy'},clone=table.clone;after.slides[0].elements.push(copy);copy.cells![1][1]='Copy edit';source.cells![0][0]='Original batch edit';const original=JSON.stringify(serializeNativeTable(table)),old=cells.map(row=>row.map(c=>c.text.characters));let undos=0,originalWasEdited=false;
 table.clone=()=>{const n=clone();n.cellAt(1,1).text.insertCharacters=()=>{throw Error('Atomic copied-table failure');};return n;};figma.triggerUndo=()=>{undos++;originalWasEdited=cells[0][0].text.characters==='Original batch edit';for(const n of clones)n.remove();for(let r=0;r<2;r++)for(let c=0;c<2;c++)cells[r][c].text.characters=old[r][c];};
 await assert.rejects(()=>applyDeckToFigma(figma,after,before),/Atomic copied-table failure/);assert.equal(undos,1);assert.equal(originalWasEdited,true);assert.deepEqual(slide.children,[table]);assert.equal(JSON.stringify(serializeNativeTable(table)),original);
});

test('native TABLE cell formatting syncs bidirectionally without replacing the root or untouched rich cells',async()=>{
 const {table,slide,figma,cells}=fixture(),before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),e=after.slides[0].elements[0],untouched=cells[0][0].text.fontName,motion=table.motion;
 assert.deepEqual(e.tableStyle!.cellStyles,[]);e.tableStyle!.cellStyles=[{row:1,column:1,fontSize:24,fontWeight:700,underline:true,fill:'#ffffcc',color:'#993300',align:'right',verticalAlign:'bottom'}];
 await applyDeckToFigma(figma,after,before);assert.equal(table.motion,motion);assert.equal(cells[0][0].text.fontName,untouched);const t=cells[1][1].text;assert.equal(t.fontSize,24);assert.equal(t.fontName.style,'Bold');assert.equal(t.textDecoration,'UNDERLINE');assert.equal(t.textAlignHorizontal,'RIGHT');assert.equal(t.textAlignVertical,'BOTTOM');
 const back=importFigma(await captureFigma(figma,[slide])),cell=back.slides[0].elements[0].tableStyle!.cellStyles!.find(s=>s.row===1&&s.column===1)!;assert.equal(cell.fontSize,24);assert.equal(cell.color,'#993300');assert.equal(cell.underline,true);assert.equal(cell.verticalAlign,'bottom');
 t.fontSize=28;t.textDecoration='NONE';const incoming=importFigma(await captureFigma(figma,[slide]));assert.equal(incoming.slides[0].elements[0].tableStyle!.cellStyles!.find(s=>s.row===1&&s.column===1)!.fontSize,28);
 await applyDeckToFigma(figma,before,after);assert.equal(t.fontSize,16);assert.equal(t.fontName.style,'Medium');assert.equal(t.textDecoration,'NONE');assert.equal(slide.children[0],table);
});
test('whole-table size and underline changes reach default cells; unsupported cell capabilities fail before any text write',async()=>{
 const {table,slide,figma,cells}=fixture(),before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),e=after.slides[0].elements[0];e.fontSize=22;e.underline=true;await applyDeckToFigma(figma,after,before);assert(cells.flat().every(c=>c.text.fontSize===22&&c.text.textDecoration==='UNDERLINE'));
 const invalid=structuredClone(after);invalid.slides[0].elements[0].cells![0][0]='Should not write';invalid.slides[0].elements[0].tableStyle!.cellStyles=[{row:1,column:1,align:'right'}];delete (cells[1][1].text as any).textAlignHorizontal;await assert.rejects(()=>applyDeckToFigma(figma,invalid,after),/other table properties/);assert.equal(cells[0][0].text.characters,'Metric');assert.equal(table.id,'table');
});
test('native TABLE failure after a cell write enters the single native Undo boundary',async()=>{
 const {table,slide,figma,cells}=fixture(),before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before);let undo=0;figma.triggerUndo=()=>undo++;after.slides[0].elements[0].tableStyle!.cellStyles=[{row:0,column:0,fontSize:24},{row:1,column:1,fontSize:28}];Object.defineProperty(cells[1][1].text,'fontSize',{get:()=>16,set(){throw Error('Injected native font failure');}});await assert.rejects(()=>applyDeckToFigma(figma,after,before),/Injected native font failure/);assert.equal(undo,1);assert.equal(table.id,'table');
});

test('an explicit default cell style can replace native paints and decorations that are not represented locally',async()=>{
 const {slide,figma,cells}=fixture();cells[1][1].fills=[{type:'GRADIENT_LINEAR'}]as any;cells[1][1].text.textDecoration='STRIKETHROUGH';const before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before);after.slides[0].elements[0].tableStyle!.cellStyles=[{row:1,column:1,fill:'#ffffff',underline:false,strikethrough:false}];await applyDeckToFigma(figma,after,before);assert.equal(cells[1][1].fills[0].type,'SOLID');assert.equal(cells[1][1].text.textDecoration,'NONE');
});

test('native TABLE preflight loads each distinct existing font once instead of once per cell',async()=>{const {table,slide,figma}=fixture(),before=importFigma(await captureFigma(figma,[slide]));const loaded:any[]=[];figma.loadFontAsync=async(f:any)=>loaded.push(f);await prepareNativeTable(figma,table,before.slides[0].elements[0],before.slides[0].elements[0]);assert.equal(loaded.length,1);assert.equal(loaded[0].style,'Medium');});

test('native TABLE strike capture, selected-cell updates and Undo preserve root identity and untouched styling',async()=>{
 const {table,slide,figma,cells}=fixture();cells[0][0].text.textDecoration='STRIKETHROUGH';const before=importFigma(await captureFigma(figma,[slide])),e=before.slides[0].elements[0];assert.equal(e.strikethrough,true);assert.equal(e.tableStyle?.cellStyles?.find(s=>s.row===0&&s.column===1)?.strikethrough,false);
 const after=structuredClone(before),changed=after.slides[0].elements[0],untouched=cells[0][0].text,motion=table.motion;changed.tableStyle!.cellStyles!.find(s=>s.row===1&&s.column===0)!.strikethrough=true;
 await applyDeckToFigma(figma,after,before);assert.equal(cells[1][0].text.textDecoration,'STRIKETHROUGH');assert.equal(cells[0][1].text.textDecoration,'NONE');assert.equal(cells[0][0].text,untouched);assert.equal(table.motion,motion);assert.equal(table.id,'table');
 const readback=importFigma(await captureFigma(figma,[slide]));assert.equal(readback.slides[0].elements[0].tableStyle?.cellStyles?.find(s=>s.row===1&&s.column===0)?.strikethrough,undefined);
 await applyDeckToFigma(figma,before,after);assert.equal(cells[1][0].text.textDecoration,'NONE');assert.equal(cells[0][0].text.textDecoration,'STRIKETHROUGH');
});

test('missing native cell decoration capability rejects all pending cell edits in preflight',async()=>{
 const {slide,figma,cells}=fixture(),before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),e=after.slides[0].elements[0];e.cells![0][0]='Must stay unchanged';e.tableStyle!.cellStyles=[{row:1,column:1,strikethrough:true}];delete (cells[1][1].text as any).textDecoration;
 await assert.rejects(()=>applyDeckToFigma(figma,after,before),/other table properties/);assert.equal(cells[0][0].text.characters,'Metric');
});

test('combined decorations in a later table cell reject before accessing or changing any native object',async()=>{
 const s=blankSlide(),e=element('table',{name:'Combined cell',underline:true,cells:[['Valid','Combined']],tableStyle:{cellStyles:[{row:0,column:1,strikethrough:true}]}});s.elements=[element('text',{text:'Earlier valid object'}),e];let accesses=0;const host=new Proxy({},{get(){accesses++;throw Error('Native host was accessed');}});
 await assert.rejects(()=>applyDeckToFigma(host,newDeck('Combined',[s])),/one decoration per character/);assert.equal(accesses,0);assert.throws(()=>writeNativeTable(host,e),/one decoration per character/);assert.equal(accesses,0);
});

test('native strike setter failure rolls earlier decoration changes back through one Undo boundary',async()=>{
 const {table,slide,figma,cells}=fixture(),before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before);let undo=0,last='NONE';after.slides[0].elements[0].tableStyle!.cellStyles=[{row:0,column:0,strikethrough:true},{row:1,column:1,strikethrough:true}];
 Object.defineProperty(cells[1][1].text,'textDecoration',{get:()=>last,set(value){if(value==='STRIKETHROUGH')throw Error('Injected native strike failure');last=value;}});figma.triggerUndo=()=>{undo++;for(const cell of cells.flat())cell.text.textDecoration='NONE';};
 await assert.rejects(()=>applyDeckToFigma(figma,after,before),/Injected native strike failure/);assert.equal(undo,1);assert(cells.flat().every(cell=>cell.text.textDecoration==='NONE'));assert.equal(table.id,'table');
});

for(const axis of ['row','column']as const)test(`native TABLE ${axis} clamping rejects a size the native host cannot apply`,async()=>{
 const {table,slide,figma,cells}=fixture(),before=importFigma(await captureFigma(figma,[slide])),e=structuredClone(before.slides[0].elements[0]);
 if(axis==='row'){e.h=100;table.resizeRow=(r:number,h:number)=>{for(const cell of cells[r])cell.height=Math.max(70,h);};}
 else{e.w=256;table.resizeColumn=(c:number,w:number)=>{for(const row of cells)row[c].width=Math.max(200,w);};}
 assert.throws(()=>writeNativeTable(table,e,new Map(),before.slides[0].elements[0]),axis==='row'?/row 1 height.*Increase the table height/:/column 1 width.*Increase the table width/);
});

for(const axis of ['row','column']as const)test(`native TABLE ${axis} clamp rejection enters the apply Undo boundary and restores prior cells`,async()=>{
 const {table,slide,figma,cells}=fixture(),before=importFigma(await captureFigma(figma,[slide])),after=structuredClone(before),e=after.slides[0].elements[0],motion=table.motion;
 const state=()=>cells.map(row=>row.map(cell=>({width:cell.width,height:cell.height,characters:cell.text.characters,fontSize:cell.text.fontSize,lineHeight:structuredClone(cell.text.lineHeight)}))),saved=state();let undo=0,partialWrite=false;
 e.fontSize=20;e.cells![1][0]='Changed before native sizing rejected';
 if(axis==='row'){e.h=100;table.resizeRow=(r:number,h:number)=>{for(const cell of cells[r])cell.height=Math.max(70,h);};}
 else{e.w=256;table.resizeColumn=(c:number,w:number)=>{for(const row of cells)row[c].width=Math.max(200,w);};}
 figma.triggerUndo=()=>{undo++;partialWrite=axis==='row'?cells[1][0].text.characters===e.cells![1][0]&&cells[1][0].text.fontSize===20:cells[0][0].width===200;for(let r=0;r<2;r++)for(let c=0;c<2;c++){const prior=saved[r][c];cells[r][c].width=prior.width;cells[r][c].height=prior.height;cells[r][c].text.characters=prior.characters;cells[r][c].text.fontSize=prior.fontSize;cells[r][c].text.lineHeight=prior.lineHeight;}};
 await assert.rejects(()=>applyDeckToFigma(figma,after,before),/Figma could not apply.*Increase the table/);assert.equal(undo,1);assert.equal(partialWrite,true);assert.deepEqual(state(),saved);assert.equal(table.motion,motion);assert.equal(slide.children[0],table);
});

test('native TABLE resize accepts subpixel host rounding within a tenth of a pixel',async()=>{
 const {table,slide,figma,cells}=fixture(),before=importFigma(await captureFigma(figma,[slide])),e=structuredClone(before.slides[0].elements[0]);e.h=140;table.resizeRow=(r:number,h:number)=>{for(const cell of cells[r])cell.height=h+.05;};assert.equal(writeNativeTable(table,e,new Map(),before.slides[0].elements[0]),true);assert.equal(cells[1][0].height,70.05);
});
