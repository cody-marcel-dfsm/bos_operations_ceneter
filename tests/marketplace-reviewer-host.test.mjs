import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnection} from 'node:net';
import {mkdtemp,writeFile,rm,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {serveReviewerHost,reviewerHostReceipt} from '../scripts/marketplace-reviewer-host.mjs';
import {digest} from '../scripts/marketplace-prompt-catalog.mjs';
import {reviewerConfigurationDigest} from '../scripts/marketplace-native-run.mjs';

test('host preserves the exact legacy receipt and keeps diagnostics private',()=>{
  const item={prompt:'Exact configured prompt'},catalog={configuration_sha256:'current-configuration'};
  const receipt={status:'FAIL',reason:'configured_outcome_failed',fixture_outcome_verified:true,independent_grading_verified:false,grant_cleanup_verified:true};
  const result={...receipt,diagnostics:{completion_reason:'Synthetic diagnostic',evaluation_missing:['Required evidence absent']}};
  assert.deepEqual(reviewerHostReceipt(result,item,catalog),{...receipt,prompt_sha256:digest(item.prompt),configuration_sha256:catalog.configuration_sha256});
  assert.equal(Object.hasOwn(result,'diagnostics'),true);
});

test('private test capability binds the configured reviewer, exact case and independently checked release',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'reviewer-host-unit-'));let host;
  try {
    const authority={schema:'synthetic-reviewer-authority/v1',synthetic_only:true,reviewer_login_url:'https://dfsm.ai/app?entry=openai&org_id=synthetic',review_organization:'Synthetic',review_application:'Synthetic App',review_installation:'Synthetic Installation',review_role:'Reviewer'};
    const bytes=JSON.stringify(authority),file=join(directory,'authority.json');await writeFile(file,bytes);
    const config={...authority,fixture_authority_file:file,fixture_authority_sha256:createHash('sha256').update(bytes).digest('hex')};
    const item={id:'positive-1',prompt:'Exact configured prompt'},configuration={product:'my-crm',cases:[item]},catalog={...configuration,configuration_sha256:digest(configuration)};
    const release={release_commit:'a'.repeat(40),version:'1.0.0',package_sha256:'package'};let calls=0;
    host=await serveReviewerHost(config,{verifyRelease:async()=>release,execute:async(c,i,cfg)=>{calls++;assert.deepEqual(i,item);assert.equal(cfg.reviewer_login_url,authority.reviewer_login_url);return {status:'FAIL',reason:'test_only'};}});
    assert.equal((await lstat(host.socket)).mode&0o077,0);
    const invoke=value=>new Promise((done,reject)=>{const c=createConnection(host.socket);let text='';c.on('error',reject);c.on('connect',()=>c.write(JSON.stringify(value)+'\n'));c.on('data',chunk=>text+=chunk);c.on('end',()=>done(JSON.parse(text)));});
    const request={catalog,item,release_expected:{...release,bos_dependency:release},model:'configured-model',reviewer_url_sha256:createHash('sha256').update(config.reviewer_login_url).digest('hex'),reviewer_configuration_sha256:reviewerConfigurationDigest(config)};
    assert.equal((await invoke(request)).reason,'test_only');assert.equal(calls,1);
    assert.equal((await invoke({...request,reviewer_url_sha256:'wrong'})).reason,'reviewer_host_binding_mismatch');
    assert.equal((await invoke({...request,reviewer_configuration_sha256:reviewerConfigurationDigest({...config,review_role:'Other'})})).reason,'reviewer_host_binding_mismatch');
    assert.equal((await invoke({...request,item:{...item,prompt:'Changed outside config'}})).reason,'reviewer_host_binding_mismatch');
    const changed={...item,prompt:'Substituted in both item and catalogue'};
    assert.equal((await invoke({...request,item:changed,catalog:{...catalog,cases:[changed]}})).reason,'reviewer_host_configuration_mismatch');
    assert.equal((await invoke({...request,release_expected:{...release,release_commit:'b'.repeat(40)}})).reason,'reviewer_host_execution_or_release_failed');
    assert.equal(calls,1);
  }finally{if(host)await host.close();await rm(directory,{recursive:true,force:true});}
});
