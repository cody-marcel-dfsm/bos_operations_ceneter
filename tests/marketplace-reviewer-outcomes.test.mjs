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
