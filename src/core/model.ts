import {LineStyleSchema} from './line-schema';
import {ShapeVariantSchema, ElementShadowSchema} from './shape-schema';
import {z} from './schema';
import { TRANSITION_IDS } from './transition-ids';
import { CharacterRecipeSchema } from './character-recipe-schema';
import {GraphicRecipeSchema} from './graphic-recipe';
import {TableStyleSchema,validateTableStyle} from './table-schema';
import {BlockRecipeSchema} from './deck-block-schema';
import { ChartSchema, validateChart } from './chart-schema';
import { COLOR_ROLES, DesignSystemSchema, StyleBindingSchema, DEFAULT_DESIGN_SYSTEM } from './design-system-schema';

const id = z.string().check(z.minLength(1)).check(z.maxLength(120)).check(z.regex(/^[a-zA-Z0-9_.:-]+$/));
const color = z.string().check(z.regex(/^(#[\da-fA-F]{3,8}|transparent)$/));
const image = z.string().check(z.maxLength(35_000_000)).check(z.refine(v => /^(data:image\/(png|jpeg|webp|gif|svg\+xml);|https?:\/\/|\/examples\/)/.test(v), 'Unsupported image URL'));
const webUrl = z.string().check(z.url()).check(z.maxLength(3000)).check(z.refine(v => /^https?:\/\//.test(v), 'Expected a public source link'));
export const ResourceAttributionSchema = z.strictObject({
  id: z.string().check(z.maxLength(200)), kind: z.enum(['photo', 'icon', 'illustration']),
  provider: z.string().check(z.maxLength(100)), title: z.string().check(z.maxLength(1000)), creator: z.string().check(z.maxLength(500)),
  sourceUrl: webUrl, creatorUrl: z.optional(webUrl), license: z.string().check(z.maxLength(100)), licenseUrl: webUrl,
  attribution: z.string().check(z.maxLength(6000)), attributionRequired: z.boolean(),
  licenseNotice: z.optional(z.string().check(z.maxLength(30000))), color: z.optional(z.string().check(z.regex(/^#[\da-fA-F]{6}$/))),
  originalSha256: z.optional(z.string().check(z.regex(/^[\da-f]{64}$/))),
  characterRecipe: z.optional(CharacterRecipeSchema),
  graphicRecipe: z.optional(GraphicRecipeSchema),
});
export type ResourceAttribution = z.infer<typeof ResourceAttributionSchema>;
export const TransitionSchema = z.strictObject({
  effect: z._default(z.enum(TRANSITION_IDS), 'fade'),
  duration: z._default(z.number().check(z.minimum(100)).check(z.maximum(2000)), 480),
  easing: z._default(z.enum(['smooth', 'snappy', 'linear', 'cinematic']), 'smooth'),
});
export const AnimationSchema = z.strictObject({
  withTransition: z.optional(z.boolean()),
  effect: z._default(z.enum(['none', 'fade', 'rise', 'slide', 'zoom', 'reveal']), 'none'),
  duration: z._default(z.number().check(z.minimum(100)).check(z.maximum(2000)), 500),
  delay: z._default(z.number().check(z.minimum(0)).check(z.maximum(5000)), 0),
  trigger: z._default(z.enum(['auto', 'click']), 'auto'),
  order: z._default(z.number().check(z.int()).check(z.minimum(0)).check(z.maximum(3000)), 0),
  easing: z._default(z.enum(['smooth', 'snappy', 'linear']), 'smooth'),
});
export const PrototypeSchema = z.strictObject({
  url: webUrl.check(z.refine(v => { const u = new URL(v); return !u.username && !u.password && ![...u.searchParams.keys()].some(k => /^(token|access_token|api[-_]?key|secret|password|client-id)$/i.test(k)) && !/(?:[?&#])(?:token|access_token|api[-_]?key|secret|password|client-id)=/i.test(v) && (!['figma.com', 'www.figma.com', 'embed.figma.com'].includes(u.hostname) || /^\/proto\/[\w-]+(?:\/|$)/.test(u.pathname)); }, 'Use a prototype share link without credentials')),
  scaling: z._default(z.enum(['contain', 'scale-down', 'fit-width']), 'contain'),
  responsive: z._default(z.boolean(), false), chrome: z._default(z.boolean(), false),
  deviceFrame: z._default(z.boolean(), false), poster: z.optional(image),
});
export type SlideTransition = z.infer<typeof TransitionSchema>;
export type ElementAnimation = z.infer<typeof AnimationSchema>;
export type Prototype = z.infer<typeof PrototypeSchema>;
export const TextRunSchema = z.strictObject({
  text: z.string().check(z.maxLength(50000)), bold: z.optional(z.boolean()), italic: z.optional(z.boolean()),
  underline: z.optional(z.boolean()), color: z.optional(color),
  fontSize: z.optional(z.number().check(z.minimum(1)).check(z.maximum(1000))), fontFamily: z.optional(z.string().check(z.maxLength(100))),
  fontWeight: z.optional(z.number().check(z.minimum(100)).check(z.maximum(900))), letterSpacing: z.optional(z.number().check(z.minimum(-50)).check(z.maximum(100))),
  baseline: z.optional(z.enum(['normal', 'super', 'sub'])),
});
export const ParagraphSchema = z.strictObject({
  runs: z.array(TextRunSchema).check(z.maxLength(5000)), align: z._default(z.enum(['left', 'center', 'right', 'justify']), 'left'),
  endStyle: z.optional(TextRunSchema),
  lineHeight: z.optional(z.number().check(z.minimum(.5)).check(z.maximum(4))), lineSpacing: z.optional(z.number().check(z.minimum(1)).check(z.maximum(2000))),
  spaceBefore: z._default(z.number().check(z.minimum(0)).check(z.maximum(2000)), 0), spaceAfter: z._default(z.number().check(z.minimum(0)).check(z.maximum(2000)), 0),
  indent: z._default(z.number().check(z.minimum(-2000)).check(z.maximum(2000)), 0), firstLineIndent: z._default(z.number().check(z.minimum(-2000)).check(z.maximum(2000)), 0),
  bullet: z.optional(z.string().check(z.maxLength(12))),
});
export type TextRun = z.infer<typeof TextRunSchema>;
export type TextParagraph = z.infer<typeof ParagraphSchema>;
export const LayoutItemSchema = z.strictObject({
  basisFontSize: z.optional(z.number().check(z.minimum(4)).check(z.maximum(500))),
  widthMode: z._default(z.enum(['fixed','fill']), 'fixed'), heightMode: z._default(z.enum(['fixed','fill']), 'fixed'),
  basisW: z.optional(z.number().check(z.minimum(1)).check(z.maximum(20000))), basisH: z.optional(z.number().check(z.minimum(1)).check(z.maximum(20000))),
  minWidth: z.optional(z.number().check(z.minimum(1)).check(z.maximum(20000))), maxWidth: z.optional(z.number().check(z.minimum(1)).check(z.maximum(20000))),
  minHeight: z.optional(z.number().check(z.minimum(1)).check(z.maximum(20000))), maxHeight: z.optional(z.number().check(z.minimum(1)).check(z.maximum(20000))),
});
export type LayoutItem = z.infer<typeof LayoutItemSchema>;
export const ElementSchema = z.strictObject({
  id, type: z.enum(['text', 'rect', 'ellipse', 'diamond', 'line', 'image', 'table', 'chart', 'prototype']),
  name: z._default(z.string().check(z.maxLength(200)), 'Element'),
  x: z.number().check(z.minimum(-20000)).check(z.maximum(20000)), y: z.number().check(z.minimum(-20000)).check(z.maximum(20000)),
  w: z.number().check(z.minimum(1)).check(z.maximum(20000)), h: z.number().check(z.minimum(1)).check(z.maximum(20000)),
  rotation: z._default(z.number(), 0), opacity: z._default(z.number().check(z.minimum(0)).check(z.maximum(1)), 1),
  flipX: z._default(z.boolean(), false), flipY: z._default(z.boolean(), false),
  aspectRatioLocked: z.optional(z.boolean()),
  locked: z._default(z.boolean(), false), hidden: z._default(z.boolean(), false), group: z.optional(id),
  layoutItem: z.optional(LayoutItemSchema),
  blockItem:z.optional(z.number().check(z.int()).check(z.minimum(0)).check(z.maximum(11))),
  text: z._default(z.string().check(z.maxLength(50000)), ''),
  fontFamily: z._default(z.string().check(z.maxLength(100)), 'Manrope'), fontSize: z._default(z.number().check(z.minimum(4)).check(z.maximum(500)), 32),
  fontWeight: z._default(z.number().check(z.minimum(100)).check(z.maximum(900)), 400), italic: z._default(z.boolean(), false),
  underline: z._default(z.boolean(), false), align: z._default(z.enum(['left', 'center', 'right']), 'left'),
  lineHeight: z._default(z.number().check(z.minimum(0.5)).check(z.maximum(4)), 1.25), letterSpacing: z._default(z.number().check(z.minimum(-30)).check(z.maximum(50)), 0),
  fill: z._default(color, '#252b29'), stroke: z._default(color, 'transparent'), strokeWidth: z._default(z.number().check(z.minimum(0)).check(z.maximum(100)), 0),
  radius: z._default(z.number().check(z.minimum(0)).check(z.maximum(500)), 0),
  line: z.optional(LineStyleSchema),
  // Reversible materialized color adjustments; authored colors survive background changes.
  contrastColors: z.optional(z.record(z.string().check(z.regex(/^(fill|stroke|shapeText\.color|(?:runs\.\d+|paragraphs\.\d+\.(?:runs\.\d+|endStyle))\.color|chart\.(?:textColor|colors\.\d+|dataLabels\.color)|tableStyle\.(?:headerFill|headerText|bodyFill|stripeFill|lineColor|cellStyles\.\d+\.(?:fill|color)))$/)), z.strictObject({original:z.optional(color),adapted:color}))),
  shapeText: z.optional(z.strictObject({color: z.optional(color), align: z.optional(z.enum(['left', 'center', 'right'])), verticalAlign: z.optional(z.enum(['top', 'middle', 'bottom']))})),
  shape: z.optional(ShapeVariantSchema), shadow: z.optional(ElementShadowSchema),
  src: z.optional(image), fit: z._default(z.enum(['contain', 'cover', 'crop', 'fill']), 'contain'),
  imagePosition: z.optional(z.strictObject({x:z.number().check(z.minimum(0)).check(z.maximum(1)),y:z.number().check(z.minimum(0)).check(z.maximum(1))})),
  imageZoom: z.optional(z.number().check(z.minimum(.000001)).check(z.maximum(20))),
  imageSize: z.optional(z.strictObject({w:z.number().check(z.gt(0)).check(z.maximum(1000000)),h:z.number().check(z.gt(0)).check(z.maximum(1000000))})),
  // Signed crop edges retain blank space when the image is moved outside its frame.
  crop: z.optional(z.strictObject({left: z.number().check(z.minimum(-20000)).check(z.maximum(20000)), top: z.number().check(z.minimum(-20000)).check(z.maximum(20000)), right: z.number().check(z.minimum(-20000)).check(z.maximum(20000)), bottom: z.number().check(z.minimum(-20000)).check(z.maximum(20000))}).check(z.refine(c => c.left + c.right < 1 && c.top + c.bottom < 1, 'Invalid crop'))),
  padding: z.optional(z.strictObject({left: z.number().check(z.minimum(0)).check(z.maximum(2000)), right: z.number().check(z.minimum(0)).check(z.maximum(2000)), top: z.number().check(z.minimum(0)).check(z.maximum(2000)), bottom: z.number().check(z.minimum(0)).check(z.maximum(2000))})),
  clipText: z.optional(z.boolean()),
  textFit: z.optional(z.enum(['none','normal','shape'])),
  paragraphSpacingAtEdges: z.optional(z.boolean()),
  maxLines: z.optional(z.number().check(z.int()).check(z.minimum(1)).check(z.maximum(1000))),
  nativeTextLayout: z.optional(z.strictObject({fingerprint:z.string().check(z.maxLength(200000)),metricsFingerprint:z.optional(z.string().check(z.maxLength(200000))),runs:z.array(TextRunSchema).check(z.maxLength(5000)),lineSpacing:z.optional(z.number().check(z.minimum(1)).check(z.maximum(2000))),intrinsicLineHeight:z.optional(z.number().check(z.minimum(.5)).check(z.maximum(4))),wrapSlack:z.optional(z.number().check(z.minimum(0)).check(z.maximum(100)))})),
  // Native page crop for effects or masks the source API does not expose.
  // The original image/crop stays in src/crop for provenance and readback.
  sourceRegion: z.optional(z.strictObject({left:z.number().check(z.minimum(0)).check(z.maximum(.9999)),top:z.number().check(z.minimum(0)).check(z.maximum(.9999)),right:z.number().check(z.minimum(0)).check(z.maximum(.9999)),bottom:z.number().check(z.minimum(0)).check(z.maximum(.9999))}).check(z.refine(c=>c.left+c.right<1&&c.top+c.bottom<1))),
  verticalAlign: z._default(z.enum(['top', 'middle', 'bottom']), 'top'), wrap: z._default(z.boolean(), true),
  textSizing: z._default(z.enum(['fixed', 'auto-width', 'auto-height']), 'fixed'),
  runs: z.optional(z.array(TextRunSchema).check(z.maxLength(5000))), paragraphs: z.optional(z.array(ParagraphSchema).check(z.maxLength(5000))),
  cells: z.optional(z.array(z.array(z.string().check(z.maxLength(5000))).check(z.maxLength(20))).check(z.maxLength(100))),
  tableStyle: z.optional(TableStyleSchema),
  tableFit: z.optional(z.strictObject({minimumFontSize:z.number().check(z.minimum(4)).check(z.maximum(500)),padding:z.number().check(z.minimum(0)).check(z.maximum(100))})),
  values: z.optional(z.array(z.object({label: z.string().check(z.maxLength(100)), value: z.number()})).check(z.maxLength(100))),
  chart: z.optional(ChartSchema),
  sourceId: z.optional(z.string()),
  resource: z.optional(ResourceAttributionSchema),
  animation: z.optional(AnimationSchema), prototype: z.optional(PrototypeSchema),
  motionKey: z.optional(z.nullable(z.string().check(z.trim()).check(z.maxLength(80)))),
  motionMatch: z.optional(z.enum(['auto','off'])),
  design: z.optional(StyleBindingSchema),
  designPattern: z.optional(z.boolean()),
  pageElement: z.optional(z.strictObject({kind: z.enum(['header','footer','page-number','date','logo','divider']), value: z.optional(z.string().check(z.maxLength(500))), coverHidden: z.optional(z.boolean())})),
});
export type SlideElement = z.infer<typeof ElementSchema>;

export const PageElementsSchema = z.strictObject({
  header: z.string().check(z.maxLength(300)), footer: z.string().check(z.maxLength(300)), date: z.string().check(z.maxLength(100)),
  pageNumbers: z.boolean(), numberFormat: z.enum(['number','padded','total']),
  startAt: z.number().check(z.int()).check(z.minimum(0)).check(z.maximum(10000)), hideOnCover: z.boolean(), divider: z.boolean(),
  hideOnBreaks: z.optional(z.boolean()),
  logo: z.optional(ElementSchema.check(z.refine(e => e.type === 'image' && Boolean(e.src) && !e.sourceRegion, 'Choose a logo image.'))),
});
export type PageElements = z.infer<typeof PageElementsSchema>;

export const PageLayoutSchema = z.strictObject({
  margins: z.strictObject({top: z.number().check(z.minimum(0)).check(z.maximum(10000)), right: z.number().check(z.minimum(0)).check(z.maximum(10000)), bottom: z.number().check(z.minimum(0)).check(z.maximum(10000)), left: z.number().check(z.minimum(0)).check(z.maximum(10000))}),
  columns: z.number().check(z.int()).check(z.minimum(1)).check(z.maximum(12)), gutter: z.number().check(z.minimum(0)).check(z.maximum(10000)),
});
export type PageLayout = z.infer<typeof PageLayoutSchema>;
export const GroupLayoutSchema = z.strictObject({
  id, name: z.string().check(z.minLength(1)).check(z.maxLength(200)),
  direction: z.enum(['horizontal', 'vertical', 'grid']),
  gap: z.number().check(z.minimum(0)).check(z.maximum(2000)),
  padding: z.strictObject({top: z.number().check(z.minimum(0)).check(z.maximum(2000)), right: z.number().check(z.minimum(0)).check(z.maximum(2000)), bottom: z.number().check(z.minimum(0)).check(z.maximum(2000)), left: z.number().check(z.minimum(0)).check(z.maximum(2000))}),
  align: z.enum(['start', 'center', 'end']), justify: z.enum(['start', 'center', 'end', 'space-between']),
  columns: z.number().check(z.int()).check(z.minimum(1)).check(z.maximum(12)),
  x: z.number().check(z.minimum(-20000)).check(z.maximum(20000)), y: z.number().check(z.minimum(-20000)).check(z.maximum(20000)),
  w: z.number().check(z.minimum(1)).check(z.maximum(20000)), h: z.number().check(z.minimum(1)).check(z.maximum(20000)),
  widthMode: z.enum(['hug', 'fixed']), heightMode: z.enum(['hug', 'fixed']),
  wrap: z.optional(z.boolean()), lineGap: z.optional(z.number().check(z.minimum(0)).check(z.maximum(2000))),
  gridSizing: z.optional(z.enum(['content','equal'])),
  adaptiveColumns: z.optional(z.boolean()),
  textFitHeight: z.optional(z.number().check(z.minimum(1)).check(z.maximum(20000))),
  order: z.array(id).check(z.minLength(1)).check(z.maxLength(3000)),
});
export type GroupLayout = z.infer<typeof GroupLayoutSchema>;
export const GroupSchema = z.strictObject({id, name:z.string().check(z.minLength(1)).check(z.maxLength(200)), parent:z.optional(id), layoutItem:z.optional(LayoutItemSchema), block:z.optional(BlockRecipeSchema)});
export type SlideGroup = z.infer<typeof GroupSchema>;
export const SlideSchema = z.strictObject({
  // Only retained to read existing documents; page identity comes from its position.
  id, title: z.optional(z.string().check(z.maxLength(1000))), background: z._default(color, '#f4f3ee'),
  notes: z._default(z.string().check(z.maxLength(100000)), ''), elements: z.array(ElementSchema).check(z.maxLength(3000)),
  // Kept in the document and editor; skipped during regular presentation navigation.
  hidden: z.optional(z.boolean()),
  transition: z.optional(TransitionSchema),
  backgroundStyle: z.optional(z.enum(COLOR_ROLES)),
  adaptiveColors: z.optional(z.boolean()),
  patternStyle: z.optional(z.enum(['document','none'])),
  layout: z.optional(PageLayoutSchema),
  pageSection: z.optional(z.string().check(z.maxLength(300))),
  pageElements: z.optional(PageElementsSchema),
  template: z.optional(z.strictObject({prototype:z.string().check(z.maxLength(80)),variant:z.string().check(z.maxLength(80)),density:z.enum(['presentation','reading']),collection:z.optional(z.enum(['portfolio','review','proposal','pitch','report','minimal'])),slots:z.optional(z.array(z.strictObject({key:z.string().check(z.maxLength(80)),elementId:id})).check(z.maxLength(300))),generated:z.optional(z.array(z.strictObject({id,signature:z.string().check(z.maxLength(20))})).check(z.maxLength(3000))),generatedGroups:z.optional(z.array(id).check(z.maxLength(1500)))})),
  autoLayouts: z.optional(z.array(GroupLayoutSchema).check(z.maxLength(1500))),
  groups: z.optional(z.array(GroupSchema).check(z.maxLength(1500))),
  source: z.optional(z.object({provider: z.string().check(z.maxLength(80)), render: z.optional(image),
    warnings: z._default(z.array(z.string().check(z.maxLength(1000))).check(z.maxLength(1000)), []),
    fidelity: z.enum(['source-render', 'converted', 'native']),
    label: z.optional(z.string().check(z.maxLength(1000))), nodeId: z.optional(z.string()),
  })),
});
export type Slide = z.infer<typeof SlideSchema>;
export const OnlineFontSchema = z.strictObject({
  id: z.string().check(z.minLength(1)).check(z.maxLength(100)).check(z.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
  family: z.string().check(z.minLength(1)).check(z.maxLength(100)).check(z.regex(/^[^";{}<>\\]+$/)),
  version: z.string().check(z.regex(/^\d+\.\d+\.\d+$/)),
  category: z.enum(['sans', 'serif', 'display', 'mono', 'handwriting']),
  chinese: z.boolean(), weights: z.array(z.number().check(z.int()).check(z.minimum(100)).check(z.maximum(900))).check(z.minLength(1)).check(z.maxLength(9)),
  styles: z.array(z.enum(['normal', 'italic'])).check(z.minLength(1)).check(z.maxLength(2)),
  license: z.enum(['OFL-1.1', 'Apache-2.0']), licenseNotice: z.string().check(z.minLength(20)).check(z.maxLength(30000)),
  provider: z.optional(z.enum(['google', 'fontsource'])),
});
export type OnlineFont = z.infer<typeof OnlineFontSchema>;
export const DocumentFontSchema = z.object({family: z.string().check(z.minLength(1)).check(z.maxLength(100)), name: z.string().check(z.maxLength(200)), data: z.string().check(z.maxLength(25_000_000)).check(z.regex(/^data:font\/(ttf|otf|woff|woff2);base64,[A-Za-z0-9+/=]+$/)), weight: z._default(z.string().check(z.regex(/^\d{3}( \d{3})?$/)), '100 900'), style: z._default(z.enum(['normal', 'italic']), 'normal')});
export const NativeSourceSchema = z.strictObject({provider:z.literal('Keynote'),id:z.string().check(z.guid()),sha256:z.string().check(z.regex(/^[a-f0-9]{64}$/))});
export const GoogleSourceSchema = z.strictObject({id:z.string().check(z.guid()),sha256:z.string().check(z.regex(/^[a-f0-9]{64}$/)),presentationId:z.string().check(z.regex(/^[\w-]{10,200}$/))});
export const DeckSchema = z.strictObject({
  schema: z.literal('deck-studio/1'), id,
  title: z.string().check(z.minLength(1)).check(z.maxLength(300)), width: z.number().check(z.minimum(100)).check(z.maximum(10000)), height: z.number().check(z.minimum(100)).check(z.maximum(10000)),
  revision: z.number().check(z.int()).check(z.minimum(0)), updatedAt: z.string(),
  slides: z.array(SlideSchema).check(z.minLength(1)).check(z.maxLength(500)),
  illustrationAccent: z.optional(z.string().check(z.regex(/^#[\da-fA-F]{6}$/))),
  designSystem: z.optional(DesignSystemSchema),
  templateCollection: z.optional(z.enum(['portfolio','review','proposal','pitch','report','minimal'])),
  pageElements: z.optional(PageElementsSchema),
  onlineFonts: z.optional(z.array(OnlineFontSchema).check(z.maxLength(40))),
  fonts: z.optional(z.array(DocumentFontSchema).check(z.maxLength(40))),
  nativeSource: z.optional(NativeSourceSchema),
  googleSource: z.optional(GoogleSourceSchema),
  provenance: z.optional(z.object({provider: z.string(), filename: z.optional(z.string()), url: z.optional(z.string()), importedAt: z.optional(z.string()),pageSize:z.optional(z.strictObject({width:z.number().check(z.gt(0)).check(z.maximum(20000)),height:z.number().check(z.gt(0)).check(z.maximum(20000)),canvasWidth:z.number().check(z.gt(0)).check(z.maximum(20000)),canvasHeight:z.number().check(z.gt(0)).check(z.maximum(20000))}))})),
});
export type Deck = z.infer<typeof DeckSchema>;

export const uid = (prefix = 'node') => `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
export function element(type: SlideElement['type'], attrs: Partial<SlideElement> = {}): SlideElement {
  return ElementSchema.parse({id: uid(), type, x: 96, y: 200, w: 500, h: 100, name: type === 'text' ? 'Text' : type, ...attrs});
}
// Accept legacy metadata without requiring or generating a page title.
export function blankSlide(legacyTitle?: string): Slide {
  return SlideSchema.parse({id: uid('slide'), ...(legacyTitle!==undefined?{title:legacyTitle}:{}), elements: []});
}
export function validateDeck(value: unknown): Deck {
  const deck = DeckSchema.parse(value);
  assertDeckInvariants(deck);
  return deck;
}

/** Check references before recursive layout; canonical parsing happens at the transaction boundary. */
export function assertDeckInvariants(deck: Deck, trustedSlides?: ReadonlySet<Slide>): void {
  const ids = new Set<string>();
  for (const s of deck.slides) {
    // Owned immutable pages already satisfy local invariants at these dimensions.
    // Slide identity still belongs to the complete document, including reorders.
    if (trustedSlides?.has(s)) {
      if (ids.has(s.id)) throw new Error(`Duplicate slide ID: ${s.id}`);
      ids.add(s.id); continue;
    }
    if (s.layout) {
      const {margins: m, columns, gutter} = s.layout;
      const width = deck.width - m.left - m.right;
      if (width < 1 || deck.height - m.top - m.bottom < 1) throw new Error('Margins must leave at least 1 px of usable slide space.');
      if (width - (columns - 1) * gutter < columns) throw new Error('The column gap is too large. Reduce the number of columns, the gap, or the side margins.');
    }
    if (ids.has(s.id)) throw new Error(`Duplicate slide ID: ${s.id}`);
    ids.add(s.id);
    const nodes = new Set<string>();
    for (const e of s.elements) {
      if (nodes.has(e.id)) throw new Error(`Duplicate element ID: ${e.id}`);
      nodes.add(e.id);
      if (e.pageElement && e.type !== (e.pageElement.kind === 'logo' ? 'image' : e.pageElement.kind === 'divider' ? 'line' : 'text')) throw new Error('Page elements must use text, a logo image or a divider line.');
      if (e.type === 'image' && !e.src && !e.sourceRegion) throw new Error('An image needs a source');
      if (e.type === 'prototype' && !e.prototype) throw new Error('A prototype needs a share link');
      if (e.chart && e.type !== 'chart') throw new Error('Only chart objects support chart data.');
      if (e.chart) validateChart(e.chart);
      if(e.tableStyle&&e.type!=='table')throw new Error('Only table objects support table styles.');
      if(e.type==='table')validateTableStyle(e.cells??[],e.tableStyle);
      if(e.layoutItem){
        for(const axis of ['Width','Height'] as const)if((e.layoutItem[`min${axis}`]??1)>(e.layoutItem[`max${axis}`]??20000))throw new Error(`Minimum ${axis.toLowerCase()} must not exceed maximum ${axis.toLowerCase()}.`);
        if(e.rotation%360!==0&&(e.layoutItem.widthMode==='fill'||e.layoutItem.heightMode==='fill'))throw new Error('Reset object rotation before using Fill.');
      }
    }
    const containers = new Map((s.groups??[]).map(g=>[g.id,g]));
    if(containers.size!==(s.groups??[]).length)throw new Error('Duplicate group ID.');
    const known=new Set([...containers.keys(),...s.elements.map(e=>e.group).filter((id):id is string=>Boolean(id)),...(s.autoLayouts??[]).map(l=>l.id)]);
    for(const g of containers.values()) {
      if(nodes.has(g.id))throw new Error('Group and element IDs must be distinct.');
      const seen=new Set([g.id]);let parent=g.parent;
      while(parent){if(!known.has(parent))throw new Error('Parent group no longer exists.');if(seen.has(parent))throw new Error('Groups cannot contain themselves or their ancestors.');seen.add(parent);if(seen.size>32)throw new Error('Keep group nesting within 32 levels.');parent=containers.get(parent)?.parent;}
      if(g.layoutItem)for(const axis of ['Width','Height'] as const)if((g.layoutItem[`min${axis}`]??1)>(g.layoutItem[`max${axis}`]??20000))throw new Error(`Minimum ${axis.toLowerCase()} must not exceed maximum ${axis.toLowerCase()}.`);
    }
    if (!s.autoLayouts?.length) continue;
    const groups = new Set<string>();
    const membersByGroup = new Map<string, Set<string>>();
    for (const node of [...s.elements, ...(s.groups ?? [])]) {
      const parent = 'type' in node ? node.group : node.parent;
      if (!parent) continue;
      const members = membersByGroup.get(parent) ?? new Set<string>();
      members.add(node.id); membersByGroup.set(parent, members);
    }
    for (const layout of s.autoLayouts ?? []) {
      if (groups.has(layout.id)) throw new Error('Each group can have only one auto layout.');
      groups.add(layout.id);
      if(nodes.has(layout.id))throw new Error('Group and element IDs must be distinct.');
      const members = membersByGroup.get(layout.id) ?? new Set<string>();
      if (layout.order.length !== members.size || new Set(layout.order).size !== members.size || layout.order.some(id => !members.has(id))) throw new Error('Auto layout order must include each group member exactly once.');
    }
  }
}
export function newDeck(title: string, slides: Slide[], width = 1440, height = 810): Deck {
  return validateDeck({schema: 'deck-studio/1', id: uid('deck'), title, width, height, revision: 0, updatedAt: new Date().toISOString(), slides, designSystem: DEFAULT_DESIGN_SYSTEM});
}
