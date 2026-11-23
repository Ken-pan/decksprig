import {adaptSlideColors, restoreSlideColors} from './slide-colors';
export {contrastRatio} from './color-contrast';
import {isThemedIllustration} from './resource-purpose';
import { COLOR_ROLES, TYPE_PROPERTIES, DEFAULT_DESIGN_SYSTEM, DesignSystemSchema, type ColorRole, type TextRole, type DesignSystem, type StyleBinding } from './design-system-schema';
import { cloneDocumentData } from './document-data';
import { element, type Deck, type Slide, type SlideElement, type TextRun } from './model';

export const DESIGN_PRESETS: DesignSystem[] = [
  DEFAULT_DESIGN_SYSTEM,
  {...DEFAULT_DESIGN_SYSTEM,name:'Studio',colors:{background:'#eef1f5',ink:'#263649',muted:'#57677b',accent:'#3568b0',surface:'#dce4ef',line:'#bdc9db',dark:'#20324b',onDark:'#f0f4fa'},typography:{...DEFAULT_DESIGN_SYSTEM.typography,title:{...DEFAULT_DESIGN_SYSTEM.typography.title,fontFamily:'Manrope',fontWeight:600},heading:{...DEFAULT_DESIGN_SYSTEM.typography.heading,fontFamily:'Manrope',fontWeight:600}}},
  {...DEFAULT_DESIGN_SYSTEM,name:'Monograph',colors:{background:'#eee8dd',ink:'#45372c',muted:'#776451',accent:'#ab613f',surface:'#e2d7c7',line:'#c9b9a3',dark:'#45372c',onDark:'#faf1e4'}},
  {...DEFAULT_DESIGN_SYSTEM,name:'Midnight',colors:{background:'#192329',ink:'#f0f3f4',muted:'#b0c0c9',accent:'#8bcbbd',surface:'#28383f',line:'#465d67',dark:'#10191e',onDark:'#edf5f3'},typography:{...DEFAULT_DESIGN_SYSTEM.typography,title:{...DEFAULT_DESIGN_SYSTEM.typography.title,fontFamily:'Manrope',fontWeight:600},heading:{...DEFAULT_DESIGN_SYSTEM.typography.heading,fontFamily:'Manrope',fontWeight:600}}},
];
export const COLOR_LABELS: Record<ColorRole,string> = {background:'Background',ink:'Text',muted:'Secondary text',accent:'Accent',surface:'Surface',line:'Border',dark:'Dark background',onDark:'Text on dark'};
export const TEXT_LABELS: Record<TextRole,string> = {title:'Title',heading:'Heading',body:'Body',caption:'Caption'};
export function deckDesignSystem(deck: Pick<Deck,'designSystem'> & Partial<Pick<Deck,'slides'>>): DesignSystem {
  if(deck.designSystem)return deck.designSystem;
  // Recover the shipped collection for older native documents without migrating their data.
  const native=deck.slides?.filter(s=>!s.source)??[];
  return DESIGN_PRESETS.find(system=>native.some(s=>s.background.toLowerCase()===system.colors.background.toLowerCase()))??DEFAULT_DESIGN_SYSTEM;
}
const scale = (deck: Pick<Deck,'width'|'height'>) => Math.min(deck.width/1440,deck.height/810);
export function textRole(e: SlideElement, deck: Pick<Deck,'width'|'height'>): TextRole {
  const size=e.fontSize/scale(deck); return size>=85?'title':size>=48?'heading':size>=26?'body':'caption';
}
export function colorRole(value:string, system:DesignSystem, background=false): ColorRole | undefined {
  const roles: ColorRole[] = background ? ['background','dark'] : ['ink','muted','accent','surface','line','onDark'];
  const normalized=value.toLowerCase();
  return roles.find(role=>system.colors[role].toLowerCase()===normalized)
    ?? roles.find(role=>DEFAULT_DESIGN_SYSTEM.colors[role].toLowerCase()===normalized)
    // Readable template palette revisions still acquire their semantic role
    // when recovering an older native document that has lost its bindings.
    ?? (!background&&['#576951','#3062a7','#8c4a2c'].includes(normalized)?'accent':!background&&['#5d655d','#695645'].includes(normalized)?'muted':undefined)
    ?? (!background&&['#dce5d5','#e5e4dd'].includes(normalized)?'surface':!background&&normalized==='#252b29'?'ink':undefined);
}
/** Attach only recognizable native styles. Imported evidence and custom colors stay independent. */
export function bindNativeSlide(slide:Slide, deck:Pick<Deck,'width'|'height'> & Partial<Pick<Deck,'provenance'>>, system:DesignSystem): Slide {
  if (slide.source||deck.provenance) return cloneDocumentData(slide);
  const backgroundStyle=slide.backgroundStyle ?? colorRole(slide.background,system,true);
  return {...slide,...(backgroundStyle?{backgroundStyle}:{}),elements:slide.elements.map(e=>{
    if(e.design||e.designPattern||e.locked||e.sourceId||e.sourceRegion||e.resource||e.type==='image'||e.type==='prototype')return cloneDocumentData(e);
    const binding:StyleBinding={};
    if(e.type==='text'&&Object.values(system.typography).some(style=>style.fontFamily===e.fontFamily)){
      const role=textRole(e,deck),style=system.typography[role];binding.text=role;binding.textScale=e.fontSize/(style.fontSize*scale(deck));
      binding.overrides=TYPE_PROPERTIES.filter(key=>key!=='fontSize'&&e[key]!==style[key]);
      // A paired heading font is a style choice, not a local override.
      binding.overrides=binding.overrides.filter(key=>key!=='fontFamily');
    }
    binding.fill=colorRole(e.fill,system);binding.stroke=colorRole(e.stroke,system);
    return Object.values(binding).some(Boolean)?{...cloneDocumentData(e),design:binding}:cloneDocumentData(e);
  })};
}
export function styledElement(e:SlideElement,system:DesignSystem,deck:Pick<Deck,'width'|'height'>):SlideElement {
  const result=cloneDocumentData(e),b=e.design;if(!b||e.locked||e.sourceRegion||(e.resource&&!(isThemedIllustration(e.resource)&&b.fill==='accent')))return result;
  const runs=[...(result.runs??[]),...(result.paragraphs?.flatMap(p=>[...p.runs,...(p.endStyle?[p.endStyle]:[])])??[])];
  if(b.text){const style=system.typography[b.text];
    for(const key of TYPE_PROPERTIES){if(b.overrides?.includes(key))continue;
      const value=key==='fontSize'?Math.min(500,Math.max(4,style.fontSize*(b.textScale??1)*scale(deck))):key==='fontFamily'&&b.font?system.typography[b.font].fontFamily:style[key];
      if(key==='fontSize'){const ratio=(value as number)/e.fontSize;if(result.layoutItem?.basisFontSize)result.layoutItem.basisFontSize=e.tableFit?result.layoutItem.basisFontSize*ratio:value as number;for(const run of runs)if(run.fontSize!==undefined)run.fontSize*=ratio;for(const p of result.paragraphs??[])if(p.lineSpacing!==undefined)p.lineSpacing*=ratio;}
      else if(key==='fontFamily'){for(const run of runs)if(run.fontFamily===e.fontFamily)run.fontFamily=value as string;}
      else if(key==='fontWeight'){for(const run of runs)if(run.fontWeight===e.fontWeight)run.fontWeight=value as number;}
      Object.assign(result,{[key]:value});
    }
  }
  if(b.font&&!b.overrides?.includes('fontFamily')){
    result.fontFamily=system.typography[b.font].fontFamily;
    for(const run of runs)if(run.fontFamily===e.fontFamily)run.fontFamily=result.fontFamily;
  }
  if(b.fill){result.fill=system.colors[b.fill];for(const run of runs)if(run.color?.toLowerCase()===e.fill.toLowerCase())run.color=result.fill;}
  if(b.stroke)result.stroke=system.colors[b.stroke];
  if(result.chart){
    const {colorRoles}=result.chart;
    result.chart.colors=result.chart.colors.map((color,i)=>colorRoles?.[i]
      ?system.colors[colorRoles[i]]
      :b.fill&&color.toLowerCase()===e.fill.toLowerCase()?result.fill:color);
    if(b.stroke&&result.chart.textColor.toLowerCase()===e.stroke.toLowerCase())result.chart.textColor=result.stroke;
  }
  return result;
}
export function patternElement(slide:Slide,deck:Pick<Deck,'width'|'height'>,system:DesignSystem):SlideElement|null {
  if(!slide.backgroundStyle||slide.patternStyle==='none'||system.pattern.kind==='none')return null;
  const {spacing,opacity,kind}=system.pattern,color=system.colors[slide.backgroundStyle==='dark'?'onDark':'ink'];
  const tile=kind==='dots'?`<circle cx="${spacing/2}" cy="${spacing/2}" r="1.4" fill="${color}"/>`:`<path d="M ${spacing} 0 H 0 V ${spacing}" fill="none" stroke="${color}" stroke-width="1"/>`;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${deck.width}" height="${deck.height}"><defs><pattern id="p" width="${spacing}" height="${spacing}" patternUnits="userSpaceOnUse">${tile}</pattern></defs><rect width="100%" height="100%" fill="url(#p)" opacity="${opacity}"/></svg>`;
  return element('image',{id:`pattern-${slide.id.slice(0,110)}`,name:`Background · ${kind==='dots'?'Dots':'Grid'}`,x:0,y:0,w:deck.width,h:deck.height,src:`data:image/svg+xml;base64,${btoa(svg)}`,locked:true,designPattern:true});
}
export function styleSlide(slide:Slide,deck:Pick<Deck,'width'|'height'>,system:DesignSystem):Slide {
  slide=restoreSlideColors(slide);
  const result={...slide,background:slide.backgroundStyle?system.colors[slide.backgroundStyle]:slide.background,elements:slide.elements.filter(e=>!e.designPattern).map(e=>styledElement(e,system,deck))};
  const pattern=patternElement(result,deck,system);if(pattern)result.elements.unshift(pattern);return adaptSlideColors(result,system);
}
/** Concrete values are saved alongside bindings so every renderer/export shares the result. */
export function applyDeckDesignSystem(deck:Deck,system:DesignSystem,adopt=false):Deck {
  system=DesignSystemSchema.parse(system);const previous=deckDesignSystem(deck);
  return {...deck,designSystem:system,slides:deck.slides.map(s=>styleSlide(adopt?bindNativeSlide(s,deck,previous):s,deck,system))};
}
/** Local changes override only the fields edited; geometry and content do not detach styles. */
export function styleOverrides(e:SlideElement,patch:Partial<SlideElement>):StyleBinding|undefined {
  if(!e.design||patch.design!==undefined)return patch.design;
  const b=cloneDocumentData(e.design);b.overrides=[...new Set([...(b.overrides??[]),...TYPE_PROPERTIES.filter(key=>patch[key]!==undefined&&patch[key]!==e[key])])];
  if(patch.fontFamily!==undefined&&patch.fontFamily!==e.fontFamily)delete b.font;
  if(patch.fill!==undefined&&patch.fill.toLowerCase()!==e.fill.toLowerCase())delete b.fill;if(patch.stroke!==undefined&&patch.stroke.toLowerCase()!==e.stroke.toLowerCase())delete b.stroke;return b;
}
export function designSystemCoverage(deck:Deck):{objects:number;slides:number;overrides:number} {
  const elements=deck.slides.flatMap(s=>s.elements);return {objects:elements.filter(e=>e.design&&!e.locked).length,slides:deck.slides.filter(s=>s.backgroundStyle).length,overrides:elements.filter(e=>e.design?.overrides?.length).length};
}
