import {validateChart,type Chart} from './chart-schema';
import type {ChartPoint} from './chart-points';
export type ChartDragGeometry={kind:'axis';horizontal:boolean;min:number;max:number;pixelMin:number;pixelMax:number}|{kind:'radial';cx:number;cy:number;radius:number;total:number};
export type PlotPoint={x:number;y:number};
export function chartValueStep(chart:Chart){const values=chart.series.flatMap(s=>s.values);const decimals=chart.numberFormat?.decimals??Math.min(6,Math.max(...values.map(n=>{const s=String(n),[m,exponent='0']=s.split('e');return Math.max(0,(m.split('.')[1]?.length??0)-Number(exponent));})));return chart.numberFormat?.percent?10**-(chart.numberFormat.decimals??2)/100:10**-decimals;}
export function chartWithPointValue(chart:Chart,point:ChartPoint,value:number){return validateChart({...chart,series:chart.series.map((s,j)=>j===point.series?{...s,values:s.values.map((v,i)=>i===point.category?value:v)}:s)});}
/** Freeze the original scale through a drag; the committed chart keeps its authored range. */
export function draggedChartValue(chart:Chart,point:ChartPoint,geometry:ChartDragGeometry,from:PlotPoint,to:PlotPoint,fine=false){
  const original=chart.series[point.series].values[point.category],step=chartValueStep(chart)*(fine?.1:1);
  const delta=geometry.kind==='axis'?((geometry.horizontal?to.x-from.x:to.y-from.y)/(geometry.pixelMax-geometry.pixelMin))*(geometry.max-geometry.min):(Math.hypot(to.x-geometry.cx,to.y-geometry.cy)-Math.hypot(from.x-geometry.cx,from.y-geometry.cy))*geometry.total/geometry.radius;
  let value=original+delta*(fine?.1:1),min=-1e12,max=1e12;
  if(geometry.kind==='axis'){let offset=0;if(chart.stacked)offset=chart.series.slice(0,point.series).reduce((sum,s)=>sum+(Math.sign(s.values[point.category])===Math.sign(value)?s.values[point.category]:0),0);min=Math.max(min,geometry.min-offset);max=Math.min(max,geometry.max-offset);}
  else{min=chart.series[point.series].values.some((v,i)=>i!==point.category&&v>0)?0:Math.min(original,step);}
  value=Math.max(min,Math.min(max,Math.round(value/step)*step));return Number(value.toPrecision(12));
}
