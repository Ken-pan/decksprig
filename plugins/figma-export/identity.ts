/** Figma duplicates plugin data along with nodes. A copied tag is provenance,
 * not a binding to the original Deck object. Legacy tags bind on first write. */
export function nativeLink(node:any,key:string):string{
  if(!node||node.removed||typeof node.getPluginData!=='function')return '';
  const owner=node.getPluginData('deck-studio-native-id');
  return owner&&owner!==node.id?'':node.getPluginData(key);
}
export function bindNative(node:any,documentId:string,key:string,id:string){
  node.setPluginData(key,id);node.setPluginData('deck-studio-document',documentId);node.setPluginData('deck-studio-native-id',node.id);
}
export function cloneNativeSlide(source:any,documentId:string){
  const node=source.clone(),sources=new Map<string,any>();
  const visit=(from:any,to:any)=>{sources.set(from.id,to);to.setPluginData('deck-studio-document',documentId);to.setPluginData('deck-studio-native-id',to.id);if((from.children?.length??0)!==(to.children?.length??0))throw new Error('The native slide copy has a different layer structure. Undo the copy and compare the source.');for(let i=0;i<(from.children?.length??0);i++)visit(from.children[i],to.children[i]);};
  try{visit(source,node);}catch(error){node.remove();throw error;}
  return {node,sources};
}
