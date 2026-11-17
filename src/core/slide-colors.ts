import {automaticShapeTextColor} from './shape-label-color';
import {cloneDocumentData} from './document-data';
import {elementCorners,selectionBounds,type Bounds} from './interactions';
import {contrastRatio, readableTextColor, normalizeColor as hex, compositeColor as composite, mixColors as mix} from './color-contrast';
import type {DesignSystem} from './design-system-schema';
import type {Slide, SlideElement} from './model';

const shapes=new Set(['rect','ellipse','diamond']);
const protectedColor=(e:SlideElement)=>e.locked||e.designPattern||e.sourceId||e.sourceRegion||e.resource||e.type==='image'||e.type==='prototype';
function field(e:SlideElement,path:string):{object:Record<string,unknown>;key:string}|undefined {
  const parts=path.split('.');let object:unknown=e;
  for(const key of parts.slice(0,-1)){if(!object||typeof object!=='object')return;object=(object as Record<string,unknown>)[key];}
  return object&&typeof object==='object'?{object:object as Record<string,unknown>,key:parts.at(-1)!}:undefined;
}
/** Restore only generated values. A subsequent manual color edit becomes the new original. */
function restoreElement(e:SlideElement):SlideElement {
  if(!e.contrastColors||protectedColor(e))return e;
  const result=cloneDocumentData(e);
  for(const [path,color] of Object.entries(e.contrastColors)){
    const f=field(result,path);if(!f||f.object[f.key]!==color.adapted)continue;
    if(color.original===undefined)delete f.object[f.key];else f.object[f.key]=color.original;
  }
  if(e.contrastColors['shapeText.color']?.created&&result.shapeText&&!Object.keys(result.shapeText).length)delete result.shapeText;
  delete result.contrastColors;
  if(result.tableStyle&&!Object.keys(result.tableStyle).length)delete result.tableStyle;
  return result;
}
export function restoreSlideColors(slide:Slide):Slide {
  return {...slide,elements:slide.elements.map(restoreElement)};
}

/** Require the complete object to sit on a surface; overlapping photographs are unknown. */
function contains(surface:SlideElement,e:SlideElement):boolean {
  const angle=-(surface.rotation??0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  return elementCorners(e).every(point=>{
    const dx=point.x-(surface.x+surface.w/2),dy=point.y-(surface.y+surface.h/2);
    const nx=(dx*c-dy*s)/(surface.w/2),ny=(dx*s+dy*c)/(surface.h/2);
    const radius=Math.min(surface.radius,surface.w/2,surface.h/2);
    return surface.type==='ellipse'?nx*nx+ny*ny<=1:surface.type==='diamond'?Math.abs(nx)+Math.abs(ny)<=1:Math.abs(nx)<=1.001&&Math.abs(ny)<=1.001&&(!radius||Math.hypot(Math.max(0,(Math.abs(nx)-1)*surface.w/2+radius),Math.max(0,(Math.abs(ny)-1)*surface.h/2+radius))<=radius);
  });
}
type Surface={element:SlideElement;bounds:Bounds};
function backgroundBehind(elements:Surface[],e:SlideElement,background:string):string|undefined {
  let result:string|undefined=background;
  const box=e.rotation?selectionBounds([e])!:e;
  for(const {element:surface,bounds:b} of elements){
    if(box.x>=b.x+b.w||box.y>=b.y+b.h||b.x>=box.x+box.w||b.y>=box.y+box.h)continue;
    const color=hex(surface.fill);
    if(shapes.has(surface.type)&&(!color||color.slice(7)==='00'))continue;
    if(surface.type==='image'||surface.type==='prototype'||surface.shape){result=undefined;continue;}
    if(!contains(surface,e)){result=undefined;continue;}
    if(surface.opacity===1&&color!.length===7)result=color;
    else if(result)result=composite(surface.fill,result,surface.opacity);
  }
  return result;
}

/** Materialize colors once so canvas, thumbnails and every export share the same appearance. */
export function adaptSlideColors(slide:Slide,system:DesignSystem):Slide {
  if(!slide.adaptiveColors||slide.backgroundStyle!=='dark')return slide;
  const elements:SlideElement[]=[],surfaces:Surface[]=[];
  const append=(e:SlideElement)=>{elements.push(e);if(!e.hidden&&e.opacity>0&&!e.designPattern&&(shapes.has(e.type)||e.type==='image'||e.type==='prototype'))surfaces.push({element:e,bounds:e.rotation?selectionBounds([e])!:e});};
  for(const original of slide.elements){
    if(protectedColor(original)||original.hidden||original.opacity===0){append(original);continue;}
    let e=restoreElement(original);const background=backgroundBehind(surfaces,e,slide.background);
    if(!background){append(e);continue;}
    function set(path:string,value:string){
      const before=field(e,path);if(before&&before.object[before.key]===value)return;
      if(e===original)e=cloneDocumentData(e);
      const created=path==='shapeText.color'&&!e.shapeText;
      if(created)e.shapeText={};
      if(path.startsWith('tableStyle.'))e.tableStyle??={};
      const f=field(e,path);if(!f)return;
      const previous=e.contrastColors?.[path];
      const originalColor=previous?previous.original:f.object[f.key] as string|undefined;
      (e.contrastColors??={})[path]={original:originalColor,adapted:value,...(created||previous?.created?{created:true}:{})};f.object[f.key]=value;
    }
    function readable(path:string,back:string,target=4.5,role?:string,backdrop?:string){
      const f=field(e,path),value=f?.object[f.key];if(typeof value!=='string')return;
      const normalized=hex(value);
      if(!normalized||normalized.slice(7)==='00')return;
      const visible=backdrop?composite(composite(value,back),backdrop,e.opacity):composite(value,back,e.opacity);
      if(contrastRatio(visible,backdrop?composite(back,backdrop,e.opacity):back)>=target)return;
      role??=Object.entries(system.colors).find(([,color])=>color.toLowerCase()===value.toLowerCase())?.[0];
      const preferred=role==='ink'||role==='onDark'?system.colors.onDark:role==='muted'?mix(back,system.colors.onDark,.72):normalized.slice(0,7);
      set(path,readableTextColor(preferred+normalized.slice(7),back,target,e.opacity,backdrop));
    }
    if(shapes.has(e.type)){
      const alpha=hex(e.fill)?.slice(7)??'';
      if(e.design?.fill==='surface'&&alpha!=='00')set('fill',mix(background,system.colors.onDark,.09)+alpha);
      else if(e.design?.fill==='background'&&alpha!=='00')set('fill',system.colors.dark+alpha);
      else readable('fill',background,1.5);
      if(e.strokeWidth>0)readable('stroke',background,3,e.design?.stroke);
    }else if(e.type==='line'){
      readable('stroke',background,3,e.design?.stroke);
    }
    let textBackground=e.type==='line'?slide.background:shapes.has(e.type)?composite(e.fill,background):background;
    if(e.type==='table'){
      if(e===original)e=cloneDocumentData(e);
      const style=e.tableStyle??{};
      const body=style.bodyFill??mix(background,system.colors.onDark,.025),header=style.headerFill??(style.preset==='contrast'?system.colors.accent:mix(background,system.colors.onDark,.09));
      const headerBackground=composite(header,background),bodyBackground=composite(body,background);
      set('tableStyle.bodyFill',body);
      const table=e.tableStyle!;
      set('tableStyle.headerFill',header);
      set('tableStyle.stripeFill',table.stripeFill??mix(bodyBackground,system.colors.onDark,.055));
      set('tableStyle.headerText',readableTextColor(composite(table.headerText??e.fill,headerBackground),headerBackground));
      set('tableStyle.lineColor',readableTextColor(composite(table.lineColor??(e.stroke==='transparent'?system.colors.line:e.stroke),bodyBackground),bodyBackground,1.5));
      textBackground=bodyBackground;
      readable('fill',textBackground,4.5,e.design?.fill);
      const stripe=composite(table.stripeFill!,background);
      if(contrastRatio(e.fill,stripe)<4.5){
        for(let n=1;n<=100;n++){
          const candidate=mix(stripe,textBackground,n/100);
          if(contrastRatio(e.fill,candidate)>=4.5){set('tableStyle.stripeFill',candidate);break;}
        }
      }
      for(const [i,cell] of (table.cellStyles??[]).entries()){
        const isHeader=cell.row===0&&table.headerRow!==false,striped=table.banded&&(cell.row-(table.headerRow===false?0:1))%2===1;
        const back=composite(cell.fill??(isHeader?header:striped?table.stripeFill!:table.bodyFill!),background),inherited=isHeader?table.headerText!:e.fill;
        for(const [j,run]of(cell.runs??[]).entries())if(run.color)readable(`tableStyle.cellStyles.${i}.runs.${j}.color`,back);
        if(cell.color)readable(`tableStyle.cellStyles.${i}.color`,back);
        else if(contrastRatio(composite(inherited,back),back)<4.5)set(`tableStyle.cellStyles.${i}.color`,readableTextColor(composite(inherited,back),back));
      }
    }else if(e.type==='text')readable('fill',background,4.5,e.design?.fill);
    if((shapes.has(e.type)||e.type==='line')&&e.text&&!e.shapeText?.color){
      const automatic=e.type==='line'?(e.stroke==='transparent'?e.fill:e.stroke):automaticShapeTextColor(e.fill);
      const color=readableTextColor(automatic,textBackground,4.5,e.opacity,background);
      if(color!==automatic)set('shapeText.color',color);
    }
    if(e.shapeText?.color)readable('shapeText.color',textBackground,4.5,undefined,background);
    for(const [i] of (e.runs??[]).entries())readable(`runs.${i}.color`,textBackground,4.5,undefined,background);
    for(const [i,p] of (e.paragraphs??[]).entries()){
      for(const [j] of p.runs.entries())readable(`paragraphs.${i}.runs.${j}.color`,textBackground,4.5,undefined,background);
      if(p.endStyle)readable(`paragraphs.${i}.endStyle.color`,textBackground,4.5,undefined,background);
    }
    if(e.chart){
      readable('fill',background,3,e.design?.fill);
      readable('chart.textColor',background,4.5,e.design?.stroke);
      for(const [i] of e.chart.colors.entries())readable(`chart.colors.${i}`,background,3);
      if(e.chart.dataLabels?.color&&e.chart.dataLabels.position==='outside')readable('chart.dataLabels.color',background);
    }else if(e.type==='chart'){
      readable('fill',background,3,e.design?.fill);
      if(e.stroke==='transparent')set('stroke',readableTextColor(system.colors.onDark,background));
      else set('stroke',readableTextColor(composite(e.stroke,background),background));
    }
    append(e);
  }
  return {...slide,elements};
}
