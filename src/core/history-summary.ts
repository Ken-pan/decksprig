import type {Deck} from './model';

export const HISTORY_LIMIT = 50;
export type HistorySummary = {revision:number;title:string;updatedAt:string;count:number};
export function historySummary(deck: Deck): HistorySummary {
  return {revision:deck.revision,title:deck.title,updatedAt:deck.updatedAt,count:deck.slides.length};
}
