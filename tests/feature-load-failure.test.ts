import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

test('a failed feature stays failed across instances until app refresh, without blocking other features',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'deck-feature-loading-'));
 try{
  // Replace only the optional import boundary; exercise the actual app cache.
  const source=(await readFile('src/features.ts','utf8')).replace("import('./feature-loaders')","import('./registry.mjs')");
  await writeFile(join(directory,'features.mjs'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
  await writeFile(join(directory,'registry.mjs'),`export const calls={notifications:0,welcome:0};export const View=()=>{};export const loaders={notifications:async()=>{if(++calls.notifications===1)throw Error('Unable to preload CSS for /optional.css');return{default:View};},welcome:async()=>{calls.welcome++;return{default:View};}};`);
  const moduleURL=pathToFileURL(join(directory,'features.mjs')).href;
  const {loadFeature}=await import(moduleURL),{calls,View}=await import(pathToFileURL(join(directory,'registry.mjs')).href);
  const first=loadFeature('notifications');await assert.rejects(first,/Unable to preload CSS/);
  const nextInstance=loadFeature('notifications');assert.equal(nextInstance,first);await assert.rejects(nextInstance,/Unable to preload CSS/);assert.equal(calls.notifications,1,'A new instance cannot bypass the failed stylesheet preload');
  const welcome=loadFeature('welcome');assert.equal(await welcome,View);assert.equal(loadFeature('welcome'),welcome);assert.equal(calls.welcome,1,'Unrelated views remain available and successful imports are shared');
  const refreshed=await import(moduleURL+'?fresh-app');assert.equal(await refreshed.loadFeature('notifications'),View);assert.equal(calls.notifications,2);assert.equal(loadFeature('notifications'),first,'Only a fresh app lifetime resets the failed import');
 }finally{await rm(directory,{recursive:true,force:true});}
});
