import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createReviewerTools,reviewerDiscoveryDocument} from '../scripts/marketplace-reviewer-tools.mjs';
import {syntheticAppDescribe} from './helpers/synthetic-bos-discovery-service.mjs';
import {documentDigests,observedDocument} from '../scripts/marketplace-native-resources.mjs';

const run=promisify(execFile);
const context={context_handle:'bos_ctx_v2_'+'a'.repeat(64),organization_name:'Synthetic',application_name:'Synthetic App',installation_name:'Synthetic Installation',role_label:'Reviewer',is_default:true};
const contact={operation:'search',status:'described',effect:'read',limits:{max_targets:null,max_results_per_source:5,pagination_supported:false,bulk_supported:false,streaming_supported:false,maximum_duration_seconds:30,maximum_fan_out:5},guarantees:{read_consistency:'point_in_time',per_source_atomicity:'source_published',cross_source_atomicity:'not_applicable',convergence:'not_applicable',idempotency:'service_owned'},execution:{context_header:'X-BOS-Context-Handle',method:'POST',uri:'/bos/apps/synthetic/api/v1/organizations/synthetic/search'},input_schema:{$schema:'https://json-schema.org/draft/2020-12/schema',type:'object',additionalProperties:false,required:['text'],properties:{text:{type:'string',minLength:1}},'x-bos-fields':[]},output_schema:{$schema:'https://json-schema.org/draft/2020-12/schema',type:'object',required:['count'],properties:{count:{type:'integer'}},'x-bos-fields':[]},error_contract:{schema:'lead-director-public-error/v1',codes:['invalid_search_request','authentication_required']},sources:[{source:{platform:'bos',application:'synthetic',plugin:'synthetic'},availability:'ready'}]};

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
