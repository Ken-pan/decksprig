import {z} from './schema';
export const StoryCollectionSchema=z.enum(['portfolio','review','proposal','pitch','report','minimal']);
export const CreationBriefSchema=z.strictObject({brief:z.string().check(z.trim()).check(z.minLength(1)).check(z.maxLength(10000)),audience:z._default(z.string().check(z.maxLength(300)), ''),goal:z.optional(z.string().check(z.maxLength(500))),delivery:z.optional(z.enum(['presentation','reading'])),slideCount:z.number().check(z.int()).check(z.minimum(2)).check(z.maximum(12)),collection:StoryCollectionSchema,templateMode:z.optional(z.enum(['auto','fixed'])),materials:z._default(z.string().check(z.maxLength(20000)), '')});
export type CreationBrief=z.infer<typeof CreationBriefSchema>;
