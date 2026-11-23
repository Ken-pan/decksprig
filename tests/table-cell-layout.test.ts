import test from 'node:test';
import assert from 'node:assert/strict';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {importPptx} from '../src/importers/pptx';
import {buildPptx} from '../src/core/pptx-export';
import {element,newDeck,blankSlide,validateDeck} from '../src/core/model';
import {tablePresentation,tableCellStyle,tableCellBox,tableRendering} from '../src/core/table-appearance';
import {scaleTableStyle,TableCellStyleSchema} from '../src/core/table-schema';
import {styleTableRange,borderTableRange,changeTableAxis} from '../src/core/table-structure';
import {applyImmutableOperations} from '../src/core/operations';
import {tableRowHeights} from '../src/core/table-fit';
import {contentTableColumns} from '../src/core/table-columns';

const close=(a:number,b:number)=>assert(Math.abs(a-b)<.02,`${a} != ${b}`),selected={anchor:{row:0,column:0},head:{row:0,column:0}};
const table=(d:Awaited<ReturnType<typeof importPptx>>)=>d.slides[0].elements.find(e=>e.type==='table')!;
async function source(){
 const pptx=new PptxGenJS();pptx.layout='LAYOUT_WIDE';const slide=pptx.addSlide();
 slide.addText('Directional cell layout',{x:.75,y:.5,w:10,h:.5,fontFace:'Arial',fontSize:24,bold:true,color:'173D32'});
 slide.addTable([
  [{text:'Insets and edges',options:{margin:[6,12,18,24],border:[{pt:3,color:'2458A6',type:'dash'},{pt:1,color:'B34024'},{pt:2,color:'173D32'},{type:'none'}]}},{text:'Control'},{text:'Reviewed'}],
  [{text:'Second row',options:{margin:[1,30,4,8]}},{text:'Keep unchanged'},{text:'Other'}],
 ],{x:.75,y:1.5,w:10,colW:[4,3,3],rowH:[1.25,1.1],margin:12,fontFace:'Arial',fontSize:18,color:'173D32',fill:{color:'F8F8F4'},border:{pt:1,color:'B9C3BB'},autoPage:false});
 slide.addNotes('Original layout evidence');
 const zip=await JSZip.loadAsync(await pptx.write({outputType:'uint8array'}) as Uint8Array),path='ppt/slides/slide1.xml';
 let xml=await zip.file(path)!.async('string');let n=0;xml=xml.replace(/<a:tcPr\b[^>]*>[\s\S]*?<\/a:tcPr>/g,cell=>{const index=n++;if(index===3)return cell.replace(/marT="[^"]*"/,'marT="0"');if(index!==0)return cell;return cell.replace(/(<a:lnR\b[^>]*>)([\s\S]*?)(<\/a:lnR>)/,(_,open,body,end)=>open+body.replace(/<a:prstDash\b[^>]*\/>/,'<a:prstDash val="sysDot"/>')+end).replace(/<a:lnB\b([^>]*)>/,(_,attrs)=>'<a:lnB'+attrs.replace(/\scmpd="[^"]*"/g,'')+' cmpd="dbl">');});
 assert.equal(XMLValidator.validate(xml),true);zip.file(path,xml);return zip.generateAsync({type:'uint8array'});
}

test('directional native insets and each visible border survive import and native roundtrip',async()=>{
 const bytes=await source(),before=await importPptx(bytes,'cell-layout.pptx'),e=table(before),p=tablePresentation(e),box=tableCellBox(p,0,0);validateDeck(before);assert.equal(e.tableStyle?.cellStyles?.length,2,'Common body insets and edges need no repeated cell overrides');assert.deepEqual(tableCellBox(p,1,0).insets,{top:0,right:45,bottom:6,left:12});
 assert.deepEqual(box.insets,{top:9,right:18,bottom:27,left:36});close(box.edges.top.width,4.5);assert.equal(box.edges.top.style,'dashed');assert.equal(box.edges.right.style,'dotted');assert.equal(box.edges.bottom.style,'double');assert.equal(box.edges.left.width,0);assert.equal(box.edges.top.color,'#2458A6');assert.equal(tableCellStyle(p,0,0).padding,'9px 18px 27px 36px');assert.equal(tableCellStyle(p,0,0).borderTop,'4.5px dashed #2458A6');
 const native=await buildPptx(before),after=await importPptx(native,'roundtrip.pptx'),actual=table(after);validateDeck(after);assert.deepEqual(actual.cells,e.cells);assert.deepEqual(after.slides[0].notes,before.slides[0].notes);
 const q=tablePresentation(actual);for(let row=0;row<2;row++)for(let col=0;col<3;col++){const a=tableCellBox(p,row,col),b=tableCellBox(q,row,col);for(const side of ['top','right','bottom','left'] as const){close(a.insets[side],b.insets[side]);close(a.edges[side].width,b.edges[side].width);if(a.edges[side].width){assert.equal(a.edges[side].color,b.edges[side].color);assert.equal(a.edges[side].style,b.edges[side].style);}}}
 const zip=await JSZip.loadAsync(native),xml=await zip.file('ppt/slides/slide1.xml')!.async('string');assert.equal(XMLValidator.validate(xml),true);const properties=xml.match(/<a:tcPr\b[^>]*>[\s\S]*?<\/a:tcPr>/)![0];assert.deepEqual([...properties.matchAll(/<a:ln([LRTB])\b/g)].map(m=>m[1]),['L','R','T','B'],'DrawingML cell borders retain their schema order');const parser=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,attributeNamePrefix:'',parseTagValue:false}),tbl=parser.parse(xml).sld.cSld.spTree.graphicFrame.graphic.graphicData.tbl,c=tbl.tr[0].tc[0].tcPr;
 assert.equal(Number(c.marT),76200);assert.equal(Number(c.marR),152400);assert.equal(Number(c.marB),228600);assert.equal(Number(c.marL),304800);assert.equal(c.lnT.prstDash.val,'dash');assert.equal(c.lnR.prstDash.val,'sysDot');assert.equal(c.lnB.cmpd,'dbl');assert.notEqual(c.lnL.noFill,undefined);
});

test('missing native margins use directional DrawingML defaults instead of repeating the left inset',async()=>{
 const zip=await JSZip.loadAsync(await source()),path='ppt/slides/slide1.xml';zip.file(path,(await zip.file(path)!.async('string')).replace(/\smar[TRBL]="[^"]*"/g,''));const d=await importPptx(await zip.generateAsync({type:'uint8array'}),'defaults.pptx'),box=tableCellBox(tablePresentation(table(d)),0,0);assert.deepEqual(box.insets,{top:5.4,right:10.8,bottom:5.4,left:10.8});
});

test('cell layout range edits retain other sides, rich text and source data in one validated operation',()=>{
 const e=element('table',{cells:[['One','Two'],['Three','Four']],tableStyle:{padding:12,borders:'grid',cellStyles:[{row:0,column:0,insets:{top:3,left:21},edges:{bottom:{width:3,color:'#2458A6',style:'double'}},runs:[{text:'One',italic:true}]}]}}),d=newDeck('Layout',[blankSlide()]);d.slides[0].elements=[e];const original=JSON.stringify(d),patch=styleTableRange(e,selected,{insets:{right:9}});
 assert.deepEqual(patch.tableStyle.cellStyles?.[0].insets,{top:3,left:21,right:9});assert.equal(patch.tableStyle.cellStyles?.[0].runs?.[0].italic,true);assert.equal(patch.tableStyle.cellStyles?.[0].edges?.bottom?.style,'double');
 for(const actor of ['manual','ai'] as const){const next=applyImmutableOperations(d,[{op:'update_element',slideId:d.slides[0].id,elementId:e.id,patch}],d.revision,actor);assert.equal(next.revision,d.revision+1);assert.deepEqual(next.slides[0].elements[0].cells,e.cells);validateDeck(next);assert.equal(JSON.stringify(d),original);}
 const reset=styleTableRange({...e,...patch},selected,{insets:undefined});assert.equal(reset.tableStyle.cellStyles?.[0].insets,undefined);assert.equal(reset.tableStyle.cellStyles?.[0].runs?.[0].italic,true);
 assert(!TableCellStyleSchema.safeParse({row:0,column:0,insets:{left:-1}}).success);assert(!TableCellStyleSchema.safeParse({row:0,column:0,edges:{top:{width:101,color:'#2458A6',style:'solid'}}}).success);
});

test('shared and merged selection edges update both owners so a prior heavier border cannot win',()=>{
 const e=element('table',{cells:[['Merged','','Right'],['','','Right 2'],['Bottom','','Last']],tableStyle:{padding:10,borders:'grid',merges:[{row:0,column:0,rowSpan:2,columnSpan:2}],cellStyles:[{row:0,column:2,edges:{left:{width:8,color:'#B34024',style:'double'}}}]}}),edge={width:0,color:'#2458A6',style:'solid' as const},patch=borderTableRange(e,selected,'right',edge),p=tablePresentation({...e,...patch});
 assert.deepEqual(tableCellBox(p,0,0).edges.right,edge);assert.deepEqual(tableCellBox(p,0,2).edges.left,edge);assert.deepEqual(tableCellBox(p,1,2).edges.left,edge);const reset=styleTableRange({...e,...patch},selected,null);assert.equal(tableCellBox(tablePresentation({...e,...reset}),0,2).edges.left.width,.75);assert.deepEqual(e.tableStyle?.cellStyles?.[0].edges?.left?.width,8);
 const added={...e,...patch,...changeTableAxis({...e,...patch},'row',0,1,true)};assert.equal(tableCellBox(tablePresentation(added),1,0).edges.right.width,0);
});

test('resolved cell geometry drives fit and column content sizing; scaling preserves the source',()=>{
 const e=element('table',{w:400,h:40,fontSize:20,lineHeight:1.2,cells:[['Long text','Short']],tableStyle:{padding:12,borders:'none',cellStyles:[{row:0,column:0,insets:{top:2,right:60,bottom:4,left:30},edges:{top:{width:2,color:'#2458A6',style:'solid'},bottom:{width:4,color:'#2458A6',style:'solid'}}}]}}),original=JSON.stringify(e);let width=0;
 const heights=tableRowHeights(e,e.fontSize,(text)=>{if(text.text==='Long text')width=text.w;return {w:text.w,h:24};});assert.equal(width,110);assert.equal(heights[0],48);const scaled=scaleTableStyle(e.tableStyle,2)!;assert.equal(scaled.cellStyles?.[0].insets?.right,120);assert.equal(scaled.cellStyles?.[0].edges?.bottom?.width,8);assert.equal(JSON.stringify(e),original);
 const without={...e,tableStyle:{...e.tableStyle,cellStyles:[]}};assert(contentTableColumns(e)[0]>contentTableColumns(without)[0]);
 const shared=new Function('__name','return ('+tableRendering.toString()+')()')((fn:Function)=>fn);assert.deepEqual(shared.tableCellBox(shared.tablePresentation(e),0,0),tableCellBox(tablePresentation(e),0,0));
});


test('transparent cell edges occupy no layout space while retaining authored width for recoloring',async()=>{
 const e=element('table',{cells:[['Text']],tableStyle:{borders:'none',cellStyles:[{row:0,column:0,edges:{left:{width:40,color:'transparent',style:'double'}}}]}});assert.equal(tableCellBox(tablePresentation(e),0,0).edges.left.width,0);assert.equal(e.tableStyle?.cellStyles?.[0].edges?.left?.width,40);
 const recolored=borderTableRange(e,selected,'left',{color:'#2458A6'});assert.equal(tableCellBox(tablePresentation({...e,...recolored}),0,0).edges.left.width,40);
 const zip=await JSZip.loadAsync(await source()),path='ppt/slides/slide1.xml';zip.file(path,(await zip.file(path)!.async('string')).replace('<a:srgbClr val="2458A6"/>','<a:srgbClr val="2458A6"><a:alpha val="0"/></a:srgbClr>'));const d=await importPptx(await zip.generateAsync({type:'uint8array'}),'transparent.pptx');assert.equal(tableCellBox(tablePresentation(table(d)),0,0).edges.top.width,0);
});
