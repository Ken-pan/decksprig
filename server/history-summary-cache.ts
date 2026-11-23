import {readFile,stat} from 'node:fs/promises';
import {readDeckStorage} from './media-storage';
import {dirname} from 'node:path';
import {historySummary,type HistorySummary} from '../src/core/history-summary';

// Disposable scalar metadata only. History JSON remains authoritative, and
// external replacements/corruption must invalidate even an already warm entry.
export class HistorySummaryCache {
  private entries=new Map<string,{signature:string;value:HistorySummary}>();
  private pending=new Map<string,Promise<HistorySummary>>();
  constructor(private limit=1024) {}
  private async signature(path:string) {
    const file=await stat(path,{bigint:true});
    return `${file.ino}:${file.size}:${file.mtimeNs}:${file.ctimeNs}`;
  }
  async read(path:string):Promise<HistorySummary> {
    try {
      const signature=await this.signature(path),cached=this.entries.get(path);
      if(cached?.signature===signature) {
        this.entries.delete(path);this.entries.set(path,cached);return {...cached.value};
      }
      const key=`${path}/${signature}`;
      let request=this.pending.get(key);
      if(!request) {
        request=(async()=>{
          let before=signature;
          for(let attempt=0;attempt<3;attempt++) {
            const deck=await readDeckStorage(path,dirname(dirname(path)),true),after=await this.signature(path);
            if(before!==after){before=after;continue;}
            const value=historySummary(deck);
            if(value.title.length+value.updatedAt.length>4096)return value;
            this.entries.delete(path);this.entries.set(path,{signature:after,value});
            while(this.entries.size>this.limit)this.entries.delete(this.entries.keys().next().value!);
            return value;
          }
          throw Object.assign(new Error('This version is changing. Try again.'),{status:409});
        })();
        this.pending.set(key,request);
      }
      try{return {...await request};}
      finally{if(this.pending.get(key)===request)this.pending.delete(key);}
    } catch(error) {this.entries.delete(path);throw error;}
  }
}
