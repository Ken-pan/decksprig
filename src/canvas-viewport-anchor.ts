export type ViewGeometry = {width:number;height:number;left:number;top:number;scrollX:number;scrollY:number;artX:number;artY:number;scale:number};
export type ViewAnchor = {x:number;y:number;horizontal:number;vertical:number;screenX:number;screenY:number};

export function captureViewAnchor(view:ViewGeometry,horizontal=.5,vertical=.5):ViewAnchor {
  const screenX=view.left+view.width*horizontal,screenY=view.top+view.height*vertical;
  return {x:(view.scrollX+screenX-view.artX)/view.scale,y:(view.scrollY+screenY-view.artY)/view.scale,horizontal,vertical,screenX,screenY};
}

export function scrollForAnchor(anchor:ViewAnchor,view:ViewGeometry,keepScreenPoint=false) {
  return {left:view.artX+anchor.x*view.scale-(keepScreenPoint?anchor.screenX:view.left+view.width*anchor.horizontal),
    top:view.artY+anchor.y*view.scale-(keepScreenPoint?anchor.screenY:view.top+view.height*anchor.vertical)};
}
