<script lang="ts">
  import {fontFamilyKey,sameFontFamily} from '../core/font-stack';
  import {compositeColor} from '../core/color-contrast';
  import {pageBackground} from '../core/page-background';
  import ColorField from './ui/ColorField.svelte';
  import NumberField from './ui/NumberField.svelte';
  import FeedbackState from './FeedbackState.svelte';
  import Notice from './ui/Notice.svelte';
  import { onMount,tick,untrack } from 'svelte';
  import {revealWorkspacePreview} from '../workspace-preview';
  import { loadLibraryTypography } from '../core/font-loading';
  import { buildChartSvg } from '../core/chart-export';
  import Dialog from './Dialog.svelte';
  import { Button, DialogFooter } from './ui';
  import { Maximize2,Plus, Trash2, Upload, Download, ChevronDown, Eye, Clipboard } from '@lucide/svelte';
  import { editor } from '../core/editor.svelte';
  import { deckDesignSystem, styleOverrides, contrastRatio } from '../core/deck-design-system';
  import { insertedElement, insertionGeometry } from '../core/insertion';
  import { chartFromElement, chartTypes, sampleChart, chartPalettes, parseChartData, pasteChartCells, decodeChartFile, chartNumber, chartCsv, validateChart, changeChartType, removeChartSeries, isRoundChart, canUsePieSeries, chartFilename, chartDescription, type Chart } from '../core/charts';
  import { renderChartSvg } from '../core/chart-render';
  import {chartLabelLayout} from '../core/chart-layout';
  import {presentationChart} from '../core/charts';
  import { uiDisclosure } from '../ui-motion';
  import { download } from '../core/download';
  import ChartStyleChoices from './ChartStyleChoices.svelte';
  import {chartPresetPatch} from '../core/chart-style';
  import { countLabel } from '../core/ui-copy';
  let {elementId, onclose,initialTab='data'}: {elementId?: string; onclose: () => void;initialTab?:'data'|'style'} = $props();
  const base = editor.snapshot(), slideId = editor.slide!.id;
  const slide = base.slides.find(s => s.id === slideId)!;
  const existing = slide.elements.find(e => e.id === elementId);
  const seed = existing ?? insertedElement('chart', base, {...insertionGeometry('chart', base, {x: base.width * .16, y: base.height * .18}), w: Math.min(800, base.width), h: Math.min(460, base.height)});
  function initialChart(): Chart {
    if (!existing) {
      const sample = sampleChart(), background = compositeColor(slide.background,'#ffffff');
      const textColor = /^#[\da-f]{6}$/i.test(background) && contrastRatio(sample.textColor, background) < 4.5 ? (contrastRatio('#FFFFFF', background) > contrastRatio('#000000', background) ? '#FFFFFF' : '#000000') : sample.textColor;
      return {...sample, textColor, colors: [/^(?:#[\da-fA-F]{6}(?:[\da-fA-F]{2})?|transparent)$/.test(seed.fill) ? seed.fill : chartPalettes[0].colors[0], ...chartPalettes[0].colors.slice(1)]};
    }
    try {return chartFromElement(existing);} catch {return {...sampleChart(), labels: ['Category 1'], series: [{name: 'Series 1', values: [0]}], source: 'No data · Replace with your own'};}
  }
  const initial = validateChart(initialChart()), instanceId = $props.id(), initialLabelSize=Math.max(18,Math.min(28,seed.fontSize));
  let draft = $state<Chart>(initial), lastValid = $state<Chart>(validateChart(initial));
  let error = $state(''), importError = $state(''), status = $state(''), paste = $state('');
  let tab = $state<'data' | 'style'>(untrack(()=>initialTab)), importing = $state(false), exporting = $state(false), fontsReady = $state(false), previewOpen = $state(true);
  let colorValidity=$state<Record<string,boolean>>({});
  const colorsValid=$derived(Object.entries(colorValidity).every(([key,valid])=>valid||key==='labels'&&!draft.showValues||key.startsWith('series-')&&Number(key.slice(7))>=Math.min(100,isRoundChart(draft)?draft.labels.length:draft.series.length)));
  let labelSize=$state<number|string>(initialLabelSize),markNumbers=$state<Record<string,string>>({}),markOpen=$state(false);
  const labelSizeValid=$derived(String(labelSize).trim()!==''&&Number.isFinite(Number(labelSize))&&Number(labelSize)>=18&&Number(labelSize)<=28);
  const markErrors=$derived(Object.entries(markNumbers).filter(([key,value])=>!value.trim()||!Number.isFinite(Number(value))||Number(value)<(key==='lineWidth'?1:0)||Number(value)>(key==='lineWidth'?8:16)).map(([key])=>key));
  let svgBackground = $state(true), dataExpanded = $state(initial.series.length > 2);
  let pasteOpen = $state(false), pasteInput = $state<HTMLTextAreaElement>();
  let input = $state<HTMLInputElement>(), workspace = $state<HTMLDivElement>();
  let sequence = 0;
  const keys = (length: number) => Array.from({length}, () => `chart-field-${sequence++}`);
  let rows = $state(keys(initial.labels.length)), columns = $state(keys(initial.series.length));
  let numericEdits = $state<Record<string, string>>({});
  const cellKey = (i: number, j: number) => `${rows[i]}:${columns[j]}`;
  const fieldId = (key: string) => `${instanceId}-${key}`;
  const stale = $derived(editor.deck?.id !== base.id || editor.deck?.revision !== base.revision || editor.slide?.id !== slideId);
  const round = $derived(isRoundChart(draft));
  const analysis = $derived.by(() => {
    const fields: Record<string, string> = {};
    draft.labels.forEach((label, i) => {if (!label.trim()) fields[rows[i]] = `Category ${i + 1}: enter a name.`;});
    draft.series.forEach((series, j) => {
      if (!series.name.trim()) fields[columns[j]] = `Series ${j + 1}: enter a name.`;
      else if (draft.series.filter(s => s.name.trim() === series.name.trim()).length > 1) fields[columns[j]] = `${series.name}: give each series a different name.`;
      series.values.forEach((value, i) => {
        const key = cellKey(i, j);
        try {if (numericEdits[key] !== undefined) chartNumber(numericEdits[key]);}
        catch (e) {fields[key] = `${series.name || `Series ${j + 1}`} · ${draft.labels[i] || `Category ${i + 1}`}: ${(e as Error).message}`;}
        if (!fields[key] && round && j === (draft.pieSeries ?? 0) && value < 0) fields[key] = `${series.name} · ${draft.labels[i]}: pie and donut values must be nonnegative.`;
      });
      if (round && j === (draft.pieSeries ?? 0) && series.values.every(value => value === 0) && !fields[cellKey(0,j)]) fields[cellKey(0,j)] = `${series.name}: enter at least one value greater than zero for a pie or donut chart.`;
    });
    const first = Object.values(fields)[0];
    if (first) return {fields, message: first, chart: undefined};
    try {return {fields, message: '', chart: validateChart(draft)};} catch (e) {return {fields, message: (e as Error).message, chart: undefined};}
  });
  $effect(() => {if (analysis.chart) lastValid = analysis.chart;});
  const shown = $derived(analysis.chart ?? lastValid);
  const preview = $derived({...seed,fontSize:labelSizeValid?Number(labelSize):initialLabelSize, chart: shown, fill: shown.colors[0]});
  const labelSpacing=$derived(chartLabelLayout(preview,presentationChart(preview)).step);
  const svg = $derived(fontsReady ? renderChartSvg(preview,false,base.onlineFonts?.find(font=>sameFontFamily(font.family,preview.fontFamily))?.category,slide.background) : '');
  onMount(() => {let active = true; void loadLibraryTypography([{...slide, elements: [seed]}], base.fonts,base.onlineFonts).then(() => document.fonts.ready).catch(() => {}).finally(() => {if (active) fontsReady = true;}); return () => {active = false;};});
  const blocked = $derived(!analysis.chart || importing || exporting || !fontsReady || !labelSizeValid || !colorsValid || markErrors.length>0);
  const changed = $derived(!existing || JSON.stringify(analysis.chart ?? draft) !== JSON.stringify(initial)||Number(labelSize)!==initialLabelSize);
  function focusField(key: string, select = true) {
    const focus=()=>{
      const field = workspace?.querySelector<HTMLInputElement>(`[data-chart-field="${key}"]`);
      field?.focus({preventScroll: true});
      if (select) field?.select();
    };
    // Existing cells must focus before the next keystroke; new rows await their DOM.
    if(workspace?.querySelector(`[data-chart-field="${key}"]`))focus();else requestAnimationFrame(focus);
  }
  function revealField(event: FocusEvent) {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || !field.dataset.chartField) return;
    field.scrollIntoView({block: 'nearest', inline: 'nearest'});
    const table = field.closest<HTMLElement>('.chart-table')!, frozen = table.querySelector<HTMLElement>('tbody th');
    if (!field.closest('th,td')?.matches(':first-child') && frozen) {
      const left = frozen.getBoundingClientRect().right + 4;
      if (field.getBoundingClientRect().left < left) table.scrollLeft -= left - field.getBoundingClientRect().left;
    }
    const tableHead = table.querySelector('thead');
    if (tableHead && field.closest('tbody') && field.getBoundingClientRect().top < tableHead.getBoundingClientRect().bottom + 4) table.scrollTop -= tableHead.getBoundingClientRect().bottom + 4 - field.getBoundingClientRect().top;
    const controls = field.closest<HTMLElement>('.chart-controls')!, head = controls.querySelector('.chart-control-head')!;
    const scroller = matchMedia('(max-width:760px)').matches ? workspace : controls;
    if (scroller && field.getBoundingClientRect().top < head.getBoundingClientRect().bottom + 8) scroller.scrollTop -= head.getBoundingClientRect().bottom + 8 - field.getBoundingClientRect().top;
  }
  function moveDown(event: KeyboardEvent, row: number, column: number) {
    if (event.isComposing || event.keyCode === 229 || event.metaKey || event.ctrlKey || event.altKey) return;
    if(event.key==='Tab'){
      // Traverse data fields, keeping row/series delete buttons out of continuous entry.
      const fields=[...columns,...rows.flatMap((key,i)=>[key,...columns.map((_,j)=>cellKey(i,j))])];
      const current=row<0?columns[column]:column<0?rows[row]:cellKey(row,column),next=fields.indexOf(current)+(event.shiftKey?-1:1);
      if(next>=0&&next<fields.length){event.preventDefault();event.stopPropagation();focusField(fields[next]);}
      return;
    }
    if(event.key!=='Enter')return;
    event.preventDefault();
    const next = row + (event.shiftKey ? -1 : 1);
    if (next >= 0 && next < rows.length) focusField(column < 0 ? rows[next] : cellKey(next, column));
    else if (next === -1 && column >= 0) focusField(columns[column]);
  }
  function pasteCells(event: ClipboardEvent, row: number, column: number) {
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!/[\t\r\n]/.test(text)) return;
    event.preventDefault();
    try {
      const data = pasteChartCells(draft, text, row, column);
      for (let i = row; i < row + data.rows; i++) for (let j = Math.max(1, column); j < column + data.columns; j++) {
        const key = cellKey(i, j - 1); numericEdits = Object.fromEntries(Object.entries(numericEdits).filter(([field]) => field !== key));
      }
      change({labels: data.labels, series: data.series}); importError = '';
      status = `Pasted ${countLabel(data.rows * data.columns, 'cell')} · ${countLabel(data.rows, 'row')} × ${countLabel(data.columns, 'column')}`;
    } catch (e) {importError = `${(e as Error).message} Current data is unchanged.`; status = '';}
  }
  function togglePaste() {
    pasteOpen = !pasteOpen;
    requestAnimationFrame(() => {if (pasteOpen) pasteInput?.focus(); else workspace?.querySelector<HTMLButtonElement>('[data-paste-trigger]')?.focus();});
  }
  function change(patch: Partial<Chart>) {draft = {...draft, ...patch,...(patch.colors?{colorRoles:undefined}:{})}; error = '';}
  function cell(i: number, j: number, value: string) {
    const key = cellKey(i, j); numericEdits = {...numericEdits, [key]: value};
    try {const number = chartNumber(value); change({series: draft.series.map((series, index) => index === j ? {...series, values: series.values.map((v, row) => row === i ? number : v)} : series)});} catch { /* Keep the entered value and the last valid preview. */ }
  }
  function forgetFields(key: string) {numericEdits = Object.fromEntries(Object.entries(numericEdits).filter(([field]) => !field.split(':').includes(key)));}
  function removeRow(i: number) {
    forgetFields(rows[i]); rows = rows.filter((_, index) => index !== i);
    change({labels: draft.labels.filter((_, index) => index !== i), series: draft.series.map(s => ({...s, values: s.values.filter((_, index) => index !== i)})), ...(round && draft.colors.length > 1 ? {colors: draft.colors.filter((_, index) => index !== i)} : {})});
    focusField(rows[Math.min(i, rows.length - 1)]);
  }
  function removeSeries(j: number) {forgetFields(columns[j]); columns = columns.filter((_, index) => index !== j); draft = removeChartSeries(draft, j); error = ''; focusField(columns[Math.min(j, columns.length - 1)]);}
  function addRow() {rows = [...rows, ...keys(1)]; change({labels: [...draft.labels, `Item ${draft.labels.length + 1}`], series: draft.series.map(s => ({...s, values: [...s.values, 0]}))}); focusField(rows[rows.length - 1]);}
  function addSeries() {let i = draft.series.length + 1; while (draft.series.some(s => s.name === `Series ${i}`)) i++; columns = [...columns, ...keys(1)]; change({series: [...draft.series, {name: `Series ${i}`, values: draft.labels.map(() => 0)}]}); focusField(columns[columns.length - 1]);}
  function selectType(type: Chart['type']) {draft = changeChartType(draft, type); error = '';}
  function replace(text = paste, source = 'Pasted data') {
    try {
      const data = parseChartData(text);
      const seriesName = draft.series[draft.pieSeries ?? 0]?.name;
      const selected = data.series.findIndex(s => s.name === seriesName);
      change({...data, ...(draft.source.startsWith('Sample data') ? {source: ''} : {}), ...(draft.pieSeries !== undefined ? {pieSeries: selected >= 0 ? selected : Math.max(0, data.series.findIndex(canUsePieSeries))} : {})});
      rows = keys(data.labels.length); columns = keys(data.series.length); numericEdits = {}; importError = '';
      status = `${source} · ${countLabel(data.labels.length, 'category', 'categories')} · ${countLabel(data.series.length, 'series', 'series')}`;
      pasteOpen = false; focusField(rows[0]);
    } catch (e) {importError = `${(e as Error).message} Current data is unchanged.`; status = '';}
  }
  async function importFile(file?: File) {
    if (!file) return; importing = true; importError = ''; status = '';
    try {if (file.size > 250_000) throw new Error('Use a data file smaller than 250 KB.'); replace(decodeChartFile(new Uint8Array(await file.arrayBuffer())), `Imported ${file.name}`);}
    catch (e) {importError = `${(e as Error).message} Current data is unchanged.`;} finally {importing = false; if (input) input.value = '';}
  }
  function fixData() {tab = 'data'; requestAnimationFrame(() => workspace?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus());}
  async function showPreview() {dataExpanded = false; previewOpen = true;await tick();revealWorkspacePreview(workspace);}
  function apply() {
    if (stale || blocked || !changed) return;
    try {
      const chart = validateChart(draft), bindingSeed = seed.design?.fill ? {...seed, fill: deckDesignSystem(base).colors[seed.design.fill]} : seed;
      const sizePatch=Number(labelSize)!==initialLabelSize?{fontSize:Number(labelSize)}:{};
      const patch = {chart,...sizePatch, design: styleOverrides(bindingSeed, {fill: chart.colors[0],...sizePatch}), values: undefined, ...(seed.fill !== chart.colors[0] ? {fill: chart.colors[0]} : {}), name: existing?.name || chart.title || `${chartTypes.find(t => t.id === chart.type)!.label} chart`};
      const revision = editor.deck!.revision;
      editor.commit(existing ? [{op: 'update_element', slideId, elementId: existing.id, patch}] : [{op: 'add_element', slideId, element: {...seed, ...patch, fill: chart.colors[0], x: Math.max(0, Math.min(seed.x, base.width - seed.w)), y: Math.max(0, Math.min(seed.y, base.height - seed.h))}}], '', 'manual', base.revision);
      if (editor.deck!.revision === revision) {error = editor.error; return;}
      editor.sourceMode = false; if (!existing) editor.selected = [seed.id];
      editor.notify(`${existing ? 'Updated' : 'Inserted'} chart · ⌘Z to undo`); onclose();
    } catch (e) {error = (e as Error).message;}
  }
  async function exportSvg() {
    if (!analysis.chart || blocked) return;
    const chart = analysis.chart; exporting = true; error = '';
    try {const svg = await buildChartSvg({...seed,fontSize:labelSizeValid?Number(labelSize):initialLabelSize, chart, fill: chart.colors[0]}, base, svgBackground ? slide.background : undefined); download(svg, `${chartFilename(chart)}.svg`, 'image/svg+xml');}
    catch {error = 'The SVG could not be downloaded. Check the font connection and try again.';} finally {exporting = false;}
  }
  function exportCsv() {if (analysis.chart && !blocked) download(chartCsv(analysis.chart), `${chartFilename(analysis.chart)}-data.csv`, 'text/csv;charset=utf-8');}
</script>

{#snippet fieldError(key: string)}{#if analysis.fields[key]}<span class="sr-only" id={fieldId(key)}>{analysis.fields[key]}</span>{/if}{/snippet}

<Dialog title={existing ? 'Edit chart' : 'Insert chart'} subtitle="Preview locally · Apply when ready" workspace class="chart-dialog" {onclose}>
  <div class="chart-workspace" class:data-expanded={dataExpanded && tab === 'data'} bind:this={workspace}>
    <section class="chart-preview" aria-label="Chart preview" data-workspace-preview tabindex="-1">
      <div class="preview-heading"><span>Preview</span><small>{countLabel(draft.labels.length, 'category', 'categories')} · {countLabel(draft.series.length, 'series', 'series')}</small><button class="text-btn preview-toggle" aria-label={previewOpen ? 'Hide preview' : 'Show preview'} aria-expanded={previewOpen} onclick={() => previewOpen = !previewOpen}>{previewOpen ? 'Hide' : 'Show'}</button></div>
      <div class="preview-content" class:preview-hidden={!previewOpen}>
        <div class="preview-stage">{#if !fontsReady}<FeedbackState state="loading" density="compact" title="Preparing preview…"/>{:else}<div class="preview-chart" style:background={pageBackground(slide.background)} role="img" aria-label={chartDescription(shown)}>{@html svg.replace('<svg role="img"', '<svg aria-hidden="true"')}</div>{/if}</div>
        <p role="status">{analysis.message ? 'Preview shows the last valid chart. Fix the highlighted data to continue.' : shown.source.startsWith('Sample data') ? 'Sample data is illustrative. Add your own data and source.' : 'Downloads use this preview. Apply to save it in the document.'}</p>
        {#if !round&&labelSpacing>1}<p>Labels are spaced to stay readable. All values remain in Data.</p>{/if}
        <div class="chart-downloads"><Button variant="quiet" aria-label="Download SVG" busy={exporting} disabled={blocked} onclick={exportSvg}><Download size={14}/>SVG</Button><Button variant="quiet" aria-label="Download data CSV" disabled={blocked} onclick={exportCsv}><Download size={14}/>Data CSV</Button></div>
        <label class="svg-background"><input type="checkbox" bind:checked={svgBackground} disabled={exporting}/>Slide background in SVG</label>
        {#if round && draft.series.length > 1}<p>CSV includes all series. The chart displays {draft.series[draft.pieSeries ?? 0]?.name}.</p>{/if}
      </div>
    </section>
    <section class="chart-controls" aria-label="Chart settings">
      <fieldset disabled={importing || exporting}>
        <div class="chart-control-head">
          <div class="chart-kind" role="group" aria-label="Chart type">{#each chartTypes as type}<button aria-pressed={draft.type === type.id} title={type.hint} onclick={() => selectType(type.id)}>{type.label}</button>{/each}</div>
          <p class="chart-help type-hint">{chartTypes.find(type => type.id === draft.type)?.hint}.</p>
          <div class="chart-tabs" role="group" aria-label="Chart editor view"><button aria-pressed={tab === 'data'} onclick={() => tab = 'data'}>Data</button><button aria-pressed={tab === 'style'} onclick={() => tab = 'style'}>Style</button></div>
        </div>
        {#if round}
          <label class="field-label">Shown series<select aria-label="Shown series" value={draft.pieSeries ?? 0} onchange={event => change({pieSeries: Number(event.currentTarget.value)})}>{#each draft.series as series, j}<option value={j}>{series.name || `Series ${j + 1}`}{canUsePieSeries(series) ? '' : ' · Check values'}</option>{/each}</select></label>
          <p class="chart-help">Pie and donut display one series. All data stays available when you switch back.</p>
        {/if}
        {#if tab === 'data'}
          <div class="data-tools"><Button variant="quiet" busy={importing} onclick={() => input?.click()}><Upload size={14}/>Import CSV</Button><Button variant="quiet" class="expand-data" aria-pressed={dataExpanded} onclick={() => dataExpanded = !dataExpanded}><Maximize2 size={14}/>{dataExpanded ? 'Show preview' : 'Expand data'}</Button><Button variant="quiet" data-paste-trigger aria-expanded={pasteOpen} aria-controls={`${instanceId}-paste`} onclick={togglePaste}><Clipboard size={14}/>Paste data</Button><input bind:this={input} type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" hidden aria-label="Chart CSV file" onchange={event => importFile(event.currentTarget.files?.[0])}/></div>
          {#if pasteOpen}<div class="paste-data" id={`${instanceId}-paste`}>
            <p class="chart-help">Include a header row: category, then series names. This replaces the table; chart styling stays.</p>
            <label class="field-label">Data<textarea bind:this={pasteInput} bind:value={paste} rows="5" placeholder={'Category,Revenue,Cost\nQ1,32,24\nQ2,48,36'} aria-label="Paste chart data"></textarea></label>
            <div class="data-tools"><Button variant="secondary" disabled={!paste.trim()} onclick={() => replace()}>Replace data</Button><Button variant="quiet" onclick={togglePaste}>Close paste</Button></div>
          </div>{/if}
          {#if status}<p class="import-status" role="status">{status}</p>{/if}
          {#if importError}<Notice tone="error" title="Data could not be imported" message={importError}>{#snippet actions()}<Button variant="secondary" onclick={() => {importError = ''; status = 'Kept current data';}}>Keep current data</Button>{/snippet}</Notice>{/if}
          <!-- Keyboard scrolling is available in the data region. -->
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div class="chart-table" role="region" aria-label="Scrollable chart data" aria-describedby={`${instanceId}-table-help`} tabindex="0" onfocusin={revealField}><table><thead><tr><th scope="col">Category</th>
            {#each draft.series as series, j (columns[j])}<th scope="col"><div class="series-heading"><input data-chart-field={columns[j]} aria-label={`Series ${j + 1} name`} aria-invalid={Boolean(analysis.fields[columns[j]])} aria-describedby={analysis.fields[columns[j]] ? fieldId(columns[j]) : undefined} value={series.name} maxlength="100" onkeydown={event => moveDown(event,-1,j)} oninput={event => change({series: draft.series.map((s, index) => index === j ? {...s, name: event.currentTarget.value} : s)})}/><button class="icon-btn" data-tone="danger" aria-label={`Remove series ${j + 1}`} disabled={draft.series.length <= 1} onclick={() => removeSeries(j)}><Trash2 size={13}/></button></div>{@render fieldError(columns[j])}</th>{/each}
            <th scope="col"><span class="sr-only">Remove category</span></th></tr></thead><tbody>
            {#each draft.labels as item, i (rows[i])}<tr><th scope="row"><input data-chart-field={rows[i]} aria-label={`Category ${i + 1}`} aria-invalid={Boolean(analysis.fields[rows[i]])} aria-describedby={analysis.fields[rows[i]] ? fieldId(rows[i]) : undefined} value={item} maxlength="100" onkeydown={event => moveDown(event,i,-1)} onpaste={event => pasteCells(event,i,0)} oninput={event => change({labels: draft.labels.map((s, index) => index === i ? event.currentTarget.value : s)})}/>{@render fieldError(rows[i])}</th>
            {#each draft.series as series, j (columns[j])}<td><NumberField compact prefix="" preset="data" label={`${series.name || `Series ${j + 1}`}, category ${i + 1}`} step="any" inputAttributes={{'data-chart-field':cellKey(i,j),inputmode:'decimal'}} invalid={Boolean(analysis.fields[cellKey(i,j)])} descriptionId={analysis.fields[cellKey(i,j)] ? fieldId(cellKey(i,j)) : undefined} value={numericEdits[cellKey(i,j)] ?? series.values[i]} onkeydown={event=>moveDown(event,i,j)} onpaste={event=>pasteCells(event,i,j+1)} oninput={raw=>cell(i,j,raw)} onchange={value=>cell(i,j,String(value))}/>{@render fieldError(cellKey(i,j))}</td>{/each}
            <td><button class="icon-btn" data-tone="danger" aria-label={`Remove category ${i + 1}`} disabled={draft.labels.length <= 1} onclick={() => removeRow(i)}><Trash2 size={14}/></button></td></tr>{/each}
          </tbody></table></div>
          <p class="chart-help" id={`${instanceId}-table-help`}>Tab moves across · Enter moves down · Shift reverses. Paste a spreadsheet range into any data cell.</p>
          {#if analysis.message}<Notice tone="error" title="Check chart data" message={analysis.message}>{#snippet actions()}<Button variant="secondary" onclick={fixData}>Fix data</Button>{/snippet}</Notice>{/if}
          <div class="data-tools"><Button variant="quiet" aria-label="Add category" disabled={draft.labels.length >= 100} onclick={addRow}><Plus size={14}/>Category</Button><Button variant="quiet" aria-label="Add series" disabled={draft.series.length >= 8} onclick={addSeries}><Plus size={14}/>Series</Button></div>
          <p class="chart-help">CSV or TSV · Up to 250 KB, 100 categories and 8 series.</p>
        {:else}
          <ChartStyleChoices chart={draft} onchoose={patch=>{markNumbers={};change(patch);}}/>
          <NumberField label="Chart label size" prefix="Size" preset="font" unit="px" min={18} max={28} step="any" value={labelSize} invalid={!labelSizeValid} oninput={raw=>labelSize=raw} onchange={value=>labelSize=value}/>{#if !labelSizeValid}<p class="chart-error">Use a label size from 18 to 28 px.</p>{/if}
          <label class="field-label">Title<input value={draft.title} maxlength="200" aria-label="Chart title" oninput={event => change({title: event.currentTarget.value})}/></label>
          <label class="field-label">Subtitle<input value={draft.subtitle} maxlength="300" aria-label="Chart subtitle" oninput={event => change({subtitle: event.currentTarget.value})}/></label>
          <label class="field-label">Source note<input value={draft.source} maxlength="300" aria-label="Chart source note" oninput={event => change({source: event.currentTarget.value})}/></label>
          <div class="palette-choices" role="group" aria-label="Chart palette">{#each chartPalettes as palette}<button aria-label={`${palette.name} palette`} aria-pressed={JSON.stringify(draft.colors) === JSON.stringify(palette.colors)} onclick={() => change({colors: [...palette.colors]})}>{#each palette.colors.slice(0,4) as color}<i style:background={color}></i>{/each}<span>{palette.name}</span></button>{/each}</div>
          <div class="series-colors">{#each (round ? draft.labels : draft.series.map(s => s.name)) as name, i}<div class="series-color"><span>{name || `Item ${i+1}`}</span><ColorField label={`Color ${i + 1}`} value={draft.colors[i % draft.colors.length]} onvaliditychange={valid=>colorValidity={...colorValidity,[`series-${i}`]:valid}} allowClear={false} onchange={value => {const colors = [...draft.colors]; while (colors.length <= i) colors.push(draft.colors[colors.length % draft.colors.length]); colors[i] = value; change({colors});}}/></div>{/each}<div class="series-color"><span>Text</span><ColorField label="Chart text color" value={draft.textColor} onvaliditychange={valid=>colorValidity={...colorValidity,text:valid}} allowClear={false} onchange={textColor => change({textColor})}/></div><div class="series-color"><span>Value labels</span><ColorField label="Value label color" value={draft.dataLabels?.color??draft.textColor} disabled={!draft.showValues} allowClear={false} onvaliditychange={valid=>colorValidity={...colorValidity,labels:valid}} onchange={color=>change({dataLabels:{...draft.dataLabels,color}})}/></div></div>
          <div class="chart-toggles"><label><input type="checkbox" checked={draft.legend} onchange={event => change({legend: event.currentTarget.checked})}/>Legend</label><label><input type="checkbox" checked={draft.showValues} onchange={event => change({showValues: event.currentTarget.checked})}/>Value labels</label>{#if !round}<label><input type="checkbox" checked={draft.grid} onchange={event => change({grid: event.currentTarget.checked})}/>Grid lines</label><label><input type="checkbox" checked={draft.stacked} onchange={event => change({stacked: event.currentTarget.checked})}/>Stack series</label>{/if}</div>
          <details use:uiDisclosure class="chart-disclosure" bind:open={markOpen}><summary>Mark style<ChevronDown size={14}/></summary><div>
            {#if round}<label class="field-label">Donut hole (%)<input aria-label="Donut hole" type="range" min="10" max="90" step="1" value={draft.visual?.donutHole??58} disabled={draft.type!=='donut'} oninput={event=>change({visual:{...draft.visual,donutHole:Number(event.currentTarget.value)}})}/><span>{draft.visual?.donutHole??58}%</span></label><NumberField label="Slice rotation" prefix="Rotation" min={0} max={360} unit="°" value={draft.visual?.pieRotation??0} onchange={value=>change({visual:{...draft.visual,pieRotation:value}})}/><label class="field-label">Value labels<select aria-label="Pie value labels" value={draft.dataLabels?.valueMode??'percent'} onchange={event=>change({dataLabels:{...draft.dataLabels,valueMode:event.currentTarget.value as 'value'|'percent'|'both'}})}><option value="percent">Percentage</option><option value="value">Value</option><option value="both">Value and percentage</option></select></label>{#if draft.dataLabels?.valueMode!=='value'}<NumberField label="Percentage decimals" prefix="Decimals" min={0} max={4} step={1} value={draft.dataLabels?.percentDecimals??draft.numberFormat?.decimals??2} onchange={value=>change({dataLabels:{...draft.dataLabels,percentDecimals:value}})}/>{/if}
            {:else if draft.type==='line'||draft.type==='area'}<div class="format-fields"><NumberField label="Chart line width" prefix="Line width" preset="stroke" unit="px" min={1} max={8} value={markNumbers.lineWidth??draft.visual?.lineWidth??3} invalid={markErrors.includes('lineWidth')} oninput={raw=>{markNumbers={...markNumbers,lineWidth:raw};const n=Number(raw);if(raw.trim()&&n>=1&&n<=8)change({visual:{...draft.visual,lineWidth:n}});}} onchange={value=>{markNumbers={...markNumbers,lineWidth:String(value)};change({visual:{...draft.visual,lineWidth:value}});}}/><NumberField label="Chart point size" prefix="Point size" preset="radius" unit="px" min={0} max={16} value={markNumbers.pointSize??draft.visual?.pointSize??7} invalid={markErrors.includes('pointSize')} oninput={raw=>{markNumbers={...markNumbers,pointSize:raw};const n=Number(raw);if(raw.trim()&&n>=0&&n<=16)change({visual:{...draft.visual,pointSize:n}});}} onchange={value=>{markNumbers={...markNumbers,pointSize:String(value)};change({visual:{...draft.visual,pointSize:value}});}}/></div><label class="smooth-toggle"><input type="checkbox" checked={draft.visual?.smooth??false} onchange={event=>change({visual:{...draft.visual,smooth:event.currentTarget.checked}})}/>Smooth line</label><p>Smooth curves imply values between data points.</p>{#if draft.type==='area'}<label class="field-label">Fill opacity<input aria-label="Chart area opacity" type="range" min="0" max="100" value={(draft.visual?.areaOpacity??.2)*100} oninput={event=>change({visual:{...draft.visual,areaOpacity:Number(event.currentTarget.value)/100}})}/></label>{/if}
            {:else}<label class="field-label">Corner radius<input aria-label="Chart corner radius" type="range" min="0" max="16" value={draft.visual?.cornerRadius??0} disabled={draft.stacked} oninput={event=>change({visual:{...draft.visual,cornerRadius:Number(event.currentTarget.value)}})}/><span>{draft.visual?.cornerRadius??0} px</span></label>{#if draft.stacked}<p>Stacked bars keep square edges so segments meet.</p>{/if}{/if}
          </div></details>
          <details use:uiDisclosure class="chart-disclosure"><summary>Axes and number format<ChevronDown size={14}/></summary><div>{#if !round}<label class="field-label">Category axis<input aria-label="Category axis title" value={draft.categoryTitle} maxlength="80" oninput={event => change({categoryTitle: event.currentTarget.value})}/></label><label class="field-label">Value axis<input aria-label="Value axis title" value={draft.valueTitle} maxlength="80" oninput={event => change({valueTitle: event.currentTarget.value})}/></label>{/if}<div class="format-fields"><label class="field-label">Prefix<input aria-label="Value prefix" value={draft.prefix} maxlength="12" placeholder="$" oninput={event => change({prefix: event.currentTarget.value})}/></label><label class="field-label">Suffix<input aria-label="Value suffix" value={draft.suffix} maxlength="12" placeholder="%" oninput={event => change({suffix: event.currentTarget.value})}/></label></div><div class="format-fields"><label class="field-label">Decimal places<select aria-label="Chart decimal places" value={draft.numberFormat?.decimals??'auto'} onchange={event=>change({numberFormat:{...draft.numberFormat,decimals:event.currentTarget.value==='auto'?undefined:Number(event.currentTarget.value)}})}><option value="auto">Auto</option>{#each [0,1,2,3,4] as n}<option value={n}>{n}</option>{/each}</select></label><label class="grouping-toggle"><input type="checkbox" checked={draft.numberFormat?.grouping??false} onchange={event=>change({numberFormat:{...draft.numberFormat,grouping:event.currentTarget.checked}})}/>Group thousands</label></div><label class="grouping-toggle"><input type="checkbox" checked={draft.numberFormat?.percent??false} onchange={event=>change({numberFormat:{...draft.numberFormat,percent:event.currentTarget.checked}})}/>Percentage format · 0.25 → 25%</label>{#if !round}<label class="grouping-toggle"><input type="checkbox" checked={draft.categoryReverse??false} onchange={event=>change({categoryReverse:event.currentTarget.checked})}/>Reverse categories</label><label class="grouping-toggle"><input type="checkbox" checked={draft.valueReverse??false} onchange={event=>change({valueReverse:event.currentTarget.checked})}/>Reverse values</label>{/if}<p>Formatting changes labels; source values stay unchanged.</p></div></details>
        {/if}
      </fieldset>
    </section>
  </div>
  {#snippet footer()}<DialogFooter>
    {#snippet info()}<div>{#if stale}<Notice tone="warning" message="The document changed. Close and reopen this chart."/>{:else if analysis.message}<span class="chart-error">{Object.keys(analysis.fields).length ? `Check ${countLabel(Object.keys(analysis.fields).length, 'field')}.` : 'Check chart data.'}</span><button class="text-btn" onclick={fixData}>Fix data</button>{:else if !labelSizeValid||!colorsValid||markErrors.length}<span class="chart-error">Check chart style.</span>{#if tab!=='style'||markErrors.length}<button class="text-btn" onclick={()=>{tab='style';markOpen=markErrors.length>0;}}>Fix style</button>{/if}{:else if error}<Notice tone="error" title="Chart could not finish" message={error}/>{:else}<span role="status">{exporting ? 'Preparing SVG…' : importing ? 'Importing data…' : !changed ? 'No changes to apply.' : 'Apply to save · Undo is available'}</span>{/if}</div>{/snippet}
    {#snippet actions()}<Button variant="quiet" class={`mobile-preview-action ${dataExpanded && tab === 'data' ? 'data-preview-action' : ''}`} aria-label="Preview" title="Preview chart" onclick={showPreview}><Eye size={14}/><span class="preview-action-label">Preview</span></Button><Button variant="secondary" onclick={onclose}>Cancel</Button><Button variant="primary" aria-label={existing ? 'Apply changes' : 'Insert chart'} disabled={stale || blocked || !changed} onclick={apply}>{#if existing}<span class="apply-label-full">Apply changes</span><span class="apply-label-short">Apply</span>{:else}Insert chart{/if}</Button>{/snippet}
  </DialogFooter>{/snippet}
</Dialog>

<style>
  .chart-workspace,.chart-controls,.chart-preview{scroll-padding-block:16px}
  .chart-workspace{display:grid;grid-template-columns:minmax(0,1fr) minmax(360px,440px);min-height:0;flex:1}
  .chart-workspace.data-expanded{grid-template-columns:1fr}.data-expanded .chart-preview{display:none}.data-expanded .chart-table{max-height:480px}:global(.chart-dialog .data-preview-action){display:inline-flex}
  .chart-preview{display:flex;flex-direction:column;gap:16px;padding:24px;background:var(--bg-secondary);min-width:0;overflow:auto;scrollbar-gutter:stable;}
  .preview-heading{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;font-size:var(--ui-label);color:var(--text-secondary)}
  .preview-heading small,.chart-preview p,.chart-help,.chart-disclosure p,.import-status{font-size:var(--ui-meta);color:var(--text-secondary);line-height:var(--ui-line-reading)}
  .preview-content{display:flex;flex-direction:column;gap:16px;flex:none}.preview-toggle{display:none}
  .preview-stage{flex:none;min-height:140px;display:grid;place-items:center}
  .preview-chart{width:100%;border:1px solid var(--border-subtle)}.preview-chart :global(svg){display:block;width:100%;height:auto}
  .svg-background{display:flex;align-items:center;gap:8px;font-size:var(--ui-meta);color:var(--text-secondary);min-height:32px}
  .chart-downloads,.data-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .chart-controls{padding:24px;overflow:auto;border-left:1px solid var(--border-subtle);min-width:0;scrollbar-gutter:stable;}
  fieldset{display:flex;flex-direction:column;gap:16px;min-width:0;padding:0;margin:0;border:0}
  .chart-control-head{display:flex;flex-direction:column;gap:12px;position:sticky;top:0;z-index:4;background:var(--dialog-surface)}
  .type-hint{margin:0}
  .paste-data{display:flex;flex-direction:column;gap:12px}.paste-data>p{margin:0}
  .chart-kind{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}
  .chart-kind button,.chart-tabs button,.palette-choices button{min-height:36px;font-size:var(--ui-label);padding:8px;border-radius:var(--r-control);background:transparent;border:1px solid var(--border-subtle);color:var(--text-secondary)}
  button[aria-pressed='true']{background:var(--state-selected);color:var(--text-link);border-color:var(--accent-line)}
  .chart-tabs{display:flex;gap:4px}.chart-tabs button{flex:1;border:0}
  .chart-table{max-height:360px;overflow:auto;border:1px solid var(--border-subtle);border-radius:var(--r-control);scroll-padding:4px;scrollbar-gutter:stable;}
  table{border-collapse:separate;border-spacing:0;width:100%;font-size:var(--ui-label)}
  th,td{padding:4px;border-bottom:1px solid var(--border-subtle);text-align:left;font-weight:400;background:var(--dialog-surface)}
  thead th{position:sticky;top:0;z-index:2}
  .chart-table thead th,.chart-table tbody th{background:var(--dialog-surface)}
  th:first-child{position:sticky;left:0;z-index:1}thead th:first-child{z-index:3}
  th input{width:100%;min-width:100px;min-height:36px;padding:6px;font-size:var(--ui-label);background:var(--field-surface);border:1px solid var(--field-border)}
  input[aria-invalid='true']{border-color:var(--danger-text)}
  input[type='checkbox']{width:16px;min-width:16px;height:16px;margin:0;flex:0 0 16px}
  .series-heading{display:flex;align-items:center}.series-heading input{min-width:108px}
  td :global(.number-property){min-width:112px}td :global(.number-field input){text-align:right}
  .chart-disclosure summary{display:flex;align-items:center;justify-content:space-between;gap:8px;list-style:none;min-height:36px;cursor:pointer;font-size:var(--ui-label);color:var(--text-secondary)}
  .chart-disclosure summary::-webkit-details-marker{display:none}.chart-disclosure>div{display:flex;flex-direction:column;gap:12px;padding-top:8px}
  .field-label{gap:4px;margin:0}.field-label select,.field-label textarea{min-height:36px;background:var(--field-surface);border-color:var(--field-border)}
  .field-label textarea{resize:vertical;min-height:100px}
  .palette-choices{display:flex;gap:8px;flex-wrap:wrap}.palette-choices button{display:flex;align-items:center;gap:2px;flex:1;flex-wrap:wrap;justify-content:center}.palette-choices span{width:100%;margin-top:4px}.palette-choices i{width:12px;height:12px;border-radius:2px}
  .series-colors{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.series-color{display:flex;flex-direction:column;gap:4px;min-width:0;overflow-wrap:anywhere;font-size:var(--ui-label)}
  .chart-toggles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.chart-toggles label{display:flex;align-items:center;gap:8px;font-size:var(--ui-label);min-height:32px}
  .smooth-toggle,.grouping-toggle{display:flex;align-items:center;gap:8px;font-size:var(--ui-label);min-height:36px}
  .format-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.chart-error{color:var(--danger-text)}
  :global(.mobile-preview-action){display:none}
  .apply-label-short{display:none}
  @media(max-width:760px){.chart-workspace :global(.expand-data){display:none}.chart-workspace.data-expanded .chart-preview{display:flex}.chart-workspace{display:flex;flex-direction:column;overflow:auto;scrollbar-gutter:stable;}.chart-preview{padding:16px;gap:8px;flex:none;overflow:visible}.preview-content{gap:8px}.preview-toggle{display:inline-flex}.preview-hidden{display:none}.preview-stage{min-height:0}.preview-chart :global(svg){max-height:200px}.chart-controls{padding:16px;border-left:0;border-top:1px solid var(--border-subtle);overflow:visible;flex:none}.chart-table{max-height:300px}.chart-control-head{position:static;padding:0}.chart-workspace :global(.mobile-preview-action){display:inline-flex}:global(.chart-dialog .mobile-preview-action){display:inline-flex}}
  @media(max-width:360px){.preview-action-label,.apply-label-full{display:none}.apply-label-short{display:inline}:global(.chart-dialog .dialog-footer-actions > .mobile-preview-action){min-width:44px;width:44px;padding:8px}}
  @media(max-width:760px){.chart-workspace .chart-table input[data-chart-field]{min-block-size:max(44px,1lh + 12px)}.chart-table .series-heading input{width:80px;min-width:max(80px,7em)}}
  @media(max-width:760px),(pointer:coarse){.chart-workspace :is(input,select,textarea):not([type='color']):not([type='checkbox']):not([type='range']){font-size:max(16px,var(--ui-label))}}
  @media(max-width:760px),(pointer:coarse){.chart-kind button,.chart-tabs button,.palette-choices button,.chart-disclosure summary,.field-label select,th input,.chart-toggles label,.svg-background,.series-heading button,td button,.preview-toggle{min-height:44px}.series-colors{grid-template-columns:1fr}}
</style>
