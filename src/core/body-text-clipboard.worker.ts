import {readBodyTextClipboard,readBodyHtmlClipboard} from './body-text-clipboard-codec';
self.onmessage=(event:MessageEvent<{raw:string;fromHtml:boolean}>)=>{
  try{self.postMessage({value:event.data.fromHtml?readBodyHtmlClipboard(event.data.raw):readBodyTextClipboard(event.data.raw)});}
  catch{self.postMessage({error:'Formatted text could not be read. Copy a smaller selection and retry.'});}
};
