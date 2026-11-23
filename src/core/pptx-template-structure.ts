import {refreshPptxTextMetadata} from './pptx-text-metadata';
import {sameFontFamily} from './font-stack';
import JSZip from 'jszip';
import type {Deck,Slide,SlideElement} from './model';
import {TEMPLATE_CONTRACTS} from './template-contracts';
import {textBodyXml} from './pptx-fidelity';
import {embedPptxFonts,nativeFontCodecs,type PptxFontLoader} from './pptx-fonts';
import {bindPptxEastAsianFonts} from './pptx-font-policy';
import {resolveObjectMotion,type ObjectMotionEntry} from './motion-sequence';
const esc=(s:string)=>s.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!));
const emu=(v:number)=>Math.round(v*9525);
const roles={ink:'dk1',background:'lt1',muted:'dk2',surface:'lt2',accent:'accent1',line:'accent2',dark:'accent3',onDark:'accent4'} as const;
function timing(s:Slide,ids:Map<string,string>):string{
  const entries=resolveObjectMotion(s).entries.filter(e=>ids.has(e.id)),elements=new Map(s.elements.map(e=>[e.id,e]));
  if(!entries.length)return '';
  let tn=3;
  const visibility=(id:string,value:'visible'|'hidden',delay=0)=>`<p:set><p:cBhvr><p:cTn id="${tn++}" dur="1" fill="hold"><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${ids.get(id)}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="${value}"/></p:to></p:set>`;
  const initial=entries.filter(e=>e.phase==='in').map(e=>visibility(e.id,'hidden')).join('');
  const effect=(entry:ObjectMotionEntry,index:number)=>{
    const a=elements.get(entry.id)!.animation!,id=tn++,type=entry.trigger==='after-previous'?'afterEffect':entry.cue>0&&index===0?'clickEffect':'withEffect';
    const effects=(entry.phase==='in'?visibility(entry.id,'visible'):'')+`<p:animEffect transition="${entry.phase}" filter="fade"><p:cBhvr><p:cTn id="${tn++}" dur="${a.duration}" fill="hold"/><p:tgtEl><p:spTgt spid="${ids.get(entry.id)}"/></p:tgtEl></p:cBhvr></p:animEffect>`+(entry.phase==='out'?visibility(entry.id,'hidden',a.duration):'');
    return `<p:par><p:cTn id="${id}" presetID="10" presetClass="${entry.phase==='out'?'exit':'entr'}" presetSubtype="0" fill="hold" nodeType="${type}"><p:stCondLst><p:cond delay="${entry.start}"/></p:stCondLst><p:childTnLst>${effects}</p:childTnLst></p:cTn></p:par>`;
  };
  const group=(cue:number)=>{const members=entries.filter(e=>e.cue===cue);if(!members.length)return '';const id=tn++;return `<p:par><p:cTn id="${id}" dur="${Math.max(...members.map(e=>e.end))}" fill="hold"><p:stCondLst><p:cond delay="${cue?'indefinite':'0'}"/></p:stCondLst><p:childTnLst>${members.map(effect).join('')}</p:childTnLst></p:cTn></p:par>`;};
  // Slide-entry tracks run independently; each numbered cue consumes one click.
  const automatic=group(0),sequence=[...new Set(entries.filter(e=>e.cue>0).map(e=>e.cue))].sort((a,b)=>a-b).map(group).join('');
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>${initial}${automatic}<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${sequence}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
}
/** Native templates gain reusable layouts, semantic theme slots and standard PPT fades.
 * Imported/source-reference documents are left to the fidelity exporter. */
export async function enhancePptxTemplate(bytes:Uint8Array,deck:Deck,template=false,authored=deck,fontLoader?:PptxFontLoader):Promise<Uint8Array>{
  const zip=await JSZip.loadAsync(bytes),system=deck.designSystem;
  const imported=nativeFontCodecs&&deck.fonts?.length&&(fontLoader||typeof location!=='undefined')?await (await import('./pptx-imported-fonts')).prepareImportedPptxFonts(deck):undefined;
  if(!system||deck.provenance){
    const binding=await bindPptxEastAsianFonts(zip,deck,imported?.han),fonts=await embedPptxFonts(zip,deck,fontLoader,imported);
    if(template){
      const content=await zip.file('[Content_Types].xml')!.async('string');
      zip.file('[Content_Types].xml',content.replace('application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml','application/vnd.openxmlformats-officedocument.presentationml.template.main+xml'));
    }
    if(!binding&&!fonts&&!template)return bytes;
    for(const [path,file]of Object.entries(zip.files))if(/^ppt\/media\/[^/]+\.(jpe?g|gif|webp)$/i.test(path))file.options.compression='STORE';
    await refreshPptxTextMetadata(zip);
    return zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:3}});
  }
  let content=await zip.file('[Content_Types].xml')!.async('string');
  const pns='http://schemas.openxmlformats.org/presentationml/2006/main',ans='http://schemas.openxmlformats.org/drawingml/2006/main',rns='http://schemas.openxmlformats.org/officeDocument/2006/relationships',relsns='http://schemas.openxmlformats.org/package/2006/relationships';
  for(const path of Object.keys(zip.files).filter(p=>/^ppt\/theme\/theme\d+\.xml$/.test(p))){
    const chartFile=zip.file(path);if(!chartFile)continue;let x=await chartFile.async('string');
    x=x.replace(/<a:clrScheme\b[^>]*>[\s\S]*?<\/a:clrScheme>/,`<a:clrScheme name="${esc(system.name)}">${Object.entries(roles).map(([role,slot])=>`<a:${slot}><a:srgbClr val="${system.colors[role as keyof typeof roles].slice(1)}"/></a:${slot}>`).join('')}<a:accent5><a:srgbClr val="${system.colors.accent.slice(1)}"/></a:accent5><a:accent6><a:srgbClr val="${system.colors.muted.slice(1)}"/></a:accent6><a:hlink><a:srgbClr val="${system.colors.accent.slice(1)}"/></a:hlink><a:folHlink><a:srgbClr val="${system.colors.muted.slice(1)}"/></a:folHlink></a:clrScheme>`);
    x=x.replace(/<a:fontScheme\b[^>]*>[\s\S]*?<\/a:fontScheme>/,`<a:fontScheme name="${esc(system.name)}"><a:majorFont><a:latin typeface="${esc(system.typography.title.fontFamily)}"/><a:ea typeface="${sameFontFamily(system.typography.title.fontFamily,'DM Serif Display')?'Noto Serif SC':'Noto Sans SC'}"/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${esc(system.typography.body.fontFamily)}"/><a:ea typeface="Noto Sans SC"/><a:cs typeface=""/></a:minorFont></a:fontScheme>`);zip.file(path,x);
  }
  const masterPath='ppt/slideMasters/slideMaster1.xml',masterRelsPath='ppt/slideMasters/_rels/slideMaster1.xml.rels';
  let master=await zip.file(masterPath)!.async('string'),masterRels=await zip.file(masterRelsPath)!.async('string');
  let nextRel=Math.max(...[...masterRels.matchAll(/Id="rId(\d+)"/g)].map(m=>Number(m[1])))+1,nextLayout=Math.max(...Object.keys(zip.files).filter(p=>/^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(p)).map(p=>Number(p.match(/Layout(\d+)/)![1])))+1;
  const layoutIds:string[]=[],profiles=new Map<string,number>();
  for(const [i,s] of deck.slides.entries()){
    if(!s.template||s.source)continue;
    const path=`ppt/slides/slide${i+1}.xml`;const chartFile=zip.file(path);if(!chartFile)continue;let x=await chartFile.async('string');
    const elements=new Map(s.elements.map(e=>[e.id,e])),originals=new Map(authored.slides[i].elements.map(e=>[e.id,e])),shapeIds=new Map<string,string>();let idx=0,nextShapeId=2;const slots:string[]=[],layoutParts:string[]=[];
    const nativeWidth=(e:SlideElement)=>{
      if(e.type!=='text')return e.w;
      const tracking=e.letterSpacing<0&&e.fontSize>=56?-e.letterSpacing*Math.max(...e.text.split('\n').map(line=>[...line].length-1)):0;
      const coverContext=s.template?.prototype==='cover'&&e.fontSize>=26&&e.fontSize<56?e.fontSize*2:0;
      const nextColumn=Math.min(deck.width-80,...s.elements.filter(other=>other.type==='image'&&other.x>e.x&&other.y<e.y+e.h&&other.y+other.h>e.y).map(other=>other.x-32));
      return e.w+Math.min(tracking||coverContext,Math.max(0,nextColumn-e.x-e.w));
    };
    const titleId=s.elements.find(e=>e.type==='text'&&e.fontSize>=56&&e.y>110&&e.y<330&&!/^\d+$/.test(e.text))?.id;
    x=x.replace(/<p:(sp|pic|graphicFrame|cxnSp)>[\s\S]*?<\/p:\1>/g,(shape:string)=>{
      const name=shape.match(/<p:cNvPr[^>]* name="([^"]*)"/)?.[1],previous=shape.match(/<p:cNvPr[^>]* id="(\d+)"/)?.[1],e=name?elements.get(name):undefined;if(!previous)return shape;const object=String(nextShapeId++);shape=shape.replace(/(<p:cNvPr\b[^>]* id=")\d+/,`$1${object}`);if(!e)return shape;
      shapeIds.set(e.id,object);
      const semantic=['text','image','table','chart'].includes(e.type),slot=++idx,major=e.design?.text==='title'||e.design?.text==='heading';
      const nativeW=nativeWidth(e);if(nativeW!==e.w)shape=shape.replace(/(<a:ext cx=")\d+/,`$1${emu(nativeW)}`);
      const adaptive=s.adaptiveColors&&s.backgroundStyle==='dark';
      if(e.design){
        if(e.type==='text')shape=shape.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/,textBodyXml(originals.get(e.id)??e,{fill:!adaptive&&e.design.fill?roles[e.design.fill]:undefined,font:e.design.overrides?.includes('fontFamily')?undefined:major?'mj':'mn',absoluteLineSpacing:true}));
        else if(!adaptive&&(e.type==='rect'||e.type==='ellipse'||e.type==='line'||e.type==='diamond'))shape=shape.replace(/<p:spPr>[\s\S]*?<\/p:spPr>/,paint=>{
          const stroke=paint.match(/<a:ln\b[\s\S]*?<\/a:ln>/)?.[0],bind=(value:string,role:keyof typeof roles)=>value.replace(/<a:srgbClr\b[^>]*\/>|<a:srgbClr\b[^>]*>([\s\S]*?)<\/a:srgbClr>/,(_,children)=>children?`<a:schemeClr val="${roles[role]}">${children}</a:schemeClr>`:`<a:schemeClr val="${roles[role]}"/>`);
          if(stroke)paint=paint.replace(stroke,'__STROKE__');if(e.design!.fill)paint=bind(paint,e.design!.fill);if(stroke)paint=paint.replace('__STROKE__',e.design!.stroke?bind(stroke,e.design!.stroke):stroke);return paint;
        });
      }
      if(e.type==='table'&&e.design&&!adaptive){
        const cells=shape.match(/<a:tr\b[^>]*>[\s\S]*?<\/a:tr>/g)??[];
        cells.forEach((row,ri)=>{const themed=row.replace(/<a:tc>[\s\S]*?<\/a:tc>/g,cell=>{
          if(!e.design!.overrides?.includes('fontFamily'))cell=cell.replace(/<a:(latin|ea)\b[^>]*typeface="([^"]*)"[^>]*\/>/g,(original,script,family)=>sameFontFamily(family,esc(e.fontFamily))?`<a:${script} typeface="+mn-${script==='ea'?'ea':'lt'}"/>`:original);
          cell=cell.replace(/<a:txBody>[\s\S]*?<\/a:txBody>/,tx=>tx.replace(/<a:srgbClr val="[^"]*"\s*\/>/g,`<a:schemeClr val="${e.design?.fill?roles[e.design.fill]:'dk1'}"/>`));
          return cell.replace(/<a:tcPr[\s\S]*?<\/a:tcPr>/,pr=>{
            const lines=pr.replace(/<a:ln[^>]*>[\s\S]*?<\/a:ln[^>]*>/g,ln=>ln.replace(/<a:srgbClr val="[^"]*"\s*\/>/g,`<a:schemeClr val="${e.design?.stroke?roles[e.design.stroke]:'accent2'}"/>`));
            return e.tableStyle?.bodyFill!==undefined?lines:lines.replace(/<a:solidFill><a:srgbClr val="[^"]*"\s*\/><\/a:solidFill>/g,`<a:solidFill><a:schemeClr val="${ri===0?'lt2':'lt1'}"/></a:solidFill>`);
          });
        });shape=shape.replace(row,themed);});
      }
      shape=shape.replace(/<p:cNvPr\b([^>]*?)(\/>|>)/,(_,attrs,end)=>`<p:cNvPr${attrs.replace(/ descr="[^"]*"/g,'')} descr="${esc(e.type==='image'?e.name:e.type==='chart'?e.chart?.title||e.name:e.name)}"${end}`);
      if(semantic){
        const type=e.type==='image'?'pic':e.type==='table'?'tbl':e.type==='chart'?'chart':e.id===titleId?'title':'body';
        const ph=`<p:ph type="${type}" idx="${slot}"/>`;
        shape=shape.replace(/<p:nvPr(?:\s*\/>|>([\s\S]*?)<\/p:nvPr>)/,(_,children)=>`<p:nvPr>${ph}${children??''}</p:nvPr>`);
        const font=Math.round(e.fontSize*75),fill=!adaptive&&e.design?.fill?`<a:schemeClr val="${roles[e.design.fill]}"/>`:`<a:srgbClr val="${e.fill.slice(1)}"/>`;
        const placeholder=`<p:sp><p:nvSpPr><p:cNvPr id="${object}" name="${esc(e.name)}"/><p:cNvSpPr/><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(e.x)}" y="${emu(e.y)}"/><a:ext cx="${emu(nativeWidth(e))}" cy="${emu(e.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${font}"><a:solidFill>${fill}</a:solidFill><a:latin typeface="+${major?'mj':'mn'}-lt"/></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`;
        slots.push(placeholder);layoutParts.push(placeholder);
      }else layoutParts.push(shape);
      return shape;
    });
    if(s.backgroundStyle)x=x.replace(/<p:bg>[\s\S]*?<\/p:bg>/,`<p:bg><p:bgPr><a:solidFill><a:schemeClr val="${roles[s.backgroundStyle]}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`);
    const key=JSON.stringify([s.template,s.elements.filter(e=>['text','image','chart','table'].includes(e.type)).map(e=>[e.x,e.y,nativeWidth(e),e.h])]);
    let layout=profiles.get(key);
    if(!layout){layout=nextLayout++;profiles.set(key,layout);const rel=`rId${nextRel++}`;
      const root='<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
      const name=TEMPLATE_CONTRACTS[s.template.prototype]?.task??s.template.prototype;
      zip.file(`ppt/slideLayouts/slideLayout${layout}.xml`,`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="${ans}" xmlns:r="${rns}" xmlns:p="${pns}" type="cust" preserve="1"><p:cSld name="${esc(name+' · '+s.template.variant+' · '+s.template.density)}"><p:spTree>${root}${layoutParts.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
      zip.file(`ppt/slideLayouts/_rels/slideLayout${layout}.xml.rels`,`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${relsns}"><Relationship Id="rId1" Type="${rns}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
      masterRels=masterRels.replace('</Relationships>',`<Relationship Id="${rel}" Type="${rns}/slideLayout" Target="../slideLayouts/slideLayout${layout}.xml"/></Relationships>`);
      layoutIds.push(`<p:sldLayoutId id="${2147483648+layout}" r:id="${rel}"/>`);content=content.replace('</Types>',`<Override PartName="/ppt/slideLayouts/slideLayout${layout}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/></Types>`);
    }
    const relpath=`ppt/slides/_rels/slide${i+1}.xml.rels`;let rels=await zip.file(relpath)!.async('string');rels=rels.replace(/Target="\/ppt\/charts\//g,'Target="../charts/');rels=rels.replace(/(Type="[^"]*\/slideLayout" Target=")[^"]+/, `$1../slideLayouts/slideLayout${layout}.xml`);zip.file(relpath,rels);
    const duration=s.transition?.duration??300;
    x=x.replace('</p:sld>',`<p:transition spd="med" advClick="1" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" p14:dur="${duration}"><p:fade/></p:transition>${timing(s,shapeIds)}</p:sld>`);zip.file(path,x);
  }
  // Native chart XML retains semantic colors and theme fonts. Blank forecast
  // cells remain gaps in both chart caches and the embedded editable workbook.
  for(const [i,s] of deck.slides.entries()){
    const relPath=`ppt/slides/_rels/slide${i+1}.xml.rels`,rel=(await zip.file(relPath)!.async('string')).replace(/Target="\/ppt\/charts\//g,'Target="../charts/');zip.file(relPath,rel);
    const paths=[...rel.matchAll(/Type="[^"]*\/chart" Target="([^"]+)"/g)].map(m=>m[1].startsWith('/')?m[1].slice(1):'ppt/'+m[1].replace(/^\.\.\//,''));
    const charts=s.elements.filter(e=>e.type==='chart'&&!e.hidden);
    for(const [j,path] of paths.entries()){
      const e=charts[j];if(!e?.chart)continue;const chartFile=zip.file(path);if(!chartFile)continue;let x=await chartFile.async('string');
      x=x.replace(/<c:multiLvlStrRef>([\s\S]*?)<\/c:multiLvlStrRef>/g,(raw,inner)=>{const levels=[...inner.matchAll(/<c:lvl>([\s\S]*?)<\/c:lvl>/g)];if(levels.length!==1)return raw;return `<c:strRef>${inner.match(/<c:f>[\s\S]*?<\/c:f>/)?.[0]??''}<c:strCache>${inner.match(/<c:ptCount[^>]*\/>/)?.[0]??''}${levels[0][1]}</c:strCache></c:strRef>`;});
      if(e.chart.type==='bar')x=x.replace(/<c:catAx>[\s\S]*?<\/c:catAx>/g,axis=>axis.replace(/<c:orientation val="minMax"\/>/,'<c:orientation val="maxMin"/>')).replace(/<c:valAx>[\s\S]*?<\/c:valAx>/g,axis=>axis.replace(/<c:crosses val="autoZero"\/>/,'<c:crosses val="max"/>'));
      x=x.replace(/<c:pt idx="\d+"><c:v><\/c:v><\/c:pt>/g,'');
      if(e.design&&!e.design.overrides?.includes('fontFamily'))x=x.replace(/<a:latin typeface="[^"]*"\s*\/>/g,'<a:latin typeface="+mn-lt"/>');
      if(!(s.adaptiveColors&&s.backgroundStyle==='dark')&&e.design?.stroke)x=x.replace(new RegExp('<a:srgbClr val="'+e.chart.textColor.slice(1)+'"\\s*\\/>','gi'),`<a:schemeClr val="${roles[e.design.stroke]}"/>`);
      if(!(s.adaptiveColors&&s.backgroundStyle==='dark')&&e.chart.colorRoles){let k=0;x=x.replace(/<c:ser>[\s\S]*?<\/c:ser>/g,ser=>{const role=e.chart!.colorRoles![k++%e.chart!.series.length];return role?ser.replace(/<c:spPr>[\s\S]*?<\/c:spPr>/,pr=>pr.replace(/<a:srgbClr val="[^"]*"\s*\/>/g,`<a:schemeClr val="${roles[role]}"/>`)).replace(/<c:marker>[\s\S]*?<\/c:marker>/,marker=>marker.replace(/<a:srgbClr val="[^"]*"\s*\/>/g,`<a:schemeClr val="${roles[role]}"/>`)):ser;});}
      zip.file(path,x);
    }
  }
  master=master.replace('</p:sldLayoutIdLst>',layoutIds.join('')+'</p:sldLayoutIdLst>');zip.file(masterPath,master);zip.file(masterRelsPath,masterRels);
  if(template)content=content.replace('application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml','application/vnd.openxmlformats-officedocument.presentationml.template.main+xml');
  zip.file('[Content_Types].xml',content);
  await bindPptxEastAsianFonts(zip,deck,imported?.han);
  await embedPptxFonts(zip,deck,fontLoader,imported);
  // Loading the fidelity ZIP resets per-file compression options. Preserve
  // already-compressed media through the additional template pass as well.
  for(const [path,file] of Object.entries(zip.files))if(/^ppt\/media\/[^/]+\.(jpe?g|gif|webp)$/i.test(path))file.options.compression='STORE';
  await refreshPptxTextMetadata(zip);
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:3}});
}
