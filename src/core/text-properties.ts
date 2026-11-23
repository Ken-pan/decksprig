import {fontFamilyKey} from './font-stack';
import type { SlideElement, TextRun } from './model';

export const textProperties = ['fontFamily', 'fontSize', 'fontWeight', 'italic', 'underline', 'strikethrough', 'fill', 'letterSpacing', 'align', 'lineHeight'] as const;
export type TextProperty = typeof textProperties[number];
type PropertyStates = {[K in TextProperty]:{value:SlideElement[K]|undefined;mixed:boolean}};

/** Inspect all rendered text controls in one pass, without retaining mutable callers. */
export function textSelectionState(elements:SlideElement[]) {
  const properties=Object.fromEntries(textProperties.map(key=>[key,{value:undefined,mixed:false}])) as PropertyStates;
  const seen=new Set<TextProperty>(),characterKeys=textProperties.filter(key=>key!=='align'&&key!=='lineHeight');
  const text=elements.filter(e=>e.type==='text'),editable=text.filter(e=>!e.locked);
  let bold:boolean|undefined,boldMixed=false;
  function add(key:TextProperty,value:unknown){
    const state=properties[key];
    if(!seen.has(key)){seen.add(key);(state as {value:unknown}).value=value;return;}
    if(state.mixed||value===state.value)return;
    if(key==='fontFamily'&&typeof value==='string'&&typeof state.value==='string'&&fontFamilyKey(value)===fontFamilyKey(state.value))return;
    state.mixed=true;
  }
  for(const e of editable.length?editable:text){
    const paragraphs=e.paragraphs?.length?e.paragraphs:[{runs:e.runs?.length?e.runs:[{text:e.text}],align:e.align}];
    for(const p of paragraphs){
      add('align',p.align??e.align);let count=0,size=e.fontSize;
      function run(r:TextRun){
        const weight=r.fontWeight??(r.bold===undefined?e.fontWeight:r.bold?700:400),active=weight>=600;
        if(bold===undefined)bold=active;else if(bold!==active)boldMixed=true;
        for(const key of characterKeys){
          if(properties[key].mixed)continue;
          const value=key==='fill'?r.color??e.fill:key==='fontWeight'?weight:r[key as keyof TextRun]??e[key];
          add(key,key==='strikethrough'?Boolean(value):value);
        }
      }
      for(const r of p.runs){if(!r.text.length)continue;const current=r.fontSize??e.fontSize;size=count?Math.max(size,current):current;count++;run(r);}
      if(!count)run({text:''});
      const paragraph=p as {lineSpacing?:number;lineHeight?:number};
      add('lineHeight',paragraph.lineSpacing?paragraph.lineSpacing/size:paragraph.lineHeight??e.lineHeight);
    }
  }
  const toggle=(key:'italic'|'underline'|'strikethrough'):boolean|'mixed'=>properties[key].mixed?'mixed':Boolean(properties[key].value);
  return {properties,bold:boldMixed?'mixed' as const:Boolean(bold),italic:toggle('italic'),underline:toggle('underline'),strikethrough:toggle('strikethrough')};
}

// Read the styles that the renderer inherits, including imported runs/paragraphs.
export function textPropertyValues<K extends TextProperty>(elements: SlideElement[], key: K): SlideElement[K][] {
  const values: SlideElement[K][] = [];
  const text = elements.filter(e => e.type === 'text'), editable = text.filter(e => !e.locked);
  for (const e of editable.length ? editable : text) {
    const paragraphs = e.paragraphs?.length ? e.paragraphs : [{runs: e.runs?.length ? e.runs : [{text: e.text}], align: e.align}];
    for (const p of paragraphs) {
      const runs = p.runs.filter(r => r.text.length);
      if (key === 'align') values.push((p.align ?? e.align) as SlideElement[K]);
      else if (key === 'lineHeight') {
        const size = runs.length ? Math.max(...runs.map(r => r.fontSize ?? e.fontSize)) : e.fontSize;
        const paragraph = p as {lineSpacing?: number; lineHeight?: number};
        values.push((paragraph.lineSpacing ? paragraph.lineSpacing / size : paragraph.lineHeight ?? e.lineHeight) as SlideElement[K]);
      } else for (const r of runs.length ? runs : [{} as TextRun]) {
        const value = key === 'fill' ? r.color ?? e.fill : key === 'fontWeight' ? r.fontWeight ?? (r.bold === undefined ? e.fontWeight : r.bold ? 700 : 400) : r[key as keyof TextRun] ?? e[key];
        values.push((key==='strikethrough'?Boolean(value):value) as SlideElement[K]);
      }
    }
  }
  return values;
}
export function textPropertyState<K extends TextProperty>(elements: SlideElement[], key: K) {
  const values = textPropertyValues(elements, key), value = values[0];
  return {value, mixed: values.some(v => key==='fontFamily'&&typeof v==='string'&&typeof value==='string'?fontFamilyKey(v)!==fontFamilyKey(value):v !== value)};
}
export function textToggleState(elements: SlideElement[], key: 'bold' | 'italic' | 'underline' | 'strikethrough'): boolean | 'mixed' {
  const values = key === 'bold' ? textPropertyValues(elements, 'fontWeight').map(v => v >= 600) : textPropertyValues(elements, key);
  return values.some(v => v !== values[0]) ? 'mixed' : Boolean(values[0]);
}
