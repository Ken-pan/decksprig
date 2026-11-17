import {uid,type Deck} from './model';
import {cloneDocumentData} from './document-data';

export function copyDeck(deck:Deck,title=`${deck.title} · Copy`):Deck{
 return {...cloneDocumentData(deck),id:uid('deck'),title:title.slice(0,300),revision:0,updatedAt:new Date().toISOString()};
}
