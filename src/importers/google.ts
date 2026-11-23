import { element, newDeck, blankSlide, type SlideElement, type TextRun, type TextParagraph } from '../core/model';
import {tableColumnStyle} from '../core/table-columns';
import type {TableCellStyle} from '../core/table-schema';
const pt = (d: any) => Number(d?.magnitude ?? 0) * (d?.unit === 'EMU' ? 1 / 12700 : 1);
const rgb = (c: any) => `#${[c?.red ?? 0, c?.green ?? 0, c?.blue ?? 0].map(n => Math.round(n * 255).toString(16).padStart(2, '0')).join('')}`;
type Matrix = {a: number; b: number; c: number; d: number; x: number; y: number};
const identity: Matrix = {a: 1, b: 0, c: 0, d: 1, x: 0, y: 0};
// V8's transcendental results can differ by a final bit between Chrome and
// Node. Keep source angles stable for the native export's strict state hash.
const degrees = (y: number, x: number) => Math.round(Math.atan2(y, x) * 180 / Math.PI * 1e9) / 1e9;
export function importGoogle(bundle: any) {
  const p = bundle.presentation;
  if (!p?.slides?.length || !pt(p.pageSize?.width)) throw new Error('The Google Slides data has no page dimensions or slides.');
  const factor = 1440 / pt(p.pageSize.width), width = 1440, height = pt(p.pageSize.height) * factor;
  const pages = [...p.slides, ...(p.layouts ?? []), ...(p.masters ?? [])];
  const all = new Map<string, any>();
  const index = (e: any) => { all.set(e.objectId, e); (e.elementGroup?.children ?? []).forEach(index); };
  pages.forEach(page => (page.pageElements ?? []).forEach(index));
  const inherit = (e: any, seen = new Set<string>()): any[] => {
    const id = e?.shape?.placeholder?.parentObjectId;
    if (!id || seen.has(id) || !all.has(id)) return [e];
    seen.add(id); return [...inherit(all.get(id), seen), e];
  };
  const slides = p.slides.map((n: any, i: number) => {
    const s = blankSlide(), warnings = new Set<string>();
    if (n.slideProperties?.isSkipped === true) s.hidden = true;
    warnings.add(bundle.nativeExportWarning || 'Converted with the Google API. Exact text box margins and some masks are unavailable through the API. Import a Google-exported PPTX to recover more layout properties.');
    const layout = pages.find(v => v.objectId === n.slideProperties?.layoutObjectId), master = pages.find(v => v.objectId === n.slideProperties?.masterObjectId);
    const colors = Object.assign({}, ...[master, layout, n].map(page => Object.fromEntries((page?.pageProperties?.colorScheme?.colors ?? []).map((v: any) => [v.type, rgb(v.color?.rgbColor ?? v.color)]))));
    const color = (v: any, fallback = '#000000') => v?.rgbColor ? rgb(v.rgbColor) : colors[v?.themeColor] ?? fallback;
    const bg = [n,layout,master].map(v => v?.pageProperties?.pageBackgroundFill).find(v => v && v.propertyState !== 'INHERIT');
    s.background = color(bg?.solidFill?.color, '#ffffff');
    if (bg?.stretchedPictureFill) warnings.add('Review the slide background image against the source reference.');
    const visit = (e: any, parent: Matrix = identity, decoration = false) => {
      if (decoration && e.shape?.placeholder) return;
      const t = e.transform ?? {}, unit = t.unit === 'EMU' ? 1 / 12700 : 1;
      // Protobuf JSON omits zero-valued matrix components; only an absent
      // transform is identity. A rotated object can contain shear fields alone.
      const local = {a: Number(t.scaleX ?? (e.transform ? 0 : 1)), b: Number(t.shearY ?? 0), c: Number(t.shearX ?? 0), d: Number(t.scaleY ?? (e.transform ? 0 : 1)), x: Number(t.translateX ?? 0) * unit, y: Number(t.translateY ?? 0) * unit};
      const m = {a: parent.a * local.a + parent.c * local.b, b: parent.b * local.a + parent.d * local.b, c: parent.a * local.c + parent.c * local.d, d: parent.b * local.c + parent.d * local.d, x: parent.a * local.x + parent.c * local.y + parent.x, y: parent.b * local.x + parent.d * local.y + parent.y};
      if (e.elementGroup) { e.elementGroup.children.forEach((x: any) => visit(x, m, decoration)); return; }
      const w = pt(e.size?.width), h = pt(e.size?.height), sx = Math.hypot(m.a, m.b), sy = Math.hypot(m.c, m.d), rw = Math.max(1, w * sx * factor), rh = Math.max(1, h * sy * factor);
      const common = {name: e.title || 'Google object', x: (m.x + m.a * w / 2 + m.c * h / 2) * factor - rw / 2, y: (m.y + m.b * w / 2 + m.d * h / 2) * factor - rh / 2, w: rw, h: rh, rotation: degrees(m.b, m.a), flipY: m.a * m.d - m.b * m.c < 0, sourceId: e.objectId};
      const nativeRegion = () => {
        const corners=[[0,0],[w,0],[0,h],[w,h]].map(([x,y])=>({x:(m.x+m.a*x+m.c*y)*factor,y:(m.y+m.b*x+m.d*y)*factor}));
        const x=Math.max(0,Math.min(...corners.map(v=>v.x))),y=Math.max(0,Math.min(...corners.map(v=>v.y))),r=Math.min(width,Math.max(...corners.map(v=>v.x))),b=Math.min(height,Math.max(...corners.map(v=>v.y)));
        if(r<=x||b<=y)return null;
        return {...common,x,y,w:r-x,h:b-y,rotation:0,flipY:false,sourceRegion:{left:x/width,top:y/height,right:1-r/width,bottom:1-b/height}};
      };
      if (Math.abs(m.a * m.c + m.b * m.d) > .001) warnings.add('Review skew transforms against the source reference.');
      if (e.shape) {
        const chain = inherit(e), shape = e.shape, props = Object.assign({}, ...chain.map(v => v.shape?.shapeProperties));
        const basicShape=['TEXT_BOX','RECTANGLE','ELLIPSE','ROUND_RECTANGLE','FLOW_CHART_TERMINATOR','FLOW_CHART_DECISION','DIAMOND'].includes(shape.shapeType);
        if (shape.shapeType && !basicShape) {
          const region=nativeRegion();if(region)s.elements.push(element('image',{...region,name:`Source shape · ${shape.shapeType}`}));
          warnings.add(`Shape ${shape.shapeType}  is preserved as a source image region. You can move and resize it; paths and internal text are not independently editable${bundle.renders?.[n.objectId]?'':'. Attach a source PDF.'}`);return;
        }
        const fill = props.shapeBackgroundFill?.solidFill, outline = props.outline;
        if ((fill && props.shapeBackgroundFill.propertyState !== 'NOT_RENDERED') || (outline?.propertyState === 'RENDERED')) s.elements.push(element(shape.shapeType === 'ELLIPSE' ? 'ellipse' : ['FLOW_CHART_DECISION','DIAMOND'].includes(shape.shapeType) ? 'diamond' : 'rect', {...common, radius:shape.shapeType==='FLOW_CHART_TERMINATOR'?Math.min(common.w,common.h)/2:shape.shapeType==='ROUND_RECTANGLE'?Math.min(common.w,common.h)/6:0, fill: fill ? color(fill.color) : 'transparent', opacity: fill?.alpha ?? 1, stroke: outline?.propertyState === 'RENDERED' ? color(outline.outlineFill?.solidFill?.color) : 'transparent', strokeWidth: pt(outline?.weight) * factor}));
        const parents = chain.slice(0, -1).flatMap(v => v.shape?.text?.textElements ?? []), text = shape.text?.textElements ?? [];
        const defaultText = Object.assign({}, ...parents.filter(v => v.textRun).map(v => v.textRun.style)), defaultP = Object.assign({}, ...parents.filter(v => v.paragraphMarker).map(v => v.paragraphMarker.style));
        const fontScale = Number(props.autofit?.fontScale ?? 1), unitScale = factor * fontScale;
        const makeRun = (r: any, content: string): TextRun => {
          const st = {...defaultText, ...r.style};
          const family = st.weightedFontFamily?.fontFamily ?? st.fontFamily ?? 'Arial';
          return {text: content.replace(/\u000b/g, '\n'), fontFamily: family, fontSize: Math.max(4, (pt(st.fontSize) || 18) * unitScale), fontWeight: st.bold ? Math.max(700, st.weightedFontFamily?.weight ?? 400) : st.weightedFontFamily?.weight ?? 400, bold: st.bold, italic: st.italic ?? false, underline: st.underline ?? false, strikethrough:st.strikethrough||undefined, color: color(st.foregroundColor?.opaqueColor), baseline: st.baselineOffset === 'SUPERSCRIPT' ? 'super' : st.baselineOffset === 'SUBSCRIPT' ? 'sub' : 'normal'};
        };
        const markers = text.filter((v: any) => v.paragraphMarker), runs = text.filter((v: any) => v.textRun);
        const paragraphs: TextParagraph[] = (markers.length ? markers : [{startIndex: 0, endIndex: Infinity, paragraphMarker: {}}]).map((v: any) => {
          const st = {...defaultP, ...v.paragraphMarker.style}, start = v.startIndex ?? 0, end = v.endIndex;
          const ps: TextRun[] = runs.flatMap((r: any) => { const a = r.startIndex ?? 0, b = r.endIndex ?? a + r.textRun.content.length; const lo = Math.max(start, a), hi = Math.min(end, b); return hi > lo ? [makeRun(r.textRun, r.textRun.content.slice(lo - a, hi - a))] : []; });
          const terminal=ps.at(-1),endStyle=terminal?.text.endsWith('\n')?{...terminal,text:''}:undefined;
          if (ps.length) ps[ps.length - 1].text = ps[ps.length - 1].text.replace(/\n$/, '');
          while(ps.length>1&&!ps[ps.length-1].text)ps.pop();
          return {runs: ps, endStyle, align: ({CENTER: 'center', END: 'right', JUSTIFIED: 'justify'} as any)[st.alignment] ?? 'left', lineHeight: Number(st.lineSpacing ?? 100) / 100, spaceBefore: pt(st.spaceAbove) * unitScale, spaceAfter: pt(st.spaceBelow) * unitScale, indent: pt(st.indentStart) * unitScale, firstLineIndent: (pt(st.indentFirstLine) - pt(st.indentStart)) * unitScale, bullet: v.paragraphMarker.bullet?.glyph};
        });
        const content = paragraphs.map(v => v.runs.map(r => r.text).join('')).join('\n'), first = paragraphs[0]?.runs[0];
        if (content) {
          const pad = 3 * unitScale;
          const attrs: Partial<SlideElement> = {...common, text: content, paragraphs, clipText:false, textFit:props.autofit?.autofitType==='TEXT_AUTOFIT'?'normal':props.autofit?.autofitType==='SHAPE_AUTOFIT'?'shape':'none', fontFamily: first?.fontFamily, fontSize: first?.fontSize, fontWeight: first?.fontWeight, fill: first?.color, verticalAlign: props.contentAlignment === 'MIDDLE' ? 'middle' : props.contentAlignment === 'BOTTOM' ? 'bottom' : 'top', padding: {left: pad, right: pad, top: pad, bottom: pad}};
          s.elements.push(element('text', attrs));
        }
      } else if (e.image && (bundle.assets?.[e.objectId] || e.image.contentUrl)) {
        const c = e.image.imageProperties?.cropProperties;
        const crop = c ? {left: c.leftOffset ?? 0, right: c.rightOffset ?? 0, top: c.topOffset ?? 0, bottom: c.bottomOffset ?? 0} : undefined;
        const valid = crop && Object.values(crop).every(v => v >= 0 && v < 1) && crop.left + crop.right < 1 && crop.top + crop.bottom < 1;
        if (c?.angle || (crop && !valid)) warnings.add('Review rotated or extended image crops.');
        const native = c ? nativeRegion() : null;
        if(c)warnings.add('The original image and cropped source region are preserved. The region needs a slide reference image; mask and crop details are not independently editable.');
        s.elements.push(element('image', {...common,...native, src: bundle.assets?.[e.objectId] || e.image.contentUrl, fit: 'fill', crop: valid ? crop : undefined}));
      } else if (e.sheetsChart && (bundle.assets?.[e.objectId] || e.sheetsChart.contentUrl)) {
        s.elements.push(element('image',{...common,name:'Google Sheets chart · Source image',src:bundle.assets?.[e.objectId] || e.sheetsChart.contentUrl,fit:'fill'})); warnings.add('Embedded charts are preserved as source images. Edit the data in the original Google Sheet.');
      } else if (e.table) {
        const cells = e.table.tableRows?.map((r: any) => r.tableCells.map((c: any) => (c.text?.textElements ?? []).map((x: any) => x.textRun?.content ?? '').join(''))) ?? [];
        const style=e.table.tableRows?.[0]?.tableCells?.[0]?.text?.textElements?.find((v:any)=>v.textRun)?.textRun?.style ?? {};
        const underline=Boolean(style.underline),strikethrough=Boolean(style.strikethrough),imported=element('table', {...common, cells,fontFamily:style.weightedFontFamily?.fontFamily ?? style.fontFamily ?? 'Arial',fontWeight:style.bold?700:style.weightedFontFamily?.weight??400,fontSize:(pt(style.fontSize)||18)*factor,fill:color(style.foregroundColor?.opaqueColor),underline,strikethrough});
        const cellStyles:TableCellStyle[]=(e.table.tableRows??[]).flatMap((row:any,r:number)=>row.tableCells.flatMap((cell:any,c:number)=>{const s=cell.text?.textElements?.find((v:any)=>v.textRun)?.textRun?.style??{},u=Boolean(s.underline),strike=Boolean(s.strikethrough);return u!==underline||strike!==strikethrough?[{row:r,column:c,underline:u,strikethrough:strike}]:[];}));
        if(cellStyles.length)imported.tableStyle={...tableColumnStyle(imported,Array.from({length:Math.max(1,...cells.map((row:string[])=>row.length))},()=>1)),cellStyles};
        s.elements.push(imported); warnings.add('Per-cell text decorations are preserved. Review other table styles, merged cells and cell dimensions.');
      } else if (e.line) {
        const dx=(m.a*w+m.c*h)*factor,dy=(m.b*w+m.d*h)*factor, length=Math.hypot(dx,dy);
        s.elements.push(element('line', {...common,x:m.x*factor+dx/2-length/2,y:m.y*factor+dy/2-.5,w:Math.max(1,length),h:1,rotation:degrees(dy,dx),flipY:false,stroke: color(e.line.lineProperties?.lineFill?.solidFill?.color), strokeWidth: Math.max(1, pt(e.line.lineProperties?.weight) * factor)}));
      }
      else if(e.video){const region=nativeRegion();if(region)s.elements.push(element('image',{...region,name:'Google video · Source poster'}));warnings.add('The video poster is preserved as a source region. Play or edit the video in Google Slides.');}
      else warnings.add('Embedded charts and other objects remain in the source reference.');
    };
    (master?.pageElements ?? []).forEach((e: any) => visit(e, identity, true));
    (layout?.pageElements ?? []).forEach((e: any) => visit(e, identity, true));
    (n.pageElements ?? []).forEach((e: any) => visit(e));
    s.source = {provider: 'Google Slides', render: bundle.renders?.[n.objectId], fidelity: 'converted', warnings: [...warnings], nodeId: n.objectId};
    return s;
  });
  const d = newDeck(p.title || 'Google Slides', slides, width, height);
  d.provenance = {provider: 'Google Slides', url: bundle.url, importedAt: new Date().toISOString(),pageSize:{width:pt(p.pageSize.width),height:pt(p.pageSize.height),canvasWidth:width,canvasHeight:height}}; return d;
}
