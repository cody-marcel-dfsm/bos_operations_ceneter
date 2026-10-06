import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,rm,realpath,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createReviewerTools,reviewerDiscoveryDocument,readReviewerDocument} from '../scripts/marketplace-reviewer-tools.mjs';
import {syntheticAppDescribe,syntheticOperationDescribe,syntheticApiContract} from './helpers/synthetic-bos-discovery-service.mjs';
import {digest} from '../scripts/marketplace-prompt-catalog.mjs';
import {documentDigests,observedDocument,installedValidatorModes,createInstalledAcceptance} from '../scripts/marketplace-native-resources.mjs';

const run=promisify(execFile);
async function retainedValue(tools,document_id,pointer=''){
 let text='',offset=0;
 for(;;){const row=await tools.call('acceptance_read_document',{document_id,pointer,offset});assert.equal(row.found,true);assert.ok(Buffer.byteLength(JSON.stringify(row))<=8192);if(Object.hasOwn(row,'value'))return row.value;text+=row.text;if(row.complete)return JSON.parse(text);offset=row.next_offset;}
}
const context={context_handle:'bos_ctx_v2_'+'a'.repeat(64),organization_name:'Synthetic',application_name:'Synthetic App',installation_name:'Synthetic Installation',role_label:'Reviewer',is_default:true};
const contact={operation:'search',status:'described',effect:'read',limits:{max_targets:null,max_results_per_source:5,pagination_supported:false,bulk_supported:false,streaming_supported:false,maximum_duration_seconds:30,maximum_fan_out:5},guarantees:{read_consistency:'point_in_time',per_source_atomicity:'source_published',cross_source_atomicity:'not_applicable',convergence:'not_applicable',idempotency:'service_owned'},execution:{context_header:'X-BOS-Context-Handle',method:'POST',uri:'/bos/apps/synthetic/api/v1/organizations/synthetic/search'},input_schema:{$schema:'https://json-schema.org/draft/2020-12/schema',type:'object',additionalProperties:false,required:['text'],properties:{text:{type:'string',minLength:1}},'x-bos-fields':[]},output_schema:{$schema:'https://json-schema.org/draft/2020-12/schema',type:'object',required:['count'],properties:{count:{type:'integer'}},'x-bos-fields':[]},error_contract:{schema:'lead-director-public-error/v1',codes:['invalid_search_request','authentication_required']},sources:[{source:{platform:'bos',application:'synthetic',plugin:'synthetic'},availability:'ready'}]};

test('case 8 sends one exact BOS denial probe through the authenticated MCP session',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'reviewer-auth-denial-unit-')));
 try{
  for(const skill of ['bos-external-dependency-adapter','bos-app-discovery']){
   const target=join(root,'skills',skill,'scripts');await mkdir(target,{recursive:true});
   await cp(new URL('../source/platform/'+skill+'/scripts/',import.meta.url),target,{recursive:true});
  }
  await run('git',['init','--quiet'],{cwd:root});await run('git',['add','.'],{cwd:root});
  await run('git',['-c','user.name=Synthetic Test','-c','user.email=test@example.invalid','commit','--quiet','-m','Synthetic published reviewer fixture'],{cwd:root});
  const commit=(await run('git',['rev-parse','HEAD'],{cwd:root})).stdout.trim();
  const args={org_id:'ACME.org'},denial={case_id:'negative-3',operation:'unadvertised_disable_operation',arguments:args,
   input_sha256:digest(args),target_organization:'ACME.org',target_provenance:'owner-declared synthetic request label',
   resolve_target:false,contact_target_domain:false,error_code:'authorization_denied',server_denial_precedes_operation_resolution:true};
  const state={case_id:'negative-3',product:'bos',kind:'authorization-denial',canary:true,handle:context.context_handle,
   authorization_denial:denial,authorization_denial_used:false,organization:'Synthetic',application:'Lead Director',
   installation:'Synthetic Installation',role:'Director',resource:'https://dfsm.ai/mcp/apps/bos/platform',
   installed_root:root,installed_roots:{bos:root},published_commits:{bos:commit},allowed_effects:['read'],
   observations:[],fixtureResponses:[],denials:[],tools:[]};
  const calls=[];
  const session={rpc:async(method,params)=>{
   if(method==='tools/list')return {tools:[{name:'bos_execute'}]};
   calls.push({method,params});return {isError:true,structuredContent:{error_code:'authorization_denied',execution_evidence:{mcp_session_id:'private-session-value'},error_payload:'private-response-value'}};
  },request:async()=>{throw new Error('unexpected_https_request');}};
  const tools=await createReviewerTools({session,state,release:{path:root,release_commit:commit}});
  const result=await tools.call('bos_authorization_denial_probe',{});
  assert.equal(result.isError,false);assert.equal(result.expected_denial,true);assert.deepEqual(result.structuredContent,{error_code:'authorization_denied'});
  assert.doesNotMatch(JSON.stringify(result),/private-session-value|private-response-value|execution_evidence/);
  assert.equal(calls.length,1);assert.equal(calls[0].method,'tools/call');
  assert.equal(calls[0].params.name,'bos_execute');
  assert.deepEqual(calls[0].params.arguments,{context_handle:context.context_handle,tool_name:'unadvertised_disable_operation',arguments:args});
  assert.deepEqual(state.host_tool_outcomes,[{tool:'bos_authorization_denial_probe',kind:'expected_service_denial'}]);
  assert.equal((await tools.call('bos_authorization_denial_probe',{})).reason,'authorization_denial_probe_not_bound');
  assert.equal(state.host_tool_outcomes.at(-1).kind,'tool_error');
  assert.equal(calls.length,1);
 }finally{await rm(root,{recursive:true,force:true});}
});

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
  let current=context,requests=0,response=describeResponse(),nativeSchema={type:'object',required:[],properties:{query:{type:'string'}}},identityFailed=false;
  const session={rpc:async(method,params)=>{
   if(method==='tools/list')return {tools:[{name:'bos_get_context'},{name:'bos_list_context_tools'}]};
   if(method==='resources/read')return {contents:[{uri:params.uri,mimeType:'application/json',text:JSON.stringify(app)}]};
   if(method==='resources/list')return {resources:[
    {uri:uri+'?context_handle='+current.context_handle,name:'app.describe',mimeType:'application/json'},
    {uri:uri+'?context_handle='+('bos_ctx_v2_'+'c'.repeat(64)),name:'app.describe',mimeType:'application/json'}
   ]};
   if(params.name==='bos_list_context_tools')return {structuredContent:{context_handle:current.context_handle,tools:[{name:'synthetic_search',inputSchema:nativeSchema,outputSchema:{type:'object',additionalProperties:true},_meta:{configured_role_definitions:[context.role_label+' catalog only']}}]}};
   assert.equal(params.name,'bos_get_context');return {isError:identityFailed,structuredContent:{contract_version:'bos-identity-mcp/v2',contexts:[current,{...context,organization_name:context.organization_name+' other',role_label:context.role_label+' other'}]}};
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
  const comparisonDefinition=tools.definitions.find(row=>row.name==='acceptance_compare_schemas');
  assert.match(comparisonDefinition.description,/acceptance_validate_installed call returned valid:true/);
  assert.match(comparisonDefinition.description,/legacy api-contract response/);
  assert.match(comparisonDefinition.description,/bos_get_context are not schema evidence/);
  const identity=await tools.call('bos_get_context',{});
  assert.equal(identity.authorized_context.role,context.role_label);
  const observed=await tools.call('bos_read_resource',{uri});
  assert.match(observed.document_id,/^doc_[1-9][0-9]*$/);
  assert.equal((await tools.call('bos_read_resource',{uri})).document_id,observed.document_id);
  const listedResources=await tools.call('bos_list_resources',{});
  assert.equal(listedResources.document.resources.length,1);
  assert.equal(listedResources.document.resources[0].name,'app.describe');
  assert.doesNotMatch(JSON.stringify(listedResources.document),new RegExp(context.context_handle));
  assert.doesNotMatch(JSON.stringify(listedResources.document),/bos_ctx_v2_b{64}/);
  const listedRead=await tools.call('bos_read_resource',{uri:listedResources.document.resources[0].uri});
  assert.equal(listedRead.document_id,observed.document_id);
  assert.deepEqual(listedRead.published_validation,{valid:true,mode:'app-describe',document_id:observed.document_id,release_commit:commit});
  assert.equal(state.validated_contracts['app-describe'],digest(app));
  const args={document_id:observed.document_id,operations:['search']};
  const result=await tools.call('bos_https_describe',args);
  assert.equal(result.isError,undefined);assert.equal(requests,1);
  const invalidMode=await tools.call('acceptance_validate_installed',{path:'skills/bos-app-discovery/scripts/validate-discovery.mjs',mode:'invented-mode',document_id:observed.document_id});
  assert.deepEqual(invalidMode,{isError:true,reason:'reviewer_validator_mode_unsupported'});
  assert.equal(requests,1);
  assert.equal(state.validated_contracts['app-describe'],digest(app));
  assert.deepEqual(await tools.call('acceptance_validate_installed',{path:'skills/other/validator.mjs',mode:'app-describe',document_id:observed.document_id}),{isError:true,reason:'reviewer_tool_failed'});
  const checked=await tools.call('acceptance_validate_installed',{mode:'app-describe',document_id:observed.document_id});
  assert.equal(checked.valid,true);
  for(const keys of [[],['search','search'],['unadvertised'],Array(6).fill('search')]){
   assert.equal((await tools.call('bos_https_describe',{...args,operations:keys})).isError,true);
  }
  assert.equal((await tools.call('bos_https_describe',{...args,document_id:'invented'})).isError,true);assert.equal(requests,1);
  const originalUri=app.describe.uri;
  for(const invalid of [originalUri.replace('synthetic','{organization}'),'https://foreign.test/describe','http://dfsm.ai/describe',originalUri+'?org_id=foreign',originalUri+'#fragment']){
   app.describe.uri=invalid;const changed=await tools.call('bos_read_resource',{uri});
   state.validated_contracts['app-describe']=digest(app);
   assert.equal((await tools.call('bos_https_describe',{...args,document_id:changed.document_id})).isError,true);
  }
  assert.equal(requests,1);app.describe.uri=originalUri;state.validated_contracts['app-describe']=digest(app);state.failed_validations={};
  const validationState=structuredClone({validated:state.validated_contracts,failed:state.failed_validations});
  assert.deepEqual(result.published_validation,{valid:true,mode:'operation-describe',document_id:result.document_id,release_commit:commit});
  assert.deepEqual(state.fixtureResponses,[{operation:'app.describe',transport:'https_discovery',successful:true,body:response}]);
  const receipt=state.observations.findLast(row=>row.validation_origin==='host_https_describe');
  assert.equal(receipt.tool,'validate.installed');assert.equal(receipt.input.mode,'operation-describe');assert.equal(receipt.response.valid,true);assert.equal(receipt.is_error,false);assert.deepEqual(receipt.input.document,response);
  assert.deepEqual({validated:state.validated_contracts,failed:state.failed_validations},validationState);
  assert.equal((await tools.call('acceptance_project_contract_facts',{document_ids:['invented']})).isError,true);
  assert.equal((await tools.call('acceptance_project_contract_facts',{document_ids:[observed.document_id]})).isError,true);
  assert.equal((await tools.call('acceptance_project_contract_facts',{document_ids:[result.advertised_https_contacts[0].document_id]})).isError,true);
  assert.equal((await tools.call('acceptance_project_contract_facts',{document_ids:[result.document_id],scope:{role:'Invented'}})).isError,true);
  state.validated_contracts['app-describe']=digest(app);state.failed_validations={};
  state.observations=state.observations.filter(row=>row.tool!=='validate.installed'||(!row.is_error&&row.response?.valid!==false));
  assert.equal(state.canary,true);assert.equal(state.kind,'positive');assert.ok(state.handle);assert.ok(state.allowed_effects.includes('read'));assert.deepEqual(state.failed_validations,{});assert.equal(state.observations.some(row=>row.tool==='validate.installed'&&(row.is_error||row.response?.valid===false)),false);
  const projected=await tools.call('acceptance_project_contract_facts',{document_ids:[result.document_id]});
  assert.equal(projected.isError,undefined,JSON.stringify(projected));
  const fullProjection=await retainedValue(tools,projected.document_id);
  assert.equal(projected.isError,undefined);assert.equal(projected.view,'derived_contract_facts');
  assert.deepEqual(projected.authorized_context,{kind:'authorized_context_observation',organization:context.organization_name,application:context.application_name,installation:context.installation_name,role:context.role_label,provenance:{operation:'bos.get.context',document_id:projected.authorized_context.provenance.document_id}});
  assert.deepEqual((await tools.call('acceptance_read_document',{document_id:projected.authorized_context.provenance.document_id,pointer:'/contexts/0/role_label'})).value,context.role_label);
  const authorizedSource=(await tools.call('acceptance_read_document',{document_id:projected.authorized_context.provenance.document_id})).value;
  assert.equal(authorizedSource.contract_version,'bos-identity-mcp/v2');assert.equal(authorizedSource.contexts.length,1);
  assert.deepEqual(authorizedSource.contexts[0],Object.fromEntries(Object.entries(context).filter(([key])=>key!=='context_handle')));
  assert.doesNotMatch(JSON.stringify(projected.authorized_context),/context_handle|bos_ctx_v2_/);
  const catalogRoles=await tools.call('bos_list_context_tools',{});
  for(const wrapper of [identity,observed,listedResources,listedRead,result,catalogRoles]){
   assert.equal(wrapper.authorized_context.role,context.role_label);
   assert.equal(await retainedValue(tools,wrapper.authorized_context.provenance.document_id,'/contexts/0/role_label'),context.role_label);
  }
  assert.deepEqual(catalogRoles.document.tools[0]._meta.configured_role_definitions,[context.role_label+' catalog only']);
  assert.notEqual(projected.authorized_context.role,catalogRoles.document.tools[0]._meta.configured_role_definitions[0]);
  const pinnedRole=state.role;state.role=context.role_label+' unverified';
  assert.equal((await tools.call('acceptance_project_contract_facts',{document_ids:[result.document_id]})).isError,true);state.role=pinnedRole;
  identityFailed=true;const failedIdentity=await tools.call('bos_get_context',{});assert.equal(failedIdentity.isError,true);assert.equal(failedIdentity.authorized_context,undefined);
  assert.equal((await tools.call('acceptance_project_contract_facts',{document_ids:[result.document_id]})).isError,true);
  identityFailed=false;await tools.call('bos_get_context',{});
  assert.equal((await tools.call('acceptance_project_contract_facts',{document_ids:[result.document_id]})).authorized_context.role,context.role_label);
  assert.deepEqual(projected.source_documents,[{document_id:result.document_id,document_index:0}]);
  assert.deepEqual(projected.helper,{path:'skills/bos-app-discovery/scripts/project-contract-facts.mjs',release_commit:commit});
  assert.equal(projected.projection,undefined);assert.ok(Buffer.byteLength(JSON.stringify(projected))<=8192);
  assert.equal(fullProjection.operations[0].scope.role,context.role_label);
  assert.equal(projected.summaries[0].unique_operations,fullProjection.summaries[0].unique_operations);
  assert.deepEqual((await tools.call('acceptance_project_contract_facts',{})).source_documents,projected.source_documents);
  for(const invalid of [[],Array(33).fill(result.document_id),[result.document_id,result.document_id]])assert.equal((await tools.call('acceptance_project_contract_facts',{document_ids:invalid})).isError,true);
  assert.equal((await tools.call('acceptance_read_document',{document_id:projected.document_id,pointer:'/operations/0/operation'})).value,'search');
  assert.equal((await tools.call('acceptance_project_contract_facts',{document_ids:[projected.document_id]})).isError,true);
  assert.equal(state.observations.findLast(row=>row.tool==='project.contract.facts').response.projection.operations[0].operation,'search');
  const factsHelper=join(root,'skills/bos-app-discovery/scripts/project-contract-facts.mjs'),factsBytes=await readFile(factsHelper);
  await writeFile(factsHelper,Buffer.concat([factsBytes,Buffer.from('\n// altered helper\n')]));
  assert.equal((await tools.call('acceptance_project_contract_facts',{document_ids:[result.document_id]})).isError,true);
  await writeFile(factsHelper,factsBytes);
  const factsHash=documentDigests(response)[0],factsProof=state.validated_document_proofs[factsHash];
  for(const modified of [{...factsProof,context_handle:'stale'},{...factsProof,scope:{...factsProof.scope,context_handle:'stale'}},{...factsProof,scope:{...factsProof.scope,role:'forged'}}]){
   state.validated_document_proofs[factsHash]=modified;
   assert.equal((await tools.call('acceptance_project_contract_facts',{})).isError,true);
  }
  state.validated_document_proofs[factsHash]={...factsProof,mode:'app-describe'};
  assert.equal((await tools.call('acceptance_project_contract_facts',{document_ids:[result.document_id]})).isError,true);
  assert.equal((await tools.call('acceptance_project_contract_facts',{})).isError,true);
  delete state.validated_document_proofs[factsHash];assert.equal((await tools.call('acceptance_project_contract_facts',{})).isError,true);
  state.validated_document_proofs[factsHash]=factsProof;
  const observedHashes=state.observed_document_digests;state.observed_document_digests=[];
  assert.equal((await tools.call('acceptance_project_contract_facts',{})).isError,true);state.observed_document_digests=observedHashes;
  const appHash=documentDigests(app)[0],contactHash=documentDigests(response.operations[0])[0];
  state.validated_document_proofs[appHash]={...factsProof,mode:'api-contract'};state.validated_document_proofs[contactHash]={...factsProof,mode:'api-contract'};
  assert.deepEqual((await tools.call('acceptance_project_contract_facts',{})).source_documents,projected.source_documents);
  delete state.validated_document_proofs[appHash];delete state.validated_document_proofs[contactHash];
  const acceptance=createInstalledAcceptance(state,async()=>state),changedFacts=structuredClone(response);changedFacts.operations[0].limits.max_targets=4;
  await assert.rejects(()=>acceptance.call('project_contract_facts',{documents:[{kind:'operation-describe',document:changedFacts}]}),/reviewer_document_not_observed/);
  const schemaPair={left:{document_id:result.document_id,pointer:'/operations/0/input_schema'},right:{document_id:result.document_id,pointer:'/operations/0/output_schema'}};
  current={...context,inputSchema:{type:'object',properties:{untrusted:{type:'string'}}}};
  const identityDocument=await tools.call('bos_get_context',{});
  assert.deepEqual(await tools.call('acceptance_compare_schemas',{pairs:[{left:{document_id:identityDocument.document_id,pointer:'/contexts/0/inputSchema'},right:schemaPair.left}]}),{isError:true,reason:'reviewer_document_not_observed'});
  current=context;
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
  assert.equal((await tools.call('acceptance_project_contract_facts',{document_ids:[result.document_id]})).isError,true);
  await writeFile(helper,originalHelper);
  assert.equal((await tools.call('acceptance_compare_schemas',{pairs:[schemaPair]})).comparisons[0].complete,true);

  assert.equal(result.isError,undefined);assert.equal(result.document.contract_version,'lead-director-describe/v1');
  assert.equal(result.advertised_https_contacts.length,1);assert.equal(requests,1);
  const retained=result.advertised_https_contacts[0];
  assert.equal(retained.contact,undefined);assert.equal(retained.parent_document_id,result.document_id);assert.equal(retained.pointer,'/operations/0');assert.equal(retained.operation,'search');
  const beforeRead=requests,observationsBeforeRead=state.observations.length,validationBeforeRead=structuredClone(state.validated_contracts);
  assert.deepEqual((await tools.call('acceptance_read_document',{document_id:retained.document_id,pointer:'/input_schema'})).value,response.operations[0].input_schema);
  assert.deepEqual((await tools.call('acceptance_read_document',{document_id:result.document_id,pointer:retained.pointer+'/input_schema'})).value,response.operations[0].input_schema);
  assert.equal((await tools.call('acceptance_read_document',{document_id:retained.document_id,pointer:'/approval'})).found,false);
  assert.equal(requests,beforeRead);assert.equal(state.observations.length,observationsBeforeRead);assert.deepEqual(state.validated_contracts,validationBeforeRead);
  for(const override of [{kind:'negative'},{canary:false},{handle:null},{allowed_effects:[]}]){
    const saved=Object.fromEntries(Object.keys(override).map(key=>[key,state[key]]));Object.assign(state,override);
    assert.equal((await tools.call('acceptance_read_document',{document_id:retained.document_id})).isError,true);Object.assign(state,saved);
  }
  assert.equal(requests,beforeRead);
  assert.deepEqual(await tools.call('acceptance_read_document',{document_id:'doc_forged'}),{isError:true,reason:'reviewer_document_not_observed'});
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
  await tools.call('bos_get_context',{});const refreshedResources=await tools.call('bos_list_resources',{});
  assert.equal(state.handle,current.context_handle);
  assert.equal(refreshedResources.document.resources.length,1);
  const refreshed=await tools.call('bos_read_resource',{uri:refreshedResources.document.resources[0].uri});
  assert.notEqual(refreshed.document_id,observed.document_id);
  assert.match(refreshed.document_id,/^doc_[1-9][0-9]*$/);
  assert.deepEqual(await tools.call('acceptance_validate_installed',{mode:'app-describe',document_id:observed.document_id}),{isError:true,reason:'reviewer_document_not_observed'});
  assert.deepEqual(await tools.call('bos_https_operation',{contact_id:result.advertised_https_contacts[0].contact_id,payload:{}}),{isError:true,reason:'reviewer_contact_not_observed'});
  assert.deepEqual(await tools.call('acceptance_read_document',{document_id:retained.document_id}),{isError:true,reason:'reviewer_document_not_observed'});
  assert.equal((await tools.call('acceptance_compare_schemas',{pairs:[schemaPair]})).isError,true);
  assert.equal((await tools.call('acceptance_project_contract_facts',{document_ids:[result.document_id]})).isError,true);
  assert.deepEqual(state.validated_document_proofs,{});
 }finally{await rm(root,{recursive:true,force:true});}
});

test('retained document reads preserve escaped pointers, absent/null/false and private redaction',()=>{
 const raw={'a/b':{'~key':[null,false]},credentials:'private-value',public_value:'visible'};
 const read=pointer=>readReviewerDocument(raw,{document_id:'doc_1',pointer});
 assert.equal(read('/a~1b/~0key/0').value,null);assert.equal(read('/a~1b/~0key/1').value,false);
 for(const pointer of ['/missing','/a~1b/~0key/01','/a~1b/~0key/length','/toString','/credentials'])assert.equal(read(pointer).found,false);
 assert.deepEqual(read('').value,{'a/b':{'~key':[null,false]},public_value:'visible'});
 assert.doesNotMatch(JSON.stringify(read('')),/private-value/);
 for(const pointer of ['relative','/~2','/~'])assert.throws(()=>read(pointer),/reviewer_document_not_observed/);
 for(const offset of [-1,1.5,'0',1000])assert.throws(()=>readReviewerDocument(raw,{document_id:'doc_1',offset}),/reviewer_document_not_observed/);
});

test('large retained JSON reconstructs exactly within UTF8 reply bounds without splitting surrogate pairs',()=>{
 const raw={schema:{description:('\u0000"\\😀é漢').repeat(4000),properties:{nested:{type:'string'}}}};
 let offset=0,serialized='',chunks=0;
 do{
  const response=readReviewerDocument(raw,{document_id:'doc_1',pointer:'/schema',offset});
  assert.equal(response.format,'json_text');assert.equal(response.offset,offset);assert.ok(Buffer.byteLength(JSON.stringify(response))<=8192);
  assert.equal(Buffer.from(response.text).toString('utf8'),response.text);serialized+=response.text;chunks++;
  if(response.complete){assert.equal(response.serialized_bytes,Buffer.byteLength(serialized));break;}
  assert.ok(response.next_offset>offset);offset=response.next_offset;
 }while(chunks<1000);
 assert.ok(chunks>1);assert.deepEqual(JSON.parse(serialized),raw.schema);
 const scalar='😀'.repeat(4000);
 assert.throws(()=>readReviewerDocument({scalar},{document_id:'doc_1',pointer:'/scalar',offset:2}),/reviewer_document_not_observed/);
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
    const state={product:'bos',installed_root:root,installed_roots:{bos:root},published_commits:{bos:commit},organization:context.organization_name,application:context.application_name,installation:context.installation_name,role:context.role_label,resource:'https://dfsm.ai/mcp/apps/bos/platform',canary:true,kind:'positive',handle:context.context_handle,observations:[],denials:[],allowed_effects:['read'],tools:[{name:'app.describe',annotations:{readOnlyHint:true},_meta:{'bos/effect':'read'},inputSchema:{type:'object'}},{name:'bos_get_context',annotations:{readOnlyHint:true},_meta:{'bos/effect':'read'},inputSchema:{type:'object',properties:{}}}],validated_contracts:{'app-describe':'already-validated'},failed_validations:{}};
    let current=context,requests=0,contextReads=0,appContextReads=0;
    const session={rpc:async(method,params)=>{
      if(method==='tools/list')return {tools:[{name:'bos.get_context'},{name:'bos.execute'}]};
      if(params.name==='bos.get_context'){contextReads++;return {structuredContent:{contract_version:'bos-identity-mcp/v2',contexts:[current]}};}
      assert.equal(params.name,'bos.execute');if(params.arguments.tool_name==='bos_get_context'){appContextReads++;return {structuredContent:{contract_version:'bos-identity-mcp/v2',context:current,result:{provider_status:'ready',capabilities:['calendar','drive']}}};}assert.equal(params.arguments.tool_name,'app.describe');return {structuredContent:{contract_version:'bos-identity-mcp/v2',context:current,result:{operations:[contact]}}};
    },request:async(url,options)=>{requests++;assert.equal(url,'https://dfsm.ai'+contact.execution.uri);assert.equal(options.headers['X-BOS-Context-Handle'],context.context_handle);assert.deepEqual(JSON.parse(options.body),{text:'synthetic'});return new Response(JSON.stringify({count:2}),{headers:{'content-type':'application/json'}});}};
    const tools=await createReviewerTools({session,state,release:{path:root,release_commit:commit}});
    await tools.call('bos_get_context',{});
    const appContext=await tools.call('bos_context_provider_status',{});
    assert.equal(appContext.document.provider_status,'ready');assert.equal(appContextReads,1);
    const described=await tools.call('bos_control_discover',{operation:'app.describe',arguments:{}});
    const contactId=described.advertised_https_contacts[0].contact_id;
    const result=await tools.call('bos_https_operation',{contact_id:contactId,payload:{text:'synthetic'}});
    assert.deepEqual(result.body,{count:2});assert.equal(result.transport,'https');assert.equal(requests,1);assert.equal(contextReads,2);
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

test('actual retained API contracts validate with canonical wrapper and exact observed provenance',async(t)=>{
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
  contract.public_errors[0].message='Synthetic declaration 漢字 '.repeat(1500);
  const session={rpc:async(method,params)=>{
   if(method==='tools/list')return {tools:[{name:'bos.execute'},{name:'bos_get_context'}]};
   if(params.name==='bos_get_context')return {structuredContent:{contract_version:'bos-identity-mcp/v2',contexts:[current]}};
   requests++;assert.equal(params.name,'bos.execute');assert.equal(params.arguments.tool_name,'api.contract.get');
   return {structuredContent:{contract_version:'bos-identity-mcp/v2',context:current,result:contract}};
  }};
  const tools=await createReviewerTools({session,state,release:{path:root,release_commit:commit}});
  const discover=()=>tools.call('bos_control_discover',{operation:'api.contract.get',arguments:{operation:'calendar.events.search'}});
  const validate=document_id=>tools.call('acceptance_validate_installed',{path:'skills/bos-app-discovery/scripts/validate-discovery.mjs',mode:'api-contract',document_id});
  const direct=await discover();assert.deepEqual(direct.document,contract);assert.equal(direct.document.response,undefined);
  assert.equal(direct.isError,undefined);assert.equal(direct.authorized_context,undefined);
  state.selected_scope={organization:context.organization_name,application:context.application_name,installation:context.installation_name,role:context.role_label,context_handle:context.context_handle};
  assert.equal((await validate(direct.document_id)).valid,true);
  assert.equal(state.validated_contracts['api-contract'],documentDigests(contract)[0]);
  assert.equal(Object.values(state.failed_validations).some(Boolean),false);
  state.validated_contracts['app-describe']='synthetic-validated-app';
  assert.deepEqual(await tools.call('acceptance_project_contract_facts',{document_ids:[direct.document_id]}),{isError:true,reason:'reviewer_identity_unverified'});
  await tools.call('bos_get_context',{});
  const facts=await tools.call('acceptance_project_contract_facts',{document_ids:[direct.document_id]});
  const factsProjection=await retainedValue(tools,facts.document_id);
  assert.ok(Buffer.byteLength(JSON.stringify(facts))<=8192);assert.ok(Buffer.byteLength(JSON.stringify(factsProjection))>8192);
  t.diagnostic(JSON.stringify({actor_projection_bytes:Buffer.byteLength(JSON.stringify(facts)),retained_projection_bytes:Buffer.byteLength(JSON.stringify(factsProjection))}));
  assert.equal(facts.projection,undefined);
  assert.deepEqual(state.observations.findLast(row=>row.tool==='project.contract.facts').response.projection,factsProjection);
  assert.deepEqual(await retainedValue(tools,facts.document_id,facts.summaries[0].error_groups.pointer),factsProjection.summaries[0].error_groups);
  assert.equal((await discover()).authorized_context.role,context.role_label);
  assert.equal(facts.isError,undefined);assert.equal(factsProjection.operations[0].kind,'api-contract');
  assert.deepEqual(facts.source_documents,[{document_id:direct.document_id,document_index:0}]);
  assert.equal(factsProjection.operations[0].scope.role,context.role_label);
  assert.deepEqual(await validate('invented-document'),{isError:true,reason:'reviewer_document_not_observed'});
  const hashes=state.observed_document_digests;state.observed_document_digests=[];
  assert.deepEqual(await validate(direct.document_id),{isError:true,reason:'reviewer_document_not_observed'});
  state.observed_document_digests=hashes;
  const target=contract;contract={operation:target.operation,source:target.source,response:target};
  const legacy=await discover();assert.equal((await validate(legacy.document_id)).valid,true);
  const wrappedFacts=await tools.call('acceptance_project_contract_facts',{document_ids:[legacy.document_id]});
  const wrappedProjection=await retainedValue(tools,wrappedFacts.document_id);
  assert.equal(wrappedFacts.isError,undefined);
  assert.deepEqual(wrappedFacts.source_documents,[{document_id:legacy.document_id,document_index:0,pointer:'/response'}]);
  for(const [groups,key] of [
   [wrappedProjection.summaries[0].execution_groups,'execution_pointer'],
   [wrappedProjection.summaries[0].error_groups,'errors_pointer']
  ]){
   const group=groups[0],observation=group.observations[0];
   const source=wrappedFacts.source_documents[observation.document_index];
   const value=await retainedValue(tools,source.document_id,source.pointer+observation[key]);
   if(key==='errors_pointer')assert.deepEqual(value,group.declaration);
   else {assert.deepEqual(value,target.execution);for(const declaration of group.declarations)assert.equal(value[declaration.field],declaration.value);}
  }
  const defaults=await tools.call('acceptance_project_contract_facts',{});
  assert.deepEqual(defaults.source_documents,[{document_id:direct.document_id,document_index:0},{document_id:legacy.document_id,document_index:1,pointer:'/response'}]);
  assert.equal((await retainedValue(tools,defaults.document_id)).summaries[0].duplicate_observations,1);
  contract={...contract,operation:'other.synthetic.operation'};
  const malformedWrapper=await discover();assert.equal((await validate(malformedWrapper.document_id)).valid,false);
  assert.equal(state.validated_contracts['api-contract'],undefined);
  assert.equal(Object.values(state.failed_validations).some(Boolean),true);
  const before=requests;assert.equal((await discover()).isError,true);assert.equal(requests,before);
 }finally{await rm(root,{recursive:true,force:true});}
});


test('scoped control failure diagnostics retain fixed categories and preserve guards and raw observations',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'reviewer-control-diagnostic-')));
 try{
  const target=join(root,'skills/bos-external-dependency-adapter/scripts');await mkdir(target,{recursive:true});
  await cp(new URL('../source/platform/bos-external-dependency-adapter/scripts/',import.meta.url),target,{recursive:true});
  await run('git',['init','--quiet'],{cwd:root});await run('git',['add','.'],{cwd:root});
  await run('git',['-c','user.name=Synthetic Test','-c','user.email=test@example.invalid','commit','--quiet','-m','Synthetic control diagnostics fixture'],{cwd:root});
  const commit=(await run('git',['rev-parse','HEAD'],{cwd:root})).stdout.trim();
  const state={product:'bos',installed_root:root,organization:context.organization_name,application:context.application_name,installation:context.installation_name,role:context.role_label,resource:'https://dfsm.ai/mcp/apps/bos/platform',canary:true,kind:'positive',handle:context.context_handle,observations:[],denials:[],allowed_effects:['read'],tools:[{name:'api.contract.get',annotations:{readOnlyHint:true},_meta:{'bos/effect':'read'},inputSchema:{type:'object'}}],validated_contracts:{},failed_validations:{}};
  let upstreamError=null,requests=0;
  let raw={isError:true,structuredContent:{error:{code:-32602,message:'Bearer synthetic-secret',access_token:'synthetic-secret'}}};
  const session={rpc:async(method)=>{if(method==='tools/list')return {tools:[{name:'bos.execute'}]};requests++;if(upstreamError)throw upstreamError;return raw;}};
  const tools=await createReviewerTools({session,state,release:{path:root,release_commit:commit}});
  const discover=()=>tools.call('bos_control_discover',{operation:'api.contract.get',arguments:{operation:'synthetic.operation'}});
  const failed=await discover();assert.equal(failed.isError,true);assert.equal(failed.authorized_context,undefined);
  assert.deepEqual(failed.error_diagnostic,{error_category:'jsonrpc_error',error_code_present:true,error_code:-32602});assert.equal(failed.control_operation,'api.contract.get');
  const observation=state.observations.at(-1);assert.equal(observation.is_error,true);
  assert.deepEqual(observation.response,{error:{code:-32602,message:'[credential]'}});
  assert.deepEqual(observation.error_diagnostic,failed.error_diagnostic);
  assert.doesNotMatch(JSON.stringify(failed.error_diagnostic),/synthetic-secret|Bearer|access_token|arguments|message/);
  upstreamError=Object.assign(new Error('Bearer synthetic-secret'),{code:'synthetic-private-code',cause:{code:'ECONNRESET',message:'synthetic-secret'},control_diagnostic:{control_operation:'synthetic-secret',error_diagnostic:{error_code:'synthetic-secret'}}});
  const transport=await discover();assert.equal(transport.reason,'reviewer_tool_failed');assert.equal(transport.isError,true);
  assert.deepEqual(transport.error_diagnostic,{error_category:'network_error',error_code_present:true,error_code:'ECONNRESET'});
  assert.deepEqual(state.observations.at(-1).response,{reason:'reviewer_tool_failed',control_operation:'api.contract.get',error_diagnostic:transport.error_diagnostic});
  assert.doesNotMatch(JSON.stringify(transport),/synthetic-secret|synthetic-private-code|Bearer|arguments|cause|message/);
  upstreamError=Object.assign(new Error('synthetic-secret'),{code:'reviewer_session_expired'});
  const known=await discover();assert.equal(known.reason,'reviewer_session_expired');assert.equal(known.error_diagnostic.error_code,'reviewer_session_expired');
  upstreamError=Object.assign(new Error('synthetic-secret'),{code:'synthetic-private-code'});
  assert.deepEqual((await discover()).error_diagnostic,{error_category:'unrecognized_error',error_code_present:true});
  upstreamError=null;raw={structuredContent:'Bearer synthetic-secret'};
  const malformed=await discover();assert.equal(malformed.isError,true);assert.equal(malformed.reason,'reviewer_document_invalid');
  assert.equal(malformed.control_operation,'api.contract.get');assert.deepEqual(malformed.error_diagnostic,{error_category:'unrecognized_error',error_code_present:false});
  assert.equal(state.observations.at(-2).response,'[credential]');
  assert.deepEqual(state.observations.at(-1).response,{reason:'reviewer_document_invalid',control_operation:'api.contract.get',error_diagnostic:malformed.error_diagnostic});
  assert.doesNotMatch(JSON.stringify(malformed),/synthetic-secret|Bearer|arguments|message/);
  const before=requests;state.canary=false;const denied=await discover();assert.equal(denied.isError,true);assert.equal(denied.error_diagnostic,undefined);assert.equal(requests,before);
  const invalid=await tools.call('bos_control_discover',{operation:'synthetic-private-operation',arguments:{}});assert.equal(invalid.reason,'reviewer_mcp_business_call_forbidden');assert.equal(invalid.error_diagnostic,undefined);assert.equal(invalid.control_operation,undefined);
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
