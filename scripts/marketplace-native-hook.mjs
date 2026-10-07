import {readFile, writeFile} from 'node:fs/promises';
import {digest} from './marketplace-prompt-catalog.mjs';
import Ajv from 'ajv/dist/2020.js';
import {documentDigests} from './marketplace-native-resources.mjs';
const ajv = new Ajv({strict:false, validateFormats:false});
export function body(value) {
 if (typeof value === 'string') {try{return body(JSON.parse(value));}catch{return value;}}
 if (value?.structuredContent) return value.structuredContent;
 if (Array.isArray(value?.content)) {for (const row of value.content) {if(row.type==='text') {const result=body(row.text); if(typeof result==='object') return result;}}}
 return value;
}
export function sanitized(value, trustedOrigin) {
 if(typeof value==='string') return value.replace(/bos_ctx_v2_[a-f0-9]{64}/giu,'[context]').replace(/Bearer\s+\S+/giu,'[credential]').replace(/context_handle=[^&\s]+/giu,'context_handle=[context]');
 if(Array.isArray(value)) return value.map(row=>sanitized(row,trustedOrigin));
 if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).flatMap(([key,v])=>{
  if(key==='required_authorizations'&&Array.isArray(v))return [[key,v.map(row=>{
   if(!row||typeof row!=='object'||Array.isArray(row))return {};
   const safe={};
   if(['oauth','api_key'].includes(row.authorization_kind))safe.authorization_kind=row.authorization_kind;
   if(typeof row.status==='string'&&/^[a-z][a-z0-9_]{0,63}$/.test(row.status))safe.status=row.status;
   if(typeof row.authorization_url==='string'){
    try{const url=new URL(row.authorization_url);if(url.protocol==='https:'&&(!trustedOrigin||url.origin===trustedOrigin)&&!url.username&&!url.password&&!url.hash)safe.authorization_url=`${url.origin}${url.pathname}${url.search?'?[query redacted]':''}`;}catch{}
   }
   return safe;
  })]];
  if(/(?:token|secret|password|credential|authorization|cookie|context_handle|context_id|org_id|organization_id|tenant_id|user_id|role_id|installation_id|installed_app_id)/iu.test(key))return [];
  return [[key,sanitized(v,trustedOrigin)]];
 }));
 return value;
}
const nameOf = event => event.tool_name?.split('__').at(-1)?.replaceAll('_','.');
const selectors = value => value && typeof value==='object' && Object.entries(value).some(([key,v])=>/^(?:context_handle|context_id|org_id|organization_id|tenant_id|role_id|installed_app_id|authorization|access_token|refresh_token)$/iu.test(key)||selectors(v));
export function permission(event, state) {
 const name=nameOf(event), input=event.tool_input??{};
 if(event.tool_name?.includes('Acceptance')) {
  if(name==='guard.probe') {state.canary=true;return 'guard_canary_denied';}
  if(['guard.status','read.installed','validate.installed'].includes(name)) return null;
  if(['compare.schemas','project.contract.facts'].includes(name))return state.canary&&['positive','starter'].includes(state.kind)&&state.handle&&state.allowed_effects?.includes('read')&&state.validated_contracts?.['app-describe']&&!Object.values(state.failed_validations??{}).some(Boolean)?null:'published_prerequisite_required';
 }
 if(['update_plan'].includes(event.tool_name)) return null;
 if(!state.canary) return 'guard_canary_required';
 if(state.kind==='negative') return 'negative_case_business_call';
 if(name==='bos.get.context') return null;
 if(!state.handle) return 'reviewer_scope_required';
 if(name==='bos.list.context.tools') return input.context_handle===state.handle?null:'wrong_scope';
 if(state.kind==='negative') return 'negative_case_business_call';
 if(name==='read.mcp.resource') return (!input.server||['BOS-Platform','BOS_Platform'].includes(input.server)) && state.resources?.includes(input.uri)?null:'undiscovered_resource';
 if(name==='list.mcp.resources'||name==='list.mcp.resource.templates') return (!input.server||['BOS-Platform','BOS_Platform'].includes(input.server))?null:'wrong_server';
 if(!event.tool_name?.includes('BOS')) return 'unapproved_tool';
 if(input.context_handle!==state.handle) return 'wrong_scope';
 const operation=name==='bos.execute'?input.tool_name:name;
 const args=name==='bos.execute'?input.arguments:Object.fromEntries(Object.entries(input).filter(([k])=>k!=='context_handle'));
 if(selectors(args)) return 'authority_argument';
 const descriptor=state.tools?.find(row=>row.name===operation||row.name.replaceAll('_','.')===operation);
 if(!descriptor) return 'undiscovered_operation';
 const control=['app.describe','plugins.list','service.describe','api.contract.get','discovery.refresh'].includes(operation);
 const declared=descriptor._meta?.['bos/effect'];
 const capabilityRead=/\.read$/.test(descriptor._meta?.['bos/capability']??'');
 const effect=declared==='resource'&&capabilityRead?'read':declared;
 const hint=descriptor.annotations?.readOnlyHint;
 if((effect==='read'&&(hint===false||descriptor.annotations?.destructiveHint===true))||(effect!=='read'&&hint===true))return 'contradictory_effect_metadata';
 if(!['read','write','connect','prepare','draft'].includes(effect)||!state.allowed_effects?.includes(effect))return 'unapproved_effect';
 const binding=state.effect_binding;
 const bounded=!!binding && binding.operation===operation && binding.effect===effect && binding.input_sha256===digest(args);
 if(effect!=='read'&&!bounded)return 'unapproved_effect';
 if(state.product==='my-crm'&&!control) return 'crm_requires_advertised_https';
 try {if(!ajv.compile(descriptor.inputSchema)(args)) return 'invalid_input';}catch{return 'unsupported_schema';}
 if(Object.values(state.failed_validations??{}).some(Boolean))return 'published_prerequisite_failed';
 if(!control&&!state.validated_contracts?.['app-describe'])return 'published_prerequisite_required';
 return null;
}
export function selectReviewerContext(contexts,state) {
 if(![state.organization,state.role,state.application,state.installation].every(value=>typeof value==='string'&&value.trim()))return null;
 const match=contexts.filter(row=>row.organization_name===state.organization&&row.role_label===state.role&&row.application_name===state.application&&row.installation_name===state.installation);
 return match.length===1?match[0]:null;
}
export function advertisedResource(uri,state,inherited=false) {
 try {
  const parsed=new URL(uri);if(parsed.protocol!=='bos:'||parsed.username||parsed.password||parsed.hash)return false;
  for(const key of parsed.searchParams.keys())if(/^(?:org_id|organization_id|tenant_id|role_id|context_id|token|access_token|authorization)$/i.test(key))return false;
  const handle=parsed.searchParams.get('context_handle');
  if(handle!==null)return handle===state.handle;
  if(/bos_ctx_v2_/.test(uri))return false;
  return inherited||state.resources?.includes(uri);
 }catch{return false;}
}
const resourcePrefix=uri=>{const parsed=new URL(uri);return parsed.protocol+'//'+parsed.host+'/'+parsed.pathname.split('/').filter(Boolean)[0]+'/';};
export function recordValidation(event,state) {
 const name=nameOf(event);if(name!=='validate.installed')return;
 const input=event.tool_input??{},mode=input.mode;
 const target=mode==='api-contract'?input.document?.response:mode==='service-journey'?input.document?.description:input.document;
 const hash=documentDigests(target)[0];const response=body(event.tool_response);
 const passed=!!hash&&state.observed_document_digests?.includes(hash)&&response?.valid===true&&event.tool_response?.isError!==true;
 state.failed_validations??={};state.failed_validations[mode+':'+hash]=!passed;
 state.validated_contracts??={};if(passed)state.validated_contracts[mode]=hash;else delete state.validated_contracts[mode];
 state.validated_document_proofs??={};
 if(['operation-describe','api-contract'].includes(mode)){
  if(passed&&state.handle&&state.selected_scope)state.validated_document_proofs[hash]={mode,context_handle:state.handle,scope:{...state.selected_scope}};
  else delete state.validated_document_proofs[hash];
 }
}
export function observe(event,state) {
 const name=nameOf(event);let response=body(event.tool_response);
 recordValidation(event,state);
 if(name==='bos.get.context') {
  const contexts=response?.contexts??response?.authorized_contexts??[];
  const selected=selectReviewerContext(contexts,state);const match=selected?[selected]:[];
  if(selected){if(state.handle!==selected.context_handle){state.resources=[];state.tools=[];state.validated_contracts={};state.failed_validations={};state.observed_document_digests=[];}state.handle=selected.context_handle;state.default_scope_selected=selected.is_default===true;}else{delete state.handle;state.resources=[];state.tools=[];state.validated_contracts={};state.failed_validations={};state.observed_document_digests=[];state.default_scope_selected=false;}
  if(!selected||state.selected_scope?.context_handle!==state.handle)state.validated_document_proofs={};
  state.selected_scope=selected?{organization:selected.organization_name,application:selected.application_name,installation:selected.installation_name,role:selected.role_label,context_handle:state.handle}:null;
  response={contract_version:response?.contract_version,contexts:match};
 }
 if(name==='bos.list.context.tools' && event.tool_input?.context_handle===state.handle) state.tools=response?.tools??[];
 const bosServer=!event.tool_input?.server||['BOS-Platform','BOS_Platform'].includes(event.tool_input.server);
 const contextBound=event.tool_input?.context_handle===state.handle&&!!state.handle;
 const listed=['list.mcp.resources','list.mcp.resource.templates'].includes(name)&&bosServer;
 const nested=name==='read.mcp.resource'&&bosServer&&state.resources?.includes(event.tool_input?.uri);
 const inherited=contextBound||nested||(listed&&response?.context_handle===state.handle&&!!state.handle);
 const prefixes=(state.resources??[]).map(uri=>{try{return resourcePrefix(uri);}catch{return '';}});
 const collect=value=>{
  if(typeof value==='string'){try{const parsed=JSON.parse(value);if(parsed&&typeof parsed==='object')collect(parsed);}catch{}return;}
  if(!value||typeof value!=='object')return;
  if(typeof value.server==='string'&&!['BOS-Platform','BOS_Platform'].includes(value.server))return;
  if(typeof value.context_handle==='string'&&value.context_handle!==state.handle)return;
  for(const [key,v]of Object.entries(value)){
   if(['uri','resource_uri','schema_uri','reference_uri','examples_uri'].includes(key)&&typeof v==='string'&&v.startsWith('bos://')){
    const defaultBound=listed&&state.default_scope_selected===true&&prefixes.some(prefix=>prefix&&v.startsWith(prefix));
    if(advertisedResource(v,state,inherited||defaultBound))state.resources=[...new Set([...(state.resources??[]),v])];
   }else if(typeof v==='object'||typeof v==='string')collect(v);
  }
 };
 if(contextBound||listed||nested)collect(response);
 if(!['guard.status','read.installed','validate.installed'].includes(name))state.observed_document_digests=[...new Set([...(state.observed_document_digests??[]),...documentDigests(response)])];
 state.observations.push({tool:name, input:sanitized(event.tool_input), response:sanitized(response), scope_verified:!!state.handle, is_error:event.tool_response?.isError===true});
}
async function main() {
 const file=process.argv[2];const state=JSON.parse(await readFile(file,'utf8'));
 let input='';for await(const chunk of process.stdin) input+=chunk;
 const event=JSON.parse(input);
 if(event.hook_event_name==='PreToolUse') {
  const reason=permission(event,state);state.pre_calls=(state.pre_calls??0)+1;
  if(reason) state.denials.push({tool:nameOf(event),reason,server:event.tool_input?.server});
  await writeFile(file,JSON.stringify(state),{mode:0o600});
  if(reason) {process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:reason}}));}
 } else {observe(event,state);await writeFile(file,JSON.stringify(state),{mode:0o600});}
}
if(process.argv[1]?.endsWith('/marketplace-native-hook.mjs'))main().catch(()=>{process.stderr.write('Acceptance guard failed closed');process.exitCode=2;});
