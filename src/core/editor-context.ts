import {z} from './schema';
export const EditorContextSchema=z.strictObject({clientId:z.string().check(z.guid()),deckId:z.nullable(z.string().check(z.minLength(1)).check(z.maxLength(120))),revision:z.number().check(z.int()).check(z.minimum(0)),activeSlideId:z.optional(z.string().check(z.maxLength(120))),selectedIds:z.array(z.string().check(z.maxLength(120))).check(z.maxLength(3000)),focused:z.boolean(),visible:z.boolean(),dirty:z.boolean(),sourceMode:z.boolean(),presenting:z.boolean(),pendingProposal:z.boolean()});
export type EditorContext=z.infer<typeof EditorContextSchema>;
