import {test} from 'node:test';import assert from 'node:assert/strict';
import {browserPreload} from '../scripts/browser-preload.mjs';
const chunk=(fileName:string,imports:string[]=[],dynamicImports:string[]=[],isEntry=false)=>({isEntry,type:'chunk',fileName,imports,dynamicImports});
test('browser preload hints keep lazy dependencies and CSS while omitting fetched static dependencies',()=>{
 const p=browserPreload();p.plugin.generateBundle.handler({}, {a:chunk('a',['b'],['lazy']),b:chunk('b',['c']),c:chunk('c',['a']),lazy:chunk('lazy',['optional']),optional:chunk('optional')});
 assert.deepEqual(p.resolveDependencies('lazy',['a','b','c','lazy','optional','b.css'],{hostType:'js',hostId:'a'}),['lazy','optional','b.css']);
});
test('HTML startup preloads and unknown hosts keep their complete dependency lists',()=>{
 const p=browserPreload();p.plugin.generateBundle.handler({}, {entry:chunk('entry',['shared']),shared:chunk('shared')});
 assert.deepEqual(p.resolveDependencies('entry',['shared'],{hostType:'html',hostId:'index.html'}),['shared']);
 assert.deepEqual(p.resolveDependencies('entry',['shared'],{hostType:'js',hostId:'unknown'}),['shared']);
});
test('a new browser build never reuses a previous output graph',()=>{
 const p=browserPreload();p.plugin.generateBundle.handler({}, {entry:chunk('entry',['old'])});p.plugin.generateBundle.handler({}, {entry:chunk('entry',['new'])});
 assert.deepEqual(p.resolveDependencies('lazy',['old','new'],{hostType:'js',hostId:'entry'}),['old']);
});

const context=(hostId:string)=>({hostId,hostType:'js'});

test('initial feature loaders omit already-fetched ancestor dependencies while preserving CSS and new code',()=>{
 const preload=browserPreload(),bundle={'main.js':chunk('main.js',['loader.js','shared.js'],[],true),'loader.js':chunk('loader.js',[],['feature.js']),'shared.js':chunk('shared.js'),'feature.js':chunk('feature.js',['shared.js','new.js']),'new.js':chunk('new.js')};
 preload.plugin.generateBundle.handler({},bundle);
 assert.deepEqual(preload.resolveDependencies('feature.js',['shared.js','new.js','feature.css'],context('loader.js')),['new.js','feature.css']);
 assert.deepEqual(preload.resolveDependencies('feature.js',['shared.js','feature.css'],{hostId:'index.html',hostType:'html'}),['shared.js','feature.css']);
 assert.deepEqual(preload.resolveDependencies('feature.js',['shared.js','new.js'],context('unknown.js')),['shared.js','new.js']);
 assert.deepEqual(preload.resolveDependencies('feature.js',['feature.js','shared.js','new.js'],context('loader.js')),['new.js']);
 assert.deepEqual(preload.resolveDependencies('feature.js',['feature.js','feature.css'],context('loader.js')),['feature.js','feature.css']);
 assert.equal(preload.plugin.augmentChunkHash(),'browser-static-preloads/2');
});

test('shared initial loaders only omit dependencies common to every entry that can reach them',()=>{
 const preload=browserPreload(),bundle={'a.js':chunk('a.js',['loader.js','common.js','a-only.js'],[],true),'b.js':chunk('b.js',['loader.js','common.js','b-only.js'],[],true),'loader.js':chunk('loader.js',[],['feature.js']),'common.js':chunk('common.js'),'a-only.js':chunk('a-only.js'),'b-only.js':chunk('b-only.js'),'feature.js':chunk('feature.js')};preload.plugin.generateBundle.handler({},bundle);
 assert.deepEqual(preload.resolveDependencies('feature.js',['common.js','a-only.js','b-only.js'],context('loader.js')),['a-only.js','b-only.js']);
});

test('an alternate entry loading a host lazily retains dependencies absent from that entry',()=>{
 const preload=browserPreload(),bundle={'main.js':chunk('main.js',['loader.js','main-only.js'],[],true),'alternate.js':chunk('alternate.js',[],['loader.js'],true),'loader.js':chunk('loader.js',['own.js'],['feature.js']),'own.js':chunk('own.js'),'main-only.js':chunk('main-only.js'),'feature.js':chunk('feature.js')};preload.plugin.generateBundle.handler({},bundle);
 assert.deepEqual(preload.resolveDependencies('feature.js',['own.js','main-only.js','feature.css'],context('loader.js')),['main-only.js','feature.css']);
});
