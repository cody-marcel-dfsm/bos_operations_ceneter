import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const methods=[
  "test_exact_prior_authenticated_once_per_reconstruction",
  "test_synthetic_recursive_edges_have_linear_authentication_count"
];
for(const method of methods) test(method,()=>{
  const result=spawnSync('python3',['-B','tests/oracle_history_reconstruction_test.py',method],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:2*1024*1024});
  assert.equal(result.status,0,result.stderr||String(result.error));
  const observation=JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.equal(observation.tests,1);assert.equal(observation.failures,0);assert.equal(observation.errors,0);assert.equal(observation.skips,0);
});
