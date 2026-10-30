import {z} from './schema';
const key=z.string().check(z.regex(/^[a-z][a-z0-9-]{0,99}$/));
const hex=z.pipe(z.string().check(z.regex(/^#[\da-f]{6}$/i)), z.transform(value=>value.toLowerCase()));
export const CharacterRecipeSchema = z.pipe(z.strictObject({
  characterId: key, sceneId: key, variantId: key,
  // Recipes already stored in documents keep their original rendering behavior.
  renderVersion: z._default(z.enum(['1', '2', '3']), '1'),
  skinMode: z._default(z.enum(['classic', 'natural']), 'classic'), skinColor: z._default(hex, '#e8bb98'),
  clothesColor: z._default(hex, '#2f5bff'), hairColor: z._default(hex, '#161616'), accentColor: z._default(hex, '#2f5bff'),
}), z.transform(recipe=>recipe.renderVersion==='3'?{...recipe,hairColor:'#161616',accentColor:recipe.clothesColor}:recipe));
export type CharacterRecipe = z.infer<typeof CharacterRecipeSchema>;
