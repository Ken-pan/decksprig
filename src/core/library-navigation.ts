/** Row-major navigation keeps the final partial row reachable in either view. */
export function libraryNavigationIndex(key:string,index:number,count:number,columns:number,pageRows:number){
  if(!count)return undefined;
  const step=Math.max(1,columns),page=step*Math.max(1,pageRows);
  const offset=key==='ArrowLeft'?-1:key==='ArrowRight'?1:key==='ArrowUp'?-step:key==='ArrowDown'?step:key==='PageUp'?-page:key==='PageDown'?page:undefined;
  if(key==='Home')return 0;if(key==='End')return count-1;
  return offset===undefined?undefined:Math.max(0,Math.min(count-1,index+offset));
}
