import {z} from './schema';
import { DeckSchema, SlideSchema, ElementSchema, validateDeck, assertDeckInvariants, type Deck, type Slide } from './model';
import { shareDocumentRevision } from './document-data';

// Only data validated and recursively frozen here is eligible for reuse. An
// externally frozen root is not proof that its children or schema are valid.
const frozenData = new WeakSet<object>();
const revisions = new WeakSet<Deck>();
/** Internal cache eligibility: external Object.freeze() is not validation. */
export function isOwnedDocumentData(value: object): boolean { return frozenData.has(value); }
const slideList = z.array(z.unknown()).check(z.minLength(1)).check(z.maxLength(500));
const elementList = z.array(z.unknown()).check(z.maxLength(3000));

// Only fields identical to an owned, deeply frozen revision may skip parsing.
// Changed fields still receive their canonical defaults, limits and strict keys.
function changedFields<T extends object>(schema: z.ZodMiniObject, previous: T, next: T, list?: string): T {
  const result = {...next} as Record<string, unknown>;
  const fields = schema.shape as z.core.$ZodShape;
  const before = previous as Record<string, unknown>, after = next as Record<string, unknown>;
  for (const key of Object.keys(next)) {
    if (!Object.hasOwn(fields, key)) throw new Error(`Unrecognized document field: ${key}`);
  }
  for (const key of Object.keys(fields)) {
    if (key === list || after[key] === before[key]) continue;
    const value = z.parse(fields[key],after[key]);
    if (value !== undefined || Object.hasOwn(next, key)) result[key] = value;
  }
  return result as T;
}

function validateSlideRevision(before: Slide | undefined, next: Slide): Slide {
  if (!before) return SlideSchema.parse(next);
  const result = changedFields(SlideSchema, before, next, 'elements');
  if (next.elements !== before.elements) {
    elementList.parse(next.elements);
    const byId = new Map(before.elements.map(element=>[element.id,element]));
    result.elements = next.elements.map(element => {
      const previous=byId.get(element?.id);
      if(previous&&previous===element)return element;
      // ElementSchema owns individual fields; assertDeckInvariants below still
      // checks relationships and content. Only owned identical branches can skip parsing.
      return previous&&element&&typeof element==='object'&&!Array.isArray(element)?changedFields(ElementSchema,previous,element):ElementSchema.parse(element);
    });
  }
  return shareDocumentRevision(before, result);
}

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

/** Decode and own one canonical revision without validating it again on open. */
export async function adoptDocumentFileRevision(raw: unknown): Promise<Deck> {
  return ownRevision((await import('./document-file')).readDocumentFile(raw));
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
    const result = changedFields(DeckSchema, base, next, 'slides');
    slideList.parse(next.slides);
    result.slides = next.slides.map(slide => {
      if (slides.has(slide)) return slide;
      return validateSlideRevision(byId.get(slide?.id), slide);
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
