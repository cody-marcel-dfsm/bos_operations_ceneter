import test from "node:test";
import assert from "node:assert/strict";
import {createCustomerOnboarding,admitOnboardingDescriptor,parseOwnJson,parseOnboardingMetadata} from "../source/platform/ada/scripts/customer-onboarding.mjs";
import {syntheticOnboarding,syntheticSnapshot,metadata,ref} from "./helpers/synthetic-onboarding.mjs";
async function fixture(verb="decide"){
  let descriptor=syntheticOnboarding(),current=true,kind="oauth",own=true,response=syntheticSnapshot(verb),fault=false,status=200;
  const requests=[];
  const host={getOwnOnboardingCapabilities:async()=>({metadataRead:true,ownWork:own,credentialKind:kind}),getProtectedResource:async()=>descriptor.audience,
    readOwnOnboardingContract:async()=>structuredClone(descriptor),captureIdentityScope:async()=>async()=>current,
    invokeOwnOnboardingOperation:async request=>{requests.push(request);if(fault)throw Error("Synthetic transport uncertainty");return{status,body:structuredClone(response)};}};
  const client=await createCustomerOnboarding({host});
  return{client,host,requests,descriptor,setCurrent:v=>current=v,setKind:v=>kind=v,setOwn:v=>own=v,setResponse:v=>response=v,setFault:v=>fault=v,setStatus:v=>status=v};
}
test("current contract and whole local schema references are admitted; hostile envelopes and authority routes fail closed",()=>{
  const descriptor=syntheticOnboarding();assert.equal(parseOnboardingMetadata(metadata(descriptor),descriptor.audience).operations.size,3);
  for(const mutate of [d=>d.operations[0].uri="https://elsewhere.example.invalid/api/v1/customer-onboarding/read",d=>d.operations[0].uri+="?token=x",d=>d.audience+="/other",d=>d.operations[0].method="GET",d=>d.authentication.context_handle_required=true,d=>d.operations[0].input_schema={$ref:"https://elsewhere.example.invalid/schema"},d=>d.operations.push(d.operations[0])]){
    const changed=structuredClone(descriptor);mutate(changed);assert.throws(()=>admitOnboardingDescriptor(changed,descriptor.audience));
  }
  for(const text of ['{"a":1,"a":2}','{"a":{"x":1,"x":2}}','{"n":1e999}','{"x":01}','[] extra'])assert.throws(()=>parseOwnJson(text));
  assert.throws(()=>parseOnboardingMetadata({...metadata(descriptor),id:"other"},descriptor.audience));
});
test("missing host and API-key or legacy grant cannot obtain own-work capability",async()=>{
  assert.equal((await createCustomerOnboarding({host:{}})).available,false);
  for(const kind of ["api_key","legacy_email"]){const f=await fixture();f.setKind(kind);const client=await createCustomerOnboarding({host:f.host});assert.equal(client.available,false);assert.equal(client.account,"not_evaluated");assert.equal(f.requests.length,0);}
});
test("exact current requirement and revision require explicit bound presentation before server confirmation",async()=>{
  const f=await fixture();await f.client.read({account_ref:ref(100)});const payload={action_ref:ref(1),decision:"confirm"};
  await assert.rejects(f.client.act(payload,{confirmed:true}),/unavailable/u);assert.equal(f.requests.length,1);
  const shown=await f.client.present(ref(1));assert.equal(shown.subject.revision,3);
  await assert.rejects(f.client.act(payload,{presentation_ref:shown.presentation_ref,confirmed:"yes"}));
  f.setResponse({...syntheticSnapshot(),status:"applied",receipt_ref:ref(200)});
  const result=await f.client.act(payload,{presentation_ref:shown.presentation_ref,confirmed:true});assert.equal(result.body.status,"applied");
  assert.deepEqual(f.requests[1].payload,payload);assert.equal(result.body.snapshot.pending_service.length,0);
  assert.equal((await f.client.act(payload,{presentation_ref:shown.presentation_ref,confirmed:true})).code,"action_state_required");
});
test("new read invalidates old presentation and expired action cannot be presented",async()=>{
  const f=await fixture();await f.client.read({});const shown=await f.client.present(ref(1));await f.client.read({});
  await assert.rejects(f.client.act({action_ref:ref(1),decision:"confirm"},{presentation_ref:shown.presentation_ref,confirmed:true}));
  const body=syntheticSnapshot();body.snapshot.actions[0].expires_at="2000-01-01T00:00:00Z";f.setResponse(body);await f.client.read({});await assert.rejects(f.client.present(ref(1)));
});
test("observations and proposals use exactly one advertised scalar or statement; no authority/context selectors",async()=>{
  for(const verb of ["observe","propose","amend"]){const f=await fixture(verb);await f.client.read({});
    const payload={action_ref:ref(1),[verb==="observe"?"value":"statement"]:verb==="observe"?true:"Synthetic statement"};
    await assert.rejects(f.client.act({...payload,context_handle:"forged"}));await assert.rejects(f.client.act({...payload,[verb==="observe"?"value":"statement"]:null}));
    assert.equal((await f.client.act(payload)).ok,true);assert.deepEqual(f.requests[1].payload,payload);
  }
});
test("identity/credential/contract changes before dispatch remain definite failures without uncertain or sent action",async()=>{
  for(const kind of ["identity","credential","contract"]){const f=await fixture();await f.client.read({});const shown=await f.client.present(ref(1));
    if(kind==="identity")f.setCurrent(false);if(kind==="credential")f.setKind("api_key");if(kind==="contract")f.descriptor.recovery.stale_action="Changed actual contract";
    await assert.rejects(f.client.act({action_ref:ref(1),decision:"confirm"},{presentation_ref:shown.presentation_ref,confirmed:true}));assert.equal(f.requests.length,1);assert.equal(f.client.uncertainAction,null);
  }
});
test("uncertain action uses exact state ref and never retries changed write or claims success",async()=>{
  const f=await fixture("observe");await f.client.read({});f.setFault(true);const result=await f.client.act({action_ref:ref(1),value:true});assert.equal(result.code,"uncertain_action");
  assert.equal((await f.client.act({action_ref:ref(1),value:false})).code,"action_state_required");f.setFault(false);f.setResponse({...syntheticSnapshot(),status:"not_applied"});
  const recover=f.client.recover;const recovered=await recover();assert.equal(recovered.body.status,"not_applied");assert.equal(recovered.body.receipt_ref,null);assert.deepEqual(f.requests.at(-1).payload,{action_ref:ref(1)});
});
test("stale/auth/account denial clears current actions; source unavailability and invalid bodies confer no completion",async()=>{
  for(const [status,code]of[[409,"conflict"],[401,"authentication_required"],[403,"authorization_denied"],[404,"not_found"],[503,"service_unavailable"]]){
    const f=await fixture("observe");await f.client.read({});f.setStatus(status);f.setResponse({error:{code}});assert.equal((await f.client.act({action_ref:ref(1),value:true})).code,code);await assert.rejects(f.client.present(ref(1)));
  }
  const f=await fixture();f.setResponse({...syntheticSnapshot(),status:"invented"});await assert.rejects(f.client.read({}));f.client.retire();await assert.rejects(f.client.read({}));
});
test("failed reread invalidates confirmation; concurrent action cannot double dispatch",async()=>{
  const f=await fixture("observe");await f.client.read({});const first=f.client.act({action_ref:ref(1),value:true});
  await assert.rejects(f.client.act({action_ref:ref(1),value:true}));await first;assert.equal(f.requests.filter(row=>row.operationId.endsWith(".action")).length,1);
  const g=await fixture();await g.client.read({});const shown=await g.client.present(ref(1));g.setFault(true);await assert.rejects(g.client.read({}));g.setFault(false);
  await assert.rejects(g.client.act({action_ref:ref(1),decision:"confirm"},{presentation_ref:shown.presentation_ref,confirmed:true}));
});
test("caller mutations after action entry cannot change explicitly confirmed decision bytes",async()=>{
  const f=await fixture();await f.client.read({});const shown=await f.client.present(ref(1));
  const payload={action_ref:ref(1),decision:"confirm"},confirmation={presentation_ref:shown.presentation_ref,confirmed:true};
  const pending=f.client.act(payload,confirmation);payload.decision="revoke";confirmation.confirmed=false;
  assert.equal((await pending).ok,true);assert.deepEqual(f.requests.at(-1).payload,{action_ref:ref(1),decision:"confirm"});
});
