export async function readStorageDirect(kind:string,input:any):Promise<any>{
 if(kind==='draft')return (await import('./recovery-storage')).readRecoveryRecords(input.id);
 if(import.meta.env?.VITE_DECK_RUNTIME==='browser'){
  const store=await import('./web/store');
  if(kind==='document')return store.readWebDeck(input.id);
  if(kind==='history')return store.webHistory(input.id,input.revision);
  if(kind==='preview')return store.readWebLibraryPreview(input.id,input.revision);
  if(kind==='list')return store.listWebDecks(input.preview);
 }
 if(kind==='maintenance')return (await import('./browser-storage-maintenance')).maintainBrowserStorage(input.operation);
 throw new Error('Unknown storage read.');
}
