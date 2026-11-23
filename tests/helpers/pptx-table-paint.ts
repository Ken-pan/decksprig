import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';

/** Independent native input: no Decksprig metadata or editable-model shortcut. */
export async function nativeTablePaintSource(){
  const p=new PptxGenJS();p.layout='LAYOUT_WIDE';const s=p.addSlide();
  s.background={color:'F4F3EE'};
  s.addShape(p.ShapeType.rect,{x:1,y:2,w:5,h:2,fill:{color:'F8EBD8'},line:{transparency:100}});
  s.addShape(p.ShapeType.rect,{x:6,y:2,w:5,h:2,fill:{color:'E1E7DB'},line:{transparency:100}});
  s.addTable([
    [{text:'Half blue',options:{fill:{color:'F11001'}}},{text:'Quarter rose',options:{fill:{color:'F11002'}}}],
    [{text:'Clear',options:{fill:{color:'F11003'}}},{text:'Ordered alpha',options:{fill:{color:'F11004'},border:[{type:'dash',pt:3,color:'D11002'},{type:'solid',pt:2,color:'D11001'},{type:'solid',pt:2,color:'D11001'},{type:'solid',pt:2,color:'D11001'}]}}],
  ],{x:1,y:2,w:10,colW:[5,5],rowH:[1,1],fontFace:'Arial',fontSize:22,color:'172B26',margin:.1,border:{type:'solid',pt:2,color:'D11001'},autoPage:false});
  const z=await JSZip.loadAsync(await p.write({outputType:'uint8array'}) as Uint8Array),file=z.file('ppt/slides/slide1.xml')!;
  const paints:Record<string,string>={
    F11001:'<a:srgbClr val="4F63E7"><a:alpha val="50196"/></a:srgbClr>',
    F11002:'<a:srgbClr val="BF3584"><a:alpha val="25098"/></a:srgbClr>',
    F11003:'<a:srgbClr val="73856E"><a:alpha val="0"/></a:srgbClr>',
    F11004:'<a:srgbClr val="4F63E7"><a:alpha val="0"/><a:alphaOff val="50196"/></a:srgbClr>',
    D11001:'<a:schemeClr val="accent1"><a:alphaMod val="50196"/></a:schemeClr>',
    D11002:'<a:srgbClr val="BF3584"><a:alpha val="0"/><a:alphaOff val="25098"/></a:srgbClr>',
  };
  let xml=await file.async('string');
  for(const [marker,paint]of Object.entries(paints))xml=xml.replaceAll(new RegExp(`<a:srgbClr val="${marker}"(?:\\s*/>|>[\\s\\S]*?</a:srgbClr>)`,'g'),paint);
  z.file(file.name,xml);
  for(const file of Object.values(z.files).filter(f=>/^ppt\/theme\/theme\d+\.xml$/.test(f.name)))z.file(file.name,(await file.async('string')).replace(/<a:accent1>[\s\S]*?<\/a:accent1>/,'<a:accent1><a:srgbClr val="4F63E7"/></a:accent1>'));
  return z.generateAsync({type:'uint8array'});
}
