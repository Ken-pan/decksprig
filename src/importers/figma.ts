import {textLinkUrl} from '../core/text-link';
import { ElementSchema, element, newDeck, blankSlide, validateDeck, type TextRun, type SlideElement, type TextParagraph } from '../core/model';
import { needsRasterGroup, needsRasterNode } from './figma-raster';
import {figmaVisibleLayout,textLayoutFingerprint,textMetricsFingerprint} from '../core/native-text-layout';
import {figmaBackgroundSvg} from './figma-background';
import {figmaId} from '../core/figma-identity';
import {importSlideTransition} from '../core/figma-transitions';
import {figmaFeatureNotes,nativeAnimateCaptureWarning} from '../core/figma-compatibility';
import {importNativeTable,importLayerTable} from './figma-table';
import {decodeDeckObjectMotion,restoredObjectMotionWarning} from '../core/figma-object-motion';
import {decodeShapeLabelCapture} from '../core/figma-shape-label';

const rgb = (c: any, fallback = '#000000', opacity = 1) => {
  if (!c) return fallback;
  const hex = [c.r ?? 0,c.g ?? 0,c.b ?? 0].map(v=>Math.round(Math.max(0,Math.min(1,v))*255).toString(16).padStart(2,'0')).join('');
  const alpha = Math.max(0,Math.min(1,(c.a ?? 1)*opacity));
  return `#${hex}${alpha<1?Math.round(alpha*255).toString(16).padStart(2,'0'):''}`;
};
const paints = (node: any, key = 'fills'): any[] => Array.isArray(node[key]) ? node[key].filter((p: any)=>p.visible!==false) : [];
const paintColor = (p: any, fallback = 'transparent') => p?.type==='SOLID' ? rgb(p.color,fallback,p.opacity??1) : fallback;
const multiply = (p: number[][], t: number[][]) => [[p[0][0]*t[0][0]+p[0][1]*t[1][0],p[0][0]*t[0][1]+p[0][1]*t[1][1],p[0][0]*t[0][2]+p[0][1]*t[1][2]+p[0][2]],[p[1][0]*t[0][0]+p[1][1]*t[1][0],p[1][0]*t[0][1]+p[1][1]*t[1][1],p[1][0]*t[0][2]+p[1][1]*t[1][2]+p[1][2]]];
const textCase=(value:string|undefined):SlideElement['textCase']=>({UPPER:'upper',LOWER:'lower',TITLE:'title',SMALL_CAPS:'small-caps',SMALL_CAPS_FORCED:'small-caps',ORIGINAL:'none'} as const)[value as 'UPPER'];
const blendMode=(value:string|undefined):SlideElement['blendMode']=>{const mapped=value?.toLowerCase().replaceAll('_','-');return ['normal','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion','hue','saturation','color','luminosity'].includes(mapped??'')?mapped as SlideElement['blendMode']:undefined;};
const round = (v: number) => Math.round(v*1e9)/1e9;

function textContent(node: any, scale: number) {
  const style=node.style??{}, text: string=node.characters??'', overrides=node.characterStyleOverrides??[];
  const runs: TextRun[]=[];
  const runStyle=(s: any): Omit<TextRun,'text'>=>({fontFamily:s.fontFamily??'Arial',fontSize:Math.max(1,(s.fontSize??32)*scale),fontWeight:s.fontWeight??400,italic:s.italic??false,underline:s.textDecoration==='UNDERLINE',strikethrough:s.textDecoration==='STRIKETHROUGH',textCase:textCase(s.textCase),color:paintColor(paints(s)[0]??paints(node)[0],'#000000'),letterSpacing:(s.letterSpacing??0)*scale});
  for(let start=0;start<text.length;){const id=overrides[start]??0;let end=start+1;while(end<text.length&&(overrides[end]??0)===id)end++;runs.push({text:text.slice(start,end),...runStyle({...style,...node.styleOverrideTable?.[id]})});start=end;}
  const paragraphs: TextParagraph[]=[];
  // Figma paragraph spacing applies between paragraphs, not outside the text box.
  if(style.paragraphSpacing||style.paragraphIndent||style.textAlignHorizontal==='JUSTIFIED'||node.paragraphStyles?.length){
    let offset=0;
    for(const [index,line] of text.split('\n').entries()){
      const s={...style,...node.paragraphStyles?.[index]}, end=offset+line.length, parts: TextRun[]=[];let pos=0;
      for(const run of runs){const a=Math.max(offset,pos),b=Math.min(end,pos+run.text.length);if(b>a)parts.push({...run,text:run.text.slice(a-pos,b-pos)});pos+=run.text.length;}
      paragraphs.push({runs:parts,align:s.textAlignHorizontal==='JUSTIFIED'?'justify':s.textAlignHorizontal==='CENTER'?'center':s.textAlignHorizontal==='RIGHT'?'right':'left',spaceBefore:0,spaceAfter:(s.paragraphSpacing??0)*scale,indent:0,firstLineIndent:(s.paragraphIndent??0)*scale,...(s.lineHeightPx?{lineSpacing:s.lineHeightPx*scale}:{})});offset=end+1;
    }
  }
  return {text,runs,paragraphs:paragraphs.length?paragraphs:undefined};
}

/** Only controlled compounds become one shape; their native text and paints stay live. */
function importShapeLabel(node:any,common:Partial<SlideElement>,bundle:any,rootTransform:number[][]|null,rootSize:any,slideScale:number):SlideElement|undefined {
  const capture=decodeShapeLabelCapture(node.deckStudioShapeLabel);if(!capture||node.type!=='FRAME')return;
  const parts=new Map<string,{node:any;transform:number[][]|null}>();let duplicate=false;
  const index=(part:any,parent:number[][]|null)=>{
    if(parts.has(part.id)){duplicate=true;return;}
    const absolute=bundle.nodeGeometry?.[part.id]?.transform,local=parent&&part.relativeTransform?multiply(parent,part.relativeTransform):null;
    const transform=local&&(!absolute||local.every((row:number[],i:number)=>row.every((v:number,j:number)=>Math.abs(v-absolute[i][j])<=Math.max(1e-5,Math.abs(absolute[i][j])*2**-21))))?local:absolute??local;
    parts.set(part.id,{node:part,transform});for(const child of part.children??[])index(child,transform??parent);
  };
  for(const child of node.children??[])index(child,rootTransform);
  const body=parts.get(capture.bodyId)?.node,paint=parts.get(capture.paintId)?.node,label=parts.get(capture.labelFrameId)?.node,text=parts.get(capture.textId)?.node;
  const contains=(parent:any,id:string):boolean=>parent?.id===id||(parent?.children??[]).some((child:any)=>contains(child,id));
  if(duplicate||node.children?.length!==2||!node.children.includes(body)||!node.children.includes(label)||!['RECTANGLE','ELLIPSE','LINE','FRAME'].includes(body?.type)||!contains(body,capture.paintId)||!['RECTANGLE','ELLIPSE','LINE','VECTOR'].includes(paint?.type)||label?.type!=='FRAME'||label.layoutMode!=='VERTICAL'||label.children?.length!==1||label.children[0]!==text||text?.type!=='TEXT'||typeof text.characters!=='string')return;
  if(!['MIN','CENTER','MAX'].includes(label.primaryAxisAlignItems))return;
  const labelSize=bundle.nodeGeometry?.[label.id]?.size??label.size;
  // Connector labels use the derived center box and may counter-rotate their line.
  if(capture.data.type!=='line'){
    if(rootSize&&labelSize&&(Math.abs(rootSize.x-labelSize.x)>.01||Math.abs(rootSize.y-labelSize.y)>.01))return;
    if(label.relativeTransform&&label.relativeTransform.some((row:number[],r:number)=>row.some((v:number,c:number)=>Math.abs(v-[[1,0,0],[0,1,0]][r][c])>.00001)))return;
  }
  const fills=paints(paint),strokes=paints(paint,'strokes'),effects=(Array.isArray(body.effects)?body.effects:paint.effects??[]).filter((effect:any)=>effect.visible!==false);
  if(fills.length>1||fills.some((p:any)=>p.type!=='SOLID')||strokes.length>1||strokes.some((p:any)=>p.type!=='SOLID')||effects.length>1||effects.some((effect:any)=>effect.type!=='DROP_SHADOW')||paint.rectangleCornerRadii?.some((radius:number)=>radius!==paint.rectangleCornerRadii[0]))return;
  const textTransform=parts.get(text.id)?.transform,paintTransform=parts.get(paint.id)?.transform;
  const scale=slideScale*(textTransform?Math.hypot(textTransform[0][0],textTransform[1][0]):rootTransform?Math.hypot(rootTransform[0][0],rootTransform[1][0]):1);
  const paintScale=slideScale*(paintTransform?Math.hypot(paintTransform[0][0],paintTransform[1][0]):1);
  const rootScaleX=slideScale*(rootTransform?Math.hypot(rootTransform[0][0],rootTransform[1][0]):1),rootScaleY=slideScale*(rootTransform?Math.hypot(rootTransform[0][1],rootTransform[1][1]):1);
  const padding={left:label.paddingLeft*rootScaleX,right:label.paddingRight*rootScaleX,top:label.paddingTop*rootScaleY,bottom:label.paddingBottom*rootScaleY};
  if(Object.values(padding).some(value=>!Number.isFinite(value)||value<0||value>2000))return;
  const {data}=capture,style=text.style??{},content=textContent(text,scale),shadow=effects[0];
  const color=paintColor(paints(style)[0]??paints(text)[0],data.shapeText?.color??'#000000');
  const align=style.textAlignHorizontal==='CENTER'?'center':style.textAlignHorizontal==='RIGHT'?'right':style.textAlignHorizontal==='LEFT'?'left':data.shapeText?.align??'center';
  const parsed=ElementSchema.safeParse({...data,...common,...content,link:text.textLink,
    fill:paintColor(fills[0]),stroke:paintColor(strokes[0]),strokeWidth:(paint.strokeWeight??0)*paintScale,
    radius:(typeof paint.cornerRadius==='number'?paint.cornerRadius:paint.rectangleCornerRadii?.[0]??('radius'in data?data.radius:0))*paintScale,
    shadow:shadow?{color:rgb(shadow.color).slice(0,7),opacity:shadow.color?.a??1,blur:shadow.radius*paintScale,x:shadow.offset.x*paintScale,y:shadow.offset.y*paintScale}:undefined,
    fontFamily:style.fontFamily??data.fontFamily,fontSize:Math.max(4,(style.fontSize??data.fontSize)*scale),fontWeight:style.fontWeight??data.fontWeight,italic:style.italic??data.italic,
    underline:style.textDecoration?style.textDecoration==='UNDERLINE':data.underline,strikethrough:style.textDecoration?style.textDecoration==='STRIKETHROUGH':data.strikethrough,
    textCase:style.textCase?textCase(style.textCase):data.textCase,lineHeight:Math.max(.5,Math.min(4,style.lineHeightPx&&style.fontSize?style.lineHeightPx/style.fontSize:data.lineHeight)),letterSpacing:(style.letterSpacing??data.letterSpacing)*scale,
    shapeText:{color,align,verticalAlign:label.primaryAxisAlignItems==='CENTER'?'middle':label.primaryAxisAlignItems==='MAX'?'bottom':'top'},padding,paragraphSpacingAtEdges:false,
  });
  return parsed.success?parsed.data:undefined;
}

export function importFigma(bundle: any) {
  const nodes=bundle.slides;
  if(!Array.isArray(nodes)||!nodes.length)throw new Error('No slides found in the Figma data.');
  const box=nodes[0].absoluteBoundingBox??{width:nodes[0].width,height:nodes[0].height,x:0,y:0},pageScale=Math.max(1,100/box.width,100/box.height),width=box.width*pageScale,height=box.height*pageScale;
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('The Figma slide size is invalid.');
  const slides=nodes.map((n: any)=>{
    const b=n.absoluteBoundingBox??{x:0,y:0,width:n.width,height:n.height},sx=Math.min(width/b.width,height/b.height),sy=sx,ox=(width-b.width*sx)/2,oy=(height-b.height*sy)/2;
    const s=blankSlide(),warnings=new Set<string>(figmaFeatureNotes(n));
    s.id=figmaId('slide',n.id,n.deckStudioId);s.title=n.name;s.pageSection=n.pageSection;s.notes=n.speakerNotes??'';s.hidden=n.isSkippedSlide||undefined;
    s.background=n.type==='SLIDE'&&Array.isArray(n.fills)&&!paints(n).length?'transparent':paintColor(paints(n)[0],'#ffffff');
    const background=bundle.backgroundRenders?.[n.id]??figmaBackgroundSvg(n.fills??[],bundle.assets??{},b.width,b.height);
    if(background)s.elements.push(element('image',{id:figmaId('background',n.id),name:'Figma background',x:ox,y:oy,w:b.width*sx,h:b.height*sy,src:background.startsWith('data:')?background:`data:image/svg+xml;charset=utf-8,${encodeURIComponent(background)}`,fit:'fill',sourceId:`figma-background:${n.id}`}));
    if(n.slideTransition)s.transition=importSlideTransition(n.slideTransition);
    if(n.slideTransition?.timing?.type==='AFTER_DELAY')warnings.add('Native automatic advance timing is retained. Review playback timing in the browser.');
    if(n.slideTransition&&['GENTLE','QUICK','BOUNCY','SLOW'].includes(n.slideTransition.curve))warnings.add('The native spring curve is retained for Figma. Compare browser motion with its source.');
    if(b.width!==box.width||b.height!==box.height)warnings.add('This slide differs in size from the first slide. Its proportions are preserved within the shared canvas.');
    const visit=(node: any,parent=[[1,0,b.x],[0,1,b.y]],parentOpacity=1,group?:string,parentHidden=false,parentLocked=false)=>{
      if(node.isMask)return;
      if(node.blendMode&&!['NORMAL','PASS_THROUGH'].includes(node.blendMode)&&!blendMode(node.blendMode))warnings.add(`“${node.name}” uses an unsupported blend mode. Compare its source reference.`);
      // Some native groups expose children in their enclosing coordinate space.
      // Use local precision only when it agrees with native geometry within float32 error.
      const absolute=bundle.nodeGeometry?.[node.id]?.transform,local=node.relativeTransform?multiply(parent,node.relativeTransform):null;
      const transform=local&&(!absolute||local.every((row:number[],i:number)=>row.every((v:number,j:number)=>Math.abs(v-absolute[i][j])<=Math.max(1e-5,Math.abs(absolute[i][j])*2**-21))))?local:absolute??local;
      const q=node.absoluteBoundingBox??(transform&&node.size?{x:transform[0][2],y:transform[1][2],width:node.size.x,height:node.size.y}:null);
      if(!q){(node.children??[]).forEach((c: any)=>visit(c,transform??parent,parentOpacity,group,parentHidden,parentLocked));return;}
      const size=bundle.nodeGeometry?.[node.id]?.size??node.size;
      let common: Partial<SlideElement>={id:figmaId('node',node.id,node.deckStudioId),name:node.name??node.type,x:ox+(q.x-b.x)*sx,y:oy+(q.y-b.y)*sy,w:Math.max(1,q.width*sx),h:Math.max(1,q.height*sy),sourceId:node.id,opacity:(node.opacity??1)*parentOpacity,...(node.blendMode&&!['NORMAL','PASS_THROUGH'].includes(node.blendMode)?{blendMode:blendMode(node.blendMode)}:{}),hidden:parentHidden||node.visible===false,locked:parentLocked||node.locked===true,group};
      const motion=decodeDeckObjectMotion(node.deckStudioMotion);if(motion.data){Object.assign(common,motion.data);if(Object.keys(motion.data).length)warnings.add(restoredObjectMotionWarning);}if(motion.warning||node.deckStudioMotionWarning)warnings.add(motion.warning??String(node.deckStudioMotionWarning).slice(0,300));
      if(transform&&size){
        const ax=Math.hypot(transform[0][0],transform[1][0]),ay=Math.hypot(transform[0][1],transform[1][1]),w=size.x*ax*sx,h=size.y*ay*sy;
        common={...common,x:round(ox+(transform[0][2]+transform[0][0]*size.x/2+transform[0][1]*size.y/2-b.x)*sx-Math.max(1,w)/2),y:round(oy+(transform[1][2]+transform[1][0]*size.x/2+transform[1][1]*size.y/2-b.y)*sy-Math.max(1,h)/2),w:Math.max(1,round(w)),h:Math.max(1,round(h)),rotation:round(Math.atan2(transform[1][0],transform[0][0])*180/Math.PI),flipY:transform[0][0]*transform[1][1]-transform[0][1]*transform[1][0]<0};
        if(Math.abs(transform[0][0]*transform[0][1]+transform[1][0]*transform[1][1])>1e-5)warnings.add(`“${node.name}” contains a skew transform that needs review.`);
      }
      const fill=paints(node)[0],stroke=paints(node,'strokes')[0],imageRef=fill?.imageRef??fill?.imageHash;
      // Exporting an isolated image cannot bake its paint's blend with the slide.
      if(!bundle.nodeRenders?.[node.id]&&paints(node).length===1&&fill?.blendMode&&!['NORMAL','PASS_THROUGH'].includes(fill.blendMode)&&['NORMAL','PASS_THROUGH',undefined].includes(node.blendMode))common.blendMode=blendMode(fill.blendMode);
      const shadow=(node.effects??[]).find((e: any)=>e.visible!==false&&e.type==='DROP_SHADOW');
      const appearance={fill:paintColor(fill),stroke:paintColor(stroke),strokeWidth:(node.strokeWeight??0)*sx,radius:(node.cornerRadius??node.rectangleCornerRadii?.[0]??0)*sx,...(shadow?{shadow:{color:rgb(shadow.color).slice(0,7),opacity:shadow.color?.a??1,blur:shadow.radius*sx,x:shadow.offset.x*sx,y:shadow.offset.y*sy}}:{})};
      if(node.type==='LINE'){
        const r=node.absoluteRenderBounds;
        if(r&&!node.effects?.some((e:any)=>e.visible!==false)){
          common.x=common.x!+(r.x+r.width/2-q.x-q.width/2)*sx;
          common.y=common.y!+(r.y+r.height/2-q.y-q.height/2)*sy;
        }else if(['INSIDE','OUTSIDE'].includes(node.strokeAlign)){
          const angle=(common.rotation??0)*Math.PI/180,offset=appearance.strokeWidth/2*(node.strokeAlign==='INSIDE'?1:-1)*(common.flipY?-1:1);
          common.x=common.x!+Math.sin(angle)*offset;common.y=common.y!-Math.cos(angle)*offset;
        }
      }
      const nativeRegion=()=>{const r=node.absoluteRenderBounds??q,x=Math.max(0,(r.x-b.x)*sx),y=Math.max(0,(r.y-b.y)*sy),right=Math.min(width,(r.x+r.width-b.x)*sx),bottom=Math.min(height,(r.y+r.height-b.y)*sy);return right>x&&bottom>y?{...common,x,y,w:right-x,h:bottom-y,rotation:0,flipX:false,flipY:false,opacity:1,sourceRegion:{left:x/width,top:y/height,right:Math.max(0,1-right/width),bottom:Math.max(0,1-bottom/height)}}:null;};
      if(node.deckStudioShapeLabel!==undefined||node.deckStudioShapeLabelWarning){
        const shape=importShapeLabel(node,common,bundle,transform??null,size,sx);
        if(shape){s.elements.push(shape);if(shape.type==='line')warnings.add('Line labels follow the connector’s derived label box. Independent native label positioning is not retained.');return;}
        warnings.add(`“${node.name??node.type}” has an editable shape label that could not be read safely. Compare its source reference.`);
      }
      const table=node.type==='TABLE'?importNativeTable(node,{...common,opacity:parentOpacity},bundle.nodeRenders?.[node.id],sx):importLayerTable(node,{...common,opacity:parentOpacity},bundle.nodeRenders?.[node.id],sx);
      if(table){s.elements.push(table);warnings.add(node.deckStudioTable?'This table uses editable Figma layers. Merged cells and formatting are retained; Figma’s native table toolbar is not available for this layer group.':table.tableStyle?.merges?.length?'Existing native merged cells are retained. Owner text and local formatting can sync; changing merged structure, grid sizing or covered cells remains unavailable.':'Cell text, supported formatting, final rows and columns, and table copies can sync natively. Native merges and other structural edits remain limited; compare the native appearance after sync.');}
      else if(needsRasterNode(node)&&bundle.nodeRenders?.[node.id]){
        const r=bundle.nodeRenderBounds?.[node.id]??node.absoluteRenderBounds??q;
        if(node.type==='TABLE')warnings.add('This native table has a cell grid that cannot be inferred safely. Its image stays a locked reference; edit the original table in Figma.');
        // Exported node PNG already contains its own opacity; ancestors remain separate.
        s.elements.push(element('image',{...common,...(bundle.nodeBackdropRenders?.[node.id]?{blendMode:undefined}:{}),x:ox+(r.x-b.x)*sx,y:oy+(r.y-b.y)*sy,w:Math.max(1,r.width*sx),h:Math.max(1,r.height*sy),rotation:0,flipX:false,flipY:false,opacity:parentOpacity,src:bundle.nodeRenders[node.id],fit:'fill',...(node.type==='TABLE'?{locked:true}:{})}));
        warnings.add(`“${node.name??node.type}” is preserved as an image; its internal structure is not independently editable.`);
      }else if(node.type==='TEXT'){
        const style=node.style??{},scale=sx*(transform&&size?Math.hypot(transform[0][0],transform[1][0]):1),content=textContent(node,scale);
        const imported=element('text',{...common,...content,...(textLinkUrl(node.textLink)?{link:textLinkUrl(node.textLink)}:{}),fill:paintColor(fill,'#000000'),fontFamily:style.fontFamily??'Arial',fontSize:Math.max(4,(style.fontSize??32)*scale),fontWeight:style.fontWeight??400,italic:style.italic??false,underline:style.textDecoration==='UNDERLINE',strikethrough:style.textDecoration==='STRIKETHROUGH'||undefined,textCase:textCase(style.textCase),align:style.textAlignHorizontal==='CENTER'?'center':style.textAlignHorizontal==='RIGHT'?'right':'left',verticalAlign:style.textAlignVertical==='CENTER'?'middle':style.textAlignVertical==='BOTTOM'?'bottom':'top',lineHeight:Math.max(.5,Math.min(4,style.lineHeightPx&&style.fontSize?style.lineHeightPx/style.fontSize:1.2)),letterSpacing:(style.letterSpacing??0)*scale,paragraphSpacingAtEdges:false,textSizing:style.textAutoResize==='WIDTH_AND_HEIGHT'?'auto-width':style.textAutoResize==='HEIGHT'?'auto-height':'fixed',clipText:style.textAutoResize==='NONE'?false:undefined,maxLines:style.textTruncation==='ENDING'?(style.maxLines||Math.max(1,Math.round(common.h!/((style.lineHeightPx||style.fontSize*1.2)*scale)))):undefined});
        const native=bundle.textSvgs?.[node.id];if(native){const visible=figmaVisibleLayout(native,imported,scale),intrinsic=style.lineHeightPercent/100;if(visible){const r=node.absoluteRenderBounds??q;if(visible.spans)visible.spans=visible.spans.map(p=>({...p,x:p.x+(r.x-q.x)*sx,y:p.y+(r.y-q.y)*sy}));imported.nativeTextLayout={fingerprint:textLayoutFingerprint(imported),metricsFingerprint:textMetricsFingerprint(imported),...visible,...(Number.isFinite(intrinsic)&&intrinsic>=.5&&intrinsic<=4?{intrinsicLineHeight:intrinsic}:{})};}}
        const outline=bundle.textOutlines?.[node.id],r=node.absoluteRenderBounds??q;
        if(outline&&outline.length<1400000&&((node.opacity??1)===1||bundle.textOpacitySeparated?.[node.id])&&r.width>0&&r.height>0&&(imported.nativeTextLayout||Math.abs(common.rotation??0)>1e-7||common.flipX||common.flipY||!/[\r\n\u2028\u2029]/.test(imported.text))){
          imported.nativeTextLayout??={fingerprint:textLayoutFingerprint(imported),metricsFingerprint:textMetricsFingerprint(imported),runs:content.runs};
          const angle=(common.rotation??0)*Math.PI/180,c=Math.cos(angle),sine=Math.sin(angle),fx=common.flipX?-1:1,fy=common.flipY?-1:1,a=c*fx,bb=-sine*fy,cc=sine*fx,d=c*fy,cx=imported.w/2,cy=imported.h/2;
          imported.nativeTextLayout.outline={src:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(outline),x:ox+(r.x-b.x)*sx-imported.x,y:oy+(r.y-b.y)*sy-imported.y,w:Number(/<svg[^>]*\bwidth="([\d.]+)"/.exec(outline)?.[1]??r.width)*sx,h:Number(/<svg[^>]*\bheight="([\d.]+)"/.exec(outline)?.[1]??r.height)*sy,...(Math.abs(angle)>1e-7||fx<0||fy<0?{transform:[a,bb,cc,d,cx-a*cx-cc*cy,cy-bb*cx-d*cy]}:{})};
        }
        s.elements.push(imported);if(node.effects?.some((e: any)=>e.visible!==false))warnings.add(`“${node.name}” has text effects that need review.`);
      }else if(node.children?.length){
        if(needsRasterGroup(node)){const region=nativeRegion();if(region)s.elements.push(element('image',{...region}));warnings.add(`“${node.name??node.type}” contains masks or crops and is preserved as a source image region.`);return;}
        const ownGroup=figmaId('group',node.id,node.deckStudioGroupId);(s.groups??=[]).push({id:ownGroup,name:node.name||'Group',parent:group});
        if(fill?.type==='SOLID'||stroke)s.elements.push(element('rect',{...common,id:figmaId('background',node.id),group:ownGroup,...appearance}));
        node.children.forEach((c: any)=>visit(c,transform??parent,common.opacity,ownGroup,common.hidden,common.locked));
      }else if(imageRef&&bundle.assets?.[imageRef]){
        s.elements.push(element('image',{...common,...appearance,src:bundle.assets[imageRef],fit:fill.scaleMode==='FIT'?'contain':'cover'}));
      }else if(['RECTANGLE','ELLIPSE','LINE'].includes(node.type)&&!needsRasterNode(node)){
        s.elements.push(element(node.type==='ELLIPSE'?'ellipse':node.type==='LINE'?'line':'rect',{...common,...appearance,...(node.type==='LINE'?{h:Math.max(1,common.h??1),line:{route:'straight',dash:'solid',start:'none',end:'none',cap:node.strokeCap==='ROUND'?'round':node.strokeCap==='SQUARE'?'square':'butt',markerSize:1,bend:.5,...(node.dashPattern?.length?{dashArray:node.dashPattern.map((v:number)=>v*sx)}:{})}}:{})}));
      }else{const region=nativeRegion();if(region)s.elements.push(element('image',{...region}));warnings.add(`“${node.name??node.type}” is preserved as a source image region. Its internal structure is not independently editable.`);}
    };
    const rootMatrix=bundle.nodeGeometry?.[n.id]?.transform??[[1,0,b.x],[0,1,b.y]];
    (n.children??[]).forEach((c: any)=>visit(c,rootMatrix));
    if(!background&&paints(n).some((p: any)=>p.type!=='SOLID'))warnings.add('This slide has a non-solid background. Use the source reference to compare its appearance.');
    s.source={provider:'Figma',render:bundle.renders?.[n.id],warnings:[...warnings],fidelity:'converted',nodeId:n.id,label:n.name};return s;
  });
  // One import-level capability note, not one warning per page or an animation detector.
  const firstNativeSlide=nodes.findIndex((node:any)=>node.type==='SLIDE');if(firstNativeSlide>=0)slides[firstNativeSlide].source!.warnings.push(nativeAnimateCaptureWarning);
  const d=newDeck(bundle.title||'Figma Slides',slides,width,height);if(bundle.deckStudioId)d.id=figmaId('deck',bundle.deckStudioId,bundle.deckStudioId);
  d.provenance={provider:'Figma',url:bundle.url,importedAt:new Date().toISOString()};return validateDeck(d);
}
