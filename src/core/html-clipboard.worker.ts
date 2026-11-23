import {readHtmlClipboard} from './html-clipboard';
self.onmessage=(event:MessageEvent<string>)=>{
  try{self.postMessage({value:readHtmlClipboard(event.data)});}
  catch(error){self.postMessage({error:error instanceof Error?error.message:'Copy a smaller range and paste again.'});}
};
