import {z} from './schema';
import { DeckSchema, SlideSchema, validateDeck, assertDeckInvariants, type Deck } from './model';
import { shareDocumentRevision } from './document-data';

// Only data validated and recursively frozen here is eligible for reuse. An
// externally frozen root is not proof that its children or schema are valid.
const frozenData = new WeakSet<object>();
const revisions = new WeakSet<Deck>();
const slideList = z.array(z.unknown()).check(z.minLength(1)).check(z.maxLength(500));

function freezeData(value: unknown): void {
  if (!value || typeof value !== 'object' || frozenData.has(value)) return;
  for (const child of Object.values(value)) freezeData(child);
  Object.freeze(value); frozenData.add(value);
}
function ownRevision(deck: Deck): Deck {
  freezeData(deck); revisions.add(deck); return deck;
}

/** Import/recovery boundary: validate and detach mutable caller-owned data once. */
export function adoptDeckRevision(value: Deck): Deck {
  return revisions.has(value) ? value : ownRevision(validateDeck(value));
}

/** Transfer the editor's own JSON data into read-only ownership without remounting equal pages. */
export function takeDeckRevision(value: Deck): Deck {
  return revisions.has(value) ? value : ownRevision(shareDocumentRevision(value, validateDeck(value)));
}

/** One validation context per transaction; no cache of mutable slide geometry. */
export function createRevisionValidator(previous: Deck) {
  const base = adoptDeckRevision(previous);
  const slides = new Set(base.slides);
  const byId = new Map(base.slides.map(slide => [slide.id, slide]));
  const trustedSlides = (next: Deck) => next.width === base.width && next.height === base.height ? slides : undefined;
  const assert = (next: Deck) => assertDeckInvariants(next, trustedSlides(next));
  function validate(next: Deck): Deck {
    if (next === base) return base;
    const result = {...next} as Deck;
    const fields = DeckSchema.shape;
    for (const key of Object.keys(next)) {
      if (!Object.hasOwn(fields, key)) throw new Error(`Unrecognized document field: ${key}`);
    }
    // Equal values belong to the owned frozen base. Parse every changed field,
    // including removals, and preserve canonical optional/default semantics.
    for (const key of Object.keys(fields) as Array<keyof typeof fields>) {
      if (key === 'slides' || next[key] === base[key]) continue;
      const value = fields[key].parse(next[key]);
      if (value !== undefined || Object.hasOwn(next, key)) (result as any)[key] = value;
    }
    slideList.parse(next.slides);
    result.slides = next.slides.map(slide => {
      if (slides.has(slide)) return slide;
      const parsed = SlideSchema.parse(slide), before = byId.get(parsed.id);
      return before ? shareDocumentRevision(before, parsed) : parsed;
    });
    assert(result);
    return ownRevision(result);
  }
  return {base, assert, validate};
}

/** Measurements/history replace immutable containers through the same boundary. */
export function validateDeckRevision(previous: Deck, next: Deck): Deck {
  if (revisions.has(next)) return next;
  return createRevisionValidator(previous).validate(next);
}
