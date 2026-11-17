import {requestSignal} from './async-abort';
/** The existing public sample follows the same validation/import path as a file. */
export async function loadSampleFile(signal?:AbortSignal):Promise<File> {
  signal?.throwIfAborted();
  const response=await fetch('/examples/decksprig-demo.deck.json',{signal:requestSignal(signal)});
  if(!response.ok)throw new Error('The sample could not be loaded. Try the sample link again.');
  const blob=await response.blob();signal?.throwIfAborted();
  return new File([blob],'decksprig-demo.deck.json',{type:'application/json'});
}
