import {pathToFileURL} from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import {permission,observe,body,sanitized,selectReviewerContext} from './marketplace-native-hook.mjs';
import {createInstalledAcceptance,installedPath,documentDigests,installedValidatorModes} from './marketplace-native-resources.mjs';
import {readPublishedFile,verifyPublishedPackage} from './marketplace-published-package.mjs';
import {digest} from './marketplace-prompt-catalog.mjs';
import {trustedUrl} from './marketplace-reviewer-session.mjs';

import {reviewerFailureCode} from './marketplace-reviewer-diagnostics.mjs';

const controls=new Set(['app.describe','plugins.list','service.describe','api.contract.get','discovery.refresh']);
export function reviewerDiscoveryDocument(value,state,resourceUri) {
  let document=body(value);
  let extracted=false;
  const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
  if(!object(document))throw new Error('reviewer_document_invalid');
  if((Object.hasOwn(document,'contents')||(document.contract_version==='bos-identity-mcp/v2'&&Object.hasOwn(document,'result')))&&Object.hasOwn(document,'server')&&!['BOS-Platform','BOS_Platform'].includes(document.server))throw new Error('reviewer_document_scope_invalid');
  if(Object.hasOwn(document,'contents')) {
    if((Object.hasOwn(document,'context_handle')&&document.context_handle!==state.handle)||(Object.hasOwn(document,'server')&&!['BOS-Platform','BOS_Platform'].includes(document.server)))throw new Error('reviewer_document_scope_invalid');
    if(Object.hasOwn(document,'context')&&(!object(document.context)||document.context.context_handle!==state.handle||!selectReviewerContext([document.context],state)))throw new Error('reviewer_document_scope_invalid');
    if(!resourceUri||!Array.isArray(document.contents)||document.contents.length!==1)throw new Error('reviewer_resource_ambiguous');
    const row=document.contents[0];
    if(!object(row)||row.uri!==resourceUri||typeof row.text!=='string'||Object.hasOwn(row,'blob')||!/^application\/(?:json|[a-z0-9.+-]+\+json)$/i.test(row.mimeType??''))throw new Error('reviewer_resource_invalid');
    document=JSON.parse(row.text);
    extracted=true;
    if(!object(document))throw new Error('reviewer_document_invalid');
  }
  if(document.contract_version==='bos-identity-mcp/v2'&&Object.hasOwn(document,'result')) {
    if((Object.hasOwn(document,'context_handle')&&document.context_handle!==state.handle)||(Object.hasOwn(document,'server')&&!['BOS-Platform','BOS_Platform'].includes(document.server)))throw new Error('reviewer_document_scope_invalid');
    if(!object(document.result)||!object(document.context)||document.context.context_handle!==state.handle||!selectReviewerContext([document.context],state))throw new Error('reviewer_document_scope_invalid');
    document=document.result;
    extracted=true;
  }
  const verify=item=>{
    if(!object(item)&&!Array.isArray(item))return;
    if(Object.hasOwn(item,'context_handle')&&item.context_handle!==state.handle)throw new Error('reviewer_document_scope_invalid');
    if(Object.hasOwn(item,'server')&&!['BOS-Platform','BOS_Platform'].includes(item.server))throw new Error('reviewer_document_scope_invalid');
    for(const child of Object.values(item))verify(child);
  };
  if(extracted)verify(document);
  return document;
}
const privateInput=value=>value&&typeof value==='object'&&Object.entries(value).some(([key,v])=>/^(?:context_handle|context_id|org_id|organization_id|tenant_id|role_id|installed_app_id|authorization|access_token|refresh_token|cookie)$/i.test(key)||privateInput(v));
const discoveryValidatorPath='skills/bos-app-discovery/scripts/validate-discovery.mjs';
const spec=(name,description,properties={},required=[])=>({type:'function',name,description,inputSchema:{type:'object',additionalProperties:false,properties,required}});
const definitions=[
  spec('acceptance_guard_probe','Verify the test guard by requesting a deliberate denial.'),
  spec('acceptance_guard_status','Check guard readiness and obtain the real current UTC host reference clock. Re-read immediately before calculating observation age; this clock supplies no provider-readiness evidence.'),
  spec('acceptance_compare_schemas','Compare exact schema declarations from current observed and validated documents. Supply one to 32 pairs with returned document_id and exact JSON Pointer ending in inputSchema, outputSchema, input_schema or output_schema. The verified published helper reports all declaration differences; it proves no semantic correspondence, compatibility, validation or readiness.',{pairs:{type:'array',minItems:1,maxItems:32,items:{type:'object',additionalProperties:false,required:['left','right'],properties:Object.fromEntries(['left','right'].map(key=>[key,{type:'object',additionalProperties:false,required:['document_id','pointer'],properties:{document_id:{type:'string'},pointer:{type:'string'}}}]))}}},['pairs']),
  spec('acceptance_read_installed','Read a verified published installed skill or reference. Copy the exact offered skill-index path or returned local reference_id. Each Markdown response offers verified references with product provenance and explicit unavailable-reference status. Never invent a filename or reference path. A reference_id binds its exact published product and file.',{product:{type:'string'},path:{type:'string'},reference_id:{type:'string'}},[]),
  spec('acceptance_validate_installed','Validate an actual discovered document with the host-bound verified published validator; no validator path is needed. Supply its returned document_id; the host retains its exact original bytes. Use app-describe for the app.describe resource and operation-describe for the complete HTTPS Describe response (the parent document). Individual HTTPS operation contacts are covered by that parent validation; they are not legacy api-contract envelopes. Use api-contract only for the actual legacy api.contract.get response, and service-journey for a service journey description. Other supported modes are contact, service, graph, plugins and discovery-refresh.',{path:{type:'string',enum:[discoveryValidatorPath]},mode:{type:'string',enum:installedValidatorModes},document_id:{type:'string'}},['mode','document_id']),
  spec('bos_get_context','Discover and select the exact marketplace reviewer scope; the test host retains its private selector.'),
  spec('bos_list_context_tools','Discover tools for the selected reviewer scope.'),
  spec('bos_list_resources','List BOS discovery resources for the reviewer connection.'),
  spec('bos_read_resource','Read an advertised BOS discovery resource. Copy the exact returned uri string, including any host-presented private placeholder. Preserve spelling and encoding; the host resolves its retained original reference.',{uri:{type:'string'}},['uri']),
  spec('bos_control_discover','Run a discovered BOS control-plane operation. Business operations use bos_https_operation.',{operation:{type:'string',enum:[...controls]},arguments:{type:'object'}},['operation','arguments']),
  spec('bos_https_describe','POST one to five current advertised operation keys to the validated app.describe contact. Use its observed document_id. The host validates the exact parent response with the verified published operation-describe validator before exposing contacts; published_validation identifies that proof and its coverage. Additional applicable published prerequisites remain required.',{document_id:{type:'string'},operations:{type:'array',minItems:1,maxItems:5,uniqueItems:true,items:{type:'string'}}},['document_id','operations']),
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
  const documents=new Map(),contacts=new Map(),references=new Map(),trustedSchemaDocuments=new Set(),ajv=new Ajv({strict:false,validateFormats:false});
  let nextReference=0;
  const clearReferences=()=>{documents.clear();contacts.clear();references.clear();trustedSchemaDocuments.clear();};
  const retainDocument=raw=>{
    const hash=digest(raw),existing=references.get(hash);
    if(existing&&documents.has(existing))return existing;
    const reference='doc_'+(++nextReference);
    references.set(hash,reference);documents.set(reference,structuredClone(raw));return reference;
  };
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
    if(state.handle&&state.handle!==selected.context_handle){clearReferences();state.validated_contracts={};state.failed_validations={};throw new Error('reviewer_discovery_refresh_required');}
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
  const expose=(value,resourceUri)=>{
    const raw=reviewerDiscoveryDocument(value,state,resourceUri),id=retainDocument(raw);
    const advertised=[];
    const collect=(item,foreign=false)=>{
      if(typeof item==='string'){try{collect(JSON.parse(item),foreign);}catch{}return;}
      if(!item||typeof item!=='object')return;
      foreign||=!!item.context_handle&&item.context_handle!==state.handle;
      foreign||=!!item.server&&!['BOS-Platform','BOS_Platform'].includes(item.server);
      if(foreign)return;
      if(item.status==='described'&&item.operation&&item.execution&&item.input_schema){const contactId=retainDocument(item);contacts.set(contactId,structuredClone(item));advertised.push({contact_id:contactId,document_id:contactId,contact:sanitized(item)});}
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
    if(state.handle!==previousHandle)clearReferences();
    return response?.isError?{isError:true,...expose(response,event.tool_input?.uri)}:expose(response,event.tool_input?.uri);
  };
  const call=async(name,args={})=>{
    if(privateInput(args))throw new Error('reviewer_authority_argument');
    if(name==='acceptance_compare_schemas'){
      const event={tool_name:'mcp__Acceptance__compare_schemas',tool_input:args};
      const denial=permission(event,state);if(denial){state.denials.push({tool:name,reason:denial});return {isError:true,reason:denial};}
      if(!Array.isArray(args.pairs)||args.pairs.length<1||args.pairs.length>32)throw new Error('reviewer_document_not_observed');
      const proofs=new Map();
      const select=ref=>{
        const doc=documents.get(ref?.document_id);
        if(!doc||!trustedSchemaDocuments.has(ref.document_id)||typeof ref.pointer!=='string'||!/^\/(?:[^~]|~[01])*\/(?:inputSchema|outputSchema|input_schema|output_schema)$/.test(ref.pointer)&&!/^\/(?:inputSchema|outputSchema|input_schema|output_schema)$/.test(ref.pointer))throw new Error('reviewer_document_not_observed');
        let schema=doc;for(const part of ref.pointer.slice(1).split('/')){const key=part.replaceAll('~1','/').replaceAll('~0','~');if(!schema||typeof schema!=='object'||!Object.hasOwn(schema,key))throw new Error('reviewer_document_not_observed');schema=schema[key];}
        if(typeof schema!=='boolean'&&(!schema||typeof schema!=='object'||Array.isArray(schema)))throw new Error('reviewer_document_not_observed');
        if(digest(sanitized(schema))!==digest(schema))throw new Error('reviewer_document_not_observed');
        proofs.set(ref.document_id,doc);return schema;
      };
      const pairs=args.pairs.map(pair=>({left:select(pair.left),right:select(pair.right)}));
      const result=await installed.call('compare_schemas',{pairs,proof_documents:[...proofs.values()]});
      const response={...result,comparisons:result.comparisons.map((row,i)=>({...row,left:args.pairs[i].left,right:args.pairs[i].right}))};
      observe({...event,tool_response:response},state);return response;
    }
    if(name.startsWith('acceptance_')){
      const short=name.slice('acceptance_'.length);const event={tool_name:'mcp__Acceptance__'+short,tool_input:args};
      if(short==='validate_installed'){
        if(Object.hasOwn(args,'path')&&args.path!==discoveryValidatorPath)throw new Error('reviewer_tool_failed');
        const original=documents.get(args.document_id);if(!original)throw new Error('reviewer_document_not_observed');
        const legacyApiWrapper=args.mode==='api-contract'&&Object.hasOwn(original,'response');
        const target=args.mode==='api-contract'?(legacyApiWrapper?original.response:original):args.mode==='service-journey'?original.description:original;
        if(!state.observed_document_digests?.includes(documentDigests(target)[0]))throw new Error('reviewer_document_not_observed');
        const document=args.mode==='api-contract'&&!legacyApiWrapper?{operation:target.operation,...(Object.hasOwn(target,'source')?{source:target.source}:{}),response:target}:original;
        event.tool_input={path:discoveryValidatorPath,mode:args.mode,document};
      }
      state.pre_calls=(state.pre_calls??0)+1;const denied=permission(event,state);
      if(denied){state.denials.push({tool:name,reason:denied});return {isError:true,reason:denied};}
      const result=await installed.call(short,event.tool_input);observe({...event,tool_response:result},state);if(short==='validate_installed'&&result.valid===true)trustedSchemaDocuments.add(args.document_id);return result;
    }
    if(name==='bos_get_context')return guarded({tool_name:'mcp__BOS__bos_get_context',tool_input:{}},async()=>{
      const response=await mcp('bos.get_context',{});return response;
    });
    if(name==='bos_list_context_tools'){const result=await guarded({tool_name:'mcp__BOS__bos_list_context_tools',tool_input:{context_handle:state.handle}},()=>mcp('bos.list_context_tools',{context_handle:state.handle}));if(!result.isError)trustedSchemaDocuments.add(result.document_id);return result;}
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
    if(name==='bos_https_describe'){
      if(!state.canary||state.kind==='negative'||!state.handle||!state.allowed_effects?.includes('read'))throw new Error('reviewer_discovery_not_approved');
      const app=documents.get(args.document_id),contact=app?.describe,keys=args.operations;
      if(!app||state.validated_contracts?.['app-describe']!==digest(app)||Object.values(state.failed_validations??{}).some(Boolean))throw new Error('reviewer_app_description_unvalidated');
      if(contact?.method!=='POST'||contact.max_operations!==5||!Array.isArray(contact.operations)||!Array.isArray(keys)||keys.length<1||keys.length>5||new Set(keys).size!==keys.length||keys.some(key=>typeof key!=='string'||!contact.operations.includes(key)))throw new Error('reviewer_describe_selection_invalid');
      if(typeof contact.uri!=='string'||/[{}]/.test(contact.uri)||/%(?:7b|7d)/i.test(contact.uri))throw new Error('reviewer_describe_contact_unresolved');
      const origin=new URL(state.resource).origin,url=trustedUrl(new URL(contact.uri,origin).href,origin);
      if(url.search||!url.pathname.endsWith('/describe'))throw new Error('reviewer_describe_contact_invalid');
      const current=await freshContext();
      if(!documents.has(args.document_id)||state.validated_contracts?.['app-describe']!==digest(app))throw new Error('reviewer_discovery_refresh_required');
      const response=await session.request(url.href,{method:contact.method,headers:{'content-type':'application/json','X-BOS-Context-Handle':current.context.context_handle},body:JSON.stringify({operations:keys})});
      if(!response.ok||!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:;|$)/i.test(response.headers.get('content-type')??''))throw new Error('reviewer_describe_http_failed');
      const raw=reviewerDiscoveryDocument(await response.json(),state);
      if(!Array.isArray(raw.operations)||JSON.stringify(raw.operations.map(row=>row.operation))!==JSON.stringify(keys))throw new Error('reviewer_describe_response_mismatch');
      observe({tool_name:'mcp__BOS__app_describe',tool_input:{operations:keys},tool_response:raw},state);
      state.observations.at(-1).transport='https-discovery';
      const validation=await installed.call('validate_installed',{path:'skills/bos-app-discovery/scripts/validate-discovery.mjs',mode:'operation-describe',document:raw});
      // Record the actual host-owned invocation for independent grading. The
      // existing validator check below remains the dispatch gate; this receipt
      // adds observations without changing model-validation or dispatch state.
      state.observations.push({tool:'validate.installed',input:{path:'skills/bos-app-discovery/scripts/validate-discovery.mjs',mode:'operation-describe',document:sanitized(raw)},response:sanitized(validation),scope_verified:!!state.handle,is_error:validation.valid!==true,validation_origin:'host_https_describe'});
      if(validation.valid!==true)throw new Error('reviewer_describe_response_invalid');
      state.fixtureResponses.push({operation:'app.describe',transport:'https_discovery',successful:true,body:raw});
      const exposed=expose(raw);
      trustedSchemaDocuments.add(exposed.document_id);for(const contact of exposed.advertised_https_contacts??[])trustedSchemaDocuments.add(contact.document_id);
      return {...exposed,transport:'https-discovery',published_validation:{valid:true,mode:'operation-describe',document_id:exposed.document_id,release_commit:bos.release_commit}};
    }
    if(name!=='bos_https_operation')throw new Error('reviewer_tool_unknown');
    const contact=contacts.get(args.contact_id);if(!contact)throw new Error('reviewer_contact_not_observed');
    if(!state.canary||state.kind==='negative'||!state.handle)throw new Error('reviewer_business_guard_required');
    if(!state.validated_contracts?.['app-describe']||Object.values(state.failed_validations??{}).some(Boolean))throw new Error('reviewer_published_prerequisite_required');
    if(!state.allowed_effects?.includes(contact.effect))throw new Error('reviewer_effect_not_approved');
    if(contact.effect!=='read'&&!(state.effect_binding?.operation===contact.operation&&state.effect_binding.effect===contact.effect&&state.effect_binding.input_sha256===digest(args.payload??{})))throw new Error('reviewer_effect_not_approved');
    const result=Object.hasOwn(args,'payload')?await adapter.invokeDiscoveredOperation(contact,args.payload):await adapter.invokeDiscoveredOperation(contact);
    const valid=result.status>=200&&result.status<300&&ajv.compile(contact.output_schema)(result.body);
    state.observations.push({tool:contact.operation,input:sanitized(args.payload??{}),response:sanitized(result),scope_verified:true,is_error:!valid,transport:'https',contact_sha256:digest(contact)});
    if(!valid)throw new Error('reviewer_api_contract_failed');
    return {status:result.status,body:sanitized(result.body),operation:contact.operation,transport:'https'};
  };
  return {definitions,call:async(name,args)=>{
    try{return await call(name,args);}catch(error){
      const reason=reviewerFailureCode(error);
      state.observations.push({tool:name,input:sanitized(args),response:{reason},is_error:true});
      if(state.kind==='negative')state.denials.push({tool:name,reason:'negative_case_business_call'});
      return {isError:true,reason};
    }
  }};
}
