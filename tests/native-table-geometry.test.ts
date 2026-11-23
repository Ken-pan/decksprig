import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import {inferNativeTableGeometry} from '../src/core/native-table-geometry';

const grid=(widths=[160,160,160],heights=[64,64])=>heights.map((height,rowIndex)=>widths.map((width,columnIndex)=>({width,height,rowIndex,columnIndex,characters:''})));
test('native geometry reads horizontal, vertical and rectangular owners without mistaking blank cells for merges',()=>{
 for(const [rowSpan,columnSpan]of [[1,2],[2,1],[2,2],[1,3],[2,3]]){const cells=grid(),before=JSON.stringify(cells);assert.deepEqual(inferNativeTableGeometry(cells,480,128),{columnWidths:[160,160,160],rowHeights:[64,64],merges:[]});cells[0][0].width=columnSpan*160;cells[0][0].height=rowSpan*64;assert.deepEqual(inferNativeTableGeometry(cells,480,128),{columnWidths:[160,160,160],rowHeights:[64,64],merges:[{row:0,column:0,rowSpan,columnSpan}]});assert.equal(JSON.stringify(grid()),before);}
});
test('unequal fractional axes and separate merge rectangles retain exact base sizes and input values',()=>{
 const widths=[100.25,200.5,160.25,120],heights=[60.5,80.25,90.25,70],cells=grid(widths,heights);cells[0][0].width=300.75;cells[0][0].height=140.75;cells[2][2].width=280.25;cells[2][2].characters='Nonblank covered content is not a geometry signal';const before=JSON.stringify(cells);assert.deepEqual(inferNativeTableGeometry(cells,581,301),{columnWidths:widths,rowHeights:heights,merges:[{row:0,column:0,rowSpan:2,columnSpan:2},{row:2,column:2,rowSpan:1,columnSpan:2}]});assert.equal(JSON.stringify(cells),before);
});
test('ambiguous or inconsistent native geometry is rejected instead of normalized into a guessed grid',()=>{
 const ambiguous=grid([300,200,300,200]);assert.equal(inferNativeTableGeometry(ambiguous,800,128),undefined);const inconsistent=grid();inconsistent[0][0].width=100;inconsistent[0][1].width=220;assert.equal(inferNativeTableGeometry(inconsistent,480,128),undefined);const overlap=grid();overlap[0][0].width=overlap[0][1].width=320;overlap[0][0].height=overlap[0][1].height=128;assert.equal(inferNativeTableGeometry(overlap,480,128),undefined);const alias=grid();alias[0][1].columnIndex=0;assert.equal(inferNativeTableGeometry(alias,480,128),undefined);assert.equal(inferNativeTableGeometry(grid([.05,.05,.05]),.15,128),undefined);
});


test('the five captured native FigJam fixtures retain their observed grid and distinct merge topologies',()=>{
 const samples=JSON.parse(fs.readFileSync(new URL('./fixtures/native-table-geometries.json',import.meta.url),'utf8')),expected=[{row:0,column:0,rowSpan:1,columnSpan:2},{row:0,column:0,rowSpan:2,columnSpan:1},{row:0,column:0,rowSpan:2,columnSpan:2},{row:0,column:0,rowSpan:1,columnSpan:3},undefined];
 samples.tables.forEach((table:any,index:number)=>{const before=JSON.stringify(table),cells=table.cells.map((row:any[])=>row.map(c=>({...c,rowIndex:c.row,columnIndex:c.column})));assert.deepEqual(inferNativeTableGeometry(cells,table.width,table.height),{columnWidths:[160,160,160],rowHeights:[64,64],merges:expected[index]?[expected[index]]:[]});assert.equal(JSON.stringify(table),before);});
});
