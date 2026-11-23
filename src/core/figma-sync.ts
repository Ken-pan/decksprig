import {validateDeck,type Deck,type SlideElement} from './model';
import {textLayoutFingerprint} from './native-text-render';

export const stableValue=(value: unknown): string=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v)??'undefined';
const equal=(a: unknown,b: unknown)=>stableValue(a)===stableValue(b);
export type FigmaConflict={path:string;local:unknown;remote:unknown};

/** Native Slides renumbers pages after grid layout settles. This refresh is
 * metadata, and must not create an Undo entry or erase the user's Redo. */
export function isFigmaNumberingRefresh(before:Deck,after:Deck):boolean{
  if(!before.provenance?.url?.includes('/slides/')||before.slides.length!==after.slides.length)return false;
  let renamed=false;
  for(let i=0;i<before.slides.length;i++){const a=before.slides[i],b=after.slides[i];if(a.id!==b.id)return false;if(a.title!==b.title){if(a.source?.provider!=='Figma'||b.source?.provider!=='Figma'||!/^\d+$/.test(a.title??'')||!/^\d+$/.test(b.title??''))return false;renamed=true;}}
  if(!renamed)return false;
  const ignored=new Set(['revision','updatedAt','source','provenance','nativeTextLayout']);
  const sameContent=(a:any,b:any):boolean=>{if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;if(Array.isArray(a))return a.length===b.length&&a.every((v,i)=>sameContent(v,b[i]));return [...new Set([...Object.keys(a),...Object.keys(b)])].every(k=>ignored.has(k)||sameContent(a[k],b[k]));};
  return sameContent(before,{...after,slides:after.slides.map((s,i)=>({...s,title:before.slides[i].title}))});
}

/** Three-way merge: independently edited properties merge; divergent edits stop. */
export function mergeFigmaDeck(base: Deck,local: Deck,remote: Deck,resolution?:'local'|'remote'): {deck?:Deck;conflicts:FigmaConflict[]} {
  const conflicts: FigmaConflict[]=[];
  const merge=(b: any,l: any,r: any,path: string): any=>{
    if(equal(l,r)||equal(b,r))return l;
    if(equal(b,l))return r;
    if(Array.isArray(b)&&Array.isArray(l)&&Array.isArray(r)&&[...b,...l,...r].every(v=>v&&typeof v.id==='string')){
      const bm=new Map(b.map(v=>[v.id,v])),lm=new Map(l.map(v=>[v.id,v])),rm=new Map(r.map(v=>[v.id,v]));
      const order=(xs: any[])=>xs.map(v=>v.id),common=b.filter(v=>lm.has(v.id)&&rm.has(v.id)).map(v=>v.id);
      const relative=(xs: any[])=>order(xs).filter(id=>common.includes(id));
      const bo=relative(b),lo=relative(l),ro=relative(r);let primary=l;
      if(!equal(bo,ro)){if(equal(bo,lo)||equal(lo,ro))primary=r;else {conflicts.push({path:`${path}.order`,local:order(l),remote:order(r)});if(resolution==='remote')primary=r;}}
      const ids=order(primary);for(const list of [l,r])for(let i=0;i<list.length;i++){const id=list[i].id;if(ids.includes(id))continue;const next=list.slice(i+1).find(v=>ids.includes(v.id));ids.splice(next?ids.indexOf(next.id):ids.length,0,id);}const out: any[]=[];
      for(const id of ids){const v=merge(bm.get(id),lm.get(id),rm.get(id),`${path}[${id}]`);if(v!==undefined)out.push(v);}
      return out;
    }
    if(b&&l&&r&&!Array.isArray(b)&&!Array.isArray(l)&&!Array.isArray(r)&&typeof b==='object'&&typeof l==='object'&&typeof r==='object'){
      const out: any={};for(const key of new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)])){
        if(key==='nativeTextLayout')continue;
        if(['revision','updatedAt'].includes(key)&&path==='document'){out[key]=l[key];continue;}
        if(key==='source'&&path.startsWith('document.slides[')){out[key]=r[key]??l[key];continue;}
        const v=merge(b[key],l[key],r[key],`${path}.${key}`);if(v!==undefined)out[key]=v;
      }
      if(out.type==='text')out.nativeTextLayout=[l.nativeTextLayout,r.nativeTextLayout,b.nativeTextLayout].find(layout=>layout&&layout.fingerprint===textLayoutFingerprint(out));
      return out;
    }
    conflicts.push({path,local:l,remote:r});return resolution==='remote'?r:l;
  };
  const result=merge(base,local,{...remote,id:local.id},'document');
  return conflicts.length&&!resolution?{conflicts}:{deck:validateDeck(result),conflicts};
}

function textAppearance(e:SlideElement){
  const parts=e.paragraphs?.flatMap((p,i)=>[...(i?[{text:'\n'}]:[]),...p.runs])??e.runs??[{text:e.text}],runs:{text:string;style:string}[]=[];
  for(const r of parts){const style=stableValue({family:r.fontFamily??e.fontFamily,size:r.fontSize??e.fontSize,weight:r.fontWeight??(r.bold===undefined?e.fontWeight:r.bold?700:400),italic:r.italic??e.italic,color:r.color??e.fill,underline:r.underline??e.underline,...((r.strikethrough??e.strikethrough)?{strikethrough:true}:{}),spacing:r.letterSpacing??e.letterSpacing,case:r.textCase??e.textCase??'none',baseline:r.baseline??'normal'}),last=runs.at(-1);if(last?.style===style)last.text+=r.text;else runs.push({text:r.text,style});}
  return stableValue({text:e.text,runs,vertical:e.verticalAlign,wrap:e.wrap,max:e.maxLines,lineHeight:e.lineHeight,paragraphs:e.text.split('\n').map((_,i)=>{const p=e.paragraphs?.[i];return {align:p?.align??e.align,before:p?.spaceBefore??0,after:p?.spaceAfter??0,spacing:p?.lineSpacing??e.fontSize*(p?.lineHeight??e.lineHeight),indent:p?.firstLineIndent??0};})});
}
/** Adjacent rich-text runs can be split differently by native capture without
 * changing their effective appearance. Preserve native paint in that case. */
export function sameFigmaTextAppearance(a:SlideElement,b:SlideElement){
  return a.textSizing===b.textSizing&&textAppearance(a)===textAppearance(b);
}
/** Acknowledged native glyph caches refresh appearance without creating an
 * undo-only metadata step or overwriting a newer local edit. */
export function refreshFigmaTextRendering(current:Deck,sent:Deck,native:Deck):Deck{
  let changed=false;
  const slides=current.slides.map(s=>{const ns=native.slides.find(n=>n.id===s.id),base=sent.slides.find(n=>n.id===s.id);if(!ns||!base)return s;
    let touched=false;const elements=s.elements.map(e=>{const n=ns.elements.find(v=>v.id===e.id),b=base.elements.find(v=>v.id===e.id);if(e.type!=='text'||!n?.nativeTextLayout||!b||textAppearance(e)!==textAppearance(n)||e.w!==b.w||e.h!==b.h||e.textSizing!==b.textSizing)return e;
      const p=e.padding??{left:0,right:0,top:0,bottom:0},automatic=e.textSizing&&e.textSizing!=='fixed';
      if(!automatic&&(Math.abs(e.w-p.left-p.right-n.w)>.01||Math.abs(e.h-p.top-p.bottom-n.h)>.01))return e;
      const accepted={...e,...(automatic?{w:n.w+p.left+p.right,h:n.h+p.top+p.bottom}:{})},layout={...n.nativeTextLayout,fingerprint:textLayoutFingerprint(accepted)};
      if(layout.outline)layout.outline={...layout.outline,x:layout.outline.x+p.left,y:layout.outline.y+p.top};
      if(layout.spans)layout.spans=layout.spans.map(span=>({...span,x:span.x+p.left,y:span.y+p.top}));
      if(equal(e.nativeTextLayout,layout)&&e.w===accepted.w&&e.h===accepted.h)return e;changed=touched=true;return {...accepted,nativeTextLayout:layout};
    });return touched?{...s,elements}:s;
  });return changed?validateDeck({...current,slides}):current;
}

/** Project native changes onto the sent document. Conversion-only differences
 * never rewrite the Deck document or destroy its charts/animations/metadata. */
export function projectFigmaChanges(sent: Deck,before: Deck,after: Deck,unreadableObjectMotion?:ReadonlySet<string>): Deck {
  const patch=(original: any,b: any,a: any): any=>{
    if(equal(b,a))return original;
    if(original?.type&&['chart','table'].includes(original.type)&&b?.type==='image'&&a?.type==='image'&&!equal(b.src,a.src))throw new Error(`The visual layer “${original.name}” changed in Figma. Download the Figma copy to keep that version; its structured data stays in Deck Studio.`);
    if(Array.isArray(b)&&Array.isArray(a)&&[...b,...a].every(v=>v&&typeof v.id==='string')){
      const bm=new Map(b.map(v=>[v.id,v])),om=new Map((Array.isArray(original)?original:[]).map((v: any)=>[v.id,v]));
      return a.map(v=>patch(om.get(v.id),bm.get(v.id),v)).filter(v=>v!==undefined);
    }
    if(original&&b&&a&&typeof b==='object'&&typeof a==='object'&&!Array.isArray(b)&&!Array.isArray(a)){
      const out={...original};for(const key of new Set([...Object.keys(b),...Object.keys(a)])){
        if(['revision','updatedAt','provenance','nativeTextLayout'].includes(key))continue;
        if(unreadableObjectMotion?.has(b.sourceId??a.sourceId??original.sourceId)&&['animation','motionKey','motionMatch'].includes(key))continue;
        if(!equal(b[key],a[key])){const value=patch(original[key],b[key],a[key]);if(value===undefined)delete out[key];else out[key]=value;}
      }
      // Native visual exports already contain the latest node opacity. Keeping
      // an old relative opacity as well would apply it twice after a native edit.
      if(out.type==='image'&&b.src!==a.src)out.opacity=a.opacity;
      if(out.type==='text'&&a.nativeTextLayout&&textLayoutFingerprint(b)!==textLayoutFingerprint(a)&&textLayoutFingerprint(out)===textLayoutFingerprint(a))out.nativeTextLayout=a.nativeTextLayout;
      return out;
    }return a;
  };
  return validateDeck(patch(sent,before,after));
}
