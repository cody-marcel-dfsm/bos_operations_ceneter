import {readFile} from 'node:fs/promises';

// Consumer-owned synthetic contracts; never import a service schema or capture.
const original=JSON.parse(await readFile(new URL('../fixtures/journey-registration-contract.json',import.meta.url),'utf8'));
const closed=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const action=()=>structuredClone(original.output_schema.oneOf.find(v=>v.properties?.status?.const==='in_progress').properties.action);

export function legacyRegistrationContract(){return structuredClone(original);}

export function currentRegistrationContract(){
  const value=legacyRegistrationContract();
  value.related_contracts=[{capability:'api.contract.get',input:{operation:'lead-director.journeys.participations.read'}}];
  value.output_schema.oneOf.push(closed({identity:{type:'string'},status:{const:'in_progress'},registration:{type:'object'},retry_after_seconds:{type:'integer',minimum:1,maximum:900},action:action()}));
  value.output_schema.oneOf.push(closed({identity:{type:'string'},status:{const:'awaiting_branches'},current_node:closed({code:{type:'string'},type:{const:'parallel'}}),branches:{type:'array',maxItems:256,items:closed({index:{type:'integer',minimum:0},status:{type:'string'},current_node:{type:['string','null']},current_step:{type:'object'},instruction:{type:'object'},action:action(),error:{type:'object'},resolution:{type:'object'},retry_after_seconds:{type:'integer',minimum:1,maximum:900}},['index','status','current_node'])},action:action()}));
  value.public_errors.push({code:'PAID_PLAN_REQUIRED',http_status:403,retryable:false},{code:'MCP_ENTITLEMENT_UNAVAILABLE',http_status:503,retryable:true});
  return value;
}

export function returnedAction(verb='step'){
  return {verb,method:verb==='state'?'GET':'POST',href:`/bos/apps/lead-director/api/v1/organizations/synthetic-org/journeys/synthetic-branches/${verb}?capability=synthetic-capability`,payload_schema:null};
}

export function branchWaitResponse(){
  return {http_status:200,body:{identity:'synthetic-branches',status:'awaiting_branches',current_node:{code:'parallel-work',type:'parallel'},branches:[{index:0,status:'service_defined_branch_status',current_node:null},{index:1,status:'awaiting_client',current_node:'client-work',current_step:{code:'client-work',type:'client'},instruction:{goal:'synthetic_work',message:'Complete the synthetic client work.',after_success:returnedAction('complete'),on_failure:returnedAction('failed')}}],action:returnedAction('step')}};
}

export const syntheticDocument={identity:'synthetic-branches',name:'Synthetic client work',inputs:{},entry:'done',nodes:[{code:'done',type:'server',inputs:{},outputs:{},terminal:true}]};
