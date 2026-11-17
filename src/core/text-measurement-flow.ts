import type {SlideElement,TextRun} from './model';
import type {createTypography} from './typography';
type Typography=ReturnType<typeof createTypography>;
/** One measurement host is patched in place; removed nodes are never retained. */
export function createTextMeasurementFlow(){
  const styles=new WeakMap<HTMLElement,string>();
  function style(node:HTMLElement,value:string){if(styles.get(node)!==value){node.style.cssText=value;styles.set(node,value);}}
  function child(parent:HTMLElement,index:number,tag:'div'|'span'){
    const previous=parent.childNodes[index];
    if(previous instanceof HTMLElement&&previous.localName===tag)return previous;
    const node=document.createElement(tag);if(previous)parent.replaceChild(node,previous);else parent.append(node);return node;
  }
  function trim(parent:HTMLElement,length:number){while(parent.childNodes.length>length)parent.lastChild!.remove();}
  function runs(parent:HTMLElement,values:TextRun[],e:SlideElement,typography:Typography,bullet?:string){
    let index=0;
    if(bullet){const node=child(parent,index++,'span'),value=bullet+' ';if(node.textContent!==value)node.textContent=value;style(node,'');}
    for(const run of values){const node=child(parent,index++,'span');if(node.textContent!==run.text)node.textContent=run.text;style(node,typography.runStyle(run,e));}
    trim(parent,index);
  }
  return (host:HTMLDivElement,e:SlideElement,typography:Typography,boxStyle:string,flowStyle:string)=>{
    style(host,boxStyle);const flow=child(host,0,'div');trim(host,1);
    style(flow,flowStyle);
    if(e.paragraphs?.length){
      let index=0;for(const paragraph of e.paragraphs){const node=child(flow,index++,'div');if(node.className!=='text-paragraph')node.className='text-paragraph';style(node,typography.paragraphStyle(paragraph,e));runs(node,paragraph.runs,e,typography,paragraph.bullet);}trim(flow,index);
    }else if(e.runs?.length)runs(flow,e.runs,e,typography);
    else{const value=e.text||'\u200b';if(flow.firstElementChild||flow.textContent!==value)flow.textContent=value;}
    return flow as HTMLDivElement;
  };
}
