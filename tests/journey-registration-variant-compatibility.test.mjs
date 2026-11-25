import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {validateApiContractResponse} from '../source/platform/bos-app-discovery/scripts/validate-discovery.mjs';
import {buildJourneyRegistrationRequest,buildIdentityV2JourneyActionRequest,interpretJourneyResponse,runJourneyRecovery,validateJourneyEnvelope} from '../source/platform/bos-workflow-orchestrator/scripts/journey-runtime-client.mjs';
import {currentRegistrationContract,legacyRegistrationContract,branchWaitResponse,returnedAction,syntheticDocument} from './helpers/registration-variant-contract.mjs';

const contextHandle='bos_ctx_v2_'+'a'.repeat(64);
const operation='lead-director.journeys.register';

test('synthetic HTTP discovery accepts the complete current v1 descriptor through request builder and actual CLI',async t=>{
  const contract=currentRegistrationContract(),serialized=JSON.stringify(contract);
  const server=createServer((request,response)=>{response.writeHead(200,{'content-type':'application/json'});response.end(serialized);});
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  const discovered=await (await fetch(`http://127.0.0.1:${server.address().port}/api-contract`)).json();
  assert.equal(validateApiContractResponse(discovered,{operation}),discovered);
  const request=buildJourneyRegistrationRequest(discovered,contextHandle,syntheticDocument);
  assert.equal(request.href,contract.execution.uri);assert.equal(request.method,'POST');
  assert.equal(request.headers['X-BOS-Context-Handle'],contextHandle);assert.deepEqual(JSON.parse(request.body),syntheticDocument);
  assert.equal(JSON.stringify(discovered),serialized);
  const script=fileURLToPath(new URL('../source/platform/bos-app-discovery/scripts/validate-discovery.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[script,'api-contract'],{input:JSON.stringify({response:discovered,operation}),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{valid:true,kind:'api-contract'});
});

test('complete legacy and current response profiles remain exact and optional discovery links remain closed',()=>{
  for(const descriptor of [legacyRegistrationContract(),currentRegistrationContract()]) assert.equal(validateApiContractResponse(descriptor,{operation}),descriptor);
  for(const mutate of [
    d=>{d.output_schema.oneOf.pop();},
    d=>{d.output_schema.oneOf.push(structuredClone(d.output_schema.oneOf[0]));},
    d=>{d.output_schema.oneOf.at(-1).properties.unexpected={type:'string'};},
    d=>{d.output_schema.oneOf.at(-1).properties.status.const='unadvertised_status';},
    d=>{d.related_contracts[0].capability='execute';},
    d=>{d.related_contracts[0].input.context_handle=contextHandle;},
    d=>{d.related_contracts.push(structuredClone(d.related_contracts[0]));},
    d=>{d.related_contracts[0].input.operation='not a semantic operation';},
    d=>{d.related_contracts=Array.from({length:65},(_,index)=>({capability:'api.contract.get',input:{operation:`synthetic.operation${index}`}}));},
    d=>{d.execution.uri='https://foreign.invalid/register';},
    d=>{d.execution.context_header='X-Other-Context';}
  ]){const descriptor=currentRegistrationContract();mutate(descriptor);assert.throws(()=>validateApiContractResponse(descriptor,{operation}));}
});

test('branch wait preserves open service status strings and returned continuations without polling or effects',async()=>{
  const response=branchWaitResponse(),original=JSON.stringify(response);
  assert.equal(validateJourneyEnvelope(response.body),response.body);
  const decision=interpretJourneyResponse(response);
  assert.equal(decision.next,'parallel_branches');assert.equal(decision.branches,response.body.branches);assert.equal(decision.action,response.body.action);
  assert.equal(decision.branches[0].status,'service_defined_branch_status');
  const request=buildIdentityV2JourneyActionRequest(decision.branches[1].instruction.after_success,contextHandle);
  assert.equal(request.href,response.body.branches[1].instruction.after_success.href);assert.equal(request.body,'{}');
  let waits=0,invocations=0;
  assert.equal(await runJourneyRecovery(response,{wait:async()=>{waits++;},invoke:async()=>{invocations++;}}),response);
  assert.equal(waits,0);assert.equal(invocations,0);assert.equal(JSON.stringify(response),original);
});

test('branch envelopes reject undeclared fields, invalid types and unsafe returned actions',()=>{
  for(const mutate of [
    b=>{b.extra=true;},b=>{delete b.action;},b=>{b.current_node.type='server';},b=>{b.current_node.extra=true;},
    b=>{b.branches=Array.from({length:257},(_,index)=>({index,status:'service-defined',current_node:null}));},
    b=>{b.branches[0].index=-1;},b=>{b.branches[0].index=1.5;},b=>{b.branches[0].status=1;},b=>{delete b.branches[0].current_node;},
    b=>{b.branches[0].current_node={code:'not-a-summary'};},b=>{b.branches[0].extra=true;},
    b=>{b.branches[0].action={...returnedAction('state'),href:'https://foreign.invalid/state'};},
    b=>{b.branches[1].instruction.after_success.href='//foreign.invalid/complete';},
    b=>{delete b.branches[1].instruction.after_success;},b=>{delete b.branches[1].instruction.on_failure;},
    b=>{b.branches[0].retry_after_seconds=901;},b=>{b.branches[0].current_step={context_handle:contextHandle};}
  ]){const {body}=branchWaitResponse();mutate(body);assert.throws(()=>validateJourneyEnvelope(body));}
});

test('current descriptor keeps canonical commercial errors bound to its original request',()=>{
  const descriptor=currentRegistrationContract();
  const registrationRequest=buildJourneyRegistrationRequest(descriptor,contextHandle,syntheticDocument);
  for(const [code,status,retryable] of [['PAID_PLAN_REQUIRED',403,false],['MCP_ENTITLEMENT_UNAVAILABLE',503,true]]){
    const response={http_status:status,body:{error:{code,message:'Synthetic admission result.',retryable,correlation_id:'corr-synthetic',details:[]}}};
    const decision=interpretJourneyResponse(response,{registrationRequest});
    assert.equal(decision.next,'declared_public_error');assert.equal(decision.http_status,status);assert.equal(decision.error.retryable,retryable);
    assert.throws(()=>interpretJourneyResponse({...response,http_status:status===403?503:403},{registrationRequest}));
    assert.throws(()=>interpretJourneyResponse(response));
  }
});
