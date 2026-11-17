/** Interaction capabilities must not be inferred from a successful image export. */
export const nativeAnimateCaptureWarning='Native Slides object animations cannot be inspected or translated automatically by this bridge. Their presence is unknown; use Figma for native playback.';

export function figmaFeatureNotes(root:any):string[]{
 const features=new Set<string>();
 const visit=(node:any)=>{
  if(!node||typeof node!=='object')return;
  if(node.type==='INTERACTIVE_SLIDE_ELEMENT')features.add(node.interactiveSlideElementType??'INTERACTIVE');
  if(node.type==='TABLE'&&!node.table)features.add('TABLE');
  if(node.hasHyperlinks)features.add('LINK');
  if(Array.isArray(node.fills)&&node.fills.some((paint:any)=>paint.visible!==false&&paint.type==='VIDEO'))features.add('VIDEO');
  for(const child of node.children??[])visit(child);
 };visit(root);
 const notes:Record<string,string>={
  POLL:'Live polls retain their appearance. Voting and responses remain available in Figma.',
  FACEPILE:'Live votes retain their appearance. Participant responses remain available in Figma.',
  ALIGNMENT:'Alignment scales retain their appearance. Participant responses remain available in Figma.',
  EMBED:'Embedded prototypes retain a static preview. Add a prototype share link here to enable interaction.',
  YOUTUBE:'YouTube embeds retain a static preview. Playback is not transferred from Figma.',
  INTERACTIVE:'Interactive native content retains a static preview. Its interaction remains available in Figma.',
  VIDEO:'Native video retains a still image. Video playback is not transferred from Figma.',
  TABLE:'Native tables retain their appearance. Cell editing remains available in Figma.',
  LINK:'Links on part of a text object or to native slides remain in Figma. Whole-text web, email and phone links are active in presentations.',
 };
 return [...features].map(feature=>notes[feature]).filter(Boolean);
}

export function figmaSyncNotes(native:readonly string[],slides:readonly {source?:{warnings?:string[]}}[]):string[]{
 return [...new Set([...native,...slides.flatMap(slide=>slide.source?.warnings??[])])];
}
