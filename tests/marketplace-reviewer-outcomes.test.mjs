import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewerOutcomeMatches} from '../scripts/marketplace-reviewer-outcomes.mjs';
test('fixture assertions require actual observed facts for every configured requirement',()=>{
  const rules=[{requirement:'records',operator:'equals',path:'/responses/0/body/count',value:2}];
  const evidence={responses:[{body:{count:2}}]};const requirements=[{id:'records',operator:'equals'}];
  assert.equal(reviewerOutcomeMatches(rules,evidence,requirements),true);
  assert.equal(reviewerOutcomeMatches(rules,{responses:[{body:{count:1}}]},requirements),false);
  assert.equal(reviewerOutcomeMatches(rules,evidence,[...requirements,{id:'provenance',operator:'equals'}]),false);
  assert.equal(reviewerOutcomeMatches([{operator:'contains',path:'/answer',value:'success'}],{answer:'success'},[]),false);
  assert.equal(reviewerOutcomeMatches(undefined,evidence,requirements),false);
});
test('multisource evidence requires distinct source values and configured minimums',()=>{
  const rule={requirement:'multiple-sources',operator:'min_length',path:'/responses/0/body/sources',value:2,distinct_by_path:'/source'};
  const requirements=[{id:'multiple-sources',operator:'min_length',minimum:2}];
  assert.equal(reviewerOutcomeMatches([rule],{responses:[{body:{sources:[{source:'first'},{source:'second'}]}}]},requirements),true);
  assert.equal(reviewerOutcomeMatches([rule],{responses:[{body:{sources:[{source:'first'},{source:'first'}]}}]},requirements),false);
  assert.equal(reviewerOutcomeMatches([{...rule,distinct_by_path:undefined}],{responses:[{body:{sources:[1,2]}}]},requirements),false);
});
