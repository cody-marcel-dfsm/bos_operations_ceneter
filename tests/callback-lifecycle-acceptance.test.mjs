import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {validateApiContractResponse,validateWorkflowCatalogDiscovery,validateWorkflowControlDiscovery} from "../source/platform/bos-app-discovery/scripts/validate-discovery.mjs";
import {validateCallbackAuthoring} from "../source/platform/bos-workflow-orchestrator/scripts/callback-authoring.mjs";
import {reviewCallbackGrant} from "../source/platform/bos-workflow-orchestrator/scripts/callback-runtime-client.mjs";
import {buildJourneyRegistrationRequest,buildIdentityV2JourneyActionRequest,buildIdentityV2WorkflowActionRequest,interpretJourneyResponse,runJourneyRecovery} from "../source/platform/bos-workflow-orchestrator/scripts/journey-runtime-client.mjs";
import {createBosExternalDependencyAdapter} from "../source/platform/bos-external-dependency-adapter/scripts/external-dependency-adapter.mjs";

// Entirely consumer-owned HTTP expectations. No provider, sibling source or live service.
const registration=JSON.parse(await readFile(new URL("./fixtures/journey-registration-contract.json",import.meta.url),"utf8"));
const identity="callback synthetic acceptance";
const prefix="/bos/apps/lead-director/api/v1/organizations/synthetic-org";
const link=operation=>({contract:{capability:"api.contract.get",input:{operation}}});
const action=(name,verb="state",payload_schema=null)=>({verb,method:verb==="state"?"GET":"POST",href:`${prefix}/journey-controls/ctrl_${name}`,payload_schema});
const acknowledgment={type:"object",required:["acknowledgment"],properties:{acknowledgment:{type:"object",required:["confirmed"],properties:{confirmed:{const:true}},additionalProperties:false}},additionalProperties:false};
const error=(code,message)=>({code,message,retryable:false,correlation_id:"corr_synthetic",details:[]});
const source={operation:"gmail.trigger",bosl_server_node:false,input_schema:{type:"object",properties:{},additionalProperties:false,"x-bos-callback-source":{event_schema:{type:"object",properties:{fields:{type:"object",properties:{subject:{type:"string"}}}}},match_fields:["$event.fields.subject"],dedupe_fields:["$event.fields.subject"]}}};
const report={as_of:"2026-10-14T00:00:00Z",callbacks:[{code:"mail",source:"gmail.trigger",requested:{queue:"journey",max_attempts:5,max_delay_seconds:300,retention_seconds:604800},granted:{queue:"journey",max_attempts:3,max_delay_seconds:300,retention_seconds:604800},adjustments:[{field:"max_attempts",requested:5,granted:3,reason:"PROFILE_LIMIT"}]}],waits:[{code:"wait",callback:"mail",requested:{ttl_seconds:10},granted:{ttl_seconds:10},adjustments:[]}],usage:[{resource:"registrations",scope:"organization",visibility:"visible",used:1,limit:5,remaining:4,reserved_by_submission:1}]};
function document() {
  return {identity,name:"Synthetic callback review",inputs:{},entry:"wait",bootstrap:{callbacks:[{code:"mail",source:"gmail.trigger",inputs:{},match:{left:{from:"$event.fields.subject"},op:"exists"}}],activate_on:"mail"},
    controls:{actions:[{verb:"start",roles:["director"]},{verb:"complete",roles:["director","frontdesk"]},{verb:"step",roles:["director"]}]},
    nodes:[{code:"wait",type:"server",operation:"bosl.callbacks.await",inputs:{callback:{value:"mail"},ttl_seconds:{value:10}},outputs:{},next:"review",catch:{cases:[{when:{left:{from:"$error.code"},op:"eq",right:{value:"CALLBACK_WAIT_EXPIRED"}},next:"done"}],default:"done"}},
      {code:"review",type:"client",inputs:{},outputs:{acknowledgment:acknowledgment.properties.acknowledgment},instruction:{goal:"review",message:"Review the synthetic event."},next:"done"},
      {code:"done",type:"server",inputs:{},outputs:{},terminal:true}]};
}
function catalogContract() {
  return {operation:"lead-director.journeys.workflows",contract_version:"lead-director-journey-registration/v1",status:"described",title:"Synthetic workflow catalog",description:"Consumer-owned acceptance contract.",
    input_schema:{type:"object",properties:{},additionalProperties:false},output_schema:{type:"object",required:["workflows","truncated"],properties:{workflows:{type:"array"},truncated:{type:"boolean"}},additionalProperties:false},
    limits:{maximum_duration_seconds:30,maximum_fan_out:1},execution:{transport:"https",method:"GET",uri:`${prefix}/journey-workflows`,context_header:"X-BOS-Context-Handle"},
    guarantees:{idempotent:true,server_owned_state:true,client_generated_keys:false},public_errors:[],ttlMs:0,cacheScope:"private"};
}

test("no-send callback lifecycle discovers, reviews, activates, pages and recovers current operator work",async()=>{
  const received=[];
  let activated=0,completions=0,phase="awaiting_client";
  const wrap=lifecycle=>({workflow_ref:"boswf_synthetic_fixture",target:{kind:"run",identity},is_author:false,can_edit:false,lifecycle,
    actions:{state:action("run_state"),...(phase==="awaiting_client"?{stop:action("stale_control","stop")}:{replay:action("replay_record","replay")})}});
  const state=()=>{
    if(phase==="awaiting_client") return wrap({identity,status:phase,current_step:{code:"review",type:"client"},instruction:{goal:"review",message:"Review the synthetic event.",after_success:action("complete_run","complete",acknowledgment),on_failure:action("fail_run","failed",{type:"object"})}});
    if(phase==="step_completed") return wrap({identity,status:phase,action:action("advance_run","step")});
    if(phase==="failure_caught") return wrap({identity,status:phase,error:error("CLIENT_STEP_FAILED","Synthetic recovery path."),action:action("finish_recovery","step")});
    return wrap({identity,status:"completed",outcome:{selected_path:"catch"}});
  };
  const workflow={workflow_ref:"boswf_synthetic_fixture",identity,name:"Synthetic callback review",is_author:false,can_edit:false,status:"in_progress",graph:{entry:"wait",nodes:[{code:"wait",type:"server",operation:"bosl.callbacks.await"}]},callbacks:[{code:"mail",source:"gmail.trigger"}],redactions:[],action:action("parent_state")};
  const standing=(runs,truncated)=>({identity,status:"in_progress",registration:{callback:"mail",active_since:report.as_of,expires_at:null,admission_status:"active",run_counts:{completed:1,awaiting_client:1},runs,runs_truncated:truncated,...(truncated?{next_page:action("runs_page")}:{})},retry_after_seconds:30,action:action("parent_state")});
  const server=createServer(async(req,res)=>{
    let raw="";for await(const chunk of req)raw+=chunk;
    received.push({method:req.method,url:req.url,context:req.headers["x-bos-context-handle"],body:raw?JSON.parse(raw):undefined});
    let status=200,body;
    if(req.url==="/fixture/discovery") body={journey_registration:link(registration.operation),workflow_catalog:link("lead-director.journeys.workflows"),workflow_control:link("lead-director.journeys.workflow-control"),sources:[source]};
    else if(req.url==="/fixture/registration-contract") body=registration;
    else if(req.url==="/fixture/catalog-contract") body=catalogContract();
    else if(req.url===registration.execution.uri) {assert.deepEqual(JSON.parse(raw),document());assert.equal(activated,0);body={compiled:true,identity,actions:{start:{verb:"start",method:"POST",href:`${prefix}/journeys/callback%20synthetic%20acceptance/start?capability=synthetic`,payload_schema:null}},callback_report:report};}
    else if(req.url.includes("/start?capability=")) {assert.equal(raw,"{}");activated=1;status=202;body=standing([],false);}
    else if(req.url===`${prefix}/journey-workflows`) body={workflows:[],truncated:true,next_page:action("catalog_page")};
    else if(req.url===action("catalog_page").href) body={workflows:[workflow],truncated:false};
    else if(req.url===action("parent_state").href) {status=202;body=standing([{status:"completed",action:action("earlier_run")}],true);}
    else if(req.url===action("runs_page").href) {status=202;body=standing([{status:phase,action:action("run_state")}],false);}
    else if(req.url===action("stale_control").href) {status=409;body={error:error("WORKFLOW_OPERATION_EXPIRED","Refresh the workflow catalog.")};}
    else if(req.url===action("run_state").href) body=state();
    else if(req.url===action("complete_run").href) {assert.deepEqual(JSON.parse(raw),{acknowledgment:{confirmed:true}});if(phase==="awaiting_client") {completions++;phase="step_completed";}body=state();}
    else if(req.url===action("advance_run").href) {phase="failure_caught";body=state();}
    else if(req.url===action("replay_record").href) body=state();
    else if(req.url===action("finish_recovery").href) {phase="completed";body=state();}
    else {status=404;body={error:error("JOURNEY_NOT_FOUND","Synthetic route unavailable.")};}
    res.writeHead(status,{"content-type":"application/json"});res.end(JSON.stringify(body));
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  let context="bos_ctx_v2_"+"a".repeat(64);
  let discoveredCatalog;
  const invoke=async request=>{const response=await fetch(origin+request.href,request);return {http_status:response.status,body:await response.json()};};
  const adapter=createBosExternalDependencyAdapter({
    contextProvider:{getCurrentContext:async()=>({contract_version:"bos-identity-mcp/v2",context:{context_handle:context,organization_name:"Synthetic Organization",application_name:"Lead Director",installation_name:"Primary",role_label:"Operator",is_default:true}}),getExecutionContextHeader:async()=>"X-BOS-Context-Handle"},
    hostTransport:{request:async request=>{const response=await invoke(request);return {status:response.http_status,body:response.body};},
      getProtectedResource:async()=>"https://dfsm.ai/mcp/apps/bos/platform",recoverAuthentication:async()=>{throw new Error("Unexpected authentication recovery");},
      captureExecutionScope:async()=>()=>true,verifyExecutionIntent:async()=>true}
  });
  const follow=async a=>{
    if(["stop","retire","replay"].includes(a.verb)) return invoke(buildIdentityV2WorkflowActionRequest(a,context));
    const response=a.verb==="state"?await adapter.invokeStateAction(a):await adapter.invokeReturnedAction(a);
    return {http_status:response.status,body:response.body};
  };
  const discoverCatalog=async()=>{
    const contract=discoveredCatalog;
    const response=await follow({verb:"state",method:contract.execution.method,href:contract.execution.uri,payload_schema:null});
    const first=interpretJourneyResponse(response);assert.equal(first.next,"workflow_catalog");
    return interpretJourneyResponse(await follow(first.body.next_page));
  };
  try {
    const discovery=await (await fetch(origin+"/fixture/discovery")).json();
    validateWorkflowCatalogDiscovery(discovery.workflow_catalog);validateWorkflowControlDiscovery(discovery.workflow_control);
    assert.equal(discovery.journey_registration.contract.input.operation,registration.operation);
    const contract=validateApiContractResponse(await (await fetch(origin+"/fixture/registration-contract")).json(),{operation:registration.operation});
    discoveredCatalog=validateApiContractResponse(await (await fetch(origin+"/fixture/catalog-contract")).json(),{operation:discovery.workflow_catalog.contract.input.operation});
    const findings=[];validateCallbackAuthoring(document(),discovery.sources,n=>[n.next,...(n.catch?.cases??[]).map(c=>c.next),n.catch?.default].filter(Boolean),findings);assert.deepEqual(findings,[]);
    const registrationRequest=buildJourneyRegistrationRequest(contract,context,document());
    const receipt=interpretJourneyResponse(await invoke(registrationRequest),{registrationRequest});
    assert.equal(receipt.next,"review_callback_grant");assert.equal(activated,0);
    assert.equal(reviewCallbackGrant(document(),receipt.callback_report).usage[0].remaining,4);
    const active=interpretJourneyResponse(await invoke(buildIdentityV2JourneyActionRequest(receipt.action,context)));
    assert.equal(active.next,"standing_workflow");assert.equal(activated,1);
    const catalog=await discoverCatalog();assert.equal(catalog.body.workflows[0].can_edit,false);
    const first=interpretJourneyResponse(await follow(catalog.body.workflows[0].action));
    assert.equal(first.registration.runs_truncated,true);
    const second=interpretJourneyResponse(await follow(first.registration.next_page));
    assert.equal(second.registration.runs_truncated,false);
    assert.notEqual(first.registration.runs[0].action.href,second.registration.runs[0].action.href);
    const selected=second.registration.runs[0].action;
    const waiting=interpretJourneyResponse(await follow(selected));assert.equal(waiting.next,"client_instruction");
    assert.equal(interpretJourneyResponse(await follow(waiting.workflow.actions.stop)).next,"refresh_workflow");
    const complete=waiting.instruction.after_success;
    const request=()=>buildIdentityV2WorkflowActionRequest(complete,context,{acknowledgment:{confirmed:true}});
    assert.throws(()=>buildIdentityV2WorkflowActionRequest(complete,context,{acknowledgment:{confirmed:false}}));
    await assert.rejects(invoke(request()).then(()=>{throw new Error("Simulated lost completion response");}),/lost completion/);
    context="bos_ctx_v2_"+"b".repeat(64); // A new host resumes through current discovery and returned state.
    assert.equal((await discoverCatalog()).body.workflows[0].identity,identity);
    const concurrent=await Promise.all([invoke(request()),invoke(request())]);
    assert.equal(completions,1);assert.deepEqual(concurrent[0].body,concurrent[1].body);
    const pending=wrap({identity,status:"in_progress",current_node:{code:"finish",type:"server",operation:"fixture.finish"},retry_after_seconds:1,action:selected});
    const recovered=await runJourneyRecovery({http_status:202,body:pending},{contextHandle:context,wait:async seconds=>assert.equal(seconds,1),invoke});
    const next=interpretJourneyResponse(recovered);assert.equal(next.next,"invoke_action");assert.equal(next.action.verb,"step");
    const caught=await follow(next.action);assert.equal(caught.body.lifecycle.status,"failure_caught");
    assert.deepEqual((await follow(caught.body.actions.replay)).body,caught.body);
    const terminal=interpretJourneyResponse(await follow(interpretJourneyResponse(caught).action));assert.equal(terminal.next,"terminal");
    assert.deepEqual(interpretJourneyResponse(await follow(terminal.workflow.actions.replay)).body,terminal.body);
    assert.equal(completions,1);assert.equal(activated,1);
    for(const entry of received.filter(r=>r.url.startsWith("/bos/"))) {assert.ok(["bos_ctx_v2_"+"a".repeat(64),context].includes(entry.context));if(entry.method==="GET")assert.equal(entry.body,undefined);}
    assert.equal(received.filter(r=>r.url===registration.execution.uri).length,1);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
