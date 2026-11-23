/** Automatic label ink for a raw shape fill. Actual backings are resolved by slide color adaptation. */
export function automaticShapeTextColor(fill:string):string {
  const raw = fill.replace('#', '');
  const hex = raw.length === 3 || raw.length === 4 ? raw.slice(0, 3).split('').map(v => v + v).join('') : raw.slice(0, 6);
  const rgb = /^[a-f0-9]{6}$/i.test(hex) ? [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) : [1, 1, 1];
  const linear = rgb.map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  const luminance = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  return luminance > .179 ? '#171c19' : '#ffffff';
}
