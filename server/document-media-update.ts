import {z} from '../src/core/schema';
import {DOCUMENT_FILE_SCHEMA, readDocumentFile} from '../src/core/document-file';
import {MEDIA_UPDATE_SCHEMA} from '../src/core/document-media-update';
import type {Deck} from '../src/core/model';

const location = z.strictObject({
  slide: z.number().check(z.int()).check(z.minimum(0)).check(z.maximum(499)),
  element: z.number().check(z.int()).check(z.minimum(-1)).check(z.maximum(2999)),
  field: z.enum(['render', 'src', 'poster']),
});
export const mediaUpdateSchema = z.strictObject({
  schema: z.literal(MEDIA_UPDATE_SCHEMA),
  id: z.string().check(z.maxLength(120)),
  token: z.string().check(z.regex(/^[a-zA-Z0-9_-]{43}$/)),
  deck: z.unknown(),
  assets: z.array(z.union([z.string().check(z.maxLength(35_000_000)), location])).check(z.minLength(1)).check(z.maxLength(4000)),
  references: z.unknown(),
});
export type MediaUpdate = z.infer<typeof mediaUpdateSchema>;

/** The caller has pinned the source to a validated saved revision under the write lock. */
export function resolveMediaUpdate(update: MediaUpdate, base: Deck): Deck {
  const {id, deck, references} = update;
  const assets = update.assets.map(asset => {
    if (typeof asset === 'string') return asset;
    const slide = base.slides[asset.slide];
    const element = slide?.elements[asset.element];
    const value = asset.field === 'render' && asset.element === -1 ? slide?.source?.render
      : asset.field === 'src' ? element?.src : element?.prototype?.poster;
    if (!value) throw new Error('This Deck save has an invalid reference to an image in its saved version.');
    return value;
  });
  return readDocumentFile({schema: DOCUMENT_FILE_SCHEMA, id, deck, assets, references});
}
