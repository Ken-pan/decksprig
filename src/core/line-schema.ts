import {z} from './schema';
export const LineStyleSchema = z.strictObject({
  route: z._default(z.enum(['straight','elbow','rounded','curve','arc','step','zigzag','wave']), 'straight'),
  dash: z._default(z.enum(['solid','dashed','dotted','short-dash','long-dash','dash-dot','dash-dot-dot']), 'solid'),
  start: z._default(z.enum(['none','arrow','open-arrow','stealth','circle','circle-outline','square','diamond','bar']), 'none'),
  end: z._default(z.enum(['none','arrow','open-arrow','stealth','circle','circle-outline','square','diamond','bar']), 'none'),
  cap: z._default(z.enum(['butt','round','square']), 'round'),
  markerSize: z._default(z.number().check(z.minimum(1)).check(z.maximum(6)), 1),
  bend: z._default(z.number().check(z.minimum(.1)).check(z.maximum(.9)), .5),
});
export type LineStyle = z.infer<typeof LineStyleSchema>;
export const DEFAULT_LINE: LineStyle = LineStyleSchema.parse({});
