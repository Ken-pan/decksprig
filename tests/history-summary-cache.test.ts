import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rename,readFile,unlink,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {blankSlide,newDeck} from '../src/core/model';
import {HistorySummaryCache} from '../server/history-summary-cache';

test('warm history summaries detach callers and invalidate same-revision replacement, corruption and deletion',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'deck-history-summary-'));
  try {
    const path=join(directory,'version.json'),deck=newDeck('Original 中文',[blankSlide()]),cache=new HistorySummaryCache();
    await writeFile(path,JSON.stringify(deck));
    const [a,b]=await Promise.all([cache.read(path),cache.read(path)]);
    a.title='Caller mutation';assert.equal(b.title,deck.title);assert.equal((await cache.read(path)).title,deck.title);
    await writeFile(path+'.replacement',JSON.stringify({...deck,title:'External replacement'}));await rename(path+'.replacement',path);
    assert.equal((await cache.read(path)).title,'External replacement');
    await writeFile(path,'{preserved invalid history');await assert.rejects(cache.read(path));
    assert.equal(await readFile(path,'utf8'),'{preserved invalid history');
    await writeFile(path,JSON.stringify(deck));assert.equal((await cache.read(path)).title,deck.title);
    await unlink(path);await assert.rejects(cache.read(path),{code:'ENOENT'});
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('history metadata has bounded ownership and does not retain large scalar fields',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'deck-history-bound-'));
  try {
    const cache=new HistorySummaryCache(2),deck=newDeck('Fixture',[blankSlide()]);
    for(let revision=0;revision<4;revision++) {
      const path=join(directory,`${revision}.json`);await writeFile(path,JSON.stringify({...deck,revision}));await cache.read(path);
    }
    assert.equal((cache as any).entries.size,2);
    const path=join(directory,'large.json'),updatedAt='x'.repeat(5000);await writeFile(path,JSON.stringify({...deck,updatedAt}));
    assert.equal((await cache.read(path)).updatedAt,updatedAt);assert.equal((cache as any).entries.has(path),false);
  }finally{await rm(directory,{recursive:true,force:true});}
});
