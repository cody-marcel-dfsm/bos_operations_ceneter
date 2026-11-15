// Closed identity-only client. The trusted existing host owns authentication,
// resource discovery and HTTPS; this module has no credential or network API.
import {createHash,randomUUID} from "node:crypto";
import Ajv from "../../bos-workflow-orchestrator/scripts/vendor/ajv2020.bundle.mjs";
export const onboardingResource="bos://platform/customer-onboarding/contract";
const names=["read","action","state"],verbs=["observe","propose","amend","decide","revoke"];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const object=value=>value&&typeof value==="object"&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const copy=value=>structuredClone(value);
const canonical=value=>JSON.stringify(value&&typeof value==="object"?Array.isArray(value)?value.map(item=>JSON.parse(canonical(item))):Object.fromEntries(Object.keys(value).sort().map(key=>[key,JSON.parse(canonical(value[key]))])):value);
const digest=value=>createHash("sha256").update(canonical(value)).digest("hex");
export class OwnOnboardingError extends Error {constructor(code="unavailable"){super("Own onboarding unavailable; retain current intent and use the existing connection.");this.code=code;}}
const fail=code=>{throw new OwnOnboardingError(code);};
export function parseOwnJson(text,maximum=1048576){
  if(typeof text!=="string"||Buffer.byteLength(text)>maximum)fail("invalid_json");
  let at=0;const ws=()=>{while(at<text.length&&/[\x20\t\r\n]/u.test(text[at]))at++;};
  const string=()=>{const re=/"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;re.lastIndex=at;const found=re.exec(text);if(!found)fail("invalid_json");at=re.lastIndex;return JSON.parse(found[0]);};
  const value=depth=>{if(depth>48)fail("invalid_json");ws();if(text[at]==='"'){string();return;}
    if(text[at]==="{"||text[at]==="["){const obj=text[at++]==="{",end=obj?"}":"]",keys=new Set();ws();if(text[at]===end){at++;return;}
      while(true){ws();if(obj){const key=string();if(keys.has(key))fail("duplicate_json_key");keys.add(key);ws();if(text[at++]!==":")fail("invalid_json");}value(depth+1);ws();const next=text[at++];if(next===end)return;if(next!==",")fail("invalid_json");}}
    const re=/(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/y;re.lastIndex=at;const token=re.exec(text);if(!token||!Number.isNaN(Number(token[0]))&&!Number.isFinite(Number(token[0])))fail("invalid_json");at=re.lastIndex;};
  value(0);ws();if(at!==text.length)fail("invalid_json");return JSON.parse(text);
}
export function platformAudience(value){
  let url;try{url=new URL(value);}catch{fail("audience_mismatch");}
  if(url.protocol!=="https:"||url.href!==value||url.username||url.password||url.search||url.hash||url.pathname==="/")fail("audience_mismatch");return url;
}
function compile(schema){let count=0;const inspect=(row,depth)=>{if(++count>20000||depth>48)fail("invalid_schema");if(row&&typeof row==="object")for(const[key,value]of Object.entries(row)){
  if(["$ref","$dynamicRef"].includes(key)&&(typeof value!=="string"||!value.startsWith("#")))fail("invalid_schema");inspect(value,depth+1);}};inspect(schema,0);
  try{return new Ajv({strict:false,validateFormats:false}).compile(schema);}catch{fail("invalid_schema");}}
export function admitOnboardingDescriptor(value,audience){
  const resource=platformAudience(audience);value=copy(value);
  if(!exact(value,["feature","descriptor_uri","execution_plane","audience","authentication","readiness","operations","recovery"])||value.feature!=="customer-onboarding"||value.descriptor_uri!==onboardingResource||value.execution_plane!=="deterministic_https"||value.audience!==audience)fail("invalid_contract");
  const auth=value.authentication;
  if(!exact(auth,["connection","transport","context_handle_required","credential_export","account_authority"])||auth.connection!=="existing_bos_identity"||auth.transport!=="Authorization: Bearer"||auth.context_handle_required!==false||auth.credential_export!==false||auth.account_authority!=="current_verified_manager_and_explicit_linked_grant")fail("invalid_contract");
  if(!exact(value.readiness,["server","host_execution","account"])||value.readiness.server!=="available"||value.readiness.host_execution!=="requires_supported_authenticated_https_adapter"||value.readiness.account!=="evaluated_on_request"||!exact(value.recovery,["uncertain_action","stale_action","unauthenticated"])||Object.values(value.recovery).some(row=>typeof row!=="string"||row.length>4000))fail("invalid_contract");
  if(!Array.isArray(value.operations)||value.operations.length!==3)fail("invalid_contract");const operations=new Map();
  for(const row of value.operations){const name=names.find(name=>row.operation_id==="customer.onboarding."+name);if(!name||operations.has(name)||!exact(row,["operation_id","method","uri","input_schema","output_schema","error_schema"])||row.method!=="POST")fail("invalid_contract");
    let uri;try{uri=new URL(row.uri);}catch{fail("invalid_contract");}
    if(uri.href!==row.uri||uri.origin!==resource.origin||uri.username||uri.password||uri.search||uri.hash||uri.pathname!=="/api/v1/customer-onboarding/"+name)fail("audience_mismatch");
    operations.set(name,{...row,input:compile(row.input_schema),output:compile(row.output_schema),error:compile(row.error_schema)});
  }
  return Object.freeze({descriptor:value,fingerprint:digest(value),operations});
}
export function parseOnboardingMetadata(value,audience){
  if(typeof value==="string")value=parseOwnJson(value);
  if(!exact(value,["jsonrpc","id","result"])||value.jsonrpc!=="2.0"||value.id!=="onboarding-metadata"||!exact(value.result,["contents"])||!Array.isArray(value.result.contents)||value.result.contents.length!==1)fail("invalid_metadata");
  const row=value.result.contents[0];if(!exact(row,["uri","mimeType","text"])||row.uri!==onboardingResource||row.mimeType!=="application/json")fail("invalid_metadata");return admitOnboardingDescriptor(parseOwnJson(row.text),audience);
}
export async function createCustomerOnboarding({host}){
  const methods=["getOwnOnboardingCapabilities","getProtectedResource","readOwnOnboardingContract","captureIdentityScope","invokeOwnOnboardingOperation"];
  if(methods.some(name=>typeof host?.[name]!=="function"))return Object.freeze({available:false,reason:"supported_authenticated_https_host_required"});
  let live=true,current=null,uncertain=null,writing=false;const presentations=new Map(),attempted=new Set();
  const clear=()=>{current=null;presentations.clear();};
  const captured=await host.captureIdentityScope();if(typeof captured!=="function")fail("identity_scope_unavailable");
  const audience=await host.getProtectedResource();platformAudience(audience);
  const guard=async own=>{if(!live||await captured()!==true||await host.getProtectedResource()!==audience){live=false;clear();fail("identity_changed");}
    const cap=await host.getOwnOnboardingCapabilities();if(cap.metadataRead!==true||own&&(cap.credentialKind!=="oauth"||cap.ownWork!==true)){clear();fail("eligible_existing_oauth_host_required");}};
  await guard(false);const admitted=admitOnboardingDescriptor(await host.readOwnOnboardingContract(),audience);await guard(false);
  const cap=await host.getOwnOnboardingCapabilities();if(cap.credentialKind!=="oauth"||cap.ownWork!==true)return Object.freeze({available:false,reason:"eligible_existing_oauth_host_required",descriptor:copy(admitted.descriptor),account:"not_evaluated"});
  const refresh=async()=>{await guard(true);const now=admitOnboardingDescriptor(await host.readOwnOnboardingContract(),audience);await guard(true);if(now.fingerprint!==admitted.fingerprint){clear();fail("contract_changed");}};
  const invoke=async(name,payload,onDispatch=()=>{})=>{
    await refresh();const row=admitted.operations.get(name);if(!row.input(payload))fail("invalid_payload");
    onDispatch();const reply=await host.invokeOwnOnboardingOperation({operationId:row.operation_id,payload:copy(payload),contractFingerprint:admitted.fingerprint});await guard(true);
    if(!exact(reply,["status","body"])||!Number.isSafeInteger(reply.status))fail("invalid_response");
    if(reply.status!==200){clear();if(!row.error(reply.body))fail("invalid_response");return{ok:false,code:reply.body.error.code};}
    if(!row.output(reply.body))fail("invalid_response");return{ok:true,body:copy(reply.body)};
  };
  const actions=()=>{
    const list=current?.snapshot?.actions;if(!Array.isArray(list))return[];const seen=new Set();
    for(const action of list){if(!object(action)||!uuid.test(action.action_ref)||seen.has(action.action_ref)||!verbs.includes(action.verb)||typeof action.target!=="string"||!object(action.subject)||!Number.isFinite(Date.parse(action.expires_at)))fail("invalid_snapshot");seen.add(action.action_ref);}
    return list;
  };
  const action=ref=>{const found=actions().find(row=>row.action_ref===ref);if(!found||Date.parse(found.expires_at)<=Date.now())fail("current_action_required");return found;};
  const install=body=>{clear();current=copy(body);actions();};
  const state=async(actionRef=uncertain)=>{if(!uuid.test(actionRef))fail("action_reference_required");const reply=await invoke("state",{action_ref:actionRef});if(reply.ok&&reply.body.snapshot)install(reply.body);if(reply.ok&&["applied","not_applied"].includes(reply.body.status)&&uncertain===actionRef)uncertain=null;return reply;};
  return Object.freeze({available:true,account:"evaluated_on_request",
    async read(payload){clear();const reply=await invoke("read",payload);if(reply.ok){install(reply.body);}return reply;},
    async present(actionRef){await guard(true);const row=action(actionRef);if(!["decide","revoke"].includes(row.verb))fail("confirmation_not_applicable");
      if(presentations.size>=16)presentations.clear();const presentationRef=randomUUID();presentations.set(presentationRef,{action:canonical(row),ref:actionRef});return{presentation_ref:presentationRef,action_ref:actionRef,verb:row.verb,target:row.target,subject:copy(row.subject)};},
    async act(payload,confirmation){
      if(writing)fail("action_in_progress");writing=true;try {
      await guard(true);if(!object(payload)||Object.keys(payload).length!==2||!uuid.test(payload.action_ref))fail("invalid_payload");const row=action(payload.action_ref);
      if(attempted.has(payload.action_ref))return{ok:false,code:"action_state_required",action_ref:payload.action_ref};
      const key=row.verb==="observe"?"value":["propose","amend"].includes(row.verb)?"statement":"decision";
      if(!Object.hasOwn(payload,key)||payload[key]===null)fail("invalid_payload");
      if(key==="value"&&(!["string","number","boolean"].includes(typeof payload.value)||typeof payload.value==="number"&&!Number.isFinite(payload.value)))fail("invalid_payload");
      if(["decide","revoke"].includes(row.verb)){
        const ticket=confirmation&&presentations.get(confirmation.presentation_ref);
        if(!exact(confirmation,["presentation_ref","confirmed"])||confirmation.confirmed!==true||!ticket||ticket.ref!==row.action_ref||ticket.action!==canonical(row)||payload.decision!==(row.verb==="decide"?"confirm":"revoke"))fail("explicit_current_confirmation_required");
        presentations.delete(confirmation.presentation_ref);
      }
      const request=admitted.operations.get("action");if(!request.input(payload))fail("invalid_payload");
      if(attempted.size>=256)fail("action_state_required");
      let dispatched=false;
      try{const result=await invoke("action",payload,()=>{if(canonical(action(payload.action_ref))!==canonical(row))fail("current_action_required");dispatched=true;attempted.add(payload.action_ref);});if(result.ok){install(result.body);}else if(["conflict","stale_action"].includes(result.code))clear();return result;}
      catch(error){if(!dispatched)throw error;uncertain=payload.action_ref;return{ok:false,code:"uncertain_action",action_ref:uncertain};}
      }finally{writing=false;}
    },
    state,
    async recover(){if(!uncertain)return{ok:false,code:"no_uncertain_action"};const ref=uncertain,reply=await state(ref);return{...reply,action_ref:ref,next:"review_current_state"};},
    retire(){live=false;clear();},
    get uncertainAction(){return uncertain;}
  });
}
