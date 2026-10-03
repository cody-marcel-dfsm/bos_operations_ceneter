import {pathToFileURL} from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import {permission,observe,body,sanitized,selectReviewerContext} from './marketplace-native-hook.mjs';
import {createInstalledAcceptance,installedPath,documentDigests} from './marketplace-native-resources.mjs';
import {readPublishedFile,verifyPublishedPackage} from './marketplace-published-package.mjs';
import {digest} from './marketplace-prompt-catalog.mjs';

const controls=new Set(['app.describe','plugins.list','service.describe','api.contract.get','discovery.refresh']);
const privateInput=value=>value&&typeof value==='object'&&Object.entries(value).some(([key,v])=>/^(?:context_handle|context_id|org_id|organization_id|tenant_id|role_id|installed_app_id|authorization|access_token|refresh_token|cookie)$/i.test(key)||privateInput(v));
const spec=(name,description,properties={},required=[])=>({type:'function',name,description,inputSchema:{type:'object',additionalProperties:false,properties,required}});
const definitions=[
  spec('acceptance_guard_probe','Verify the test guard by requesting a deliberate denial.'),
  spec('acceptance_guard_status','Check whether the deliberate denial was recorded.'),
  spec('acceptance_read_installed','Read a verified published installed skill or reference.',{product:{type:'string'},path:{type:'string'}},['path']),
  spec('acceptance_validate_installed','Validate an actual discovered document with the published validator. Supply its returned document_id; the host retains its exact original bytes.',{path:{type:'string'},mode:{type:'string'},document_id:{type:'string'}},['path','mode','document_id']),
  spec('bos_get_context','Discover and select the exact marketplace reviewer scope; the test host retains its private selector.'),
  spec('bos_list_context_tools','Discover tools for the selected reviewer scope.'),
  spec('bos_list_resources','List BOS discovery resources for the reviewer connection.'),
  spec('bos_read_resource','Read an advertised BOS discovery resource.',{uri:{type:'string'}},['uri']),
  spec('bos_control_discover','Run a discovered BOS control-plane operation. Business operations use bos_https_operation.',{operation:{type:'string',enum:[...controls]},arguments:{type:'object'}},['operation','arguments']),
  spec('bos_https_operation','Execute an operation contact returned by actual discovery through the published BOS HTTPS dependency adapter. Use the returned contact_id and its exact payload schema.',{contact_id:{type:'string'},payload:{}},['contact_id'])
];

export async function createReviewerTools({session,state,release}) {
  const installed=createInstalledAcceptance(state,async()=>state);
  const bos=release.dependency??release;
  await verifyPublishedPackage(bos.path,bos.release_commit);
  const adapterRelative='skills/bos-external-dependency-adapter/scripts/external-dependency-adapter.mjs';
  const adapterPath=await installedPath(bos.path,adapterRelative);
  await readPublishedFile(bos.path,bos.release_commit,adapterRelative);
  const {createBosExternalDependencyAdapter}=await import(pathToFileURL(adapterPath).href);
  const offered=(await session.rpc('tools/list')).tools;
  if(!Array.isArray(offered))throw new Error('reviewer_discovery_tools_missing');
  const documents=new Map(),contacts=new Map(),ajv=new Ajv({strict:false,validateFormats:false});
  const toolName=name=>{
    const rows=offered.filter(row=>row.name===name||row.name.replaceAll('_','.')===name.replaceAll('_','.'));
    if(rows.length!==1)throw new Error('reviewer_discovery_tool_missing');return rows[0].name;
  };
  const mcp=async(name,args)=>session.rpc('tools/call',{name:toolName(name),arguments:args});
  const freshContext=async()=>{
    const response=await mcp('bos.get_context',{}),value=body(response);
    if(response.isError)throw new Error('reviewer_identity_unverified');
    const selected=selectReviewerContext(value.contexts??value.authorized_contexts??[],state);
    if(!selected?.context_handle)throw new Error('reviewer_identity_unverified');
    if(state.handle&&state.handle!==selected.context_handle){documents.clear();contacts.clear();state.validated_contracts={};state.failed_validations={};throw new Error('reviewer_discovery_refresh_required');}
    state.handle=selected.context_handle;
    return {contract_version:value.contract_version,context:Object.fromEntries(['context_handle','organization_name','application_name','installation_name','role_label','is_default'].map(key=>[key,selected[key]]))};
  };
  const adapter=createBosExternalDependencyAdapter({
    contextProvider:{getCurrentContext:freshContext,getExecutionContextHeader:async()=> 'X-BOS-Context-Handle'},
    hostTransport:{getProtectedResource:async()=>state.resource,recoverAuthentication:async()=>{throw new Error('reviewer_reauthentication_required');},request:async request=>{
      const response=await session.request(new URL(request.href,state.resource).href,{method:request.method,headers:request.headers,body:request.body});
      let responseBody;try{responseBody=await response.json();}catch{throw new Error('reviewer_api_response_invalid');}
      return {status:response.status,headers:Object.fromEntries(response.headers),body:responseBody};
    }}
  });
  const expose=value=>{
    const raw=body(value),id=digest(raw);documents.set(id,structuredClone(raw));
    const advertised=[];
    const collect=(item,foreign=false)=>{
      if(typeof item==='string'){try{collect(JSON.parse(item),foreign);}catch{}return;}
      if(!item||typeof item!=='object')return;
      foreign||=!!item.context_handle&&item.context_handle!==state.handle;
      foreign||=!!item.server&&!['BOS-Platform','BOS_Platform'].includes(item.server);
      if(foreign)return;
      if(item.status==='described'&&item.operation&&item.execution&&item.input_schema){const contactId=digest(item);contacts.set(contactId,structuredClone(item));documents.set(contactId,structuredClone(item));advertised.push({contact_id:contactId,document_id:contactId,contact:sanitized(item)});}
      for(const nested of Object.values(item))collect(nested,foreign);
    };
    collect(raw);
    return {document_id:id,document:sanitized(raw),...(advertised.length?{advertised_https_contacts:advertised}:{})};
  };
  const guarded=async(event,run)=>{
    state.pre_calls=(state.pre_calls??0)+1;
    const denial=permission(event,state);
    if(denial){state.denials.push({tool:event.tool_name,reason:denial});return {isError:true,reason:denial};}
    const previousHandle=state.handle;
    const response=await run();observe({...event,tool_response:response},state);
    if(state.handle!==previousHandle){documents.clear();contacts.clear();}
    return response?.isError?{isError:true,...expose(response)}:expose(response);
  };
  const call=async(name,args={})=>{
    if(privateInput(args))throw new Error('reviewer_authority_argument');
    if(name.startsWith('acceptance_')){
      const short=name.slice('acceptance_'.length);const event={tool_name:'mcp__Acceptance__'+short,tool_input:args};
      if(short==='validate_installed'){
        const original=documents.get(args.document_id);if(!original)throw new Error('reviewer_document_not_observed');
        const target=args.mode==='api-contract'?original.response:args.mode==='service-journey'?original.description:original;
        if(!state.observed_document_digests?.includes(documentDigests(target)[0]))throw new Error('reviewer_document_not_observed');
        event.tool_input={path:args.path,mode:args.mode,document:original};
      }
      state.pre_calls=(state.pre_calls??0)+1;const denied=permission(event,state);
      if(denied){state.denials.push({tool:name,reason:denied});return {isError:true,reason:denied};}
      const result=await installed.call(short,event.tool_input);observe({...event,tool_response:result},state);return result;
    }
    if(name==='bos_get_context')return guarded({tool_name:'mcp__BOS__bos_get_context',tool_input:{}},async()=>{
      const response=await mcp('bos.get_context',{});return response;
    });
    if(name==='bos_list_context_tools')return guarded({tool_name:'mcp__BOS__bos_list_context_tools',tool_input:{context_handle:state.handle}},()=>mcp('bos.list_context_tools',{context_handle:state.handle}));
    if(name==='bos_list_resources')return guarded({tool_name:'list_mcp_resources',tool_input:{server:'BOS-Platform'}},()=>session.rpc('resources/list'));
    if(name==='bos_read_resource'){
      const matches=(state.resources??[]).filter(uri=>sanitized(uri)===args.uri);
      if(matches.length!==1)throw new Error('reviewer_resource_not_observed');
      return guarded({tool_name:'read_mcp_resource',tool_input:{server:'BOS-Platform',uri:matches[0]}},()=>session.rpc('resources/read',{uri:matches[0]}));
    }
    if(name==='bos_control_discover'){
      if(!controls.has(args.operation))throw new Error('reviewer_mcp_business_call_forbidden');
      return guarded({tool_name:'mcp__BOS__bos_execute',tool_input:{context_handle:state.handle,tool_name:args.operation,arguments:args.arguments}},()=>mcp('bos.execute',{context_handle:state.handle,tool_name:args.operation,arguments:args.arguments}));
    }
    if(name!=='bos_https_operation')throw new Error('reviewer_tool_unknown');
    const contact=contacts.get(args.contact_id);if(!contact)throw new Error('reviewer_contact_not_observed');
    if(!state.canary||state.kind==='negative'||!state.handle)throw new Error('reviewer_business_guard_required');
    if(!state.validated_contracts?.['app-describe']||Object.values(state.failed_validations??{}).some(Boolean))throw new Error('reviewer_published_prerequisite_required');
    if(!state.allowed_effects?.includes(contact.effect))throw new Error('reviewer_effect_not_approved');
    if(contact.effect!=='read'&&!(state.effect_binding?.operation===contact.operation&&state.effect_binding.effect===contact.effect&&state.effect_binding.input_sha256===digest(args.payload??{})))throw new Error('reviewer_effect_not_approved');
    const result=Object.hasOwn(args,'payload')?await adapter.invokeDiscoveredOperation(contact,args.payload):await adapter.invokeDiscoveredOperation(contact);
    const valid=result.status>=200&&result.status<300&&ajv.compile(contact.output_schema)(result.body);
    state.observations.push({tool:contact.operation,input:sanitized(args.payload??{}),response:sanitized(result),scope_verified:true,is_error:!valid,transport:'https',contact_sha256:args.contact_id});
    if(!valid)throw new Error('reviewer_api_contract_failed');
    return {status:result.status,body:sanitized(result.body),operation:contact.operation,transport:'https'};
  };
  return {definitions,call:async(name,args)=>{
    try{return await call(name,args);}catch{
      state.observations.push({tool:name,input:sanitized(args),response:{reason:'reviewer_tool_failed'},is_error:true});
      if(state.kind==='negative')state.denials.push({tool:name,reason:'negative_case_business_call'});
      return {isError:true,reason:'reviewer_tool_failed'};
    }
  }};
}
