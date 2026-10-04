import {syntheticOperationDescribe,syntheticApiContract} from './helpers/synthetic-bos-discovery-service.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewerOutcomeMatches} from '../scripts/marketplace-reviewer-outcomes.mjs';
const context={product:'bos',case_id:'positive-1',execution_started_at:'2026-10-03T20:00:00Z'};
const selector={operation:'search',transport:'deterministic_https'};
const fact={requirement:'records',operator:'equals',response:selector,path:'/count',value:2};
const envelope=rules=>({schema:'marketplace-case-assertions/v1',product:'bos',case_id:'positive-1',rules});
const response=body=>({operation:'search',transport:'deterministic_https',successful:true,body});
const evidence={responses:[response({count:2})]};
const matches=(rules,data=evidence,requirements=[])=>reviewerOutcomeMatches(envelope(rules),data,requirements,context);
test('fixture assertions bind product/case, successful unique semantic response and independent truth',()=>{
 assert.equal(matches([fact],evidence,[{id:'records',operator:'equals'}]),true);
 assert.equal(matches([fact],{responses:[response({count:1})]}),false);
 assert.equal(matches([fact],evidence,[{id:'missing',operator:'equals'}]),false);
 for(const changed of [{product:'my-crm'},{case_id:'starter-1'},{extra:true}])assert.equal(reviewerOutcomeMatches({...envelope([fact]),...changed},evidence,[],context),false);
 for(const rows of [[],[response({count:2}),response({count:2})],[{...response({count:2}),successful:false}],[{...response({count:2}),transport:'mcp_discovery'}]])assert.equal(matches([fact],{responses:rows}),false);
 assert.equal(reviewerOutcomeMatches(undefined,evidence,[],context),false);
 assert.equal(matches([{operator:'contains',evidence:'answer',path:'',value:'success'}],{answer:'success'}),false);
 assert.equal(matches([{operator:'min_length',response:selector,path:'/items',value:1}],{responses:[response({items:[1]})]}),false);
});
test('bounded array projections compare independently selected actual identities',()=>{
 const other={operation:'calendar_search_events',transport:'deterministic_https'};
 const data={responses:[response({count:2,records:[{email:'a@example.test'},{email:'b@example.test'}]}),{...response({events:[{attendees:[{email:'b@example.test'},{email:'a@example.test'}]}]}),operation:other.operation}]};
 const compare={requirement:'identities',operator:'same_values',response:selector,path:'/records',project_paths:['/email'],other_response:other,other_path:'/events',other_project_paths:['/attendees','/email']};
 assert.equal(matches([fact,compare],data),true);
 const missing=structuredClone(data);delete missing.responses[0].body.records[1].email;
 assert.equal(matches([fact,compare],missing),false);
 assert.equal(matches([fact,{...compare,other_response:selector,other_path:'/records',other_project_paths:['/email']}],data),false);
 assert.equal(matches([fact,{...compare,project_paths:['/__proto__']}],data),false);
});
test('multisource evidence requires distinct complete structured sources',()=>{
 const source={platform:'bos',application:'app',plugin:'first'};
 const rule={requirement:'multiple-sources',operator:'min_length',response:selector,path:'/sources',value:2,distinct_by_path:'/source'};
 const requirements=[{id:'multiple-sources',operator:'min_length',minimum:2}];
 const data=rows=>({responses:[response({count:2,sources:rows.map(source=>({source}))})]});
 assert.equal(matches([fact,rule],data([source,{...source,plugin:'second'}]),requirements),true);
 for(const rows of [[source,{plugin:'first',application:'app',platform:'bos'}],[source,{platform:'bos'}],[source,{...source,alias:'fake'}]])assert.equal(matches([fact,rule],data(rows),requirements),false);
 assert.equal(matches([fact,{...rule,distinct_by_path:'/source/platform'}],data([source,{...source,plugin:'second'}]),requirements),false);
});
test('freshness binds host execution time and cannot widen configured bounds',()=>{
 const rule={requirement:'freshness',operator:'timestamp_age',response:selector,path:'/timestamps',value:{maximum_age_ms:300000,future_skew_ms:30000}};
 const requirements=[{id:'freshness',operator:'timestamp_age',maximum_age_ms:300000,future_skew_ms:30000}];
 const data=time=>({responses:[response({count:2,timestamps:[time]})],execution_started_at:'1900-01-01T00:00:00Z'});
 assert.equal(matches([fact,rule],data('2026-10-03T19:59:00Z'),requirements),true);
 for(const time of ['2026-10-03T19:54:00Z','2026-10-03T20:01:00Z','2026-10-03T19:59:00','2026-10-03','invalid'])assert.equal(matches([fact,rule],data(time),requirements),false);
 assert.equal(matches([fact,{...rule,value:{maximum_age_ms:600000,future_skew_ms:30000}}],data('2026-10-03T19:59:00Z'),requirements),false);
 assert.equal(reviewerOutcomeMatches(envelope([fact,rule]),data('2026-10-03T19:59:00Z'),requirements,{...context,execution_started_at:undefined}),false);
});


test('freshness rejects normalized invalid calendar dates and invalid host clock',()=>{
 const rule={requirement:'freshness',operator:'timestamp_age',response:selector,path:'/timestamp',value:{maximum_age_ms:300000,future_skew_ms:30000}};
 const clock={...context,execution_started_at:'2030-03-02T03:04:05Z'};
 const data={responses:[response({count:2,timestamp:'2030-02-30T03:04:05Z'})]};
 assert.equal(reviewerOutcomeMatches(envelope([fact,rule]),data,[],clock),false);
 data.responses[0].body.timestamp='2030-03-02T03:04:05Z';
 assert.equal(reviewerOutcomeMatches(envelope([fact,rule]),data,[],clock),true);
 assert.equal(reviewerOutcomeMatches(envelope([fact,rule]),data,[],{...clock,execution_started_at:'2030-02-30T03:04:05Z'}),false);
});


test('same-values correspondence rejects missing direct array identities',()=>{
 const second={operation:'calendar_search_events',transport:'deterministic_https'};
 const rule={operator:'same_values',response:selector,path:'/identities',other_response:second,other_path:'/identities'};
 for(const identities of [[null],[undefined]]) {
  const data={responses:[response({count:2,identities}),{...response({identities}),operation:second.operation}]};
  assert.equal(matches([fact,rule],data),false);
 }
});


test('same-values compares resolved evidence locations instead of selector syntax',()=>{
 const data={responses:[response({count:2,records:[{email:'a@example.test'}],independent:[{email:'a@example.test'}]})]};
 const rule={operator:'same_values',response:selector,path:'/records',project_paths:['/email'],other_response:selector,other_path:'/records',other_project_paths:['','/email']};
 assert.equal(matches([fact,rule],data),false);
 assert.equal(matches([fact,{...rule,other_path:'/independent'}],data),true);
 const direct={operator:'same_values',response:selector,path:'/records',other_response:selector,other_path:'/records',other_project_paths:['']};
 assert.equal(matches([fact,direct],data),false);
});

const describedSelector={operation:'app.describe',transport:'https_discovery',described_operation:'search'};
const describedResponse=body=>({operation:'app.describe',transport:'https_discovery',successful:true,body});
const describedFact={operator:'equals',response:describedSelector,path:'/operation',value:'search'};
function describedData() {
 const body=syntheticOperationDescribe();
 body.operations=body.operations.map(operation=>operation.status==='not_available'?{...structuredClone(body.operations[0]),operation:operation.operation}:operation);
 return {responses:body.operations.map(operation=>describedResponse({...body,operations:[operation]}))};
}
test('described-operation selects independent literal contract truth across successful bounded batches',()=>{
 const data=describedData();
 assert.equal(matches([describedFact],data),true);
 assert.equal(matches([{...describedFact,value:'create'}],data),false);
 const other={...describedSelector,described_operation:'create'};
 assert.equal(matches([describedFact,{operator:'equals',response:other,path:'/operation',value:'create'}],data),true);
 assert.equal(matches([{...describedFact,response:{operation:'app.describe',transport:'https_discovery'}}],data),false);
 data.responses.push({...data.responses[0],successful:false});
 assert.equal(matches([describedFact],data),true);
});
test('described-operation rejects missing, duplicate, malformed and unavailable contracts',()=>{
 const original=describedData();
 for(const mutate of [
  data=>data.responses.splice(0,1),
  data=>data.responses.push(structuredClone(data.responses[0])),
  data=>data.responses[0].body.operations.push(structuredClone(data.responses[0].body.operations[0])),
  data=>data.responses[0].body.operations=[],
  data=>data.responses[0].body.operations=Array(6).fill(data.responses[0].body.operations[0]),
  data=>data.responses[0].body.operations[0].status='unknown',
  data=>data.responses[0].body.operations[0]={operation:'search',status:'not_available'},
  data=>delete data.responses[0].body.operations[0].input_schema,
  data=>data.responses[1].body.operations[0].operation='invalid operation',
  data=>data.responses[0].body.operations=[null],
  data=>data.responses[0].body=null,
  data=>data.responses={}
 ]){const data=structuredClone(original);mutate(data);assert.equal(matches([describedFact],data),false);}
 for(const selector of [
  {...describedSelector,described_operation:''},
  {...describedSelector,described_operation:'invalid operation'},
  {...describedSelector,described_operation:null},
  {...describedSelector,described_operation:[]},
  {...describedSelector,operation:'search'},
  {...describedSelector,transport:'mcp_discovery'},
  {...describedSelector,extra:true}
 ])assert.equal(matches([{...describedFact,response:selector}],original),false);
});
test('described-operation and whole-batch aliases preserve physical evidence independence',()=>{
 const data=describedData();data.responses=data.responses.slice(0,1);
 const whole={operation:'app.describe',transport:'https_discovery'};
 const compare={operator:'same_values',response:describedSelector,path:'/sources',project_paths:['/source/plugin'],other_response:whole,other_path:'/operations',other_project_paths:['/sources','/source/plugin']};
 assert.equal(matches([describedFact,compare],data),false);
 assert.equal(matches([describedFact,{...compare,other_response:describedSelector,other_path:'/sources',other_project_paths:['','/source/plugin']}],data),false);
 const independent=structuredClone(data.responses[0].body.operations[0]);independent.operation='create';
 data.responses.push(describedResponse({...data.responses[0].body,operations:[independent]}));
 assert.equal(matches([describedFact,{...compare,other_response:{...describedSelector,described_operation:'create'},other_path:'/sources',other_project_paths:['/source/plugin']}],data),true);
 assert.equal(matches([describedFact],data,[{id:'uncovered',operator:'equals'}]),false);
 assert.equal(reviewerOutcomeMatches({...envelope([describedFact]),product:'my-crm'},data,[],context),false);
});

const apiSelector={operation:'api.contract.get',transport:'mcp_discovery',api_contract_operation:'calendar.events.search'};
const apiResponse=result=>({operation:'api.contract.get',transport:'mcp_discovery',successful:true,body:{result}});
const apiFact={operator:'equals',response:apiSelector,path:'/operation',value:'calendar.events.search'};
const apiData=()=>({responses:[apiResponse(syntheticApiContract()),apiResponse({...syntheticApiContract(),operation:'journey.synthetic.register'})]});
test('API-contract selector validates actual unique results across mixed successful controls',()=>{
 const data=apiData();assert.equal(matches([apiFact],data),true);
 assert.equal(matches([{...apiFact,value:'journey.synthetic.register'}],data),false);
 assert.equal(matches([apiFact,{...apiFact,response:{...apiSelector,api_contract_operation:'journey.synthetic.register'},value:'journey.synthetic.register'}],data),true);
 const whole={operation:'api.contract.get',transport:'mcp_discovery'};
 assert.equal(matches([{...apiFact,response:whole,path:'/result/operation'}],data),false);
 assert.equal(matches([{...apiFact,response:whole,path:'/result/operation'}],{responses:[data.responses[0]]}),true);
 data.responses.push({...structuredClone(data.responses[0]),successful:false});assert.equal(matches([apiFact],data),true);
});
test('API-contract selector rejects missing duplicate malformed contracts and selector scope',()=>{
 for(const mutate of [
  data=>data.responses.splice(0,1),
  data=>data.responses.push(structuredClone(data.responses[0])),
  data=>delete data.responses[0].body.result,
  data=>data.responses[0].body.result=null,
  data=>data.responses[0].body.result=[],
  data=>delete data.responses[0].body.result.input_schema,
  data=>data.responses[1].body.result.operation='not_dotted',
  data=>data.responses[1].body.result.input_schema.type='invalid',
  data=>data.responses[1].body.result.extra=true
 ]){const data=apiData();mutate(data);assert.equal(matches([apiFact],data),false);}
 for(const selector of [
  {...apiSelector,api_contract_operation:''},
  {...apiSelector,api_contract_operation:null},
  {...apiSelector,api_contract_operation:[]},
  {...apiSelector,api_contract_operation:'not_dotted'},
  {...apiSelector,operation:'app.describe'},
  {...apiSelector,transport:'https_discovery'},
  {...apiSelector,described_operation:'search'},
  {...apiSelector,extra:true}
 ])assert.equal(matches([{...apiFact,response:selector}],apiData()),false);
});
test('API-contract result and whole-envelope aliases retain physical evidence independence',()=>{
 const data=apiData();data.responses=data.responses.slice(0,1);
 const whole={operation:'api.contract.get',transport:'mcp_discovery'};
 const compare={operator:'same_values',response:apiSelector,path:'/public_errors',project_paths:['/code'],other_response:whole,other_path:'/result/public_errors',other_project_paths:['/code']};
 assert.equal(matches([apiFact,compare],data),false);
 assert.equal(matches([apiFact,{...compare,other_response:apiSelector,other_path:'/public_errors',other_project_paths:['','/code']}],data),false);
 const mixed=apiData();
 assert.equal(matches([apiFact,{...compare,other_response:{...apiSelector,api_contract_operation:'journey.synthetic.register'},other_path:'/public_errors'}],mixed),true);
 assert.equal(matches([compare],data),false);
 assert.equal(matches([apiFact],mixed,[{id:'missing',operator:'equals'}]),false);
});

test('freshness accepts canonical microseconds and retains nanosecond age/skew boundaries',()=>{
 const rule={operator:'timestamp_age',response:selector,path:'/timestamp',value:{maximum_age_ms:300000,future_skew_ms:30000}};
 const clock={...context,execution_started_at:'2026-10-03T20:00:00.000000001Z'};
 const check=time=>reviewerOutcomeMatches(envelope([fact,rule]),{responses:[response({count:2,timestamp:time})]},[],clock);
 for(const time of ['2026-10-03T19:59:00.123456Z','2026-10-03T20:00:00.000000001Z','2026-10-03T19:55:00.000000001Z','2026-10-03T20:00:30.000000001Z','2026-10-03T21:00:00.000000001+01:00'])assert.equal(check(time),true);
 for(const time of ['2026-10-03T19:55:00.000000000Z','2026-10-03T20:00:30.000000002Z','2026-10-03T19:54:59.999999999Z'])assert.equal(check(time),false);
 const epoch={...context,execution_started_at:'1970-01-01T00:00:00.000000000Z'};
 const bounded={...rule,value:{maximum_age_ms:1,future_skew_ms:0}};
 const beforeEpoch=time=>reviewerOutcomeMatches(envelope([fact,bounded]),{responses:[response({count:2,timestamp:time})]},[],epoch);
 assert.equal(beforeEpoch('1969-12-31T23:59:59.999000000Z'),true);
 assert.equal(beforeEpoch('1969-12-31T23:59:59.998999999Z'),false);
 assert.equal(beforeEpoch('1970-01-01T00:00:00.000000001Z'),false);
});
test('precise freshness retains calendar timezone format and integer-limit rejection',()=>{
 const rule={operator:'timestamp_age',response:selector,path:'/timestamp',value:{maximum_age_ms:300000,future_skew_ms:30000}};
 const clock={...context,execution_started_at:'2026-10-03T20:00:00.123456789Z'};
 const data=time=>({responses:[response({count:2,timestamp:time})]});
 for(const time of ['2026-10-03T20:00:00.1Z','2026-10-03T20:00:00.123456Z','2026-10-03T20:00:00.123456789Z'])assert.equal(reviewerOutcomeMatches(envelope([fact,rule]),data(time),[],clock),true);
 for(const time of ['2026-02-30T20:00:00.123456Z','2026-10-03T24:00:00.123456Z','2026-10-03T20:00:00.123456+24:00','2026-10-03T20:00:00.123456-00:60','2026-10-03T20:00:00.1234567890Z','2026-10-03T20:00:00.Z','2026-10-03T20:00:00.123456'])assert.equal(reviewerOutcomeMatches(envelope([fact,rule]),data(time),[],clock),false);
 assert.equal(reviewerOutcomeMatches(envelope([fact,rule]),data('2026-10-03T20:00:00.123456Z'),[],{...clock,execution_started_at:'2026-02-30T20:00:00.123456Z'}),false);
 for(const value of [{maximum_age_ms:1.5,future_skew_ms:0},{maximum_age_ms:1,future_skew_ms:0.5}])assert.equal(reviewerOutcomeMatches(envelope([fact,{...rule,value}]),data(clock.execution_started_at),[],clock),false);
});
