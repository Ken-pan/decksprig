import {z} from './schema';
import {ElementSchema,GroupSchema,GroupLayoutSchema,SlideSchema,DocumentFontSchema,OnlineFontSchema,assertDeckInvariants,type Deck} from './model';
import {MAX_CLIPBOARD,ownClipboardContent,type ClipboardContent} from './clipboard';
import {restoreDocumentMedia} from './document-media-transport';

const metadata={kind:z.enum(['objects','slide']),deckId:z.string().check(z.maxLength(120)),slideId:z.string().check(z.maxLength(120)),width:z.number().check(z.minimum(100)).check(z.maximum(10000)),height:z.number().check(z.minimum(100)).check(z.maximum(10000)),fonts:z.array(DocumentFontSchema).check(z.maxLength(40)),onlineFonts:z.array(OnlineFontSchema).check(z.maxLength(40))};
const legacy=z.strictObject({format:z.literal('deck-studio/clipboard/1'),...metadata,members:z.array(ElementSchema).check(z.maxLength(3000)),groups:z.array(GroupSchema).check(z.maxLength(1500)),layouts:z.array(GroupLayoutSchema).check(z.maxLength(1500)),slide:z.optional(SlideSchema)});
const compact=z.strictObject({format:z.literal('deck-studio/clipboard/2'),...metadata,slide:z.unknown(),assets:z.array(z.string().check(z.maxLength(35_000_000))).check(z.maxLength(6001)),references:z.array(z.strictObject({slide:z.literal(0),element:z.number().check(z.int()).check(z.minimum(-1)).check(z.maximum(2999)),field:z.enum(['render','src','poster']),asset:z.number().check(z.int()).check(z.minimum(0)).check(z.maximum(6000))})).check(z.maxLength(6001))});
const multiple=z.strictObject({format:z.literal('deck-studio/clipboard/3'),...metadata,kind:z.literal('slides'),slides:z.array(z.unknown()).check(z.minLength(1)).check(z.maxLength(500)),assets:z.array(z.string().check(z.maxLength(35_000_000))).check(z.maxLength(30000)),references:z.array(z.strictObject({slide:z.number().check(z.int()).check(z.minimum(0)).check(z.maximum(499)),element:z.number().check(z.int()).check(z.minimum(-1)).check(z.maximum(2999)),field:z.enum(['render','src','poster']),asset:z.number().check(z.int()).check(z.minimum(0)).check(z.maximum(29999))})).check(z.maxLength(300000))});
let last:{raw:string;html?:string;content:ClipboardContent}|undefined;
export function readClipboardContent(json:string,html=''):ClipboardContent|undefined {
  if(json&&last?.raw===json||!json&&html&&last?.html===html)return last!.content;
  const encoded=!json?html.match(/data-deck-studio-clipboard="([^"]*)"/)?.[1]:undefined;
  if(!json&&!encoded)return;
  try{
    if((json||encoded!).length>MAX_CLIPBOARD*3)throw Error();
    const raw=json||decodeURIComponent(encoded!);if(raw.length>MAX_CLIPBOARD)throw Error();
    if(last?.raw===raw){if(!json)last.html=html;return last.content;}
    const value=JSON.parse(raw);let c:ClipboardContent;
    if(value.format==='deck-studio/clipboard/3'){
      const wire=multiple.parse(value),restored=restoreDocumentMedia({deck:{slides:wire.slides} as Deck,assets:wire.assets,references:wire.references});
      c={format:'deck-studio/clipboard/1',kind:'slides',deckId:wire.deckId,slideId:wire.slideId,width:wire.width,height:wire.height,fonts:wire.fonts,onlineFonts:wire.onlineFonts,members:[],groups:[],layouts:[],slides:restored.slides.map(slide=>SlideSchema.parse(slide))};
    }else if(value.format==='deck-studio/clipboard/2'){
      const wire=compact.parse(value);
      // References restore only into this newly parsed transport, before canonical validation.
      const restored=restoreDocumentMedia({deck:{slides:[wire.slide]} as Deck,assets:wire.assets,references:wire.references});
      const slide=SlideSchema.parse(restored.slides[0]);
      c={format:'deck-studio/clipboard/1',kind:wire.kind,deckId:wire.deckId,slideId:wire.slideId,width:wire.width,height:wire.height,fonts:wire.fonts,onlineFonts:wire.onlineFonts,members:slide.elements,groups:slide.groups??[],layouts:slide.autoLayouts??[],...(wire.kind==='slide'?{slide}:{})};
    }else c=legacy.parse(value);
    if(c.kind==='slide'&&!c.slide||c.kind==='objects'&&!c.members.length)throw Error();
    const slide=c.kind==='slide'?c.slide!:{id:'clipboard',background:'#ffffff',notes:'',elements:c.members,groups:c.groups,autoLayouts:c.layouts};
    assertDeckInvariants({schema:'deck-studio/1',id:'clipboard',title:'Clipboard',width:c.width,height:c.height,revision:0,updatedAt:'',slides:c.kind==='slides'?c.slides!:[slide]});
    const content=ownClipboardContent(c);last={raw,html:!json?html:undefined,content};return content;
  }catch{throw new Error('This clipboard content is invalid. Copy the selection again.');}
}
