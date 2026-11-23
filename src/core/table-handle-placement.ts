type Point={x:number;y:number};
type Rect={left:number;right:number;top:number;bottom:number};
type Viewport={left:number;top:number;width:number;height:number};
const clamp=(n:number,low:number,high:number)=>Math.max(low,Math.min(high,n));

/** Place the two 44px resize grips as a pair when the fitted artwork is tiny. */
export function tableHandlePoint(preferred:Point,axis:'row'|'column',table:Rect,viewport:Viewport,paper:Rect=table,aligned=true):Point{
  const {left,top,width,height}=viewport,right=left+width,bottom=top+height;
  const yPadding=Math.min(12,Math.max(0,(height-44)/2));
  const boundY=(y:number)=>height<44?(top+bottom)/2:clamp(y,top+yPadding+22,bottom-yPadding-22);
  if(table.right-table.left<44&&table.bottom-table.top<44||height<68){
    const padding=Math.min(12,Math.max(0,(width-96)/2));
    const around=[paper,table].find(r=>r.left-48>=left+padding&&r.right+48<=right-padding);
    let first:number,last:number;
    if(around){first=around.left-26;last=around.right+26;}
    else if(table.left-left-padding>=100){first=table.left-78;last=table.left-26;}
    else if(right-padding-table.right>=100){first=table.right+26;last=table.right+78;}
    else{first=(table.left+table.right)/2-26;last=first+52;}
    const span=Math.min(last-first,Math.max(0,width-padding*2-44));
    first=clamp(first,left+padding+22,right-padding-22-span);
    return {x:axis==='column'?first:first+span,y:boundY((table.top+table.bottom)/2)};
  }
  let {x,y}=preferred;
  if(aligned){
    if(axis==='row'&&x+22>right-12&&table.left-48>=left+12)x=table.left-26;
    if(axis==='column'&&y+22>bottom-12&&table.top-48>=top+12)y=table.top-26;
  }
  return{x:clamp(x,left+34,Math.max(left+34,right-34)),y:boundY(y)};
}
