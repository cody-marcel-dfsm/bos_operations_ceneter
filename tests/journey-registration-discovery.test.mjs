import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {validateApiContractResponse} from '../source/platform/bos-app-discovery/scripts/validate-discovery.mjs';

// URL-discovered metadata with a synthetic organization address; no sibling code.
const registration=JSON.parse(await readFile(new URL('./fixtures/journey-registration-contract.json',import.meta.url),'utf8'));
const clone=()=>structuredClone(registration);

test('published registration subtype validates through the existing entry and CLI',()=>{
 const expected={operation:'lead-director.journeys.register'},original=JSON.stringify(registration);
 assert.equal(validateApiContractResponse(registration,expected),registration);
 assert.equal(JSON.stringify(registration),original);
 const script=fileURLToPath(new URL('../source/platform/bos-app-discovery/scripts/validate-discovery.mjs',import.meta.url));
 const result=spawnSync(process.execPath,[script,'api-contract'],{input:JSON.stringify({...expected,response:registration}),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{valid:true,kind:'api-contract'});
 const legacy=clone();delete legacy.execution.transport;delete legacy.execution.context_header;
 assert.equal(validateApiContractResponse(legacy,expected),legacy);
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
