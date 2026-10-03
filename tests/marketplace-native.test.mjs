import {verifyNativeReviewer,classifyNativeFailure} from '../scripts/marketplace-native-run.mjs';
import {digest} from '../scripts/marketplace-prompt-catalog.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {permission,observe,sanitized,selectReviewerContext} from '../scripts/marketplace-native-hook.mjs';
import {installedPath,observedDocument,documentDigests} from '../scripts/marketplace-native-resources.mjs';
import {mkdtemp,mkdir,writeFile,rm,symlink,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
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
