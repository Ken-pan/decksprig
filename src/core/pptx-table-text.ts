import type {Slide,SlideElement} from './model';
import type {DesignSystem} from './design-system-schema';
import {tablePresentation,tableCellStyle,tableCellBox,tableCellSpan} from './table-rendering';
import {yieldForInput} from './text-layout';
import {nativeColorXml} from './pptx-color';
const decode=(text:string)=>text.replace(/&(?:amp|lt|gt|apos|quot);|&#(?:x[\da-f]+|\d+);/gi,entity=>{
  const named:Record<string,string>={'&amp;':'&','&lt;':'<','&gt;':'>','&apos;':"'",'&quot;':'"'};
  return named[entity]??String.fromCodePoint(parseInt(entity.slice(entity[2].toLowerCase()==='x'?3:2,-1),entity[2].toLowerCase()==='x'?16:10));
});
const failure=()=>new Error('The table text format could not be preserved. Export a Deck file to keep your changes.');
/** Restore explicit run flags and directional cell geometry in the writer-owned DrawingML. */
function cellText(source:string,e:SlideElement,p:ReturnType<typeof tablePresentation>,row:number,column:number):string{
  if(tableCellSpan(p,row,column).covered)return source;
  const local=p.cellStyleIndex.get(`${row}:${column}`);
  if(local?.edges||local?.insets||/^#(?:[\da-f]{4}|[\da-f]{8})$/i.test(p.line)){const box=tableCellBox(p,row,column),sides=[['left','L'],['right','R'],['top','T'],['bottom','B']] as const;
    source=source.replace(/<a:tcPr\b([^>]*?)(?:\/>|>([\s\S]*?)<\/a:tcPr>)/,(_,attrs:string,content='')=>{
      let lines='';
      for(const [side,suffix]of sides){attrs=attrs.replace(new RegExp(`\\smar${suffix}="[^"]*"`,'g'),'')+` mar${suffix}="${Math.round(box.insets[side]*9525)}"`;const edge=box.edges[side],line=edge.width<=0||edge.color==='transparent'?`<a:ln${suffix}><a:noFill/></a:ln${suffix}>`:`<a:ln${suffix} w="${Math.round(edge.width*9525)}" cmpd="${edge.style==='double'?'dbl':'sng'}"><a:solidFill>${nativeColorXml(edge.color)}</a:solidFill><a:prstDash val="${edge.style==='dotted'?'sysDot':edge.style==='dashed'?'dash':'solid'}"/></a:ln${suffix}>`;const pattern=new RegExp(`<a:ln${suffix}\\b[^>]*(?:/>|>[\\s\\S]*?</a:ln${suffix}>)`,'g');content=content.replace(pattern,'');lines+=line;
      }return '<a:tcPr'+attrs+'>'+lines+content+'</a:tcPr>';
    });
  }
  const runs=local?.runs;if(!runs)return source;
  const base=tableCellStyle(p,row,column);
  const segments=runs.map(run=>({text:run.text.replace(/[\r\n]/g,''),flags:{b:(run.fontWeight??base.fontWeight)>=600?'1':'0',i:(run.italic??(base.fontStyle==='italic'))?'1':'0',strike:(run.strikethrough??base.textDecoration.includes('line-through'))?'sngStrike':'noStrike',u:(run.underline??base.textDecoration.includes('underline'))?'sng':'none',spc:String(Math.round((run.letterSpacing??e.letterSpacing)*75)),baseline:run.baseline??'normal',paint:nativeColorXml(run.color??base.color)}})).filter(run=>run.text.length);
  const content=segments.map(run=>run.text).join('');let offset=0,index=0,within=0;
  const result=source.replace(/<a:r>[\s\S]*?<\/a:r>/g,run=>{
    const text=decode(run.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/)?.[1]??'').replace(/[\r\n]/g,'');if(!text)return run;
    if(content.slice(offset,offset+text.length)!==text||!segments[index])throw failure();
    const flags=segments[index].flags,key=JSON.stringify(flags);let remaining=text.length;
    while(remaining){const segment=segments[index];if(!segment||JSON.stringify(segment.flags)!==key)throw failure();const used=Math.min(remaining,segment.text.length-within);within+=used;remaining-=used;if(within===segment.text.length){index++;within=0;}}
    offset+=text.length;
    const {baseline,paint,...attributes}=flags,values:Record<string,string>={...attributes,...(baseline==='normal'?{baseline:'0'}:{})};
    const pigment=`<a:solidFill>${paint}</a:solidFill>`;
    if(!/<a:rPr\b/.test(run))return run.replace('<a:r>','<a:r><a:rPr '+Object.entries(values).map(([name,value])=>`${name}="${value}"`).join(' ')+'>'+pigment+'</a:rPr>');
    // The writer treats zero transparency as an absent override. Restore the
    // resolved paint so an opaque run cannot inherit its cell's alpha.
    return run.replace(/<a:rPr\b([^>]*?)(?:\/>|>([\s\S]*?)<\/a:rPr>)/,(_,original,content='')=>{
      let attrs=original;
      for(const [name,value]of Object.entries(values))attrs=attrs.replace(new RegExp(`\\s${name}="[^"]*"`,'g'),'')+` ${name}="${value}"`;
      return '<a:rPr'+attrs+'>'+pigment+content.replace(/<a:(solidFill|gradFill|pattFill)\b[^>]*>[\s\S]*?<\/a:\1>|<a:noFill\s*\/>/g,'')+'</a:rPr>';
    });
  });
  if(offset!==content.length)throw failure();return result;
}
export async function preserveTableTextFlags(source:string,slide:Slide,system?:DesignSystem):Promise<string>{
  const tables=new Map(slide.elements.filter(e=>e.type==='table'&&(e.tableStyle?.cellStyles?.some(cell=>cell.runs||cell.edges||cell.insets)||/^#(?:[\da-f]{4}|[\da-f]{8})$/i.test(e.tableStyle?.lineColor??e.stroke))).map(e=>[e.id,e]));if(!tables.size)return source;
  const output:string[]=[];let cursor=0,deadline=performance.now()+8;
  for(const match of source.matchAll(/<p:graphicFrame>[\s\S]*?<\/p:graphicFrame>/g)){
    const frame=match[0],id=frame.match(/<p:cNvPr[^>]* name="([^"]+)"/)?.[1],e=id?tables.get(id):undefined;if(!e||!frame.includes('<a:tbl>'))continue;
    output.push(source.slice(cursor,match.index));const p=tablePresentation(e,system),rows:string[]=[];let position=0,row=0;
    for(const r of frame.matchAll(/<a:tr\b[^>]*>[\s\S]*?<\/a:tr>/g)){
      if(performance.now()>=deadline){await yieldForInput();deadline=performance.now()+8;}
      rows.push(frame.slice(position,r.index));let column=0;rows.push(r[0].replace(/<a:tc\b[^>]*>[\s\S]*?<\/a:tc>/g,cell=>cellText(cell,e,p,row,column++)));position=r.index!+r[0].length;row++;
    }
    rows.push(frame.slice(position));output.push(rows.join(''));cursor=match.index!+frame.length;
  }
  output.push(source.slice(cursor));return output.join('');
}
