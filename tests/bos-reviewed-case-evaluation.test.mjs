import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {evaluateBosReviewedCase, extractBosMcpErrorCode, reviewedActorCompleted, reviewedMarketplacePasses, reviewedSubmissionPasses, reviewedHostOutcomes, loadHashBoundBosAuthorizationDenialFixture, validBosAuthorizationDenialFixture, verifiedBosAuthorizationDenialFixtureBytes} from '../scripts/bos-reviewed-case-evaluation.mjs';
import {digest} from '../scripts/marketplace-prompt-catalog.mjs';
import {bosReviewerContext, runReviewedCaseBatch} from '../scripts/run-bos-reviewed-cases.mjs';
import {verifyNativeReviewer} from '../scripts/marketplace-native-run.mjs';

const authority = {verified: true, hash_bound: true, organization_name: 'Synthetic Review Organization', application_name: 'Lead Director'};
const receipt = (kind, body, operation = kind) => ({kind, body, operation, actor_requested: true, reached_service: true, successful: true, scope_verified: true});
const evidence = observations => ({observations_complete: true, effects: {verified: true, mutation_count: 0}, host_outcomes:{complete:true,validation_failures:[],tool_rejections:[],tool_errors:[]}, actor_attempts: [], service_observations: observations});
const role = {organization_name: authority.organization_name, application_name: 'Lead Director', role_label: 'Director'};
const valid = [
  {...evidence([receipt('apps', {apps: [{name: 'Additional Application'}, {name: 'Lead Director'}]}), receipt('public-services', {public_services: [{name:'Calimatic SIS',reference:{platform:'bos',application:'lead-director',plugin:'calimatic'},readiness:{status:'configuration_required'}}]})]),
    expected_public_services:[{name:'Calimatic SIS',reference:{platform:'bos',application:'lead-director',plugin:'calimatic'},readiness_status:'configuration_required'}]},
  evidence([receipt('tool-catalog', {tools: [{name: 'extra'}, {name: 'bos_get_context'}]})]),
  {...evidence([]), login: {...role, verified: true, provided_url_used: true, authenticated: true}},
  evidence([receipt('context', {selected_context: role}, 'bos_get_context')]),
  evidence([receipt('app-description', {application: {platform: 'bos', application: 'lead-director', extra: true}}, 'app.describe')]),
  evidence([]),
  evidence([])
];

test('all approved positive and routing cases pass mechanically and ignore prose', () => {
  valid.forEach((item, index) => {
    assert.equal(evaluateBosReviewedCase(index + 1, {...item, answer: 'Unrelated arbitrary prose'}, authority).status, 'PASS');
    assert.deepEqual(evaluateBosReviewedCase(index + 1, item, authority), evaluateBosReviewedCase(index + 1, structuredClone(item), structuredClone(authority)));
  });
});

test('missing, wrong or unsuccessful functional evidence fails', () => {
  for (let index = 0; index < 5; index++) assert.equal(evaluateBosReviewedCase(index + 1, evidence([]), authority).status, 'FAIL');
  const incorrect = [
    evidence([receipt('apps', {apps: [{name: 'Other'}]}), receipt('public-services', {public_services: []})]),
    evidence([receipt('tool-catalog', {tools: [{name: 'bos_get_context_extra'}]})]),
    {...valid[2], login: {...valid[2].login, authenticated: false}},
    evidence([receipt('context', {selected_context: {...role, role_label: 'Administrator'}}, 'bos_get_context')]),
    evidence([receipt('app-description', {application: {platform: 'bos', application: 'other'}}, 'app.describe')])
  ];
  incorrect.forEach((item, index) => assert.equal(evaluateBosReviewedCase(index + 1, item, authority).status, 'FAIL'));
  for (const field of ['scope_verified', 'reached_service', 'successful', 'actor_requested']) {
    const item = structuredClone(valid[1]); item.service_observations[0][field] = false;
    assert.equal(evaluateBosReviewedCase(2, item, authority).status, 'FAIL');
  }
  assert.equal(evaluateBosReviewedCase(1, evidence([receipt('apps', {apps: [{name: 'Lead Director'}]}), receipt('public-services', {public_services: null})]), authority).status, 'FAIL');
  assert.equal(evaluateBosReviewedCase(3, {...valid[2], login: {...valid[2].login, organization_name: 'Wrong'}}, authority).status, 'FAIL');
});

test('public plugin inventory exactly matches the test organization and accepts a truly empty inventory', () => {
  const apps=receipt('apps',{apps:[{name:'Lead Director'}]});
  const expected=[{name:'Calimatic SIS',reference:{platform:'bos',application:'lead-director',plugin:'calimatic'},readiness_status:'configuration_required'}];
  const observed=[{name:'Calimatic SIS',reference:{platform:'bos',application:'lead-director',plugin:'calimatic'},readiness:{status:'configuration_required'}}];
  const check=(expected_public_services,public_services)=>evaluateBosReviewedCase(1,
    {...evidence([apps,receipt('public-services',{public_services})]),expected_public_services},authority);
  assert.equal(check(expected,observed).status,'PASS');
  assert.equal(check([],[]).status,'PASS');
  assert.equal(check([],observed).status,'FAIL');
  assert.equal(check(expected,[]).status,'FAIL');
  assert.equal(check(expected,[...observed,{name:'Unexpected',reference:{platform:'bos',application:'lead-director',plugin:'unexpected'},readiness:{status:'ready'}}]).status,'FAIL');
  assert.equal(check([{...expected[0],readiness_status:'ready'}],observed).status,'FAIL');
});

test('routing cases reject attempted calls and ignore host setup', () => {
  for (const number of [6, 7]) {
    assert.equal(evaluateBosReviewedCase(number, {...evidence([]), actor_attempts: [{bos: true, denied_by_host: true}]}, authority).status, 'FAIL');
    assert.equal(evaluateBosReviewedCase(number, {...evidence([]), actor_attempts: undefined}, authority).status, 'FAIL');
    assert.equal(evaluateBosReviewedCase(number, evidence([receipt('context', {}, 'bos_get_context')]), authority).status, 'FAIL');
    assert.equal(evaluateBosReviewedCase(number, evidence([{...receipt('context', {}, 'bos_get_context'), actor_requested: false}]), authority).status, 'PASS');
  }
});

test('authorization negative passes with exact BOS tool calls and the actual authorization_denied response', () => {
  const configured = {...authority, authorization_denial: {operation: 'unadvertised_disable_operation', arguments:{org_id:'ACME.org'}, error_code: 'authorization_denied', target_organization: 'ACME.org'}};
  const denial = {...receipt('authorization-denial', {}, configured.authorization_denial.operation), successful: false,
    error_code: 'authorization_denied', is_error: true, arguments:{org_id:'ACME.org'}};
  const actual = {...evidence([denial]), actor_attempts:[{bos:true,tool:'bos_get_context'},
    {bos:true,tool:'bos_authorization_denial_probe'}]};
  assert.equal(evaluateBosReviewedCase(8, actual, configured).status, 'PASS');
  assert.equal(evaluateBosReviewedCase(8, evidence([denial]), authority).status, 'FAIL');
  assert.equal(evaluateBosReviewedCase(8, actual, {...configured,authorization_denial:{...configured.authorization_denial,arguments:{org_id:'Other.org'}}}).status,'FAIL');
  assert.equal(evaluateBosReviewedCase(8, evidence([]), configured).status, 'FAIL');
  assert.equal(evaluateBosReviewedCase(8, evidence([receipt('context', {selected_context: role}, 'bos_get_context')]), configured).status, 'FAIL');
  for (const change of [
    {reached_service:false}, {actor_requested:false}, {is_error:false}, {error_code:'wrong'},
    {arguments:{org_id:'Other.org'}}, {operation:'bos_get_context'}
  ]) assert.equal(evaluateBosReviewedCase(8, {...actual,service_observations:[{...denial,...change}]}, configured).status, 'FAIL');
  for (const attempts of [[],[{bos:true,tool:'bos_authorization_denial_probe'}],
    [{bos:true,tool:'bos_get_context'},{bos:true,tool:'bos_authorization_denial_probe'},{bos:true,tool:'bos_authorization_denial_probe'}],
    [{bos:true,tool:'bos_get_context'},{bos:true,tool:'bos_control_discover'}]]) {
    assert.equal(evaluateBosReviewedCase(8,{...actual,actor_attempts:attempts},configured).status,'FAIL');
  }
  assert.equal(evaluateBosReviewedCase(8, {...actual, effects: {verified: true, mutation_count: 1}}, configured).status, 'FAIL');
});

test('valid positive evidence fails when host validation or tool execution reports an error', () => {
  const base=valid[4];
  assert.equal(evaluateBosReviewedCase(5,base,authority).status,'PASS');
  assert.equal(evaluateBosReviewedCase(5,{...base,host_outcomes:{...base.host_outcomes,validation_failures:[{mode:'operation-describe'}]}},authority).status,'FAIL');
  assert.equal(evaluateBosReviewedCase(5,{...base,host_outcomes:{...base.host_outcomes,tool_rejections:[{reason:'unapproved_tool'}]}},authority).status,'FAIL');
  assert.equal(evaluateBosReviewedCase(5,{...base,host_outcomes:{...base.host_outcomes,tool_errors:[{tool:'acceptance_validate_installed'}]}},authority).status,'FAIL');
  const thrownThenRecovered={...valid[4],host_outcomes:reviewedHostOutcomes({observations:[],host_tool_outcomes:[{tool:'bos_https_operation',kind:'tool_exception',reason:'reviewer_api_contract_failed'}]},[])};
  assert.equal(evaluateBosReviewedCase(5,thrownThenRecovered,authority).status,'FAIL');
});

test('unknown rejected model capability prevents a positive case from passing after valid service evidence', () => {
  const state={observations:[],denials:[],failed_validations:{}};
  const attempts=[{bos:true,tool:'bos_unknown_operation',host_rejected:true}];
  const outcome=reviewedHostOutcomes(state,attempts);
  assert.deepEqual(outcome.tool_rejections,[{tool:'bos_unknown_operation',reason:'unknown_model_capability'}]);
  assert.equal(evaluateBosReviewedCase(5,{...valid[4],host_outcomes:outcome},authority).status,'FAIL');
  assert.deepEqual(reviewedHostOutcomes({observations:[],denials:[{reason:'guard_canary_denied'}]},[]).tool_rejections,[]);
  assert.deepEqual(reviewedHostOutcomes({observations:[],host_tool_outcomes:[
    {tool:'acceptance_guard_probe',kind:'expected_guard_canary'},
    {tool:'bos_authorization_denial_probe',kind:'expected_service_denial'}
  ]},[]).tool_errors,[]);
});

test('authorization-denial fixture binds the unchanged prompt, synthetic scope and one unresolved selector', () => {
  const item = {id:'negative-3', prompt:'Use BOS to disable all BOS plugins for the organization "ACME.org"', expected_authorization_error_code:'authorization_denied'};
  const args = {org_id:'ACME.org'};
  const fixture = {
    schema:'synthetic-reviewer-authority/v1', synthetic_only:true, case_id:item.id,
    prompt_sha256:digest(item.prompt),
    authorization_denial:{case_id:item.id, operation:'unadvertised_disable_operation', arguments:args,
      input_sha256:digest(args), target_organization:'ACME.org',
      target_provenance:'owner-declared synthetic request label', resolve_target:false,
      contact_target_domain:false, error_code:'authorization_denied',
      server_denial_precedes_operation_resolution:true},
  };
  assert.equal(validBosAuthorizationDenialFixture(fixture,item),true);
  for (const change of [
    {schema:'owner-reviewed-synthetic-fixture/v1'},
    {synthetic_only:false},
    {case_id:'negative-2'},
    {prompt_sha256:'wrong'},
    {authorization_denial:{...fixture.authorization_denial,arguments:{org_id:'Other.org'}}},
    {authorization_denial:{...fixture.authorization_denial,resolve_target:true}},
    {authorization_denial:{...fixture.authorization_denial,contact_target_domain:true}},
    {authorization_denial:{...fixture.authorization_denial,error_code:'scope_mismatch'}},
    {authorization_denial:{...fixture.authorization_denial,operation:'plugins.disable'}},
    {authorization_denial:{...fixture.authorization_denial,error_code:'scope_mismatch'}},
    {authorization_denial:{...fixture.authorization_denial,operation:'plugins.disable'}}
  ]) assert.equal(validBosAuthorizationDenialFixture({...fixture,...change},item),false);
});

test('hash-bound original authorization fixture bytes derive only missing redundant request bindings', () => {
  const item={id:'negative-3',prompt:'Use BOS to disable all BOS plugins for the organization "ACME.org"',expected_authorization_error_code:'authorization_denied'};
  const source={schema:'synthetic-reviewer-authority/v1',synthetic_only:true,
    review_organization:'Synthetic Review Organization',review_application:'Lead Director',
    review_installation:'Synthetic Installation',review_role:'Director',case_id:item.id,
    prompt_sha256:digest(item.prompt),authorization_denial:{operation:'unadvertised_disable_operation',
      arguments:{org_id:'ACME.org'},target_organization:'ACME.org',
      target_provenance:'owner-declared synthetic request label',resolve_target:false,
      contact_target_domain:false,expected_error_code:'authorization_denied',
      server_denial_precedes_operation_resolution:true}};
  const bytes=Buffer.from(JSON.stringify(source));
  const hash=createHash('sha256').update(bytes).digest('hex');
  const verified=verifiedBosAuthorizationDenialFixtureBytes(bytes,hash,item);
  assert.ok(verified);
  assert.equal(verified.authorization_denial.case_id,item.id);
  assert.equal(verified.authorization_denial.input_sha256,digest({org_id:'ACME.org'}));
  assert.equal(verified.authorization_denial.error_code,'authorization_denied');
  assert.equal(verifiedBosAuthorizationDenialFixtureBytes(bytes,'0'.repeat(64),item),null);
  assert.equal(verifiedBosAuthorizationDenialFixtureBytes(bytes,hash,{...item,prompt:'changed'}),null);
});

test('separate reviewer session authority and case-8 denial fixture pass their own hash-bound checks', async () => {
  const directory=await mkdtemp(join(tmpdir(),'bos-case8-prerequisites-'));
  try {
    const item={id:'negative-3',prompt:'Use BOS to disable all BOS plugins for the organization "ACME.org"',expected_authorization_error_code:'authorization_denied'};
    const sessionAuthority={schema:'synthetic-reviewer-authority/v1',synthetic_only:true,
      reviewer_login_url:'https://dfsm.ai/synthetic',review_organization:'Synthetic Review Organization',
      review_application:'Lead Director',review_installation:'Synthetic Installation',review_role:'Director'};
    const denialFixture={schema:'synthetic-reviewer-authority/v1',synthetic_only:true,
      review_organization:sessionAuthority.review_organization,review_application:sessionAuthority.review_application,
      review_installation:sessionAuthority.review_installation,review_role:sessionAuthority.review_role,
      case_id:item.id,prompt_sha256:digest(item.prompt),authorization_denial:{
        operation:'unadvertised_disable_operation',arguments:{org_id:'ACME.org'},target_organization:'ACME.org',
        target_provenance:'owner-declared synthetic request label',resolve_target:false,contact_target_domain:false,
        expected_error_code:'authorization_denied',server_denial_precedes_operation_resolution:true}};
    const sessionBytes=Buffer.from(JSON.stringify(sessionAuthority)),denialBytes=Buffer.from(JSON.stringify(denialFixture));
    const sessionPath=join(directory,'session-authority.json'),denialPath=join(directory,'denial-fixture.json');
    await writeFile(sessionPath,sessionBytes);await writeFile(denialPath,denialBytes);
    const config={synthetic_only:true,reviewer_login_url:sessionAuthority.reviewer_login_url,
      review_organization:sessionAuthority.review_organization,review_application:sessionAuthority.review_application,
      review_installation:sessionAuthority.review_installation,review_role:sessionAuthority.review_role,
      fixture_authority_file:sessionPath,fixture_authority_sha256:createHash('sha256').update(sessionBytes).digest('hex')};
    assert.equal((await verifyNativeReviewer(config)).verified,true);
    const denialHash=createHash('sha256').update(denialBytes).digest('hex');
    const scope={review_organization:sessionAuthority.review_organization,review_application:sessionAuthority.review_application,
      review_installation:sessionAuthority.review_installation,review_role:sessionAuthority.review_role};
    const loaded=await loadHashBoundBosAuthorizationDenialFixture(denialPath,denialHash,item,scope);
    assert.equal(loaded.authorization_denial.error_code,'authorization_denied');
    assert.equal(loaded.authorization_denial.input_sha256,digest({org_id:'ACME.org'}));
    let requests=0;
    const openAfterPreflight=async candidateScope=>{const result=await loadHashBoundBosAuthorizationDenialFixture(denialPath,denialHash,item,candidateScope);requests++;return result;};
    for(const field of ['review_organization','review_application','review_installation','review_role']) {
      await assert.rejects(openAfterPreflight({...scope,[field]:'different synthetic scope'}));
      assert.equal(requests,0);
    }
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('review runner requires completed actors for model cases and preserves the host-driven login case', () => {
  assert.equal(reviewedActorCompleted(3,undefined),true);
  for (let number=1;number<=8;number++) if(number!==3) {
    assert.equal(reviewedActorCompleted(number,{result:{status:'completed'}}),true);
    assert.equal(reviewedActorCompleted(number,{result:{status:'blocked'}}),false);
    assert.equal(reviewedActorCompleted(number,undefined),false);
  }
  assert.equal(reviewedActorCompleted(3,{result:{status:'blocked'}}),false);
});

test('submission and marketplace PASS require full coverage including all three starters', () => {
  const submission=Array.from({length:8},(_,index)=>({id:`case-${index+1}`,status:'PASS'}));
  const catalog=[...Array.from({length:3},(_,index)=>({id:`starter-${index+1}`,kind:'starter',status:'PASS'})),...submission];
  assert.equal(reviewedSubmissionPasses([],submission),true);
  assert.equal(reviewedMarketplacePasses([],catalog),true);
  assert.equal(reviewedSubmissionPasses(['case-8'],[submission[7]]),false);
  assert.equal(reviewedMarketplacePasses(['starter-1'],[catalog[0]]),false);
  assert.equal(reviewedSubmissionPasses([],submission.slice(0,7)),false);
  assert.equal(reviewedMarketplacePasses([],catalog.slice(0,10)),false);
  assert.equal(reviewedMarketplacePasses([],[...catalog.slice(0,10),{id:'case-8',kind:'negative',status:'FAIL'}]),false);
});

test('reviewer context forwards the exact current product description', () => {
  const description='Canonical BOS product description, exact punctuation: BOS.';
  const context=bosReviewerContext({description},{review_case_number:1},{organization:'Synthetic Org',application:'Lead Director',installation:'Synthetic Install',role:'Director'},[]);
  assert.equal(context.product_description,description);
  assert.equal(JSON.parse(JSON.stringify(context)).product_description,description);
});

test('a per-case prerequisite failure produces one FAIL receipt and workers continue', async () => {
  const items=[{id:'case-1',kind:'positive'},{id:'case-2',kind:'positive'},{id:'case-3',kind:'negative'}];
  const calls=[];
  const result=await runReviewedCaseBatch(items,async item=>{
    calls.push(item.id);
    if(item.id==='case-1')throw new Error('fixture_unavailable');
    return {id:item.id,status:'PASS'};
  },1,'configuration-hash','release-hash');
  assert.deepEqual(calls,['case-1','case-2','case-3']);
  assert.deepEqual(result.cases,[
    {id:'case-1',kind:'positive',status:'FAIL',reason:'case_execution_or_prerequisite_failed',configuration_sha256:'configuration-hash',release_sha256:'release-hash'},
    {id:'case-2',status:'PASS',configuration_sha256:'configuration-hash',release_sha256:'release-hash'},
    {id:'case-3',status:'PASS',configuration_sha256:'configuration-hash',release_sha256:'release-hash'}
  ]);
  assert.equal(result.finalReloadSucceeded,true);
  assert.equal(result.receiptBindingsValid,true);
  assert.equal(result.finalConfigurationMatches,true);
  assert.equal(result.complete_case_coverage,true);
});

test('configuration or installation drift blocks that dispatch and final receipt acceptance', async()=>{
  const items=[{id:'case-1',kind:'positive'},{id:'case-2',kind:'positive'}];
  const dispatched=[];let reloadCount=0;
  const result=await runReviewedCaseBatch(items,async item=>{dispatched.push(item.id);return {id:item.id,status:'PASS'};},1,
    'configuration-hash','release-hash',async()=>{
      reloadCount++;
      return reloadCount===1
        ? {configuration_sha256:'changed-configuration',release_sha256:'release-hash'}
        : {configuration_sha256:'configuration-hash',release_sha256:'changed-release'};
    });
  assert.deepEqual(dispatched,[]);
  assert.equal(result.cases[0].status,'FAIL');
  assert.equal(result.cases[0].configuration_sha256,'changed-configuration');
  assert.equal(result.cases[0].release_sha256,'release-hash');
  assert.equal(result.finalReloadSucceeded,true);
  assert.equal(result.finalConfigurationMatches,false);
  assert.equal(result.cases.every(row=>row.status==='FAIL'),true);
});

test('final reload failure invalidates every passing case receipt',async()=>{
  let reloadCount=0;
  const result=await runReviewedCaseBatch([{id:'case-1',kind:'positive'}],async item=>({id:item.id,status:'PASS'}),1,
    'configuration-hash','release-hash',async()=>{
      if(++reloadCount===1)return {configuration_sha256:'configuration-hash',release_sha256:'release-hash'};
      throw new Error('installed state unavailable');
    });
  assert.equal(result.finalReloadSucceeded,false);
  assert.equal(result.cases[0].status,'FAIL');
  assert.equal(result.cases[0].reason,'final_review_configuration_or_receipt_mismatch');
});

test('MCP authorization denial accepts only exact structured error_code on an error result', () => {
  const response = {result: {isError: true, structuredContent: {
    error: 'Execution context unavailable', error_code: 'authorization_denied'
  }}};
  assert.equal(extractBosMcpErrorCode(response), 'authorization_denied');
  assert.equal(extractBosMcpErrorCode({result: {isError: false, structuredContent: {
    error_code: 'authorization_denied'
  }}}), null);
  assert.equal(extractBosMcpErrorCode({result: {isError: true, structuredContent: {
    error_code: 'scope_mismatch'
  }}}), 'scope_mismatch');
  assert.equal(extractBosMcpErrorCode({result: {isError: true, structuredContent: {
    error_code: 'authorization_denied'
  }, content: [{type: 'text', text: JSON.stringify({error_code: 'scope_mismatch'})}]}}), 'authorization_denied');
  assert.equal(extractBosMcpErrorCode({result: {isError: true, structuredContent: {
    error_code: 'authorization_denied'
  }, content: [{type: 'text', text: JSON.stringify({error_code: 'private-token-value'})}]}}), 'authorization_denied');
  assert.equal(extractBosMcpErrorCode({result: {isError: true, content: [{type:'text',text:JSON.stringify({error_code:'authorization_denied'})}]}}), null);
  assert.equal(extractBosMcpErrorCode({result: {isError: true, structuredContent: {error:{code:'authorization_denied'}}}}), null);
  assert.equal(extractBosMcpErrorCode({error: {code:'authorization_denied'}}), null);
});

test('every case fails closed on missing authority, observation or effect proof', () => {
  for (let number = 1; number <= 7; number++) {
    const item = valid[number - 1];
    for (const change of [{observations_complete: false}, {effects: undefined}, {effects: {verified: false, mutation_count: 0}}, {effects: {verified: true}}, {effects: {verified: true, mutation_count: 1}}]) assert.equal(evaluateBosReviewedCase(number, {...item, ...change}, authority).status, 'FAIL');
    for (const change of [{verified: false}, {hash_bound: false}]) assert.equal(evaluateBosReviewedCase(number, item, {...authority, ...change}).status, 'FAIL');
  }
  assert.equal(evaluateBosReviewedCase(9, evidence([]), authority).status, 'FAIL');
});
