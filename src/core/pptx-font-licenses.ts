import type JSZip from 'jszip';
import type {PptxFontLoader} from './pptx-fonts';

/** Carry complete notices in the standard, package-linked custom properties part. */
export async function embedFontLicenses(zip:JSZip,faces:{family:string;license?:string;notice?:string}[],load:PptxFontLoader){
  const licenses=new Map(faces.filter(f=>f.license).map(f=>[f.license!,f.family]));
  if(!licenses.size&&!faces.some(f=>f.notice))return;
  const notices:string[]=[];
  for(const [path,family]of licenses){
    const notice=new TextDecoder().decode(await load(path));
    if(!notice.includes('SIL OPEN FONT LICENSE'))throw new Error('The complete native font license could not load. Retry the export.');
    notices.push(family+'\n'+notice);
  }
  for(const [family,notice]of new Map(faces.filter(f=>f.notice).map(f=>[f.family,f.notice!])))notices.push(family+'\n'+notice);
  const esc=(value:string)=>value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,'�').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]!));
  let properties=await zip.file('docProps/custom.xml')?.async('string')??'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"></Properties>';
  if(!properties.includes('xmlns:vt='))properties=properties.replace(/<([\w:]*Properties)\b/,'<$1 xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"');
  const pid=Math.max(1,...[...properties.matchAll(/\bpid="(\d+)"/g)].map(m=>Number(m[1])))+1;
  const property=`<property xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${pid}" name="Decksprig embedded font licenses"><vt:lpwstr>${esc(notices.join('\n\n'))}</vt:lpwstr></property>`;
  properties=properties.replace(/<\/(?:[\w]+:)?Properties>/,property+'$&');zip.file('docProps/custom.xml',properties);
  let rels=await zip.file('_rels/.rels')?.async('string')??'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  if(!rels.includes('/custom-properties"'))rels=rels.replace('</Relationships>','<Relationship Id="rIdFontLicenses" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/></Relationships>');
  zip.file('_rels/.rels',rels);
  let content=await zip.file('[Content_Types].xml')!.async('string');
  if(!content.includes('PartName="/docProps/custom.xml"'))content=content.replace('</Types>','<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/></Types>');
  zip.file('[Content_Types].xml',content);
}
