// Consumer-owned synthetic contract, intentionally minimal; no producer schema copy.
export const ref=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const closed=(properties,required=Object.keys(properties))=>({type:"object",additionalProperties:false,properties,required});
const string={type:"string"},nullable={type:["string","null"]};
export function syntheticOnboarding(audience="https://service.example.invalid/mcp/apps/bos/platform"){
  const action=closed({action_ref:string,verb:{enum:["observe","propose","amend","decide","revoke"]},target:string,subject:{type:"object"},expires_at:string});
  const snapshot=closed({account_ref:string,revision:{type:"integer"},items:{type:"array"},actions:{type:"array",items:action},pending_customer:{type:"array"},pending_service:{type:"array"}});
  const output={$defs:{snapshot},...closed({status:{enum:["select_account","read","applied","replayed","not_applied"]},accounts:{type:"array"},snapshot:{anyOf:[{$ref:"#/$defs/snapshot"},{type:"null"}]},receipt_ref:nullable})};
  return {feature:"customer-onboarding",descriptor_uri:"bos://platform/customer-onboarding/contract",execution_plane:"deterministic_https",audience,
    authentication:{connection:"existing_bos_identity",transport:"Authorization: Bearer",context_handle_required:false,credential_export:false,account_authority:"current_verified_manager_and_explicit_linked_grant"},
    readiness:{server:"available",host_execution:"requires_supported_authenticated_https_adapter",account:"evaluated_on_request"},
    operations:["read","action","state"].map(name=>({operation_id:"customer.onboarding."+name,method:"POST",uri:new URL("/api/v1/customer-onboarding/"+name,audience).href,
      input_schema:name==="read"?closed({account_ref:string},[]):name==="state"?closed({action_ref:string}):{oneOf:[closed({action_ref:string,decision:{enum:["confirm","revoke"]}}),closed({action_ref:string,value:{type:["string","number","boolean"]}}),closed({action_ref:string,statement:string})]},
      output_schema:output,error_schema:closed({error:closed({code:string})})})),recovery:{uncertain_action:"Read current state",stale_action:"Read current work",unauthenticated:"Use existing connection"}};
}
export function syntheticSnapshot(verb="decide",number=1){return{status:"read",accounts:[],snapshot:{account_ref:ref(100),revision:3,items:[],actions:[{action_ref:ref(number),verb,target:"requirement/public",subject:{item_ref:"requirement/public",revision:3,statement:"Review this synthetic requirement",validator:{type:"string",maxLength:80}},expires_at:new Date(Date.now()+60000).toISOString()}],pending_customer:[],pending_service:[]},receipt_ref:null};}
export const metadata=descriptor=>({jsonrpc:"2.0",id:"onboarding-metadata",result:{contents:[{uri:descriptor.descriptor_uri,mimeType:"application/json",text:JSON.stringify(descriptor)}]}});
