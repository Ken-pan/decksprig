import {nativeColorXml} from './pptx-color';
import {preserveTableTextFlags} from './pptx-table-text';
import {isTextShape, shapeTextElement} from './shape-text';
import {customShapeXml, shadowXml, lineStyleXml} from './shape-pptx';
import JSZip from 'jszip';
import type { Deck, SlideElement, TextRun } from './model';
import {writePptxTextMetadata} from './pptx-text-metadata';
import {renderedPptxTextStyles} from './pptx-text-styles';
import {yieldForInput} from './text-layout';
const xml = (s: string) => s.replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!));
const emu = (n: number) => Math.round(n * 9525);
/** PptxGenJS can emit a series-axis reference for a 2-D chart without that axis.
 * Keep references only when the chart actually contains the corresponding axis. */
export function normalizeNativeChartAxes(source:string):string{
  const axes=new Set([...source.matchAll(/<c:(?:catAx|valAx|dateAx|serAx)>[\s\S]*?<c:axId val="(\d+)"\s*\/>/g)].map(m=>m[1]));
  return source.replace(/<c:(barChart|lineChart|areaChart)>[\s\S]*?<\/c:\1>/g,chart=>chart.replace(/<c:axId val="(\d+)"\s*\/>/g,(ref,id)=>axes.has(id)?ref:''));
}
export function normalizeNativeChartXml(source:string):string{
  return normalizeNativeChartAxes(source).replace(/<c:lineChart>[\s\S]*?<\/c:lineChart>/g,chart=>{
    if(!chart.includes('<c:grouping'))chart=chart.replace('<c:lineChart>','<c:lineChart><c:grouping val="standard"/>');
    return chart.replace(/<c:ser>[\s\S]*?<\/c:ser>/g,series=>{
      series=series.replace(/<c:invertIfNegative[^>]*\/>/g,'');
      const marker=series.match(/<c:marker>[\s\S]*?<\/c:marker>/)?.[0];
      if(marker)series=series.replace(marker,'').replace(/<c:(?:dPt|dLbls|trendline|errBars|cat|val|smooth)\b/,marker+'$&');
      return series;
    });
  });
}
export function textBodyXml(e: SlideElement,binding?:{fill?:string;font?:'mj'|'mn';absoluteLineSpacing?:boolean}) {
  e=renderedPptxTextStyles(e);
  const p = e.padding ?? {left:0,right:0,top:0,bottom:0};
  const runProperties = (r: TextRun, tag = 'rPr') => {
    const fill = r.color ?? e.fill, size = r.fontSize ?? e.fontSize, textCase=r.textCase??e.textCase;
    const props = `cap="${textCase==='upper'?'all':textCase==='small-caps'?'small':'none'}" sz="${Math.round(size*75)}" b="${(r.fontWeight ?? (r.bold === undefined ? e.fontWeight : r.bold ? 700 : 400))>=600?1:0}" i="${(r.italic ?? e.italic)?1:0}" u="${(r.underline ?? e.underline)?'sng':'none'}" strike="${(r.strikethrough??e.strikethrough)?'sngStrike':'noStrike'}" spc="${Math.round((r.letterSpacing??e.letterSpacing)*75)}"${r.baseline && r.baseline!=='normal' ? ` baseline="${r.baseline==='super'?30000:-25000}"` : ''}`;
    const pigment=nativeColorXml(fill,e.opacity,!r.color?binding?.fill:undefined);
    const latin=!r.fontFamily&&binding?.font?`+${binding.font}-lt`:r.fontFamily??e.fontFamily,ea=!r.fontFamily&&binding?.font?`+${binding.font}-ea`:r.fontFamily??e.fontFamily;
    return `<a:${tag} ${props}>${fill==='transparent'?'<a:noFill/>':`<a:solidFill>${pigment}</a:solidFill>`}<a:latin typeface="${xml(latin)}"/><a:ea typeface="${xml(ea)}"/></a:${tag}>`;
  };
  const run = (r: TextRun) => {
    const style=runProperties(r);
    return r.text.split('\n').map((v,i)=>`${i?`<a:br>${style}</a:br>`:''}<a:r>${style}<a:t xml:space="preserve">${xml(v)}</a:t></a:r>`).join('');
  };
  const paragraphs = e.paragraphs ?? [{runs:e.runs??[{text:e.text}],align:e.align,lineHeight:e.lineHeight,spaceBefore:0,spaceAfter:0,indent:0,firstLineIndent:0}];
  const bulletXml=(glyph?:string)=>{
    if(!glyph)return '<a:buNone/>';
    const number=glyph.match(/^(\d+)([.)])$/)??glyph.match(/^\((\d+)\)$/);
    if(number)return `<a:buAutoNum type="${glyph.startsWith('(')?'arabicParenBoth':glyph.endsWith(')')?'arabicParenR':'arabicPeriod'}" startAt="${Number(number[1])}"/>`;
    return `<a:buChar char="${xml(glyph)}"/>`;
  };
  // Keynote interprets an omitted fit rule as shape autofit and moves/resizes
  // fixed text boxes. Explicit normal fit preserves the authored box.
  const minimumHeight = paragraphs.reduce((sum, p, i) => {
    const visible=p.runs.filter(r=>r.text.length);
    const size = visible.length ? Math.max(...visible.map(r=>r.fontSize??e.fontSize)) : e.fontSize;
    const lines = p.runs.map(r=>r.text).join('').split('\n').length;
    return sum + lines * (p.lineSpacing ?? size * (p.lineHeight ?? e.lineHeight))
      + (e.paragraphSpacingAtEdges===false && i===0 ? 0 : p.spaceBefore)
      + (e.paragraphSpacingAtEdges===false && i===paragraphs.length-1 ? 0 : p.spaceAfter);
  },0) + p.top + p.bottom;
  // A source can intentionally overflow a fixed text box. Normal fit would
  // silently shrink that text in Keynote; keep its authored size instead.
  const fit = e.maxLines!==undefined ? '<a:noAutofit/>' : e.textSizing === 'auto-height' || e.textFit==='shape' ? '<a:spAutoFit/>' : e.textFit==='none' || minimumHeight > e.h + 1 ? '<a:noAutofit/>' : '<a:normAutofit fontScale="100000" lnSpcReduction="0"/>';
  // Auto-height text must remain visible when a reader's font metrics exceed
  // the measured browser box. A fixed box or explicit clip retains its crop.
  const overflow=e.clipText===false||(binding?.absoluteLineSpacing||e.clipText!==true)&&e.textSizing==='auto-height';
  return `<p:txBody><a:bodyPr spcFirstLastPara="${e.paragraphSpacingAtEdges===false?0:1}" vertOverflow="${e.maxLines!==undefined?'ellipsis':overflow?'overflow':'clip'}" wrap="${e.wrap && e.textSizing !== 'auto-width'?'square':'none'}" lIns="${emu(p.left)}" rIns="${emu(p.right)}" tIns="${emu(p.top)}" bIns="${emu(p.bottom)}" anchor="${e.verticalAlign==='middle'?'ctr':e.verticalAlign==='bottom'?'b':'t'}">${fit}</a:bodyPr><a:lstStyle/>${paragraphs.map(p=>{const lineSpacing=p.lineSpacing??(binding?.absoluteLineSpacing?Math.max(e.fontSize,...p.runs.map(run=>run.fontSize??e.fontSize))*(p.lineHeight??e.lineHeight):undefined);return `<a:p><a:pPr algn="${({left:'l',center:'ctr',right:'r',justify:'just'})[p.align]}" marL="${emu(p.indent)}" indent="${emu(p.firstLineIndent)}"><a:lnSpc>${lineSpacing?`<a:spcPts val="${Math.round(lineSpacing*75)}"/>`:`<a:spcPct val="${Math.round((p.lineHeight??e.lineHeight)*100000)}"/>`}</a:lnSpc><a:spcBef><a:spcPts val="${Math.round(p.spaceBefore*75)}"/></a:spcBef><a:spcAft><a:spcPts val="${Math.round(p.spaceAfter*75)}"/></a:spcAft>${bulletXml(p.bullet)}${runProperties(p.runs.find(r=>r.text.length)??p.runs[0]??{text:''},'defRPr')}</a:pPr>${p.runs.map(run).join('')}${runProperties(p.endStyle??p.runs.filter(r=>r.text.length).at(-1)??p.runs[0]??{text:''},'endParaRPr')}</a:p>`;}).join('')}</p:txBody>`;
}
export async function preservePptxFidelity(data: Uint8Array, deck: Deck, authored=deck) {
  const zip = await JSZip.loadAsync(data);
  let chartPainter:typeof import('./pptx-chart-paint')|undefined;
  for(const [i,slide] of deck.slides.entries()){
    const rels=await zip.file(`ppt/slides/_rels/slide${i+1}.xml.rels`)?.async('string');if(!rels)continue;
    const paths=[...rels.matchAll(/Type="[^"]*\/chart" Target="([^"]+)"/g)].map(m=>m[1].startsWith('/')?m[1].slice(1):'ppt/'+m[1].replace(/^\.\.\//,''));
    const charts=slide.elements.filter(e=>e.type==='chart'&&!e.hidden);
    for(const [j,path] of paths.entries()){
      const element=charts[j],file=zip.file(path);if(!element||!file)continue;const chart=element.chart;
      let source=await file.async('string');
      if(chart&&['line','area'].includes(chart.type))source=source.replace(/<c:(lineChart|areaChart)>/,(_,kind)=>`<c:${kind}><c:grouping val="${chart.stacked?'stacked':'standard'}"/>`).replace(/(<c:grouping[^>]*\/>)(?:\s*<c:grouping[^>]*\/>)+/,'$1');
      if(chart&&chart.forecastFrom!==undefined){let index=0;source=source.replace(/<c:ser>[\s\S]*?<\/c:ser>/g,ser=>{const forecast=index++>=chart.series.length;return ser.replace(/<c:spPr>[\s\S]*?<\/c:spPr>/,pr=>pr.replace(/<a:prstDash val="[^"]*"\/>/,`<a:prstDash val="${forecast?'dash':'solid'}"/>`));});}
      chartPainter??=await import('./pptx-chart-paint');
      zip.file(path,chartPainter.paintNativeChart(source,element));
    }
  }
  for(const path of Object.keys(zip.files).filter(p=>/^ppt\/charts\/chart\d+\.xml$/.test(p)))zip.file(path,normalizeNativeChartXml(await zip.file(path)!.async('string')));
  // A missing forecast value is a blank cell, not an empty numeric value.
  for(const path of Object.keys(zip.files).filter(p=>/^ppt\/embeddings\/.*\.xlsx$/.test(p))){
    const workbook=await JSZip.loadAsync(await zip.file(path)!.async('uint8array'));let changed=false;
    for(const sheet of Object.keys(workbook.files).filter(p=>/^xl\/worksheets\/sheet\d+\.xml$/.test(p))){const source=await workbook.file(sheet)!.async('string'),next=source.replace(/<c\b([^>]*)><v>\s*<\/v><\/c>/g,'<c$1/>');if(next!==source){workbook.file(sheet,next);changed=true;}}
    if(changed)zip.file(path,await workbook.generateAsync({type:'uint8array',compression:'DEFLATE'}));
  }
  let deadline = performance.now() + 8;
  for (let i=0;i<deck.slides.length;i++) {
    if (performance.now() >= deadline) { await yieldForInput(); deadline = performance.now() + 8; }
    const path = `ppt/slides/slide${i+1}.xml`, file=zip.file(path); if(!file)continue;
    let source = await file.async('string');
    const elements=new Map(deck.slides[i].elements.map(e=>[e.id,e]));
    source=source.replace(/<p:(sp|pic)>[\s\S]*?<\/p:\1>/g, (shape: string) => {
      const id=shape.match(/<p:cNvPr[^>]* name="([^"]+)"/)?.[1], e=id ? elements.get(id):undefined; if(!e)return shape;
      if(e.type==='text'||e.type!=='line'&&isTextShape(e)&&Boolean(e.text)){
        const body=textBodyXml(isTextShape(e)?shapeTextElement(e):e);
        shape=/<p:txBody>/.test(shape)?shape.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/,body):shape.replace('</p:sp>',body+'</p:sp>');
      }
      if(e.flipX||e.flipY)shape=shape.replace(/<a:xfrm([^>]*)>/, (_,attrs)=>`<a:xfrm${attrs} flipH="${e.flipX?1:0}" flipV="${e.flipY?1:0}">`);
      if(e.type==='image'&&e.crop){const c=e.crop,crop=`<a:srcRect l="${Math.round(c.left*100000)}" r="${Math.round(c.right*100000)}" t="${Math.round(c.top*100000)}" b="${Math.round(c.bottom*100000)}"/>`;shape=/<a:srcRect[^>]*\/>/.test(shape)?shape.replace(/<a:srcRect[^>]*\/>/,crop):shape.replace('<a:stretch>',crop+'<a:stretch>');}
      if(e.type==='rect'&&e.radius)shape=shape.replace(/<a:prstGeom prst="roundRect">[\s\S]*?<\/a:prstGeom>/,`<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.min(50000,Math.round(e.radius/Math.min(e.w,e.h)*100000))}"/></a:avLst></a:prstGeom>`);
      if(e.type==='line'&&e.line || e.type==='rect'&&e.shape || e.type==='diamond'&&e.radius)shape=shape.replace(/<a:prstGeom\b[^>]*>[\s\S]*?<\/a:prstGeom>/,customShapeXml(e));
      if(e.shadow)shape=shape.replace(/<p:spPr>([\s\S]*?)<\/p:spPr>/,(_,properties)=>`<p:spPr>${properties.replace(/<a:effectLst(?:\s[^>]*)?\/>|<a:effectLst\b[^>]*>[\s\S]*?<\/a:effectLst>/g,'')}${shadowXml(e)}</p:spPr>`);
      if(e.type==='line')shape=shape.replace(/<a:ln\b[^>]*>[\s\S]*?<\/a:ln>/,lineStyleXml(e));
      if(e.type==='line')shape=shape.replaceAll('p:sp>','p:cxnSp>').replaceAll('p:nvSpPr','p:nvCxnSpPr').replace(/<p:cNvSpPr[^>]*\/>/,'<p:cNvCxnSpPr/>').replace(/<p:txBody>[\s\S]*?<\/p:txBody>/,'');
      return shape;
    });
    source=await preserveTableTextFlags(source,deck.slides[i],deck.designSystem);
    zip.file(path, source);
  }
  // Native fallback regions can share one large slide render with different crops.
  // PptxGenJS writes one copy per object; retain the original bytes once instead.
  const seen = new Map<string,string>(), duplicates = new Map<string,string>();
  for (const path of Object.keys(zip.files).filter(p=>/^ppt\/media\/[^/]+\.(png|jpe?g|gif|webp|svg)$/i.test(p))) {
    const bytes = await zip.file(path)!.async('uint8array');
    const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
    const key = path.split('.').at(-1)!.toLowerCase() + ':' + Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    const first = seen.get(key);
    if (first) duplicates.set(path.slice('ppt/media/'.length),first.slice('ppt/media/'.length));
    else seen.set(key,path);
  }
  if (duplicates.size) {
    for (const path of Object.keys(zip.files).filter(p=>p.endsWith('.rels'))) {
      let relations = await zip.file(path)!.async('string');
      relations = relations.replace(/Target="([^"]*\/media\/)([^"/]+)"/g,(raw,prefix,name)=>duplicates.has(name)?`Target="${prefix}${duplicates.get(name)}"`:raw);
      zip.file(path,relations);
    }
    const contentTypes = zip.file('[Content_Types].xml');
    if (contentTypes) zip.file('[Content_Types].xml',(await contentTypes.async('string')).replace(/<Override\b[^>]*PartName="\/ppt\/media\/([^"/]+)"[^>]*\/>/g,(raw,name)=>duplicates.has(name)?'':raw));
    for (const name of duplicates.keys()) zip.remove('ppt/media/'+name);
  }
  await writePptxTextMetadata(zip,deck,authored);
  for(const [path,file] of Object.entries(zip.files))if(/^ppt\/media\/[^/]+\.(jpe?g|gif|webp)$/i.test(path))file.options.compression='STORE';
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:3}});
}
