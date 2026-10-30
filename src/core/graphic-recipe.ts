import {z} from './schema';
export const GraphicRecipeSchema=z.strictObject({
  strength:z.pipe(z._default(z.number().check(z.minimum(.25)).check(z.maximum(2)), 1), z.transform(value=>Math.round(value*1000)/1000)),
  scale:z.pipe(z._default(z.number().check(z.minimum(.5)).check(z.maximum(3)), 1), z.transform(value=>Math.round(value*1000)/1000)),
  rotation:z.pipe(z._default(z.number().check(z.minimum(0)).check(z.maximum(180)), 0), z.transform(value=>Math.round(value*1000)/1000)),
});
export type GraphicRecipe=z.infer<typeof GraphicRecipeSchema>;
