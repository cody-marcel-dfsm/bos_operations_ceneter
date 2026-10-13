import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {validateApiContractResponse} from '../source/platform/bos-app-discovery/scripts/validate-discovery.mjs';
import {buildJourneyRegistrationRequest} from '../source/platform/bos-workflow-orchestrator/scripts/journey-runtime-client.mjs';

// URL-discovered metadata with a synthetic organization address; no sibling code.
const registration=JSON.parse(await readFile(new URL('./fixtures/journey-registration-contract.json',import.meta.url),'utf8'));
const clone=()=>structuredClone(registration);
const workflowContract=operation=>({
 operation,
 contract_version:'lead-director-journey-registration/v1',
 status:'described',title:'Synthetic workflow contract',description:'Synthetic discovered operation.',
 input_schema:{type:'object',properties:{},additionalProperties:false},
 output_schema:operation==='lead-director.journeys.workflows'
  ? {type:'object',required:['workflows','truncated'],properties:{workflows:{type:'array'},truncated:{type:'boolean'}},additionalProperties:false}
  : {oneOf:[{type:'object',required:['workflow_ref'],properties:{workflow_ref:{type:'string'}},additionalProperties:false}]},
 limits:{maximum_duration_seconds:30,maximum_fan_out:1},
 execution:{transport:'https',method:operation==='lead-director.journeys.workflows'?'GET':'GET_OR_POST',
  uri:operation==='lead-director.journeys.workflows'
   ? '/bos/apps/lead-director/api/v1/organizations/synthetic-org/journey-workflows'
   : '/bos/apps/lead-director/api/v1/organizations/synthetic-org/journey-controls/{control}',
  context_header:'X-BOS-Context-Handle'},
 guarantees:{idempotent:true,server_owned_state:true,client_generated_keys:false},
 public_errors:[],ttlMs:0,cacheScope:'private'
});

test('workflow catalog and control stay within the existing journey v1 contract',()=>{
 for(const operation of ['lead-director.journeys.workflows','lead-director.journeys.workflow-control']){
  const response=workflowContract(operation),original=JSON.stringify(response);
  assert.equal(validateApiContractResponse(response,{operation}),response);
  assert.equal(JSON.stringify(response),original);
  const version=structuredClone(response);version.contract_version=operation.endsWith('.workflows')?'lead-director-journey-workflows/v1':'lead-director-journey-workflow-control/v1';
  assert.throws(()=>validateApiContractResponse(version),/journey-registration\/v1/);
  const route=structuredClone(response);route.execution.uri=route.execution.uri.replace('/api/v1/','/api/v2/');
  assert.throws(()=>validateApiContractResponse(route),/API v1 route/);
 }
});

test('sole API v1 registration validates the complete compile/start and lifecycle schema',()=>{
 for(const contract of [registration]){
  const original=JSON.stringify(contract);
  assert.equal(validateApiContractResponse(contract,{operation:'lead-director.journeys.register'}),contract);
  assert.equal(JSON.stringify(contract),original);
  const script=fileURLToPath(new URL('../source/platform/bos-app-discovery/scripts/validate-discovery.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[script,'api-contract'],{input:JSON.stringify({response:contract}),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
 }
});
test('registration rejects API version changes, incomplete responses and widened start authority',()=>{
 for(const version of ['v2','v3']){
  const value=clone();value.contract_version=`lead-director-journey-registration/${version}`;
  assert.throws(()=>validateApiContractResponse(value),/version/);
 }
 const foreign=clone();foreign.execution.uri=foreign.execution.uri.replace('/api/v1/','/api/v2/');
 assert.throws(()=>validateApiContractResponse(foreign),/route/);
 const incomplete=clone();incomplete.output_schema.oneOf=incomplete.output_schema.oneOf.filter(branch=>branch.properties?.compiled?.const!==true&&branch.properties?.status?.const!=='not_started');
 assert.throws(()=>validateApiContractResponse(incomplete),/response variants/);
 for(const mutate of [
  v=>{v.output_schema.oneOf[0].properties.actions.required=[];},
  v=>{v.output_schema.oneOf[0].properties.actions.properties.stop={type:'object'};},
  v=>{v.output_schema.oneOf[0].properties.actions.properties.start.properties.method.const='GET';},
  v=>{v.output_schema.oneOf[0].properties.actions.properties.start.properties.payload_schema.type='object';},
  v=>{v.output_schema.oneOf[0].properties.actions.properties.start.additionalProperties=true;},
  v=>{v.output_schema.oneOf[0].properties.actions.properties.start.properties.href.pattern='^https:';},
  v=>{v.output_schema.oneOf.push(structuredClone(v.output_schema.oneOf[0]));},
  v=>{v.output_schema.oneOf[0].properties.extra={type:'string'};},
  v=>{delete v.execution.transport;delete v.execution.context_header;}
 ]){const value=clone();mutate(value);assert.throws(()=>validateApiContractResponse(value));}
});

test('compiled registration reports callback usage and limits as an optional v1 response property',()=>{
 const success=clone().output_schema.oneOf.find(branch=>branch.properties?.compiled?.const===true);
 assert.deepEqual(success.required,['compiled','identity','actions']);
 assert.deepEqual(Object.keys(success.properties).sort(),['actions','callback_report','compiled','identity']);
 assert.equal(success.properties.callback_report.additionalProperties,false);
 assert.deepEqual(success.properties.callback_report.required,['as_of','callbacks','waits','usage']);
 assert.equal(validateApiContractResponse(registration,{operation:'lead-director.journeys.register'}),registration);

 const required=clone();
 required.output_schema.oneOf.find(branch=>branch.properties?.compiled?.const===true).required.push('callback_report');
 assert.throws(()=>validateApiContractResponse(required),/response variants/);
 const missing=clone();
 delete missing.output_schema.oneOf.find(branch=>branch.properties?.compiled?.const===true).properties.callback_report;
 assert.equal(validateApiContractResponse(missing,{operation:'lead-director.journeys.register'}),missing);
 const callbackFree=clone();
 delete callbackFree.input_schema.properties.bootstrap;
 delete callbackFree.input_schema.properties.controls;
 delete callbackFree.output_schema.oneOf.find(branch=>branch.properties?.compiled?.const===true).properties.callback_report;
 assert.equal(validateApiContractResponse(callbackFree,{operation:'lead-director.journeys.register'}),callbackFree);
 const widened=clone();
 widened.output_schema.oneOf.find(branch=>branch.properties?.compiled?.const===true)
  .properties.callback_report.additionalProperties=true;
 assert.throws(()=>validateApiContractResponse(widened),/response variants/);
});

test('discovered v1 registration accepts callback bootstrap and role controls in the real request path',()=>{
 const document={
  identity:'gmail-lead-call',name:'Email lead callback',inputs:{},entry:'done',
  bootstrap:{callbacks:[{code:'mail',source:'gmail.trigger',inputs:{},match:{left:{from:'$event.fields.subject'},op:'exists'}}],activate_on:'mail'},
  controls:{actions:[{verb:'stop',roles:['director']}]},
  nodes:[{code:'done',type:'server',inputs:{},outputs:{},terminal:true}]
 };
 const contextHandle='bos_ctx_v2_'+'c'.repeat(64);
 assert.equal(validateApiContractResponse(registration,{operation:'lead-director.journeys.register'}),registration);
 const request=buildJourneyRegistrationRequest(registration,contextHandle,document);
 assert.equal(request.method,'POST');
 assert.equal(request.href,registration.execution.uri);
 assert.equal(request.headers['X-BOS-Context-Handle'],contextHandle);
 assert.deepEqual(JSON.parse(request.body),document);
 assert.throws(()=>buildJourneyRegistrationRequest(registration,contextHandle,{...document,unrecognized:true}),/payload/);
 const widened=clone();widened.input_schema.properties.unsupported={type:'object'};
 assert.throws(()=>validateApiContractResponse(widened,{operation:'lead-director.journeys.register'}),/undeclared field/);
});

test('published registration subtype validates through the existing entry and CLI',()=>{
 const expected={operation:'lead-director.journeys.register'},original=JSON.stringify(registration);
 assert.equal(validateApiContractResponse(registration,expected),registration);
 assert.equal(JSON.stringify(registration),original);
 const script=fileURLToPath(new URL('../source/platform/bos-app-discovery/scripts/validate-discovery.mjs',import.meta.url));
 const result=spawnSync(process.execPath,[script,'api-contract'],{input:JSON.stringify({...expected,response:registration}),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{valid:true,kind:'api-contract'});
 const legacy=clone();delete legacy.execution.transport;delete legacy.execution.context_header;
 assert.throws(()=>validateApiContractResponse(legacy,expected),/HTTPS/);
});
test('registration preserves plugin validation and exact link/version matching',()=>{
 assert.throws(()=>validateApiContractResponse(registration,{operation:'fixture.plugin.read'}));
 assert.throws(()=>validateApiContractResponse(registration,{source:{platform:'bos',application:'lead-director',plugin:'synthetic'}}));
 const wrong=clone();wrong.contract_version='lead-director-journey-registration/v2';assert.throws(()=>validateApiContractResponse(wrong));
 const plugin=clone();plugin.operation='fixture.plugin.read';plugin.contract_version='1.0.0';assert.throws(()=>validateApiContractResponse(plugin),/source is required/);
 for(const field of Object.keys(registration)){const value=clone();delete value[field];assert.throws(()=>validateApiContractResponse(value),field);}
 for(const field of ['source','org_id','context_handle','unknown']){const value=clone();value[field]='synthetic';assert.throws(()=>validateApiContractResponse(value),field);}
});
test('registration rejects foreign routes, selectors, partial headers and changed guarantees',()=>{
 for(const uri of ['https://foreign.example/register','//foreign.example/register','/bos/apps/other/api/v1/organizations/synthetic/journeys/register','/bos/apps/lead-director/api/v1/organizations/synthetic/journeys/register?context_handle=other','/bos/apps/lead-director/api/v1/organizations/synthetic/journeys/register#fragment','/bos/apps/lead-director/api/v1/organizations/../journeys/register','/bos/apps/lead-director/api/v1/organizations/synthetic/journeys/register/extra']){const value=clone();value.execution.uri=uri;assert.throws(()=>validateApiContractResponse(value));}
 for(const change of [{method:'GET'},{transport:'journey_runtime'},{context_header:'X-Wrong-Context'},{org_id:'synthetic'}]){const value=clone();Object.assign(value.execution,change);assert.throws(()=>validateApiContractResponse(value));}
 for(const field of ['transport','context_header']){const value=clone();delete value.execution[field];assert.throws(()=>validateApiContractResponse(value));}
 for(const field of Object.keys(registration.guarantees)){const value=clone();value.guarantees[field]=!value.guarantees[field];assert.throws(()=>validateApiContractResponse(value));}
});
test('registration schemas, ceilings, errors and freshness remain strict',()=>{
 for(const field of Object.keys(registration.limits))for(const bad of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1,'1',undefined]){const value=clone();value.limits[field]=bad;assert.throws(()=>validateApiContractResponse(value),field);}
 const mutations=[v=>{v.limits.unknown=1;},v=>{v.input_schema.type='array';},v=>{v.input_schema.additionalProperties=true;},v=>{v.input_schema.required.pop();},v=>{delete v.input_schema.properties.identity;},v=>{v.input_schema.$schema='https://foreign.example/schema';},v=>{v.output_schema.oneOf=[];},v=>{v.output_schema.oneOf[0].additionalProperties=true;},v=>{v.output_schema.oneOf[0].type='invalid-json-schema-type';},v=>{v.public_errors=[];},v=>{v.public_errors.push(structuredClone(v.public_errors[0]));},v=>{v.public_errors[0].retryable='false';},v=>{v.public_errors[0].http_status=200;},v=>{v.public_errors[0].private_detail='synthetic';},v=>{v.ttlMs=1;},v=>{v.cacheScope='public';}];
 for(const mutate of mutations){const value=clone();mutate(value);assert.throws(()=>validateApiContractResponse(value));}
});
