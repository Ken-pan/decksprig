import {z} from './schema';

export const BLOCK_IDS = ['architecture','process','organization','agenda','timeline','roadmap','gantt','kanban','comparison','swot','metrics','funnel'] as const;
export type BlockId = typeof BLOCK_IDS[number];
export const BlockOptionsSchema=z.strictObject({
  title:z.string().check(z.maxLength(160)),
  items:z.array(z.strictObject({label:z.string().check(z.trim()).check(z.minLength(1)).check(z.maxLength(200)),detail:z.string().check(z.maxLength(2000)),meta:z.string().check(z.maxLength(100)),parent:z.optional(z.number().check(z.int()).check(z.minimum(-1)).check(z.maximum(11)))})).check(z.minLength(1)).check(z.maxLength(12)),
  layout:z._default(z.enum(['auto','horizontal','vertical','grid']), 'auto'),
  tone:z._default(z.enum(['plain','surface','outline','accent']), 'surface'),
  density:z._default(z.enum(['comfortable','compact']), 'comfortable'),
  showTitle:z._default(z.boolean(), true),
  showDetails:z._default(z.boolean(), true),
  showMeta:z._default(z.boolean(), true),
  numbered:z._default(z.boolean(), true),
  stagger:z._default(z.boolean(), false),
  periods:z._default(z.number().check(z.int()).check(z.minimum(2)).check(z.maximum(12)), 6),
  periodLabels:z._default(z.array(z.string().check(z.maxLength(30))).check(z.maxLength(12)), []),
});
export type BlockOptions=z.infer<typeof BlockOptionsSchema>;
export type BlockInput=z.input<typeof BlockOptionsSchema>;
export const BlockRecipeSchema=z.strictObject({kind:z.enum(BLOCK_IDS),options:BlockOptionsSchema,fingerprint:z.string().check(z.maxLength(64)),sizing:z.optional(z.enum(['scaled','presentation']))});

/** Keep validation useful in the editor instead of exposing serialized schema errors. */
export function blockErrorMessage(error:unknown):string {
  if(!(error instanceof z.core.$ZodError))return error instanceof Error?error.message:'Check the block content.';
  const issue=error.issues[0],path=issue?.path??[];
  if(path[0]==='items'&&typeof path[1]==='number'){
    const field=path[2],name=field==='label'?'label':field==='detail'?'description':'date or value';
    if(issue.code==='too_small')return `Enter a ${name} for item ${path[1]+1}.`;
    if(issue.code==='too_big')return `Keep the ${name} for item ${path[1]+1} within ${issue.maximum} characters.`;
  }
  if(path[0]==='periodLabels')return typeof path[1]==='number'?`Keep period label ${path[1]+1} within 30 characters.`:'Use up to 12 period labels.';
  if(path[0]==='periods')return 'Enter a whole number of periods from 2 to 12.';
  if(path[0]==='title')return 'Keep the block title within 160 characters.';
  return 'Check the block content and item limits.';
}
