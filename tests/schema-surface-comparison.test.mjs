import test from 'node:test';
import assert from 'node:assert/strict';
import {compareSchemaSurfaces} from '../source/platform/bos-app-discovery/scripts/compare-schema-surfaces.mjs';
import {createInstalledAcceptance} from '../scripts/marketplace-native-resources.mjs';

test('comparison preserves inputs and reports optional versus required fields and bounds',()=>{
  const native={type:'object',required:[],properties:{query:{type:'string'}}};
  const https={type:'object',required:['ended_after','ended_at_or_before'],properties:{query:{type:'string',maxLength:500},ended_after:{type:'string'},ended_at_or_before:{type:'string'}}};
  const original=structuredClone([native,https]);
  const result=compareSchemaSurfaces(native,https);
  assert.equal(result.complete,true);
  const rows=Object.fromEntries(result.declaration_differences.map(row=>[row.pointer,row]));
  assert.deepEqual(rows['/required'].left.value,[]);
  assert.deepEqual(rows['/required'].right.value,['ended_after','ended_at_or_before']);
  assert.deepEqual(rows['/properties/query/maxLength'].left,{declared:false});
  assert.equal(rows['/properties/query/maxLength'].right.value,500);
  assert.deepEqual([native,https],original);
});
test('comparison exposes mutation selectors, idempotency, version and target differences',()=>{
  const native={type:'object',required:['external_id','idempotency_key','expected_version'],properties:{external_id:{type:'string'},idempotency_key:{type:'string'},expected_version:{type:'integer'},changes:{type:'object',additionalProperties:true}}};
  const https={type:'object',required:['targets'],properties:{targets:{type:'array',maxItems:5,items:{type:'object',required:['selector','changes']}}},additionalProperties:false};
  const result=compareSchemaSurfaces(native,https);
  const paths=result.declaration_differences.map(row=>row.pointer);
  for(const path of ['/required','/properties/external_id','/properties/idempotency_key','/properties/expected_version','/properties/targets','/additionalProperties'])assert.ok(paths.includes(path));
});
test('output object versus binary media remains an explicit declaration difference',()=>{
  const result=compareSchemaSurfaces({type:'object',additionalProperties:true},{type:'string',format:'binary',contentMediaType:'application/octet-stream'});
  assert.ok(result.declaration_differences.some(row=>row.pointer==='/type'&&row.left.value==='object'&&row.right.value==='string'));
  assert.ok(result.declaration_differences.some(row=>row.pointer==='/contentMediaType'));
});
test('set-valued declarations and object key order do not create false differences; tuple order does',()=>{
  assert.equal(compareSchemaSurfaces({required:['b','a'],enum:[2,1],properties:{a:{type:['null','string']}}},{properties:{a:{type:['string','null']}},enum:[1,2],required:['a','b']}).declaration_differences.length,0);
  assert.equal(compareSchemaSurfaces({enum:['é','e\u0301']},{enum:['e\u0301','é']}).declaration_differences.length,0);
  assert.ok(compareSchemaSurfaces({prefixItems:[{type:'string'},{type:'number'}]},{prefixItems:[{type:'number'},{type:'string'}]}).declaration_differences.length);
});
test('annotation changes remain visible without treating a property named description as an annotation',()=>{
  const result=compareSchemaSurfaces({description:'first',properties:{description:{type:'string'}}},{description:'second',properties:{}});
  assert.equal(result.annotation_differences.length,1);
  assert.equal(result.declaration_differences[0].pointer,'/properties/description');
});
test('boolean schemas are compared and unsupported inputs fail closed',()=>{
  assert.equal(compareSchemaSurfaces(true,false).declaration_differences[0].pointer,'');
  for(const value of [null,[],1,'object'])assert.throws(()=>compareSchemaSurfaces(value,{}));
});
test('guard clock reports the real host reference without altering source observations',async()=>{
  const source={observed_at:'2000-01-01T00:00:00Z'},state={canary:true,observations:[source]};
  const tools=createInstalledAcceptance({},async()=>state),before=Date.now();
  const result=await tools.call('guard_status',{});
  assert.equal(result.ready,true);assert.equal(result.reference_time_source,'reviewer_host_utc_clock');
  assert.ok(Date.parse(result.reference_time)>=before&&Date.parse(result.reference_time)<=Date.now());
  assert.deepEqual(state.observations,[source]);
});

test('literal const and enum objects preserve keyword-shaped arrays and array order',()=>{
  const first={required:['a','b'],enum:[1,2]},second={required:['b','a'],enum:[2,1]};
  const constant=compareSchemaSurfaces({const:first},{const:second});
  assert.ok(constant.declaration_differences.some(row=>row.pointer==='/const/required'));
  assert.ok(constant.declaration_differences.some(row=>row.pointer==='/const/enum'));
  assert.ok(compareSchemaSurfaces({enum:[first]},{enum:[second]}).declaration_differences.some(row=>row.pointer==='/enum'));
  assert.equal(compareSchemaSurfaces({enum:[first,second]},{enum:[second,first]}).declaration_differences.length,0);
});
test('literal annotation-shaped fields, defaults and extensions remain real declaration differences',()=>{
  for(const keyword of ['const','default','x-extension']){
    const result=compareSchemaSurfaces({[keyword]:{description:'first',required:['a','b']}},{[keyword]:{description:'second',required:['b','a']}});
    assert.equal(result.annotation_differences.length,0);
    assert.ok(result.declaration_differences.some(row=>row.pointer===`/${keyword}/description`));
    assert.ok(result.declaration_differences.some(row=>row.pointer===`/${keyword}/required`));
  }
});
test('schema maps preserve field names while normalizing only real nested schema keywords',()=>{
  assert.equal(compareSchemaSurfaces({properties:{required:{type:'object',required:['a','b']}}},{properties:{required:{required:['b','a'],type:'object'}}}).declaration_differences.length,0);
  assert.ok(compareSchemaSurfaces({properties:{enum:{const:[1,2]}}},{properties:{enum:{const:[2,1]}}}).declaration_differences.length);
});
