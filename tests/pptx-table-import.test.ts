import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import {importPptx} from '../src/importers/pptx';
import {buildPptx} from '../src/core/pptx-export';
import {tablePresentation,tableCellStyle} from '../src/core/table-appearance';
import {validateDeck} from '../src/core/model';
import {applyImmutableOperations} from '../src/core/operations';
import {changeTableAxis} from '../src/core/table-structure';

async function source(){
 const pptx=new PptxGenJS();pptx.layout='LAYOUT_WIDE';const slide=pptx.addSlide();
 slide.addTable([
  [{text:'Merged title',options:{rowspan:2,colspan:2,fill:{color:'173D32'},color:'FFFFFF',fontSize:22,fontFace:'Courier New',bold:true}},{text:'Source'}],
  [{text:'Reviewed report'}],
  [{text:'A'},{text:'91.5',options:{color:'B34024',bold:true,align:'right'}},{text:'Annual statement',options:{italic:true,fill:{color:'F1E2BB'}}}],
 ],{x:.75,y:1.9,w:6,colW:[1,3,2],rowH:[.75,.55,.85],margin:7.2,fontFace:'Arial',fontSize:16,color:'26362C',fill:{color:'FFFFFF'},border:{type:'solid',pt:1,color:'B9C3BB'},valign:'middle',autoPage:false});
 slide.addNotes('Notes stay editable');return pptx.write({outputType:'uint8array'}) as Promise<Uint8Array>;
}
const table=(d:Awaited<ReturnType<typeof importPptx>>)=>d.slides[0].elements.find(e=>e.type==='table')!;
function close(actual:number,expected:number){assert(Math.abs(actual-expected)<.02,`${actual} != ${expected}`);}
async function patched(change:(xml:string)=>string,notes?:(xml:string)=>string){
 const zip=await JSZip.loadAsync(await source()),path='ppt/slides/slide1.xml';zip.file(path,change(await zip.file(path)!.async('string')));
 if(notes){const p='ppt/notesSlides/notesSlide1.xml';zip.file(p,notes(await zip.file(p)!.async('string')));}
 return importPptx(await zip.generateAsync({type:'uint8array'}),'native table.pptx');
}

test('native OOXML table grids, row sizes and two-axis merges survive a misleading frame extent',async()=>{
 const bytes=await source(),d=await importPptx(bytes,'native table.pptx'),e=table(d),p=tablePresentation(e);
 close(e.x,81);close(e.y,205.2);close(e.w,648);close(e.h,232.2);
 [108,324,216].forEach((value,i)=>close(p.widths[i]*e.w,value));[81,59.4,91.8].forEach((value,i)=>close(p.heights![i]*e.h,value));
 assert.deepEqual(p.merges,[{row:0,column:0,rowSpan:2,columnSpan:2}]);assert.deepEqual(e.cells,[['Merged title','','Source'],['','','Reviewed report'],['A','91.5','Annual statement']]);
 const header=tableCellStyle(p,0,0),number=tableCellStyle(p,2,1),last=tableCellStyle(p,2,2);
 assert.equal(header.background,'#173D32');assert.equal(header.color,'#FFFFFF');assert.equal(header.fontWeight,700);close(parseFloat(header.fontSize),33);
 assert.equal(number.color,'#B34024');assert.equal(number.textAlign,'right');assert.equal(number.verticalAlign,'middle');close(parseFloat(number.fontSize),24);
 assert.equal(last.fontStyle,'italic');assert.equal(last.background,'#F1E2BB');close(p.padding,10.8);close(p.borderWidth,1.5);
 assert.equal(d.slides[0].notes,'Notes stay editable');validateDeck(d);
});

test('table and note text keep ordered hard breaks, fields, empty paragraphs and exact whitespace',async()=>{
 const markup='<a:r><a:rPr/><a:t xml:space="preserve"> Before </a:t></a:r><a:br/><a:fld id="{00000000-0000-0000-0000-000000000001}" type="slidenum"><a:t>7</a:t></a:fld><a:r><a:rPr/><a:t> after</a:t></a:r>';
 const change=(xml:string)=>xml.replace('<a:t>Merged title</a:t>','<a:t>Old</a:t>').replace(/<a:r>[\s\S]*?<a:t>Old<\/a:t><\/a:r>/,markup);
 const notes=(xml:string)=>xml.replace(/<a:r>[\s\S]*?<a:t>Notes stay editable<\/a:t><\/a:r>/,markup);
 const empty=(xml:string)=>{const start=xml.indexOf(markup),end=xml.indexOf('</a:p>',start)+6;return xml.slice(0,end)+'<a:p><a:endParaRPr/></a:p>'+xml.slice(end);};
 const d=await patched(xml=>empty(change(xml)),xml=>empty(notes(xml)));assert.equal(table(d).cells![0][0],' Before \n7 after\n');assert.equal(d.slides[0].notes,' Before \n7 after\n');
});

test('invalid source spans and continuation flags preserve every cell value without hiding cells',async()=>{
 for(const change of [(xml:string)=>xml.replace('rowSpan="2"','rowSpan="99"'),(xml:string)=>xml.replace('hMerge="1"','hMerge="0"')]){
  const d=await patched(change),e=table(d);assert.equal(e.tableStyle?.merges,undefined);assert.equal(e.cells![0][0],'Merged title');assert.equal(e.cells![1][2],'Reviewed report');assert(d.slides[0].source?.warnings.some(w=>w.includes('inconsistent')));validateDeck(d);
 }
});

test('native covered-cell content remains available for later unmerge and editing',async()=>{
 const d=await patched(xml=>xml.replace(/(<a:tc[^>]*hMerge="1"[^>]*>)<a:tcPr\/>/, '$1<a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Covered source value</a:t></a:r></a:p></a:txBody><a:tcPr/>'));
 assert.equal(table(d).cells![0][1],'Covered source value');assert.equal(table(d).tableStyle?.merges?.length,1);
});

test('geometry and supported per-cell formatting remain editable through PPTX export and reimport',async()=>{
 const before=await importPptx(await source(),'native table.pptx'),e=table(before),after=await importPptx(await buildPptx(before),'roundtrip.pptx'),actual=table(after);
 close(actual.w,e.w);close(actual.h,e.h);assert.deepEqual(actual.cells,e.cells);assert.deepEqual(actual.tableStyle?.merges,e.tableStyle?.merges);
 const p=tablePresentation(e),q=tablePresentation(actual);p.widths.forEach((w,i)=>close(w*e.w,q.widths[i]*actual.w));p.heights!.forEach((h,i)=>close(h*e.h,q.heights![i]*actual.h));
 for(const [r,c] of [[0,0],[2,1],[2,2]])for(const key of ['color','background','fontFamily','fontWeight','fontStyle','textAlign','verticalAlign'] as const)assert.equal(tableCellStyle(q,r,c)[key],tableCellStyle(p,r,c)[key]);
 assert.equal(after.slides[0].notes,before.slides[0].notes);
});

test('imported body defaults serve new rows and whole-table manual/AI sizing preserves relative cell sizes atomically',async()=>{
 const d=await importPptx(await source(),'native table.pptx'),e=table(d),before=JSON.stringify(d);close(e.fontSize,24);assert.equal(e.fill,'#26362C');assert.equal(e.fontWeight,400);
 const added={...e,...changeTableAxis(e,'row',3,1,true)};assert.equal(tableCellStyle(tablePresentation(added),3,0).background,'#FFFFFF');close(parseFloat(tableCellStyle(tablePresentation(added),3,0).fontSize),24);
 for(const actor of ['manual','ai'] as const){
  const result=applyImmutableOperations(d,[{op:'update_element',slideId:d.slides[0].id,elementId:e.id,patch:{fontSize:32,fontFamily:'Georgia',stroke:'#224466',strokeWidth:2}}],d.revision,actor),p=tablePresentation(table(result));
  close(parseFloat(tableCellStyle(p,0,0).fontSize),44);close(parseFloat(tableCellStyle(p,2,1).fontSize),32);assert.equal(tableCellStyle(p,0,0).fontFamily,'Georgia');assert.equal(p.cellStyles.find(s=>s.row===0&&s.column===0)?.fontWeight,700);assert.deepEqual(p.merges,e.tableStyle?.merges);assert.equal(result.revision,d.revision+1);
  assert.equal(JSON.stringify(d),before);
  assert.equal(p.line,'#224466');assert.equal(p.borderWidth,2);
  const clear=applyImmutableOperations(result,[{op:'update_element',slideId:d.slides[0].id,elementId:e.id,patch:{stroke:'transparent'}}],result.revision,actor);assert.equal(tablePresentation(table(clear)).borders,'none');
 }
 const explicit={...e.tableStyle!,cellStyles:[{row:0,column:0,fontSize:40}]};
 const result=applyImmutableOperations(d,[{op:'update_element',slideId:d.slides[0].id,elementId:e.id,patch:{fontSize:32,tableStyle:explicit}}],d.revision);assert.equal(table(result).tableStyle?.cellStyles?.[0].fontSize,40);
});

test('tables beyond the existing editable grid bounds fail with a recovery action rather than truncating values',async()=>{
 await assert.rejects(patched(xml=>xml.replace('<a:tblGrid>','<a:tblGrid>'+Array.from({length:18},()=>'<a:gridCol w="914400"/>').join(''))),/up to 100 rows and 20 columns/);
});
