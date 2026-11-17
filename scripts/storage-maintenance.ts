import {resolve} from 'node:path';import {migrateLocalStorage,rollbackLocalStorage,localStorageStatus} from '../server/storage-maintenance';
const [action='status',...args]=process.argv.slice(2),at=args.indexOf('--data'),root=resolve(at>=0?args[at+1]:process.env.DECK_STUDIO_DATA||'.data');
if(!['status','migrate','rollback'].includes(action))throw Error('Use status, migrate or rollback. Stop older local servers before offline migration.');
const progress=(value:unknown)=>process.stderr.write(JSON.stringify(value)+'\n');
const result=action==='migrate'?await migrateLocalStorage(root,progress):action==='rollback'?await rollbackLocalStorage(root,progress):await localStorageStatus(root);
console.log(JSON.stringify(result,null,2));if('errors'in result&&result.errors.length)process.exitCode=1;
