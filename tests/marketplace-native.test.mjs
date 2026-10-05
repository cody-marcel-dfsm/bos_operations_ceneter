import {verifyNativeReviewer,classifyNativeFailure,classifyCompletion,caseDiagnostics,httpsDescribeCoverage,reviewerTurnTimeoutMs,latestReviewerClockReference} from '../scripts/marketplace-native-run.mjs';
import {digest,loadPromptCatalog} from '../scripts/marketplace-prompt-catalog.mjs';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {permission,observe,sanitized,selectReviewerContext} from '../scripts/marketplace-native-hook.mjs';
import {installedPath,observedDocument,documentDigests,createInstalledAcceptance,installedValidatorModes} from '../scripts/marketplace-native-resources.mjs';
import {mkdtemp,mkdir,writeFile,rm,symlink,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
test('only the configured full-inventory case receives the longer bounded reviewer turn',async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));
 const catalog=await loadPromptCatalog(root,'bos');
 assert.equal(reviewerTurnTimeoutMs(catalog.cases.find(row=>row.id==='starter-2')),900000);
 assert.equal(reviewerTurnTimeoutMs(catalog.cases.find(row=>row.id==='starter-1')),900000);
 assert.equal(reviewerTurnTimeoutMs({}),300000);
 for(const value of [0,299999,600000,900001,'900000'])assert.throws(()=>reviewerTurnTimeoutMs({reviewer_timeout_ms:value}),/reviewer_turn_timeout_invalid/);
});
test('retained case diagnostics identify failures while removing credentials and private selectors',()=>{
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
test('canary fails closed and observed identity binds the exact selected role',()=>{
 const state={organization:'Synthetic',role:'Reviewer',application:'Synthetic App',installation:'Synthetic Installation',observations:[],denials:[]};
 assert.equal(permission({tool_name:'mcp__BOS_Platform__bos_get_context'},state),'guard_canary_required');
 assert.equal(permission({tool_name:'mcp__Acceptance__guard_probe'},state),'guard_canary_denied');
 observe({tool_name:'mcp__BOS_Platform__bos_get_context',tool_response:{contexts:[{organization_name:'Other',role_label:'Reviewer',context_handle:'wrong'},{organization_name:'Synthetic',role_label:'Reviewer',application_name:'Synthetic App',installation_name:'Synthetic Installation',context_handle:'right'}]}},state);
 assert.equal(state.handle,'right');assert.doesNotMatch(JSON.stringify(state.observations),/context_handle/);
 assert.deepEqual(sanitized({access_token:'secret',value:'safe'}),{value:'safe'});
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


test('business-case proof requires successful scoped deterministic HTTPS and exact semantic evidence', async()=>{
 const {reviewerResponses,caseResponseFailures}=await import('../scripts/marketplace-native-run.mjs');
 const item={requires_business_https:true,expected_semantic_operations:[{operation:'students.read',transport:'deterministic_https'}]};
 const observed={tool:'students.read',response:{body:{students:[{name:'Synthetic Student'}]}},scope_verified:true,is_error:false,transport:'https'};
 assert.deepEqual(caseResponseFailures(item,reviewerResponses([observed])),[]);
 for(const changed of [{transport:undefined},{transport:'https-discovery'},{scope_verified:false},{is_error:true},{tool:'search'}])assert.ok(caseResponseFailures(item,reviewerResponses([{...observed,...changed}])).length>0);
 assert.equal(reviewerResponses([{tool:'bos.execute',input:{tool_name:'plugins.list'},scope_verified:true,response:{plugins:[]}}])[0].operation,'plugins.list');
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
 const {reviewerObservationFailures,reviewerFailureCode}=await import('../scripts/marketplace-reviewer-diagnostics.mjs');
 assert.deepEqual(reviewerObservationFailures([{is_error:true,response:{reason:'reviewer_validator_mode_unsupported'}},{is_error:true,response:{reason:'reviewer_validator_mode_unsupported'}},{is_error:true,response:{reason:'token private secret'}},{response:{valid:false,diagnostic:'private secret'}}]),['reviewer_validator_mode_unsupported','reviewer_tool_failed','reviewer_validation_failed']);
 assert.equal(reviewerFailureCode(new Error('reviewer_describe_response_invalid')),'reviewer_describe_response_invalid');
 assert.equal(reviewerFailureCode(new Error('reviewer_describe_response_invalid secret')),'reviewer_tool_failed');
 assert.equal(reviewerFailureCode({code:'reviewer_model_output_invalid'}),'reviewer_model_output_invalid');
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
