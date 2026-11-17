/** Retain original font shards whose declared Unicode ranges contain rendered glyphs. */
export function fontCssForText(css:string,text:string):string{
  const points=[...new Set([...text].map(char=>char.codePointAt(0)!))].sort((a,b)=>a-b);
  function intersects(first:number,last:number){let lo=0,hi=points.length;while(lo<hi){const mid=(lo+hi)>>>1;if(points[mid]<first)lo=mid+1;else hi=mid;}return lo<points.length&&points[lo]<=last;}
  return css.replace(/@font-face\s*\{[^}]*\}/gi,rule=>{
    if(!points.length)return '';
    const ranges=rule.match(/unicode-range\s*:\s*([^;}]+)/i)?.[1];if(!ranges)return rule;
    const keep=ranges.split(',').some(range=>{const match=range.trim().match(/^U\+([\da-f?]{1,6})(?:-([\da-f]{1,6}))?$/i);if(!match)return true;const first=parseInt(match[1].replace(/\?/g,'0'),16),last=parseInt(match[2]??match[1].replace(/\?/g,'F'),16);return intersects(first,last);});
    return keep?rule:'';
  });
}
