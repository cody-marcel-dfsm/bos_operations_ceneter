import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
for (const module of ['tests/deterministic_source_test.py','tests/deterministic_package_test.py']) {
 test('deterministic lane boundaries: '+module,()=>{
  const result=spawnSync('python3',['-B',module],{encoding:'utf8'});
  assert.equal(result.status,0,result.stdout+result.stderr);
  assert.match(result.stderr,/Ran [1-9][0-9]* tests/);
 });
}
