import {z} from './schema';
import {COLOR_ROLES} from './design-system-schema';

export const CHART_TYPES = ['column', 'bar', 'line', 'area', 'pie', 'donut'] as const;
const label = z.string().check(z.trim()).check(z.minLength(1)).check(z.maxLength(100));
const color=z.string().check(z.regex(/^#[\da-fA-F]{6}$/)),flag=z.boolean();
const number=(min:number,max:number)=>z.optional(z.number().check(z.minimum(min)).check(z.maximum(max)));
const optionalFlag=z.optional(flag),text=(max:number)=>z.string().check(z.maxLength(max));
export const ChartSchema = z.strictObject({
  type: z.enum(CHART_TYPES),
  labels: z.array(label).check(z.minLength(1)).check(z.maxLength(100)),
  series: z.array(z.strictObject({name: label, values: z.array(z.number().check(z.minimum(-1e12)).check(z.maximum(1e12))).check(z.minLength(1)).check(z.maxLength(100))})).check(z.minLength(1)).check(z.maxLength(8)),
  title: text(200), subtitle: text(300), source: text(300),
  colors: z.array(color).check(z.minLength(1)).check(z.maxLength(8)),
  textColor: color,
  legend: flag, grid: flag, showValues: flag, stacked: flag,
  categoryTitle: text(80), valueTitle: text(80),
  prefix: text(12), suffix: text(12),
  visual:z.optional(z.strictObject({preset:z.optional(z.enum(['clean','report','bold','minimal'])),cornerRadius:number(0,16),lineWidth:number(1,8),pointSize:number(0,16),smooth:optionalFlag,areaOpacity:number(0,1),donutHole:number(30,80)})),
  numberFormat:z.optional(z.strictObject({notation:z.optional(z.enum(['standard','compact'])),grouping:optionalFlag,decimals:z.optional(z.number().check(z.int()).check(z.minimum(0)).check(z.maximum(4)))})),
  legendPosition:z.optional(z.enum(['auto','top','right','bottom','left'])),
  axisStyle:z.optional(z.strictObject({fontSize:number(12,40),rotation:number(-90,90),showLabels:optionalFlag})),
  dataLabels:z.optional(z.strictObject({position:z.optional(z.enum(['auto','inside','outside'])),fontSize:number(10,48),color:z.optional(color),bold:optionalFlag})),
  pieSeries: z.optional(z.number().check(z.int()).check(z.minimum(0)).check(z.maximum(7))),
  forecastFrom: z.optional(z.number().check(z.int()).check(z.minimum(1)).check(z.maximum(99))),
  adaptive: optionalFlag,
  sourceDisplay:z.optional(z.enum(['chart','caption'])),
  colorRoles:z.optional(z.array(z.enum(COLOR_ROLES)).check(z.minLength(1)).check(z.maxLength(8))),
  axisRange:z.optional(z.strictObject({min:z.number(),max:z.number()}).check(z.refine(v=>v.max>v.min, 'Max must exceed min.'))),
});
export type Chart = z.infer<typeof ChartSchema>;

export function validateChart(value: unknown): Chart {
  const parsed = ChartSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue.path[0] === 'labels'||issue.path[0] === 'series'&&issue.path[2] === 'name') throw new Error(`${issue.path[0]==='labels'?'Category':'Series'} ${Number(issue.path[1])+1}: use 1–100 characters.`);
    throw new Error(`Chart ${issue.path.join(' ')}: ${issue.message}`);
  }
  const chart = parsed.data;
  if (chart.series.some(s => s.values.length !== chart.labels.length)) throw new Error('Match one number to each category.');
  if (new Set(chart.series.map(s => s.name)).size !== chart.series.length) throw new Error('Use unique series names.');
  if (chart.pieSeries !== undefined && chart.pieSeries >= chart.series.length) throw new Error('Choose an existing series.');
  if (chart.type === 'pie' || chart.type === 'donut') {
    if (chart.series.length > 1 && chart.pieSeries === undefined) throw new Error('Choose one series for pie or donut.');
    const series = chart.series[chart.pieSeries ?? 0];
    if (series.values.some(v => v < 0) || !series.values.some(v => v > 0)) throw new Error(`${series.name}: use nonnegative values with total greater than zero.`);
  }
  return chart;
}
