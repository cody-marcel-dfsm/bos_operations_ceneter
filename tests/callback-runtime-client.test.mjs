import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {validateCallbackReport,validateStandingRegistration,validateWorkflowCatalog,validateWorkflowControlResponse,presentCallbackReport,reviewCallbackGrant} from "../source/platform/bos-workflow-orchestrator/scripts/callback-runtime-client.mjs";
import {interpretJourneyResponse,buildIdentityV2WorkflowActionRequest,buildJourneyRegistrationRequest} from "../source/platform/bos-workflow-orchestrator/scripts/journey-runtime-client.mjs";
import {validateWorkflowCatalogDiscovery,validateWorkflowControlDiscovery} from "../source/platform/bos-app-discovery/scripts/validate-discovery.mjs";
import {buildJourneyGraphView} from "../source/platform/bos-workflow-orchestrator/scripts/journey-presentation.mjs";

function report() {return {as_of:"2026-10-13T00:00:00Z",callbacks:[{code:"mail",source:"gmail.trigger",requested:{queue:"journey",max_attempts:5,max_delay_seconds:300,retention_seconds:604800},granted:{queue:"journey",max_attempts:3,max_delay_seconds:300,retention_seconds:604800},adjustments:[{field:"max_attempts",requested:5,granted:3,reason:"PROFILE_LIMIT"}]}],waits:[{code:"wait",callback:"mail",requested:{ttl_seconds:null},granted:{ttl_seconds:null},adjustments:[]}],usage:[{resource:"definitions",scope:"organization",visibility:"visible",used:2,limit:null,remaining:null,reserved_by_submission:1},{resource:"callbacks",scope:"execution",visibility:"visible",used:1,limit:5,remaining:4,reserved_by_submission:1}]};}
function action(verb="state",schema=null) {return {verb,method:verb==="state"?"GET":"POST",href:"/bos/apps/example/api/v1/organizations/demo/journey-controls/ctrl_independent_fixture",payload_schema:schema};}
const registration=JSON.parse(await readFile(new URL("./fixtures/journey-registration-contract.json",import.meta.url),"utf8"));
function submitted() {return {identity:"email journey",name:"Email journey",inputs:{},entry:"wait",
  bootstrap:{callbacks:[{code:"mail",source:"gmail.trigger",inputs:{},match:{}}]},
  nodes:[{code:"wait",type:"server",operation:"bosl.callbacks.await",inputs:{callback:{value:"mail"},ttl_seconds:{value:null}},outputs:{},next:"done"},
    {code:"done",type:"server",inputs:{},outputs:{},terminal:true}]};}
function receipt(callback_report=report()) {return {compiled:true,identity:"email journey",actions:{start:{...action("start"),href:"/bos/apps/example/api/v1/organizations/demo/journeys/email%20journey/start?capability=synthetic"}},callback_report};}
function request(document=submitted()) {return buildJourneyRegistrationRequest(registration,"bos_ctx_v2_"+"a".repeat(64),document);}

test("callback registration presents its negotiated grant before explicit start",()=>{
  const body=receipt();
  const decision=interpretJourneyResponse({http_status:200,body},{registrationRequest:request()});
  assert.equal(decision.next,"review_callback_grant");assert.equal(decision.identity,"email journey");
  const presented=decision.presentation;
  assert.equal(presented.usage[0].limit,"Unlimited");assert.equal(presented.waits[0].lifetime,"Permanent");assert.equal(presented.adjustments[0].granted,3);
  assert.equal(presented.usage[1].remaining,4);
});
test("restricted counts and finite physical limits are enforced",()=>{
  for(const mutation of [r=>r.usage[0].visibility="restricted",r=>r.callbacks[0].granted.max_attempts=6,r=>r.waits[0].execution_id="private",r=>r.usage[0].remaining=2]) {const r=report();mutation(r);assert.throws(()=>validateCallbackReport(r));}
});

test("visible callback usage preserves finite and unlimited accounting invariants",()=>{
  const valid={resource:"registrations",scope:"organization",visibility:"visible",used:4,limit:5,remaining:1,reserved_by_submission:1};
  for(const update of [{used:null},{remaining:null},{remaining:50},{remaining:0},{reserved_by_submission:null}]) {
    const r=report();r.usage=[{...valid,...update}];assert.throws(()=>validateCallbackReport(r));
  }
  for(const usage of [valid,{...valid,used:0,remaining:5},{...valid,used:7,remaining:0},{...valid,limit:null,remaining:null},{...valid,visibility:"restricted",used:null,remaining:null}]) {
    const r=report();r.usage=[usage];assert.doesNotThrow(()=>validateCallbackReport(r));
  }
});

test("callback grants do not publish downgrade reset readiness",()=>{
  assert.equal(Object.hasOwn(presentCallbackReport(report()),"downgrade_disclosure"),false);
});

test("grant review requires complete wait rows and finite profile expiry recovery before start",()=>{
  const document=submitted();delete document.nodes[0].inputs.ttl_seconds;
  const permanent=report();assert.doesNotThrow(()=>reviewCallbackGrant(document,permanent));
  const finite=report();finite.waits[0].granted.ttl_seconds=10;
  assert.throws(()=>reviewCallbackGrant(document,finite),/CALLBACK_WAIT_EXPIRED/);
  document.nodes[0].catch={cases:[{when:{left:{from:"$error.code"},op:"eq",right:{value:"CALLBACK_WAIT_EXPIRED"}},next:"done"}],default:"done"};
  assert.doesNotThrow(()=>reviewCallbackGrant(document,finite));
  for(const waits of [[],[finite.waits[0],finite.waits[0]],[{...finite.waits[0],code:"unknown"}]]) {
    assert.throws(()=>reviewCallbackGrant(document,{...finite,waits}),/missing|unique|submitted wait/);
  }
});

test("registration review binds the response to the original serialized submission",()=>{
  const document=submitted(),original=request(document),body=receipt();
  document.identity="later draft";document.bootstrap.callbacks[0].source="later.plugin.trigger";
  assert.equal(interpretJourneyResponse({http_status:200,body},{registrationRequest:original}).identity,"email journey");
  assert.throws(()=>interpretJourneyResponse({http_status:200,body}),/original builder request/);
  assert.throws(()=>interpretJourneyResponse({http_status:200,body},{registrationRequest:{...original}}),/unchanged original/);
  assert.throws(()=>interpretJourneyResponse({http_status:200,body:{...body,identity:"different workflow"}},{registrationRequest:original}),/identity differs/);
  const missing={...body};delete missing.callback_report;
  assert.throws(()=>interpretJourneyResponse({http_status:200,body:missing},{registrationRequest:original}),/requires its callback grant report/);
  assert.equal(Object.isFrozen(original),true);
  assert.throws(()=>{original.body=JSON.stringify(document);},TypeError);
  assert.equal(interpretJourneyResponse({http_status:200,body},{registrationRequest:original}).identity,"email journey");
});

test("callback grant review reconciles complete declarations, sources and wait mapping",()=>{
  for(const change of [
    r=>r.callbacks=[],
    r=>r.callbacks[0].source="different.plugin.trigger",
    r=>r.callbacks.push({...structuredClone(r.callbacks[0]),code:"unsubmitted"}),
    r=>{r.callbacks.push({...structuredClone(r.callbacks[0]),code:"other"});r.waits[0].callback="other";},
  ]) {
    const r=report();change(r);assert.throws(()=>reviewCallbackGrant(submitted(),r));
  }
  const document=submitted();document.bootstrap.callbacks.push({code:"second",source:"fixture.inventory.trigger",inputs:{},match:{}});
  assert.throws(()=>reviewCallbackGrant(document,report()),/missing a submitted callback/);
  const complete=report();complete.callbacks.push({...structuredClone(complete.callbacks[0]),code:"second",source:"fixture.inventory.trigger"});
  assert.doesNotThrow(()=>reviewCallbackGrant(document,complete));
  complete.waits[0].callback="second";
  assert.throws(()=>reviewCallbackGrant(document,complete),/submitted callback binding/);
});

test("explicit requested TTL and delivery terms match the serialized authored values",()=>{
  const document=submitted();document.nodes[0].inputs.ttl_seconds.value=60;
  document.nodes[0].catch={cases:[{when:{op:"eq",left:{from:"$error.code"},right:{value:"CALLBACK_WAIT_EXPIRED"}},next:"done"}]};
  document.bootstrap.callbacks[0].retry={max_attempts:4,max_delay_seconds:120};
  document.bootstrap.callbacks[0].dead_letter={queue:"journey",retention_seconds:3600};
  const r=report();r.waits[0].requested.ttl_seconds=r.waits[0].granted.ttl_seconds=60;
  r.callbacks[0].requested={queue:"journey",max_attempts:4,max_delay_seconds:120,retention_seconds:3600};
  r.callbacks[0].granted={...r.callbacks[0].requested,max_attempts:3};
  r.callbacks[0].adjustments=[{field:"max_attempts",requested:4,granted:3,reason:"PROFILE_LIMIT"}];
  assert.doesNotThrow(()=>reviewCallbackGrant(document,r));
  for(const mutate of [x=>x.waits[0].requested.ttl_seconds=10,x=>x.callbacks[0].requested.max_attempts=5,
    x=>x.callbacks[0].requested.max_delay_seconds=300,x=>x.callbacks[0].requested.retention_seconds=604800]) {
    const wrong=structuredClone(r);mutate(wrong);assert.throws(()=>reviewCallbackGrant(document,wrong),/submitted term/);
  }
  document.nodes[0].inputs.ttl_seconds.value=null;
  assert.throws(()=>reviewCallbackGrant(document,r),/submitted term/);
  delete document.nodes[0].inputs.ttl_seconds;delete document.bootstrap.callbacks[0].retry;delete document.bootstrap.callbacks[0].dead_letter;
  assert.doesNotThrow(()=>reviewCallbackGrant(document,r));
});

test("grant presentation keeps unchanged delivery terms, TTL requests and every returned usage field",()=>{
  const r=report();r.callbacks[0].granted={...r.callbacks[0].requested};r.callbacks[0].adjustments=[];
  r.usage.push({resource:"pending_events",scope:"source",visibility:"restricted",used:null,limit:5,remaining:null,reserved_by_submission:0});
  const presented=reviewCallbackGrant(submitted(),r);
  assert.deepEqual(presented.callbacks[0],{code:"mail",source:"gmail.trigger",requested:r.callbacks[0].requested,granted:r.callbacks[0].granted});
  assert.deepEqual(presented.waits[0],{step:"wait",callback:"mail",requested:{ttl_seconds:null},granted:{ttl_seconds:null},lifetime:"Permanent"});
  assert.equal(presented.usage[0].scope,"organization");assert.equal(presented.usage[0].reserved_by_submission,1);
  assert.deepEqual(presented.usage[2],{resource:"pending_events",scope:"source",visibility:"restricted",used:"Restricted",limit:5,remaining:null,reserved_by_submission:0});
  const emptyUsage=structuredClone(r);emptyUsage.usage=[];
  assert.doesNotThrow(()=>reviewCallbackGrant(submitted(),emptyUsage));
  presented.callbacks[0].requested.max_attempts=1;assert.equal(r.callbacks[0].requested.max_attempts,5);
});
test("standing pages keep private run selections and require truncation continuation",()=>{
  const registration={callback:"mail",active_since:"2026-10-13T00:00:00Z",expires_at:null,admission_status:"active",run_counts:{completed:30},runs:[{status:"completed",action:action()}],runs_truncated:true,next_page:action()};
  validateStandingRegistration(registration);
  assert.equal(interpretJourneyResponse({http_status:202,body:{identity:"email journey",status:"in_progress",registration,retry_after_seconds:30,action:action()}}).next,"standing_workflow");
  delete registration.next_page;assert.throws(()=>validateStandingRegistration(registration));
});
test("controls retain authored identity, typed completion and author-only edit",()=>{
  const wrapper={workflow_ref:"boswf_independent_fixture",target:{kind:"run",identity:"email journey"},is_author:false,can_edit:false,lifecycle:{identity:"email journey",status:"completed",outcome:{}},actions:{state:action(),stop:action("stop")}};
  validateWorkflowControlResponse(wrapper);assert.equal(interpretJourneyResponse({http_status:200,body:wrapper}).next,"terminal");
  wrapper.can_edit=true;assert.throws(()=>validateWorkflowControlResponse(wrapper));
  wrapper.is_author=true;wrapper.can_edit=false;assert.doesNotThrow(()=>validateWorkflowControlResponse(wrapper));
});
test("workflow catalogs are rejected when returned with a failed HTTP status",()=>{
  assert.throws(()=>interpretJourneyResponse({http_status:500,body:{workflows:[],truncated:false}}),/successful HTTP status/);
  assert.equal(interpretJourneyResponse({http_status:200,body:{workflows:[],truncated:false}}).next,"workflow_catalog");
});
test("catalog and failure paging accepts observation actions only",()=>{
  assert.doesNotThrow(()=>validateWorkflowCatalog({workflows:[],truncated:true,next_page:action()}));
  const catalogItem={workflow_ref:"boswf_independent_fixture",identity:"email journey",name:"Email journey",is_author:false,can_edit:false,
    status:"in_progress",graph:{entry:"wait",nodes:[]},callbacks:[],redactions:[],action:action()};
  assert.doesNotThrow(()=>validateWorkflowCatalog({workflows:[catalogItem],truncated:false}));
  for(const verb of ["stop","retire","start"]) {
    assert.throws(()=>validateWorkflowCatalog({workflows:[],truncated:true,next_page:action(verb)}),/state action/);
    const mutated=structuredClone(catalogItem);mutated.action=action(verb);
    assert.throws(()=>validateWorkflowCatalog({workflows:[mutated],truncated:false}),/state action/);
  }
  const control={workflow_ref:"boswf_independent_fixture",target:{kind:"run",identity:"email journey"},is_author:false,can_edit:false,
    lifecycle:{identity:"email journey",status:"completed"},actions:{state:action()},
    failures:{items:[],truncated:true,next_page:action()}};
  assert.doesNotThrow(()=>validateWorkflowControlResponse(control));
  for(const verb of ["stop","retire","start"]) {
    const mutated=structuredClone(control);mutated.failures.next_page=action(verb);
    assert.throws(()=>validateWorkflowControlResponse(mutated),/state action/);
  }
});
test("callback quota errors preserve current usage and require its limit",()=>{
  const error={code:"CALLBACK_LIMIT_REACHED",message:"The organization callback allowance is exhausted.",retryable:true,correlation_id:"corr_fixture",details:[]};
  const usage=[{resource:"registrations",scope:"organization",visibility:"visible",used:2,limit:2,remaining:0,reserved_by_submission:0}];
  const decision=interpretJourneyResponse({http_status:429,body:{error,usage}});
  assert.equal(decision.next,"callback_error");assert.deepEqual(decision.usage,usage);
  assert.throws(()=>interpretJourneyResponse({http_status:429,body:{error}}),/require current usage/);
});
test("expired opaque workflow actions direct the client to refresh discovery",()=>{
  const error={code:"WORKFLOW_OPERATION_EXPIRED",message:"Refresh the workflow catalog.",retryable:false,correlation_id:"corr_fixture",details:[]};
  assert.equal(interpretJourneyResponse({http_status:409,body:{error}}).next,"refresh_workflow");
});
test("workflow actions bind the current context without author authority in the payload",()=>{
  const request=buildIdentityV2WorkflowActionRequest(action("stop"),"bos_ctx_v2_"+"a".repeat(64));
  assert.equal(request.body,"{}");assert.equal(request.headers["X-BOS-Context-Handle"],"bos_ctx_v2_"+"a".repeat(64));
  assert.throws(()=>buildIdentityV2WorkflowActionRequest({...action(),href:"https://outside.example/control"},"bos_ctx_v2_"+"a".repeat(64)));
});
test("independent HTTP fixture consumes the exact opaque selected-run operation",async()=>{
  const schema={type:"object",required:["acknowledgment"],properties:{acknowledgment:{type:"object",required:["confirmed"],properties:{confirmed:{const:true}},additionalProperties:false}},additionalProperties:false};
  const received=[];
  const server=createServer(async(req,res)=>{let body="";for await(const chunk of req)body+=chunk;received.push({url:req.url,handle:req.headers["x-bos-context-handle"],body:JSON.parse(body)});res.setHeader("Content-Type","application/json");res.end(JSON.stringify({workflow_ref:"boswf_independent_fixture",target:{kind:"run",identity:"email journey"},is_author:false,can_edit:false,lifecycle:{identity:"email journey",status:"step_completed",action:action("step")},actions:{state:action()}}));});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try {const request=buildIdentityV2WorkflowActionRequest(action("complete",schema),"bos_ctx_v2_"+"b".repeat(64),{acknowledgment:{confirmed:true}});const response=await fetch(`http://127.0.0.1:${server.address().port}${request.href}`,request);const body=await response.json();assert.equal(interpretJourneyResponse({http_status:response.status,body}).action.href,action("step").href);assert.equal(received[0].url,request.href);assert.deepEqual(received[0].body,{acknowledgment:{confirmed:true}});} finally {await new Promise(resolve=>server.close(resolve));}
});
test("workflow discovery retains the exact current contract link",()=>{
  const link={contract:{capability:"api.contract.get",input:{operation:"lead-director.journeys.workflows"}}};
  validateWorkflowCatalogDiscovery(link);link.contract.input.organization_id="private";assert.throws(()=>validateWorkflowCatalogDiscovery(link));
  validateWorkflowControlDiscovery({contract:{capability:"api.contract.get",input:{operation:"lead-director.journeys.workflow-control"}}});
});
test("journey presentation shows callback bootstrap and wait edges",()=>{
  const view=buildJourneyGraphView({entry:"wait",bootstrap:{callbacks:[{code:"mail",source:"gmail.trigger"}],activate_on:"mail"},nodes:[{code:"wait",type:"server",operation:"bosl.callbacks.await",inputs:{callback:{value:"mail"}},next:"done"},{code:"done",type:"server",terminal:true}]});
  assert.match(view.mermaid,/captured event/);assert.match(view.mermaid,/fresh run/);assert.match(view.accessible_text,/Bootstrap mail/);
});
