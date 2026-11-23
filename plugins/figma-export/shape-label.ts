import type {SlideElement} from '../../src/core/model';
import {isTextShape,shapeTextElement} from '../../src/core/shape-text';
import {sameFigmaTextAppearance,stableValue} from '../../src/core/figma-sync';
import {SHAPE_LABEL_KEY,SHAPE_LABEL_PART_KEY,ShapeLabelDataSchema,shapeLabelData,type ShapeLabelData,type ShapeLabelCapture} from '../../src/core/figma-shape-label';

export const hasShapeLabel=(e:SlideElement)=>isTextShape(e)&&Boolean(e.text.length);
export type ShapeLabelParts={node:any;body:any;label:any;text:any;paint:any;data:ShapeLabelData};
const role=(n:any)=>n?.getPluginData?.(SHAPE_LABEL_PART_KEY);
const paintStyle=(n:any)=>stableValue({fills:n.fills??[],strokes:n.strokes??[],strokeWeight:n.strokeWeight??0,effects:n.effects??[]});
function paintAuthority(body:any){
 const leaves:any[]=[];
 const visit=(n:any)=>{if(n.visible===false||n.isMask)return;if(['RECTANGLE','ELLIPSE','LINE','VECTOR'].includes(n.type))leaves.push(n);else for(const child of n.children??[])visit(child);};visit(body);
 if(!leaves.length||leaves.some(n=>paintStyle(n)!==paintStyle(leaves[0])))return;
 return leaves[0];
}
/** Preset bodies remain semantic only while their public native paths/layout match. */
function bodyGeometry(body:any):string|undefined{
 if(!body.getPluginData?.('deck-studio-visual'))return;
 const visit=(node:any,root=false):any=>({type:node.type,size:[node.width,node.height],transform:root?undefined:node.relativeTransform,paths:node.type==='VECTOR'?node.vectorPaths:undefined,layout:Object.fromEntries(['layoutMode','clipsContent','isMask','maskType','booleanOperation',...(!root?['effects']:[])].filter(key=>key in node).map(key=>[key,node[key]])),children:('children'in node?node.children:[]).map((child:any)=>visit(child))});
 const raw=stableValue(visit(body,true));if(raw.length>60000)throw new Error('The native shape path exceeds the safe editable-label metadata limit. No content was changed.');return raw;
}
/** Part roles deliberately contain no native IDs so real native clones remain readable. */
export function readShapeLabel(n:any):ShapeLabelParts|undefined{
 const raw=n?.getPluginData?.(SHAPE_LABEL_KEY);if(n?.type!=='FRAME'||!raw||raw.length>90000)return;
 let data:ShapeLabelData,geometry:unknown;try{const parsed=JSON.parse(raw);if(parsed.version!==1)return;data=ShapeLabelDataSchema.parse(parsed.data);geometry=parsed.bodyGeometry;}catch{return;}
 const children=n.children??[],bodies=children.filter((v:any)=>role(v)==='body'),labels=children.filter((v:any)=>role(v)==='label');
 if(children.length!==2||bodies.length!==1||labels.length!==1)return;
 const body=bodies[0],label=labels[0],texts=(label.children??[]).filter((v:any)=>v.type==='TEXT'&&role(v)==='text'),paint=paintAuthority(body);
 if(label.type!=='FRAME'||label.layoutMode!=='VERTICAL'||label.children?.length!==1||texts.length!==1||!paint||body.visible===false||label.visible===false||texts[0].visible===false||(body.opacity??1)!==1||(label.opacity??1)!==1||(texts[0].opacity??1)!==1)return;
 const visible=(values:any)=>Array.isArray(values)?values.filter((value:any)=>value.visible!==false):[];
 if(visible(n.fills).length||visible(n.strokes).length||visible(n.effects).length||n.clipsContent===true)return;
 if(visible(paint.fills).length>1||visible(paint.fills).some((value:any)=>value.type!=='SOLID')||visible(paint.strokes).length>1||visible(paint.strokes).some((value:any)=>value.type!=='SOLID')||visible(body.effects).length>1||visible(body.effects).some((value:any)=>value.type!=='DROP_SHADOW'))return;
 const expected=data.type==='ellipse'?'ELLIPSE':data.type==='line'?'LINE':'RECTANGLE';
 if(!body.getPluginData?.('deck-studio-visual')&&body.type!==expected)return;
 try{const current=bodyGeometry(body);if(current!==undefined&&current!==geometry)return;}catch{return;}
 if(data.type!=='line')for(const part of [body,label]){
  if(Math.abs(part.width-n.width)>.01||Math.abs(part.height-n.height)>.01||part.relativeTransform?.some((row:number[],r:number)=>row.some((value:number,c:number)=>Math.abs(value-[[1,0,0],[0,1,0]][r][c])>1e-5)))return;
 }
 if(!['MIN','CENTER','MAX'].includes(label.primaryAxisAlignItems)||['paddingLeft','paddingRight','paddingTop','paddingBottom'].some(key=>!Number.isFinite(label[key])||label[key]<0||label[key]>2000))return;
 return {node:n,body,label,text:texts[0],paint,data};
}
export function captureShapeLabel(n:any):ShapeLabelCapture|undefined{
 const p=readShapeLabel(n);return p?{version:1,data:p.data,bodyId:p.body.id,paintId:p.paint.id,labelFrameId:p.label.id,textId:p.text.id}:undefined;
}
export function prepareShapeLabel(figma:any,n:any,e:SlideElement){
 if(!hasShapeLabel(e)&&!n?.getPluginData?.(SHAPE_LABEL_KEY))return;
 shapeLabelData(e);
 if(n?.getPluginData?.(SHAPE_LABEL_KEY)&&!readShapeLabel(n))throw new Error(`“${e.name}” has changed native shape-label layers. Restore the body and text layout before syncing. No content was changed.`);
 const existing=readShapeLabel(n);if(n&&!existing&&n.parent?.layoutMode&&n.parent.layoutMode!=='NONE'&&n.layoutPositioning!=='ABSOLUTE')throw new Error(`“${e.name}” belongs to native auto layout. Set it to absolute position in Figma before adding a label. No content was changed.`);if(existing&&(existing.data.type!==e.type||existing.data.shape!==e.shape&&!e.shape&&e.type!=='diamond'))throw new Error(`“${e.name}” changes its native shape kind. Change the body in Figma or create a separate labeled shape before syncing. No content was changed.`);
 if(!n?.getPluginData?.(SHAPE_LABEL_KEY)&&n&&!['RECTANGLE','ELLIPSE','LINE'].includes(n.type)&&!n.getPluginData?.('deck-studio-visual'))throw new Error(`“${e.name}” is not an editable native shape. Keep its native layers or create a separate labeled shape. No content was changed.`);
 if(typeof figma.createFrame!=='function'||typeof figma.createText!=='function')throw new Error('This Figma host cannot create editable shape labels. No content was changed.');
}

/** Create only the owned wrapper/label layers; existing native body ID is retained. */
export function writeShapeLabel(figma:any,n:any,e:SlideElement,parent:any,createBody:()=>any){
 let parts=readShapeLabel(n);const createdIds:string[]=[];
 if(parts)return {...parts,createdIds,freshText:false};
 const original=n,wrapper=figma.createFrame();createdIds.push(wrapper.id);wrapper.name=e.name;wrapper.fills=[];wrapper.strokes=[];wrapper.clipsContent=false;wrapper.layoutMode='NONE';
 const index=original?.parent===parent?parent.children.indexOf(original):-1;
 if(index>=0&&typeof parent.insertChild==='function')parent.insertChild(index,wrapper);else parent.appendChild(wrapper);
 wrapper.resize(e.w,e.h);if(original&&'layoutPositioning'in original)wrapper.layoutPositioning=original.layoutPositioning;if(original?.constraints)wrapper.constraints={...original.constraints};wrapper.opacity=original?.opacity??1;wrapper.visible=original?.visible??true;wrapper.locked=original?.locked??false;wrapper.blendMode=original?.blendMode??'NORMAL';
 const body=original??createBody();if(!original)createdIds.push(body.id);wrapper.appendChild(body);body.setPluginData(SHAPE_LABEL_PART_KEY,'body');body.setPluginData('deck-studio-id','');body.opacity=1;body.visible=true;body.locked=false;body.blendMode='NORMAL';body.constraints={horizontal:'SCALE',vertical:'SCALE'};
 const label=figma.createFrame();wrapper.appendChild(label);createdIds.push(label.id);label.name='Label';label.setPluginData(SHAPE_LABEL_PART_KEY,'label');label.fills=[];label.strokes=[];label.effects=[];label.layoutMode='VERTICAL';label.primaryAxisSizingMode='FIXED';label.counterAxisSizingMode='FIXED';label.constraints={horizontal:'SCALE',vertical:'SCALE'};
 const text=figma.createText();label.appendChild(text);createdIds.push(text.id);text.name='Label text';text.setPluginData(SHAPE_LABEL_PART_KEY,'text');
 parts={node:wrapper,body,label,text,paint:paintAuthority(body),data:shapeLabelData(e)};
 return {...parts,createdIds,freshText:true};
}

export function updateShapeLabel(parts:ShapeLabelParts,e:SlideElement,fonts:Map<string,any>,prior:SlideElement|undefined,freshText:boolean,setText:(n:any,e:SlideElement,fonts:Map<string,any>,prior?:SlideElement)=>void){
 const label=shapeTextElement(e),before=prior?shapeTextElement(prior):undefined;
 if(freshText||!before||!sameFigmaTextAppearance(label,before)||parts.text.characters!==label.text)setText(parts.text,label,fonts,freshText?undefined:before);
 if(label.link!==before?.link||freshText)parts.text.hyperlink=label.link?{type:'URL',value:label.link}:null;
 const p=label.padding??{left:0,right:0,top:0,bottom:0};
 parts.label.paddingLeft=p.left;parts.label.paddingRight=p.right;parts.label.paddingTop=p.top;parts.label.paddingBottom=p.bottom;
 parts.label.primaryAxisAlignItems=label.verticalAlign==='middle'?'CENTER':label.verticalAlign==='bottom'?'MAX':'MIN';
 const align=label.paragraphs?.[0]?.align??label.align;parts.label.counterAxisAlignItems=!label.wrap?(align==='right'?'MAX':align==='center'?'CENTER':'MIN'):'MIN';
 parts.label.clipsContent=label.clipText!==false;
 parts.text.resize(Math.max(.01,label.w-p.left-p.right),Math.max(.01,parts.text.height||label.fontSize*label.lineHeight));
 parts.text.textAutoResize=label.wrap?'HEIGHT':'WIDTH_AND_HEIGHT';parts.text.layoutSizingHorizontal=label.wrap?'FILL':'HUG';
 parts.node.setPluginData(SHAPE_LABEL_KEY,JSON.stringify({version:1,data:shapeLabelData(e),bodyGeometry:bodyGeometry(parts.body)}));
}

export function layoutShapeLabel(parts:ShapeLabelParts,e:SlideElement,slide:any,position:(node:any,element:SlideElement,slide:any)=>void){
 position(parts.node,{...e,type:'rect',padding:undefined},slide);
 position(parts.body,e,slide);
 const text=shapeTextElement(e);position(parts.label,{...text,type:'rect',padding:undefined},slide);
}
