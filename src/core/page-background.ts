/** Page paint sits on white paper; retain the authored alpha in document data.
 * This factory is also serialized into standalone HTML, so it has no closure. */
export function pageBackground(value:string):string {
  return value==='transparent'||value.length===5||value.length===9 ? `linear-gradient(${value},${value}),#fff` : value;
}
