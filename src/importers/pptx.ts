import {loadBoundedZip, readZipBytes, readZipXml, releaseZipBytes} from '../core/safe-zip';
import { XMLParser } from 'fast-xml-parser';
import { element, newDeck, blankSlide, type TextParagraph, type TextRun, type Deck } from '../core/model';
import {readPptxTextMetadata,pptxTextBodyDigests,pptxSourceTextStyle,pptxTextStyleMatches} from '../core/pptx-text-metadata';
import {importPptxTable,pptxBodyText} from './pptx-table';
import {importPptxChart} from './pptx-chart';
import {orderedAlphaTransforms,pptxColor,pptxTextProperties} from './pptx-color';

function bytesBase64(bytes: Uint8Array) { let text = ''; for (let i=0;i<bytes.length;i+=8192) text += String.fromCharCode(...bytes.subarray(i,i+8192)); return btoa(text); }
const arr = (x: any): any[] => x === undefined ? [] : Array.isArray(x) ? x : [x];
const parser = new XMLParser({ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false, trimValues: false});
const orderedParser = new XMLParser({ignoreAttributes: false, preserveOrder: true, parseTagValue: false, trimValues: false});
const textValue=(value:any)=>typeof value==='string'||typeof value==='number'?String(value):'';
const objectId = (n: any) => n.nvSpPr?.cNvPr?.id ?? n.nvPicPr?.cNvPr?.id ?? n.nvGrpSpPr?.cNvPr?.id ?? n.nvCxnSpPr?.cNvPr?.id ?? n.nvGraphicFramePr?.cNvPr?.id;
function preserveShapeOrder(raw: string, document: any) {
  const orders = new Map<string, {kind: string; id: string}[]>();
  const texts = new Map<string, any[][]>();
  const tables = new Map<string, any>();
  const astObject = (items: any[]): any => {
    if (items.length === 1 && '#text' in items[0]) return items[0]['#text'];
    const obj: any = {};
    for (const item of items) for (const [key, value] of Object.entries(item)) {
      if (key === ':@') continue;
      const child:any = {...(item[':@'] ?? {}), ...(Array.isArray(value) ? astObject(value) : {})};
      if(['a:srgbClr','a:schemeClr','a:sysClr'].includes(key)&&Array.isArray(value)){const alpha=orderedAlphaTransforms(value);if(alpha.length)child.__alphaTransforms=alpha;}
      if((key==='a:txBody'||key==='p:txBody')&&Array.isArray(value))child.__contents=bodyContents(value);
      const v = Array.isArray(value) && value.length === 1 && '#text' in value[0] ? value[0]['#text'] : child;
      if (obj[key] === undefined) obj[key] = v; else obj[key] = [...arr(obj[key]), v];
    }
    return clean(obj);
  };
  const bodyContents=(body:any[])=>body.filter(x=>x['a:p']).map(x=>x['a:p'].flatMap((child:any)=>Object.entries(child).filter(([key])=>['a:r','a:br','a:fld'].includes(key)).map(([key,value])=>({kind:key.slice(2),node:{...clean(child[':@']??{}),...astObject(value as any[])}}))));
  const astId = (list: any[]): string | undefined => {
    for (const item of list) for (const [key, value] of Object.entries(item)) {
      if (key.endsWith(':cNvPr')) return item[':@']?.['@_id'];
      if (Array.isArray(value)) { const id = astId(value); if (id) return id; }
    }
  };
  const walkAst = (list: any[],target:any) => {
    const counts:Record<string,number>={};
    for (const item of list) for (const [key, value] of Object.entries(item)) if (Array.isArray(value)) {
      const kind = key.replace(/^\w+:/, '');
      const child=arr(target?.[kind])[counts[kind]??0];counts[kind]=(counts[kind]??0)+1;
      if(['srgbClr','schemeClr','sysClr'].includes(kind)&&child&&typeof child==='object'){const alpha=orderedAlphaTransforms(value);if(alpha.length)child.__alphaTransforms=alpha;}
      if (kind === 'sp') {
        const body = value.find((x: any) => x['p:txBody'])?.['p:txBody'];
        if (body) texts.set(astId(value)!, body.filter((x: any) => x['a:p']).map((x: any) => x['a:p'].flatMap((child: any) => Object.entries(child).filter(([k]) => ['a:r','a:br','a:fld'].includes(k)).map(([k,v]) => ({kind: k.slice(2), node: {...clean(child[':@'] ?? {}), ...astObject(v as any[])}})))));
      }
      if(kind==='graphicFrame'){const table=astObject(value).graphic?.graphicData?.tbl;if(table)tables.set(astId(value)!,table);}
      if (kind === 'spTree' || kind === 'grpSp') {
        const sequence = value.flatMap(child => Object.entries(child)
          .filter(([k]) => ['sp','pic','cxnSp','grpSp','graphicFrame'].includes(k.replace(/^\w+:/, '')))
          .map(([k, v]) => ({kind: k.replace(/^\w+:/, ''), id: astId(v as any[])!})));
        orders.set(kind === 'spTree' ? 'root' : astId(value)!, sequence);
      }
      walkAst(value,child);
    }
  };
  walkAst(orderedParser.parse(raw),document);
  const mark = (n: any) => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) return n.forEach(mark); if (n.txBody && texts.has(objectId(n))) n.txBody.__contents = texts.get(objectId(n)); if(n.graphic?.graphicData?.tbl&&tables.has(objectId(n)))n.graphic.graphicData.tbl=tables.get(objectId(n)); for (const [key, value] of Object.entries(n)) { if (key === 'spTree') (value as any).__order = orders.get('root'); if (key === 'grpSp') for (const group of arr(value)) group.__order = orders.get(objectId(group)); mark(value); } };
  mark(document);
}
function clean(x: any): any {
  if (Array.isArray(x)) return x.map(clean);
  if (!x || typeof x !== 'object') return x;
  return Object.fromEntries(Object.entries(x).map(([key, value]) => [key === '@_r:id' ? 'rid' : key.replace(/^@_/, '').replace(/^\w+:/, ''), clean(value)]));
}
function resolveZip(from: string, target: string) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = from.split('/'); parts.pop();
  for (const p of target.split('/')) { if (p === '..') parts.pop(); else if (p !== '.') parts.push(p); }
  return parts.join('/');
}
export async function importPptx(data: ArrayBuffer | Uint8Array, name: string, sourceReady?: () => void): Promise<Deck> {
  const zip = await loadBoundedZip(data);
  // Relationships may reuse one image hundreds of times. Encode the original
  // bytes once and release its inflated ZIP buffer after the URI owns the data.
  const media = new Map<string, Promise<string>>();
  const imageUri = (path: string, mime: string) => {
    let pending = media.get(path);
    if (!pending) {
      pending = (async () => {
        try { return `data:image/${mime};base64,${bytesBase64(await readZipBytes(zip,path))}`; }
        finally { releaseZipBytes(zip,path); }
      })();
      media.set(path,pending);
    }
    return pending;
  };
  if (Object.keys(zip.files).length > 15000) throw new Error('This PPTX contains too many files. Import it in smaller batches.');
  const xml = async (path: string) => { const f = zip.file(path); if (!f) return {}; const raw = await readZipXml(zip, path); const parsed = clean(parser.parse(raw)); if (raw.includes('spTree')||raw.includes(':alpha')) preserveShapeOrder(raw, parsed); return parsed; };
  const rels = async (path: string) => {
    const parts = path.split('/'); const f = parts.pop();
    const r = await xml(`${parts.join('/')}/_rels/${f}.rels`);
    return Object.fromEntries(arr(r.Relationships?.Relationship).map((x: any) => [x.Id, {...x, path: resolveZip(path, x.Target)}]));
  };
  // Slide layouts, masters, and themes are shared within a presentation.
  // Their parsed trees are read-only during object extraction.
  const sharedXml = new Map<string, Awaited<ReturnType<typeof xml>>>();
  const sharedRelationships = new Map<string, Awaited<ReturnType<typeof rels>>>();
  async function reuse<T>(cache: Map<string, T>, path: string, read: (path: string) => Promise<T>) {
    if (cache.has(path)) return cache.get(path)!;
    const value = await read(path);
    if (cache.size >= 24) cache.delete(cache.keys().next().value!);
    cache.set(path, value);
    return value;
  }
  const presentation = (await xml('ppt/presentation.xml')).presentation;
  if (!presentation) throw new Error('This file could not be read as a PPTX.');
  const pRel = await rels('ppt/presentation.xml');
  const ids = arr(presentation.sldIdLst?.sldId);
  if (ids.length > 500) throw new Error('Import up to 500 slides at a time.');
  const slidePaths = ids.map(id => {
    const path = pRel[id.rid]?.path;
    if (!path) throw new Error('A PPTX slide relationship is missing.');
    return path;
  });
  // A separate converter still validates the complete archive before use.
  if (sourceReady && slidePaths.length && slidePaths.every(path => zip.file(path))) sourceReady();
  const metadata=await readPptxTextMetadata(zip),aspect=Number(presentation.sldSz?.cy ?? 6858000)/Number(presentation.sldSz?.cx ?? 12192000);
  const width = metadata&&Math.abs(metadata.canvasHeight/metadata.canvasWidth-aspect)<.0001?metadata.canvasWidth:1440, height = Math.round(width * aspect);
  const scale = width / Number(presentation.sldSz?.cx ?? 12192000);
  const ptScale = Number(presentation.sldSz?.cx ?? 12192000) / 914400 / width;
  const presentationTheme = Object.values(pRel).find((r: any) => r.Type?.endsWith('/theme')) as any;
  const fallbackTheme = (await reuse(sharedXml, presentationTheme?.path ?? 'ppt/theme/theme1.xml', xml)).theme;
  const slides = [];
  for (const path of slidePaths) {
    const raw = (await xml(path)).sld;
    const relations = await rels(path);
    const layoutPath = Object.values(relations).find((r: any) => r.Type?.endsWith('/slideLayout')) as any;
    const layout = layoutPath ? (await reuse(sharedXml, layoutPath.path, xml)).sldLayout : null;
    const layoutRel = layoutPath ? await reuse(sharedRelationships, layoutPath.path, rels) : {};
    const masterPath = Object.values(layoutRel).find((r: any) => r.Type?.endsWith('/slideMaster')) as any;
    const master = masterPath ? (await reuse(sharedXml, masterPath.path, xml)).sldMaster : null;
    const masterRel = masterPath ? await reuse(sharedRelationships, masterPath.path, rels) : {};
    const themeRel = Object.values(masterRel).find((r: any) => r.Type?.endsWith('/theme')) as any;
    const theme = themeRel ? (await reuse(sharedXml, themeRel.path, xml)).theme : fallbackTheme;
    const scheme = theme?.themeElements?.clrScheme ?? {};
    const colors: Record<string, string> = {};
    for (const [k, v] of Object.entries(scheme)) colors[k] = pptxColor(v,{}, {},'#333333',true).slice(1);
    const defaultMap = {bg1:'lt1',tx1:'dk1',bg2:'lt2',tx2:'dk2'};
    const override = raw.clrMapOvr?.overrideClrMapping ?? (raw.clrMapOvr?.masterClrMapping !== undefined ? undefined : layout?.clrMapOvr?.overrideClrMapping);
    const mapping: Record<string,string> = {...defaultMap, ...master?.clrMap, ...override};
    const warnings = new Set<string>();
    const paint=(node:any,fallback='transparent')=>pptxColor(node,colors,mapping,fallback,true);
    const color = paint;
    const bodyFont = theme?.themeElements?.fontScheme?.minorFont?.latin?.typeface || 'Arial';
    const displayFont = theme?.themeElements?.fontScheme?.majorFont?.latin?.typeface || bodyFont;
    const font = (value: string) => value?.startsWith('+mj') ? displayFont : value?.startsWith('+mn') ? bodyFont : value || bodyFont;
    const s = blankSlide();
    if (['0', 'false'].includes(String(raw.show))) s.hidden = true;
    s.background = color(raw?.cSld?.bg?.bgPr?.solidFill ?? layout?.cSld?.bg?.bgPr?.solidFill ?? master?.cSld?.bg?.bgPr?.solidFill, '#ffffff');
    const placeholder = (n: any) => n?.nvSpPr?.nvPr?.ph;
    const layoutPh = (ph: any) => arr(layout?.cSld?.spTree?.sp).find(n => { const p = placeholder(n); return p && (p.idx ?? '0') === (ph?.idx ?? '0'); });
    const masterPh = (ph: any) => arr(master?.cSld?.spTree?.sp).find(n => { const p = placeholder(n); return p && (p.type ?? 'body') === (ph?.type ?? 'body'); });
    const parseTree = async (tree: any, relationships: any, parent = {sx: 1, sy: 1, x: 0, y: 0}, decoration = false) => {
      if (!tree) return;
      const ordered: {kind: string; node: any}[] = tree.__order ? tree.__order.map((o: any) => ({kind: o.kind, node: arr(tree[o.kind]).find(n => objectId(n) === o.id)})) : Object.entries(tree).filter(([kind]) => ['sp', 'pic', 'cxnSp', 'grpSp', 'graphicFrame'].includes(kind)).flatMap(([kind, nodes]) => arr(nodes).map(node => ({kind, node})));
      for (const {kind, node: n} of ordered) {
          if (!n) continue;
          if (kind === 'grpSp') {
            const t = n.grpSpPr?.xfrm;
            const sx = Number(t?.ext?.cx ?? 1) / Math.max(1, Number(t?.chExt?.cx ?? t?.ext?.cx ?? 1));
            const sy = Number(t?.ext?.cy ?? 1) / Math.max(1, Number(t?.chExt?.cy ?? t?.ext?.cy ?? 1));
            await parseTree(n, relationships, {sx: parent.sx * sx, sy: parent.sy * sy, x: parent.x + (Number(t?.off?.x ?? 0) - Number(t?.chOff?.x ?? 0) * sx) * parent.sx, y: parent.y + (Number(t?.off?.y ?? 0) - Number(t?.chOff?.y ?? 0) * sy) * parent.sy}, decoration);
            if (t?.rot) warnings.add('Review group rotation.');
            continue;
          }
          if (decoration && placeholder(n)) continue;
          const ph = placeholder(n), inherited = ph ? layoutPh(ph) : null, masterShape = ph ? masterPh(placeholder(inherited) ?? ph) : null;
          const t = n.spPr?.xfrm ?? n.xfrm ?? inherited?.spPr?.xfrm ?? masterShape?.spPr?.xfrm;
          if (!t) { warnings.add('Some objects have no independent position and remain in the source reference.'); continue; }
          const common = {x: (Number(t.off?.x ?? 0) * parent.sx + parent.x) * scale, y: (Number(t.off?.y ?? 0) * parent.sy + parent.y) * scale,
            w: Math.max(1, Number(t.ext?.cx ?? 2000000) * parent.sx * scale), h: Math.max(1, Number(t.ext?.cy ?? 1000000) * parent.sy * scale), rotation: Number(t.rot ?? 0) / 60000, flipX: t.flipH === '1', flipY: t.flipV === '1',
            name: n.nvSpPr?.cNvPr?.name ?? n.nvPicPr?.cNvPr?.name ?? n.nvGraphicFramePr?.cNvPr?.name ?? n.nvCxnSpPr?.cNvPr?.name ?? 'Imported object', sourceId: objectId(n)};
          const nativeRegion = () => {
            const angle=common.rotation*Math.PI/180, cos=Math.abs(Math.cos(angle)),sin=Math.abs(Math.sin(angle));
            const bw=common.w*cos+common.h*sin,bh=common.w*sin+common.h*cos;
            const x=Math.max(0,common.x+common.w/2-bw/2),y=Math.max(0,common.y+common.h/2-bh/2);
            const right=Math.min(width,common.x+common.w/2+bw/2),bottom=Math.min(height,common.y+common.h/2+bh/2);
            if(right<=x||bottom<=y)return null;
            return {...common,x,y,w:right-x,h:bottom-y,rotation:0,flipX:false,flipY:false,sourceRegion:{left:x/width,top:y/height,right:Math.max(0,1-right/width),bottom:Math.max(0,1-bottom/height)}};
          };
          if (kind === 'pic') {
            const r = relationships[n.blipFill?.blip?.embed]; const f = r && zip.file(r.path);
            if (!f || r.TargetMode === 'External') { warnings.add('Linked image not loaded.'); continue; }
            const ext = r.path.split('.').pop()?.toLowerCase();
            const mime = ({png: 'png', jpg: 'jpeg', jpeg: 'jpeg', webp: 'webp', gif: 'gif', svg: 'svg+xml'} as any)[ext!];
            if (!mime) { const region=nativeRegion();if(region)s.elements.push(element('image',region));warnings.add('Vector images such as EMF and WMF remain source regions. Attach a PDF exported from the original app.'); continue; }
            const c = n.blipFill?.srcRect;
            const crop = c ? {left: Number(c.l ?? 0) / 100000, top: Number(c.t ?? 0) / 100000, right: Number(c.r ?? 0) / 100000, bottom: Number(c.b ?? 0) / 100000} : undefined;
            const validCrop = crop && Object.values(crop).every(v => v >= 0 && v < 1) && crop.left + crop.right < 1 && crop.top + crop.bottom < 1;
            if (crop && !validCrop) warnings.add('This image has an extended crop. Review it against the source reference.');
            const mask=n.spPr?.prstGeom?.prst, nativeMask=(mask && mask!=='rect')||n.spPr?.custGeom;
            if(nativeMask)warnings.add(`Image mask ${mask || 'Custom path'}  is preserved as a source region. The original image and crop are retained.`);
            s.elements.push(element('image', {...common,...(nativeMask?nativeRegion():null), src: await imageUri(f.name,mime), fit: 'fill', crop: validCrop ? crop : undefined}));
          } else if (kind === 'graphicFrame') {
            const table = n.graphic?.graphicData?.tbl;
            if (table) {
              const imported=importPptxTable(table,common,{xScale:scale*parent.sx,yScale:scale*parent.sy,points:value=>value/72/ptScale,font,color,textColor:paint,warn:message=>warnings.add(message)});
              if(imported)s.elements.push(imported);else{const region=nativeRegion();if(region)s.elements.push(element('image',region));}
            } else if(n.graphic?.graphicData?.chart){
              const relation=relationships[n.graphic.graphicData.chart.rid];
              const imported=relation&&relation.TargetMode!=='External'&&relation.Type?.endsWith('/chart')&&zip.file(relation.path)?importPptxChart(await readZipXml(zip,relation.path),common,{points:value=>value/72/ptScale,font,color,warn:message=>warnings.add(message)}):undefined;
              if(imported)s.elements.push(imported);else{const region=nativeRegion();if(region)s.elements.push(element('image',region));warnings.add('This chart remains a source reference. Attach a source PDF if its reference is unavailable.');}
            } else warnings.add('Embedded objects remain in the source render.');
          } else {
            const pr = n.spPr ?? {};
            const preset = pr.prstGeom?.prst ?? (kind === 'cxnSp' ? 'line' : undefined);
            if(preset==='line'&&Number(t.ext?.cy)===0)common.y-=.5;
            if ((preset && !['rect','roundRect','flowChartTerminator','diamond','flowChartDecision','ellipse','line'].includes(preset)) || pr.custGeom) {
              const region=nativeRegion();if(region)s.elements.push(element('image',region));
              warnings.add(`Shape ${preset || 'Custom path'}  is preserved as a source image region. You can move and resize it; paths and internal text are not independently editable.`);continue;
            }
            if (pr.gradFill || pr.effectLst || pr.custGeom) warnings.add('Custom paths, gradients, and effects remain in the source render.');
            const adjustment=arr(pr.prstGeom?.avLst?.gd).find(v=>v.name==='adj')?.fmla?.match(/^val (\d+)$/)?.[1];
            const radius=preset==='flowChartTerminator'?Math.min(common.w,common.h)/2:preset==='roundRect'?Math.min(common.w,common.h)*Math.min(50000,Number(adjustment??16667))/100000:0;
            const base = { ...common, fill: paint(pr), stroke: paint(pr.ln), strokeWidth: Number(pr.ln?.w ?? 0) * scale, radius };
            if (base.fill !== 'transparent' || base.stroke !== 'transparent' || preset === 'line') s.elements.push(element(preset === 'ellipse' ? 'ellipse' : ['diamond','flowChartDecision'].includes(preset) ? 'diamond' : preset === 'line' ? 'line' : 'rect', base));
            if (n.txBody) {
              const paragraphs = arr(n.txBody.p), converted: TextParagraph[] = [];
              const body = {...masterShape?.txBody?.bodyPr, ...inherited?.txBody?.bodyPr, ...n.txBody.bodyPr};
              const textScale = Math.min(parent.sx, parent.sy) * Number(body.normAutofit?.fontScale ?? 100000) / 100000;
              const points = (pt: number) => pt / 72 / ptScale * textScale;
              let firstStyle: any = {};
              const numbers=new Map<string,{value:number;start:number}>();
              for (let j = 0; j < paragraphs.length; j++) {
                const p: any = paragraphs[j], level = `lvl${Number(p.pPr?.lvl ?? 0) + 1}pPr`;
                // Standalone text boxes use presentation defaults. otherStyle belongs to
                // shape text; applying it to Keynote's txBox exports changes alignment.
                const isTextBox = ['1','true'].includes(n.nvSpPr?.cNvSpPr?.txBox);
                const masterStyle = master?.txStyles?.[['title','ctrTitle'].includes(ph?.type) ? 'titleStyle' : ph ? 'bodyStyle' : isTextBox ? '' : 'otherStyle'];
                const listStyle = (style: any) => [style?.defPPr, style?.[level]];
                const chain = [...listStyle(presentation.defaultTextStyle), ...listStyle(masterStyle), ...listStyle(masterShape?.txBody?.lstStyle), arr(masterShape?.txBody?.p)[j]?.pPr, ...listStyle(inherited?.txBody?.lstStyle), arr(inherited?.txBody?.p)[j]?.pPr, ...listStyle(n.txBody.lstStyle), p.pPr].filter(Boolean);
                const props = Object.assign({}, ...chain), def = pptxTextProperties(...chain.map((x: any) => x.defRPr));
                const runs: TextRun[] = [];
                const content = n.txBody.__contents?.[j] ?? arr(p.r).map(run => ({kind: 'r', node: run}));
                for (const {kind, node: run} of content) {
                  const style = pptxTextProperties(def,run.rPr);
                  if (!converted.length && !runs.length) firstStyle = style;
                  runs.push({text: kind === 'br' ? '\n' : textValue(run.t), ...(style.cap?{textCase:style.cap==='all'?'upper' as const:style.cap==='small'?'small-caps' as const:'none' as const}:{}), bold: style.b === '1', italic: style.i === '1', underline: style.u !== undefined && style.u !== 'none', strikethrough:style.strike==='sngStrike'||style.strike==='dblStrike'||undefined, color: paint(style, '#252b29'), fontSize: Math.max(4, points(Number(style.sz ?? 2400) / 100)), fontFamily: font(style.latin?.typeface), letterSpacing: points(Number(style.spc ?? 0) / 100), baseline: Number(style.baseline ?? 0) > 0 ? 'super' : Number(style.baseline ?? 0) < 0 ? 'sub' : 'normal'});
                }
                const spacing = (v: any) => v?.spcPts ? points(Number(v.spcPts.val) / 100) : 0;
                const bulletProps=chain.slice().reverse().find(x=>['buAutoNum','buChar','buNone'].some(k=>x[k]!==undefined));
                let bullet=bulletProps?.buChar?.char;
                if(bulletProps?.buAutoNum){
                  const auto=bulletProps.buAutoNum,key=level+auto.type,previous=numbers.get(key),start=Number(auto.startAt??previous?.start??1);
                  // startAt describes the sequence, not a reset on each paragraph.
                  // Keynote repeats startAt=1 for all entries in a continuous list.
                  const num=previous&&previous.start===start?previous.value+1:start;numbers.set(key,{value:num,start});
                  bullet=auto.type==='arabicParenR'?`${num})`:auto.type==='arabicParenBoth'?`(${num})`:`${num}.`;
                  if(!['arabicPeriod','arabicParenR','arabicParenBoth'].includes(auto.type))warnings.add(`Number format ${auto.type}  uses plain numbers for now. Review the formatting.`);
                }else if(bulletProps?.buNone!==undefined)for(const key of numbers.keys())if(key.startsWith(level))numbers.delete(key);
                converted.push({runs, endStyle:p.endParaRPr!==undefined?{text:'',fontSize:points(Number(p.endParaRPr.sz??def.sz??2400)/100),fontFamily:font(p.endParaRPr.latin?.typeface??def.latin?.typeface)}:undefined, align: ({ctr: 'center', r: 'right', just: 'justify'} as any)[props.algn] ?? 'left', lineHeight: props.lnSpc?.spcPct ? Number(props.lnSpc.spcPct.val) / 100000 : 1.2, lineSpacing: props.lnSpc?.spcPts ? spacing(props.lnSpc) : undefined, spaceBefore: spacing(props.spcBef), spaceAfter: spacing(props.spcAft), indent: Number(props.marL ?? 0) * scale, firstLineIndent: Number(props.indent ?? 0) * scale, bullet});
              }
              const text = converted.map(p => p.runs.map(r => r.text).join('')).join('\n');
              if (text) {
                if (body.vert && body.vert !== 'horz') warnings.add('Vertical text remains in the source reference. Review the editable version.');
                s.elements.push(element('text', {...common, text, paragraphs: converted, textFit:body.normAutofit!==undefined?'normal':body.spAutoFit!==undefined?'shape':'none', paragraphSpacingAtEdges:['1','true'].includes(body.spcFirstLastPara), clipText:body.vertOverflow==='clip'||(/\.key$/i.test(name)&&body.vertOverflow!=='overflow'), padding: {left: Number(body.lIns ?? 91440) * scale * parent.sx, right: Number(body.rIns ?? 91440) * scale * parent.sx, top: Number(body.tIns ?? 45720) * scale * parent.sy, bottom: Number(body.bIns ?? 45720) * scale * parent.sy}, verticalAlign: ({ctr: 'middle', b: 'bottom'} as any)[body.anchor] ?? 'top', wrap: body.wrap !== 'none', fill: paint(firstStyle, '#252b29'), fontFamily: font(firstStyle.latin?.typeface), fontSize: Math.max(4, points(Number(firstStyle.sz ?? 2400) / 100)), fontWeight: firstStyle.b === '1' ? 700 : 400, align: converted[0].align === 'justify' ? 'left' : converted[0].align}));
              }
            }
          }
      }
    };
    if (raw.showMasterSp !== '0') await parseTree(master?.cSld?.spTree, masterRel, undefined, true);
    await parseTree(layout?.cSld?.spTree, layoutRel, undefined, true);
    await parseTree(raw.cSld?.spTree, relations);
    const notesRel = Object.values(relations).find((r: any) => r.Type?.endsWith('/notesSlide')) as any;
    if (notesRel) { const notes = (await xml(notesRel.path)).notes; s.notes = arr(notes?.cSld?.spTree?.sp).filter((n: any) => n.nvSpPr?.nvPr?.ph?.type === 'body').map((n: any) => pptxBodyText(n.txBody)).join('\n'); }
    s.source = {provider: 'PowerPoint', fidelity: 'converted', warnings: [...warnings], label: name};
    slides.push(s);
  }
  if (!slides.length) throw new Error('No slides found in this PPTX.');
  const deck = newDeck(name.replace(/\.pptx$/i, ''), slides, width, height);
  for(const [i,texts] of metadata?.slides.entries()??[]){if(!texts.length)continue;const sourcePath=pRel[(ids[i] as any)?.rid]?.path;const bodies=sourcePath?await pptxTextBodyDigests(await readZipXml(zip,sourcePath),new Set(texts.map(e=>e.name))):new Map();for(const entry of texts){if(entry.renderedBody&&bodies.get(entry.name)!==entry.renderedBody)continue;const matches=deck.slides[i]?.elements.filter(e=>e.type==='text'&&e.name===entry.name&&e.text===entry.renderedText&&pptxTextStyleMatches(e,entry)&&(!entry.renderedPadding||Object.entries(entry.renderedPadding).every(([side,value])=>Math.abs((e.padding?.[side as keyof NonNullable<typeof e.padding>]??0)-value)<.05))&&Math.abs(e.w-entry.renderedFrame.w)<.05&&Math.abs(e.h-entry.renderedFrame.h)<.05)??[];if(matches.length===1){Object.assign(matches[0],{...pptxSourceTextStyle(entry),x:entry.x+matches[0].x-entry.renderedFrame.x,y:entry.y+matches[0].y-entry.renderedFrame.y,w:entry.w,h:entry.h,text:entry.text,maxLines:entry.maxLines,clipText:entry.renderedBody?entry.clipText:true,...(entry.renderedBody?{textCase:entry.textCase,paragraphSpacingAtEdges:entry.paragraphSpacingAtEdges}:{}),wrap:entry.wrap,textFit:entry.textFit,...(entry.renderedPadding?{padding:entry.padding}:{}),...(entry.lineHeight!==undefined?{lineHeight:entry.lineHeight}:{}),runs:entry.runs,paragraphs:entry.paragraphs,...(entry.strikethrough!==undefined?{strikethrough:entry.strikethrough}:{}),nativeTextLayout:entry.nativeTextLayout});}}}
  deck.provenance = {provider: 'PowerPoint', filename: name, importedAt: new Date().toISOString(),pageSize:{width:Number(presentation.sldSz?.cx ?? 12192000)/12700,height:Number(presentation.sldSz?.cy ?? 6858000)/12700,canvasWidth:width,canvasHeight:height}};
  return deck;
}
