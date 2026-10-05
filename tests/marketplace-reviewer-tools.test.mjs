import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,rm,realpath,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createReviewerTools,reviewerDiscoveryDocument} from '../scripts/marketplace-reviewer-tools.mjs';
import {syntheticAppDescribe,syntheticOperationDescribe,syntheticApiContract} from './helpers/synthetic-bos-discovery-service.mjs';
import {digest} from '../scripts/marketplace-prompt-catalog.mjs';
import {documentDigests,observedDocument,installedValidatorModes,createInstalledAcceptance} from '../scripts/marketplace-native-resources.mjs';

const run=promisify(execFile);
const context={context_handle:'bos_ctx_v2_'+'a'.repeat(64),organization_name:'Synthetic',application_name:'Synthetic App',installation_name:'Synthetic Installation',role_label:'Reviewer',is_default:true};
const contact={operation:'search',status:'described',effect:'read',limits:{max_targets:null,max_results_per_source:5,pagination_supported:false,bulk_supported:false,streaming_supported:false,maximum_duration_seconds:30,maximum_fan_out:5},guarantees:{read_consistency:'point_in_time',per_source_atomicity:'source_published',cross_source_atomicity:'not_applicable',convergence:'not_applicable',idempotency:'service_owned'},execution:{context_header:'X-BOS-Context-Handle',method:'POST',uri:'/bos/apps/synthetic/api/v1/organizations/synthetic/search'},input_schema:{$schema:'https://json-schema.org/draft/2020-12/schema',type:'object',additionalProperties:false,required:['text'],properties:{text:{type:'string',minLength:1}},'x-bos-fields':[]},output_schema:{$schema:'https://json-schema.org/draft/2020-12/schema',type:'object',required:['count'],properties:{count:{type:'integer'}},'x-bos-fields':[]},error_contract:{schema:'lead-director-public-error/v1',codes:['invalid_search_request','authentication_required']},sources:[{source:{platform:'bos',application:'synthetic',plugin:'synthetic'},availability:'ready'}]};

test('HTTPS Describe uses observed validated contact, bounded keys, fresh context and real published response validation',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'reviewer-describe-unit-')));
 try{
  for(const skill of ['bos-external-dependency-adapter','bos-app-discovery']){
   const target=join(root,'skills',skill,'scripts');await mkdir(target,{recursive:true});
   await cp(new URL('../source/platform/'+skill+'/scripts/',import.meta.url),target,{recursive:true});
  }
  await run('git',['init','--quiet'],{cwd:root});await run('git',['add','.'],{cwd:root});
  await run('git',['-c','user.name=Synthetic Test','-c','user.email=test@example.invalid','commit','--quiet','-m','Synthetic published validator fixture'],{cwd:root});
  const commit=(await run('git',['rev-parse','HEAD'],{cwd:root})).stdout.trim();
  const uri='bos://apps/lead-director/app.describe',app=syntheticAppDescribe();
  app.describe.uri='/bos/apps/lead-director/api/v1/organizations/synthetic/describe';
  const state={product:'bos',installed_root:root,installed_roots:{bos:root},published_commits:{bos:commit},organization:context.organization_name,application:context.application_name,installation:context.installation_name,role:context.role_label,resource:'https://dfsm.ai/mcp/apps/bos/platform',canary:true,kind:'positive',handle:context.context_handle,resources:[uri],observations:[],fixtureResponses:[],denials:[],allowed_effects:['read'],validated_contracts:{},failed_validations:{}};
  const describeResponse=()=>{const value=syntheticOperationDescribe();value.operations=value.operations.slice(0,1);return value;};
  let current=context,requests=0,response=describeResponse(),nativeSchema={type:'object',required:[],properties:{query:{type:'string'}}};
  const session={rpc:async(method,params)=>{
   if(method==='tools/list')return {tools:[{name:'bos_get_context'},{name:'bos_list_context_tools'}]};
   if(method==='resources/read')return {contents:[{uri,mimeType:'application/json',text:JSON.stringify(app)}]};
   if(method==='resources/list')return {context_handle:current.context_handle,resources:[{uri,name:'app.describe',mimeType:'application/json'}]};
   if(params.name==='bos_list_context_tools')return {structuredContent:{context_handle:current.context_handle,tools:[{name:'synthetic_search',inputSchema:nativeSchema,outputSchema:{type:'object',additionalProperties:true}}]}};
   assert.equal(params.name,'bos_get_context');return {structuredContent:{contract_version:'bos-identity-mcp/v2',contexts:[current]}};
  },request:async(url,options)=>{
   requests++;assert.equal(url,'https://dfsm.ai'+app.describe.uri);assert.equal(options.method,'POST');
   assert.equal(options.headers['X-BOS-Context-Handle'],context.context_handle);
   assert.deepEqual(JSON.parse(options.body),{operations:['search']});
   return new Response(JSON.stringify(response),{headers:{'content-type':'application/json'}});
  }};
  const tools=await createReviewerTools({session,state,release:{path:root,release_commit:commit}});
  const definition=tools.definitions.find(row=>row.name==='acceptance_validate_installed');
  assert.deepEqual(definition.inputSchema.properties.mode.enum,installedValidatorModes);
  assert.deepEqual(definition.inputSchema.required,['mode','document_id']);
  assert.deepEqual(definition.inputSchema.properties.path.enum,['skills/bos-app-discovery/scripts/validate-discovery.mjs']);
  assert.match(definition.description,/app-describe.*app.describe resource/);
  assert.match(definition.description,/operation-describe.*HTTPS Describe response/);
  const observed=await tools.call('bos_read_resource',{uri});
  assert.match(observed.document_id,/^doc_[1-9][0-9]*$/);
  assert.equal((await tools.call('bos_read_resource',{uri})).document_id,observed.document_id);
  const args={document_id:observed.document_id,operations:['search']};
  assert.equal((await tools.call('bos_https_describe',args)).isError,true);assert.equal(requests,0);
  const invalidMode=await tools.call('acceptance_validate_installed',{path:'skills/bos-app-discovery/scripts/validate-discovery.mjs',mode:'invented-mode',document_id:observed.document_id});
  assert.deepEqual(invalidMode,{isError:true,reason:'reviewer_validator_mode_unsupported'});
  assert.equal(requests,0);
  assert.equal(state.validated_contracts['app-describe'],undefined);
  assert.deepEqual(await tools.call('acceptance_validate_installed',{path:'skills/other/validator.mjs',mode:'app-describe',document_id:observed.document_id}),{isError:true,reason:'reviewer_tool_failed'});
  const checked=await tools.call('acceptance_validate_installed',{mode:'app-describe',document_id:observed.document_id});
  assert.equal(checked.valid,true);
  for(const keys of [[],['search','search'],['unadvertised'],Array(6).fill('search')]){
   assert.equal((await tools.call('bos_https_describe',{...args,operations:keys})).isError,true);
  }
  assert.equal((await tools.call('bos_https_describe',{...args,document_id:'invented'})).isError,true);assert.equal(requests,0);
  const originalUri=app.describe.uri;
  for(const invalid of [originalUri.replace('synthetic','{organization}'),'https://foreign.test/describe','http://dfsm.ai/describe',originalUri+'?org_id=foreign',originalUri+'#fragment']){
   app.describe.uri=invalid;const changed=await tools.call('bos_read_resource',{uri});
   state.validated_contracts['app-describe']=digest(app);
   assert.equal((await tools.call('bos_https_describe',{...args,document_id:changed.document_id})).isError,true);
  }
  assert.equal(requests,0);app.describe.uri=originalUri;state.validated_contracts['app-describe']=digest(app);
  const validationState=structuredClone({validated:state.validated_contracts,failed:state.failed_validations});
  const result=await tools.call('bos_https_describe',args);
  assert.deepEqual(result.published_validation,{valid:true,mode:'operation-describe',document_id:result.document_id,release_commit:commit});
  assert.deepEqual(state.fixtureResponses,[{operation:'app.describe',transport:'https_discovery',successful:true,body:response}]);
  const receipt=state.observations.findLast(row=>row.validation_origin==='host_https_describe');
  assert.equal(receipt.tool,'validate.installed');assert.equal(receipt.input.mode,'operation-describe');assert.equal(receipt.response.valid,true);assert.equal(receipt.is_error,false);assert.deepEqual(receipt.input.document,response);
  assert.deepEqual({validated:state.validated_contracts,failed:state.failed_validations},validationState);
  const schemaPair={left:{document_id:result.document_id,pointer:'/operations/0/input_schema'},right:{document_id:result.document_id,pointer:'/operations/0/output_schema'}};
  const nativeCatalog=await tools.call('bos_list_context_tools',{});
  const nativeComparison=await tools.call('acceptance_compare_schemas',{pairs:[{left:{document_id:nativeCatalog.document_id,pointer:'/tools/0/inputSchema'},right:schemaPair.left}]});
  assert.equal(nativeComparison.isError,undefined);assert.ok(nativeComparison.comparisons[0].declaration_differences.some(row=>row.pointer==='/required'));
  nativeSchema={type:'object',properties:{context_handle:{type:'string',enum:[context.context_handle]}}};
  const privateCatalog=await tools.call('bos_list_context_tools',{});
  assert.equal((await tools.call('acceptance_compare_schemas',{pairs:[{left:{document_id:privateCatalog.document_id,pointer:'/tools/0/inputSchema'},right:schemaPair.left}]})).isError,true);
  const beforeComparison=requests,comparison=await tools.call('acceptance_compare_schemas',{pairs:[schemaPair]});
  assert.equal(comparison.isError,undefined);assert.equal(comparison.comparisons[0].complete,true);
  state.kind='starter';assert.equal((await tools.call('acceptance_compare_schemas',{pairs:[schemaPair]})).comparisons[0].complete,true);
  state.kind='unknown';assert.equal((await tools.call('acceptance_compare_schemas',{pairs:[schemaPair]})).isError,true);state.kind='positive';
  assert.ok(comparison.comparisons[0].declaration_differences.length);assert.deepEqual(comparison.comparisons[0].left,schemaPair.left);
  assert.equal(requests,beforeComparison);
  assert.equal((await tools.call('acceptance_compare_schemas',{pairs:[{...schemaPair,left:{document_id:'not-observed',pointer:'/input_schema'}}]})).isError,true);
  assert.equal((await tools.call('acceptance_compare_schemas',{pairs:[{...schemaPair,left:{document_id:observed.document_id,pointer:'/describe'}}]})).isError,true);
  assert.equal((await tools.call('acceptance_compare_schemas',{pairs:[{...schemaPair,left:{document_id:result.document_id,pointer:'/operations/0/input_schema/~2'}}]})).isError,true);
  state.kind='negative';assert.equal((await tools.call('acceptance_compare_schemas',{pairs:[schemaPair]})).isError,true);state.kind='positive';
  state.failed_validations['api-contract']=true;assert.equal((await tools.call('acceptance_compare_schemas',{pairs:[schemaPair]})).isError,true);delete state.failed_validations['api-contract'];
  const helper=join(root,'skills/bos-app-discovery/scripts/compare-schema-surfaces.mjs'),originalHelper=await readFile(helper);
  await writeFile(helper,Buffer.concat([originalHelper,Buffer.from('\n// altered package fixture\n')]));
  assert.equal((await tools.call('acceptance_compare_schemas',{pairs:[schemaPair]})).isError,true);
  await writeFile(helper,originalHelper);
  assert.equal((await tools.call('acceptance_compare_schemas',{pairs:[schemaPair]})).comparisons[0].complete,true);

  assert.equal(result.isError,undefined);assert.equal(result.document.contract_version,'lead-director-describe/v1');
  assert.equal(result.advertised_https_contacts.length,1);assert.equal(requests,1);
  assert.doesNotMatch(JSON.stringify(result),/bos_ctx_v2_|context_handle/);
  assert.equal((await tools.call('bos_https_describe',args)).isError,undefined);
  assert.equal(state.fixtureResponses.length,2);
  const validationCount=state.observations.filter(row=>row.validation_origin==='host_https_describe').length;
  const fixtureResponseCount=state.fixtureResponses.length;
  response={...response,operations:[]};assert.equal((await tools.call('bos_https_describe',args)).isError,true);
  assert.equal(state.observations.filter(row=>row.validation_origin==='host_https_describe').length,validationCount);
  assert.equal(state.fixtureResponses.length,fixtureResponseCount);
  response=describeResponse();response.operations[0].input_schema=null;
  assert.deepEqual(await tools.call('bos_https_describe',args),{isError:true,reason:'reviewer_describe_response_invalid'});
  const failedReceipt=state.observations.findLast(row=>row.validation_origin==='host_https_describe');assert.equal(failedReceipt.response.valid,false);assert.equal(failedReceipt.is_error,true);
  assert.equal(state.fixtureResponses.length,fixtureResponseCount);
  assert.equal(state.observations.at(-1).response.reason,'reviewer_describe_response_invalid');
  response={...syntheticOperationDescribe(),operations:[{operation:'search',status:'not_available'}]};
  const unavailable=await tools.call('bos_https_describe',args);
  assert.deepEqual(unavailable.document.operations,response.operations);assert.equal(unavailable.advertised_https_contacts,undefined);
  const before=requests;state.kind='negative';assert.equal((await tools.call('bos_https_describe',args)).isError,true);assert.equal(requests,before);state.kind='positive';
  current={...context,context_handle:'bos_ctx_v2_'+'b'.repeat(64)};
  assert.equal((await tools.call('bos_https_describe',args)).isError,true);assert.equal(requests,before);
  assert.deepEqual(await tools.call('acceptance_validate_installed',{mode:'app-describe',document_id:observed.document_id}),{isError:true,reason:'reviewer_document_not_observed'});
  await tools.call('bos_get_context',{});await tools.call('bos_list_resources',{});
  assert.equal(state.handle,current.context_handle);
  const refreshed=await tools.call('bos_read_resource',{uri});
  assert.notEqual(refreshed.document_id,observed.document_id);
  assert.match(refreshed.document_id,/^doc_[1-9][0-9]*$/);
  assert.deepEqual(await tools.call('acceptance_validate_installed',{mode:'app-describe',document_id:observed.document_id}),{isError:true,reason:'reviewer_document_not_observed'});
  assert.deepEqual(await tools.call('bos_https_operation',{contact_id:result.advertised_https_contacts[0].contact_id,payload:{}}),{isError:true,reason:'reviewer_contact_not_observed'});
  assert.equal((await tools.call('acceptance_compare_schemas',{pairs:[schemaPair]})).isError,true);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('standard JSON resource extraction preserves actual document provenance and passes the published validator',async()=>{
  const app=syntheticAppDescribe(),uri='bos://apps/synthetic/app.describe';
  const envelope={contents:[{uri,mimeType:'application/json',text:JSON.stringify(app)}],cacheScope:'private'};
  const parsed=reviewerDiscoveryDocument(envelope,{handle:context.context_handle},uri);
  assert.deepEqual(parsed,app);assert.equal(observedDocument(documentDigests(envelope),parsed),true);
  // Use the validator's stdin contract, retaining the unmodified original JSON.
  const {spawn}=await import('node:child_process');
  await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[new URL('../source/platform/bos-app-discovery/scripts/validate-discovery.mjs',import.meta.url).pathname,'app-describe']);let output='';child.stdout.on('data',chunk=>output+=chunk);child.on('error',reject);child.on('close',code=>{try{assert.equal(code,0);assert.equal(JSON.parse(output).valid,true);resolve();}catch(error){reject(error);}});child.stdin.end(JSON.stringify(parsed));});
});

test('resource extraction rejects ambiguous, malformed and foreign-scope documents',()=>{
  const uri='bos://apps/synthetic/app.describe',row={uri,mimeType:'application/json',text:'{"valid":true}'};
  for(const envelope of [
    {contents:[]},{contents:[row,row]},{contents:[{...row,text:'invalid'}]},
    {contents:[{...row,text:'[]'}]},{contents:[{...row,text:'null'}]},
    {contents:[{...row,uri:'bos://foreign/app.describe'}]},
    {contents:[{...row,mimeType:'text/plain'}]},{contents:[{...row,blob:'binary'}]},
    {contents:[{...row,text:JSON.stringify({context_handle:'foreign'})}]},
    {server:'foreign',contents:[row]},{context:{context_handle:'foreign'},contents:[row]}
  ])assert.throws(()=>reviewerDiscoveryDocument(envelope,{handle:context.context_handle},uri));
  assert.throws(()=>reviewerDiscoveryDocument({contents:[row]},{handle:context.context_handle}));
});

test('identity result extraction retains exact reviewer context and rejects foreign envelopes',()=>{
  const state={handle:context.context_handle,organization:context.organization_name,application:context.application_name,installation:context.installation_name,role:context.role_label};
  const envelope={contract_version:'bos-identity-mcp/v2',context,result:{plugins:[]}};
  assert.deepEqual(reviewerDiscoveryDocument({structuredContent:envelope},state),{plugins:[]});
  assert.equal(observedDocument(documentDigests(envelope),reviewerDiscoveryDocument(envelope,state)),true);
  for(const changed of [{...context,context_handle:'foreign'},{...context,organization_name:'foreign'}])assert.throws(()=>reviewerDiscoveryDocument({...envelope,context:changed},state));
  assert.throws(()=>reviewerDiscoveryDocument({...envelope,result:[]},state));
  assert.throws(()=>reviewerDiscoveryDocument({...envelope,server:'foreign'},state));
  const uri='bos://apps/synthetic/app.describe';
  for(const foreign of [{...envelope,server:'foreign'},{...envelope,context_handle:'foreign'}]) {
    assert.throws(()=>reviewerDiscoveryDocument(foreign,state));
    assert.throws(()=>reviewerDiscoveryDocument({contents:[{uri,mimeType:'application/json',text:JSON.stringify(foreign)}]},state,uri));
  }
  assert.throws(()=>reviewerDiscoveryDocument({...envelope,result:{server:'foreign'}},state));
});

test('test host uses the verified adapter, fresh reviewer context and advertised HTTPS contract',async()=>{
  const root=await mkdtemp(join(tmpdir(),'reviewer-published-unit-'));
  try {
    const adapter=join(root,'skills/bos-external-dependency-adapter/scripts');await mkdir(adapter,{recursive:true});
    await cp(new URL('../source/platform/bos-external-dependency-adapter/scripts/',import.meta.url),adapter,{recursive:true});
    await run('git',['init','--quiet'],{cwd:root});await run('git',['add','.'],{cwd:root});
    await run('git',['-c','user.name=Synthetic Test','-c','user.email=test@example.invalid','-c','core.hooksPath=/dev/null','commit','--quiet','-m','synthetic published adapter fixture'],{cwd:root});
    const commit=(await run('git',['rev-parse','HEAD'],{cwd:root})).stdout.trim();
    const state={product:'bos',installed_root:root,installed_roots:{bos:root},published_commits:{bos:commit},organization:context.organization_name,application:context.application_name,installation:context.installation_name,role:context.role_label,resource:'https://dfsm.ai/mcp/apps/bos/platform',canary:true,kind:'positive',handle:context.context_handle,observations:[],denials:[],allowed_effects:['read'],tools:[{name:'app.describe',annotations:{readOnlyHint:true},_meta:{'bos/effect':'read'},inputSchema:{type:'object'}}],validated_contracts:{'app-describe':'already-validated'},failed_validations:{}};
    let current=context,requests=0,contextReads=0;
    const session={rpc:async(method,params)=>{
      if(method==='tools/list')return {tools:[{name:'bos.get_context'},{name:'bos.execute'}]};
      if(params.name==='bos.get_context'){contextReads++;return {structuredContent:{contract_version:'bos-identity-mcp/v2',contexts:[current]}};}
      assert.equal(params.name,'bos.execute');assert.equal(params.arguments.tool_name,'app.describe');return {structuredContent:{contract_version:'bos-identity-mcp/v2',context:current,result:{operations:[contact]}}};
    },request:async(url,options)=>{requests++;assert.equal(url,'https://dfsm.ai'+contact.execution.uri);assert.equal(options.headers['X-BOS-Context-Handle'],context.context_handle);assert.deepEqual(JSON.parse(options.body),{text:'synthetic'});return new Response(JSON.stringify({count:2}),{headers:{'content-type':'application/json'}});}};
    const tools=await createReviewerTools({session,state,release:{path:root,release_commit:commit}});
    const described=await tools.call('bos_control_discover',{operation:'app.describe',arguments:{}});
    const contactId=described.advertised_https_contacts[0].contact_id;
    const result=await tools.call('bos_https_operation',{contact_id:contactId,payload:{text:'synthetic'}});
    assert.deepEqual(result.body,{count:2});assert.equal(result.transport,'https');assert.equal(requests,1);assert.equal(contextReads,1);
    const businessReceipt=state.observations.findLast(row=>row.transport==='https');
    assert.equal(businessReceipt.contact_sha256,digest(contact));
    assert.match(businessReceipt.contact_sha256,/^[a-f0-9]{64}$/);
    assert.notEqual(businessReceipt.contact_sha256,contactId);
    assert.match(contactId,/^doc_[1-9][0-9]*$/);
    assert.doesNotMatch(JSON.stringify(result),/context_handle|bos_ctx_v2/);
    for(const payload of [{text:'synthetic',org_id:'foreign'},{text:''}]){assert.equal((await tools.call('bos_https_operation',{contact_id:contactId,payload})).isError,true);}
    assert.equal(requests,1);
    current={...context,context_handle:'bos_ctx_v2_'+'b'.repeat(64)};
    await tools.call('bos_get_context',{});
    // A later successful prerequisite validation cannot restore an old contact.
    state.validated_contracts={'app-describe':'new-current-validation'};
    assert.equal((await tools.call('bos_https_operation',{contact_id:contactId,payload:{text:'synthetic'}})).isError,true);assert.equal(requests,1);
    state.tools=[{name:'app.describe',annotations:{readOnlyHint:true},_meta:{'bos/effect':'read'},inputSchema:{type:'object'}}];
    await tools.call('bos_control_discover',{operation:'app.describe',arguments:{}});
    current={...context,context_handle:'bos_ctx_v2_'+'c'.repeat(64)};
    assert.equal((await tools.call('bos_https_operation',{contact_id:contactId,payload:{text:'synthetic'}})).isError,true);assert.equal(requests,1);
    state.kind='negative';assert.equal((await tools.call('bos_control_discover',{operation:'app.describe',arguments:{}})).isError,true);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('actual retained API contracts validate with canonical wrapper and exact observed provenance',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'reviewer-api-wrapper-unit-')));
 try{
  for(const skill of ['bos-external-dependency-adapter','bos-app-discovery']){
   const target=join(root,'skills',skill,'scripts');await mkdir(target,{recursive:true});
   await cp(new URL('../source/platform/'+skill+'/scripts/',import.meta.url),target,{recursive:true});
  }
  await run('git',['init','--quiet'],{cwd:root});await run('git',['add','.'],{cwd:root});
  await run('git',['-c','user.name=Synthetic Test','-c','user.email=test@example.invalid','commit','--quiet','-m','Synthetic published API validator fixture'],{cwd:root});
  const commit=(await run('git',['rev-parse','HEAD'],{cwd:root})).stdout.trim();
  const state={product:'bos',installed_root:root,installed_roots:{bos:root},published_commits:{bos:commit},organization:context.organization_name,application:context.application_name,installation:context.installation_name,role:context.role_label,resource:'https://dfsm.ai/mcp/apps/bos/platform',canary:true,kind:'positive',handle:context.context_handle,observations:[],denials:[],allowed_effects:['read'],tools:[{name:'api.contract.get',annotations:{readOnlyHint:true},_meta:{'bos/effect':'read'},inputSchema:{type:'object'}}],validated_contracts:{},failed_validations:{}};
  let contract=syntheticApiContract(),current=context,requests=0;
  const session={rpc:async(method,params)=>{
   if(method==='tools/list')return {tools:[{name:'bos.execute'}]};
   requests++;assert.equal(params.name,'bos.execute');assert.equal(params.arguments.tool_name,'api.contract.get');
   return {structuredContent:{contract_version:'bos-identity-mcp/v2',context:current,result:contract}};
  }};
  const tools=await createReviewerTools({session,state,release:{path:root,release_commit:commit}});
  const discover=()=>tools.call('bos_control_discover',{operation:'api.contract.get',arguments:{operation:'calendar.events.search'}});
  const validate=document_id=>tools.call('acceptance_validate_installed',{path:'skills/bos-app-discovery/scripts/validate-discovery.mjs',mode:'api-contract',document_id});
  const direct=await discover();assert.deepEqual(direct.document,contract);assert.equal(direct.document.response,undefined);
  assert.equal((await validate(direct.document_id)).valid,true);
  assert.equal(state.validated_contracts['api-contract'],documentDigests(contract)[0]);
  assert.equal(Object.values(state.failed_validations).some(Boolean),false);
  assert.deepEqual(await validate('invented-document'),{isError:true,reason:'reviewer_document_not_observed'});
  const hashes=state.observed_document_digests;state.observed_document_digests=[];
  assert.deepEqual(await validate(direct.document_id),{isError:true,reason:'reviewer_document_not_observed'});
  state.observed_document_digests=hashes;
  const target=contract;contract={operation:target.operation,source:target.source,response:target};
  const legacy=await discover();assert.equal((await validate(legacy.document_id)).valid,true);
  contract={...contract,operation:'other.synthetic.operation'};
  const malformedWrapper=await discover();assert.equal((await validate(malformedWrapper.document_id)).valid,false);
  assert.equal(state.validated_contracts['api-contract'],undefined);
  assert.equal(Object.values(state.failed_validations).some(Boolean),true);
  const before=requests;assert.equal((await discover()).isError,true);assert.equal(requests,before);
 }finally{await rm(root,{recursive:true,force:true});}
});


test('installed Markdown references are verified, provenance-bound and contained in published skills',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'reviewer-installed-references-')));
 const crmRoot=await realpath(await mkdtemp(join(tmpdir(),'reviewer-installed-crm-')));
 try{
  const refs=join(root,'skills/demo/references');await mkdir(refs,{recursive:true});
  await writeFile(join(root,'skills/demo/SKILL.md'),'# Demo\n[Guide](./references/guide.md)\n[Missing](./references/missing.md)\n[Escape](../../outside.md)\n');
  await writeFile(join(refs,'guide.md'),'# Verified guide\n');
  await mkdir(join(crmRoot,'skills/shared'),{recursive:true});
  await writeFile(join(crmRoot,'skills/shared/SKILL.md'),'# CRM shared path\n');
  await mkdir(join(crmRoot,'skills/crm-only'),{recursive:true});
  await writeFile(join(crmRoot,'skills/crm-only/SKILL.md'),'# CRM only\n');
  await writeFile(join(root,'outside.md'),'# Outside skills\n');
  await run('git',['init','--quiet'],{cwd:root});await run('git',['add','.'],{cwd:root});
  await run('git',['-c','user.name=Synthetic Test','-c','user.email=test@example.invalid','commit','--quiet','-m','Synthetic published reference fixture'],{cwd:root});
  const commit=(await run('git',['rev-parse','HEAD'],{cwd:root})).stdout.trim();
  const config={product:'bos',installed_root:root,installed_roots:{bos:root},published_commits:{bos:commit}};
  const acceptance=createInstalledAcceptance(config,async()=>({canary:true,kind:'positive'}));
  const index=await acceptance.call('read_installed',{product:'bos',path:'skills/demo/SKILL.md'});
  assert.match(index.text,/# Demo/);assert.match(index.reference_id,/^file_[1-9][0-9]*$/);
  assert.equal(index.references.length,1);assert.equal(index.references[0].path,'skills/demo/references/guide.md');
  assert.equal(index.references[0].product,'bos');assert.equal(index.unavailable_references.length,2);
  assert.ok(index.unavailable_references.every(row=>row.reason==='not_in_verified_published_package'));
  const guide=await acceptance.call('read_installed',{reference_id:index.references[0].reference_id});
  assert.match(guide.text,/# Verified guide/);assert.equal(guide.reference_id,index.references[0].reference_id);
  await assert.rejects(()=>acceptance.call('read_installed',{path:'../../outside.md',product:'bos'}));
  await assert.rejects(()=>acceptance.call('read_installed',{reference_id:'file_999'}));
  await assert.rejects(()=>acceptance.call('read_installed',{reference_id:index.references[0].reference_id,product:'other'}));
  await mkdir(join(root,'skills/shared'),{recursive:true});
  await writeFile(join(root,'skills/shared/SKILL.md'),'# BOS shared path\n');
  await run('git',['add','.'],{cwd:root});await run('git',['-c','user.name=Synthetic Test','-c','user.email=test@example.invalid','commit','--quiet','-m','Synthetic product-scope fixture'],{cwd:root});
  const scopedCommit=(await run('git',['rev-parse','HEAD'],{cwd:root})).stdout.trim();
  await run('git',['init','--quiet'],{cwd:crmRoot});await run('git',['add','.'],{cwd:crmRoot});
  await run('git',['-c','user.name=Synthetic Test','-c','user.email=test@example.invalid','commit','--quiet','-m','Synthetic CRM product fixture'],{cwd:crmRoot});
  const crmCommit=(await run('git',['rev-parse','HEAD'],{cwd:crmRoot})).stdout.trim();
  const multi=createInstalledAcceptance({product:'my-crm',installed_roots:{bos:root,'my-crm':crmRoot},published_commits:{bos:scopedCommit,'my-crm':crmCommit}},async()=>({canary:true,kind:'negative'}));
  const inferred=await multi.call('read_installed',{path:'skills/demo/SKILL.md'});
  assert.match(inferred.text,/# Demo/);
  const explicit=await multi.call('read_installed',{product:'my-crm',path:'skills/crm-only/SKILL.md'});
  assert.match(explicit.text,/# CRM only/);
  await assert.rejects(()=>multi.call('read_installed',{path:'skills/shared/SKILL.md'}),error=>error.message==='reviewer_installed_product_ambiguous');
 }finally{await rm(root,{recursive:true,force:true});await rm(crmRoot,{recursive:true,force:true});}
});
