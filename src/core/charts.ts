import {chartPresetPatch} from './chart-style';
import {formatChartValue} from './chart-format';
import {delimitedRows} from './delimited-data';
export {decodeDataFile as decodeChartFile} from './delimited-data';
import type { SlideElement } from './model';
import { validateChart, type Chart } from './chart-schema';
export { CHART_TYPES, validateChart, type Chart } from './chart-schema';

export const chartTypes = [
  {id: 'column', label: 'Column', hint: 'Compare categories'},
  {id: 'bar', label: 'Bar', hint: 'Compare long labels'},
  {id: 'line', label: 'Line', hint: 'Show change over time'},
  {id: 'area', label: 'Area', hint: 'Show trends and volume'},
  {id: 'pie', label: 'Pie', hint: 'Show parts of a whole'},
  {id: 'donut', label: 'Donut', hint: 'Show parts of a whole'},
] as const;
export const chartPalettes = [
  {name: 'Studio', colors: ['#35665D', '#548DA6', '#D5A354', '#9D6F94', '#7B8853', '#B66A58', '#71819F', '#AD936D']},
  {name: 'Ocean', colors: ['#2458A6', '#16838D', '#8E69BA', '#CA8136', '#567A4B', '#BA5C73', '#738AA8', '#968147']},
  {name: 'Ink', colors: ['#263C4D', '#566F84', '#819AAD', '#B1C3D0', '#4D6366', '#718986', '#94ADA6', '#BACAC2']},
];
export function sampleChart(): Chart {
  return {type: 'column', labels: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{name: 'Series 1', values: [32, 48, 41, 64]}],
    title: '', subtitle: '', source: 'Sample data · Replace with your own', colors: [...chartPalettes[0].colors], textColor: '#283C38',
    legend: true, grid: true, showValues: false, stacked: false, categoryTitle: '', valueTitle: '', prefix: '', suffix: '',...chartPresetPatch('clean'),numberFormat:{grouping:true,notation:'standard'}};
}
/** Old single-series chart objects remain readable without a document migration. */
export function chartFromElement(element: SlideElement): Chart {
  if (element.chart) return validateChart({...element.chart, colors: [/^(?:#[\da-fA-F]{6}(?:[\da-fA-F]{2})?|transparent)$/.test(element.fill) ? element.fill : element.chart.colors[0], ...element.chart.colors.slice(1)]});
  return validateChart({...sampleChart(),visual:undefined,numberFormat:undefined, textColor:/^#[\da-fA-F]{6}$/.test(element.stroke)?element.stroke:sampleChart().textColor, labels: (element.values ?? []).map(v => v.label), series: [{name: element.name || 'Series 1', values: (element.values ?? []).map(v => v.value)}], colors: /^#[\da-fA-F]{6}$/.test(element.fill) ? [element.fill] : chartPalettes[0].colors, source: '', showValues: true, legend: false});
}
export function chartNumber(raw: string): number {
  raw = raw.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw) || !Number.isFinite(Number(raw)) || Math.abs(Number(raw)) > 1e12) throw new Error('Enter a number between −1 trillion and 1 trillion. Blank cells are not treated as zero.');
  return Number(raw);
}
/** Header row: Category,Series 1,Series 2. TSV from spreadsheet paste is also accepted. */
export function parseChartData(text: string): Pick<Chart, 'labels' | 'series'> {
  const parsed = delimitedRows(text, undefined, false, 101, 9);
  const [header, ...rows] = parsed.rows;
  if (!header || header.length < 2 || header.length > 9 || !rows.length || rows.length > 100) throw new Error('Include a header row, 1–8 series and 1–100 categories.');
  const names = header.slice(1).map(s => s.trim());
  if (names.some(n => !n || n.length > 100) || new Set(names).size !== names.length) throw new Error('Give each series a unique header (up to 100 characters).');
  const labels: string[] = [], series = names.map(name => ({name, values: [] as number[]}));
  for (const [i, row] of rows.entries()) {
    if (row.length !== header.length || !row[0].trim() || row[0].trim().length > 100) throw new Error(`Row ${i + 2}: include a category and one number for each series.`);
    labels.push(row[0].trim());
    for (let j = 1; j < row.length; j++) {
      const raw = parsed.delimiter === ';' ? row[j].trim().replace(/^(\s*[+-]?\d+),(\d+)$/, '$1.$2') : row[j].trim();
      try {series[j - 1].values.push(chartNumber(raw));} catch (e) {throw new Error(`Row ${i + 2}, ${names[j - 1]}: ${(e as Error).message}`);}
    }
  }
  return {labels, series};
}
/** Spreadsheet clipboard ranges have no header. Column zero is the category. */
export function pasteChartCells(chart: Pick<Chart, 'labels' | 'series'>, text: string, row: number, column: number) {
  const {rows} = delimitedRows(text, '\t', true);
  const width = rows[0]?.length ?? 0;
  if (!width || !rows.length || rows.some(cells => cells.length !== width)) throw new Error('Copy a rectangular range of cells, then paste it again.');
  if (!Number.isInteger(row) || !Number.isInteger(column) || row < 0 || column < 0 || row + rows.length > chart.labels.length || column + width > chart.series.length + 1) throw new Error('Add categories or series to fit this range, then paste again.');
  const labels = [...chart.labels], series = chart.series.map(s => ({...s, values: [...s.values]}));
  rows.forEach((cells, i) => cells.forEach((raw, j) => {
    const target = column + j;
    if (target === 0) {
      if (!raw.trim() || raw.trim().length > 100) throw new Error(`Pasted row ${i + 1}: enter a category name up to 100 characters.`);
      labels[row + i] = raw.trim();
    } else {
      try {series[target - 1].values[row + i] = chartNumber(raw);} catch (e) {throw new Error(`Pasted row ${i + 1}, ${series[target - 1].name}: ${(e as Error).message}`);}
    }
  }));
  return {labels, series, rows: rows.length, columns: width};
}
export function chartCsv(chart: Chart): string {
  const quote = (value: string | number) => '"' + String(value).replace(/"/g, '""') + '"';
  return '\uFEFF' + [['Category', ...chart.series.map(s => s.name)], ...chart.labels.map((label, i) => [label, ...chart.series.map(s => s.values[i])])].map(row => row.map(quote).join(',')).join('\r\n');
}
export function chartDescription(chart: Chart): string {
  return `${chart.title || chartTypes.find(t => t.id === chart.type)!.label + ' chart'}. ${displayedChartSeries(chart).map(s => `${s.name}: ${chart.labels.map((label, i) => `${label} ${formatChartValue(chart,s.values[i])}`).join(', ')}`).join('; ')}.${chart.source ? ' Source: ' + chart.source : ''}`;
}

export const isRoundChart = (chart: Pick<Chart, 'type'>) => chart.type === 'pie' || chart.type === 'donut';
export const canUsePieSeries = (series: Chart['series'][number]) => series.values.every(v => v >= 0) && series.values.some(v => v > 0);
export const displayedChartSeries = (chart: Chart) => isRoundChart(chart) ? [chart.series[chart.pieSeries ?? 0]] : chart.series;
/** Opt-in native templates choose a horizontal comparison before labels become unreadable. */
export function presentationChart(e:SlideElement):Chart{
  const c=chartFromElement(e),width=(e.w-140)/c.labels.length;
  return c.adaptive&&c.type==='column'&&c.labels.some(label=>[...label].length*Math.min(28,e.fontSize)*.55>width*3)?{...c,type:'bar'}:c;
}
export function changeChartType(chart: Chart, type: Chart['type']): Chart {
  const pieSeries = chart.pieSeries ?? 0;
  return {...chart, type, ...(type === 'pie' || type === 'donut' ? {pieSeries: canUsePieSeries(chart.series[pieSeries]) ? pieSeries : Math.max(0, chart.series.findIndex(canUsePieSeries))} : {})};
}
export function removeChartSeries(chart: Chart, index: number): Chart {
  const series = chart.series.filter((_, i) => i !== index), selected = chart.pieSeries ?? 0;
  const next = {...chart, series, colors: isRoundChart(chart) || chart.colors.length === 1 ? chart.colors : chart.colors.filter((_, i) => i !== index)};
  if (chart.pieSeries !== undefined) next.pieSeries = selected === index ? Math.max(0, series.findIndex(canUsePieSeries)) : selected > index ? selected - 1 : selected;
  return next;
}
export const chartFilename = (chart: Pick<Chart, 'title'>) => chart.title.trim().replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').slice(0, 90) || 'chart';
