/** Deterministic public Plugin API fixture; text measurement is approximate, never native pixel evidence. */
type Matrix=number[][];
type Style=Record<string,any>;
type State={matrix:Matrix;width:number;height:number;data:Record<string,string>;shared:Record<string,string>;characters:string;base:Style;styles:Style[]};
type RecordState={node:any;state:State;props:Record<string,any>;parent:any;children:any[]};
export type ShapeHostSnapshot={records:RecordState[];grid:any[][]};
const copy=<T>(value:T):T=>{
 if(Array.isArray(value))return value.map(copy) as T;
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,copy(v)])) as T;
 return value;
};
const multiply=(p:Matrix,t:Matrix):Matrix=>[[p[0][0]*t[0][0]+p[0][1]*t[1][0],p[0][0]*t[0][1]+p[0][1]*t[1][1],p[0][0]*t[0][2]+p[0][1]*t[1][2]+p[0][2]],[p[1][0]*t[0][0]+p[1][1]*t[1][0],p[1][0]*t[0][1]+p[1][1]*t[1][1],p[1][0]*t[0][2]+p[1][1]*t[1][2]+p[1][2]]];
const weight=(font:any)=>/semi.?bold/i.test(font?.style)?600:/bold/i.test(font?.style)?700:/medium/i.test(font?.style)?500:400;
const styleKeys=['fontName','fontSize','fills','textDecoration','lineHeight','letterSpacing','textCase','paragraphSpacing','paragraphIndent','hyperlink'] as const;

export function shapeHost(){
 let serial=0,commits=0,undos=0;
 const mixed=Symbol('figma.mixed'),nodes=new Set<any>(),states=new WeakMap<object,State>(),history:ShapeHostSnapshot[]=[];
 const metadataWrites:Array<{nodeId:string;key:string;value:string;namespace?:string}>=[],loadedFonts:any[]=[];
 const fonts=['Regular','Medium','Semi Bold','Bold','Italic','Medium Italic','Semi Bold Italic','Bold Italic'].map(style=>({fontName:{family:'Inter',style}}));
 let grid:any[][]=[];
 const state=(n:any)=>states.get(n)!;
 const same=(a:any,b:any)=>JSON.stringify(a)===JSON.stringify(b);
 const detach=(n:any)=>{if(n.parent)n.parent.children=n.parent.children.filter((c:any)=>c!==n);n.parent=undefined;};
 const mark=(n:any,removed:boolean)=>{n.removed=removed;for(const c of n.children)mark(c,removed);};
 function ownProps(n:any){const result:Record<string,any>={};for(const [key,d]of Object.entries(Object.getOwnPropertyDescriptors(n)))if('value'in d&&typeof d.value!=='function'&&!['parent','children'].includes(key))result[key]=copy(d.value);return result;}
 function snapshot():ShapeHostSnapshot{return {records:[...nodes].map(n=>({node:n,state:copy(state(n)),props:ownProps(n),parent:n.parent,children:[...n.children]})),grid:grid.map(row=>[...row])};}
 function restore(saved:ShapeHostSnapshot){
  const present=new Set(saved.records.map(r=>r.node));for(const n of nodes)if(!present.has(n)){n.parent=undefined;n.children=[];n.removed=true;}
  for(const r of saved.records){const n=r.node;for(const [key,d]of Object.entries(Object.getOwnPropertyDescriptors(n)))if('value'in d&&typeof d.value!=='function'&&!['parent','children'].includes(key)&&!(key in r.props))delete n[key];for(const [key,value]of Object.entries(r.props))Object.defineProperty(n,key,{value:copy(value),enumerable:true,writable:true,configurable:true});states.set(n,copy(r.state));n.parent=r.parent;n.children=[...r.children];}
  grid=saved.grid.map(row=>[...row]);
 }
 function node(type:string,attrs:Record<string,any>={}):any{
  const n:any={id:`shape-layer-${++serial}`,type,name:type,parent:undefined,children:[],removed:false,opacity:1,visible:true,locked:false,blendMode:'NORMAL',fills:[],strokes:[],effects:[],strokeWeight:0,strokeAlign:'INSIDE',cornerRadius:0,clipsContent:false,layoutMode:'NONE',layoutPositioning:'AUTO',paddingLeft:0,paddingRight:0,paddingTop:0,paddingBottom:0,itemSpacing:0,primaryAxisAlignItems:'MIN',counterAxisAlignItems:'MIN'};
  states.set(n,{matrix:[[1,0,0],[0,1,0]],width:100,height:type==='LINE'?0:100,data:{},shared:{},characters:'',base:{fontName:{family:'Inter',style:'Regular'},fontSize:16,fills:[{type:'SOLID',color:{r:0,g:0,b:0}}],textDecoration:'NONE',lineHeight:{unit:'PIXELS',value:24},letterSpacing:{unit:'PIXELS',value:0},textCase:'ORIGINAL',paragraphSpacing:0,paragraphIndent:0,hyperlink:null},styles:[]});nodes.add(n);
  const property=(name:string,get:()=>any,set?:(value:any)=>void)=>Object.defineProperty(n,name,{enumerable:true,configurable:true,get,set});
  const local=():Matrix=>{
   const p=n.parent;if(p?.layoutMode!=='VERTICAL'||n.layoutPositioning==='ABSOLUTE')return state(n).matrix;
   const children=p.children.filter((c:any)=>c.visible!==false),index=children.indexOf(n),used=children.reduce((sum:number,c:any)=>sum+c.height,0)+(p.itemSpacing??0)*Math.max(0,children.length-1),free=p.height-p.paddingTop-p.paddingBottom-used;
   const y=p.paddingTop+(p.primaryAxisAlignItems==='CENTER'?free/2:p.primaryAxisAlignItems==='MAX'?free:0)+children.slice(0,index).reduce((sum:number,c:any)=>sum+c.height+(p.itemSpacing??0),0),space=p.width-p.paddingLeft-p.paddingRight-n.width;
   return [[1,0,p.paddingLeft+(p.counterAxisAlignItems==='CENTER'?space/2:p.counterAxisAlignItems==='MAX'?space:0)],[0,1,y]];
  };
  property('relativeTransform',()=>copy(local()),value=>{if(!Array.isArray(value)||value.length!==2||value.some((r:any)=>!Array.isArray(r)||r.length!==3||r.some((v:any)=>!Number.isFinite(v))))throw Error('Invalid relative transform');state(n).matrix=copy(value);});
  property('x',()=>local()[0][2],value=>{state(n).matrix[0][2]=value;});property('y',()=>local()[1][2],value=>{state(n).matrix[1][2]=value;});
  property('width',()=>n.layoutSizingHorizontal==='FILL'&&n.parent?.layoutMode==='VERTICAL'?Math.max(.01,n.parent.width-n.parent.paddingLeft-n.parent.paddingRight):state(n).width,value=>{state(n).width=value;});
  property('height',()=>{
   if(type!=='TEXT'||!['HEIGHT','WIDTH_AND_HEIGHT'].includes(n.textAutoResize))return state(n).height;
   const s=state(n),font=s.base.fontSize,leading=s.base.lineHeight,lineHeight=leading.unit==='PIXELS'?leading.value:leading.unit==='PERCENT'?font*leading.value/100:font*1.2;
   const lines=s.characters.split('\n').reduce((sum,line)=>sum+(n.textAutoResize==='HEIGHT'?Math.max(1,Math.ceil(line.length*font*.5/Math.max(1,n.width))):1),0);
   return Math.max(.01,lines*lineHeight);
  },value=>{state(n).height=value;});
  property('absoluteTransform',()=>n.parent?multiply(n.parent.absoluteTransform,n.relativeTransform):n.relativeTransform);
  property('absoluteBoundingBox',()=>{const t=n.absoluteTransform,points=[[0,0],[n.width,0],[0,n.height],[n.width,n.height]].map(([x,y])=>({x:t[0][0]*x+t[0][1]*y+t[0][2],y:t[1][0]*x+t[1][1]*y+t[1][2]})),xs=points.map(p=>p.x),ys=points.map(p=>p.y);return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};});
  property('absoluteRenderBounds',()=>n.absoluteBoundingBox);
  Object.assign(n,{
   resize(this:any,w:number,h:number){if(!Number.isFinite(w)||!Number.isFinite(h)||w<0||h<0)throw Error('Invalid size');state(n).width=w;state(n).height=h;},resizeWithoutConstraints(this:any,w:number,h:number){this.resize(w,h);},
   appendChild(this:any,child:any){if(child===this||child.findAll?.((v:any)=>v===this).length)throw Error('Cyclic parent');detach(child);child.parent=this;mark(child,false);this.children.push(child);},
   insertChild(this:any,index:number,child:any){this.appendChild(child);this.children.pop();this.children.splice(Math.max(0,Math.min(index,this.children.length)),0,child);},
   remove(this:any){detach(this);mark(this,true);grid=grid.map(row=>row.filter(c=>c!==this)).filter(row=>row.length);},
   findAll(this:any,predicate:(value:any)=>boolean){const result:any[]=[];const walk=(parent:any)=>{for(const c of parent.children){if(predicate(c))result.push(c);walk(c);}};walk(this);return result;},findOne(this:any,predicate:(value:any)=>boolean){return this.findAll(predicate)[0]??null;},findAllWithCriteria(this:any,{types}:{types:string[]}){return this.findAll((c:any)=>types.includes(c.type));},
   getPluginData(this:any,key:string){if(this.removed)throw Error('Cannot read a removed node');return state(this).data[key]??'';},setPluginData(this:any,key:string,value:string){if(this.removed)throw Error('Cannot write a removed node');if(typeof value!=='string')throw Error('Plugin data must be text');state(this).data[key]=value;metadataWrites.push({nodeId:this.id,key,value});},getPluginDataKeys(this:any){return Object.keys(state(this).data);},
   getSharedPluginData(this:any,namespace:string,key:string){return state(this).shared[namespace+'\0'+key]??'';},setSharedPluginData(this:any,namespace:string,key:string,value:string){state(this).shared[namespace+'\0'+key]=value;metadataWrites.push({nodeId:this.id,key,value,namespace});},
   clone(this:any){const clone=node(this.type);for(const [key,value]of Object.entries(ownProps(this)))if(!['id','removed'].includes(key))clone[key]=copy(value);states.set(clone,copy(state(this)));for(const child of this.children)clone.appendChild(child.cloneDetached());if(this.parent)this.parent.insertChild(this.parent.children.indexOf(this)+1,clone);if(this.type==='SLIDE')grid=grid.map(row=>row.includes(this)?row.flatMap(c=>c===this?[c,clone]:[c]):row);return clone;},
   cloneDetached(this:any){const parent=this.parent;this.parent=undefined;try{return this.clone();}finally{this.parent=parent;}},
   rescale(this:any,scale:number){if(!Number.isFinite(scale)||scale<=0)throw Error('Invalid scale');const walk=(item:any,root=false)=>{const s=state(item);s.width*=scale;s.height*=scale;if(!root){s.matrix[0][2]*=scale;s.matrix[1][2]*=scale;}if(item.type==='TEXT'){for(const style of [s.base,...s.styles]){style.fontSize*=scale;if(style.lineHeight.unit==='PIXELS')style.lineHeight.value*=scale;if(style.letterSpacing.unit==='PIXELS')style.letterSpacing.value*=scale;}}for(const child of item.children)walk(child);};walk(this,true);},
   exportAsync:async(options:any={})=>options.format==='SVG_STRING'?'<svg width="100" height="24"><text>Fixture</text></svg>':new Uint8Array([137,80,78,71]),
  });
  if(type==='TEXT'){
   n.textAutoResize='NONE';n.textAlignHorizontal='LEFT';n.textAlignVertical='TOP';n.textTruncation='DISABLED';n.maxLines=null;state(n).height=24;
   const valueAt=(style:Style,key:string)=>key==='fontWeight'?weight(style.fontName):style[key];
   const range=(start:number,end:number)=>{if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>state(n).characters.length)throw Error('Invalid text range');return state(n).styles.slice(start,end);};
   const uniform=(values:any[],fallback:any)=>values.length?values.every(value=>same(value,values[0]))?copy(values[0]):mixed:copy(fallback);
   property('characters',()=>state(n).characters,value=>{const s=state(n);s.characters=String(value);s.styles=s.characters.split('').map(()=>copy(s.base));});
   for(const key of styleKeys){property(key,()=>{const s=state(n);return uniform(s.styles.map(style=>style[key]),s.base[key]);},value=>{const s=state(n);s.base[key]=copy(value);for(const style of s.styles)style[key]=copy(value);});
    const suffix=key[0].toUpperCase()+key.slice(1);n['setRange'+suffix]=(start:number,end:number,value:any)=>{range(start,end);for(let i=start;i<end;i++)state(n).styles[i][key]=copy(value);};n['getRange'+suffix]=(start:number,end:number)=>uniform(range(start,end).map(style=>style[key]),state(n).base[key]);
   }
   property('fontWeight',()=>{const s=state(n);return uniform(s.styles.map(style=>weight(style.fontName)),weight(s.base.fontName));});
   n.getStyledTextSegments=(fields:string[]=[...styleKeys,'fontWeight'],start=0,end=state(n).characters.length)=>{
    range(start,end);const s=state(n),result:any[]=[];let offset=start;
    const selected=(style:Style)=>Object.fromEntries(fields.map(key=>[key,valueAt(style,key)]));
    while(offset<end){const attrs=selected(s.styles[offset]);let next=offset+1;while(next<end&&same(attrs,selected(s.styles[next])))next++;result.push({characters:s.characters.slice(offset,next),start:offset,end:next,...copy(attrs)});offset=next;}return result;
   };
   n.insertCharacters=(start:number,value:string,useStyle='BEFORE')=>{range(start,start);const s=state(n),style=copy((useStyle==='AFTER'?s.styles[start]??s.styles[start-1]:s.styles[start-1]??s.styles[start])??s.base);s.characters=s.characters.slice(0,start)+value+s.characters.slice(start);s.styles.splice(start,0,...value.split('').map(()=>copy(style)));};
   n.deleteCharacters=(start:number,end:number)=>{range(start,end);const s=state(n);s.characters=s.characters.slice(0,start)+s.characters.slice(end);s.styles.splice(start,end-start);};
  }
  if(type==='SLIDE'){n.speakerNotes='';n.isSkippedSlide=false;n.slideTransition={style:'NONE',duration:0,curve:'EASE_OUT',timing:{type:'ON_CLICK'}};n.getSlideTransition=()=>copy(n.slideTransition);n.setSlideTransition=(value:any)=>{n.slideTransition=copy(value);};}
  Object.assign(n,attrs);return n;
 }
 const root=node('DOCUMENT',{name:'Shape labels'}),page=node('PAGE',{name:'Page'}),slide=node('SLIDE',{id:'slide',name:'Slide'});root.appendChild(page);page.appendChild(slide);slide.resize(1920,1080);grid=[[slide]];
 const create=(type:string)=>{const n=node(type);page.appendChild(n);return n;};
 const color=(hex:string)=>{let value=hex.slice(1);if(value.length===3)value=value.split('').map(c=>c+c).join('');return {type:'SOLID',color:{r:parseInt(value.slice(0,2),16)/255,g:parseInt(value.slice(2,4),16)/255,b:parseInt(value.slice(4,6),16)/255}};};
 const host:any={root,currentPage:page,editorType:'slides',fileKey:'file',mixed,
  listAvailableFontsAsync:async()=>copy(fonts),loadFontAsync:async(font:any)=>{if(!fonts.some(value=>same(value.fontName,font)))throw Error(`Missing fixture font ${font?.family} ${font?.style}`);loadedFonts.push(copy(font));},
  createFrame:()=>create('FRAME'),createRectangle:()=>create('RECTANGLE'),createEllipse:()=>create('ELLIPSE'),createLine:()=>create('LINE'),createText:()=>create('TEXT'),createVector:()=>create('VECTOR'),
  createSlide:()=>{const n=create('SLIDE');n.resize(1920,1080);if(!grid.length)grid.push([]);grid.at(-1)!.push(n);return n;},
  createNodeFromSvg(svg:string){const frame=create('FRAME'),vector=node('VECTOR'),opening=svg.match(/<svg\b[^>]*>/i)?.[0]??'',view=opening.match(/\bviewBox=["']([^"']+)["']/)?.[1].trim().split(/[\s,]+/).map(Number),dimension=(key:string,fallback:number)=>Number(opening.match(new RegExp('\\b'+key+'=["\\\']([\\d.]+)'))?.[1]??fallback),w=dimension('width',view?.[2]??100),h=dimension('height',view?.[3]??100);frame.resize(w,h);frame.fills=[];frame.appendChild(vector);vector.resize(w,h);const path=svg.match(/<path\b[^>]*>/i)?.[0]??opening,attribute=(key:string)=>path.match(new RegExp('\\b'+key+'=["\\\']([^"\\\']+)'))?.[1]??opening.match(new RegExp('\\b'+key+'=["\\\']([^"\\\']+)'))?.[1];const fill=attribute('fill')??'#000000',stroke=attribute('stroke')??'none';vector.fills=fill.startsWith('#')?[color(fill)]:[];vector.strokes=stroke.startsWith('#')?[color(stroke)]:[];vector.strokeWeight=Number(attribute('stroke-width')??0);vector.vectorPaths=[{windingRule:'NONZERO',data:attribute('d')??''}];return frame;},
  getSlideGrid:()=>grid.map(row=>row.filter(n=>!n.removed)),setSlideGrid(value:any[][]){const flat=value.flat();if(new Set(flat).size!==flat.length||flat.some(n=>n.type!=='SLIDE'||n.removed))throw Error('Invalid fixture slide grid');grid=value.map(row=>[...row]);for(const n of flat)if(n.parent!==page)page.appendChild(n);page.children=[...page.children.filter((n:any)=>n.type!=='SLIDE'),...flat];},
  getNodeById:(id:string)=>[...nodes].find(n=>n.id===id&&!n.removed)??null,getNodeByIdAsync:async(id:string)=>host.getNodeById(id),
  commitUndo(){commits++;history.push(snapshot());},triggerUndo(){undos++;if(history.length>1)history.pop();const previous=history.at(-1);if(previous)restore(previous);},
  base64Encode:(bytes:Uint8Array)=>Buffer.from(bytes).toString('base64'),base64Decode:(value:string)=>new Uint8Array(Buffer.from(value,'base64')),showUI(){},ui:{postMessage(){}},on(){},off(){},
 };
 return {host,page,slide,node,get metadataWrites(){return metadataWrites.length;},metadataLog:metadataWrites,loadedFonts,fonts,snapshot,restore,getNode:(id:string)=>host.getNodeById(id),get nodes(){return [...nodes];},get commits(){return commits;},get undos(){return undos;},get historyLength(){return history.length;}};
}
export const figmaShapeHost=shapeHost;
