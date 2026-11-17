import type {Chart} from './chart-schema';
export function formatChartValue(chart:Pick<Chart,'prefix'|'suffix'|'numberFormat'>,value:number){
  const f=chart.numberFormat;
  if(!f)return `${chart.prefix}${value}${chart.suffix}`;
  const number=new Intl.NumberFormat('en-US',{notation:f.notation??'standard',useGrouping:f.grouping??true,minimumFractionDigits:f.decimals,maximumFractionDigits:f.decimals??2}).format(f.percent?value*100:value);
  return `${chart.prefix}${number}${f.percent?'%':''}${chart.suffix}`;
}
