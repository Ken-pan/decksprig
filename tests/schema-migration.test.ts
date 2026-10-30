import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import * as model from '../src/core/model';
import * as operations from '../src/core/operations';
import {documentJsonBlob} from '../src/core/document-json';
import {strictToolSchema} from '../src/core/ai-tools';
import {mcpInputSchema,omitNull} from '../src/core/tool-recovery';
import {AgentStyleSchema} from '../src/core/agent-tools';
import {GraphicRecipeSchema} from '../src/core/graphic-recipe';
import {patchSchema} from '../src/core/patch-schema';

const baseline=JSON.parse(readFileSync(new URL('./fixtures/zod3-schema-cases.json',import.meta.url),'utf8'));
for(const fixture of baseline.cases)test(`Zod3 compatibility: ${fixture.name}`,()=>{
 const exports=(fixture.module==='model'?model:operations) as Record<string,unknown>;
 const result=(exports[fixture.schema] as z.ZodType).safeParse(fixture.input);
 assert.equal(result.success,fixture.success);
 if(result.success)assert.deepEqual(result.data,fixture.output);
 else assert.deepEqual(result.error.issues.map(issue=>issue.path),fixture.issuePaths);
});

test('a text patch preserves existing geometry, style and source through validation and JSON export',async()=>{
 const fixture=baseline.cases.find((item:any)=>item.name==='legacy-document-defaults-and-source');
 const deck=model.validateDeck(fixture.input),before=structuredClone(deck),slide=deck.slides[0],element=slide.elements[0];
 const changed=operations.applyOperations(deck,[{op:'update_element',slideId:slide.id,elementId:element.id,patch:{text:'Updated 中文'}}]);
 assert.deepEqual(changed.slides[0].elements[0],{...element,text:'Updated 中文'});
 const reopened=model.validateDeck(JSON.parse(await(await documentJsonBlob(changed)).text()));
 assert.deepEqual(reopened,changed);assert.deepEqual(deck,before);
});

test('partial style and transformed recipe fields do not fill omitted defaults',()=>{
 assert.deepEqual(AgentStyleSchema.parse({fill:'#123456'}),{fill:'#123456'});
 assert.deepEqual(patchSchema(GraphicRecipeSchema).parse({rotation:12.3456}),{rotation:12.346});
 assert.deepEqual(patchSchema(GraphicRecipeSchema).parse({}),{});
 assert.deepEqual(GraphicRecipeSchema.parse({}),{strength:1,scale:1,rotation:0});
});

test('oversized document collections reject before parsing invalid members',()=>{
 const fixture=baseline.cases.find((item:any)=>item.name==='legacy-document-defaults-and-source');
 const result=model.DeckSchema.safeParse({...fixture.input,slides:Array.from({length:501},()=>({invalid:true}))});
 assert.equal(result.success,false);
 if(!result.success){assert.equal(result.error.issues.length,1);assert.deepEqual(result.error.issues[0].path,['slides']);assert.equal(result.error.issues[0].code,'too_big');}
 const invalid=model.DeckSchema.safeParse({...fixture.input,slides:[{invalid:true}]});assert.equal(invalid.success,false);
});

test('MCP null adaptation preserves array bounds and tuple positions before canonical validation',()=>{
 const canonical=z.object({items:z.array(z.object({label:z.string().min(1),note:z.string().optional()}).strict()).min(1).max(2),pair:z.tuple([z.string(),z.number()]).optional()}).strict();
 const wire=mcpInputSchema(canonical);
 const input=wire.parse({items:[{label:'Kept',note:null}],pair:null});
 assert.deepEqual(canonical.parse(omitNull(input)),{items:[{label:'Kept'}]});
 for(const items of [[],[{label:'1'},{label:'2'},{label:'3'}]])assert.equal(wire.safeParse({items}).success,false);
 assert.equal(wire.safeParse({items:[{label:'Kept'}],pair:[1,'wrong']}).success,false);
});

test('native provider JSON schema keeps defaulted inputs optional and enforces patch constraints',()=>{
 const wire:any=strictToolSchema(z.object({label:z.string(),count:z.number().int().min(1).max(5).default(2),patch:z.optional(patchSchema(model.ElementSchema))}).strict());
 assert.deepEqual(wire.required,['label','count','patch']);assert.equal(wire.additionalProperties,false);
 assert.equal(wire.properties.count.anyOf[1].type,'null');
 const count=wire.properties.count.anyOf[0];assert.equal(count.type,'integer');assert.equal(count.minimum,1);assert.equal(count.maximum,5);assert(!('default' in count));
 const patch=wire.properties.patch.anyOf[0];assert.equal(patch.additionalProperties,false);assert.equal(patch.properties.opacity.anyOf[0].minimum,0);assert.equal(patch.properties.opacity.anyOf[0].maximum,1);
});

test('schema validation and provider conversion work with string code generation disabled',()=>{
 const script=`
  import assert from 'node:assert/strict';
  import {readFileSync} from 'node:fs';
  import {validateDeck} from ${JSON.stringify(new URL('../src/core/model.ts',import.meta.url).href)};
  import {OperationSchema} from ${JSON.stringify(new URL('../src/core/operations.ts',import.meta.url).href)};
  import {strictToolSchema} from ${JSON.stringify(new URL('../src/core/ai-tools.ts',import.meta.url).href)};
  assert.throws(()=>new Function('return 1'),EvalError);
  const fixture=JSON.parse(readFileSync(0,'utf8')),deck=validateDeck(fixture.input);
  assert.deepEqual(deck,fixture.output);
  const op=OperationSchema.parse({op:'update_element',slideId:'fixture-slide',elementId:'fixture-text',patch:{text:'Kept'}});
  assert.deepEqual(op.patch,{text:'Kept'});
  assert.equal(strictToolSchema(OperationSchema.def.options[1]).type,'object');
  console.log('no-eval validation and provider schema passed');
 `;
 const output=execFileSync(process.execPath,['--disallow-code-generation-from-strings','--import',fileURLToPath(new URL('../node_modules/tsx/dist/loader.mjs',import.meta.url)),'--input-type=module','--eval',script],{input:JSON.stringify(baseline.cases[0]),encoding:'utf8',timeout:15000});
 assert.match(output,/no-eval validation and provider schema passed/);
});
