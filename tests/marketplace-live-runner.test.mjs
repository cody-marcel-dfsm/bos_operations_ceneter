import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {expectedOperationsObserved,runNativeCatalog} from '../scripts/marketplace-native-run.mjs';
import {loadPromptCatalog} from '../scripts/marketplace-prompt-catalog.mjs';
import {parseMarketplaceSelection} from '../scripts/run-marketplace-prompts.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
for(const product of ['bos','education-center'])test(product+' loads exact configured description, starters and submitted cases',async()=>{
 const catalog=await loadPromptCatalog(root,product);
 const manifest=JSON.parse(await readFile(new URL('../products/'+product+'/product.json',import.meta.url),'utf8'));
 const submission=JSON.parse(await readFile(new URL('../products/'+product+'/'+manifest.openai_submission.import_file,import.meta.url),'utf8'));
 assert.equal(catalog.description,manifest.long_description);
 assert.deepEqual(catalog.cases.filter(row=>row.kind==='starter').map(row=>row.prompt),manifest.default_prompts);
 assert.deepEqual(catalog.cases.filter(row=>row.kind==='positive').map(row=>row.prompt),submission.test_cases.map(row=>row.user_prompt));
 assert.deepEqual(catalog.cases.filter(row=>row.kind==='negative').map(row=>row.prompt),submission.negative_test_cases.map(row=>row.user_prompt));
 assert.equal(catalog.cases.length,product==='education-center'?12:11);
});

test('case failures continue and changed configuration is reloaded before the next LLM request',async()=>{
 let catalog={product:'synthetic',version:'1',configuration_sha256:'first',cases:[{id:'one',prompt:'Original one'},{id:'two',prompt:'Original two'}]};
 const prompts=[];
 const report=await runNativeCatalog(async()=>catalog,{},async()=>({}), 'configured-model',[],async(current,item)=>{
  prompts.push(item.prompt);
  if(item.id==='one')catalog={...catalog,configuration_sha256:'second',cases:[catalog.cases[0],{id:'two',prompt:'Changed configured two'}]};
  return {id:item.id,status:'FAIL',configuration_sha256:current.configuration_sha256};
 });
 assert.deepEqual(prompts,['Original one','Changed configured two']);assert.equal(report.cases.length,2);assert.equal(report.status,'FAIL');
});

test('throwing verifier and executor record neutral failures for every configured case',async()=>{
 const catalog={product:'synthetic',version:'1',configuration_sha256:'current',cases:[{id:'one'},{id:'two'}]};
 for(const stage of ['verify','execute']){
  const fail=async()=>{throw new Error('Synthetic private identity and /private/reviewer-url');};
  const result=await runNativeCatalog(async()=>catalog,{},stage==='verify'?fail:async()=>({}),'configured-model',[],stage==='execute'?fail:async()=>({status:'PASS'}));
  assert.equal(result.cases.length,2);assert.ok(result.cases.every(row=>row.status==='FAIL'));assert.doesNotMatch(JSON.stringify(result),/private identity|reviewer-url/);
 }
});

test('Education submitted permission question preserves strict authorized-scope expected output',async()=>{
 const catalog=await loadPromptCatalog(root,'education-center');
 const item=catalog.cases.find(row=>row.id==='negative-1');
 assert.equal(item.kind,'negative');
 assert.equal(item.prompt,'Can I access student or revenue records from an education center where I have no membership? Explain the authorized scope boundary without reading or disclosing those records.');
 assert.equal(item.expected,"The app should not search another organization and should explain that operations are limited to the reviewer's authorized tenant.");
});

test('Education discovery case requires both context and tool-list operations',async()=>{
 const catalog=await loadPromptCatalog(root,'education-center');
 const item=catalog.cases.find(row=>row.id==='positive-6');
 assert.deepEqual(item.expected_operation,['bos_get_context','bos_list_context_tools']);
 assert.equal(expectedOperationsObserved(item.expected_operation,[{tool:'bos_get_context'},{tool:'bos_list_context_tools'}]),true);
 assert.equal(expectedOperationsObserved(item.expected_operation,[{tool:'bos_get_context'}]),false);
 assert.equal(expectedOperationsObserved(item.expected_operation,[{tool:'bos_list_context_tools'}]),false);
});

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const syntheticCatalog=ids=>({product:'synthetic',version:'1',configuration_sha256:'current',cases:ids.map(id=>({id,prompt:id}))});
const passing=(catalog,item)=>({id:item.id,status:'PASS',configuration_sha256:catalog.configuration_sha256});

test('bounded parallel cases dispatch once and preserve catalog order after out-of-order completion',async()=>{
 const catalog=syntheticCatalog(['one','two','three','four','five']);
 const gates=new Map(catalog.cases.map(row=>[row.id,deferred()]));
 const firstWave=deferred(),secondWave=deferred();let active=0,peak=0;const started=[],completed=[];
 const run=runNativeCatalog(async()=>catalog,{},async()=>({}),'configured-model',[],async(current,item)=>{
  started.push(item.id);peak=Math.max(peak,++active);
  if(started.length===3)firstWave.resolve();if(started.length===5)secondWave.resolve();
  await gates.get(item.id).promise;active--;completed.push(item.id);return passing(current,item);
 },{concurrency:3});
 await firstWave.promise;assert.equal(active,3);assert.deepEqual(started,['one','two','three']);
 gates.get('three').resolve();gates.get('two').resolve();await secondWave.promise;
 gates.get('five').resolve();gates.get('four').resolve();gates.get('one').resolve();
 const report=await run;assert.equal(peak,3);assert.equal(new Set(started).size,5);assert.equal(completed[0],'three');
 assert.deepEqual(report.cases.map(row=>row.id),catalog.cases.map(row=>row.id));assert.equal(report.status,'PASS');
});

test('parallel verifier and execution failures stay isolated and all remaining cases run',async()=>{
 const catalog=syntheticCatalog(['one','two','three','four']);const verified=[],executed=[];
 const report=await runNativeCatalog(async()=>catalog,{},async()=>{
  const call=verified.length;verified.push(call);if(call===0)throw new Error('Private verifier detail');return {};
 },'configured-model',[],async(current,item)=>{
  executed.push(item.id);if(item.id==='two')throw new Error('Private execution detail');return passing(current,item);
 },{concurrency:3});
 assert.equal(verified.length,4);assert.deepEqual(executed,['two','three','four']);
 assert.deepEqual(report.cases.map(row=>row.status),['FAIL','FAIL','PASS','PASS']);assert.equal(report.status,'FAIL');
 assert.doesNotMatch(JSON.stringify(report),/Private verifier|Private execution/);
});

test('parallel queued dispatch reloads changed prompt and release while mixed receipts fail',async()=>{
 let catalog=syntheticCatalog(['one','two','three','four']);const firstWave=deferred(),gate=deferred();const seen=[],verified=[];
 const run=runNativeCatalog(async()=>catalog,{},async(current)=>{verified.push(current.configuration_sha256);return {};},'configured-model',[],async(current,item)=>{
  seen.push({id:item.id,prompt:item.prompt,hash:current.configuration_sha256});if(seen.length===3)firstWave.resolve();
  if(item.id!=='four')await gate.promise;return passing(current,item);
 },{concurrency:3});
 await firstWave.promise;catalog={...catalog,configuration_sha256:'changed',cases:catalog.cases.map(row=>row.id==='four'?{...row,prompt:'updated four'}:row)};gate.resolve();
 const report=await run;assert.deepEqual(seen[3],{id:'four',prompt:'updated four',hash:'changed'});
 assert.deepEqual(verified,['current','current','current','changed']);assert.equal(report.status,'FAIL');
});

test('parallel dispatch records removed cases and selected subsets remain incomplete',async()=>{
 let catalog=syntheticCatalog(['one','two','three','four','five']);const firstWave=deferred(),gate=deferred();const executed=[];
 const run=runNativeCatalog(async()=>catalog,{},async()=>({}),'configured-model',[],async(current,item)=>{
  executed.push(item.id);if(executed.length===3)firstWave.resolve();if(item.id!=='five')await gate.promise;return passing(current,item);
 },{concurrency:3});
 await firstWave.promise;catalog={...catalog,cases:catalog.cases.filter(row=>row.id!=='four')};gate.resolve();
 const report=await run;assert.equal(report.cases[3].reason,'case_removed_during_run');assert.deepEqual(executed,['one','two','three','five']);assert.equal(report.status,'FAIL');
 const subset=await runNativeCatalog(async()=>catalog,{},async()=>({}),'configured-model',['one'],passing,{concurrency:3});
 assert.equal(subset.cases.length,1);assert.equal(subset.cases[0].status,'PASS');assert.equal(subset.status,'FAIL');
});

test('invalid runner concurrency fails before catalog, release or execution calls',async()=>{
 let calls=0;const unexpected=async()=>{calls++;throw new Error('Unexpected invocation');};
 for(const concurrency of [0,4,1.5,'3',null])await assert.rejects(runNativeCatalog(unexpected,{},unexpected,'configured-model',[],unexpected,{concurrency}),/concurrency/);
 assert.equal(calls,0);
});

test('marketplace CLI preserves selected IDs and validates bounded concurrency',()=>{
 assert.deepEqual(parseMarketplaceSelection([]),{selected:[],options:{concurrency:1}});
 assert.deepEqual(parseMarketplaceSelection(['starter-1','positive-1']),{selected:['starter-1','positive-1'],options:{concurrency:1}});
 for(const args of [['--concurrency','3','starter-1'],['starter-1','--concurrency','3']])assert.deepEqual(parseMarketplaceSelection(args),{selected:['starter-1'],options:{concurrency:3}});
 for(const args of [['--concurrency'],['--concurrency','0'],['--concurrency','4'],['--concurrency','1.5'],['--concurrency','03'],['--concurrency','2','--concurrency','3'],['--unknown']])assert.throws(()=>parseMarketplaceSelection(args));
});
