import assert from 'node:assert/strict';
import test from 'node:test';
import {validateApiContractResponse} from '../source/platform/bos-app-discovery/scripts/validate-discovery.mjs';
import {buildJourneyRegistrationRequest} from '../source/platform/bos-workflow-orchestrator/scripts/journey-runtime-client.mjs';
import {currentRegistrationContract,syntheticDocument} from './helpers/registration-variant-contract.mjs';

// Consumer-owned synthetic profile of the advertised optional quota metadata.
function advertisedQuotaContract(){
  const contract=currentRegistrationContract();
  const quota=contract.output_schema.oneOf.find(v=>Object.keys(v.properties).join()==='error');
  quota.properties.usage=structuredClone(contract.output_schema.oneOf.find(v=>v.properties?.compiled?.const===true).properties.callback_report.properties.usage);
  quota.allOf=[{if:{properties:{error:{properties:{code:{const:'CALLBACK_LIMIT_REACHED'}}}}},then:{required:['usage']},else:{not:{required:['usage']}}}];
  delete contract.limits.execution_ttl_hours;
  return contract;
}
test('current registration discovers conditional callback quota usage without retired TTL metadata',()=>{
  const contract=advertisedQuotaContract(),original=JSON.stringify(contract);
  assert.equal(validateApiContractResponse(contract,{operation:contract.operation}),contract);
  const request=buildJourneyRegistrationRequest(contract,'bos_ctx_v2_'+'a'.repeat(64),syntheticDocument);
  assert.equal(request.method,'POST');assert.equal(request.href,contract.execution.uri);assert.equal(JSON.stringify(contract),original);
});
test('callback usage schema and condition remain exact and unknown limits reject',()=>{
  for(const mutate of [
    d=>{d.output_schema.oneOf.find(v=>v.properties.usage).properties.usage.maxItems=17;},
    d=>{delete d.output_schema.oneOf.find(v=>v.properties.usage).allOf;},
    d=>{d.output_schema.oneOf.find(v=>v.properties.usage).properties.usage.items.additionalProperties=true;},
    d=>{d.limits.unadvertised_limit=10;},
    d=>{d.limits.execution_ttl_hours=0;}
  ]){const descriptor=advertisedQuotaContract();mutate(descriptor);assert.throws(()=>validateApiContractResponse(descriptor,{operation:descriptor.operation}));}
});
