import {apiContractReviewerGuidance} from '../scripts/marketplace-reviewer-instructions.mjs';
import {verifyNativeReviewer,classifyNativeFailure,classifyCompletion,caseDiagnostics,httpsDescribeCoverage,reviewerTurnTimeoutMs,latestReviewerClockReference,runCodex,classifyNativeStderr,nativeExecutionDiagnostics,reviewerToolsForCase,reviewerInstructionsForCase} from '../scripts/marketplace-native-run.mjs';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {digest,loadPromptCatalog} from '../scripts/marketplace-prompt-catalog.mjs';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {permission,observe,sanitized,selectReviewerContext} from '../scripts/marketplace-native-hook.mjs';
import {installedPath,observedDocument,documentDigests,createInstalledAcceptance,installedValidatorModes} from '../scripts/marketplace-native-resources.mjs';
import {readFile,mkdtemp,mkdir,writeFile,rm,symlink,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {reviewerErrorDiagnostic,reviewerErrorMetadata,reviewerModelDiagnostics} from '../scripts/marketplace-reviewer-diagnostics.mjs';
import {failedNativeCaseReceipt,partialCaseDiagnostics} from '../scripts/marketplace-native-run.mjs';

test('fixed error classifications preserve known transport codes and withhold unknown error material',()=>{
 for(const [error,category,code] of [
  [{name:'TimeoutError',message:'Bearer private-token'},'request_timeout_or_abort',undefined],
  [{code:-32602,message:'https://private.invalid'},'jsonrpc_error',-32602],
  [{cause:{code:'ECONNRESET'},message:'private-context'},'network_error','ECONNRESET'],
  [{code:'reviewer_mcp_response_invalid'},'reviewer_error','reviewer_mcp_response_invalid'],
  [{name:'SyntaxError',message:'private-json'},'response_parse_error',undefined],
  [{name:'private-name',code:'private-code',message:'private-token'},'unrecognized_error',undefined]
 ]){
  const result=reviewerErrorDiagnostic(error);assert.equal(result.error_category,category);assert.equal(result.error_code,code);
  assert.doesNotMatch(JSON.stringify(result),/private|Bearer/);
  assert.deepEqual(reviewerErrorMetadata({...result,raw:error}),result);
 }
 assert.deepEqual(reviewerErrorMetadata({error_category:'private-category',error_code:'private-code',error_code_present:true}),{error_category:'unrecognized_error',error_code_present:true});
});

test('partial timeout receipts retain safe observation coverage and remain ungraded failures',()=>{
 const model=reviewerModelDiagnostics({phase:'tool_handler',elapsed_ms:300000,phase_elapsed_ms:42,phase_durations:{turn_running:299958,private_phase:3},pending_tool:'bos_control_discover',pending_control_operation:'api.contract.get',pending_tool_elapsed_ms:42,completed_tool_calls:4,raw:'private-token'});
 const error=Object.assign(new Error('reviewer_model_timeout'),{reviewer_diagnostics:model});
 const state={context_handle:'private-context',observations:[
  {tool:'app.describe',transport:'https-discovery',input:{operations:['create']},response:{operations:[{operation:'create'}]}},
  {tool:'validate.installed',validation_origin:'host_https_describe',response:{valid:true}},
  {tool:'bos.execute',input:{tool_name:'api.contract.get',arguments:{token:'private-token'}},is_error:true,response:{reason:'reviewer_tool_failed',error_diagnostic:{error_category:'network_error',error_code_present:true,error_code:'ECONNRESET'}}},
  {tool:'private-tool',is_error:true,response:{reason:'private-error',error_diagnostic:{error_category:'private-category'}}}
 ]};
 const receipt=failedNativeCaseReceipt({id:'synthetic-case'},null,true,error,300042,state);
 assert.equal(receipt.status,'FAIL');assert.equal(receipt.reason,'reviewer_model_timeout');
 const d=receipt.diagnostics;assert.equal(d.partial,true);assert.equal(d.grading_attempted,false);assert.equal(d.observed_count,4);assert.equal(d.failed_observation_count,2);
 assert.equal(d.known_tool_counts['unrecognized_tool'],1);assert.deepEqual(d.model_execution,model);
 assert.deepEqual(d.failed_steps[0],{tool:'bos.execute',reason:'reviewer_tool_failed',control_operation:'api.contract.get',error_diagnostic:{error_category:'network_error',error_code_present:true,error_code:'ECONNRESET'}});
 assert.equal(d.https_describe_coverage.successful_parent_validations,1);
 assert.doesNotMatch(JSON.stringify(receipt),/private-context|private-token|private-tool|private-error|private-category|private_phase/);
 assert.equal(partialCaseDiagnostics({observations:[]},error).observed_count,0);
 assert.equal(partialCaseDiagnostics({observations:[],grading_attempted:true},error).grading_attempted,true);
 const many=Array.from({length:40},(_,index)=>({operation:'public_operation_'+index}));
 const bounded=partialCaseDiagnostics({observations:[{tool:'app.describe',transport:'https-discovery',input:{operations:many.map(row=>row.operation)},response:{operations:many}}]},error).https_describe_coverage;
 assert.equal(bounded.requested_operations.length,32);assert.equal(bounded.returned_operations.length,32);
 assert.equal(bounded.operation_names_truncated,true);assert.equal(bounded.requested_operation_count,40);assert.equal(bounded.returned_operation_count,40);
});

test('diagnostic selection rejects unknown controls and malformed model metadata',()=>{
 const failed=caseDiagnostics({}, {},[{tool:'bos.execute',input:{tool_name:'private-control'},is_error:true,response:{reason:'reviewer_tool_failed'}}]);
 assert.equal(Object.hasOwn(failed.failed_steps[0],'control_operation'),false);
 const d=reviewerModelDiagnostics({phase:'private-phase',elapsed_ms:-1,phase_durations:{private_phase:1,initialize:'private-duration'},pending_tool:'private-tool',pending_control_operation:'private-control',completed_tool_calls:Infinity});
 assert.equal(d.phase,'unrecognized_phase');assert.equal(d.elapsed_ms,0);assert.equal(d.pending_tool,'unrecognized_tool');assert.equal(d.completed_tool_calls,0);
 assert.doesNotMatch(JSON.stringify(d),/private-/);
 const raw={isError:true,content:[{type:'text',text:'private-upstream-text'}]};
 const diagnostic=reviewerErrorDiagnostic({code:-32602});
 const observed={tool:'bos.execute',input:{tool_name:'service.describe'},is_error:true,response:raw,
  control_operation:'service.describe',error_diagnostic:diagnostic};
 const result=caseDiagnostics({}, {},[observed]);
 assert.deepEqual(result.failed_steps[0],{tool:'bos.execute',reason:'reviewer_tool_failed',control_operation:'service.describe',error_diagnostic:diagnostic});
 assert.strictEqual(observed.response,raw);
 assert.doesNotMatch(JSON.stringify(result),/private-upstream-text/);
});

function nativeProcessFixture({stderr=[],stdout=[],code=1,signal=null,waitForKill=false}={}) {
 return ()=>{
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();
  child.kill=killSignal=>{child.stdout.write(JSON.stringify({type:'error',message:'Rate limit exceeded'})+'\n');child.emit('close',null,killSignal);};
  child.stdin.on('finish',()=>queueMicrotask(()=>{
   for(const chunk of stderr)child.stderr.write(chunk);for(const chunk of stdout)child.stdout.write(chunk);
   if(!waitForKill)child.emit('close',code,signal);
  }));return child;
 };
}

test('native subprocess stderr classifies only fixed failure categories without exposing messages',async()=>{
 const cases=[['Rate limit exceeded','native_rate_limit'],['Content was flagged for possible cybersecurity risk','native_host_policy_rejection'],['Invalid access token','native_authentication_failure'],['error: unexpected argument --unsupported','native_cli_usage_failure'],['maximum context length exceeded','native_input_limit'],['ENOSPC: no space left on device','native_io_failure'],['database is locked','native_database_locked']];
 for(const [message,expected] of cases){
  const stderr=message+' Bearer private-token user@example.invalid https://private.invalid/path?token=secret 00000000-0000-0000-0000-000000000001';
  const execution=await runCodex([], 'unprinted input',1000,[],{spawnImpl:nativeProcessFixture({stderr:[stderr.slice(0,4),stderr.slice(4)]})});
  assert.equal(execution.failure,expected);assert.equal(execution.stderr_classification,expected);assert.equal(execution.code,1);assert.ok(execution.elapsed_ms>=0);
  assert.doesNotMatch(JSON.stringify(execution),/private-token|example.invalid|private.invalid|secret|00000000|unprinted input/);
 }
 assert.equal(classifyNativeStderr('unknown native failure with private details'),null);
});

test('native stderr capture stays bounded and unknown process failures remain failures',async()=>{
 const execution=await runCodex([], '',1000,[],{spawnImpl:nativeProcessFixture({stderr:['x'.repeat(8190),'😀 private-token user@example.invalid'],stdout:['malformed output\n']})});
 assert.equal(execution.failure,'native_process_failed');assert.equal(execution.stderr_bytes_retained,8192);assert.equal(execution.stderr_truncated,true);assert.equal(execution.stderr_classification,null);
 assert.doesNotMatch(JSON.stringify(execution),/private-token|example.invalid|malformed output/);
});

test('native stdout failures and timeouts retain precedence while successful exits stay successful',async()=>{
 const failed=await runCodex([], '',1000,[],{spawnImpl:nativeProcessFixture({stderr:['Rate limit exceeded'],stdout:[JSON.stringify({type:'error',message:'Policy violation'})+'\n']})});
 assert.equal(failed.failure,'native_host_policy_rejection');assert.equal(failed.stderr_classification,'native_rate_limit');
 const success=await runCodex([], '',1000,[],{spawnImpl:nativeProcessFixture({stderr:['Rate limit exceeded'],code:0})});assert.equal(success.failure,null);
 const terminated=await runCodex([], '',1000,[],{spawnImpl:nativeProcessFixture({code:null,signal:'SIGKILL'})});assert.equal(terminated.failure,'native_process_failed');assert.equal(terminated.signal,'SIGKILL');
 const timeout=await runCodex([], '',5,[],{spawnImpl:nativeProcessFixture({stderr:['Policy violation'],waitForKill:true})});assert.equal(timeout.failure,'native_timeout');assert.equal(timeout.signal,'SIGTERM');
});

test('grading diagnostics whitelist subprocess metadata and discard private fields and unknown categories',()=>{
 const execution={exit_code:1,exit_signal:'SIGKILL',elapsed_ms:123,stderr_bytes_retained:8192,stderr_truncated:true,stderr_classification:'native_database_locked',stderr:'Bearer private-token',private_url:'https://private.invalid'};
 assert.deepEqual(caseDiagnostics({}, {execution_diagnostics:execution},[]).evaluation_execution,{exit_code:1,exit_signal:'SIGKILL',elapsed_ms:123,stderr_bytes_retained:8192,stderr_truncated:true,stderr_classification:'native_database_locked'});
 const rejected=nativeExecutionDiagnostics({code:'private-token',signal:'private-signal',elapsed_ms:-1,stderr_bytes_retained:8193,stderr_truncated:'true',stderr_classification:'private-category'});
 assert.deepEqual(rejected,{exit_code:null,exit_signal:null,elapsed_ms:0,stderr_bytes_retained:0,stderr_truncated:false,stderr_classification:null});
 assert.doesNotMatch(JSON.stringify(caseDiagnostics({}, {execution_diagnostics:{...execution,stderr_classification:'private-category'}},[])),/private-token|private.invalid|private-category/);
});
test('only the configured full-inventory case receives the longer bounded reviewer turn',async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));
 const catalog=await loadPromptCatalog(root,'bos');
 assert.equal(reviewerTurnTimeoutMs(catalog.cases.find(row=>row.id==='starter-2')),900000);
 assert.equal(reviewerTurnTimeoutMs(catalog.cases.find(row=>row.id==='starter-1')),900000);
 assert.equal(reviewerTurnTimeoutMs({}),300000);
 for(const value of [0,299999,600000,900001,'900000'])assert.throws(()=>reviewerTurnTimeoutMs({reviewer_timeout_ms:value}),/reviewer_turn_timeout_invalid/);
});
test('retained case diagnostics bound failure reasons while removing credentials and private selectors',()=>{
 const diagnostic=caseDiagnostics({reason:'Missing source for reader@example.invalid; Bearer credential-value; https://example.invalid/recover?dependency_token=private-value; bos_ctx_v2_'+ 'a'.repeat(64)+'; 00000000-0000-0000-0000-000000000001'}, {missing:['Missing contract provenance','x'.repeat(3000)]},[
  {tool:'bos_https_describe',is_error:true,response:{reason:'reviewer_document_not_observed'}},
  {tool:'validate.installed',response:{valid:false,diagnostic:'credential-value'}},
  {tool:'bos.get.context',response:{contexts:[]}}
 ]);
 assert.match(diagnostic.completion_reason,/Missing source/);
 assert.doesNotMatch(JSON.stringify(diagnostic),/reader@example|credential-value|private-value|bos_ctx_v2_|00000000-0000/);
 assert.equal(diagnostic.evaluation_missing[0],'Missing contract provenance');
 assert.equal(diagnostic.evaluation_missing[1].length,2000);
 assert.deepEqual(diagnostic.failed_steps,[{tool:'bos_https_describe',reason:'reviewer_document_not_observed'},{tool:'validate.installed',reason:'reviewer_validation_failed'}]);
 const validationModes=caseDiagnostics({}, {},[],undefined,undefined,undefined,{'app-describe:private-digest':true,'operation-describe:another-private-digest':true,'not-a-validator:private-digest':true,'api-contract:ignored-false':false});
 assert.deepEqual(validationModes.failed_validation_modes,['app-describe','operation-describe']);
 assert.doesNotMatch(JSON.stringify(validationModes),/private-digest|another-private/);
});
test('failed business reads retain only allowlisted reviewer error diagnostics',()=>{
 const diagnostic=caseDiagnostics({}, {},[
  {tool:'bos_https_operation',input:{contact_id:'doc_private',payload:{email:'person@example.invalid'}},is_error:true,response:{reason:'reviewer_tool_failed',error_diagnostic:{error_category:'network_error',error_code_present:true,error_code:'ECONNRESET'}}}
 ]);
 assert.deepEqual(diagnostic.failed_steps,[{tool:'bos_https_operation',reason:'reviewer_tool_failed',error_diagnostic:{error_category:'network_error',error_code_present:true,error_code:'ECONNRESET'}}]);
 assert.doesNotMatch(JSON.stringify(diagnostic),/doc_private|person@example/);
});
test('HTTPS Describe diagnostics retain public operation names and omit private document and scope data',()=>{
 const observed=[
  {tool:'app.describe',transport:'https-discovery',input:{operations:['create','update'],document_id:'private-document'},response:{operations:[{operation:'create',input_schema:{properties:{customer_email:{type:'string'}}}},{operation:'update'}],uri:'https://private.invalid',context_handle:'bos_ctx_v2_secret'},is_error:false},
  {tool:'validate.installed',validation_origin:'host_https_describe',response:{valid:true,document_id:'private-document'},is_error:false},
  {tool:'bos_https_describe',is_error:true,input:{operations:['../secret','../../secret'],document_id:'private-document'},response:{reason:'reviewer_failed'}}
 ];
 const coverage=httpsDescribeCoverage(observed);
 assert.deepEqual(coverage,{requested_operations:['create','update'],returned_operations:['create','update'],successful_parent_validations:1,failed_parent_validations:0});
 const diagnostics=caseDiagnostics({}, {},observed);
 assert.deepEqual(diagnostics.https_describe_coverage,coverage);
 assert.doesNotMatch(JSON.stringify(diagnostics),/private-document|private\.invalid|bos_ctx_v2_secret|customer_email|secret/);
});
test('validator selection diagnostics retain only supported modes and boolean document categories',()=>{
 const result=caseDiagnostics({}, {},[
  {tool:'validate.installed',response:{valid:false,diagnostic:'private-token'},input:{mode:'app-describe',document:{$schema:'private-url',type:'object',properties:{'private-customer':{default:'private-value'}}}}},
  {tool:'validate.installed',response:{valid:false},input:{mode:'api-contract',document:{response:{execution:{uri:'private-url'},operations:[]},access_token:'private-token'}}},
  {tool:'acceptance_validate_installed',is_error:true,response:{reason:'reviewer_document_not_observed'},input:{mode:'private-token',document_id:'private-selector'}}
 ]);
 assert.deepEqual(result.failed_steps,[
  {tool:'validate.installed',reason:'reviewer_validation_failed',validation_mode:'app-describe',document_is_json_schema:true,document_has_execution_contract:false,document_has_operation_envelope:false},
  {tool:'validate.installed',reason:'reviewer_validation_failed',validation_mode:'api-contract',document_is_json_schema:false,document_has_execution_contract:true,document_has_operation_envelope:true},
  {tool:'acceptance_validate_installed',reason:'reviewer_document_not_observed',validation_mode:'unsupported'}
 ]);
 assert.doesNotMatch(JSON.stringify(result),/private-/);
});
test('failed published-validator observations retain only bounded rule codes and canonical schema locations',()=>{
 const state={observations:[],observed_document_digests:[],failed_validations:{},validated_contracts:{}};
 const raw='Error: plugins.list response.plugins[1].readiness.requirements[0].requirements has undeclared field private_customer; value=Bearer private-token\n    at /private/customer/path';
 observe({tool_name:'mcp__Acceptance__validate_installed',tool_input:{mode:'plugins',document:{plugins:[]}},tool_response:{valid:false,diagnostic:raw}},state);
 assert.deepEqual(state.observations[0].response,{valid:false,diagnostic_metadata:{rule_code:'undeclared_field',schema_location:'plugins.list response.plugins[1].readiness.requirements[0].requirements'}});
 assert.doesNotMatch(JSON.stringify(state),/private_customer|private-token|customer\/path|Bearer/);
 const receipt=caseDiagnostics({}, {},state.observations);
 assert.deepEqual(receipt.failed_steps,[{tool:'validate.installed',reason:'reviewer_validation_failed',validation_mode:'plugins',document_is_json_schema:false,document_has_execution_contract:false,document_has_operation_envelope:false,validation_diagnostic:{rule_code:'undeclared_field',schema_location:'plugins.list response.plugins[1].readiness.requirements[0].requirements'}}]);
});
test('actor scope proof contains only actual public preflight labels and a strict verification flag',async()=>{
 const {publicReviewerScope}=await import('../scripts/marketplace-native-run.mjs');
 const scope={organization_name:'Synthetic',application_name:'App',installation_name:'Installation',role_label:'Authorized role',configured_roles:['Other role'],context_handle:'private-selector',access_token:'private-token',uri:'private-url'};
 assert.deepEqual(publicReviewerScope(scope,true),{organization_name:'Synthetic',application_name:'App',installation_name:'Installation',role_label:'Authorized role',verified:true});
 assert.equal(publicReviewerScope(scope,'true').verified,false);
 assert.doesNotMatch(JSON.stringify(publicReviewerScope(scope,true)),/private-|Other role/);
});
test('scope and negative/effect checks run before dispatch',()=>{
 const state={canary:true,handle:'selected',kind:'positive',allowed_effects:['read'],tools:[{name:'plugins.list',_meta:{'bos/effect':'read'},inputSchema:{type:'object',additionalProperties:false}}]};
 assert.equal(permission({tool_name:'mcp__BOS_Platform__bos_execute',tool_input:{context_handle:'other',tool_name:'plugins.list',arguments:{}}},state),'wrong_scope');
 assert.equal(permission({tool_name:'mcp__BOS_Platform__bos_execute',tool_input:{context_handle:'selected',tool_name:'plugins.list',arguments:{}}},state),null);
 assert.equal(permission({tool_name:'mcp__BOS_Platform__bos_execute',tool_input:{context_handle:'selected',tool_name:'send',arguments:{}}},state),'undiscovered_operation');
 assert.equal(permission({tool_name:'mcp__BOS_Platform__bos_execute',tool_input:{context_handle:'selected',tool_name:'plugins.list',arguments:{}}},{...state,kind:'negative'}),'negative_case_business_call');
 assert.equal(permission({tool_name:'Bash',tool_input:{cmd:'curl example.invalid'}},state),'unapproved_tool');
});
test('Education positive-3 MCP approval cannot authorize another product with the same case ID',()=>{
 const operation='education_center_get_camp_roster_report';
 const arguments_={query:{start_date:'2026-09-14',end_date:'2026-09-18'}};
 const descriptor={name:operation,_meta:{'bos/effect':'read'},inputSchema:{type:'object'}};
 const state={product:'education-center',case_id:'positive-3',canary:true,handle:'selected',kind:'positive',allowed_effects:['read'],validated_contracts:{'app-describe':'verified-synthetic'},tools:[descriptor],education_positive3_read_approval:{operation,effect:'read',input_sha256:digest(arguments_),used:false}};
 const event={tool_name:'mcp__BOS_Platform__bos_execute',tool_input:{context_handle:'selected',tool_name:operation,arguments:arguments_}};
 assert.equal(permission(event,state),null);
 const otherProduct={...state,product:'bos',education_positive3_read_approval:{...state.education_positive3_read_approval,used:false}};
 assert.equal(permission(event,otherProduct),null);
 assert.equal(otherProduct.education_positive3_read_approval.used,false);
 const missingEffect={...state,tools:[{...descriptor,_meta:{}}],education_positive3_read_approval:{...state.education_positive3_read_approval,used:false}};
 assert.equal(permission(event,missingEffect),'unapproved_effect');
 const missingDiscovery={...state,validated_contracts:{},education_positive3_read_approval:{...state.education_positive3_read_approval,used:false}};
 assert.equal(permission(event,missingDiscovery),'published_prerequisite_required');
});
test('canary fails closed and observed identity binds the exact selected role',()=>{
 const state={organization:'Synthetic',role:'Reviewer',application:'Synthetic App',installation:'Synthetic Installation',observations:[],denials:[]};
 assert.equal(permission({tool_name:'mcp__BOS_Platform__bos_get_context'},state),'guard_canary_required');
 assert.equal(permission({tool_name:'mcp__Acceptance__guard_probe'},state),'guard_canary_denied');
 observe({tool_name:'mcp__BOS_Platform__bos_get_context',tool_response:{contexts:[{organization_name:'Other',role_label:'Reviewer',context_handle:'wrong'},{organization_name:'Synthetic',role_label:'Reviewer',application_name:'Synthetic App',installation_name:'Synthetic Installation',context_handle:'right'}]}},state);
 assert.equal(state.handle,'right');assert.doesNotMatch(JSON.stringify(state.observations),/context_handle/);
 assert.deepEqual(sanitized({access_token:'secret',value:'safe'}),{value:'safe'});
 const providerResult=sanitized({result:{error:{recovery_token:'secret-token',required_authorizations:[{authorization_kind:'api_key',status:'configuration_required',authorization_url:'https://dfsm.ai/api/v1/mcp/provider-recovery?dependency_token=private'}]}}},'https://dfsm.ai');
 assert.deepEqual(providerResult,{result:{error:{required_authorizations:[{authorization_kind:'api_key',status:'configuration_required',authorization_url:'https://dfsm.ai/api/v1/mcp/provider-recovery?[query redacted]'}]}}});
 assert.doesNotMatch(JSON.stringify(providerResult),/private|secret-token|dependency_token/);
 const foreignProviderResult=sanitized({result:{error:{required_authorizations:[{authorization_kind:'api_key',status:'configuration_required',authorization_url:'https://foreign.example.invalid/collect-key'}]}}},'https://dfsm.ai');
 assert.deepEqual(foreignProviderResult,{result:{error:{required_authorizations:[{authorization_kind:'api_key',status:'configuration_required'}]}}});
});
test('published installed resources reject traversal and symlink escapes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'native-resource-test-'));
 try {await mkdir(join(dir,'package/skills'),{recursive:true});await writeFile(join(dir,'outside.md'),'private');await writeFile(join(dir,'package/skills/reference.md'),'public');await symlink(join(dir,'outside.md'),join(dir,'package/skills/escape.md'));
 assert.equal(await installedPath(join(dir,'package'),'skills/reference.md'),await realpath(join(dir,'package/skills/reference.md')));
 await assert.rejects(installedPath(join(dir,'package'),'../outside.md'));await assert.rejects(installedPath(join(dir,'package'),'skills/escape.md'));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('validators accept actual host documents and reject altered copies or installed examples',()=>{
 const response={operations:[{operation:'synthetic.read'}],count:1};
 const observed=documentDigests({contents:[{text:JSON.stringify(response)}]});
 assert.equal(observedDocument(observed,{count:1,operations:[{operation:'synthetic.read'}]}),true);
 assert.equal(observedDocument(observed,{...response,count:2}),false);
 assert.equal(observedDocument([],response),false);
});

test('reviewer selection requires the exact application and installation and rejects ambiguity',()=>{
 const state={organization:'Synthetic',role:'Reviewer',application:'Expected App',installation:'Expected Installation'};
 const valid={organization_name:state.organization,role_label:state.role,application_name:state.application,installation_name:state.installation,context_handle:'selected'};
 assert.equal(selectReviewerContext([{...valid,application_name:'Other App'}],state),null);
 assert.equal(selectReviewerContext([{...valid,installation_name:'Other Installation'}],state),null);
 assert.equal(selectReviewerContext([valid,valid],state),null);
 assert.equal(selectReviewerContext([valid],{...state,application:undefined}),null);
 assert.deepEqual(selectReviewerContext([valid],state),valid);
});

test('contradictory metadata and control-plane mutations require explicit approved effects',()=>{
 const event={tool_name:'mcp__BOS__bos_execute',tool_input:{context_handle:'selected',tool_name:'plugins.list',arguments:{}}};
 const descriptor={name:'plugins.list',inputSchema:{type:'object'},annotations:{readOnlyHint:true},_meta:{'bos/effect':'write'}};
 const state={canary:true,handle:'selected',kind:'positive',allowed_effects:['read'],tools:[descriptor]};
 assert.equal(permission(event,state),'contradictory_effect_metadata');
 assert.equal(permission(event,{...state,tools:[{...descriptor,annotations:{readOnlyHint:false}}]}),'unapproved_effect');
 assert.equal(permission(event,{...state,tools:[{...descriptor,annotations:{readOnlyHint:false},_meta:{'bos/effect':'read'}}]}),'contradictory_effect_metadata');
 assert.equal(permission(event,{...state,tools:[{...descriptor,annotations:{readOnlyHint:true},_meta:{'bos/effect':'read'}}],allowed_effects:[]}), 'unapproved_effect');
});

test('same-server scope-bound resource listings and nested documents enable discovered reads',()=>{
 const state={handle:'selected',canary:true,kind:'positive',observations:[],resources:[],tools:[]};
 const listed='bos://apps/synthetic/reference?context_handle=selected';
 observe({tool_name:'list_mcp_resources',tool_input:{server:'BOS-Platform'},tool_response:{resources:[{uri:listed},{uri:'bos://apps/synthetic/foreign?context_handle=other'}]}},state);
 assert.equal(permission({tool_name:'read_mcp_resource',tool_input:{server:'BOS-Platform',uri:listed}},state),null);
 assert.ok(!state.resources.some(uri=>uri.includes('foreign')));
 const nested='bos://apps/synthetic/schema';
 observe({tool_name:'read_mcp_resource',tool_input:{server:'BOS-Platform',uri:listed},tool_response:{contents:[{text:JSON.stringify({reference:{uri:nested}})}]}},state);
 assert.equal(permission({tool_name:'read_mcp_resource',tool_input:{server:'BOS-Platform',uri:nested}},state),null);
 observe({tool_name:'list_mcp_resources',tool_input:{server:'Other'},tool_response:{context_handle:'selected',resources:[{uri:'bos://apps/synthetic/wrong-server'}]}},state);
 assert.ok(!state.resources.some(uri=>uri.includes('wrong-server')));
});
test('published BOSL descriptor links inherit observed parent scope and reject foreign or unadvertised reads',()=>{
 const parent='bos://apps/synthetic/root?context_handle=selected';
 const state={handle:'selected',canary:true,kind:'positive',resources:[parent],observations:[]};
 const descriptor={schema_uri:'bos://apps/synthetic/bosl/schema',reference_uri:'bos://apps/synthetic/bosl/reference',examples_uri:'bos://apps/synthetic/bosl/examples'};
 const rejected=[{server:'Other',schema_uri:'bos://apps/synthetic/foreign-server'}, {context_handle:'other',reference_uri:'bos://apps/synthetic/foreign-context'}, {examples_uri:'bos://apps/synthetic/foreign-query?context_handle=other'}, {arbitrary_uri:'bos://apps/synthetic/unadvertised'}];
 observe({tool_name:'read_mcp_resource',tool_input:{server:'BOS-Platform',uri:parent},tool_response:{contents:[{text:JSON.stringify({bosl:descriptor,references:rejected})}]}},state);
 for(const uri of Object.values(descriptor))assert.equal(permission({tool_name:'read_mcp_resource',tool_input:{server:'BOS-Platform',uri}},state),null);
 for(const item of rejected){const uri=Object.values(item).find(value=>value.startsWith('bos://'));assert.ok(!state.resources.includes(uri));assert.equal(permission({tool_name:'read_mcp_resource',tool_input:{server:'BOS-Platform',uri}},state),'undiscovered_resource');}
 assert.equal(permission({tool_name:'read_mcp_resource',tool_input:{server:'Other',uri:descriptor.schema_uri}},state),'undiscovered_resource');
 assert.equal(permission({tool_name:'read_mcp_resource',tool_input:{server:'BOS-Platform',uri:descriptor.schema_uri+'/invented'}},state),'undiscovered_resource');
});
test('unbound listing resources require a selected server default and matching application prefix',()=>{
 const state={handle:'selected',default_scope_selected:false,observations:[],resources:['bos://apps/synthetic/root?context_handle=selected']};
 const event={tool_name:'list_mcp_resources',tool_input:{server:'BOS-Platform'},tool_response:{resources:[{uri:'bos://apps/synthetic/next'}]}};
 observe(event,state);assert.equal(state.resources.length,1);
 state.default_scope_selected=true;observe(event,state);assert.equal(state.resources.length,2);
});

test('nested links explicitly marked with foreign server or context never inherit parent scope',()=>{
 const parent='bos://apps/synthetic/root?context_handle=selected';
 const state={handle:'selected',resources:[parent],observations:[]};
 observe({tool_name:'read_mcp_resource',tool_input:{server:'BOS-Platform',uri:parent},tool_response:{contents:[{text:JSON.stringify({references:[{server:'Other',uri:'bos://apps/synthetic/foreign-server'},{context_handle:'other',uri:'bos://apps/synthetic/foreign-context'},{server:'BOS-Platform',context_handle:'selected',uri:'bos://apps/synthetic/same'}]})}]}},state);
 assert.ok(state.resources.includes('bos://apps/synthetic/same'));
 assert.ok(!state.resources.some(uri=>uri.includes('foreign')));
});

test('provenance hashes preserve original fields before observation sanitization',()=>{
 const state={observations:[],resources:[]};
 const original={organization_id:'synthetic-id',count:1};
 observe({tool_name:'read_mcp_resource',tool_response:{contents:[{text:JSON.stringify(original)}]}},state);
 assert.equal(observedDocument(state.observed_document_digests,original),true);
 assert.equal(observedDocument(state.observed_document_digests,{count:1}),false);
 const filtered={observations:[],resources:[]};
 observe({tool_name:'mcp__Acceptance__read_installed',tool_response:original},filtered);
 assert.equal(observedDocument(filtered.observed_document_digests,original),false);
});

test('failed published prerequisites block reads and exact-bound writes before dispatch',()=>{
 const document={operations:[]};const state={canary:true,handle:'selected',kind:'positive',observations:[],allowed_effects:['read','write','connect'],observed_document_digests:documentDigests(document)};
 const validation={tool_name:'mcp__Acceptance__validate_installed',tool_input:{mode:'app-describe',document},tool_response:{valid:false}};
 observe(validation,state);
 for(const effect of ['read','write','connect']){
  state.tools=[{name:'synthetic.operation',_meta:{'bos/effect':effect},inputSchema:{type:'object'}}];
  state.effect_binding={operation:'synthetic.operation',effect,input_sha256:digest({})};
  assert.equal(permission({tool_name:'mcp__BOS_Platform__bos_execute',tool_input:{context_handle:'selected',tool_name:'synthetic.operation',arguments:{}}},state),'published_prerequisite_failed');
 }
 observe({...validation,tool_input:{mode:'app-describe',document:{operations:[1]}},tool_response:{valid:true}},state);
 assert.equal(Object.values(state.failed_validations).some(Boolean),true);
 observe({...validation,tool_response:{valid:true}},state);
 assert.equal(state.validated_contracts['app-describe'],documentDigests(document)[0]);
});

test('native reviewer authority requires structured exact scope before execution',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'native-authority-test-'));
 try{
  const file=join(directory,'authority.json');const config={synthetic_only:true,reviewer_login_url:'https://dfsm.ai/synthetic',review_organization:'Synthetic',review_application:'App',review_installation:'Installation',review_role:'Reviewer',fixture_authority_file:file};
  const authority={...config,schema:'synthetic-reviewer-authority/v1'};delete authority.fixture_authority_file;
  async function write(value){const bytes=JSON.stringify(value);await writeFile(file,bytes);config.fixture_authority_sha256=digest(value);const {createHash}=await import('node:crypto');config.fixture_authority_sha256=createHash('sha256').update(bytes).digest('hex');}
  await write(authority);assert.equal((await verifyNativeReviewer(config)).verified,true);
  for(const field of ['reviewer_login_url','review_organization','review_application','review_installation','review_role']){await write({...authority,[field]:'Other'});await assert.rejects(verifyNativeReviewer(config));await write({...authority,[field]:undefined});await assert.rejects(verifyNativeReviewer(config));}
  await write('synthetic '+config.review_organization+' '+config.reviewer_login_url);await assert.rejects(verifyNativeReviewer(config));
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('native diagnostic classification retains no raw provider content',()=>{
 assert.equal(classifyNativeFailure({type:'error',message:'This content was flagged for possible cybersecurity risk. token=synthetic-secret user@example.invalid'}),'native_host_policy_rejection');
 assert.equal(classifyNativeFailure({type:'turn.failed',error:{message:'Rate limit exceeded'}}),'native_rate_limit');
 assert.equal(classifyNativeFailure({type:'error',message:'Invalid access token'}),'native_authentication_failure');
 assert.equal(classifyNativeFailure({type:'error',message:'Unexpected upstream failure'}),'native_request_failed');
 assert.equal(classifyNativeFailure({type:'item.completed',message:'This content was flagged for possible cybersecurity risk'}),null);
});

test('negative refusal status passes only after all other acceptance gates pass',()=>{
 assert.deepEqual(classifyCompletion('negative','blocked',[]),{status:'PASS',reason:''});
 assert.deepEqual(classifyCompletion('negative','completed',[]),{status:'PASS',reason:''});
 for(const reason of ['configured_outcome_failed','negative_native_invocation','guard_unverified']) {
  assert.deepEqual(classifyCompletion('negative','blocked',[reason]),{status:'FAIL',reason});
 }
 for(const kind of ['starter','positive']) {
  assert.deepEqual(classifyCompletion(kind,'blocked',[]),{status:'FAIL',reason:'product_prerequisite'});
  assert.deepEqual(classifyCompletion(kind,'completed',[]),{status:'PASS',reason:''});
 }
 const existing=['configured_outcome_failed'];classifyCompletion('positive','blocked',existing);
 assert.deepEqual(existing,['configured_outcome_failed']);
});

test('readiness reviewer receives only the exact read-only context and discovery tools',()=>{
 const tools={definitions:['bos_get_context','bos_context_provider_status','bos_list_plugin_services','bos_control_discover','bos_https_operation','acceptance_validate_installed','acceptance_read_installed'].map(name=>({name}))};
 assert.deepEqual(reviewerToolsForCase({id:'starter-3'},tools).definitions.map(row=>row.name),['bos_get_context','bos_context_provider_status','bos_list_plugin_services','bos_control_discover','acceptance_read_installed']);
 assert.deepEqual(reviewerToolsForCase({id:'starter-2'},tools).definitions.map(row=>row.name),['bos_get_context','bos_control_discover']);
 assert.equal(reviewerToolsForCase({id:'positive-1'},tools),tools);
});

test('starter instructions derive readiness from current discovery and keep other cases bounded',()=>{
 const base=JSON.stringify({instructions:'generic'});
 const readiness=JSON.parse(reviewerInstructionsForCase(base,{id:'starter-3'})).instructions;
 assert.match(readiness,/current validated app description and service catalog/);
 assert.match(readiness,/derive operation selection, readiness, and prerequisites only from the current catalog and responses/);
 assert.match(readiness,/original source timestamps/);
 assert.match(readiness,/exact reference_time/);
 assert.match(readiness,/no service rows were returned/);
 assert.match(readiness,/discovery\.refresh/);
 assert.match(readiness,/When current observations conflict/);
 assert.match(readiness,/dedicated bos_context_provider_status host wrapper/);
 assert.match(readiness,/Only after that successful validation/);
 const changedReadiness=JSON.parse(reviewerInstructionsForCase(JSON.stringify({instructions:'generic',readiness_declarations:{gmail:'ready',calimatic:'disabled',google_drive:'configuration_required'}}),{id:'starter-3'})).instructions;
 assert.equal(changedReadiness,readiness);
 assert.doesNotMatch(changedReadiness,/configuration_required|journey_runtime|gmail\.attachments\.read|Calimatic/);
 const apps=JSON.parse(reviewerInstructionsForCase(base,{id:'starter-1'})).instructions;
 assert.match(apps,/Immediately call bos_get_context/);
 assert.match(apps,/references\/discovery-contract\.md/);
 assert.match(apps,/do not claim or mention Front Desk access/);
 const inventory=JSON.parse(reviewerInstructionsForCase(base,{id:'starter-2'})).instructions;
 assert.match(inventory,/do not state a numerical total/);
 assert.match(inventory,/Do not state that Front Desk exists/);
 assert.equal(JSON.parse(reviewerInstructionsForCase(base,{id:'positive-1'})).instructions,'generic');
});


test('business-case proof requires successful scoped deterministic HTTPS and exact semantic evidence', async()=>{
 const {reviewerResponses,caseResponseFailures}=await import('../scripts/marketplace-native-run.mjs');
 const item={requires_business_https:true,expected_semantic_operations:[{operation:'students.read',transport:'deterministic_https'}]};
 const observed={tool:'students.read',response:{body:{students:[{name:'Synthetic Student'}]}},scope_verified:true,is_error:false,transport:'https'};
 assert.deepEqual(caseResponseFailures(item,reviewerResponses([observed])),[]);
 for(const changed of [{transport:undefined},{transport:'https-discovery'},{scope_verified:false},{is_error:true},{tool:'search'}])assert.ok(caseResponseFailures(item,reviewerResponses([{...observed,...changed}])).length>0);
 assert.equal(reviewerResponses([{tool:'bos.execute',input:{tool_name:'plugins.list'},scope_verified:true,response:{plugins:[]}}])[0].operation,'plugins.list');
});

test('the expected Calimatic setup error is allowed only for its exact operation',async()=>{
 const {reviewerResponses,caseResponseFailures,expectedErrorObservation}=await import('../scripts/marketplace-native-run.mjs');
 const item={expected_error_operations:['education_center_list_enrollments']};
 const providerError={provider_error_code:'provider_authorization_required',status:'authorization_required',required_authorizations:[{authorization_kind:'api_key',status:'configuration_required',authorization_url:'https://dfsm.ai/api/v1/mcp/provider-recovery?[query redacted]'}]};
 const expected={tool:'education_center_list_enrollments',transport:'https',scope_verified:true,is_error:true,response:{status:401,body:{result:{error:providerError}}}};
 const resource='https://dfsm.ai/mcp/apps/education-center/platform';
 const other={...expected,tool:'education_center_search_students'};
 assert.equal(expectedErrorObservation(item,expected,resource),true);
 assert.equal(expectedErrorObservation(item,other,resource),false);
 assert.deepEqual(caseResponseFailures(item,reviewerResponses([expected],resource)),[]);
 assert.equal(expectedErrorObservation(item,{...expected,scope_verified:false},resource),false);
 assert.equal(expectedErrorObservation(item,{...expected,response:{status:401,body:{result:{error:{status:'authorization_required'}}}}},resource),false);
 for(const authorization_url of ['https://foreign.example.invalid/collect-key','http://dfsm.ai/api/v1/mcp/provider-recovery','not a url']) {
  const invalid={...expected,response:{status:401,body:{result:{error:{...providerError,required_authorizations:[{...providerError.required_authorizations[0],authorization_url}]}}}}};
  assert.equal(expectedErrorObservation(item,invalid,resource),false,authorization_url);
  assert.ok(caseResponseFailures(item,reviewerResponses([invalid],resource)).includes('expected_error_response_missing'));
 }
 assert.ok(caseResponseFailures(item,reviewerResponses([other],resource)).includes('expected_error_response_missing'));
 assert.ok(caseResponseFailures(item,reviewerResponses([expected,expected],resource)).includes('expected_error_response_missing'));
 assert.ok(caseResponseFailures(item,reviewerResponses([expected,{...expected,is_error:false,response:{rows:[{student:'Synthetic'}]}}],resource)).includes('expected_error_response_missing'));
 assert.ok(caseResponseFailures(item,reviewerResponses([expected,{...expected,tool:'education_center_search_students'}],resource)).includes('unexpected_error_response'));
});

test('failed native receipts retain only completed session and binding proofs with closed diagnostics',async()=>{
 const {failedNativeCaseReceipt}=await import('../scripts/marketplace-native-run.mjs');
 const base={product:'bos',id:'negative-3',release_commit:'published'};
 const session={evidence:{reviewer_url_sha256:'actual-url-hash',reviewer_login_http_status:200,authentication_source:'exact_reviewer_entry_consent_pkce',isolated_connection:true,access_token:'secret'}};
 const failed=failedNativeCaseReceipt(base,session,true,new Error('reviewer_model_failed'),3210);
 assert.deepEqual(failed,{...base,reviewer_url_sha256:'actual-url-hash',reviewer_login_http_status:200,authentication_source:'exact_reviewer_entry_consent_pkce',isolated_connection:true,bos_binding_provenance_verified:true,elapsed_ms:3210,status:'FAIL',reason:'reviewer_model_failed'});
 const beforeBinding=failedNativeCaseReceipt(base,null,false,new Error('private secret details'));
 assert.deepEqual(beforeBinding,{...base,status:'FAIL',reason:'native_execution_or_prerequisite_failed'});
 assert.equal(Object.hasOwn(beforeBinding,'authentication_source'),false);
 assert.equal(Object.hasOwn(beforeBinding,'bos_binding_provenance_verified'),false);
 assert.equal(failedNativeCaseReceipt(base,null,true,{code:'reviewer_consent_unavailable'}).reason,'reviewer_consent_unavailable');
 assert.equal(failedNativeCaseReceipt(base,null,false,{code:'reviewer_arbitrary_secret'}).reason,'native_execution_or_prerequisite_failed');
});

test('aggregate diagnostics preserve bounded failure categories and reject arbitrary error strings',async()=>{
 const {reviewerObservationFailures,reviewerFailureCode,reviewerErrorDiagnostic,reviewerErrorMetadata}=await import('../scripts/marketplace-reviewer-diagnostics.mjs');
 assert.deepEqual(reviewerObservationFailures([{is_error:true,response:{reason:'reviewer_validator_mode_unsupported'}},{is_error:true,response:{reason:'reviewer_validator_mode_unsupported'}},{is_error:true,response:{reason:'reviewer_app_description_validation_missing'}},{is_error:true,response:{reason:'reviewer_app_description_validation_mismatch'}},{is_error:true,response:{reason:'reviewer_prior_validation_failed'}},{is_error:true,response:{reason:'token private secret'}},{response:{valid:false,diagnostic:'private secret'}}]),['reviewer_validator_mode_unsupported','reviewer_app_description_validation_missing','reviewer_app_description_validation_mismatch','reviewer_prior_validation_failed','reviewer_tool_failed','reviewer_validation_failed']);
 assert.equal(reviewerFailureCode(new Error('reviewer_describe_response_invalid')),'reviewer_describe_response_invalid');
 assert.equal(reviewerFailureCode(new Error('reviewer_describe_response_invalid secret')),'reviewer_tool_failed');
 assert.equal(reviewerFailureCode({code:'reviewer_model_output_invalid'}),'reviewer_model_output_invalid');
 assert.deepEqual(reviewerErrorDiagnostic(new Error('The BOS dependency transport failed')),{error_category:'reviewer_error',error_code_present:true,error_code:'bos_dependency_transport_failed'});
 const adapterError=new Error('private adapter message');adapterError.name='BosDependencyAdapterError';
 assert.deepEqual(reviewerErrorDiagnostic(adapterError),{error_category:'reviewer_error',error_code_present:true,error_code:'bos_dependency_adapter_error'});
 assert.deepEqual(reviewerErrorDiagnostic(new TypeError('private schema value')),{error_category:'reviewer_error',error_code_present:true,error_code:'bos_request_validation_error'});
 assert.deepEqual(reviewerErrorDiagnostic(new TypeError('discovered operation request does not match the immutable public schema')),{error_category:'reviewer_error',error_code_present:true,error_code:'bos_discovered_request_schema_mismatch'});
 assert.deepEqual(reviewerErrorDiagnostic(new TypeError('returned action payload does not match payload_schema')),{error_category:'reviewer_error',error_code_present:true,error_code:'bos_discovered_payload_schema_mismatch'});
 assert.deepEqual(reviewerErrorMetadata({error_category:'reviewer_error',error_code_present:true,error_code:'bos_discovered_request_schema_mismatch',operation:'calendar_search_events',method:'GET',payload_supplied:true,payload_schema_status:'invalid',payload_schema_error_count:2,payload_schema_keywords:['required','private-arbitrary','type'],http_status:422,content_type_category:'json',response_body_is_object:true,response_body_error_present:true,response_body_result_present:false,output_schema_valid:false,private_value:'do-not-retain'}),{error_category:'reviewer_error',error_code_present:true,error_code:'bos_discovered_request_schema_mismatch',operation:'calendar_search_events',method:'GET',payload_supplied:true,payload_schema_status:'invalid',payload_schema_error_count:2,payload_schema_keywords:['required','type'],http_status:422,content_type_category:'json',response_body_is_object:true,response_body_error_present:true,response_body_result_present:false,output_schema_valid:false});
 assert.deepEqual(reviewerErrorDiagnostic(new Error('private arbitrary error')),{error_category:'unrecognized_error',error_code_present:false});
});


test('installed acceptance exposes exactly its supported validator modes and rejects unknown modes',async()=>{
 const tools=createInstalledAcceptance({},async()=>({}));
 assert.deepEqual(tools.list.find(row=>row.name==='validate_installed').inputSchema.properties.mode.enum,installedValidatorModes);
 assert.equal(installedValidatorModes.length,9);
 await assert.rejects(tools.call('validate_installed',{mode:'unknown'}),{message:'reviewer_validator_mode_unsupported'});
});

test('negative grading permits exact local governance evidence and rejects every discovery or business trace before model execution',async()=>{
 const {negativeEvidenceAllowed,judgeEvidence}=await import('../scripts/marketplace-native-run.mjs');
 const empty={native_tools:[],observations:[],denials:[]};
 const permitted={native_tools:['acceptance_guard_probe','acceptance_guard_status','acceptance_read_installed'].map(tool=>({server:'Acceptance',tool})),observations:[{tool:'guard.status',is_error:false,response:{ready:true}},{tool:'read.installed',is_error:false,response:{text:'Published synthetic governance'}}],denials:[{reason:'guard_canary_denied'}]};
 assert.equal(negativeEvidenceAllowed(empty),true);assert.equal(negativeEvidenceAllowed(permitted),true);
 const invalid=[{...permitted,native_tools:[{server:'Acceptance',tool:'bos_get_context'}]},{...permitted,native_tools:[{server:'Acceptance',tool:'acceptance_bos_execute'}]},{...permitted,native_tools:[{server:'Acceptance',tool:'acceptance_validate_installed'}]},{...permitted,native_tools:[{server:'BOS-Platform',tool:'acceptance_read_installed'}]},{...permitted,native_tools:[{server:'reviewer-test-host',tool:'bos_https_operation'}]},{...permitted,observations:[{tool:'bos.get.context',is_error:false}]},{...permitted,observations:[{tool:'guard.status',is_error:true}]},{...permitted,observations:[{tool:'read.installed',is_error:false,response:{valid:false}}]},{...permitted,observations:[{tool:'read.installed',is_error:'false'}]},{...permitted,denials:[{reason:'negative_case_business_call'}]},{...permitted,native_tools:null},{...permitted,observations:null},{...permitted,denials:null},{...permitted,native_tools:[null]},{...permitted,observations:[null]},{...permitted,denials:[null]}];
 for(const evidence of invalid){assert.equal(negativeEvidenceAllowed(evidence),false);assert.deepEqual(await judgeEvidence(evidence,{kind:'negative'},null,null,null),{pass:false,missing:['negative_case_unapproved_invocation']});}
 // Eligibility retains semantic grading; it never establishes an actual case PASS.
 assert.equal(negativeEvidenceAllowed(null),false);
});

test('independent grading retries one native process failure with the unchanged evidence',async()=>{
 const {judgeEvidence}=await import('../scripts/marketplace-native-run.mjs');
 const directory=await mkdtemp(join(tmpdir(),'reviewer-grade-retry-'));
 try{
  const inputs=[],calls=[];
  const runCodexImpl=async(args,input,timeout)=>{
   inputs.push(input);calls.push(timeout);
   if(inputs.length===1)return {failure:'native_process_failed',code:1,signal:null,elapsed_ms:2,stderr_bytes_retained:12,stderr_truncated:false,stderr_classification:null};
   const outputPath=args[args.indexOf('--output-last-message')+1];
   await writeFile(outputPath,JSON.stringify({pass:true,missing:[]}));
   return {failure:null,code:0,signal:null,elapsed_ms:2,stderr_bytes_retained:0,stderr_truncated:false,stderr_classification:null};
  };
  const result=await judgeEvidence({native_tools:[],observations:[],denials:[]},{kind:'negative',prompt:'A synthetic unrelated request',expected:'No BOS call'}, {description:'BOS'},'synthetic-model',directory,runCodexImpl);
  assert.deepEqual(result,{pass:true,missing:[]});
  assert.equal(inputs.length,2);assert.equal(inputs[0],inputs[1]);assert.deepEqual(calls,[120000,120000]);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('grading context retains the exact assertion clock and original source observations while containing private scope identifiers',async()=>{
 const {withGradingContext}=await import('../scripts/marketplace-native-run.mjs');
 const observations=[{tool:'records.search',response:{observed_at:'2026-10-03T12:00:00.123456Z'},is_error:false}];
 const evidence={answer:'Synthetic answer',observations,denials:[],native_tools:[]};
 const referenceTime='2026-10-03T12:00:01.123Z',scope={organization_name:'Synthetic',application_name:'Synthetic App',installation_name:'Synthetic Installation',role_label:'Reviewer',context_handle:'private-handle',access_token:'private-token',url:'https://private.invalid'};
 const result=withGradingContext(evidence,{referenceTime,scope,scopeVerified:true,bindingVerified:true,bos:{release_commit:'published',package_sha256:'actual-package-hash',url:'https://private.invalid'}});
 assert.equal(result.evaluation_reference_time,referenceTime);assert.equal(result.observations,observations);assert.equal(result.observations[0].response.observed_at,'2026-10-03T12:00:00.123456Z');
 assert.deepEqual(result.reviewer_scope,{organization_name:'Synthetic',application_name:'Synthetic App',installation_name:'Synthetic Installation',role_label:'Reviewer',verified:true,resolution_basis:'explicit_review_fixture_scope',preference_read_performed:false});
 assert.deepEqual(result.bos_binding,{verified:true,release_commit:'published',package_sha256:'actual-package-hash'});assert.doesNotMatch(JSON.stringify(result),/private-handle|private-token|private.invalid/);assert.equal(Object.hasOwn(evidence,'evaluation_reference_time'),false);
 const failed=withGradingContext(evidence,{referenceTime,scope,scopeVerified:false,bindingVerified:false,bos:{}});assert.equal(failed.reviewer_scope.verified,false);assert.equal(failed.bos_binding.verified,false);
});

test('grading clock uses the latest successful valid reviewer guard observation',()=>{
 const observations=[
  {tool:'guard.status',response:{ready:true,reference_time:'2026-10-03T12:00:00.000Z',reference_time_source:'reviewer_host_utc_clock'}},
  {tool:'guard.status',is_error:true,response:{ready:false,reference_time:'2026-10-03T12:01:00.000Z',reference_time_source:'reviewer_host_utc_clock'}},
  {tool:'guard.status',response:{ready:true,reference_time:'2026-10-03T12:02:00.000Z',reference_time_source:'reviewer_host_utc_clock'}}
 ];
 assert.equal(latestReviewerClockReference(observations),'2026-10-03T12:02:00.000Z');
 assert.equal(latestReviewerClockReference([...observations,{tool:'guard.status',response:{ready:true,reference_time:'2026-10-03T12:03:00.000Z',reference_time_source:'untrusted'}}]),'2026-10-03T12:02:00.000Z');
 assert.equal(latestReviewerClockReference([{tool:'guard.status',response:{ready:true,reference_time:'2026-02-30T12:00:00.000Z',reference_time_source:'reviewer_host_utc_clock'}}]),undefined);
 assert.equal(latestReviewerClockReference([{tool:'guard.status',response:{ready:false,reference_time:'2026-10-03T12:00:00.000Z',reference_time_source:'reviewer_host_utc_clock'}}]),undefined);
});

test('reviewer instructions require validated HTTPS Describe before schema comparison helpers',async()=>{
 const runner=await readFile(new URL('../scripts/marketplace-native-run.mjs',import.meta.url),'utf8');
 const describeCall=apiContractReviewerGuidance.indexOf('call bos_https_describe');
 const schemaHelper=apiContractReviewerGuidance.indexOf('Use acceptance_compare_schemas only');
 assert.ok(describeCall>=0&&schemaHelper>describeCall);
 assert.match(apiContractReviewerGuidance,/read the exact advertised app\.describe resource with bos_read_resource, validate it with acceptance_validate_installed mode app-describe, then call bos_https_describe/i);
 assert.match(apiContractReviewerGuidance,/app-level app\.describe resource and semantic app\.describe operation are never operation-level HTTPS evidence/i);
 assert.match(apiContractReviewerGuidance,/required or optional fields, effects, bounds, limits, pagination, or errors/i);
 assert.ok(runner.indexOf('instructions:apiContractReviewerGuidance+')<runner.indexOf('acceptance_compare_schemas compares retained schema pointers'));
});

test('My CRM positive-1 interprets null HTTP transport from its validated execution contract',()=>{
 const context=JSON.parse(reviewerInstructionsForCase(JSON.stringify({product:'my-crm',instructions:'Base instructions'}),{product:'my-crm',id:'positive-1'}));
 assert.match(context.instructions,/execution\.transport:null with a non-null HTTP method and URI as HTTP execution/);
 assert.match(context.instructions,/use each exact advertised contact_id with bos_https_operation/);
 const unrelated=JSON.parse(reviewerInstructionsForCase(JSON.stringify({product:'my-crm',instructions:'Base instructions'}),{product:'my-crm',id:'positive-2'}));
 assert.doesNotMatch(unrelated.instructions,/transport:null/);
});
