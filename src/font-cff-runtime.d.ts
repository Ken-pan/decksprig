type FontCffPoint={x:number;y:number;onCurve?:boolean};
type FontCffGlyph={contours?:FontCffPoint[][];xMin:number;xMax:number;yMin:number;yMax:number;leftSideBearing:number};
type FontCffObject={version:number;glyf:FontCffGlyph[];maxp:{version:number;maxZones:number};CFF?:unknown;VORG?:unknown};
declare module 'fonteditor-core/lib/ttf/otfreader' {
  class Reader {read(bytes:ArrayBuffer):FontCffObject;dispose():void;}
  const reader:typeof Reader|{default:typeof Reader};export default reader;
}
declare module 'fonteditor-core/lib/ttf/ttfwriter' {
  class Writer {constructor(options:{hinting:boolean});write(font:FontCffObject):ArrayBuffer;}
  const writer:typeof Writer|{default:typeof Writer};export default writer;
}
