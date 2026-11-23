import type {SlideElement} from './model';
import {canEditText} from './shapes';

export type TypographyDisclosure={scope:string;editingId:string;open:boolean};
/** Selection changes choose a default; content changes preserve the user's disclosure. */
export function inspectorTypographyDisclosure(previous:TypographyDisclosure,scope:string,items:SlideElement[],editingId=''):TypographyDisclosure{
 const changed=scope!==previous.scope;
 let open=changed?items.some(item=>canEditText(item)&&(item.type==='text'||Boolean(item.text.trim()))):previous.open;
 if((changed||editingId!==previous.editingId)&&editingId&&items.some(item=>item.id===editingId&&canEditText(item)))open=true;
 return {scope,editingId,open};
}
