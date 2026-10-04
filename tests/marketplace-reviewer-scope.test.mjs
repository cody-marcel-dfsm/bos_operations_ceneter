import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyReviewerScope} from '../scripts/marketplace-reviewer-scope.mjs';
import {permission} from '../scripts/marketplace-native-hook.mjs';

const context={context_handle:'bos_ctx_v2_'+'a'.repeat(64),organization_name:'Synthetic',application_name:'Synthetic App',installation_name:'Synthetic Installation',role_label:'Reviewer'};
const makeState=()=>({organization:context.organization_name,application:context.application_name,installation:context.installation_name,role:context.role_label,kind:'negative',canary:true,observations:[],denials:[]});
const envelope=contexts=>({structuredContent:{contract_version:'bos-identity-mcp/v2',contexts}});
function session(response,tools=[{name:'bos_get_context'}]) {
  const calls=[];
  return {calls,rpc:async(method,params)=>{calls.push({method,params});if(method==='tools/list')return {tools};assert.equal(method,'tools/call');assert.deepEqual(params,{name:tools[0].name,arguments:{}});return response;}};
}
test('host scope preflight proves the exact session match without populating model discovery or permitting negative calls',async()=>{
  const state=makeState(),original=structuredClone(state),transport=session(envelope([{...context,organization_name:'Other Synthetic'},context]));
  assert.equal(await verifyReviewerScope(transport,state),true);
  assert.deepEqual(transport.calls.map(row=>row.method),['tools/list','tools/call']);
  assert.deepEqual(state,original);
  for(const name of ['bos_get_context','bos_list_context_tools','bos_execute'])assert.equal(permission({tool_name:'mcp__BOS__'+name,tool_input:{}},state),'negative_case_business_call');
});
test('host scope preflight rejects missing, ambiguous, malformed and mismatched actual context evidence',async()=>{
  const invalid=[envelope([]),envelope([context,context]),envelope([null]),envelope([{...context,context_handle:undefined}]),envelope([{...context,context_handle:'invented'}]),envelope([{...context,context_handle:[]}]),{isError:true,...envelope([context])},{structuredContent:{contract_version:'unknown',contexts:[context]}},{structuredContent:{contract_version:'bos-identity-mcp/v2',contexts:{}}}];
  for(const field of ['organization_name','application_name','installation_name','role_label'])invalid.push(envelope([{...context,[field]:'Other Synthetic'}]));
  for(const response of invalid){const state=makeState();await assert.rejects(verifyReviewerScope(session(response),state),/reviewer_identity_unverified/);assert.equal(state.handle,undefined);}
});
test('host scope preflight rejects absent or ambiguous tools before any context call',async()=>{
  for(const offered of [[],[{name:'bos_get_context'},{name:'bos.get_context'}],[{name:'unrelated'}],null]){
    const transport=session(envelope([context]),offered);await assert.rejects(verifyReviewerScope(transport,makeState()),/reviewer_identity_unverified/);assert.equal(transport.calls.length,1);
  }
});
test('host scope preflight propagates transport failure without claiming scope',async()=>{
  const state=makeState();const transport={rpc:async()=>{throw new Error('reviewer_mcp_request_failed');}};
  await assert.rejects(verifyReviewerScope(transport,state),/reviewer_mcp_request_failed/);assert.equal(state.handle,undefined);
});


test('host scope capture emits only actual selected public labels and preserves model discovery state',async()=>{
 const state=makeState(),original=structuredClone(state);let captured;
 const actual={...context,access_token:'private-token',private_url:'https://private.invalid',organization_id:'private-id'};
 assert.equal(await verifyReviewerScope(session(envelope([actual])),state,value=>{captured=value;}),true);
 assert.deepEqual(captured,{organization_name:context.organization_name,application_name:context.application_name,installation_name:context.installation_name,role_label:context.role_label});assert.equal(Object.isFrozen(captured),true);assert.deepEqual(state,original);assert.doesNotMatch(JSON.stringify(captured),/context_handle|private-token|private.invalid|private-id/);
 let called=false;await assert.rejects(verifyReviewerScope(session(envelope([{...actual,role_label:'Other'}])),state,()=>{called=true;}),/reviewer_identity_unverified/);assert.equal(called,false);assert.deepEqual(state,original);
});
