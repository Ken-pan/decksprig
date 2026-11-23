import type { SlideElement, TextParagraph, TextRun } from './model';
import {scaledTextStyle} from './text-sizing';

// Fit the mobile field without replacing imported faces or losing the relative
// sizes of rich runs. This is a view only; edits still use the authored element.
export function mobileTextPresentation(e: SlideElement): SlideElement {
  return {...e, ...scaledTextStyle(e, Math.max(16, Math.min(24, e.fontSize)))};
}

type Style = Omit<TextRun, 'text'>;
type Character = {text: string; style: Style; paragraph: number; boundary?: boolean};

// Match unchanged characters, rather than rebuilding imported text as a plain run.
// Prefix/suffix handling makes ordinary cursor edits linear; bounded LCS also
// preserves styles when a content field changes several places at once.
function correspondence(before: string[], after: string[]): (number | undefined)[] {
  const map: (number | undefined)[] = Array(after.length);
  let prefix = 0, suffix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) { map[prefix] = prefix; prefix++; }
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) {
    map[after.length - 1 - suffix] = before.length - 1 - suffix; suffix++;
  }
  const n = before.length - prefix - suffix, m = after.length - prefix - suffix;
  if (n && m && n * m <= 1_000_000) {
    const rows = Array.from({length: n + 1}, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) rows[i][j] = before[prefix + i] === after[prefix + j] ? 1 + rows[i + 1][j + 1] : Math.max(rows[i + 1][j], rows[i][j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (before[prefix + i] === after[prefix + j]) { map[prefix + j] = prefix + i; i++; j++; }
      else if (rows[i + 1][j] >= rows[i][j + 1]) i++; else j++;
    }
  }
  return map;
}

function runs(characters: Character[]): TextRun[] {
  const result: TextRun[] = []; let previous = '';
  for (const character of characters) {
    const key = JSON.stringify(character.style);
    if (result.length && key === previous) result[result.length - 1].text += character.text;
    else result.push({...character.style, text: character.text});
    previous = key;
  }
  return result.length ? result : [{text: ''}];
}

export function editedTextStyle(element: SlideElement, value: string, options:{normalizeNewlines?:boolean}={}): Partial<SlideElement> {
  const text = options.normalizeNewlines===false?value:value.replace(/\r\n?/g, '\n');
  if (text === element.text) return {};
  if (!element.paragraphs?.length && !element.runs?.length) return {text};
  const paragraphs = element.paragraphs ?? [{runs: element.runs!, align: element.align, spaceBefore: 0, spaceAfter: 0, indent: 0, firstLineIndent: 0}];
  const original: Character[] = [];
  paragraphs.forEach((paragraph, index) => {
    for (const run of paragraph.runs) {
      const {text: content, ...style} = run;
      original.push(...Array.from(content).map(text => ({text, style, paragraph: index})));
    }
    if (index < paragraphs.length - 1) original.push({text: '\n', style: {}, paragraph: index, boundary: true});
  });
  // Some imported formats retain a separate plain-text representation. Align it
  // to the stored runs before matching the user's new content.
  if (original.map(c => c.text).join('') !== element.text) {
    const plain = Array.from(element.text), alignment = correspondence(original.map(c => c.text), plain);
    let previous = 0;
    const aligned = plain.map((text, index) => { previous = alignment[index] ?? previous; return {...(original[previous] ?? {style: {}, paragraph: 0}), text}; });
    original.splice(0, original.length, ...aligned);
  }
  const next = Array.from(text), match = correspondence(original.map(c => c.text), next);
  const followingMatches: (number | undefined)[] = Array(next.length);
  let followingMatch: number | undefined;
  for (let index = next.length - 1; index >= 0; index--) { followingMatches[index] = followingMatch; followingMatch = match[index] ?? followingMatch; }
  let previous: number | undefined;
  const edited = next.map((text, index): Character => {
    const same = match[index];
    if (same !== undefined) { previous = same; return {...original[same], text}; }
    const following = followingMatches[index];
    // Replacements inherit the deleted range's style; insertions inherit the
    // adjacent character. Never inherit a paragraph-separator's empty style.
    let inherit = previous === undefined ? 0 : previous + 1;
    if (following !== undefined && inherit >= following) inherit = previous ?? following;
    while (original[inherit]?.boundary && inherit + 1 < original.length) inherit++;
    const source = original[inherit] ?? original[previous ?? 0] ?? {style: {}, paragraph: 0};
    return {text, style: source.style, paragraph: source.paragraph, boundary: text === '\n' && Boolean(element.paragraphs)};
  });
  if (!element.paragraphs) return {text, runs: runs(edited)};
  const groups: Character[][] = [[]]; let inheritedParagraph = 0;
  const paragraphIndices: number[] = [0];
  for (const [index, character] of edited.entries()) {
    if (character.boundary && character.text === '\n') { inheritedParagraph = Math.min(paragraphs.length - 1, character.paragraph + (match[index] !== undefined ? 1 : 0)); groups.push([]); paragraphIndices.push(inheritedParagraph); }
    else { if (!groups.at(-1)!.length) paragraphIndices[groups.length - 1] = character.paragraph; groups.at(-1)!.push(character); }
  }
  const changed: TextParagraph[] = groups.map((characters, index) => ({...paragraphs[paragraphIndices[index] ?? inheritedParagraph], runs: runs(characters)}));
  return {text, paragraphs: changed};
}

/** Native editing uses the same character correspondence as the document model.
 * Apply these UTF-16 ranges from last to first to retain untouched native styles. */
export function textEditRanges(before:string,after:string){
 const old=Array.from(before),next=Array.from(after),match=correspondence(old,next),offsets=[0];for(const c of old)offsets.push(offsets.at(-1)!+c.length);
 const edits:Array<{start:number;end:number;text:string;useStyle:'BEFORE'|'AFTER'}>=[];let a=0,b=0;
 const add=(endA:number,endB:number)=>{if(a!==endA||b!==endB)edits.push({start:offsets[a],end:offsets[endA],text:next.slice(b,endB).join(''),useStyle:endA>a?'AFTER':'BEFORE'});};
 for(let i=0;i<next.length;i++){const same=match[i];if(same===undefined)continue;add(same,i);a=same+1;b=i+1;}add(old.length,next.length);return edits;
}
