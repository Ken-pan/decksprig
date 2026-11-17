import test from 'node:test';
import assert from 'node:assert/strict';
import {draftRecord} from '../src/core/drafts';
import {writeStoredDraft} from '../src/core/draft-store';
import {blankSlide,newDeck} from '../src/core/model';

test('recovery storage keeps its database/schema/key and only resolves after commit, including failed transactions',async()=>{
  const original=globalThis.indexedDB;let transaction:any,stored:unknown,opened=0,began=()=>{};
  const database:any={onversionchange:null,onclose:null,close(){},transaction(name:string,mode:string){
    assert.equal(name,'drafts');assert.equal(mode,'readwrite');
    transaction={objectStore(){return {put(value:unknown){stored=structuredClone(value);}};}};began();return transaction;
  }};
  globalThis.indexedDB={open(name:string,version:number){
    opened++;assert.equal(name,'deck-studio-local');assert.equal(version,2);
    const request:any={result:database};queueMicrotask(()=>request.onsuccess());return request;
  }} as unknown as IDBFactory;
  try{
    const deck=newDeck('Durable branch',[blankSlide()]);const record={...draftRecord(deck,0,[{...deck,title:'Retained conflict'}]),id:deck.id+'@tab',documentId:deck.id};
    let complete=false;let started=new Promise<void>(ok=>{began=ok;});const pending=writeStoredDraft(record).then(()=>{complete=true;});
    await started;assert.deepEqual(stored,record);assert.equal(complete,false);
    transaction.oncomplete();await pending;assert.equal(complete,true);
    started=new Promise<void>(ok=>{began=ok;});const failed=writeStoredDraft(record);await started;
    const failure=Object.assign(new Error('Quota unavailable'),{name:'QuotaExceededError'});
    transaction.error=failure;const rejected=assert.rejects(failed,e=>e===failure);transaction.onabort();await rejected;assert.equal(opened,1);
  }finally{globalThis.indexedDB=original;database.onversionchange?.();}
});
