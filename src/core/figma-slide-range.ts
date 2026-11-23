/** One-based UI ranges, kept in native presentation order. */
export function figmaSlideRange(value:string,total:number):number[]|undefined {
  if(!value.trim())return undefined;
  const indices=new Set<number>();for(const token of value.split(',')){
    const match=/^\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*$/.exec(token);if(!match)throw new Error('Use slide numbers such as 1–14, 20.');
    const from=Number(match[1]),to=Number(match[2]??match[1]);if(from<1||to<from||to>total)throw new Error(`Choose slide numbers from 1 to ${total}.`);
    for(let index=from;index<=to;index++){indices.add(index-1);if(indices.size>100)throw new Error('Connect or export up to 100 slides at a time.');}
  }return [...indices].sort((a,b)=>a-b);
}
